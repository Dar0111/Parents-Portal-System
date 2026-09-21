const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { parentOfStudent, insertNotifications, emitNotifications } = require('../utils/notify');
const { isValidDateFormat } = require('../utils/dateFormat');
const gc = require('../utils/gradeComputation');
const { readListParams, pageMeta } = require('../utils/pagination');

const router = express.Router();

function isValidScore(value) {
  return typeof value === 'number' && value >= 0;
}

// score > max (bonus points) is deliberately allowed — see gradeComputation.js's
// own comment. max <= 0 is rejected here regardless: a test worth zero or
// fewer points isn't a real assessment, even though componentPercentage/
// subTestPercentage would tolerate it defensively (returning null rather
// than dividing by zero) if this check were somehow bypassed.
function isValidMax(value) {
  return typeof value === 'number' && value > 0;
}

function isValidTerm(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 3;
}

// Duplicated from routes/settings.js's validateAcademicYear rather than
// shared — this is only the second place this exact check exists.
// Extract into a shared util if a third place ever needs it, matching
// utils/dateFormat.js's own precedent (extracted only after 3 copies).
function isValidSchoolYear(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const match = value.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return false;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  return second === first + 1;
}

// Grade encoding is the SUBJECT TEACHER's authority via teacher_assignments
// (teacher_id + subject_id + grade_level + section all four must match) —
// not sections.adviser_id, which governs attendance and excuse-letter
// review only. Uses the VARCHAR grade_level/section columns, not
// section_id — see CLAUDE.md's "sections table" note: section_id is
// reserved for exactly two routes (attendance, the unbuilt Class Board),
// neither of which is Grades.
async function teacherCanEncodeGrade(teacherId, subjectId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND subject_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, subjectId, gradeLevel, section]
  );
  return rows.length > 0;
}

// Wide VIEW scope for grades — any teacher_assignments row matching
// grade_level+section, regardless of subject. Matches the EXISTS pattern
// students.js/content.js/excuse_letters.js already use for "is this
// teacher associated with this student's class at all" — deliberately
// broader than teacherCanEncodeGrade's subject-specific check above.
// Grades' subject-specific WRITE scope was always the exception in this
// codebase, not the norm; this read-side check restores the norm. See
// loadAuthorizedGrade's own comment below for the full G3 resolution.
async function teacherCanViewGrade(teacherId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, gradeLevel, section]
  );
  return rows.length > 0;
}

// Loads an existing grade row by id and resolves BOTH scope tiers a
// requester can have. THE G3 RESOLUTION of a provisional decision made in
// G2b: out-of-scope used to be a flat 404 everywhere, justified only
// because no GET existed yet to contradict it (see the CHANGELOG for that
// stage). Stage G3 added GET endpoints scoped to the WIDE view-scope
// below — broader than the NARROW encode-scope teacherCanEncodeGrade
// checks — so the two tiers can now genuinely disagree: a teacher can see
// a row via GET that they cannot act on via a write. That's the exact
// precondition that made Excuse Letters' PATCH /:id/review choose 403
// over 404, and it now applies here too.
//
// 404 here means "cannot see this at all" — nonexistent id, or outside
// the WIDE view-scope entirely (a true "cannot see this" signal, matching
// PUT /api/attendance/:id). A caller who fails only the NARROW
// encode-scope check gets back { grade, canEncode: false } instead of an
// error — every :id-keyed WRITE endpoint below must check that itself
// (via encodeScopeError()) and answer 403 naming the subject, since a GET
// already showed them the row and a 404 there would make the two
// endpoints contradict each other on one resource. GET endpoints never
// look at canEncode at all — view-scope alone is sufficient to read.
async function loadAuthorizedGrade(req, gradeId) {
  const [rows] = await pool.query(
    `SELECT g.*, s.grade_level AS student_grade_level, s.section AS student_section,
            sub.name AS subject_name
     FROM grades g
     JOIN students s ON s.id = g.student_id
     JOIN subjects sub ON sub.id = g.subject_id
     WHERE g.id = ?
     LIMIT 1`,
    [gradeId]
  );
  const grade = rows[0];
  if (!grade) {
    return { errorStatus: 404, errorMessage: 'Grade record not found.' };
  }

  if (req.user.role === 'admin') {
    return { grade, canEncode: true };
  }

  const canView = await teacherCanViewGrade(req.user.id, grade.student_grade_level, grade.student_section);
  if (!canView) {
    return { errorStatus: 404, errorMessage: 'Grade record not found.' };
  }

  const canEncode = await teacherCanEncodeGrade(
    req.user.id,
    grade.subject_id,
    grade.student_grade_level,
    grade.student_section
  );

  return { grade, canEncode };
}

// Applied by every :id-keyed WRITE endpoint immediately after
// loadAuthorizedGrade — admin always passes (loadAuthorizedGrade already
// gives admin canEncode: true unconditionally). A teacher inside
// view-scope but outside the narrow encode-scope gets 403 naming the
// subject, never 404 — see loadAuthorizedGrade's own comment for why. GET
// endpoints never call this; view-scope alone is sufficient to read.
function encodeScopeError(loaded) {
  if (loaded.canEncode) {
    return null;
  }
  return {
    errorStatus: 403,
    errorMessage: `You are not assigned to teach ${loaded.grade.subject_name} for this student's grade level and section.`,
  };
}

// Shared preconditions for every write endpoint below, checked in the
// confirmed order: mode, then lock, then (numerical only) weight-config
// presence — all BEFORE any write is attempted, so a rejection here costs
// the caller nothing (nothing was ever accepted, so there is nothing to
// lose on retry). expectedMode is 'numerical' (components, exam) or
// 'descriptive' (the descriptive endpoint) — a single shared function
// rather than two near-identical copies, specifically so scope/mode/lock
// logic can't drift between them: a future fix applied to only one copy
// would diverge silently, since both would still pass their own tests.
// Returns null when every precondition passes.
async function preflightGradeWrite(grade, expectedMode) {
  const [modeRows] = await pool.query(
    'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
    [grade.student_grade_level, grade.school_year]
  );
  const modeConfig = modeRows[0];
  if (!modeConfig) {
    return {
      errorStatus: 409,
      errorMessage: `No grading_mode_configs row exists for Grade ${grade.student_grade_level}, school year ${grade.school_year}. An admin must configure the grading mode before this can be recorded.`,
    };
  }
  if (modeConfig.mode !== expectedMode) {
    const errorMessage =
      expectedMode === 'numerical'
        ? 'This grade uses descriptive grading — record a letter via PATCH /:id/descriptive instead of component or exam scores.'
        : 'This grade uses numerical grading — record WW/PT/exam scores instead of a descriptive letter.';
    return { errorStatus: 400, errorMessage };
  }

  if (grade.is_locked) {
    return { errorStatus: 403, errorMessage: 'This grade is locked and can no longer be edited.' };
  }

  if (expectedMode === 'numerical') {
    const [weightRows] = await pool.query(
      'SELECT 1 FROM grade_weight_configs WHERE subject_id = ? AND school_year = ? LIMIT 1',
      [grade.subject_id, grade.school_year]
    );
    if (!weightRows.length) {
      // Deliberately not "save the score anyway" — a grade row holding a
      // real raw score with blank computed columns and no explanation
      // reads to a teacher as "the system is broken," not "an admin needs
      // to configure something." Rejecting up front, before any write,
      // says exactly what is wrong and who fixes it.
      return {
        errorStatus: 409,
        errorMessage: `No grade_weight_configs row exists for this subject and school year (${grade.school_year}). An admin must configure WW/PT/EX weights before this grade can be computed.`,
      };
    }
  }

  return null;
}

// The only DB-touching piece of the computation chain — deliberately kept
// out of utils/gradeComputation.js, which is pure by design (no DB, no
// HTTP, no side effects; see that file's own header comment). This
// function is the glue: it fetches what the pure functions need (all
// grade_components rows split by type, the weight row, the grade's own
// raw exam columns) and calls into gradeComputation.js for every actual
// calculation. Always full recompute from source — every WW/PT component
// ever recorded for this grade_id is re-summed on every call, never an
// incremental running total — so an edit or delete (G2e) recomputes
// correctly with no special-casing. Runs on the SAME transaction
// connection as the write that triggered it (see the two route handlers
// below), so a failure here rolls back that write too.
// THE GRADE-AVAILABLE HOOK LIVES HERE, not at the four call sites, because
// this is the only place that can see the transition: it holds the row as it
// was (loaded on the next line) and the value about to replace it, inside the
// caller's transaction.
//
// THE TRIGGER IS term_grade GOING FROM NULL TO NON-NULL -- the moment the
// parent first has something to look at. Not "a component was recorded"
// (that fires while the card still reads "-- Pending", convention 3), and not
// "the row was locked" (admin-driven, may never happen, and locking is a
// finalization boundary rather than a publication event).
//
// ONCE PER SUBJECT + TERM COSTS NO CODE: uq_notifications_once is
// (user_id, type, item_id) and a grades row already IS one
// (student, subject, term, school_year), so INSERT IGNORE does it. A later
// correction that clears the grade back to NULL and recomputes will not
// re-notify, which is correct -- the parent was already told it is there.
//
// `pending` collects recipient ids for the CALLER to emit AFTER conn.commit().
// The insert belongs inside the transaction (a notification for a grade that
// rolled back would be a lie); the socket event must not be, for the same
// reason.
async function recomputeGrade(conn, gradeId, pending = null, actorId = null) {
  const [gradeRows] = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
  const grade = gradeRows[0];

  const [weightRows] = await conn.query(
    'SELECT ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE subject_id = ? AND school_year = ? LIMIT 1',
    [grade.subject_id, grade.school_year]
  );
  // Presence already guaranteed by preflightGradeWrite() before this
  // transaction began — not re-checked here, since re-checking inside
  // the transaction would just be trusting the same query twice.
  const weights = weightRows[0];

  const [wwRows] = await conn.query("SELECT score, max_score FROM grade_components WHERE grade_id = ? AND type = 'WW'", [
    gradeId,
  ]);
  const [ptRows] = await conn.query("SELECT score, max_score FROM grade_components WHERE grade_id = ? AND type = 'PT'", [
    gradeId,
  ]);

  const wwPercentage = gc.componentPercentage(wwRows);
  const ptPercentage = gc.componentPercentage(ptRows);
  const st1Percentage = gc.subTestPercentage(grade.ex_st1, grade.ex_st1_max);
  const st2Percentage = gc.subTestPercentage(grade.ex_st2, grade.ex_st2_max);
  const tePercentage = gc.subTestPercentage(grade.ex_te, grade.ex_te_max);
  const exPercentage = gc.exPercentage(st1Percentage, st2Percentage, tePercentage);

  const wwWeighted = gc.weighted(wwPercentage, weights.ww_weight);
  const ptWeighted = gc.weighted(ptPercentage, weights.pt_weight);
  const exWeighted = gc.weighted(exPercentage, weights.ex_weight);
  const ig = gc.initialGrade(wwWeighted, ptWeighted, exWeighted);

  let termGrade = null;
  if (ig !== null) {
    const [transmutedRows] = await conn.query(
      'SELECT transmuted_grade FROM transmutation_table WHERE school_year = ? AND ig_min <= ? AND ig_max >= ? LIMIT 1',
      [grade.school_year, ig, ig]
    );
    // No seeded row for this school_year -> zero-based grading -> TG = IG
    // directly. This is the mechanism by which the transmutation table
    // "disappears without a code change" once a future school year has
    // no rows: absence of data drives the behavior, not a hardcoded
    // year comparison — see the table's own comment in schema.sql.
    termGrade = transmutedRows[0] ? transmutedRows[0].transmuted_grade : ig;
  }

  await conn.query(
    `UPDATE grades SET
       ww_percentage = ?, ww_weighted = ?,
       pt_percentage = ?, pt_weighted = ?,
       ex_percentage = ?, ex_weighted = ?,
       initial_grade = ?, term_grade = ?
     WHERE id = ?`,
    [wwPercentage, wwWeighted, ptPercentage, ptWeighted, exPercentage, exWeighted, ig, termGrade, gradeId]
  );

  if (pending && grade.term_grade === null && termGrade !== null) {
    const audience = await parentOfStudent(conn, grade.student_id);
    const notified = await insertNotifications(conn, {
      type: 'grade_available',
      itemType: 'grade',
      itemId: gradeId,
      actorId,
      titleSnapshot: null,
      userIds: audience,
    });
    pending.push(...notified);
  }

  const [updatedRows] = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
  return updatedRows[0];
}

// mysql2 returns DECIMAL columns as strings (e.g. "90.00") — see the
// identical gotcha noted in test-grades-flows.js. Converted to a real
// Number the moment a grade row is read for report-card assembly, so
// every downstream average/comparison is arithmetic, never string
// concatenation.
function numOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

// One term's entry in the report-card response (Q3/Q7). Mirrors the
// grades table's own dual-mode design — term_grade and descriptive_grade
// are both always present, whichever one is non-null tells you the
// mode — rather than inventing a different shape per mode. `descriptor`
// is Table 11's qualitative band for a numerical term_grade, or Table 8's
// letter meaning for a descriptive_grade — GRADING_SPEC §6b: "the parent
// dashboard should show the numeric grade AND the descriptor." Returns
// null for a term with no grade row at all — genuinely absent, not
// merely incomplete; see the subject-level comment below for why that
// distinction matters here.
function buildTermEntry(gradeRow, mode) {
  if (!gradeRow) {
    return null;
  }
  const termGrade = numOrNull(gradeRow.term_grade);
  const descriptor =
    mode === 'numerical' ? gc.qualitativeDescriptor(termGrade) : gc.descriptiveGradeMeaning(gradeRow.descriptive_grade);
  return {
    grade_id: gradeRow.id,
    term_grade: termGrade,
    descriptive_grade: gradeRow.descriptive_grade,
    descriptor,
    is_locked: !!gradeRow.is_locked,
  };
}

// Final Grade = average of the three term grades — NULL until all three
// exist, the SAME rule as Initial Grade (utils/gradeComputation.js's own
// header comment), deliberately NOT a running average. A partial FG
// carries real weight beyond a merely confusing UI: it determines
// promotion and is what prints on the SF9, so a parent who sees a number
// in October would reasonably treat it as settled — by the time the real
// figure lands in March, showing the earlier partial number was already
// a mistake no caveat text can undo. One rule at all three levels of the
// computation chain (component -> IG, term -> FG, subject -> GA) is also
// simply more defensible than three separate variations. Not applicable
// at all for a descriptive-mode subject — see the subject-builder below.
function computeFinalGrade(terms, mode) {
  if (mode !== 'numerical') {
    return { final_grade: null, final_grade_descriptor: null };
  }
  const termGrades = [terms[1]?.term_grade, terms[2]?.term_grade, terms[3]?.term_grade];
  if (termGrades.some((value) => value === null || value === undefined)) {
    return { final_grade: null, final_grade_descriptor: null };
  }
  // A WHOLE NUMBER, not two decimals (2026-09-22). The school's own records
  // print a Final Grade as an integer, the way a Term Grade already is — the
  // transmutation table returns an INT, so the three inputs are whole and
  // only this average was carrying decimals. It shipped as roundTo2 and the
  // report card read 89.33 for Marwin's Mathematics: (87+91+90)/3 = 89.333…,
  // which is 89.
  //
  // The descriptor is computed from the ROUNDED value, deliberately, so the
  // band always matches the number printed beside it. That can move a band —
  // 89.5 rounds to 90 and becomes Advancing rather than Benchmarking — and
  // matching the printed number is the behaviour the school's card implies.
  const fg = gc.roundToWhole((termGrades[0] + termGrades[1] + termGrades[2]) / 3);
  return { final_grade: fg, final_grade_descriptor: gc.qualitativeDescriptor(fg) };
}

// General Average = average of Final Grades across every subject at this
// grade level — the same NULL-until-complete rule one level higher, per
// the same reasoning as computeFinalGrade above.
//
// TWO DECIMALS, over the ROUNDED subject grades, and both halves of that
// matter. The school's summary sheet computes 721 / 8 = 90.125 and prints
// 90.13, so the average of eight whole Final Grades is itself not whole.
// `roundTo2` is therefore correct HERE while `roundToWhole` is correct one
// level down — the two precisions are a real distinction in the school's
// records, not an inconsistency to tidy away. Averaging unrounded finals
// would also disagree with the sheet, because the sheet adds up the numbers
// a parent can see. Not built as a priority
// in G2a; built now because it is the direct extension of a computation
// that already exists at read time, GRADING_SPEC §4 lists it as the last
// step of the same chain, and stopping one step short would be an
// arbitrary place to draw the line. Never computed for a descriptive-mode
// grade level — GA is a numerical concept; KS1 uses Character Traits
// Awards instead (GRADING_SPEC §7), not a GA-based one.
function computeGeneralAverage(subjectReport, mode) {
  if (mode !== 'numerical' || subjectReport.length === 0) {
    return { general_average: null, general_average_descriptor: null };
  }
  const finalGrades = subjectReport.map((subject) => subject.final_grade);
  if (finalGrades.some((value) => value === null || value === undefined)) {
    return { general_average: null, general_average_descriptor: null };
  }
  const ga = gc.roundTo2(finalGrades.reduce((sum, value) => sum + value, 0) / finalGrades.length);
  return { general_average: ga, general_average_descriptor: gc.qualitativeDescriptor(ga) };
}

// One average per term across every subject at this grade level — the
// general average computed one level EARLIER, before the three terms are
// collapsed into a Final Grade. Added 2026-09-20 (DV3) because the parent
// report card prints a general-average row per term and the client is not
// allowed to compute a grade; without this the row could only ever carry
// the final figure, which is null for most of the school year.
//
// THE SAME NULL-UNTIL-COMPLETE RULE, for the third time: a term's average
// is null unless EVERY subject has that term recorded. A partial figure
// reads as settled, and this one would be read as "the average so far",
// which is exactly the number DepEd does not define.
//
// Deliberately NOT a descriptor. The band words belong to a value the
// school's own report card prints; a per-term class-wide average is ours,
// and attaching Advancing/Developing to it would be a verdict the system
// formed rather than a restatement of a printed number.
//
// Descriptive mode returns three nulls for the same reason GA does — an
// average of letters is not a number, and grading_mode already tells a
// caller which kind of null this is.
//
// NOTE the shape: keys '1','2','3' always present, so a caller can render
// three cells without checking for the key. Distinct from `terms`, where a
// missing entry is null because the subject has no grade ROW at all.
function computeTermAverages(subjectReport, mode) {
  const empty = { 1: null, 2: null, 3: null };
  if (mode !== 'numerical' || subjectReport.length === 0) {
    return empty;
  }

  const averages = {};
  for (const term of [1, 2, 3]) {
    const values = subjectReport.map((subject) => subject.terms[term]?.term_grade ?? null);
    if (values.some((value) => value === null || value === undefined)) {
      averages[term] = null;
      continue;
    }
    averages[term] = gc.roundTo2(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return averages;
}

// GET /api/grades — list, scoped by role, never includes grade_components
// (see GET /:id for that — a list response returning full raw-score
// history on every row would bloat a payload whose purpose is FINDING a
// row, not inspecting one). Filters: student_id, subject_id, term,
// school_year — all optional, no hidden defaults, unlike
// GET /student/:studentId below. Providing all four together
// deterministically resolves to at most one row, matching
// uq_grade_record's own unique key — this is how a teacher finds an
// existing grade_id at all, a gap that has existed since POST / first
// shipped in G2b with no way to look one up afterward.
//
// Role scope is baked into the WHERE clause itself, not filtered in JS
// after the fact: parent is forced to their own child (an explicit
// student_id for a DIFFERENT child is a real, named violation, 403, not
// silently ignored); teacher uses the WIDE view-scope (grade+section, any
// subject — the G3 resolution, see loadAuthorizedGrade's comment above);
// admin is unscoped.
router.get('/', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const { student_id, subject_id, term, school_year } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'parent') {
    if (student_id !== undefined && parseId(student_id) !== req.user.student_id) {
      return res.status(403).json({ success: false, message: 'You may only view grades for your own child.' });
    }
    conditions.push('g.student_id = ?');
    params.push(req.user.student_id);
  } else {
    if (req.user.role === 'teacher') {
      conditions.push(
        'EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section)'
      );
      params.push(req.user.id);
    }
    if (student_id !== undefined) {
      const studentId = parseId(student_id);
      if (studentId === null) {
        return res.status(400).json({ success: false, message: 'student_id must be a positive integer.' });
      }
      conditions.push('g.student_id = ?');
      params.push(studentId);
    }
  }

  if (subject_id !== undefined) {
    const subjectId = parseId(subject_id);
    if (subjectId === null) {
      return res.status(400).json({ success: false, message: 'subject_id must be a positive integer.' });
    }
    conditions.push('g.subject_id = ?');
    params.push(subjectId);
  }

  if (term !== undefined) {
    if (!isValidTerm(term)) {
      return res.status(400).json({ success: false, message: 'term must be 1, 2, or 3.' });
    }
    conditions.push('g.term = ?');
    params.push(Number(term));
  }

  if (school_year !== undefined) {
    if (!isValidSchoolYear(school_year)) {
      return res.status(400).json({
        success: false,
        message: 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).',
      });
    }
    conditions.push('g.school_year = ?');
    params.push(school_year);
  }

  const list = readListParams(req.query, {
    sortable: {
      student: 's.last_name, s.first_name',
      subject: 'sub.name',
      term: 'g.term',
      school_year: 'g.school_year',
      updated_at: 'g.updated_at',
    },
    defaultOrderBy: 'g.school_year DESC, g.term ASC, sub.name ASC',
    tiebreaker: 'g.id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const fromClause = `FROM grades g
       JOIN students s ON s.id = g.student_id
       JOIN subjects sub ON sub.id = g.subject_id
       ${whereClause}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const [rows] = await pool.query(
      `SELECT g.*, s.first_name, s.last_name, s.grade_level AS student_grade_level, s.section AS student_section,
              sub.name AS subject_name
       ${fromClause}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, grades: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List grades error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list grades.' });
  }
});

// GET /api/grades/:id — one grade record WITH its full grade_components
// history (the detail view — see GET / above for why the list omits it).
// Teacher/admin scope reuses loadAuthorizedGrade's wide view-scope check
// directly (canEncode is irrelevant to a read, so it's simply ignored
// here). Parent access is NOT routed through loadAuthorizedGrade — that
// function's non-admin branch is teacher-shaped (teacher_assignments by
// grade+section), and a parent's user id has no meaningful relationship
// to that table; piggybacking would happen to return false for the right
// reason today, for the wrong reason, so a parent's own-child check is
// written directly instead: a plain, explicit comparison against
// req.user.student_id.
router.get('/:id', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  try {
    let grade;

    if (req.user.role === 'parent') {
      const [rows] = await pool.query(
        `SELECT g.*, s.first_name, s.last_name, s.grade_level AS student_grade_level, s.section AS student_section,
                sub.name AS subject_name
         FROM grades g
         JOIN students s ON s.id = g.student_id
         JOIN subjects sub ON sub.id = g.subject_id
         WHERE g.id = ? AND g.student_id = ?
         LIMIT 1`,
        [gradeId, req.user.student_id]
      );
      grade = rows[0];
      if (!grade) {
        return res.status(404).json({ success: false, message: 'Grade record not found.' });
      }
    } else {
      const loaded = await loadAuthorizedGrade(req, gradeId);
      if (loaded.errorStatus) {
        return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
      }
      grade = loaded.grade;
    }

    const [components] = await pool.query(
      'SELECT * FROM grade_components WHERE grade_id = ? ORDER BY date_recorded ASC, id ASC',
      [gradeId]
    );

    // Inferred from which of the two dual-mode columns is populated,
    // rather than a separate grading_mode_configs lookup — the grades
    // table's own design already guarantees at most one is non-null at a
    // time (schema.sql's own comment), so this is a direct read, not a
    // guess. Neither set (an empty shell row) -> null, correctly.
    const numericGrade = numOrNull(grade.term_grade);
    const descriptor =
      numericGrade !== null ? gc.qualitativeDescriptor(numericGrade) : gc.descriptiveGradeMeaning(grade.descriptive_grade);

    return res.json({ success: true, grade, grade_components: components, descriptor });
  } catch (error) {
    console.error('Get grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch grade record.' });
  }
});

// GET /api/grades/student/:studentId — the full report card (Q3): every
// subject at the student's grade level (including one with ZERO grade
// rows at all yet — a missing subject and an unencoded one are different
// things, and this response must be able to tell a caller apart which is
// which), each with per-term data, a computed Final Grade (or null, see
// computeFinalGrade), a top-level General Average (or null, see
// computeGeneralAverage) and, since DV3, one average PER TERM (see
// computeTermAverages). grading_mode appears at both the student level
// and would be identical per-subject (mode is keyed by grade_level+
// school_year, never per-subject, so no student ever mixes modes across
// subjects) — this is how a caller distinguishes "null, still in
// progress" (numerical, incomplete) from "null, does not apply"
// (descriptive — GRADING_SPEC §7, KS1 has no GA-based awards at all).
//
// school_year DEFAULTS to system_settings.academic_year when omitted —
// deliberately different from GET /'s no-default filters above. GET / is
// a flexible search tool; this endpoint is inherently bounded to one
// school year by what it IS (a report card), so nobody should have to
// pass the current year explicitly just to see it. An explicit
// ?school_year= still overrides, e.g. to look back at a prior year.
router.get('/student/:studentId', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  try {
    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (req.user.role === 'parent') {
      if (studentId !== req.user.student_id) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    } else if (req.user.role === 'teacher') {
      const canView = await teacherCanViewGrade(req.user.id, student.grade_level, student.section);
      if (!canView) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    }

    let schoolYear = req.query.school_year;
    if (schoolYear === undefined) {
      const [settingRows] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
      );
      schoolYear = settingRows[0]?.setting_value;
      if (!schoolYear) {
        return res.status(500).json({ success: false, message: 'academic_year is not configured in system settings.' });
      }
    } else if (!isValidSchoolYear(schoolYear)) {
      return res.status(400).json({
        success: false,
        message: 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).',
      });
    }

    const [modeRows] = await pool.query(
      'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
      [student.grade_level, schoolYear]
    );
    const modeConfig = modeRows[0];
    if (!modeConfig) {
      return res.status(409).json({
        success: false,
        message: `No grading_mode_configs row exists for Grade ${student.grade_level}, school year ${schoolYear}. An admin must configure the grading mode before a report card can be generated.`,
      });
    }
    const mode = modeConfig.mode;

    const [subjects] = await pool.query('SELECT id, name FROM subjects WHERE grade_level = ? ORDER BY name ASC', [
      student.grade_level,
    ]);

    const [gradeRows] = await pool.query('SELECT * FROM grades WHERE student_id = ? AND school_year = ?', [
      studentId,
      schoolYear,
    ]);
    const gradesBySubject = {};
    for (const row of gradeRows) {
      if (!gradesBySubject[row.subject_id]) {
        gradesBySubject[row.subject_id] = {};
      }
      gradesBySubject[row.subject_id][row.term] = row;
    }

    const subjectReport = subjects.map((subject) => {
      const byTerm = gradesBySubject[subject.id] || {};
      const terms = {
        1: buildTermEntry(byTerm[1], mode),
        2: buildTermEntry(byTerm[2], mode),
        3: buildTermEntry(byTerm[3], mode),
      };
      const { final_grade, final_grade_descriptor } = computeFinalGrade(terms, mode);
      return {
        subject_id: subject.id,
        subject_name: subject.name,
        terms,
        final_grade,
        final_grade_descriptor,
      };
    });

    const { general_average, general_average_descriptor } = computeGeneralAverage(subjectReport, mode);
    const term_averages = computeTermAverages(subjectReport, mode);

    return res.json({
      success: true,
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        grade_level: student.grade_level,
        section: student.section,
      },
      school_year: schoolYear,
      grading_mode: mode,
      subjects: subjectReport,
      term_averages,
      general_average,
      general_average_descriptor,
    });
  } catch (error) {
    console.error('Get student report card error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch student report card.' });
  }
});

// POST /api/grades — creates a shell row only: every score and computed
// column stays NULL, is_locked 0. No computation happens here at all —
// utils/gradeComputation.js is not imported in this file; that's G2c/G2d.
// grading_mode_configs is deliberately not consulted here either: a
// Grade 1 row and a Grade 5 row are structurally identical at creation,
// since nothing mode-specific is written yet.
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, term, school_year } = req.body;

  const studentId = parseId(student_id);
  if (studentId === null) {
    return res.status(400).json({ success: false, message: 'student_id must be a positive integer.' });
  }

  const subjectId = parseId(subject_id);
  if (subjectId === null) {
    return res.status(400).json({ success: false, message: 'subject_id must be a positive integer.' });
  }

  if (!isValidTerm(term)) {
    return res.status(400).json({ success: false, message: 'term must be 1, 2, or 3.' });
  }
  const termNum = Number(term);

  if (!isValidSchoolYear(school_year)) {
    return res.status(400).json({
      success: false,
      message: 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).',
    });
  }

  try {
    // Checked before touching the student at all — subjects are unscoped
    // reference data, so this leaks nothing role-sensitive either way.
    const [subjectRows] = await pool.query('SELECT * FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
    const subject = subjectRows[0];
    if (!subject) {
      return res.status(400).json({ success: false, message: 'subject_id does not reference an existing subject.' });
    }

    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];

    if (req.user.role === 'admin') {
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    } else {
      // Collapse "student doesn't exist" and "exists but out of scope"
      // into the same 403 — matching POST /api/attendance's identical
      // reasoning: a teacher probing student ids shouldn't be able to
      // tell which. The message names the SUBJECT specifically (the
      // teacher supplied subject_id themselves, so echoing it back
      // leaks nothing) but stays generic about grade/section — a real
      // student's actual grade and section are not this teacher's to
      // learn just by probing.
      const allowed =
        student && (await teacherCanEncodeGrade(req.user.id, subjectId, student.grade_level, student.section));
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to teach ${subject.name} for this student's grade level and section.`,
        });
      }
    }

    // SECURITY-MOTIVATED ORDERING — do not move this check earlier, even
    // though it looks like a cheap, obvious validation to run first. It
    // runs only after the block above has already confirmed (for a
    // teacher) that this teacher is authorized to act on this specific
    // student, or (for admin) that the student exists at all. Checking
    // subject.grade_level against student.grade_level any sooner would
    // let an unauthorized, out-of-scope teacher learn a real student's
    // actual grade level just by probing with a deliberately wrong
    // subject_id and reading the resulting error message — exactly the
    // enumeration the collapsed 403 above exists to prevent. A future
    // session reordering this "for efficiency" would silently reopen it.
    if (subject.grade_level !== student.grade_level) {
      return res.status(400).json({
        success: false,
        message: `This subject is offered at Grade ${subject.grade_level}, but this student is in Grade ${student.grade_level}.`,
      });
    }

    if (student.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot create a grade record for an inactive student.' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ? LIMIT 1',
      [studentId, subjectId, termNum, school_year]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'A grade record already exists for this student, subject, term, and school year.',
      });
    }

    const [result] = await pool.query(
      'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES (?, ?, ?, ?)',
      [studentId, subjectId, termNum, school_year]
    );

    const [rows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'create_grade',
      `Created grade record for student #${studentId}, subject #${subjectId}, term ${termNum}, ${school_year}`
    );

    return res.status(201).json({ success: true, message: 'Grade record created.', grade: rows[0] });
  } catch (error) {
    console.error('Create grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create grade record.' });
  }
});

// POST /api/grades/:id/components — add one WW or PT raw score, then
// recompute. This is the first endpoint in the codebase where creating a
// child resource also triggers a recompute of its parent: grade_components
// rows are an arbitrary-count raw-score history (WW/PT), and every write
// to one changes the parent grades row's derived percentage/weighted/
// initial_grade columns. The response returns BOTH the new component row
// (matching this codebase's create-returns-the-row convention) and the
// freshly recomputed grade row (so a caller can update a live display
// without a second request) — a synthesis of two existing precedents, not
// a copy of one. Do not read the asymmetry with PATCH /:id/exam below
// (which returns only `grade`, since it creates no child resource) as an
// oversight — it's the direct consequence of the two endpoints creating
// a different kind of thing.
router.post('/:id/components', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  const { type, score, max_score, label, date_recorded } = req.body;

  if (type !== 'WW' && type !== 'PT') {
    return res.status(400).json({ success: false, message: "type must be 'WW' or 'PT'." });
  }
  if (!isValidScore(score)) {
    return res.status(400).json({ success: false, message: 'score must be 0 or greater.' });
  }
  if (!isValidMax(max_score)) {
    return res.status(400).json({ success: false, message: 'max_score must be greater than 0.' });
  }
  if (!label || !String(label).trim()) {
    return res.status(400).json({ success: false, message: 'label is required.' });
  }
  if (date_recorded !== undefined && date_recorded !== null && !isValidDateFormat(date_recorded)) {
    return res.status(400).json({ success: false, message: 'date_recorded must be in YYYY-MM-DD format.' });
  }

  let conn;
  try {
    const loaded = await loadAuthorizedGrade(req, gradeId);
    if (loaded.errorStatus) {
      return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
    }
    const scopeError = encodeScopeError(loaded);
    if (scopeError) {
      return res.status(scopeError.errorStatus).json({ success: false, message: scopeError.errorMessage });
    }

    const preflightError = await preflightGradeWrite(loaded.grade, 'numerical');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO grade_components (grade_id, type, score, max_score, label, date_recorded) VALUES (?, ?, ?, ?, ?, ?)',
      [gradeId, type, score, max_score, label, date_recorded || null]
    );

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    const [componentRows] = await pool.query('SELECT * FROM grade_components WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'record_grade_component',
      `Added ${type} score ${score}/${max_score} to grade #${gradeId}`
    );

    return res.status(201).json({
      success: true,
      message: 'Component recorded.',
      component: componentRows[0],
      grade: updatedGrade,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Add grade component error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record component.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/grades/:id/components/:componentId — correct an existing WW/PT
// entry, then recompute. Nested under the parent grade id (not a flat
// /components/:componentId) for consistency with the sibling endpoints
// above and below, and because it gets a real integrity check for free:
// componentId is matched together with grade_id in one query, so a
// componentId that belongs to a DIFFERENT grade is indistinguishable from
// one that doesn't exist at all — 404 either way, the same collapsing
// loadAuthorizedGrade already does for the parent id.
// type is deliberately NOT editable here — see the check below.
router.put('/:id/components/:componentId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }
  const componentId = parseId(req.params.componentId);
  if (componentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid component id.' });
  }

  const { type, score, max_score, label, date_recorded } = req.body;

  const touchesAny =
    type !== undefined || score !== undefined || max_score !== undefined || label !== undefined || date_recorded !== undefined;
  if (!touchesAny) {
    return res.status(400).json({ success: false, message: 'At least one field must be provided.' });
  }

  if (type !== undefined && type !== 'WW' && type !== 'PT') {
    return res.status(400).json({ success: false, message: "type must be 'WW' or 'PT'." });
  }
  if (score !== undefined && !isValidScore(score)) {
    return res.status(400).json({ success: false, message: 'score must be 0 or greater.' });
  }
  if (max_score !== undefined && !isValidMax(max_score)) {
    return res.status(400).json({ success: false, message: 'max_score must be greater than 0.' });
  }
  if (label !== undefined && (!label || !String(label).trim())) {
    return res.status(400).json({ success: false, message: 'label must not be empty.' });
  }
  if (date_recorded !== undefined && date_recorded !== null && !isValidDateFormat(date_recorded)) {
    return res.status(400).json({ success: false, message: 'date_recorded must be in YYYY-MM-DD format.' });
  }

  let conn;
  try {
    const loaded = await loadAuthorizedGrade(req, gradeId);
    if (loaded.errorStatus) {
      return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
    }
    const scopeError = encodeScopeError(loaded);
    if (scopeError) {
      return res.status(scopeError.errorStatus).json({ success: false, message: scopeError.errorMessage });
    }

    const preflightError = await preflightGradeWrite(loaded.grade, 'numerical');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    const [componentRows] = await pool.query('SELECT * FROM grade_components WHERE id = ? AND grade_id = ? LIMIT 1', [
      componentId,
      gradeId,
    ]);
    const existing = componentRows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Component not found.' });
    }

    // Changing WW to PT (or back) moves the score between two separately
    // -weighted averages — a re-categorization, not a correction. Reject
    // rather than silently ignore, since a caller sending a different
    // type almost certainly expects it to take effect.
    if (type !== undefined && type !== existing.type) {
      return res.status(400).json({
        success: false,
        message: 'type cannot be changed — delete this component and add a new one with the correct type instead.',
      });
    }

    const nextScore = score !== undefined ? score : existing.score;
    const nextMax = max_score !== undefined ? max_score : existing.max_score;
    const nextLabel = label !== undefined ? label : existing.label;
    const nextDateRecorded = date_recorded !== undefined ? date_recorded || null : existing.date_recorded;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('UPDATE grade_components SET score = ?, max_score = ?, label = ?, date_recorded = ? WHERE id = ?', [
      nextScore,
      nextMax,
      nextLabel,
      nextDateRecorded,
      componentId,
    ]);

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    const [updatedComponentRows] = await pool.query('SELECT * FROM grade_components WHERE id = ? LIMIT 1', [componentId]);
    await logActivity(req.user.id, 'update_grade_component', `Updated component #${componentId} on grade #${gradeId}`);

    return res.json({
      success: true,
      message: 'Component updated.',
      component: updatedComponentRows[0],
      grade: updatedGrade,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Update grade component error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update component.' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/grades/:id/components/:componentId — remove a WW/PT entry
// entirely, then recompute. Deleting the last component of a type is not
// special-cased: componentPercentage([]) already returns null (see
// gradeComputation.js), so ww_percentage/pt_percentage — and, if that was
// the last of the three required inputs, initial_grade and term_grade —
// revert to NULL automatically on the recompute below, the same as if
// nothing had ever been entered.
router.delete('/:id/components/:componentId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }
  const componentId = parseId(req.params.componentId);
  if (componentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid component id.' });
  }

  let conn;
  try {
    const loaded = await loadAuthorizedGrade(req, gradeId);
    if (loaded.errorStatus) {
      return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
    }
    const scopeError = encodeScopeError(loaded);
    if (scopeError) {
      return res.status(scopeError.errorStatus).json({ success: false, message: scopeError.errorMessage });
    }

    const preflightError = await preflightGradeWrite(loaded.grade, 'numerical');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    const [componentRows] = await pool.query('SELECT id, type FROM grade_components WHERE id = ? AND grade_id = ? LIMIT 1', [
      componentId,
      gradeId,
    ]);
    const existing = componentRows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Component not found.' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('DELETE FROM grade_components WHERE id = ?', [componentId]);

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    await logActivity(
      req.user.id,
      'delete_grade_component',
      `Deleted ${existing.type} component #${componentId} from grade #${gradeId}`
    );

    return res.json({ success: true, message: 'Component deleted.', grade: updatedGrade });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Delete grade component error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete component.' });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /api/grades/:id/exam — set any subset of ST1/ST2/TE, then
// recompute. Returns only the recomputed `grade` row — unlike
// POST /:id/components above, this creates no child resource, it only
// sets columns directly on the grades row itself; see that handler's
// comment for why the two response shapes deliberately differ.
router.patch('/:id/exam', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  const { st1_score, st1_max, st2_score, st2_max, te_score, te_max } = req.body;

  const touchesAny =
    st1_score !== undefined ||
    st1_max !== undefined ||
    st2_score !== undefined ||
    st2_max !== undefined ||
    te_score !== undefined ||
    te_max !== undefined;
  if (!touchesAny) {
    return res.status(400).json({ success: false, message: 'At least one of st1, st2, or te fields must be provided.' });
  }

  if (st1_score !== undefined && st1_score !== null && !isValidScore(st1_score)) {
    return res.status(400).json({ success: false, message: 'st1_score must be 0 or greater.' });
  }
  if (st1_max !== undefined && st1_max !== null && !isValidMax(st1_max)) {
    return res.status(400).json({ success: false, message: 'st1_max must be greater than 0.' });
  }
  if (st2_score !== undefined && st2_score !== null && !isValidScore(st2_score)) {
    return res.status(400).json({ success: false, message: 'st2_score must be 0 or greater.' });
  }
  if (st2_max !== undefined && st2_max !== null && !isValidMax(st2_max)) {
    return res.status(400).json({ success: false, message: 'st2_max must be greater than 0.' });
  }
  if (te_score !== undefined && te_score !== null && !isValidScore(te_score)) {
    return res.status(400).json({ success: false, message: 'te_score must be 0 or greater.' });
  }
  if (te_max !== undefined && te_max !== null && !isValidMax(te_max)) {
    return res.status(400).json({ success: false, message: 'te_max must be greater than 0.' });
  }

  // score and max are always a pair for a given sub-test. An explicit
  // null on EITHER field clears both, regardless of what the other field
  // does (sent or omitted) — but if one is explicitly null and the other
  // is explicitly a real number IN THE SAME REQUEST, that's a genuine
  // contradiction, not a clear-both: reject it rather than guessing which
  // side the caller actually meant.
  function resolveSubTest(sentScore, sentMax, existingScore, existingMax) {
    const scoreProvided = sentScore !== undefined;
    const maxProvided = sentMax !== undefined;

    if (scoreProvided && maxProvided && (sentScore === null) !== (sentMax === null)) {
      return { conflict: true };
    }
    if ((scoreProvided && sentScore === null) || (maxProvided && sentMax === null)) {
      return { nextScore: null, nextMax: null };
    }
    return {
      nextScore: scoreProvided ? sentScore : existingScore,
      nextMax: maxProvided ? sentMax : existingMax,
    };
  }

  function pairIsValid(nextScore, nextMax) {
    return (nextScore === null) === (nextMax === null);
  }

  let conn;
  try {
    const loaded = await loadAuthorizedGrade(req, gradeId);
    if (loaded.errorStatus) {
      return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
    }
    const scopeError = encodeScopeError(loaded);
    if (scopeError) {
      return res.status(scopeError.errorStatus).json({ success: false, message: scopeError.errorMessage });
    }
    const { grade } = loaded;

    const preflightError = await preflightGradeWrite(grade, 'numerical');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    const st1Result = resolveSubTest(st1_score, st1_max, grade.ex_st1, grade.ex_st1_max);
    if (st1Result.conflict) {
      return res.status(400).json({
        success: false,
        message: 'st1_score and st1_max must be set together, or cleared together.',
      });
    }
    if (!pairIsValid(st1Result.nextScore, st1Result.nextMax)) {
      return res.status(400).json({
        success: false,
        message: 'st1_score and st1_max must be set together, or cleared together.',
      });
    }

    const st2Result = resolveSubTest(st2_score, st2_max, grade.ex_st2, grade.ex_st2_max);
    if (st2Result.conflict) {
      return res.status(400).json({
        success: false,
        message: 'st2_score and st2_max must be set together, or cleared together.',
      });
    }
    if (!pairIsValid(st2Result.nextScore, st2Result.nextMax)) {
      return res.status(400).json({
        success: false,
        message: 'st2_score and st2_max must be set together, or cleared together.',
      });
    }

    const teResult = resolveSubTest(te_score, te_max, grade.ex_te, grade.ex_te_max);
    if (teResult.conflict) {
      return res.status(400).json({
        success: false,
        message: 'te_score and te_max must be set together, or cleared together.',
      });
    }
    if (!pairIsValid(teResult.nextScore, teResult.nextMax)) {
      return res.status(400).json({
        success: false,
        message: 'te_score and te_max must be set together, or cleared together.',
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      'UPDATE grades SET ex_st1 = ?, ex_st1_max = ?, ex_st2 = ?, ex_st2_max = ?, ex_te = ?, ex_te_max = ? WHERE id = ?',
      [
        st1Result.nextScore,
        st1Result.nextMax,
        st2Result.nextScore,
        st2Result.nextMax,
        teResult.nextScore,
        teResult.nextMax,
        gradeId,
      ]
    );

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    await logActivity(req.user.id, 'record_grade_exam', `Updated exam sub-scores for grade #${gradeId}`);

    return res.json({ success: true, message: 'Exam scores updated.', grade: updatedGrade });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Update grade exam error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update exam scores.' });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /api/grades/:id/descriptive — Grade 1 (and any grade level whose
// grading_mode_configs entry is 'descriptive'). The teacher picks a
// letter directly; nothing is computed. THIS IS A SCHOOL-VISIT ASSUMPTION,
// NOT A CONFIRMED ANSWER: DO 015 s.2026 defines no Initial-Grade-to-letter
// mapping at all, and descriptive grading exists specifically to avoid
// numerical labeling in Key Stage 1 — that reasoning, not a school
// confirmation, is why this is a manual judgment call rather than a
// computed one. If the school later says a computation does feed the
// letter, this endpoint changes; the schema (a single nullable
// descriptive_grade column) does not need to.
//
// No transaction: a single UPDATE touching one column, with no follow-up
// computation to make atomic with it — unlike POST /:id/components and
// PATCH /:id/exam, nothing here derives from this write. Reuses the same
// preflightGradeWrite() as those two endpoints (scope -> mode -> lock),
// just with expectedMode = 'descriptive' and no weight-config check,
// which does not apply to a letter grade — the is_locked gate comes along
// for free by sharing that function, the same way it does for the other
// two, even though nothing can set is_locked until Stage G2e.
router.patch('/:id/descriptive', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  const { descriptive_grade } = req.body;
  const VALID_LETTERS = ['A', 'B', 'C', 'D', 'E'];

  if (descriptive_grade !== null && !VALID_LETTERS.includes(descriptive_grade)) {
    return res.status(400).json({
      success: false,
      message: 'descriptive_grade must be one of A, B, C, D, E (uppercase), or null to clear.',
    });
  }

  try {
    const loaded = await loadAuthorizedGrade(req, gradeId);
    if (loaded.errorStatus) {
      return res.status(loaded.errorStatus).json({ success: false, message: loaded.errorMessage });
    }
    const scopeError = encodeScopeError(loaded);
    if (scopeError) {
      return res.status(scopeError.errorStatus).json({ success: false, message: scopeError.errorMessage });
    }

    const preflightError = await preflightGradeWrite(loaded.grade, 'descriptive');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    // Captured BEFORE the write: this is the same NULL -> non-NULL test
    // recomputeGrade makes for term_grade, on the column Grade 1 actually
    // uses. A descriptive row never sets term_grade, so without this hook the
    // one descriptive parent in the seed would never be notified of a grade.
    const descriptiveWasNull = loaded.grade.descriptive_grade === null;

    await pool.query('UPDATE grades SET descriptive_grade = ? WHERE id = ?', [descriptive_grade, gradeId]);

    const [updatedRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
    await logActivity(
      req.user.id,
      'record_descriptive_grade',
      `Set descriptive_grade to ${descriptive_grade === null ? 'NULL (cleared)' : descriptive_grade} for grade #${gradeId}`
    );

    // Best effort, after the write, like logActivity above it.
    if (descriptiveWasNull && descriptive_grade !== null) {
      try {
        const audience = await parentOfStudent(pool, updatedRows[0].student_id);
        const notified = await insertNotifications(pool, {
          type: 'grade_available',
          itemType: 'grade',
          itemId: gradeId,
          actorId: req.user.id,
          titleSnapshot: null,
          userIds: audience,
        });
        emitNotifications(req, notified);
      } catch (notifyError) {
        console.error('Descriptive grade notification fan-out failed:', notifyError);
      }
    }

    return res.json({ success: true, message: 'Descriptive grade recorded.', grade: updatedRows[0] });
  } catch (error) {
    console.error('Update descriptive grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update descriptive grade.' });
  }
});

// PATCH /api/grades/:id/lock — admin only, unscoped. Toggles is_locked,
// which every write endpoint above already checks (via
// preflightGradeWrite) but which nothing could set until now.
router.patch('/:id/lock', authenticate, authorize('admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  const { is_locked } = req.body;
  if (typeof is_locked !== 'boolean') {
    return res.status(400).json({ success: false, message: 'is_locked must be true or false.' });
  }

  try {
    const [gradeRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
    const grade = gradeRows[0];
    if (!grade) {
      return res.status(404).json({ success: false, message: 'Grade record not found.' });
    }

    // Admin-only, unscoped by design — locking is a school-wide
    // finalization boundary (the End-of-Term Block, DO 009 s.2026), not
    // an individual teacher's discretion. Whether a teacher should be
    // able to lock their OWN encoding is a genuine open school question,
    // not decided here — see CLAUDE.md's Grades module note. Do not
    // widen authorize() below without that answer.
    //
    // Deliberately NOT gated on completeness (e.g. "initial_grade IS NOT
    // NULL"). That check would make every Grade 1 (descriptive-mode) row
    // PERMANENTLY unlockable, since a descriptive row never populates
    // initial_grade at all by design (see grades' own dual-mode table
    // comment in schema.sql) — a bug that would only surface weeks
    // later, on one grade level, the first time someone tried to lock a
    // perfectly complete Grade 1 row. Whether an incomplete NUMERICAL
    // grade should be lockable is an administrative-process question the
    // school has not answered; the system does not second-guess it here.
    // A mistaken lock is always reversible via this same endpoint.
    //
    // Unlock is NOT harder than lock — no step-up auth, no required
    // reason, same admin-only PATCH in both directions. Restore's
    // step-up auth exists because a restore is irreversible; an unlock
    // is reversible by re-locking, so matching that friction here would
    // be theatre, not safety. The admin-only gate plus full old/new
    // logActivity on every CHANGE (below) is the real safety rail.
    //
    // Locking an already-locked grade (or unlocking an unlocked one) is 200
    // with no log: the requested state holds, but nothing changed, and the
    // log used to read "from 1 to 1". The guarded UPDATE decides that in one
    // statement, so two admins acting at once cannot both log a change.
    const next = is_locked ? 1 : 0;
    const [result] = await pool.query('UPDATE grades SET is_locked = ? WHERE id = ? AND is_locked <> ?', [
      next,
      gradeId,
      next,
    ]);

    const [updatedRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);

    if (result.affectedRows === 0) {
      return res.json({
        success: true,
        message: `Grade is already ${is_locked ? 'locked' : 'unlocked'}. Nothing was changed.`,
        grade: updatedRows[0],
      });
    }

    await logActivity(
      req.user.id,
      'update_grade_lock',
      `Set is_locked for grade #${gradeId} from ${grade.is_locked} to ${next}`
    );

    return res.json({ success: true, message: 'Grade lock updated.', grade: updatedRows[0] });
  } catch (error) {
    console.error('Update grade lock error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update grade lock.' });
  }
});

// DELETE /api/grades/:id — admin only, unscoped. Same authority as
// PATCH /:id/lock: a school-wide correction (wrong student, wrong term),
// not a teacher undoing their own encoding. loadAuthorizedGrade is the
// teacher-scoped loader and is the wrong tool here — a missing row is
// 404 for admin the same way lock is.
//
// Locked rows are 403, not 404 and not the write-path "can no longer be
// edited" wording. Unlock first, then delete — the lock is what makes
// a finalised grade immutable; an unrestricted delete would undercut it.
// grade_components cascade via fk_grade_components_grade; no extra DELETE.
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const gradeId = parseId(req.params.id);
  if (gradeId === null) {
    return res.status(400).json({ success: false, message: 'Invalid grade id.' });
  }

  try {
    const [gradeRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
    const grade = gradeRows[0];
    if (!grade) {
      return res.status(404).json({ success: false, message: 'Grade record not found.' });
    }

    if (grade.is_locked) {
      return res.status(403).json({
        success: false,
        message: 'This grade is locked and cannot be deleted.',
      });
    }

    await pool.query('DELETE FROM grades WHERE id = ?', [gradeId]);
    await logActivity(req.user.id, 'delete_grade', `Deleted grade #${gradeId}`);

    return res.json({ success: true, message: 'Grade record deleted.' });
  } catch (error) {
    console.error('Delete grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete grade.' });
  }
});

module.exports = router;
