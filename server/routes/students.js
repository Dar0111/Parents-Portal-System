const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

// WRITE scope — teacher_assignments only. Used by POST / (create).
// Deliberately NOT widened to advisers: see TEACHER_VIEW_SCOPE_SQL below.
async function teacherHasAssignment(teacherId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND grade_level = ? AND section = ? LIMIT 1`,
    [teacherId, gradeLevel, section]
  );
  return rows.length > 0;
}

// READ scope — WIDER than write scope, by design.
//
// A teacher sees a student if EITHER they are assigned to teach that
// student's class (teacher_assignments) OR they are the adviser of that
// student's section (sections.adviser_id). This applies the decision Stage G3
// already settled for Grades: read scope is wider than encode scope, because a
// teacher needs the full picture for their section, not only the subjects they
// personally teach. It had simply never been applied here.
//
// The concrete gap this closes: every attendance endpoint scopes on
// sections.adviser_id, so an adviser with no teacher_assignments rows could
// record attendance for a student this file would not list. TCH-002 (adviser
// of Grade 5 - Masigasig, zero assignments) was exactly that account.
//
// The adviser leg matches on s.section_id — the SAME column attendance scopes
// on — not the VARCHAR grade_level/section pair, so "students I can list" and
// "students I can record attendance for" are the same set BY CONSTRUCTION
// rather than two definitions that happen to agree today. Accepted consequence:
// a student whose section_id is NULL stays invisible to an adviser-only
// teacher, mirroring a blind spot attendance already has.
//
// Requires TWO bound params, both the teacher's user id, in this order.
// Assumes the students table is aliased `s`.
//
// DO NOT reuse this for a write path. PUT /:id and POST / stay on
// teacher_assignments alone — widening reads must not make more records
// editable. See the 403-vs-404 note on PUT /:id.
const TEACHER_VIEW_SCOPE_SQL = `(
      EXISTS (
        SELECT 1 FROM teacher_assignments ta
        WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section
      )
      OR EXISTS (
        SELECT 1 FROM sections sec
        WHERE sec.id = s.section_id AND sec.adviser_id = ?
      )
    )`;

// GET /api/students — list, scoped by role
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { grade_level, section, status, search } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    conditions.push(TEACHER_VIEW_SCOPE_SQL);
    params.push(req.user.id, req.user.id);
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

  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id, s.lrn, s.first_name, s.last_name, s.grade_level, s.section,
              s.birthday, s.gender, s.address, s.contact_number, s.status, s.created_at
       FROM students s
       ${where}
       ORDER BY s.grade_level, s.section, s.last_name, s.first_name`,
      params
    );

    return res.json({ success: true, students: rows });
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
      return res.json({ success: true, student: rows[0] });
    }

    if (req.user.role === 'teacher') {
      const [rows] = await pool.query(
        `SELECT s.* FROM students s
         WHERE s.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, req.user.id, req.user.id]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      return res.json({ success: true, student: rows[0] });
    }

    // admin
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    return res.json({ success: true, student: rows[0] });
  } catch (error) {
    console.error('Get student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch student.' });
  }
});

// POST /api/students — create. Teachers are scoped to their own assignments.
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { lrn, first_name, last_name, grade_level, section, birthday, gender, address, contact_number } = req.body;

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

  try {
    if (req.user.role === 'teacher') {
      const allowed = await teacherHasAssignment(req.user.id, gradeLevelNum, trimmedSection);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to Grade ${gradeLevelNum} - ${trimmedSection}.`,
        });
      }
    }

    const [existing] = await pool.query('SELECT id FROM students WHERE lrn = ? LIMIT 1', [trimmedLrn]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'A student with this LRN already exists.' });
    }

    const [result] = await pool.query(
      `INSERT INTO students (lrn, first_name, last_name, grade_level, section, birthday, gender, address, contact_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmedLrn,
        first_name,
        last_name,
        gradeLevelNum,
        trimmedSection,
        birthday || null,
        gender || null,
        address || null,
        contact_number || null,
        req.user.id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'create_student',
      `Created student ${trimmedLrn} (Grade ${gradeLevelNum} - ${trimmedSection})`
    );

    return res.status(201).json({
      success: true,
      message: 'Student created.',
      student: rows[0],
    });
  } catch (error) {
    console.error('Create student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create student.' });
  }
});

// PUT /api/students/:id — update. LRN is immutable — it doubles as a parent's login_id.
router.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  const { first_name, last_name, grade_level, section, birthday, gender, address, contact_number } = req.body;

  if (grade_level !== undefined && !isValidGradeLevel(grade_level)) {
    return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
  }

  if (section !== undefined && !String(section).trim()) {
    return res.status(400).json({ success: false, message: 'section must not be empty.' });
  }

  try {
    let existing;
    if (req.user.role === 'teacher') {
      // WRITE scope is teacher_assignments ONLY — deliberately NOT the wider
      // TEACHER_VIEW_SCOPE_SQL used by the two reads. Widening reads must not
      // make more records editable.
      const [rows] = await pool.query(
        `SELECT s.* FROM students s
         WHERE s.id = ?
           AND EXISTS (
             SELECT 1 FROM teacher_assignments ta
             WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section
           )
         LIMIT 1`,
        [id, req.user.id]
      );
      existing = rows[0];

      // Read scope is wider than write scope, so a 404 here would contradict
      // what GET /api/students/:id already shows this same teacher. Distinguish
      // the two cases exactly as routes/grades.js does after Stage G3: inside
      // view-scope but outside write-scope is 403 naming the reason; outside
      // both is 404 and stays indistinguishable from a nonexistent id.
      if (!existing) {
        const [visible] = await pool.query(
          `SELECT 1 FROM students s
           WHERE s.id = ?
             AND ${TEACHER_VIEW_SCOPE_SQL}
           LIMIT 1`,
          [id, req.user.id, req.user.id]
        );
        if (visible.length) {
          return res.status(403).json({
            success: false,
            message:
              'You can view this student as the adviser of their section, but editing student records is limited to teachers assigned to teach that class.',
          });
        }
      }
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
      birthday: birthday !== undefined ? birthday || null : existing.birthday,
      gender: gender !== undefined ? gender || null : existing.gender,
      address: address !== undefined ? address || null : existing.address,
      contact_number: contact_number !== undefined ? contact_number || null : existing.contact_number,
    };

    await pool.query(
      `UPDATE students
       SET first_name = ?, last_name = ?, grade_level = ?, section = ?,
           birthday = ?, gender = ?, address = ?, contact_number = ?
       WHERE id = ?`,
      [
        updated.first_name,
        updated.last_name,
        updated.grade_level,
        updated.section,
        updated.birthday,
        updated.gender,
        updated.address,
        updated.contact_number,
        id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_student', `Updated student ${existing.lrn} (#${id})`);

    return res.json({ success: true, message: 'Student updated.', student: rows[0] });
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

    await pool.query('UPDATE students SET status = ? WHERE id = ?', [status, id]);
    await logActivity(req.user.id, 'update_student_status', `Set student ${rows[0].lrn} (#${id}) to ${status}`);

    const [updated] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [id]);
    return res.json({ success: true, message: 'Student status updated.', student: updated[0] });
  } catch (error) {
    console.error('Update student status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update student status.' });
  }
});

module.exports = router;
