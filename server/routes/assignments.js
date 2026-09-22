const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { readListParams, pageMeta } = require('../utils/pagination');

const subjectsRouter = express.Router();
const assignmentsRouter = express.Router();

const ASSIGNMENT_DETAIL_SQL = `
  SELECT ta.id, ta.teacher_id, u.name AS teacher_name,
         ta.subject_id, s.name AS subject_name,
         ta.grade_level, ta.section, ta.section_id
  FROM teacher_assignments ta
  JOIN users u ON u.id = ta.teacher_id
  JOIN subjects s ON s.id = ta.subject_id
  WHERE ta.id = ?
  LIMIT 1
`;

async function fetchAssignment(id) {
  const [rows] = await pool.query(ASSIGNMENT_DETAIL_SQL, [id]);
  return rows[0] || null;
}

async function currentAcademicYear() {
  const [rows] = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
  );
  return rows[0]?.setting_value || null;
}

// GET /api/subjects — all authenticated roles. Subjects are unscoped
// reference data (the 40-row per-grade curriculum), same idea as
// GET /api/sections: everyone sees the same list. Optional ?grade_level=
// narrows it. No POST/PUT/DELETE — the inventory is seeded, not managed
// through this API.
subjectsRouter.get('/', authenticate, async (req, res) => {
  const { grade_level } = req.query;

  const conditions = [];
  const params = [];

  if (grade_level !== undefined) {
    const n = Number(grade_level);
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
    }
    conditions.push('grade_level = ?');
    params.push(n);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      // The school's printed order within each grade level (CR3a), null-last
      // so Grades 2 and 3 keep the alphabetical fallback rather than leading.
      `SELECT id, name, grade_level, display_order FROM subjects ${where}
        ORDER BY grade_level, display_order IS NULL, display_order, name`,
      params
    );
    return res.json({ success: true, subjects: rows });
  } catch (error) {
    console.error('List subjects error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch subjects.' });
  }
});

// GET /api/assignments — teacher sees their own; admin sees anyone.
// A teacher sending ?teacher_id= of someone else is 403, not 404.
// That is a deliberate deviation from the 404-for-out-of-scope-reads
// convention: the convention exists for anti-enumeration, and here there
// is nothing to enumerate — GET /api/messages/contacts already lists
// every teacher this caller may see, by name. A 404 would hide nothing
// and cost clarity. Do not "fix" it back to 404.
assignmentsRouter.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { teacher_id } = req.query;
  let teacherIdFilter = null;

  if (teacher_id !== undefined) {
    const parsed = parseId(teacher_id);
    if (parsed === null) {
      return res.status(400).json({ success: false, message: 'teacher_id must be a positive integer.' });
    }
    if (req.user.role === 'teacher' && parsed !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You may only read your own assignments.',
      });
    }
    teacherIdFilter = parsed;
  } else if (req.user.role === 'teacher') {
    teacherIdFilter = req.user.id;
  }

  const list = readListParams(req.query, {
    // `sort=subject` stays s.name — an explicit sort is the caller asking for
    // alphabetical, and changing what a documented sort value means would be a
    // contract change. Only the DEFAULT follows the school's printed order,
    // which is what the class-record Subject dropdown reads (CR3a).
    sortable: { class: 'ta.grade_level, ta.section', subject: 's.name', teacher: 'u.name' },
    defaultOrderBy: 'ta.grade_level, ta.section, s.display_order IS NULL, s.display_order, s.name',
    tiebreaker: 'ta.id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const params = [];
    let where = '';
    if (teacherIdFilter !== null) {
      where = 'WHERE ta.teacher_id = ?';
      params.push(teacherIdFilter);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM teacher_assignments ta ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT ta.id, ta.teacher_id, u.name AS teacher_name,
              ta.subject_id, s.name AS subject_name,
              ta.grade_level, ta.section, ta.section_id
       FROM teacher_assignments ta
       JOIN users u ON u.id = ta.teacher_id
       JOIN subjects s ON s.id = ta.subject_id
       ${where}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, assignments: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
  } catch (error) {
    console.error('List assignments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
});

// POST /api/assignments — admin only. grade_level comes from the subject
// row, never from req.body — same rule as role and student_id. section is
// the VARCHAR every other route still scopes on; section_id is resolved
// against sections for the current academic_year and stored on this row
// (a write on this table, not a new reader of section_id elsewhere).
assignmentsRouter.post('/', authenticate, authorize('admin'), async (req, res) => {
  const teacherId = parseId(req.body.teacher_id);
  if (teacherId === null) {
    return res.status(400).json({ success: false, message: 'teacher_id is required and must be a positive integer.' });
  }

  const subjectId = parseId(req.body.subject_id);
  if (subjectId === null) {
    return res.status(400).json({ success: false, message: 'subject_id is required and must be a positive integer.' });
  }

  const section = typeof req.body.section === 'string' ? req.body.section.trim() : '';
  if (!section) {
    return res.status(400).json({ success: false, message: 'section is required.' });
  }

  try {
    const [teacherRows] = await pool.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [teacherId]);
    const teacher = teacherRows[0];
    if (!teacher) {
      return res.status(400).json({ success: false, message: 'teacher_id does not reference an existing user.' });
    }
    if (teacher.role !== 'teacher') {
      return res.status(400).json({
        success: false,
        message: `teacher_id must reference a user with role 'teacher' (found role '${teacher.role}').`,
      });
    }
    if (teacher.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `teacher_id must reference an active teacher account (this one is '${teacher.status}').`,
      });
    }

    const [subjectRows] = await pool.query('SELECT id, name, grade_level FROM subjects WHERE id = ? LIMIT 1', [
      subjectId,
    ]);
    const subject = subjectRows[0];
    if (!subject) {
      return res.status(400).json({ success: false, message: 'subject_id does not reference an existing subject.' });
    }

    const schoolYear = await currentAcademicYear();
    if (!schoolYear) {
      return res.status(409).json({
        success: false,
        message: 'academic_year is not configured. An admin must set it before assignments can be created.',
      });
    }

    const [sectionRows] = await pool.query(
      `SELECT id FROM sections
       WHERE name = ? AND grade_level = ? AND school_year = ?
       LIMIT 1`,
      [section, subject.grade_level, schoolYear]
    );
    const sectionRow = sectionRows[0];
    if (!sectionRow) {
      return res.status(400).json({
        success: false,
        message: `No section named "${section}" exists at Grade ${subject.grade_level} for ${schoolYear}.`,
      });
    }

    const [existing] = await pool.query(
      `SELECT id FROM teacher_assignments
       WHERE teacher_id = ? AND subject_id = ? AND grade_level = ? AND section = ?
       LIMIT 1`,
      [teacherId, subjectId, subject.grade_level, section]
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: 'This teacher is already assigned to that subject in that section.',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section, section_id)
       VALUES (?, ?, ?, ?, ?)`,
      [teacherId, subjectId, subject.grade_level, section, sectionRow.id]
    );

    const created = await fetchAssignment(result.insertId);
    await logActivity(
      req.user.id,
      'create_assignment',
      `Assigned teacher #${teacherId} to ${subject.name} Grade ${subject.grade_level} - ${section}`
    );

    return res.status(201).json({ success: true, message: 'Assignment created.', assignment: created });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'This teacher is already assigned to that subject in that section.',
      });
    }
    console.error('Create assignment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create assignment.' });
  }
});

// DELETE /api/assignments/:id — admin only, unscoped.
// Does NOT refuse when grades exist for the same teacher/subject/section.
// There is no FK from grades to teacher_assignments, so this delete cannot
// touch grade rows. A scope change removes future authority, never past
// records — the same principle as message history surviving a canMessage
// change, and the opposite of the subjects-reseed trap (subjects.id
// CASCADE destroyed assignments AND grades). Mid-year reassignment must
// not wipe SF9 data.
assignmentsRouter.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid assignment id.' });
  }

  try {
    const existing = await fetchAssignment(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    await pool.query('DELETE FROM teacher_assignments WHERE id = ?', [id]);
    await logActivity(
      req.user.id,
      'delete_assignment',
      `Removed assignment #${id} (${existing.teacher_name}, ${existing.subject_name}, Grade ${existing.grade_level} - ${existing.section})`
    );

    return res.json({ success: true, message: 'Assignment deleted.' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete assignment.' });
  }
});

module.exports = { assignmentsRouter, subjectsRouter };
