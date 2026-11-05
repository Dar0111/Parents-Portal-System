const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const {
  parentOfStudent,
  excuseAdviserAudience,
  insertNotifications,
  removeItemNotifications,
  removeTypedNotifications,
  emitNotifications,
} = require('../utils/notify');
const { isValidDateFormat } = require('../utils/dateFormat');
const {
  isWholeNumber,
  wholeNumberMessage,
  slotDisplayLabel,
  normalizeSlotName,
} = require('../utils/validateScore');
const gc = require('../utils/gradeComputation');
const { readListParams, pageMeta } = require('../utils/pagination');
const { TEACHER_ADVISES_CLASS_SQL } = require('../utils/teacherScope');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

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

// A slot belongs to ONE class — subject + grade level + section + term +
// school year. A component may only reference a slot from its own grade's
// class, and this is the check that enforces it (CR1, 2026-09-22).
//
// WITHOUT IT the FK alone would happily accept any slot id in the table, so
// a teacher who legitimately encodes for Grade 6 - Malikhain could attach a
// score to Grade 5 - Masigasig's "Written Work 1" — passing every scope
// check on the way, because the scope check looks at the GRADE, not the
// slot. The row would then be rewritten by the other class's next HPS
// change. Scope answers "may you write here"; this answers "does this
// column belong to the thing you are writing to", and they are different
// questions.
//
// Returns the slot row, or an { errorStatus, errorMessage } shaped like
// every other guard in this file.
// `expectedType` is the WW/PT the caller is about to write. A WW score in a
// PT slot would compute under the wrong weight, so it is refused here
// rather than left to be noticed on the report card.
async function loadSlotForGrade(slotId, grade, expectedType) {
  const { rows } = await pool.query('SELECT * FROM assessment_slots WHERE id = ? LIMIT 1', [slotId]);
  const slot = rows[0];
  if (!slot) {
    return { errorStatus: 404, errorMessage: 'Assessment slot not found.' };
  }

  const sameClass =
    Number(slot.subject_id) === Number(grade.subject_id) &&
    Number(slot.grade_level) === Number(grade.student_grade_level) &&
    slot.section === grade.student_section &&
    Number(slot.term) === Number(grade.term) &&
    slot.school_year === grade.school_year;

  if (!sameClass) {
    return {
      errorStatus: 400,
      errorMessage:
        'That assessment slot belongs to a different class. A slot is specific to one subject, section, term and school year.',
    };
  }

  if (expectedType && slot.type !== expectedType) {
    return {
      errorStatus: 400,
      errorMessage: `That slot is a ${slot.type} slot; this score is a ${expectedType}. A score must go in a slot of its own type.`,
    };
  }

  // AN UNUSED SLOT CANNOT HOLD A SCORE. A NULL max_score means the
  // assessment never happened, and the computation leaves such a slot out
  // entirely — so a score parked in one would be invisible in every total
  // while still occupying the learner's single row for that column.
  //
  // Added on review: the bulk endpoint refused this from the start and
  // these two per-row endpoints did not, which is the worst version of a
  // rule — one that holds on the path people use and not on the path a
  // direct caller or Expo would take.
  if (slot.max_score === null) {
    return {
      errorStatus: 400,
      errorMessage: `${slotDisplayLabel(slot.type, slot.slot_no, slot.name)} has no highest possible score yet — set one before recording marks in it.`,
    };
  }

  return { slot };
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
  const { rows } = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND subject_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, subjectId, gradeLevel, section]
  );
  return rows.length > 0;
}

// Wide VIEW scope for grades — ASSIGNED to the class, OR its ADVISER.
// Deliberately broader than teacherCanEncodeGrade's subject-specific check
// above. Grades' subject-specific WRITE scope was always the exception in this
// codebase, not the norm; this read-side check restores the norm. See
// loadAuthorizedGrade's own comment below for the full G3 resolution.
//
// THE ADVISER LEG LANDED 2026-09-22 (CR3), AND ITS ABSENCE WAS A REAL HOLE.
// Read scopes were widened to assigned-OR-adviser in students.js, excuses.js,
// content.js and messages.js on 2026-09-06/07; grades was left out. CLAUDE.md
// recorded "routes/grades.js is deliberately NOT widened", and that sentence
// is about ENCODE authority — which has NOT changed and must not: encoding is
// the subject teacher's, and widening it would invent school policy.
//
// What the omission actually did: TCH-002 advises Masigasig and holds zero
// teacher_assignments rows, so the adviser of a section could not read a
// single grade in it — not a report card, not the class record — while being
// the one person the school expects to compile that section's Summary of
// Grades. Every caller of this function answered 404 to them. Darryl's
// decision, 2026-09-22.
//
// The adviser predicate is TEACHER_ADVISES_CLASS_SQL from utils/teacherScope.js
// — the one place the adviser rule lives — NOT a copy written out here. Read
// that file's note for why the class-keyed form exists alongside the
// student-keyed one and why the two must move together.
async function teacherCanViewGrade(teacherId, gradeLevel, section) {
  const { rows } = await pool.query(
    `SELECT 1 WHERE
       EXISTS (
         SELECT 1 FROM teacher_assignments ta
         WHERE ta.teacher_id = ? AND ta.grade_level = ? AND ta.section = ?
       )
       OR ${TEACHER_ADVISES_CLASS_SQL}
     LIMIT 1`,
    [teacherId, gradeLevel, section, gradeLevel, section, teacherId]
  );
  return rows.length > 0;
}

// NOTE for the class summary, which needs adviser-ONLY authority: it does not
// call a helper here. It has already SELECTed the sections row to get the
// adviser's name for the payload, so it compares that row's adviser_id
// directly rather than asking the database the same question twice. The SQL
// predicate above remains the one definition for set-based queries.

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
  const { rows } = await pool.query(
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
// confirmed order: mode config, then lock, then weight-config presence — all
// BEFORE any write is attempted, so a rejection here costs the caller nothing
// (nothing was ever accepted, so there is nothing to lose on retry). One
// shared function rather than a copy per endpoint, so scope/mode/lock logic
// cannot drift between them: a fix applied to one copy would diverge
// silently, since both would still pass their own tests.
//
// RETURNS `{ mode }` ON SUCCESS, not null (2026-09-22). recomputeGrade needs
// the grading mode to decide whether it writes a number or a letter, and this
// function has already read it — handing it back is one query instead of two
// inside the transaction, and removes any chance the two disagree about the
// same row. Callers test `.errorStatus`, never truthiness.
async function preflightGradeWrite(grade, expectedMode) {
  const { rows: modeRows } = await pool.query(
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
  // 'score' means WW / PT / exam — and since 2026-09-22 BOTH modes accept it.
  // Grade 1 is computed from scores now (GRADING_SPEC §6a); what differs is
  // what recomputeGrade writes at the end, a letter rather than a number, not
  // whether a score may be recorded at all. The gate that used to answer 400
  // here — "this grade uses descriptive grading, record a letter instead" —
  // is gone with the endpoint it pointed at.
  //
  // Every other guard still runs, and for Grade 1 they now run for the first
  // time: a missing mode config is still 409, a locked row is still 403, and
  // the weights check below is no longer numerical-only.
  if (expectedMode !== 'score') {
    return {
      errorStatus: 500,
      errorMessage: `preflightGradeWrite called with an unknown mode "${expectedMode}".`,
    };
  }

  if (grade.is_locked) {
    return { errorStatus: 403, errorMessage: 'This grade is locked and can no longer be edited.' };
  }

  {
    const { rows: weightRows } = await pool.query(
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

  return { mode: modeConfig.mode };
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
// (student, subject, term, school_year), so ON CONFLICT DO NOTHING in
// utils/notify.js does it (MySQL's INSERT IGNORE until Phase 3). A later
// correction that clears the grade back to NULL and recomputes will not
// re-notify, which is correct -- the parent was already told it is there.
//
// `pending` collects recipient ids for the CALLER to emit AFTER conn.commit().
// The insert belongs inside the transaction (a notification for a grade that
// rolled back would be a lie); the socket event must not be, for the same
// reason.
async function recomputeGrade(conn, gradeId, mode, pending = null, actorId = null) {
  const { rows: gradeRows } = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
  const grade = gradeRows[0];
  const isDescriptive = mode === 'descriptive';

  const { rows: weightRows } = await conn.query(
    'SELECT ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE subject_id = ? AND school_year = ? LIMIT 1',
    [grade.subject_id, grade.school_year]
  );
  // Presence already guaranteed by preflightGradeWrite() before this
  // transaction began — not re-checked here, since re-checking inside
  // the transaction would just be trusting the same query twice.
  const weights = weightRows[0];

  const { rows: wwRows } = await conn.query(
    "SELECT score, max_score, slot_id FROM grade_components WHERE grade_id = ? AND type = 'WW'",
    [gradeId]
  );
  const { rows: ptRows } = await conn.query(
    "SELECT score, max_score, slot_id FROM grade_components WHERE grade_id = ? AND type = 'PT'",
    [gradeId]
  );

  // THE CLASS'S USED COLUMNS. A slot with a highest possible score is an
  // assessment the class sat, so a learner with no score in it is not yet
  // computable — see componentPercentage's own note for why "left out" was
  // wrong and what it silently did to a learner who missed a quiz.
  //
  // Read from the grade's own class (subject + grade level + section + term
  // + year), which is why this lives here and not in the pure module: it is
  // the one piece of the computation that needs a second table.
  //
  // A class with no slots at all — every legacy row, and every grade
  // recorded before the class record existed — produces an empty list, and
  // an empty list changes nothing. That is what keeps those rows computing
  // exactly as they always did.
  const {
    rows: [classRow],
  } = await conn.query('SELECT grade_level, section FROM students WHERE id = ? LIMIT 1', [
    grade.student_id,
  ]);
  let requiredWw = [];
  let requiredPt = [];
  if (classRow) {
    const { rows: usedSlots } = await conn.query(
      `SELECT id, type FROM assessment_slots
        WHERE subject_id = ? AND grade_level = ? AND section = ? AND term = ? AND school_year = ?
          AND max_score IS NOT NULL`,
      [grade.subject_id, classRow.grade_level, classRow.section, grade.term, grade.school_year]
    );
    requiredWw = usedSlots.filter((s) => s.type === 'WW').map((s) => s.id);
    requiredPt = usedSlots.filter((s) => s.type === 'PT').map((s) => s.id);
  }

  const wwPercentage = gc.componentPercentage(wwRows, requiredWw);
  const ptPercentage = gc.componentPercentage(ptRows, requiredPt);
  const st1Percentage = gc.subTestPercentage(grade.ex_st1, grade.ex_st1_max);
  const st2Percentage = gc.subTestPercentage(grade.ex_st2, grade.ex_st2_max);
  const tePercentage = gc.subTestPercentage(grade.ex_te, grade.ex_te_max);
  const exPercentage = gc.exPercentage(st1Percentage, st2Percentage, tePercentage);

  const wwWeighted = gc.weighted(wwPercentage, weights.ww_weight);
  const ptWeighted = gc.weighted(ptPercentage, weights.pt_weight);
  const exWeighted = gc.weighted(exPercentage, weights.ex_weight);
  const ig = gc.initialGrade(wwWeighted, ptWeighted, exWeighted);

  // THE FORK (2026-09-22). Everything above is identical for both modes —
  // the same components, the same weights table, the same Initial Grade —
  // because the school computes a Grade 1 letter from exactly the same raw
  // material, just with different weights (30/50/20) and a different last
  // step. Only this step differs.
  let termGrade = null;
  let descriptiveGrade = null;

  if (isDescriptive) {
    // NO TRANSMUTATION (GRADING_SPEC §6a): Grade 1 bands the RAW weighted
    // score. The transmutation table is a KS2-KS4 instrument for SY 2026-2027
    // and banding a transmuted score would lift letters a band in a way the
    // school does not do.
    //
    // bandForScore returns null for a null IG — an incomplete row keeps no
    // letter, the same "NULL until every input exists" rule the numerical
    // side follows — and also for a score above 100, where the school's table
    // defines no band. See gradeComputation.js.
    descriptiveGrade = gc.bandForScore(ig);
  } else if (ig !== null) {
    const { rows: transmutedRows } = await conn.query(
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

  // THE DUAL-MODE INVARIANT, enforced rather than assumed: exactly one of
  // term_grade / descriptive_grade is ever populated on a row. Writing both
  // columns on every recompute — one of them always NULL — is what makes a
  // mode change leave no stale value behind, and is cheaper than trusting
  // every future caller to remember. `initial_grade` IS stored for a
  // descriptive row: it is the only audit trail for why a letter is the
  // letter it is, and it is a teacher/admin-facing number that no
  // parent-facing renderer reads (see the report card and the breakdown
  // modal, both of which omit it deliberately).
  if (isDescriptive && termGrade !== null) {
    throw new Error(`recomputeGrade: refusing to write term_grade on a descriptive row (grade #${gradeId}).`);
  }
  if (!isDescriptive && descriptiveGrade !== null) {
    throw new Error(`recomputeGrade: refusing to write descriptive_grade on a numerical row (grade #${gradeId}).`);
  }

  await conn.query(
    `UPDATE grades SET
       ww_percentage = ?, ww_weighted = ?,
       pt_percentage = ?, pt_weighted = ?,
       ex_percentage = ?, ex_weighted = ?,
       initial_grade = ?, term_grade = ?, descriptive_grade = ?
     WHERE id = ?`,
    [wwPercentage, wwWeighted, ptPercentage, ptWeighted, exPercentage, exWeighted, ig, termGrade, descriptiveGrade, gradeId]
  );

  // MODE-AWARE: the trigger is the row's OWN grade value going null ->
  // non-null, which is term_grade for a numerical row and descriptive_grade
  // for a descriptive one. Before this, the condition named term_grade only,
  // so a Grade 1 letter would never have notified anybody.
  const wasNull = isDescriptive ? grade.descriptive_grade === null : grade.term_grade === null;
  const nowSet = isDescriptive ? descriptiveGrade !== null : termGrade !== null;

  if (pending && wasNull && nowSet) {
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

  const { rows: updatedRows } = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
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
    // NOT rendered to a parent, and carried for exactly one reason: the Grade
    // 1 Final letter averages the three terms' RAW weighted scores and bands
    // that average (GRADING_SPEC §6a), so computeFinalLetter below needs the
    // score behind each letter. Reading it here costs nothing — the row is
    // already loaded — where a second query per subject would not be.
    //
    // THE CLIENT MUST NOT RENDER THIS. A Grade 1 parent never sees a number;
    // the report card and the breakdown modal both omit `initial_grade`
    // deliberately, the same way they do for numerical grades.
    initial_grade: numOrNull(gradeRow.initial_grade),
  };
}

// ---------------------------------------------------------------------------
// GRADE ACKNOWLEDGEMENTS (feat/grade-acknowledgement, 2026-10-21)
// ---------------------------------------------------------------------------
// A parent confirms a TERM — "I have seen these grades" — once the term is
// FULLY LOCKED: every subject of the learner's grade level has a locked grade
// row WITH a value (the owner's Q3: the bulk lock's own test, applied after
// the fact). The confirmation is one grade_acknowledgements row per (learner,
// school year, term); an unlock of any subject of the term deletes it (Q2),
// and the two typed notifications with it, so a relock asks again.
//
// THE NOTIFICATION KEY is the term's LOWEST grade id for that learner and
// school year: one item_id for the parent's grades_locked, the adviser's
// grades_acknowledged, and the delete on unlock. While the term is locked no
// row of it can be deleted (DELETE /:id refuses a locked row), so the key
// cannot move under a notification; after an unlock the rows are gone anyway.

const TERM_ACK_TYPES = ['grades_locked', 'grades_acknowledged'];

// Pure. `rows` are the learner's grade rows for ONE term and school year;
// `subjectCount` the subjects of their grade level. Locked only when every
// subject has a locked row that carries a value — a locked shell row is not
// a final grade, and a subject with no row at all is not graded.
function termFullyLocked(rows, subjectCount) {
  if (!subjectCount) return false;
  const locked = new Set();
  for (const row of rows) {
    const hasValue = row.term_grade !== null && row.term_grade !== undefined
      ? true
      : row.descriptive_grade !== null && row.descriptive_grade !== undefined;
    if (hasValue && Number(row.is_locked) === 1) locked.add(Number(row.subject_id));
  }
  return locked.size >= subjectCount;
}

// The term's lock state and notification key for one learner, read live.
async function loadTermLockState(conn, { studentId, gradeLevel, term, schoolYear }) {
  const {
    rows: [{ subjects }],
  } = await conn.query('SELECT COUNT(*) AS subjects FROM subjects WHERE grade_level = ?', [
    gradeLevel,
  ]);
  const { rows } = await conn.query(
    'SELECT id, subject_id, is_locked, term_grade, descriptive_grade FROM grades WHERE student_id = ? AND term = ? AND school_year = ?',
    [studentId, term, schoolYear]
  );
  const itemId = rows.length ? Math.min(...rows.map((r) => Number(r.id))) : null;
  return { fullyLocked: termFullyLocked(rows, Number(subjects)), itemId };
}

// The parent's "please confirm" — ON CONFLICT DO NOTHING on uq_notifications_once, so a
// repeat (a relock of an already-locked row, two admins at once) inserts
// nothing. Returns the recipients for the emit after commit.
async function notifyGradesLocked(conn, { studentId, itemId, actorId }) {
  if (!itemId) return [];
  const audience = await parentOfStudent(conn, studentId);
  return insertNotifications(conn, {
    type: 'grades_locked',
    itemType: 'grade',
    itemId,
    actorId,
    titleSnapshot: null,
    userIds: audience,
  });
}

// The unlock's counterpart: the term's confirmation row (if any) and both
// typed notifications go; the grade_available rows stay. Returns how many
// confirmation rows were deleted and who to signal.
async function clearTermAcknowledgement(conn, { studentId, term, schoolYear, itemId }) {
  const result = await conn.query(
    'DELETE FROM grade_acknowledgements WHERE student_id = ? AND school_year = ? AND term = ?',
    [studentId, schoolYear, term]
  );
  const recipients = itemId ? await removeTypedNotifications(conn, TERM_ACK_TYPES, 'grade', itemId) : [];
  return { cleared: result.rowCount, recipients };
}

// The confirmations of some learners for one school year, keyed
// `${student_id}:${term}` → { acknowledged_at, by_name }. One query for a
// whole class or one card; never an LRN (users.name only).
async function acknowledgementsFor(conn, studentIds, schoolYear) {
  const map = new Map();
  if (!studentIds.length) return map;
  const { rows } = await conn.query(
    `SELECT ga.student_id, ga.term, ga.acknowledged_at, u.name AS by_name
       FROM grade_acknowledgements ga
       LEFT JOIN users u ON u.id = ga.user_id
      WHERE ga.student_id = ANY(?::int[]) AND ga.school_year = ?`,
    [studentIds, schoolYear]
  );
  for (const row of rows) {
    map.set(`${row.student_id}:${row.term}`, { acknowledged_at: row.acknowledged_at, by_name: row.by_name || null });
  }
  return map;
}

// "21 October 2026" in the school's timezone, for the one server message that
// names a date (the repeat answer of POST /acknowledgements). The clients
// format their own dates from `acknowledged_at` (format/date.js).
function formatManilaDay(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
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
// The Grade 1 counterpart (GRADING_SPEC §6a), and the shape of it is the
// point: average the three terms' RAW WEIGHTED SCORES and band the average —
// NOT the three letters. Banding letters would need an arithmetic on A-E that
// the school does not define, and would lose the distance between a bare 90
// and a 99 that both read "A".
//
// Same null-until-complete rule as everything else: all three terms, or null.
// roundTo2 before banding so the boundary is reproducible by hand — an
// average of 89.995 is otherwise a band away from what a teacher computes on
// paper.
//
// Nino's seeded card shows both outcomes (D-102, B7): Mathematics has all
// three terms' scores, so 94.70, 85.00 and 77.50 average to 85.73 — a B;
// Reading and Literacy has no term 3, so its Final is null and renders
// "— Pending". A legacy row — a letter with no scores behind it, so no
// initial_grade — still gets no Final: the honest answer for scores never
// recorded.
function computeFinalLetter(terms, mode) {
  if (mode !== 'descriptive') {
    return { final_grade: null, final_grade_descriptor: null };
  }
  const scores = [terms[1]?.initial_grade, terms[2]?.initial_grade, terms[3]?.initial_grade];
  if (scores.some((value) => value === null || value === undefined)) {
    return { final_grade: null, final_grade_descriptor: null };
  }
  const averaged = gc.roundTo2((scores[0] + scores[1] + scores[2]) / 3);
  const letter = gc.bandForScore(averaged);
  return { final_grade: letter, final_grade_descriptor: gc.descriptiveGradeMeaning(letter) };
}

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

// The band word for each term average (pre-Stage-5 #2, item m). Added
// because the parent hero shows `term_averages[current_term]` and had no word
// to put beside it: `general_average_descriptor` describes the YEAR's
// average, not a term's, and banding the number in the client would be a
// second implementation of the BANDS ladder — §12 forbids exactly that.
//
// Same shape as its sibling, `{ descriptor, remarks }` or null, through the
// same `qualitativeDescriptor`, so a client that renders one renders the
// other. Null wherever the average is null — descriptive mode, or a term any
// subject has not recorded — which is the null-until-complete rule for the
// fourth time. NOTE for every reader: `remarks` is Passed/Failed, a VERDICT
// the client must never render (§4); only `.descriptor` reaches a screen.
function computeTermAverageDescriptors(termAverages) {
  const out = {};
  for (const term of [1, 2, 3]) {
    const value = termAverages?.[term];
    out[term] = value === null || value === undefined ? null : gc.qualitativeDescriptor(value);
  }
  return out;
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
  const { student_id, subject_id, term, school_year, grade_level, section } = req.query;

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

  // A CLASS FILTER (pre-Stage-5 #2, o2). `s.grade_level` and `s.section` were
  // already JOINed and SELECTed by this query and simply never filterable —
  // every other list endpoint that JOINs students takes them. Mirrors
  // routes/attendance.js exactly, `class` sort key included. The check is the
  // same two lines students.js keeps as a local helper; not imported across
  // route files. For a parent it ANDs against their own child — harmless.
  if (grade_level !== undefined) {
    const gradeLevelNum = Number(grade_level);
    if (!Number.isInteger(gradeLevelNum) || gradeLevelNum < 1 || gradeLevelNum > 6) {
      return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
    }
    conditions.push('s.grade_level = ?');
    params.push(gradeLevelNum);
  }
  if (section !== undefined) {
    const trimmedSection = String(section).trim();
    if (!trimmedSection) {
      return res.status(400).json({ success: false, message: 'section must not be empty.' });
    }
    conditions.push('s.section = ?');
    params.push(trimmedSection);
  }

  const list = readListParams(req.query, {
    sortable: {
      student: 's.last_name, s.first_name',
      subject: 'sub.name',
      class: 's.grade_level, s.section',
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
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const { rows } = await pool.query(
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

// ===========================================================================
// THE CLASS RECORD (CR1, 2026-09-22)
// ===========================================================================
// One screen per subject + section + term, shaped like the DepEd E-Class
// Record: learners as rows, assessment slots as columns. Before this, a
// teacher encoded ONE learner at a time through a modal — one quiz for 40
// learners was up to 80 requests.
//
// REGISTERED BEFORE `/:id` ON PURPOSE. Express matches in order, so
// `GET /api/grades/class-record` would otherwise hit `GET /:id`, fail
// parseId and answer "Invalid grade id." — a confusing 400 for a correct
// request. Do not move these below.
//
// NO PAGINATION, and that is a deliberate exception to "every list endpoint
// pages". A class record is a DOCUMENT, not a list of records: a section is
// at most ~50 learners, the grid shows every learner against every slot at
// once, and a page of 50 would cut a class in half for no benefit. Same
// exemption, for the same reason, as the report card.

// Parses and validates the five identifiers that name a class. Shared by
// the read and the write so the two cannot disagree about what a class is.
function readClassKey(source) {
  const subjectId = parseId(source.subject_id);
  const gradeLevel = Number(source.grade_level);
  const section = typeof source.section === 'string' ? source.section.trim() : '';
  const term = source.term;
  const schoolYear = source.school_year;

  if (subjectId === null) return { error: 'subject_id is required.' };
  if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 6) {
    return { error: 'grade_level must be a whole number from 1 to 6.' };
  }
  if (!section) return { error: 'section is required.' };
  if (!isValidTerm(term)) return { error: 'term must be 1, 2, or 3.' };
  if (!isValidSchoolYear(schoolYear)) return { error: 'school_year must be in YYYY-YYYY format with consecutive years.' };

  return { key: { subjectId, gradeLevel, section, term: Number(term), schoolYear } };
}

// Every slot for a class, ordered the way the grid prints them.
async function loadSlots(conn, key) {
  const { rows } = await conn.query(
    `SELECT * FROM assessment_slots
      WHERE subject_id = ? AND grade_level = ? AND section = ? AND term = ? AND school_year = ?
      ORDER BY type ASC, slot_no ASC`,
    [key.subjectId, key.gradeLevel, key.section, key.term, key.schoolYear]
  );
  return rows.map((slot) => ({
    id: slot.id,
    type: slot.type,
    slot_no: slot.slot_no,
    name: slot.name,
    // TWO LABELS, for two consumers with different surroundings.
    //   display_label — the full text ("Written Work 3"). The parent
    //     breakdown modal shows a single score with no column heading above
    //     it, so it needs the whole name.
    //   short_label — what the grid column shows. It sits under a group
    //     header that already says "Written / Oral Works", so repeating the
    //     category in every column heading wastes the width that made the
    //     labels truncate in the first place. A NAMED slot keeps its name;
    //     an unnamed one is just its number.
    display_label: slotDisplayLabel(slot.type, slot.slot_no, slot.name),
    short_label: slot.name && slot.name.trim() ? slot.name.trim() : String(slot.slot_no),
    max_score: slot.max_score === null ? null : Number(slot.max_score),
    // An UNUSED slot is one with no highest possible score. Its cells are
    // disabled in the grid and it is left out of the computation entirely —
    // never counted as zero, which would drag every learner's average down
    // for an assessment that never happened.
    in_use: slot.max_score !== null,
  }));
}

// TOTAL, PS and WS are the three columns the school's E-Class Record prints
// per group, and ALL THREE COME FROM THE SERVER.
//
// PS (ww_percentage) and WS (ww_weighted) were already stored. TOTAL — the
// raw sum of a learner's scores over the sum of the maxima they were marked
// out of — was computed inside componentPercentage() and thrown away. It is
// returned now rather than summed in the grid, and the reason is not
// consistency for its own sake: a Total the client added up could disagree
// with the PS beside it by a rounding step, and that is the single hardest
// class of bug to explain to a teacher looking at two numbers that should
// agree.
//
// An unused slot contributes nothing here either — a component row only
// exists where a score does, so the sum is over what was actually recorded.
function componentTotals(rows) {
  let score = 0;
  let max = 0;
  for (const row of rows) {
    score += Number(row.score);
    max += Number(row.max_score);
  }
  return rows.length ? { total: gc.roundTo2(score), total_max: gc.roundTo2(max) } : { total: null, total_max: null };
}

// The Summative group's Total is the three sub-tests summed, not a
// component query: ST1/ST2/TE live as columns on `grades` (a fixed
// positional triple, see schema.sql), so this reads the row it already has.
// All three must be present — a partial Summative has no meaningful total,
// the same rule exPercentage() follows.
function examTotals(grade) {
  const parts = [
    [grade.ex_st1, grade.ex_st1_max],
    [grade.ex_st2, grade.ex_st2_max],
    [grade.ex_te, grade.ex_te_max],
  ];
  if (parts.some(([s, m]) => s === null || s === undefined || m === null || m === undefined)) {
    return { total: null, total_max: null };
  }
  return {
    total: gc.roundTo2(parts.reduce((sum, [s]) => sum + Number(s), 0)),
    total_max: gc.roundTo2(parts.reduce((sum, [, m]) => sum + Number(m), 0)),
  };
}

// The refusal when a column's HPS would change while learners of the class
// are locked (fix/grade-locks, 2026-10-13). Every locked learner by name,
// "First Last", in name order; more than three shows the first three and
// "and N more". The wording follows the score refusal's ("Nothing was
// saved. … locked grade(s) for this subject and term — ask an admin to
// unlock …"); a dry run drops "Nothing was saved.", since a preview saves
// nothing anyway. Names only — never an LRN.
function lockedHpsMessage(learners, dryRun) {
  const names = learners.map((l) => `${l.first_name} ${l.last_name}`);
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  const verb = names.length === 1 ? 'has a locked grade' : 'have locked grades';
  return `${dryRun ? '' : 'Nothing was saved. '}${shown} ${verb} for this subject and term — ask an admin to unlock before changing a highest possible score.`;
}

// GET /api/grades/class-record — the whole grid in one request.
//
// READ SCOPE IS VIEW SCOPE (grade+section, any subject), matching GET / and
// GET /:id, with `can_encode` in the payload so a teacher who may look but
// not encode gets a read-only grid rather than a 404. That follows the
// existing two-tier split instead of inventing a third rule.
router.get('/class-record', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const parsed = readClassKey(req.query);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  const key = parsed.key;

  try {
    if (req.user.role === 'teacher') {
      const canView = await teacherCanViewGrade(req.user.id, key.gradeLevel, key.section);
      if (!canView) {
        return res.status(404).json({ success: false, message: 'Class record not found.' });
      }
    }
    const canEncode =
      req.user.role === 'admin' ||
      (await teacherCanEncodeGrade(req.user.id, key.subjectId, key.gradeLevel, key.section));

    const { rows: subjectRows } = await pool.query('SELECT * FROM subjects WHERE id = ? LIMIT 1', [key.subjectId]);
    const subject = subjectRows[0];
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }
    if (Number(subject.grade_level) !== key.gradeLevel) {
      return res.status(400).json({
        success: false,
        message: `${subject.name} is a Grade ${subject.grade_level} subject; this class is Grade ${key.gradeLevel}.`,
      });
    }

    const { rows: modeRows } = await pool.query(
      'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
      [key.gradeLevel, key.schoolYear]
    );
    if (!modeRows.length) {
      return res.status(409).json({
        success: false,
        message: `No grading_mode_configs row exists for Grade ${key.gradeLevel}, school year ${key.schoolYear}. An admin must configure the grading mode before this class can be recorded.`,
      });
    }
    const mode = modeRows[0].mode;

    const { rows: weightRows } = await pool.query(
      'SELECT ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE subject_id = ? AND school_year = ? LIMIT 1',
      [key.subjectId, key.schoolYear]
    );
    if (!weightRows.length) {
      return res.status(409).json({
        success: false,
        message: `No grade_weight_configs row exists for this subject and school year (${key.schoolYear}). An admin must configure WW/PT/EX weights before this class can be computed.`,
      });
    }
    const weights = weightRows[0];

    const slots = await loadSlots(pool, key);

    // ACTIVE learners only — the same filter Teacher → Attendance uses for
    // its roster. An inactive learner is not in the class any more and a
    // column of disabled cells for them is noise.
    const { rows: students } = await pool.query(
      `SELECT id, lrn, first_name, last_name FROM students
        WHERE grade_level = ? AND section = ? AND status = 'active'
        ORDER BY last_name ASC, first_name ASC`,
      [key.gradeLevel, key.section]
    );

    const studentIds = students.map((s) => s.id);
    let gradeRows = [];
    let componentRows = [];
    if (studentIds.length) {
      ({ rows: gradeRows } = await pool.query(
        'SELECT * FROM grades WHERE student_id = ANY(?::int[]) AND subject_id = ? AND term = ? AND school_year = ?',
        [studentIds, key.subjectId, key.term, key.schoolYear]
      ));
      const gradeIds = gradeRows.map((g) => g.id);
      if (gradeIds.length) {
        ({ rows: componentRows } = await pool.query('SELECT * FROM grade_components WHERE grade_id = ANY(?::int[])', [
          gradeIds,
        ]));
      }
    }

    const gradeByStudent = new Map(gradeRows.map((g) => [g.student_id, g]));
    const componentsByGrade = new Map();
    for (const row of componentRows) {
      if (!componentsByGrade.has(row.grade_id)) componentsByGrade.set(row.grade_id, []);
      componentsByGrade.get(row.grade_id).push(row);
    }

    const learners = students.map((student) => {
      const grade = gradeByStudent.get(student.id) || null;
      const components = grade ? componentsByGrade.get(grade.id) || [] : [];

      // Scores keyed by slot id, so the client never matches on a label.
      const scores = {};
      for (const row of components) {
        if (row.slot_id) scores[row.slot_id] = Number(row.score);
      }

      const wwTotals = componentTotals(components.filter((c) => c.type === 'WW'));
      const ptTotals = componentTotals(components.filter((c) => c.type === 'PT'));
      const exTotals = grade ? examTotals(grade) : { total: null, total_max: null };

      return {
        student_id: student.id,
        name: `${student.last_name}, ${student.first_name}`,
        lrn: student.lrn,
        grade_id: grade ? grade.id : null,
        is_locked: grade ? !!grade.is_locked : false,
        scores,
        // LEGACY ROWS ARE COUNTED BUT NOT SHOWN AS CELLS. A component with
        // no slot_id predates the grid and has no column to sit in; it
        // still feeds the learner's totals, which is why the grid's own
        // arithmetic would disagree with the server's without this flag.
        // The client says so rather than silently differing.
        legacy_components: components.filter((row) => !row.slot_id).length,
        ex_st1: numOrNull(grade?.ex_st1),
        ex_st1_max: numOrNull(grade?.ex_st1_max),
        ex_st2: numOrNull(grade?.ex_st2),
        ex_st2_max: numOrNull(grade?.ex_st2_max),
        ex_te: numOrNull(grade?.ex_te),
        ex_te_max: numOrNull(grade?.ex_te_max),
        // Every computed value comes from the SERVER, already worked out
        // and stored by recomputeGrade. The grid displays; it never
        // calculates a grade (CLAUDE.md: no client-side IG preview).
        ww_total: wwTotals.total,
        ww_total_max: wwTotals.total_max,
        ww_percentage: numOrNull(grade?.ww_percentage),
        ww_weighted: numOrNull(grade?.ww_weighted),
        pt_total: ptTotals.total,
        pt_total_max: ptTotals.total_max,
        pt_percentage: numOrNull(grade?.pt_percentage),
        pt_weighted: numOrNull(grade?.pt_weighted),
        ex_total: exTotals.total,
        ex_total_max: exTotals.total_max,
        ex_percentage: numOrNull(grade?.ex_percentage),
        ex_weighted: numOrNull(grade?.ex_weighted),
        initial_grade: numOrNull(grade?.initial_grade),
        term_grade: numOrNull(grade?.term_grade),
        descriptive_grade: grade?.descriptive_grade ?? null,
      };
    });

    // THE SUMMATIVE HIGHEST POSSIBLE SCORES, AS ONE CLASS-WIDE VALUE.
    //
    // They are stored per learner (ex_st1_max and friends are columns on
    // `grades`, a fixed positional triple — see schema.sql), because that is
    // what lets a raw score always be re-derived. But a Summative is one
    // paper sat by the whole class, so the grid shows ONE maximum per part
    // in its header and the save fans it out to every learner.
    //
    // Derived here rather than stored twice: the class value is whatever the
    // learners agree on. `mixed` is true when they do not, which can only
    // happen through rows written before the grid existed or a direct DB
    // edit — the header then shows the most common value and the client says
    // the class disagrees, rather than silently picking one and overwriting
    // the rest on the next save.
    // THE HPS ROW — the line the school's E-Class Record prints across the
    // top of each group, before any learner.
    //
    //   TOTAL  the sum of the USED slots' highest possible scores (an unused
    //          slot contributes nothing, exactly as it contributes nothing to
    //          a learner's total)
    //   PS     100.00 by definition — it is the percentage a learner who
    //          scored every point would have
    //   WS     the group's weight
    //
    // Sent from here rather than summed in the grid for the same reason
    // every other number on that screen is: the client does no grade
    // arithmetic, and a header total that disagreed with the column beneath
    // it by a rounding step would be the worst possible thing to debug.
    // The Summative row's total is the three class-wide maxima summed.
    const usedTotal = (type) =>
      slots.filter((s) => s.type === type && s.max_score !== null).reduce((sum, s) => sum + s.max_score, 0) || null;

    const examMax = {};
    const examMixed = {};
    for (const part of ['st1', 'st2', 'te']) {
      const seen = new Map();
      for (const learner of learners) {
        const value = learner[`ex_${part}_max`];
        if (value === null) continue;
        seen.set(value, (seen.get(value) || 0) + 1);
      }
      const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1]);
      examMax[part] = ranked.length ? ranked[0][0] : null;
      examMixed[part] = ranked.length > 1;
    }

    return res.json({
      success: true,
      subject: { id: subject.id, name: subject.name, grade_level: subject.grade_level },
      exam_max: examMax,
      exam_max_mixed: examMixed,
      group_hps: {
        ww: usedTotal('WW'),
        pt: usedTotal('PT'),
        ex:
          examMax.st1 === null || examMax.st2 === null || examMax.te === null
            ? null
            : gc.roundTo2(examMax.st1 + examMax.st2 + examMax.te),
      },
      grade_level: key.gradeLevel,
      section: key.section,
      term: key.term,
      school_year: key.schoolYear,
      grading_mode: mode,
      weights: {
        ww: Number(weights.ww_weight),
        pt: Number(weights.pt_weight),
        ex: Number(weights.ex_weight),
      },
      can_encode: canEncode,
      slots,
      learners,
    });
  } catch (error) {
    console.error('Get class record error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load the class record.' });
  }
});

// PUT /api/grades/class-record — ONE save for the whole class.
//
// SCOPE IS CHECKED ONCE, NOT FORTY TIMES. The grid is a single subject +
// grade + section, which is exactly teacherCanEncodeGrade's four columns —
// so encode authority is settled before any row is touched. It deliberately
// does NOT run loadAuthorizedGrade per learner: that loads a grade by id and
// re-derives scope from the student, forty times, for an answer already
// known. preflightGradeWrite runs once too — mode and weights key on the
// class, not the learner.
//
// What IS per learner: the lock check, and creating a shell row for a
// learner who has none (the grid must work on an empty class).
//
// DRY RUN. `dry_run: true` runs the entire save inside the transaction and
// then ROLLS BACK, returning what every affected row WOULD hold. That is how
// the grid shows live totals, PS, WS and a term grade as the teacher types
// without doing any grade arithmetic in the client — the one rule this
// module has never bent (CLAUDE.md: no client-side Initial Grade preview; a
// second implementation of the computation would drift the first time DepEd
// changed anything). A dry run writes nothing, notifies nobody and logs
// nothing.
router.put('/class-record', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const parsed = readClassKey(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  const key = parsed.key;
  const dryRun = req.body.dry_run === true;
  const slots = Array.isArray(req.body.slots) ? req.body.slots : [];
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  // The Summative maxima, as ONE class-wide value applied to every active
  // learner — see the GET's own note. Optional; omitted, nothing changes.
  const examMaxIn = req.body.exam_max && typeof req.body.exam_max === 'object' ? req.body.exam_max : null;

  if (!slots.length && !entries.length && !examMaxIn) {
    return res.status(400).json({ success: false, message: 'Nothing to save — send slots, entries, or both.' });
  }

  if (examMaxIn) {
    for (const part of ['st1', 'st2', 'te']) {
      const value = examMaxIn[part];
      if (value === undefined || value === null) continue;
      if (!isValidMax(value)) {
        return res.status(400).json({ success: false, message: `${part}_max must be greater than 0.` });
      }
      if (!isWholeNumber(value)) {
        return res.status(400).json({ success: false, message: wholeNumberMessage(`${part}_max`, value) });
      }
    }
  }

  // ---- shape and whole-number validation, before anything is loaded ----
  for (const slot of slots) {
    if (slot?.type !== 'WW' && slot?.type !== 'PT') {
      return res.status(400).json({ success: false, message: "Each slot needs a type of 'WW' or 'PT'." });
    }
    const slotNo = Number(slot.slot_no);
    if (!Number.isInteger(slotNo) || slotNo < 1 || slotNo > 20) {
      return res.status(400).json({ success: false, message: 'Each slot needs a slot_no from 1 to 20.' });
    }
    const named = normalizeSlotName(slot.name);
    if (named.error) {
      return res.status(400).json({ success: false, message: named.error });
    }
    if (slot.max_score !== null && slot.max_score !== undefined) {
      if (!isValidMax(slot.max_score)) {
        return res.status(400).json({ success: false, message: 'A slot max_score must be greater than 0.' });
      }
      if (!isWholeNumber(slot.max_score)) {
        return res
          .status(400)
          .json({ success: false, message: wholeNumberMessage(`${slot.type} ${slotNo} max_score`, slot.max_score) });
      }
    }
  }

  const seenStudents = new Set();
  for (const entry of entries) {
    const studentId = parseId(entry?.student_id);
    if (studentId === null) {
      return res.status(400).json({ success: false, message: 'Each entry needs a valid student_id.' });
    }
    if (seenStudents.has(studentId)) {
      return res.status(400).json({ success: false, message: `Duplicate student_id ${studentId} in entries.` });
    }
    seenStudents.add(studentId);

    for (const item of Array.isArray(entry.scores) ? entry.scores : []) {
      // A SCORE NAMES ITS COLUMN ONE OF TWO WAYS: by `slot_id` when the
      // column already exists, or by `type` + `slot_no` when it is being
      // created in this same save. The second is not a convenience — the
      // grid lets a teacher give a blank column a highest possible score
      // AND type scores into it before pressing Save once, and at that
      // moment the column has no id anywhere for the client to send. Slots
      // are upserted before entries in this transaction, so by the time a
      // score is processed the column exists and can be resolved.
      const slotId = parseId(item?.slot_id);
      const named = item?.type === 'WW' || item?.type === 'PT';
      if (slotId === null && !named) {
        return res
          .status(400)
          .json({ success: false, message: 'Each score needs a slot_id, or a type and slot_no.' });
      }
      if (item.score === null) continue; // an explicit null clears the score
      if (!isValidScore(item.score)) {
        return res.status(400).json({ success: false, message: 'A score must be 0 or greater.' });
      }
      if (!isWholeNumber(item.score)) {
        return res.status(400).json({ success: false, message: wholeNumberMessage('score', item.score) });
      }
    }

    for (const field of ['st1_score', 'st1_max', 'st2_score', 'st2_max', 'te_score', 'te_max']) {
      const value = entry[field];
      if (value === undefined || value === null) continue;
      const rangeOk = field.endsWith('_max') ? isValidMax(value) : isValidScore(value);
      if (!rangeOk) {
        return res.status(400).json({
          success: false,
          message: field.endsWith('_max') ? `${field} must be greater than 0.` : `${field} must be 0 or greater.`,
        });
      }
      if (!isWholeNumber(value)) {
        return res.status(400).json({ success: false, message: wholeNumberMessage(field, value) });
      }
    }
  }

  let conn;
  try {
    // ---- authority, once ----
    if (req.user.role === 'teacher') {
      const canEncode = await teacherCanEncodeGrade(req.user.id, key.subjectId, key.gradeLevel, key.section);
      if (!canEncode) {
        const canView = await teacherCanViewGrade(req.user.id, key.gradeLevel, key.section);
        // The same 403-vs-404 split every :id-keyed grades write uses: in
        // view scope but not encode scope is an informative refusal naming
        // the subject; outside both, the class does not exist for you.
        if (!canView) {
          return res.status(404).json({ success: false, message: 'Class record not found.' });
        }
        const { rows: subjectRows } = await pool.query('SELECT name FROM subjects WHERE id = ? LIMIT 1', [key.subjectId]);
        const subjectName = subjectRows[0] ? subjectRows[0].name : 'this subject';
        return res.status(403).json({
          success: false,
          message: `You are not assigned to teach ${subjectName} in Grade ${key.gradeLevel} - ${key.section}.`,
        });
      }
    }

    const { rows: students } = await pool.query(
      `SELECT id, first_name, last_name FROM students
        WHERE grade_level = ? AND section = ? AND status = 'active'`,
      [key.gradeLevel, key.section]
    );
    const studentById = new Map(students.map((s) => [s.id, s]));
    for (const studentId of seenStudents) {
      if (!studentById.has(studentId)) {
        return res.status(400).json({
          success: false,
          message: `Student #${studentId} is not an active learner in Grade ${key.gradeLevel} - ${key.section}.`,
        });
      }
    }

    conn = await pool.connect();
    await conn.beginTransaction();

    // THE CLASS'S GRADE ROWS, LOCKED BEFORE ANY CHECK (F-1, D-267; P4 Part B).
    // Every lock check below — the HPS freeze, the Summative fan-out's skip, a
    // score's refusal and the recompute's is_locked = 0 — is a plain read, and a
    // lock (bulk or single) that committed between that read and this save's
    // write was not seen: the save then wrote over a locked learner, a locked
    // VALUE included (migration/scripts/p4b-concurrency.js C3r, C3s, C3m).
    // Taking every grade row of this class, subject, term and year FOR UPDATE
    // first makes the two serial: a lock in progress is waited for and then
    // seen (409, or the learner skipped), and a lock that comes later waits for
    // this save and locks what it saved. Every existing row this save can write
    // is in this set — the fan-out, the entries and the recompute stay inside
    // the class, subject, term and year — and a row it creates is its own until
    // it commits. ONE statement, in id order: POST /locks takes the same rows in
    // the same order, so the two cannot deadlock. FOR UPDATE, not FOR SHARE: two
    // saves of one class (a preview and a Save) would each share the rows and
    // then wait on the other's share to write them. Learners of any status, as
    // the HPS check below. A dry run takes them too, for its few milliseconds.
    await conn.query(
      `SELECT g.id
         FROM grades g
         JOIN students st ON st.id = g.student_id
        WHERE st.grade_level = ? AND st.section = ? AND g.subject_id = ? AND g.term = ? AND g.school_year = ?
        ORDER BY g.id
          FOR UPDATE OF g`,
      [key.gradeLevel, key.section, key.subjectId, key.term, key.schoolYear]
    );

    // ---- slots: upsert, and guard the two HPS rules ----
    const existingSlots = await loadSlots(conn, key);
    const slotByKey = new Map(existingSlots.map((s) => [`${s.type}-${s.slot_no}`, s]));

    // A LOCKED LEARNER FREEZES THIS CLASS'S HIGHEST POSSIBLE SCORES
    // (fix/grade-locks, 2026-10-13; the owner's Finding 1a). Setting, changing
    // or clearing a column's HPS rewrites the materialised maximum of every
    // row in it and recomputes the class — and a lock is what makes a
    // finalised grade immutable, so the save is refused while ANY learner of
    // the class (any status: a column change would still rewrite their copy)
    // has a locked row for this subject and term. Checked before the first
    // write; a dry run reports it too. A rename at the same HPS, an unused
    // column sent back unchanged, and score-only saves are not affected — the
    // locked-learner refusal for scores is further down, unchanged.
    const hpsWouldChange = slots.some((slot) => {
      const existing = slotByKey.get(`${slot.type}-${Number(slot.slot_no)}`);
      const nextMax = slot.max_score === undefined || slot.max_score === null ? null : Number(slot.max_score);
      // Null-safe on purpose: `Number(null ?? NaN)` on both sides would read
      // an unused column sent back unchanged (null to null) as a change.
      const currentMax = !existing || existing.max_score === null || existing.max_score === undefined ? null : Number(existing.max_score);
      return existing ? currentMax !== nextMax : nextMax !== null;
    });
    if (hpsWouldChange) {
      const { rows: lockedLearners } = await conn.query(
        `SELECT st.first_name, st.last_name
           FROM grades g
           JOIN students st ON st.id = g.student_id
          WHERE st.grade_level = ? AND st.section = ? AND g.subject_id = ? AND g.term = ? AND g.school_year = ?
            AND g.is_locked = 1
          ORDER BY st.last_name, st.first_name, st.id`,
        [key.gradeLevel, key.section, key.subjectId, key.term, key.schoolYear]
      );
      if (lockedLearners.length) {
        await conn.rollback();
        return res.status(409).json({ success: false, message: lockedHpsMessage(lockedLearners, dryRun) });
      }
    }

    const touchedSlotIds = new Set();
    // True when the set of USED columns changed in any way — a maximum set,
    // changed or cleared. That is what decides whether the whole class is
    // recomputed, because it is what can flip a learner into or out of
    // Pending.
    let slotSetChanged = false;

    for (const slot of slots) {
      const slotNo = Number(slot.slot_no);
      const named = normalizeSlotName(slot.name);
      const nextMax = slot.max_score === undefined || slot.max_score === null ? null : slot.max_score;
      const existing = slotByKey.get(`${slot.type}-${slotNo}`);

      if (existing) {
        const {
          rows: [scored],
        } = await conn.query(
          'SELECT COUNT(*) AS n FROM grade_components WHERE slot_id = ?',
          [existing.id]
        );
        const scoreCount = Number(scored.n);

        // CLEARING an HPS that already holds scores is REFUSED. Blank means
        // "this slot was never used", and an unused slot holding 34 marks is
        // a contradiction — clearing it would silently orphan every one of
        // them. Deleting the scores is a separate, deliberate action.
        if (nextMax === null && scoreCount > 0) {
          await conn.rollback();
          return res.status(409).json({
            success: false,
            message: `${slotDisplayLabel(slot.type, slotNo, existing.name)} cannot be cleared — ${scoreCount} learner${
              scoreCount === 1 ? ' has a score' : 's have scores'
            } in it. Remove the scores first.`,
          });
        }

        await conn.query('UPDATE assessment_slots SET name = ?, max_score = ? WHERE id = ?', [
          named.value,
          nextMax,
          existing.id,
        ]);

        // CHANGING an HPS rewrites the materialised max_score on every row
        // in that slot, inside this transaction — the slot is the
        // declaration, the row is the copy, and this endpoint is the only
        // writer of both. Without this the two disagree and every affected
        // learner's percentage is computed against a stale max.
        if (nextMax !== null && Number(existing.max_score) !== Number(nextMax)) {
          await conn.query('UPDATE grade_components SET max_score = ? WHERE slot_id = ?', [nextMax, existing.id]);
          touchedSlotIds.add(existing.id);
        }
        // Set, changed OR cleared — all three move a column in or out of the
        // used set, and any of them can flip a learner into or out of
        // Pending.
        if (Number(existing.max_score ?? NaN) !== Number(nextMax ?? NaN)) slotSetChanged = true;
        slotByKey.set(`${slot.type}-${slotNo}`, { ...existing, name: named.value, max_score: nextMax });
      } else {
        const { rows: insertedSlot } = await conn.query(
          `INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, name, max_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
          [key.subjectId, key.gradeLevel, key.section, key.term, key.schoolYear, slot.type, slotNo, named.value, nextMax]
        );
        slotByKey.set(`${slot.type}-${slotNo}`, {
          id: insertedSlot[0].id,
          type: slot.type,
          slot_no: slotNo,
          name: named.value,
          max_score: nextMax,
        });
        if (nextMax !== null) slotSetChanged = true;
      }
    }

    const slotById = new Map([...slotByKey.values()].map((s) => [s.id, s]));

    // ---- learners whose stored grade must be recomputed ----
    //
    // ANY CHANGE TO THE SLOT SET RECOMPUTES THE WHOLE CLASS, not only the
    // learners who have a score in the slot that changed. Since 2026-09-22 a
    // used slot with no score makes that learner's group Pending, so giving
    // a column a highest possible score changes the grade of every learner
    // who has NOT been marked in it — which is precisely the set that has no
    // component row there and would never be found by looking for one.
    // Clearing an unused slot's maximum is the same move in reverse.
    //
    // NEVER A LOCKED ROW (fix/grade-locks): an HPS change is refused above
    // while one exists, so what reaches here is a re-sent column — and a
    // locked grade is not recomputed by anything this endpoint does.
    const affected = new Set();
    if (slotSetChanged) {
      const { rows } = await conn.query(
        'SELECT id FROM grades WHERE subject_id = ? AND term = ? AND school_year = ? AND is_locked = 0 AND student_id = ANY(?::int[])',
        [key.subjectId, key.term, key.schoolYear, students.length ? students.map((s) => s.id) : [0]]
      );
      for (const row of rows) affected.add(row.id);
    }

    // ---- the class-wide Summative maxima, fanned out ----
    //
    // EVERY ACTIVE LEARNER, NOT JUST THE ONES IN `entries`, and that is the
    // whole point of doing it here. A Summative is one paper sat by the
    // class, so setting its maximum in the grid header has to reach the
    // learner who has no score yet — otherwise the next teacher to type
    // their mark hits "a score needs a max, and this learner has none
    // stored yet", which is a confusing refusal for a value that was
    // visibly set on screen. A shell row is created where there is none,
    // the same way an entry does.
    //
    // A LOCKED learner is skipped rather than failing the save. Unlike a
    // score, this is not a change to their grade: it is the class's paper
    // being described, their own maximum is already whatever it was, and
    // blocking a class-wide header edit on one finalised learner would make
    // the header unusable at the end of a term. The locked-learner refusal
    // below still applies to anything in `entries`.
    if (examMaxIn) {
      const columns = [];
      const values = [];
      for (const part of ['st1', 'st2', 'te']) {
        if (examMaxIn[part] === undefined || examMaxIn[part] === null) continue;
        columns.push(`ex_${part}_max = ?`);
        values.push(examMaxIn[part]);
      }

      if (columns.length) {
        for (const student of students) {
          const { rows: gradeRows } = await conn.query(
            'SELECT id, is_locked FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ? LIMIT 1',
            [student.id, key.subjectId, key.term, key.schoolYear]
          );
          let gradeId = gradeRows[0]?.id;
          if (gradeRows[0]?.is_locked) continue;

          if (!gradeId) {
            const { rows: created } = await conn.query(
              'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES (?, ?, ?, ?) RETURNING id',
              [student.id, key.subjectId, key.term, key.schoolYear]
            );
            gradeId = created[0].id;
          }
          await conn.query(`UPDATE grades SET ${columns.join(', ')} WHERE id = ?`, [...values, gradeId]);
          affected.add(gradeId);
        }
      }
    }

    const lockedNames = [];
    for (const entry of entries) {
      const studentId = parseId(entry.student_id);
      const student = studentById.get(studentId);

      const { rows: gradeRows } = await conn.query(
        'SELECT * FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ? LIMIT 1',
        [studentId, key.subjectId, key.term, key.schoolYear]
      );
      let grade = gradeRows[0];

      if (grade && grade.is_locked) {
        // A LOCKED LEARNER FAILS THE WHOLE SAVE, naming them. A partial save
        // has no undo, and 39 saved with 1 silently skipped is the worst
        // outcome available. This should also be nearly unreachable: the read
        // endpoint returns is_locked per learner, so the grid disables those
        // cells before anyone types — the only way here is an admin locking
        // mid-edit, which is a race where stopping is correct.
        lockedNames.push(`${student.first_name} ${student.last_name}`);
        continue;
      }

      if (!grade) {
        const { rows: created } = await conn.query(
          'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES (?, ?, ?, ?) RETURNING id',
          [studentId, key.subjectId, key.term, key.schoolYear]
        );
        const { rows: freshRows } = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [created[0].id]);
        grade = freshRows[0];
      }

      let changed = false;

      for (const item of Array.isArray(entry.scores) ? entry.scores : []) {
        // Resolved by id when there is one, otherwise by the column's type
        // and number — which is how a score lands in a slot created earlier
        // in this same transaction. `slotByKey` holds both the pre-existing
        // slots and the ones just upserted.
        const slotId = parseId(item.slot_id);
        const slot =
          slotId !== null
            ? slotById.get(slotId)
            : slotByKey.get(`${item.type}-${Number(item.slot_no)}`);
        if (!slot) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message:
              slotId !== null
                ? `Slot #${slotId} does not belong to this class record.`
                : `There is no ${item.type} ${item.slot_no} column on this class record.`,
          });
        }
        if (slot.max_score === null) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `${slotDisplayLabel(slot.type, slot.slot_no, slot.name)} has no highest possible score yet — set one before recording marks in it.`,
          });
        }

        // slot.id, NOT slotId — a score that named its column by type and
        // number has no slotId, and the resolved slot is the only place the
        // real id exists.
        const { rows: existingRows } = await conn.query(
          'SELECT id FROM grade_components WHERE grade_id = ? AND slot_id = ? LIMIT 1',
          [grade.id, slot.id]
        );
        const existingComponent = existingRows[0];

        if (item.score === null) {
          if (existingComponent) {
            await conn.query('DELETE FROM grade_components WHERE id = ?', [existingComponent.id]);
            changed = true;
          }
          continue;
        }

        if (existingComponent) {
          await conn.query('UPDATE grade_components SET score = ?, max_score = ? WHERE id = ?', [
            item.score,
            slot.max_score,
            existingComponent.id,
          ]);
        } else {
          // label stays NULL: a slot-backed row renders the slot's
          // display_label, never a snapshot of it.
          await conn.query(
            'INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, label) VALUES (?, ?, ?, ?, ?, NULL)',
            [grade.id, slot.id, slot.type, item.score, slot.max_score]
          );
        }
        changed = true;
      }

      // The three Summative parts, reusing the same pairing rule PATCH
      // /:id/exam uses: score and max travel together, an explicit null on
      // either clears both.
      const examUpdates = {};
      for (const part of ['st1', 'st2', 'te']) {
        const scoreKey = `${part}_score`;
        const maxKey = `${part}_max`;
        const scoreSent = entry[scoreKey] !== undefined;
        const maxSent = entry[maxKey] !== undefined;
        if (!scoreSent && !maxSent) continue;

        if (scoreSent && maxSent && (entry[scoreKey] === null) !== (entry[maxKey] === null)) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `${part.toUpperCase()}: send a score and a max together, or null to clear both.`,
          });
        }
        if ((scoreSent && entry[scoreKey] === null) || (maxSent && entry[maxKey] === null)) {
          examUpdates[`ex_${part}`] = null;
          examUpdates[`ex_${part}_max`] = null;
        } else {
          const nextScore = scoreSent ? entry[scoreKey] : numOrNull(grade[`ex_${part}`]);
          const nextMax = maxSent ? entry[maxKey] : numOrNull(grade[`ex_${part}_max`]);
          if (nextScore === null || nextMax === null) {
            await conn.rollback();
            return res.status(400).json({
              success: false,
              message: `${part.toUpperCase()}: a score needs a max, and this learner has none stored yet.`,
            });
          }
          examUpdates[`ex_${part}`] = nextScore;
          examUpdates[`ex_${part}_max`] = nextMax;
        }
        changed = true;
      }

      if (Object.keys(examUpdates).length) {
        const sets = Object.keys(examUpdates).map((col) => `${col} = ?`).join(', ');
        await conn.query(`UPDATE grades SET ${sets} WHERE id = ?`, [...Object.values(examUpdates), grade.id]);
      }

      if (changed) affected.add(grade.id);
    }

    if (lockedNames.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: `Nothing was saved. ${lockedNames.join(', ')} ${
          lockedNames.length === 1 ? 'has a locked grade' : 'have locked grades'
        } for this subject and term — ask an admin to unlock before saving.`,
      });
    }

    // ---- recompute, only what changed ----
    const preflight = await preflightGradeWrite(
      { student_grade_level: key.gradeLevel, school_year: key.schoolYear, subject_id: key.subjectId, is_locked: 0 },
      'score'
    );
    if (preflight.errorStatus) {
      await conn.rollback();
      return res.status(preflight.errorStatus).json({ success: false, message: preflight.errorMessage });
    }

    // ONE shared pending array across every recompute, emitted once after
    // commit — a notification for a write that rolled back would be a lie.
    const notified = [];
    const results = [];
    for (const gradeId of affected) {
      const updated = await recomputeGrade(conn, gradeId, preflight.mode, dryRun ? null : notified, req.user.id);

      // The same three columns the GET returns, from the same two helpers.
      // A dry run must produce values the grid can display exactly as it
      // displays a saved one — a preview that omitted Total would leave a
      // column blanking and refilling as the teacher types, which reads as
      // a bug rather than as a preview.
      const { rows: rowComponents } = await conn.query(
        'SELECT type, score, max_score FROM grade_components WHERE grade_id = ?',
        [gradeId]
      );
      const wwTotals = componentTotals(rowComponents.filter((c) => c.type === 'WW'));
      const ptTotals = componentTotals(rowComponents.filter((c) => c.type === 'PT'));
      const exTotals = examTotals(updated);

      results.push({
        grade_id: updated.id,
        student_id: updated.student_id,
        ww_total: wwTotals.total,
        ww_total_max: wwTotals.total_max,
        ww_percentage: numOrNull(updated.ww_percentage),
        ww_weighted: numOrNull(updated.ww_weighted),
        pt_total: ptTotals.total,
        pt_total_max: ptTotals.total_max,
        pt_percentage: numOrNull(updated.pt_percentage),
        pt_weighted: numOrNull(updated.pt_weighted),
        ex_total: exTotals.total,
        ex_total_max: exTotals.total_max,
        ex_percentage: numOrNull(updated.ex_percentage),
        ex_weighted: numOrNull(updated.ex_weighted),
        initial_grade: numOrNull(updated.initial_grade),
        term_grade: numOrNull(updated.term_grade),
        descriptive_grade: updated.descriptive_grade,
      });
    }

    if (dryRun) {
      // group_hps BEFORE the rollback, so the preview's header row matches
      // the preview's learner values. Without it the grid showed the stored
      // totals in the HPS row while the learners below were already computed
      // against an unsaved maximum — 30 above, 45/40 = 112.50 beneath.
      const previewSlots = await loadSlots(conn, key);
      const previewUsedTotal = (type) =>
        previewSlots.filter((s) => s.type === type && s.max_score !== null).reduce((sum, s) => sum + s.max_score, 0) ||
        null;
      const { rows: previewExam } = await conn.query(
        `SELECT ex_st1_max AS st1, ex_st2_max AS st2, ex_te_max AS te FROM grades
          WHERE subject_id = ? AND term = ? AND school_year = ? AND student_id = ANY(?::int[])`,
        [key.subjectId, key.term, key.schoolYear, students.length ? students.map((s) => s.id) : [0]]
      );
      const previewExamTotal = previewExam.reduce((best, row) => {
        if (best !== null) return best;
        if (row.st1 === null || row.st2 === null || row.te === null) return null;
        return gc.roundTo2(Number(row.st1) + Number(row.st2) + Number(row.te));
      }, null);

      await conn.rollback();
      return res.json({
        success: true,
        dry_run: true,
        message: 'Nothing was saved. These are the values this save would produce.',
        group_hps: {
          ww: previewUsedTotal('WW'),
          pt: previewUsedTotal('PT'),
          ex: previewExamTotal,
        },
        slots: previewSlots,
        results,
      });
    }

    await conn.commit();
    emitNotifications(req, notified);

    await logActivity(
      req.user.id,
      'save_class_record',
      `Saved the class record for subject #${key.subjectId}, Grade ${key.gradeLevel} - ${key.section}, term ${key.term}: ${slots.length} slot(s), ${entries.length} learner(s), ${affected.size} grade(s) recomputed`
    );

    return res.json({
      success: true,
      slots: await loadSlots(pool, key),
      results,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // rollback failure is reported by the 500 below; swallowing it here
        // keeps the original error as the one the caller sees.
      }
    }
    console.error('Save class record error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save the class record.' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/grades/class-summary — the adviser's Summary of Grades (CR3)
// ---------------------------------------------------------------------------
// One learner per row, every subject across the row, the General Average at
// the end. This is the sheet an adviser compiles from the subject teachers'
// class records, and it is READ-ONLY on purpose: the adviser is not the
// encoder. Encode authority is the subject teacher's (teacherCanEncodeGrade),
// and nothing here writes.
//
// REGISTERED BEFORE `/:id`, like /class-record. Express matches in
// registration order, so moving this below `GET /:id` would make
// `class-summary` parse as an id, fail parseId() and answer 400. Do not
// reorder the handlers in this file.
//
// SCOPE IS ADVISER-ONLY, and it answers in three ways rather than two:
//   - the adviser of that section          -> 200
//   - a teacher in VIEW scope but not the adviser -> 403 naming the reason
//   - anyone else                          -> 404
// The 403 is not a widening of §2's "reads out of scope return 404". It is
// the same exception excuse-letter review and the five :id-keyed grades
// writes already take: a broader GET (the class record, the report card)
// ALREADY exposes this class to an assigned teacher, so a 404 here would be a
// lie and the 403 leaks nothing they could not already read.
//
// NO PAGINATION, deliberately, and this is the one list endpoint in the API
// without it. A Summary of Grades is a DOCUMENT — the adviser reads it against
// a paper form, and page 2 of a class is not a thing that exists on that form.
// A class is bounded by enrolment (~40), not by history, so the unbounded set
// is small by construction. That is the difference from every other list here,
// which grows without limit.
router.get('/class-summary', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const gradeLevel = Number(req.query.grade_level);
  const section = typeof req.query.section === 'string' ? req.query.section.trim() : '';
  const termRaw = typeof req.query.term === 'string' ? req.query.term.trim().toLowerCase() : '';

  if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 6) {
    return res.status(400).json({ success: false, message: 'grade_level must be a whole number from 1 to 6.' });
  }
  if (!section) {
    return res.status(400).json({ success: false, message: 'section is required.' });
  }
  if (!['1', '2', '3', 'final'].includes(termRaw)) {
    return res.status(400).json({ success: false, message: "term must be 1, 2, 3, or 'final'." });
  }
  const isFinal = termRaw === 'final';
  const term = isFinal ? null : Number(termRaw);

  let schoolYear = req.query.school_year;
  if (schoolYear === undefined) {
    const { rows: settingRows } = await pool.query(
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

  try {
    const { rows: sectionRows } = await pool.query(
      'SELECT sec.id, sec.grade_level, sec.name, sec.adviser_id, u.name AS adviser_name FROM sections sec LEFT JOIN users u ON u.id = sec.adviser_id WHERE sec.grade_level = ? AND sec.name = ? LIMIT 1',
      [gradeLevel, section]
    );
    const sectionRow = sectionRows[0];

    if (req.user.role === 'teacher') {
      const advises = sectionRow ? Number(sectionRow.adviser_id) === Number(req.user.id) : false;
      if (!advises) {
        // In view scope but not the adviser -> an informative 403. Outside it
        // entirely -> 404, which is also what a nonexistent section gets, so
        // probing cannot distinguish "no such class" from "not yours".
        const canView = await teacherCanViewGrade(req.user.id, gradeLevel, section);
        if (!canView || !sectionRow) {
          return res.status(404).json({ success: false, message: 'Class summary not found.' });
        }
        return res.status(403).json({
          success: false,
          message: `Only the adviser of Grade ${gradeLevel} - ${section} can open the class summary.`,
        });
      }
    } else if (!sectionRow) {
      return res.status(404).json({ success: false, message: 'Class summary not found.' });
    }

    const { rows: modeRows } = await pool.query(
      'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ? LIMIT 1',
      [gradeLevel, schoolYear]
    );
    if (!modeRows[0]) {
      return res.status(409).json({
        success: false,
        message: `No grading_mode_configs row exists for Grade ${gradeLevel}, school year ${schoolYear}. An admin must configure the grading mode before a class summary can be generated.`,
      });
    }
    const mode = modeRows[0].mode;

    // The school's printed order (CR3a). These are the COLUMNS of the sheet,
    // which is why alphabetical was not good enough here.
    const { rows: subjects } = await pool.query(
      `SELECT id, name, display_order FROM subjects
        WHERE grade_level = ?
        ORDER BY display_order IS NULL, display_order, name`,
      [gradeLevel]
    );

    const { rows: learners } = await pool.query(
      `SELECT id, first_name, last_name FROM students
        WHERE grade_level = ? AND section = ? AND status = 'active'
        ORDER BY last_name ASC, first_name ASC`,
      [gradeLevel, section]
    );

    const learnerIds = learners.map((l) => l.id);
    let gradeRows = [];
    if (learnerIds.length) {
      const { rows } = await pool.query(
        'SELECT * FROM grades WHERE student_id = ANY(?::int[]) AND school_year = ?',
        [learnerIds, schoolYear]
      );
      gradeRows = rows;
    }
    // The parents' confirmations for this term (feat/grade-acknowledgement) —
    // one query for the class, read only on a term sheet; the Final sheet has
    // no term to confirm.
    const acknowledgements = isFinal ? new Map() : await acknowledgementsFor(pool, learnerIds, schoolYear);

    const byStudent = new Map();
    for (const row of gradeRows) {
      if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, {});
      const bySubject = byStudent.get(row.student_id);
      if (!bySubject[row.subject_id]) bySubject[row.subject_id] = {};
      bySubject[row.subject_id][row.term] = row;
    }

    // Per subject: how many of this class's learners have THIS term recorded.
    // Counted, never concluded (§4) — the sheet says "N pending", never
    // "behind". Kept as recorded/total so the client renders the fraction
    // rather than a percentage nobody defined.
    const completeness = subjects.map((s) => ({ subject_id: s.id, recorded: 0, total: learners.length }));
    const completenessBySubject = new Map(completeness.map((c) => [c.subject_id, c]));

    const learnerRows = learners.map((learner) => {
      const bySubject = byStudent.get(learner.id) || {};

      // Built exactly as the report card builds it, through the same helpers,
      // so a learner's figure here and on their own card cannot disagree.
      const subjectReport = subjects.map((subject) => {
        const byTerm = bySubject[subject.id] || {};
        const terms = {
          1: buildTermEntry(byTerm[1], mode),
          2: buildTermEntry(byTerm[2], mode),
          3: buildTermEntry(byTerm[3], mode),
        };
        const { final_grade, final_grade_descriptor } =
          mode === 'descriptive' ? computeFinalLetter(terms, mode) : computeFinalGrade(terms, mode);
        return { subject_id: subject.id, subject_name: subject.name, terms, final_grade, final_grade_descriptor };
      });

      const cells = subjectReport.map((s) => {
        const entry = isFinal ? null : s.terms[term];
        const value = isFinal
          ? s.final_grade
          : mode === 'descriptive'
            ? (entry?.descriptive_grade ?? null)
            : (entry?.term_grade ?? null);
        const gradeId = isFinal ? null : (entry?.grade_id ?? null);
        const isLocked = isFinal ? null : (entry?.is_locked ?? null);
        if (value !== null && value !== undefined) {
          const c = completenessBySubject.get(s.subject_id);
          if (c) c.recorded += 1;
        }
        return {
          subject_id: s.subject_id,
          grade_id: gradeId,
          // A learner with no grade row is null — NEVER 0. Zero is a mark a
          // teacher gave; blank is a mark a teacher has not given yet.
          value: value ?? null,
          is_locked: isLocked,
        };
      });

      // Key Stage 1 has no General Average at all (GRADING_SPEC §6a) — the key
      // is ABSENT, not null, so a client cannot render "— Pending" for a
      // figure the school never computes.
      let generalAverage;
      if (mode !== 'descriptive') {
        generalAverage = isFinal
          ? computeGeneralAverage(subjectReport, mode).general_average
          : computeTermAverages(subjectReport, mode)[term];
      }

      const row = {
        student_id: learner.id,
        first_name: learner.first_name,
        last_name: learner.last_name,
        cells,
        // feat/grade-acknowledgement: whether this learner's term is fully
        // locked (every subject locked with a value — the bulk lock's test),
        // and the parent's confirmation of it. Both null on the Final sheet:
        // a Final has no term to lock or confirm.
        term_locked: isFinal
          ? null
          : termFullyLocked(
              Object.values(bySubject)
                .map((byTerm) => byTerm[term])
                .filter(Boolean),
              subjects.length
            ),
        acknowledged: isFinal ? null : (acknowledgements.get(`${learner.id}:${term}`) ?? null),
      };
      if (mode !== 'descriptive') row.general_average = generalAverage ?? null;
      return row;
    });

    return res.json({
      success: true,
      section: {
        grade_level: gradeLevel,
        name: section,
        adviser_id: sectionRow?.adviser_id ?? null,
        adviser_name: sectionRow?.adviser_name ?? null,
      },
      school_year: schoolYear,
      term: isFinal ? 'final' : term,
      grading_mode: mode,
      // TWO FLAGS, not one (§5a-v). A descriptive card has a Final LETTER and
      // no general average at all, so the single boolean they would otherwise
      // share puts a GA column on a Key Stage 1 sheet.
      show_final: isFinal,
      show_general_average: mode !== 'descriptive',
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, display_order: s.display_order })),
      learners: learnerRows,
      completeness,
    });
  } catch (error) {
    console.error('Get class summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load the class summary.' });
  }
});

// POST /api/grades/acknowledgements — parent only. "I HAVE SEEN THESE GRADES"
// (feat/grade-acknowledgement, 2026-10-21; the owner's Q1–Q5, Q10, Q11).
//
// Body { term, school_year? } — the learner is req.user.student_id, never a
// body or path value (THE AUTH PATTERN); the school year defaults to the
// `academic_year` setting, as the report card does. One row per (learner,
// school year, term), written only while the term is FULLY locked:
//   - not fully locked    -> 409 naming the term; nothing to confirm yet
//   - already confirmed   -> 200 "Already confirmed on <date>. Nothing changed."
//                            (a repeat is absorbed, not refused — §5e's
//                            confirmation step is on the client, once)
//   - first confirmation  -> 201, the row, one activity_logs row
//                            (`acknowledge_grades`), and the ADVISER's
//                            grades_acknowledged notification (Q5: the
//                            adviser of the learner's section, nobody else —
//                            the same authority routes/excuses.js uses; no
//                            adviser, no notification, as for a letter).
// Grade 1 confirms its letters the same way (Q10). Only an ACTIVE parent gets
// here (Q11) — authenticate refuses every other status before this runs.
//
// The parent is signalled too: their own grades_locked row self-heals in
// routes/notifications.js once the confirmation exists, and the bell must
// drop it live, the way a review signals the reviewer.
//
// Registered BEFORE `/locks` and `GET /:id`: a POST cannot match the id
// route, but ssr-grade-locks reads the locks handler as the slice from the
// locks route's registration line to the `GET /:id` comment, so nothing may
// sit between those two.
router.post('/acknowledgements', authenticate, authorize('parent'), async (req, res) => {
  const { term, school_year: schoolYearIn } = req.body || {};
  if (!isValidTerm(term)) {
    return res.status(400).json({ success: false, message: 'term must be 1, 2, or 3.' });
  }
  const termNum = Number(term);
  if (req.user.student_id == null) {
    return res.status(400).json({ success: false, message: 'Your account is not linked to a learner.' });
  }
  const studentId = Number(req.user.student_id);

  let conn;
  try {
    let schoolYear = schoolYearIn;
    if (schoolYear === undefined || schoolYear === null || schoolYear === '') {
      const { rows: settingRows } = await pool.query(
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

    const { rows: studentRows } = await pool.query('SELECT id, grade_level FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const acknowledgementOf = async (runner) => {
      const map = await acknowledgementsFor(runner, [studentId], schoolYear);
      const ack = map.get(`${studentId}:${termNum}`) ?? null;
      return ack ? { term: termNum, school_year: schoolYear, ...ack } : null;
    };

    // The repeat's answer: absorbed, not refused (§5e), from the committed row.
    const alreadyConfirmed = async () => {
      const acknowledgement = await acknowledgementOf(pool);
      return res.json({
        success: true,
        message: `Already confirmed on ${formatManilaDay(acknowledgement?.acknowledged_at)}. Nothing changed.`,
        acknowledgement,
      });
    };

    conn = await pool.connect();
    await conn.beginTransaction();

    const { rows: existingRows } = await conn.query(
      'SELECT id FROM grade_acknowledgements WHERE student_id = ? AND school_year = ? AND term = ? FOR UPDATE',
      [studentId, schoolYear, termNum]
    );
    if (existingRows.length) {
      await conn.rollback();
      return alreadyConfirmed();
    }

    const state = await loadTermLockState(conn, {
      studentId,
      gradeLevel: student.grade_level,
      term: termNum,
      schoolYear,
    });
    if (!state.fullyLocked) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: `Term ${termNum} is not locked yet — there is nothing to confirm.`,
      });
    }

    // TWO CONFIRMATIONS AT ONCE (F-2, D-267; p4b-concurrency.js C1). The FOR
    // UPDATE above locks nothing while the row does not exist yet: PostgreSQL
    // runs READ COMMITTED with no gap locks (MySQL's took one), the difference
    // utils/excuseAttendance.js:73-85 handles for the review. So two requests
    // can both reach this INSERT. The second waits on the first's key and,
    // once that commits, inserts nothing: that is the repeat, answered as one
    // (200), never the 500 its unique violation used to fall to. The conflict
    // target is uq_grade_ack_term's own columns, in its order.
    const { rows: inserted } = await conn.query(
      `INSERT INTO grade_acknowledgements (student_id, school_year, term, user_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (student_id, school_year, term) DO NOTHING
       RETURNING id`,
      [studentId, schoolYear, termNum, req.user.id]
    );
    if (!inserted.length) {
      await conn.rollback();
      return alreadyConfirmed();
    }
    const adviser = await excuseAdviserAudience(conn, studentId);
    const notified = await insertNotifications(conn, {
      type: 'grades_acknowledged',
      itemType: 'grade',
      itemId: state.itemId,
      actorId: req.user.id,
      titleSnapshot: null,
      userIds: adviser,
    });
    await conn.commit();

    await logActivity(
      req.user.id,
      'acknowledge_grades',
      `Confirmed Term ${termNum} grades for student #${studentId}, SY ${schoolYear}`
    );
    emitNotifications(req, [...notified, req.user.id]);

    const acknowledgement = await acknowledgementOf(pool);
    return res.status(201).json({ success: true, message: `Term ${termNum} grades confirmed.`, acknowledgement });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // the 500 below reports the failure
      }
    }
    console.error('Acknowledge grades error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to confirm the grades.' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/grades/locks — admin only. LOCK OR UNLOCK A WHOLE TERM AT ONCE
// (fix/grade-locks, 2026-10-13; the owner's Finding 1: locking one learner ×
// subject × term at a time is impractical across Grades 1–6).
//
// Body { lock, term, grade_level?, section?, dry_run? }: no grade level is the
// whole school; a section needs its grade level. The school year is the
// `academic_year` setting. `dry_run: true` answers the same counts and
// changes nothing — the preview the screens show before the one write.
//
// THE OWNER'S RULES (2026-10-13):
//   - ACTIVE learners only, for lock and unlock alike.
//   - LOCK takes a learner only when EVERY subject of their grade level has a
//     grade this term (`term_grade`, or `descriptive_grade` for Grade 1 —
//     the legacy letters count). Anyone else is skipped WHOLE and listed by
//     name and class with how many subjects are still Pending; nothing of
//     theirs is locked. The same reason the single lock has no completeness
//     gate applies the other way here: a bulk action must not finalise a
//     half-graded learner nobody looked at.
//   - UNLOCK has no completeness check: every locked row in scope.
//   - One activity_logs row per applied action that changed something
//     (scope + counts only — no names, no ids); none for a dry run or a
//     repeat, as the single lock writes none for "already locked".
//   - ONE notification, since feat/grade-acknowledgement (2026-10-21, the
//     owner's Q4): a learner whose term this lock completes — every subject
//     locked with a value — has their parent asked to confirm
//     (grades_locked, bell only); an unlock clears the term's confirmation
//     and both typed notifications (Q2). A lock is still not a publication:
//     nothing says what the grades are.
//   - Never an LRN: every SELECT below names its columns.
//
// Rows are read FOR UPDATE inside the transaction, so the counts the write
// acts on are the counts it reports — a preview taken earlier can be stale,
// and the screens show these numbers, not the preview's. IN ID ORDER AND OF g
// ONLY (D-267): PUT /class-record takes its class's grade rows the same way
// before its checks, so the two serialize and cannot deadlock. Without OF the
// lock also took FOR UPDATE on the students row of every grade row it held,
// and a save's new grades row needs FOR KEY SHARE on that learner's students
// row (its foreign key): the lock then held the learner while it waited for
// the save, and the save waited for the lock (p4b-concurrency.js C3d, 40P01).
// Nothing here needs a students row locked; the learners are a plain read.
router.post('/locks', authenticate, authorize('admin'), async (req, res) => {
  const { lock, term, grade_level: gradeLevelIn, section: sectionIn, dry_run: dryRunIn } = req.body || {};

  if (typeof lock !== 'boolean') {
    return res.status(400).json({ success: false, message: 'lock must be true or false.' });
  }
  if (!isValidTerm(term)) {
    return res.status(400).json({ success: false, message: 'term must be 1, 2, or 3.' });
  }
  // Strict: a string "true" must never be read as "apply".
  if (dryRunIn !== undefined && typeof dryRunIn !== 'boolean') {
    return res.status(400).json({ success: false, message: 'dry_run must be true or false.' });
  }
  let gradeLevel = null;
  if (gradeLevelIn !== undefined && gradeLevelIn !== null && gradeLevelIn !== '') {
    const n = Number(gradeLevelIn);
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      return res.status(400).json({ success: false, message: 'grade_level must be a whole number from 1 to 6.' });
    }
    gradeLevel = n;
  }
  let section = null;
  if (sectionIn !== undefined && sectionIn !== null && sectionIn !== '') {
    if (typeof sectionIn !== 'string' || !sectionIn.trim()) {
      return res.status(400).json({ success: false, message: 'section must be a section name.' });
    }
    if (gradeLevel === null) {
      return res.status(400).json({ success: false, message: 'A section needs a grade level.' });
    }
    section = sectionIn.trim();
  }
  const termNum = Number(term);
  const dryRun = dryRunIn === true;

  let conn;
  try {
    const { rows: settingRows } = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
    );
    const schoolYear = settingRows[0]?.setting_value;
    if (!schoolYear) {
      return res.status(500).json({ success: false, message: 'academic_year is not configured in system settings.' });
    }
    if (section !== null) {
      const { rows: sectionRows } = await pool.query(
        'SELECT 1 FROM sections WHERE grade_level = ? AND name = ? AND school_year = ? LIMIT 1',
        [gradeLevel, section, schoolYear]
      );
      if (!sectionRows.length) {
        return res.status(400).json({
          success: false,
          message: `There is no Grade ${gradeLevel} - ${section} section for ${schoolYear}.`,
        });
      }
    }

    // The scope, on the VARCHAR class columns like every other grades reader.
    const scope = ["st.status = 'active'"];
    const scopeParams = [];
    if (gradeLevel !== null) {
      scope.push('st.grade_level = ?');
      scopeParams.push(gradeLevel);
    }
    if (section !== null) {
      scope.push('st.section = ?');
      scopeParams.push(section);
    }
    const scopeSql = scope.join(' AND ');

    conn = await pool.connect();
    await conn.beginTransaction();

    const { rows: learnerRows } = await conn.query(
      `SELECT st.id, st.first_name, st.last_name, st.grade_level, st.section
         FROM students st
        WHERE ${scopeSql}
        ORDER BY st.grade_level, st.section, st.last_name, st.first_name, st.id`,
      scopeParams
    );
    const { rows: subjectCounts } = await conn.query('SELECT grade_level, COUNT(*) AS n FROM subjects GROUP BY grade_level');
    const subjectsByGrade = new Map(subjectCounts.map((r) => [Number(r.grade_level), Number(r.n)]));
    const { rows: gradeRows } = await conn.query(
      `SELECT g.id, g.student_id, g.subject_id, g.is_locked,
              (g.term_grade IS NOT NULL OR g.descriptive_grade IS NOT NULL) AS has_value
         FROM grades g
         JOIN students st ON st.id = g.student_id
        WHERE g.term = ? AND g.school_year = ? AND ${scopeSql}
        ORDER BY g.id
        ${dryRun ? '' : 'FOR UPDATE OF g'}`,
      [termNum, schoolYear, ...scopeParams]
    );
    const rowsByLearner = new Map();
    for (const row of gradeRows) {
      if (!rowsByLearner.has(row.student_id)) rowsByLearner.set(row.student_id, []);
      rowsByLearner.get(row.student_id).push(row);
    }

    const targetIds = [];
    const changedLearners = new Set();
    const skipped = [];
    let learnersReady = 0;
    let recordsAlready = 0;
    for (const learner of learnerRows) {
      const rows = rowsByLearner.get(learner.id) || [];
      if (lock) {
        const subjects = subjectsByGrade.get(Number(learner.grade_level)) || 0;
        const graded = new Set(rows.filter((r) => Number(r.has_value) === 1).map((r) => r.subject_id)).size;
        if (subjects === 0 || graded < subjects) {
          skipped.push({
            student_id: learner.id,
            name: `${learner.last_name}, ${learner.first_name}`,
            grade_level: Number(learner.grade_level),
            section: learner.section,
            pending: subjects - graded,
            subjects,
          });
          continue;
        }
        learnersReady += 1;
        for (const row of rows) {
          if (Number(row.is_locked) === 1) {
            recordsAlready += 1;
          } else {
            targetIds.push(row.id);
            changedLearners.add(learner.id);
          }
        }
      } else {
        for (const row of rows) {
          if (Number(row.is_locked) === 1) {
            targetIds.push(row.id);
            changedLearners.add(learner.id);
          }
        }
      }
    }

    // THE CONFIRMATIONS AN UNLOCK CLEARS (feat/grade-acknowledgement, the
    // owner's Q2): a learner whose term is unlocked — any row of it — loses
    // the parent's confirmation, and the dry run counts them first so the
    // preview can say so. A lock clears nothing (0).
    const changedIds = [...changedLearners];
    let acknowledgementsCleared = 0;
    if (!lock && changedIds.length) {
      const {
        rows: [{ n }],
      } = await conn.query(
        'SELECT COUNT(*) AS n FROM grade_acknowledgements WHERE student_id = ANY(?::int[]) AND school_year = ? AND term = ?',
        [changedIds, schoolYear, termNum]
      );
      acknowledgementsCleared = Number(n);
    }
    // Whom to signal once the write is durable (emit after commit, always).
    const signal = [];

    let recordsChanged = targetIds.length;
    if (dryRun) {
      await conn.rollback();
    } else {
      if (targetIds.length) {
        const next = lock ? 1 : 0;
        // The guarded UPDATE stays (migration/docs/03 §4, measured race-safe);
        // rowCount is the matched rows, the meaning affectedRows had here.
        const result = await conn.query('UPDATE grades SET is_locked = ? WHERE id = ANY(?::int[]) AND is_locked <> ?', [
          next,
          targetIds,
          next,
        ]);
        recordsChanged = result.rowCount;
      }
      if (lock) {
        // Every learner this lock changed is now FULLY locked — it took them
        // only when every subject had a value, and it locked every row — so
        // each one's parent is asked to confirm (Q4). The term's lowest grade
        // id is the key. Best effort, like every fan-out: a failed insert
        // must not undo the lock.
        //
        // A SAVEPOINT ON POSTGRESQL. A failed statement aborts the whole
        // transaction there (MySQL kept it open), and the COMMIT below would
        // then roll the lock back while this handler reported it — so the hook
        // runs inside its own savepoint, and a failure rolls back to it,
        // leaving the lock intact. The recipients are pushed only after the
        // savepoint is released, so a rolled-back insert signals nobody.
        await conn.query('SAVEPOINT grades_locked_hook');
        try {
          const hookSignal = [];
          for (const studentId of changedIds) {
            const rows = rowsByLearner.get(studentId) || [];
            const itemId = rows.length ? Math.min(...rows.map((r) => Number(r.id))) : null;
            hookSignal.push(...(await notifyGradesLocked(conn, { studentId, itemId, actorId: req.user.id })));
          }
          await conn.query('RELEASE SAVEPOINT grades_locked_hook');
          signal.push(...hookSignal);
        } catch (hookError) {
          await conn.query('ROLLBACK TO SAVEPOINT grades_locked_hook');
          console.error('Bulk grade lock notification error:', hookError.code || hookError.message);
        }
      } else {
        // The clear is part of the unlock's meaning, so it is INSIDE the
        // transaction: an unlock that could not clear the confirmation does
        // not happen.
        acknowledgementsCleared = 0;
        for (const studentId of changedIds) {
          const rows = rowsByLearner.get(studentId) || [];
          const itemId = rows.length ? Math.min(...rows.map((r) => Number(r.id))) : null;
          const { cleared, recipients } = await clearTermAcknowledgement(conn, {
            studentId,
            term: termNum,
            schoolYear,
            itemId,
          });
          acknowledgementsCleared += cleared;
          signal.push(...recipients);
        }
      }
      await conn.commit();
    }

    const scopeLabel =
      section !== null ? `Grade ${gradeLevel} - ${section}` : gradeLevel !== null ? `Grade ${gradeLevel}` : 'the whole school';
    if (!dryRun && recordsChanged > 0) {
      await logActivity(
        req.user.id,
        lock ? 'bulk_grade_lock' : 'bulk_grade_unlock',
        `${lock ? 'Locked' : 'Unlocked'} ${recordsChanged} grade record(s) for ${changedLearners.size} learner(s) — Term ${termNum}, SY ${schoolYear}, ${scopeLabel}${
          lock ? `; ${skipped.length} learner(s) skipped` : ''
        }`
      );
    }
    if (!dryRun && acknowledgementsCleared > 0) {
      await logActivity(
        req.user.id,
        'grade_acknowledgement_cleared',
        `Cleared ${acknowledgementsCleared} parent confirmation(s) by unlocking — Term ${termNum}, SY ${schoolYear}, ${scopeLabel}`
      );
    }
    if (!dryRun) emitNotifications(req, signal);

    let message = 'Preview only — nothing was changed.';
    if (!dryRun) {
      message = recordsChanged > 0 ? `${lock ? 'Locked' : 'Unlocked'} ${recordsChanged} grade record(s).` : 'Nothing changed.';
    }
    return res.json({
      success: true,
      message,
      dry_run: dryRun,
      lock,
      scope: { school_year: schoolYear, term: termNum, grade_level: gradeLevel, section },
      learners: learnerRows.length,
      learners_ready: lock ? learnersReady : null,
      learners_changed: changedLearners.size,
      records_changed: recordsChanged,
      records_already: lock ? recordsAlready : 0,
      // feat/grade-acknowledgement: the parent confirmations this unlock
      // clears (a dry run counts them; a lock sends 0).
      acknowledgements_cleared: acknowledgementsCleared,
      skipped,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // the 500 below reports the failure
      }
    }
    console.error('Bulk grade lock error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to update grade locks.' });
  } finally {
    if (conn) conn.release();
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
      const { rows } = await pool.query(
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

    // display_label is resolved HERE, on the server, and joined from the
    // slot — the parent breakdown modal reads this endpoint and must show
    // the column's name ("Long quiz") or its fallback ("Written Work 1"),
    // never a raw NULL label. Legacy rows have no slot: they fall back to
    // the label they were written with, so an old row still reads the way
    // it always did. The ordering adds slot type and number so a card
    // reads down the class record rather than by whenever a score happened
    // to be typed.
    //
    // ON POSTGRESQL (Phase 3, review finding grades-1): a legacy row has no
    // slot, so s.type and s.slot_no are NULL, and date_recorded may be. MySQL
    // put NULLs FIRST ascending and PostgreSQL puts them last, so each nullable
    // key says NULLS FIRST — legacy rows still lead the card. s.type is the
    // enum portal.component_type, declared ('WW', 'PT') as MySQL's ENUM was,
    // so it sorts by declaration order on both.
    const { rows: componentRows } = await pool.query(
      `SELECT c.*, s.name AS slot_name, s.slot_no, s.type AS slot_type
         FROM grade_components c
         LEFT JOIN assessment_slots s ON s.id = c.slot_id
        WHERE c.grade_id = ?
        ORDER BY s.type ASC NULLS FIRST, s.slot_no ASC NULLS FIRST, c.date_recorded ASC NULLS FIRST, c.id ASC`,
      [gradeId]
    );
    const components = componentRows.map((row) => ({
      ...row,
      display_label: row.slot_id
        ? slotDisplayLabel(row.slot_type, row.slot_no, row.slot_name)
        : row.label || `${row.type === 'WW' ? 'Written Work' : 'Performance Task'}`,
    }));

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
    const { rows: studentRows } = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
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
      const { rows: settingRows } = await pool.query(
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

    const { rows: modeRows } = await pool.query(
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

    // THE PRINTED ORDER, and the client may not reorder this (CR3a).
    // `display_order IS NULL` first is the null-last idiom — MySQL sorts NULL
    // FIRST by default, so without it Grades 2 and 3, which have no recorded
    // order, would come back with the unordered rows leading. A grade level
    // with no order recorded falls back to name ASC, which is what the report
    // card did for every grade level before this column existed.
    const { rows: subjects } = await pool.query(
      `SELECT id, name, display_order FROM subjects
        WHERE grade_level = ?
        ORDER BY display_order IS NULL, display_order, name`,
      [student.grade_level]
    );

    const { rows: gradeRows } = await pool.query('SELECT * FROM grades WHERE student_id = ? AND school_year = ?', [
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
      // One of the two returns a value and the other returns nulls — each
      // short-circuits on the mode it does not serve — so the merge is
      // unambiguous and a mode can never produce two finals.
      const { final_grade, final_grade_descriptor } =
        mode === 'descriptive' ? computeFinalLetter(terms, mode) : computeFinalGrade(terms, mode);
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
    const term_average_descriptors = computeTermAverageDescriptors(term_averages);

    // PER TERM: is it fully locked, and has the parent confirmed it
    // (feat/grade-acknowledgement, 2026-10-21). ALWAYS PRESENT, all three
    // keys, for every reader — the parent's card shows the ask and the
    // confirmation, the adviser's and the admin's show the date. `locked`
    // is the bulk lock's own test (every subject locked with a value), read
    // off the rows already loaded; the confirmations are one query. The name
    // is the confirming account's `users.name` — never a login id (§5c).
    const termAcks = await acknowledgementsFor(pool, [studentId], schoolYear);
    const acknowledgements = {};
    for (const term of [1, 2, 3]) {
      const ack = termAcks.get(`${studentId}:${term}`) ?? null;
      acknowledgements[term] = {
        locked: termFullyLocked(
          gradeRows.filter((row) => Number(row.term) === term),
          subjects.length
        ),
        acknowledged_at: ack ? ack.acknowledged_at : null,
        by_name: ack ? ack.by_name : null,
      };
    }

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
      term_average_descriptors,
      general_average,
      general_average_descriptor,
      acknowledgements,
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
    const { rows: subjectRows } = await pool.query('SELECT * FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
    const subject = subjectRows[0];
    if (!subject) {
      return res.status(400).json({ success: false, message: 'subject_id does not reference an existing subject.' });
    }

    const { rows: studentRows } = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
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

    const { rows: existing } = await pool.query(
      'SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ? LIMIT 1',
      [studentId, subjectId, termNum, school_year]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'A grade record already exists for this student, subject, term, and school year.',
      });
    }

    const { rows: created } = await pool.query(
      'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES (?, ?, ?, ?) RETURNING id',
      [studentId, subjectId, termNum, school_year]
    );

    const { rows } = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [created[0].id]);
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

  const { type, score, max_score, label, date_recorded, slot_id } = req.body;

  if (type !== 'WW' && type !== 'PT') {
    return res.status(400).json({ success: false, message: "type must be 'WW' or 'PT'." });
  }
  // REQUIRED since CR1 (2026-09-22). Every component belongs to a class
  // assessment slot; a score with no column is a score nobody can find on
  // the class record. Legacy rows keep slot_id NULL and are never
  // back-filled, but nothing new may be written without one.
  const slotId = parseId(slot_id);
  if (slotId === null) {
    return res.status(400).json({
      success: false,
      message: 'slot_id is required — a score must belong to an assessment slot on the class record.',
    });
  }
  if (!isValidScore(score)) {
    return res.status(400).json({ success: false, message: 'score must be 0 or greater.' });
  }
  // AFTER the range check, deliberately: -1.5 fails both, and "0 or greater"
  // is the more fundamental thing wrong with it. Only a value that is
  // otherwise valid gets told it is not a whole number.
  if (!isWholeNumber(score)) {
    return res.status(400).json({ success: false, message: wholeNumberMessage('score', score) });
  }
  if (!isValidMax(max_score)) {
    return res.status(400).json({ success: false, message: 'max_score must be greater than 0.' });
  }
  if (!isWholeNumber(max_score)) {
    return res.status(400).json({ success: false, message: wholeNumberMessage('max_score', max_score) });
  }
  // `label` is now OPTIONAL and the column is nullable (CR1). A slot-backed
  // row leaves it NULL and renders the slot's display_label instead; it used
  // to be required because a component had no other way to identify itself.
  if (label !== undefined && label !== null && !String(label).trim()) {
    return res.status(400).json({ success: false, message: 'label must not be blank if it is sent.' });
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

    // AFTER the scope check, deliberately, and for the same reason the
    // grade-level mismatch check is: an out-of-scope teacher must not learn
    // anything about another class by probing slot ids.
    const slotCheck = await loadSlotForGrade(slotId, loaded.grade, type);
    if (slotCheck.errorStatus) {
      return res.status(slotCheck.errorStatus).json({ success: false, message: slotCheck.errorMessage });
    }

    const preflight = await preflightGradeWrite(loaded.grade, 'score');
    if (preflight.errorStatus) {
      return res.status(preflight.errorStatus).json({ success: false, message: preflight.errorMessage });
    }

    conn = await pool.connect();
    await conn.beginTransaction();

    const { rows: insertedComponent } = await conn.query(
      'INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, label, date_recorded) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [gradeId, slotId, type, score, max_score, label ?? null, date_recorded || null]
    );

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, preflight.mode, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    const { rows: componentRows } = await pool.query('SELECT * FROM grade_components WHERE id = ? LIMIT 1', [
      insertedComponent[0].id,
    ]);
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

  const { type, score, max_score, label, date_recorded, slot_id } = req.body;

  const touchesAny =
    type !== undefined ||
    score !== undefined ||
    max_score !== undefined ||
    label !== undefined ||
    date_recorded !== undefined ||
    slot_id !== undefined;
  if (!touchesAny) {
    return res.status(400).json({ success: false, message: 'At least one field must be provided.' });
  }

  if (type !== undefined && type !== 'WW' && type !== 'PT') {
    return res.status(400).json({ success: false, message: "type must be 'WW' or 'PT'." });
  }
  if (score !== undefined && !isValidScore(score)) {
    return res.status(400).json({ success: false, message: 'score must be 0 or greater.' });
  }
  if (score !== undefined && !isWholeNumber(score)) {
    return res.status(400).json({ success: false, message: wholeNumberMessage('score', score) });
  }
  if (max_score !== undefined && !isValidMax(max_score)) {
    return res.status(400).json({ success: false, message: 'max_score must be greater than 0.' });
  }
  if (max_score !== undefined && !isWholeNumber(max_score)) {
    return res.status(400).json({ success: false, message: wholeNumberMessage('max_score', max_score) });
  }
  if (label !== undefined && label !== null && !String(label).trim()) {
    return res.status(400).json({ success: false, message: 'label must not be blank if it is sent.' });
  }
  if (date_recorded !== undefined && date_recorded !== null && !isValidDateFormat(date_recorded)) {
    return res.status(400).json({ success: false, message: 'date_recorded must be in YYYY-MM-DD format.' });
  }
  // slot_id is OPTIONAL on an edit — the row already has one — but it can
  // never be cleared. Sending it MOVES the score to another column of the
  // same class, which is a legitimate correction (a mark typed into
  // Written Work 2 that belonged in Written Work 3); sending null is not,
  // because a component with no slot is exactly the state CR1 removed.
  if (slot_id === null) {
    return res.status(400).json({
      success: false,
      message: 'slot_id cannot be cleared — every score belongs to an assessment slot.',
    });
  }
  const newSlotId = slot_id === undefined ? null : parseId(slot_id);
  if (slot_id !== undefined && newSlotId === null) {
    return res.status(400).json({ success: false, message: 'Invalid slot_id.' });
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

    const preflight = await preflightGradeWrite(loaded.grade, 'score');
    if (preflight.errorStatus) {
      return res.status(preflight.errorStatus).json({ success: false, message: preflight.errorMessage });
    }

    const { rows: componentRows } = await pool.query('SELECT * FROM grade_components WHERE id = ? AND grade_id = ? LIMIT 1', [
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

    // A move is validated against the SAME class rules as a create — the
    // slot must belong to this grade's class and match the component's
    // type. `type` is immutable (above), so `existing.type` is the right
    // thing to check against.
    if (newSlotId !== null) {
      const slotCheck = await loadSlotForGrade(newSlotId, loaded.grade, existing.type);
      if (slotCheck.errorStatus) {
        return res.status(slotCheck.errorStatus).json({ success: false, message: slotCheck.errorMessage });
      }
    }

    const nextScore = score !== undefined ? score : existing.score;
    const nextMax = max_score !== undefined ? max_score : existing.max_score;
    const nextLabel = label !== undefined ? label : existing.label;
    const nextDateRecorded = date_recorded !== undefined ? date_recorded || null : existing.date_recorded;
    const nextSlotId = newSlotId !== null ? newSlotId : existing.slot_id;

    conn = await pool.connect();
    await conn.beginTransaction();

    await conn.query(
      'UPDATE grade_components SET score = ?, max_score = ?, label = ?, date_recorded = ?, slot_id = ? WHERE id = ?',
      [nextScore, nextMax, nextLabel, nextDateRecorded, nextSlotId, componentId]
    );

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, preflight.mode, notified, req.user.id);

    await conn.commit();
    emitNotifications(req, notified);

    const { rows: updatedComponentRows } = await pool.query('SELECT * FROM grade_components WHERE id = ? LIMIT 1', [componentId]);
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

    const preflight = await preflightGradeWrite(loaded.grade, 'score');
    if (preflight.errorStatus) {
      return res.status(preflight.errorStatus).json({ success: false, message: preflight.errorMessage });
    }

    const { rows: componentRows } = await pool.query('SELECT id, type FROM grade_components WHERE id = ? AND grade_id = ? LIMIT 1', [
      componentId,
      gradeId,
    ]);
    const existing = componentRows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Component not found.' });
    }

    conn = await pool.connect();
    await conn.beginTransaction();

    await conn.query('DELETE FROM grade_components WHERE id = ?', [componentId]);

    const notified = [];
    const updatedGrade = await recomputeGrade(conn, gradeId, preflight.mode, notified, req.user.id);

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

  // WHOLE NUMBERS, all six fields (2026-09-22). A loop rather than six more
  // `if` blocks beside the six above: the range checks differ per field
  // (score >= 0 vs max > 0) and have to stay separate, but this rule is
  // identical for all six, and six copies of one rule is how the seventh
  // gets forgotten. Runs AFTER the range checks for the same reason as on
  // the component endpoints. `null` is skipped — an explicit null clears a
  // sub-test and is not a score.
  for (const [field, value] of [
    ['st1_score', st1_score],
    ['st1_max', st1_max],
    ['st2_score', st2_score],
    ['st2_max', st2_max],
    ['te_score', te_score],
    ['te_max', te_max],
  ]) {
    if (value !== undefined && value !== null && !isWholeNumber(value)) {
      return res.status(400).json({ success: false, message: wholeNumberMessage(field, value) });
    }
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

    const preflight = await preflightGradeWrite(grade, 'score');
    if (preflight.errorStatus) {
      return res.status(preflight.errorStatus).json({ success: false, message: preflight.errorMessage });
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

    conn = await pool.connect();
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
    const updatedGrade = await recomputeGrade(conn, gradeId, preflight.mode, notified, req.user.id);

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

// PATCH /api/grades/:id/descriptive — RETIRED 2026-09-22.
//
// It existed because the Grade 1 letter was believed to be a manual teacher
// judgment — and that belief was recorded honestly, as an assumption rather
// than a school answer, precisely so it could be overturned. The school
// answered on 2026-09-22: the letter is COMPUTED, from WW 30 / PT 50 /
// Summative 20 banded on the raw weighted score (GRADING_SPEC §6a). A hand-
// picked letter is no longer a thing the system has.
//
// So there is now ONE write path for every grade level: record WW, PT and
// the Summative through the same endpoints Grades 2-6 use, and
// recomputeGrade writes a number or a letter depending on the mode. Keeping
// this endpoint alongside that would mean two writers for one column, where
// the last one wins and neither knows about the other.
//
// Its notification fan-out went with it. recomputeGrade now fires
// grade_available for both modes (see the hook there), so a letter still
// reaches the parent — through the one path, once.
//
// A legacy row (a letter typed before the rule, with no scores behind it)
// keeps its letter only until something recomputes it: an HPS or a
// Summative-maximum save on its class (PUT /class-record fans out to every
// unlocked row of that subject and term) rewrites it to NULL — Pending —
// until every score is in. It cannot be edited back by hand, the accepted
// cost of one write path. The seed holds none since B7 (D-102): Nino's five
// letters carry scores (scripts/demoGrade1.js).
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
    const { rows: gradeRows } = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
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
    const result = await pool.query('UPDATE grades SET is_locked = ? WHERE id = ? AND is_locked <> ?', [
      next,
      gradeId,
      next,
    ]);

    const { rows: updatedRows } = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);

    if (result.rowCount === 0) {
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

    // THE TERM'S CONFIRMATION FOLLOWS THE SINGLE LOCK TOO (feat/grade-
    // acknowledgement, 2026-10-21). A lock that completes the term — every
    // subject now locked with a value — asks the parent to confirm (Q4, once:
    // ON CONFLICT DO NOTHING); an unlock of any row of the term clears the
    // confirmation and both typed notifications (Q2) and says so in
    // activity_logs. Best effort after the lock is written and logged: a
    // failure here is reported, never a 500 for a lock that happened.
    try {
      const { rows: studentRows } = await pool.query('SELECT grade_level FROM students WHERE id = ? LIMIT 1', [grade.student_id]);
      const gradeLevel = studentRows[0]?.grade_level;
      const state = await loadTermLockState(pool, {
        studentId: grade.student_id,
        gradeLevel,
        term: grade.term,
        schoolYear: grade.school_year,
      });
      if (next === 1) {
        if (state.fullyLocked) {
          const notified = await notifyGradesLocked(pool, {
            studentId: grade.student_id,
            itemId: state.itemId,
            actorId: req.user.id,
          });
          emitNotifications(req, notified);
        }
      } else {
        const { cleared, recipients } = await clearTermAcknowledgement(pool, {
          studentId: grade.student_id,
          term: grade.term,
          schoolYear: grade.school_year,
          itemId: state.itemId,
        });
        if (cleared > 0) {
          await logActivity(
            req.user.id,
            'grade_acknowledgement_cleared',
            `Cleared the parent confirmation of Term ${grade.term}, SY ${grade.school_year}, for student #${grade.student_id} by unlocking grade #${gradeId}`
          );
        }
        emitNotifications(req, recipients);
      }
    } catch (hookError) {
      console.error('Grade lock acknowledgement hook error:', hookError.code || hookError.message);
    }

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
    const { rows: gradeRows } = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
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

    // The row and its `grade_available` notifications go together, then the
    // parent's bell refetches (fix/server-reliability, 2026-09-30 — the same
    // rule as the content deletes; no screen surfaces this endpoint).
    const conn = await pool.connect();
    let recipients = [];
    try {
      await conn.beginTransaction();
      recipients = await removeItemNotifications(conn, 'grade', gradeId);
      await conn.query('DELETE FROM grades WHERE id = ?', [gradeId]);
      await conn.commit();
    } catch (error) {
      await conn.rollback().catch(() => {});
      throw error;
    } finally {
      conn.release();
    }
    emitNotifications(req, recipients);
    await logActivity(req.user.id, 'delete_grade', `Deleted grade #${gradeId}`);

    return res.json({ success: true, message: 'Grade record deleted.' });
  } catch (error) {
    console.error('Delete grade error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete grade.' });
  }
});

module.exports = router;
