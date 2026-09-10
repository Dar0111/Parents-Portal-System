const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');

const router = express.Router();

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

// WRITE scope — teacher_assignments only. Used by POST / (create).
// Deliberately NOT widened to advisers: see TEACHER_VIEW_SCOPE_SQL in
// utils/teacherScope.js, which is the READ scope and must not be used here.
async function teacherHasAssignment(teacherId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND grade_level = ? AND section = ? LIMIT 1`,
    [teacherId, gradeLevel, section]
  );
  return rows.length > 0;
}

// Duplicated from routes/assignments.js. Extract on a third copy, not here.
async function currentAcademicYear() {
  const [rows] = await pool.query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1"
  );
  return rows[0]?.setting_value || null;
}


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
        [id, ...teacherViewScopeParams(req.user.id)]
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

    const [sectionRows] = await pool.query(
      `SELECT id FROM sections
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

    const [result] = await pool.query(
      `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, birthday, gender, address, contact_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmedLrn,
        first_name,
        last_name,
        gradeLevelNum,
        trimmedSection,
        sectionRow.id,
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
          [id, ...teacherViewScopeParams(req.user.id)]
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

    // section_id is NOT updated here. POST / sets it from the VARCHAR pair +
    // academic_year; PUT still writes only the VARCHAR columns. A later
    // section change via this endpoint would orphan attendance again
    // (adviser scope keys on students.section_id). No Edit this dispatch.

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
