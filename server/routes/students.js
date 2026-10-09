const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');
const { validateLrn } = require('../utils/lrnRule');
const { readListParams, pageMeta } = require('../utils/pagination');

const router = express.Router();

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

// NO LONGER COLLECTED (feat/privacy, 2026-10-10, the owner's decision 6). The
// learner's birthday, gender, address and contact number were stored and
// shown on the student record, and no feature ever used them. POST and PUT
// refuse a VALUE for any of them — 400 naming the field, so a caller learns
// the field is gone instead of believing it was saved — and ignore a key
// that is null or empty, so a client echoing an old row is not broken. The
// columns stay (NULL-able); db:migrate:privacy cleared what was stored.
const RETIRED_FIELDS = [
  ['birthday', 'birthday'],
  ['gender', 'gender'],
  ['address', 'address'],
  ['contact_number', 'contact number'],
];

function refuseRetiredFields(body) {
  for (const [field, label] of RETIRED_FIELDS) {
    const value = body?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return { error: `The learner's ${label} is no longer collected.`, field };
    }
  }
  return null;
}

// Every student row this router returns leaves the four out, so a value
// brought back by restoring a pre-privacy backup is still never served.
function publicStudent(row) {
  if (!row) return row;
  const copy = { ...row };
  for (const [field] of RETIRED_FIELDS) delete copy[field];
  return copy;
}

// The parent account linked to a student, for GET /:id (teacher and admin
// only). Student detail hides "Create parent account" when one exists and
// says its status — before this the client could not know, and the button was
// a dead end ending in the server's 409 (KNOWN ISSUES, 2026-09-18). One
// account per student is a LOCKED decision, so LIMIT 1 is the whole story.
async function parentAccountFor(studentId) {
  const [rows] = await pool.query(
    `SELECT id, status FROM users WHERE student_id = ? AND role = 'parent' LIMIT 1`,
    [studentId]
  );
  return rows[0] ? { id: rows[0].id, status: rows[0].status } : null;
}

// First sentence is the refusal; second is the consequence (§5i). The whole
// request is refused, so other fields in the same body did not save. Does not
// promise a transfer route and does not imply a class change will work later.
const CLASS_CHANGE_REFUSED =
  "Changing a student's class is not supported. Nothing else in this request was saved; other fields can be updated without sending a different grade_level or section.";

// (teacherHasAssignment, the assignments-only enrolment gate, was removed
// 2026-09-25 — POST / checks sections.adviser_id on the TARGET section now;
// see the handler. PUT /:id carries its own assigned-OR-adviser EXISTS.)

// Duplicated from routes/assignments.js. Extract on a third copy, not here.
async function currentAcademicYear() {
  const [rows] = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
  );
  return rows[0]?.setting_value || null;
}


// The only values GET /?status= accepts. Omitted means active-only.
const STATUS_FILTERS = ['active', 'inactive', 'all'];

// GET /api/students — list, scoped by role
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { grade_level, section, status, search } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    conditions.push(TEACHER_VIEW_SCOPE_SQL);
    params.push(...teacherViewScopeParams(req.user.id));
  }

  if (grade_level !== undefined) {
    if (!isValidGradeLevel(grade_level)) {
      return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
    }
    conditions.push('s.grade_level = ?');
    params.push(Number(grade_level));
  }

  if (section) {
    conditions.push('s.section = ?');
    params.push(String(section).trim());
  }

  // Absent means the active-only default; present must be one of the three.
  // A typo used to fall through to active-only silently, returning a
  // plausible list for a question the caller did not ask.
  if (status !== undefined && !STATUS_FILTERS.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${STATUS_FILTERS.join(', ')}.`,
    });
  }

  if (status === 'inactive') {
    conditions.push('s.status = ?');
    params.push('inactive');
  } else if (status !== 'all') {
    conditions.push('s.status = ?');
    params.push('active');
  }

  if (search) {
    const term = String(search).trim();
    conditions.push('(s.lrn = ? OR CONCAT(s.first_name, " ", s.last_name) LIKE ?)');
    params.push(term, `%${term}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const list = readListParams(req.query, {
    sortable: {
      name: 's.last_name, s.first_name',
      class: 's.grade_level, s.section',
      lrn: 's.lrn',
      status: 's.status',
      created_at: 's.created_at',
    },
    defaultOrderBy: 's.grade_level, s.section, s.last_name, s.first_name',
    tiebreaker: 's.id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    // total counts the FILTERED, scoped set (C4). The scope predicate is
    // EXISTS-based, so COUNT(*) over the same WHERE is the DISTINCT count.
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM students s ${where}`, params);
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id, s.lrn, s.first_name, s.last_name, s.grade_level, s.section,
              s.status, s.created_at
       FROM students s
       ${where}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, students: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List students error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
});

// GET /api/students/:id — parent (own child), teacher (own scope), admin (any)
router.get('/:id', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  try {
    if (req.user.role === 'parent') {
      if (id !== req.user.student_id) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [req.user.student_id]);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      return res.json({ success: true, student: publicStudent(rows[0]) });
    }

    if (req.user.role === 'teacher') {
      const [rows] = await pool.query(
        `SELECT s.* FROM students s
         WHERE s.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, ...teacherViewScopeParams(req.user.id)]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      return res.json({ success: true, student: publicStudent(rows[0]), parent_account: await parentAccountFor(id) });
    }

    // admin
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    return res.json({ success: true, student: publicStudent(rows[0]), parent_account: await parentAccountFor(id) });
  } catch (error) {
    console.error('Get student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch student.' });
  }
});

// POST /api/students — create. Teachers are scoped to their own assignments.
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { lrn, first_name, last_name, grade_level, section } = req.body;

  if (!lrn || !first_name || !last_name || grade_level === undefined || !section) {
    return res.status(400).json({
      success: false,
      message: 'lrn, first_name, last_name, grade_level, and section are required.',
    });
  }

  if (!isValidGradeLevel(grade_level)) {
    return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
  }

  const trimmedSection = String(section).trim();
  if (!trimmedSection) {
    return res.status(400).json({ success: false, message: 'section must not be empty.' });
  }

  const trimmedLrn = String(lrn).trim();
  const gradeLevelNum = Number(grade_level);

  // The LRN rule (utils/lrnRule.js): exactly 12 digits, checked on CREATE
  // only — before the duplicate lookup, so a malformed value is a 400 whether
  // or not something already holds it. Seeded and older rows keep their
  // shorter LRNs untouched.
  const lrnError = validateLrn(trimmedLrn);
  if (lrnError) {
    return res.status(400).json({ success: false, message: lrnError, field: 'lrn' });
  }

  const retired = refuseRetiredFields(req.body);
  if (retired) {
    return res.status(400).json({ success: false, message: retired.error, field: retired.field });
  }

  try {
    // Duplicate-LRN 409 MUST run before section resolve. test-student-flows.js
    // posts Marwin's LRN with fictional section 'Mabini'; resolving first would
    // turn that 409 into a 400. A write of section_id on insert (same shape as
    // POST /assignments) — not a fifth reader for scoping.
    const [existing] = await pool.query('SELECT id FROM students WHERE lrn = ? LIMIT 1', [trimmedLrn]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'A student with this LRN already exists.' });
    }

    const schoolYear = await currentAcademicYear();
    if (!schoolYear) {
      return res.status(409).json({
        success: false,
        message: 'academic_year is not configured. An admin must set it before students can be created.',
      });
    }

    // The section is resolved BEFORE the teacher gate (pre-Stage-5 #4): the
    // gate is a fact about the target row, so the row has to exist first.
    // A nonexistent section is a 400 to every role — section names are
    // reference data every authenticated user can list, so nothing leaks.
    const [sectionRows] = await pool.query(
      `SELECT id, adviser_id FROM sections
       WHERE name = ? AND grade_level = ? AND school_year = ?
       LIMIT 1`,
      [trimmedSection, gradeLevelNum, schoolYear]
    );
    const sectionRow = sectionRows[0];
    if (!sectionRow) {
      return res.status(400).json({
        success: false,
        message: `No section named "${trimmedSection}" exists at Grade ${gradeLevelNum} for ${schoolYear}.`,
      });
    }

    // WHO MAY ENROL (the school, 2026-09-23; built pre-Stage-5 #4,
    // 2026-09-25): THE ADVISER OF THE TARGET SECTION. Not a subject teacher
    // assigned there — a subject teacher records grades, the adviser keeps
    // the class list — so the gate is sections.adviser_id on the row just
    // resolved, never teacher_assignments and never the read predicate in
    // utils/teacherScope.js. Until today this was assignments-only, which let
    // a subject teacher enrol and stopped an adviser with no subject rows
    // (TCH-002 in the seed) from enrolling into their own class.
    //
    // ADMIN IS KEPT, deliberately. The school's "only the adviser, not the
    // admin" describes the process, and the client offers an admin no enrol
    // form. But 20 of 23 sections have no adviser and no screen assigns one
    // (KNOWN ISSUES) — an admin POST is the only way a learner reaches any
    // of those sections, and the only way a test fixture does. Excluding
    // admin here would make most of the school unenrollable.
    if (req.user.role === 'teacher' && sectionRow.adviser_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: `Only the adviser of Grade ${gradeLevelNum} - ${trimmedSection} can enrol a learner into it.`,
      });
    }

    const [result] = await pool.query(
      `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [trimmedLrn, first_name, last_name, gradeLevelNum, trimmedSection, sectionRow.id, req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [result.insertId]);
    // Id, not the LRN (§5c) — the LRN doubles as the parent's login id and an
    // audit row persists. Rows written before 2026-09-18 keep their wording.
    await logActivity(
      req.user.id,
      'create_student',
      `Created student #${result.insertId} (Grade ${gradeLevelNum} - ${trimmedSection})`
    );

    return res.status(201).json({
      success: true,
      message: 'Student created.',
      student: publicStudent(rows[0]),
    });
  } catch (error) {
    console.error('Create student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create student.' });
  }
});

// PUT /api/students/:id — update. LRN is immutable (it doubles as a parent's login_id).
router.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  const { first_name, last_name, grade_level, section } = req.body;

  if (grade_level !== undefined && !isValidGradeLevel(grade_level)) {
    return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
  }

  if (section !== undefined && !String(section).trim()) {
    return res.status(400).json({ success: false, message: 'section must not be empty.' });
  }

  const retired = refuseRetiredFields(req.body);
  if (retired) {
    return res.status(400).json({ success: false, message: retired.error, field: retired.field });
  }

  try {
    let existing;
    if (req.user.role === 'teacher') {
      // EDIT scope is assigned OR adviser (pre-Stage-5 #4, 2026-09-25) — the
      // same two legs as the read predicate, written out here rather than
      // imported because utils/teacherScope.js's header says that constant
      // is never a write gate, and this IS one. Until today edits were
      // assignments-only, so the adviser of a section — the person who
      // enrolled the learner and keeps the class list — could see a record
      // they could not correct. A learner outside both legs is 404, exactly
      // as GET /:id answers the same teacher (anti-enumeration, §2).
      const [rows] = await pool.query(
        `SELECT s.* FROM students s
         WHERE s.id = ?
           AND (
             EXISTS (
               SELECT 1 FROM teacher_assignments ta
               WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section
             )
             OR EXISTS (
               SELECT 1 FROM sections sec
               WHERE sec.id = s.section_id AND sec.adviser_id = ?
             )
           )
         LIMIT 1`,
        [id, req.user.id, req.user.id]
      );
      existing = rows[0];
    } else {
      const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
      existing = rows[0];
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const updated = {
      first_name: first_name !== undefined ? first_name : existing.first_name,
      last_name: last_name !== undefined ? last_name : existing.last_name,
      grade_level: grade_level !== undefined ? Number(grade_level) : existing.grade_level,
      section: section !== undefined ? String(section).trim() : existing.section,
    };

    // Class change is refused, not applied. Attendance authority keys on
    // students.section_id; rewriting the VARCHAR pair (or the FK) would move
    // who may record without a school answer. Omitted class fields copy from
    // existing, so a name-only PUT still matches and succeeds.
    // isValidGradeLevel already rejected grade_level: 0 above — different
    // cause, different message; do not collapse that check into this one.
    if (
      Number(updated.grade_level) !== Number(existing.grade_level) ||
      String(updated.section) !== String(existing.section)
    ) {
      return res.status(400).json({ success: false, message: CLASS_CHANGE_REFUSED });
    }

    // Gate, not a repair. Seed + POST already keep section_id non-null;
    // PUT was the one remaining writer that could create a VARCHAR/FK
    // disagreement. Resolve only when the stored FK is NULL — never overwrite
    // a non-null section_id (that rewrite would move attendance authority,
    // the exact write this handler exists to refuse). Same sections lookup
    // POST / uses. A miss leaves NULL so a student whose VARCHAR matches no
    // sections row stays editable; a 400 here would make that row permanently
    // uneditable, because resolve runs even on a name-only body.
    let sectionIdToWrite = existing.section_id;
    if (sectionIdToWrite == null) {
      const schoolYear = await currentAcademicYear();
      if (schoolYear) {
        const [sectionRows] = await pool.query(
          `SELECT id FROM sections
           WHERE name = ? AND grade_level = ? AND school_year = ?
           LIMIT 1`,
          [updated.section, updated.grade_level, schoolYear]
        );
        if (sectionRows[0]) {
          sectionIdToWrite = sectionRows[0].id;
        }
      }
    }

    await pool.query(
      `UPDATE students
       SET first_name = ?, last_name = ?, grade_level = ?, section = ?,
           section_id = ?
       WHERE id = ?`,
      [updated.first_name, updated.last_name, updated.grade_level, updated.section, sectionIdToWrite, id]
    );

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_student', `Updated student #${id}`);

    return res.json({ success: true, message: 'Student updated.', student: publicStudent(rows[0]) });
  } catch (error) {
    console.error('Update student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update student.' });
  }
});

// PATCH /api/students/:id/status — admin only. No hard delete.
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = req.body;

  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ success: false, message: "status must be 'active' or 'inactive'." });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // A PATCH to a target state: if the student is already there, the
    // requested state holds, so this is still success — but nothing
    // changed, so nothing is logged. The guarded UPDATE decides that in one
    // statement, which also closes the race between two admins acting at
    // once (the old read-then-write let both log a change).
    const [result] = await pool.query('UPDATE students SET status = ? WHERE id = ? AND status <> ?', [
      status,
      id,
      status,
    ]);
    const [updated] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);

    if (result.affectedRows === 0) {
      return res.json({
        success: true,
        message: `Student is already ${status}. Nothing was changed.`,
        student: publicStudent(updated[0]),
      });
    }

    await logActivity(req.user.id, 'update_student_status', `Set student #${id} to ${status}`);
    return res.json({ success: true, message: 'Student status updated.', student: publicStudent(updated[0]) });
  } catch (error) {
    console.error('Update student status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update student status.' });
  }
});

module.exports = router;
