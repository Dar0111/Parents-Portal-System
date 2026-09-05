const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { isValidDateFormat } = require('../utils/dateFormat');
const gc = require('../utils/gradeComputation');

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

// Loads an existing grade row by id and confirms the requester may act on
// it, for the two :id-keyed write endpoints below (components, exam).
// Out-of-scope is 404 here, NOT 403 — this is deliberately provisional
// and different from POST / above (which uses 403, since it names a new
// target explicitly). No GET /api/grades exists yet, so nothing else in
// the system lets a teacher see a grade row they can't encode; 404 is a
// true "cannot see this" signal, same as PUT /api/attendance/:id. If
// Stage G3 ever gives teachers broader read access to grades than their
// subject-specific encode-scope, this needs the same reconsideration
// Excuse Letters' review endpoint got — see CLAUDE.md's Grades module note.
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

  if (req.user.role !== 'admin') {
    const allowed = await teacherCanEncodeGrade(
      req.user.id,
      grade.subject_id,
      grade.student_grade_level,
      grade.student_section
    );
    if (!allowed) {
      return { errorStatus: 404, errorMessage: 'Grade record not found.' };
    }
  }

  return { grade };
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
async function recomputeGrade(conn, gradeId) {
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

  const [updatedRows] = await conn.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
  return updatedRows[0];
}

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

    const updatedGrade = await recomputeGrade(conn, gradeId);

    await conn.commit();

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

    const updatedGrade = await recomputeGrade(conn, gradeId);

    await conn.commit();

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

    const updatedGrade = await recomputeGrade(conn, gradeId);

    await conn.commit();

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

    const updatedGrade = await recomputeGrade(conn, gradeId);

    await conn.commit();

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

    const preflightError = await preflightGradeWrite(loaded.grade, 'descriptive');
    if (preflightError) {
      return res.status(preflightError.errorStatus).json({ success: false, message: preflightError.errorMessage });
    }

    await pool.query('UPDATE grades SET descriptive_grade = ? WHERE id = ?', [descriptive_grade, gradeId]);

    const [updatedRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);
    await logActivity(
      req.user.id,
      'record_descriptive_grade',
      `Set descriptive_grade to ${descriptive_grade === null ? 'NULL (cleared)' : descriptive_grade} for grade #${gradeId}`
    );

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
    // logActivity on every toggle (below) is the real safety rail.
    await pool.query('UPDATE grades SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, gradeId]);

    const [updatedRows] = await pool.query('SELECT * FROM grades WHERE id = ? LIMIT 1', [gradeId]);

    await logActivity(
      req.user.id,
      'update_grade_lock',
      `Set is_locked for grade #${gradeId} from ${grade.is_locked} to ${is_locked ? 1 : 0}`
    );

    return res.json({ success: true, message: 'Grade lock updated.', grade: updatedRows[0] });
  } catch (error) {
    console.error('Update grade lock error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update grade lock.' });
  }
});

module.exports = router;
