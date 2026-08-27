const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

const VALID_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function isValidDateFormat(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFutureDate(value) {
  const today = new Date().toISOString().slice(0, 10);
  return value > today;
}

async function teacherHasAssignment(teacherId, subjectId, gradeLevel, section) {
  const [rows] = await pool.query(
    `SELECT 1 FROM teacher_assignments
     WHERE teacher_id = ? AND subject_id = ? AND grade_level = ? AND section = ?
     LIMIT 1`,
    [teacherId, subjectId, gradeLevel, section]
  );
  return rows.length > 0;
}

// Scope check shared by GET /student/:studentId and GET /summary/:studentId.
// Returns true if the requesting user may see this student's attendance at all
// (parent: own child only; teacher: assigned to at least one subject for the
// student's grade/section; admin: unscoped).
async function canViewStudent(user, studentId) {
  if (user.role === 'parent') {
    return studentId === user.student_id;
  }
  if (user.role === 'teacher') {
    const [rows] = await pool.query(
      `SELECT 1 FROM students s
       WHERE s.id = ?
         AND EXISTS (
           SELECT 1 FROM teacher_assignments ta
           WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section
         )
       LIMIT 1`,
      [studentId, user.id]
    );
    return rows.length > 0;
  }
  const [rows] = await pool.query('SELECT 1 FROM students WHERE id = ? LIMIT 1', [studentId]);
  return rows.length > 0;
}

// GET /api/attendance — list, scoped by role
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, grade_level, section, date, from, to, status } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    conditions.push(`EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = ? AND ta.subject_id = a.subject_id
        AND ta.grade_level = s.grade_level AND ta.section = s.section
    )`);
    params.push(req.user.id);
  }

  if (student_id !== undefined) {
    const studentId = parseId(student_id);
    if (studentId === null) {
      return res.status(400).json({ success: false, message: 'Invalid student_id filter.' });
    }
    conditions.push('a.student_id = ?');
    params.push(studentId);
  }

  if (subject_id !== undefined) {
    const subjectId = parseId(subject_id);
    if (subjectId === null) {
      return res.status(400).json({ success: false, message: 'Invalid subject_id filter.' });
    }
    conditions.push('a.subject_id = ?');
    params.push(subjectId);
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

  if (date) {
    if (!isValidDateFormat(date)) {
      return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
    }
    conditions.push('a.date = ?');
    params.push(date);
  } else {
    if (from) {
      if (!isValidDateFormat(from)) {
        return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isValidDateFormat(to)) {
        return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date <= ?');
      params.push(to);
    }
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
    }
    conditions.push('a.status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.student_id, a.subject_id, a.date, a.status, a.recorded_by, a.created_at, a.updated_at,
              s.first_name, s.last_name, s.grade_level, s.section
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       ${where}
       ORDER BY a.date DESC, s.last_name, s.first_name`,
      params
    );

    return res.json({ success: true, attendance: rows });
  } catch (error) {
    console.error('List attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
});

// GET /api/attendance/student/:studentId — parent (own child), teacher (own scope), admin (any)
router.get('/student/:studentId', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  const { subject_id, from, to, status } = req.query;

  try {
    const canView = await canViewStudent(req.user, studentId);
    if (!canView) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const conditions = ['a.student_id = ?'];
    const params = [studentId];

    if (req.user.role === 'teacher') {
      conditions.push(`a.subject_id IN (
        SELECT ta.subject_id FROM teacher_assignments ta
        JOIN students s ON s.grade_level = ta.grade_level AND s.section = ta.section
        WHERE ta.teacher_id = ? AND s.id = ?
      )`);
      params.push(req.user.id, studentId);
    }

    if (subject_id !== undefined) {
      const subjectId = parseId(subject_id);
      if (subjectId === null) {
        return res.status(400).json({ success: false, message: 'Invalid subject_id filter.' });
      }
      conditions.push('a.subject_id = ?');
      params.push(subjectId);
    }

    if (from) {
      if (!isValidDateFormat(from)) {
        return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isValidDateFormat(to)) {
        return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date <= ?');
      params.push(to);
    }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
      }
      conditions.push('a.status = ?');
      params.push(status);
    }

    const [rows] = await pool.query(
      `SELECT a.* FROM attendance a WHERE ${conditions.join(' AND ')} ORDER BY a.date DESC`,
      params
    );

    return res.json({ success: true, attendance: rows });
  } catch (error) {
    console.error('Get student attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
});

// GET /api/attendance/summary/:studentId — raw counts only, no rate (undefined formula)
router.get('/summary/:studentId', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid student id.' });
  }

  const { subject_id, from, to } = req.query;

  try {
    const canView = await canViewStudent(req.user, studentId);
    if (!canView) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const conditions = ['a.student_id = ?'];
    const params = [studentId];

    if (req.user.role === 'teacher') {
      conditions.push(`a.subject_id IN (
        SELECT ta.subject_id FROM teacher_assignments ta
        JOIN students s ON s.grade_level = ta.grade_level AND s.section = ta.section
        WHERE ta.teacher_id = ? AND s.id = ?
      )`);
      params.push(req.user.id, studentId);
    }

    if (subject_id !== undefined) {
      const subjectId = parseId(subject_id);
      if (subjectId === null) {
        return res.status(400).json({ success: false, message: 'Invalid subject_id filter.' });
      }
      conditions.push('a.subject_id = ?');
      params.push(subjectId);
    }

    if (from) {
      if (!isValidDateFormat(from)) {
        return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date >= ?');
      params.push(from);
    }
    if (to) {
      if (!isValidDateFormat(to)) {
        return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
      }
      conditions.push('a.date <= ?');
      params.push(to);
    }

    const [rows] = await pool.query(
      `SELECT a.status, COUNT(*) AS count FROM attendance a WHERE ${conditions.join(' AND ')} GROUP BY a.status`,
      params
    );

    const summary = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
    let total = 0;
    for (const row of rows) {
      summary[row.status] = row.count;
      total += row.count;
    }

    return res.json({ success: true, summary: { ...summary, total } });
  } catch (error) {
    console.error('Get attendance summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance summary.' });
  }
});

// POST /api/attendance — record one entry. Teachers are scoped to their own assignments;
// admin is unscoped (covers a teacher being absent or having left).
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, date, status } = req.body;

  const studentId = parseId(student_id);
  const subjectId = parseId(subject_id);

  if (studentId === null || subjectId === null || !date || !status) {
    return res.status(400).json({
      success: false,
      message: 'student_id, subject_id, date, and status are required.',
    });
  }

  if (!isValidDateFormat(date)) {
    return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
  }

  if (isFutureDate(date)) {
    return res.status(400).json({ success: false, message: 'date cannot be in the future.' });
  }

  try {
    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];

    if (req.user.role === 'admin') {
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    } else {
      // Collapse "student doesn't exist" and "exists but out of scope" into the
      // same 403 — a teacher probing student ids shouldn't be able to tell which.
      const allowed = student && (await teacherHasAssignment(req.user.id, subjectId, student.grade_level, student.section));
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to teach this subject for this student\'s class.',
        });
      }
    }

    if (student.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot record attendance for an inactive student.' });
    }

    await pool.query(
      `INSERT INTO attendance (student_id, subject_id, date, status, recorded_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by)`,
      [studentId, subjectId, date, status, req.user.id]
    );

    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE student_id = ? AND subject_id = ? AND date = ? LIMIT 1',
      [studentId, subjectId, date]
    );

    await logActivity(
      req.user.id,
      'record_attendance',
      `Recorded ${status} for student #${studentId}, subject #${subjectId}, ${date}`
    );

    return res.status(201).json({ success: true, message: 'Attendance recorded.', attendance: rows[0] });
  } catch (error) {
    console.error('Record attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record attendance.' });
  }
});

// POST /api/attendance/bulk — record a whole class for one date. All-or-nothing:
// every entry is validated before anything is written, then written in one transaction.
router.post('/bulk', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { subject_id, grade_level, section, date, entries } = req.body;

  const subjectId = parseId(subject_id);

  if (
    subjectId === null ||
    grade_level === undefined ||
    !section ||
    !date ||
    !Array.isArray(entries) ||
    entries.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: 'subject_id, grade_level, section, date, and a non-empty entries array are required.',
    });
  }

  if (!isValidGradeLevel(grade_level)) {
    return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
  }

  const trimmedSection = String(section).trim();
  if (!trimmedSection) {
    return res.status(400).json({ success: false, message: 'section must not be empty.' });
  }

  if (!isValidDateFormat(date)) {
    return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
  }

  if (isFutureDate(date)) {
    return res.status(400).json({ success: false, message: 'date cannot be in the future.' });
  }

  const gradeLevelNum = Number(grade_level);

  const studentIds = [];
  for (const entry of entries) {
    const studentId = parseId(entry?.student_id);
    if (studentId === null || !VALID_STATUSES.includes(entry?.status)) {
      return res.status(400).json({
        success: false,
        message: 'Each entry needs a valid student_id and a status of Present, Absent, Late, or Excused.',
      });
    }
    studentIds.push(studentId);
  }

  if (new Set(studentIds).size !== studentIds.length) {
    return res.status(400).json({ success: false, message: 'Duplicate student_id in entries.' });
  }

  let conn;
  try {
    if (req.user.role === 'teacher') {
      const allowed = await teacherHasAssignment(req.user.id, subjectId, gradeLevelNum, trimmedSection);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to teach this subject for Grade ${gradeLevelNum} - ${trimmedSection}.`,
        });
      }
    }

    const [students] = await pool.query('SELECT id, status, grade_level, section FROM students WHERE id IN (?)', [
      studentIds,
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));

    for (const studentId of studentIds) {
      const student = studentMap.get(studentId);
      if (!student || student.grade_level !== gradeLevelNum || student.section !== trimmedSection) {
        return res.status(400).json({
          success: false,
          message: `Student #${studentId} is not in Grade ${gradeLevelNum} - ${trimmedSection}.`,
        });
      }
      if (student.status !== 'active') {
        return res.status(400).json({ success: false, message: `Student #${studentId} is not active.` });
      }
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const entry of entries) {
      await conn.query(
        `INSERT INTO attendance (student_id, subject_id, date, status, recorded_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by)`,
        [entry.student_id, subjectId, date, entry.status, req.user.id]
      );
    }

    await conn.commit();

    const [rows] = await pool.query('SELECT * FROM attendance WHERE subject_id = ? AND date = ? AND student_id IN (?)', [
      subjectId,
      date,
      studentIds,
    ]);

    await logActivity(
      req.user.id,
      'bulk_record_attendance',
      `Recorded attendance for ${studentIds.length} students, subject #${subjectId}, Grade ${gradeLevelNum} - ${trimmedSection}, ${date}`
    );

    return res.status(201).json({
      success: true,
      message: `Attendance recorded for ${studentIds.length} students.`,
      attendance: rows,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Bulk attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record attendance.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/attendance/:id — correct an entry. Teachers are scoped to their own
// assignments (out-of-scope or nonexistent id both return 404); admin is unscoped.
router.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid attendance id.' });
  }

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
  }

  try {
    let existing;
    if (req.user.role === 'teacher') {
      const [rows] = await pool.query(
        `SELECT a.* FROM attendance a
         JOIN students s ON s.id = a.student_id
         WHERE a.id = ?
           AND EXISTS (
             SELECT 1 FROM teacher_assignments ta
             WHERE ta.teacher_id = ? AND ta.subject_id = a.subject_id
               AND ta.grade_level = s.grade_level AND ta.section = s.section
           )
         LIMIT 1`,
        [id, req.user.id]
      );
      existing = rows[0];
    } else {
      const [rows] = await pool.query('SELECT * FROM attendance WHERE id = ? LIMIT 1', [id]);
      existing = rows[0];
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    }

    await pool.query('UPDATE attendance SET status = ?, recorded_by = ? WHERE id = ?', [status, req.user.id, id]);

    const [rows] = await pool.query('SELECT * FROM attendance WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'correct_attendance', `Corrected attendance #${id} to ${status}`);

    return res.json({ success: true, message: 'Attendance updated.', attendance: rows[0] });
  } catch (error) {
    console.error('Update attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update attendance.' });
  }
});

module.exports = router;
