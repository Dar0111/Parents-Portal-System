const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { isValidDateFormat, todayLocalDateString } = require('../utils/dateFormat');
const { readListParams, pageMeta } = require('../utils/pagination');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

const VALID_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function isFutureDate(value) {
  return value > todayLocalDateString();
}

// Attendance is per DAY, recorded once by the section ADVISER during
// Homeroom Guidance — confirmed by the school (SF9 records monthly Class
// Days/Days Present/Days Absent, not a per-subject figure). Scoping is
// therefore "is this teacher the adviser of the student's section," via
// sections.adviser_id — not teacher_assignments (subject-based, and
// subject teachers don't record attendance at all under this model).
// teacher_assignments/subject_id are gone from this file entirely.
//
// Reads students.section_id — the FK column Stage A added and backfilled.
// This is the one deliberate exception to "nothing reads section_id yet"
// (see CLAUDE.md's "sections table" note) — attendance was named there as
// one of exactly two places planned to use it. Every other route stays on
// the VARCHAR section columns; do not extend this pattern elsewhere.
async function teacherIsAdviserOfSection(teacherId, sectionId) {
  const { rows } = await pool.query('SELECT 1 FROM sections WHERE id = ? AND adviser_id = ? LIMIT 1', [
    sectionId,
    teacherId,
  ]);
  return rows.length > 0;
}

// THE TEACHER READ SCOPE, PER ROW (pre-Stage-5 #6, 2026-09-26): a teacher
// sees an attendance row if THEY RECORDED IT, or if the learner is CURRENTLY
// in a section they advise. The school's rule for a mid-year transfer is that
// the adviser who leaves a section keeps the attendance they recorded —
// handover happens outside the system — and until #6 the only link a row
// had was the learner's current section, so the former adviser lost even
// the days they personally wrote, while the new adviser gained months
// recorded before the transfer. `recorded_by` is the first leg now.
//
// Two legs, deliberately: NO teacher_assignments leg. Attendance stays the
// adviser's job (and utils/teacherScope.js's read predicate is not used
// here) — a subject teacher records nothing and reads nothing. No schema
// change: the row still carries no section, so the NEW adviser sees every
// row of a learner who is currently theirs, pre-transfer included. That is
// the existing behaviour, a superset of the school's "via the card", and it
// is accepted (docs/KNOWN_ISSUES.md).
//
// One learner, one day, two teachers: `uq_attendance (student_id, date)`
// keeps ONE row, and every write path sets `recorded_by` to the writer
// (the upsert's ON CONFLICT DO UPDATE, and PUT). A second recorder therefore takes the
// row out of the first recorder's "recorded by me" set — the row's author is
// whoever last wrote it. Accepted; stated here so nobody hunts for the row.
//
// The fragment assumes `attendance a` and `students s` are in scope. TWO
// bound params, both the teacher's id — the same count hazard the shared
// predicate documents: use teacherAttendanceParams(), never write them out.
const TEACHER_ATTENDANCE_READ_SQL = `(
      a.recorded_by = ?
      OR EXISTS (
        SELECT 1 FROM sections sec
        WHERE sec.id = s.section_id AND sec.adviser_id = ?
      )
    )`;
function teacherAttendanceParams(teacherId) {
  return [teacherId, teacherId];
}

// Scope check shared by GET /student/:studentId and GET /summary/:studentId.
// Returns true if the requesting user may see this student's attendance at
// all (parent: own child only; teacher: adviser of the student's CURRENT
// section OR the recorder of at least one of their rows — since #6; admin:
// unscoped). For a teacher this is only the gate that decides 404: the two
// handlers then apply TEACHER_ATTENDANCE_READ_SQL per row, so a former
// adviser sees the days they recorded and nothing written after handover.
async function canViewStudent(user, studentId) {
  if (user.role === 'parent') {
    return studentId === user.student_id;
  }
  if (user.role === 'teacher') {
    const { rows } = await pool.query(
      `SELECT 1 FROM students s
       WHERE s.id = ?
         AND (
           EXISTS (SELECT 1 FROM sections sec WHERE sec.id = s.section_id AND sec.adviser_id = ?)
           OR EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = s.id AND a.recorded_by = ?)
         )
       LIMIT 1`,
      [studentId, user.id, user.id]
    );
    return rows.length > 0;
  }
  const { rows } = await pool.query('SELECT 1 FROM students WHERE id = ? LIMIT 1', [studentId]);
  return rows.length > 0;
}

// GET /api/attendance — list, scoped by role
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, grade_level, section, date, from, to, status } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    // Recorded by me, OR the learner is currently in a section I advise —
    // see TEACHER_ATTENDANCE_READ_SQL above. Admin is unscoped.
    conditions.push(TEACHER_ATTENDANCE_READ_SQL);
    params.push(...teacherAttendanceParams(req.user.id));
  }

  if (student_id !== undefined) {
    const studentId = parseId(student_id);
    if (studentId === null) {
      return res.status(400).json({ success: false, message: 'Invalid student_id filter.' });
    }
    conditions.push('a.student_id = ?');
    params.push(studentId);
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

  // `date` AND a range is a contradiction, refused rather than resolved
  // (pre-Stage-5 #2, o1). The `else` below used to make `from`/`to` silently
  // vanish whenever `date` was present — a filter that quietly ignores half
  // of what it was asked is the worst kind of wrong, because the response
  // looks complete. Neither client caller sends `date`; this is for anyone
  // who does.
  if (date && (from || to)) {
    return res.status(400).json({
      success: false,
      message: 'date cannot be combined with from or to — send one day or a range, not both.',
    });
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

  const list = readListParams(req.query, {
    sortable: {
      date: 'a.date',
      student: 's.last_name, s.first_name',
      class: 's.grade_level, s.section',
      status: 'a.status',
    },
    defaultOrderBy: 'a.date DESC, s.last_name, s.first_name',
    tiebreaker: 'a.id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const fromClause = `FROM attendance a
       JOIN students s ON s.id = a.student_id
       ${where}`;
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${fromClause}`, params);
    const { rows } = await pool.query(
      `SELECT a.id, a.student_id, a.date, a.status, a.recorded_by, a.created_at, a.updated_at,
              s.first_name, s.last_name, s.grade_level, s.section
       ${fromClause}
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, attendance: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
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

  const { from, to, status } = req.query;

  try {
    const canView = await canViewStudent(req.user, studentId);
    if (!canView) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const conditions = ['a.student_id = ?'];
    const params = [studentId];
    // Per-row scope for a teacher (#6): the parent and admin branches add
    // nothing here — a parent sees the whole year, an admin everything.
    if (req.user.role === 'teacher') {
      conditions.push(TEACHER_ATTENDANCE_READ_SQL);
      params.push(...teacherAttendanceParams(req.user.id));
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

    const list = readListParams(req.query, {
      sortable: { date: 'a.date', status: 'a.status' },
      defaultOrderBy: 'a.date DESC',
      tiebreaker: 'a.id ASC',
    });
    if (!list.ok) {
      return res.status(400).json({ success: false, message: list.message });
    }

    // `students s` is joined for the teacher predicate's adviser leg (#6);
    // the parent and admin branches simply never reference it.
    const where = `WHERE ${conditions.join(' AND ')}`;
    const {
      rows: [{ total }],
    } = await pool.query(
      `SELECT COUNT(*) AS total FROM attendance a JOIN students s ON s.id = a.student_id ${where}`,
      params
    );
    const { rows } = await pool.query(
      `SELECT a.* FROM attendance a JOIN students s ON s.id = a.student_id ${where} ${list.orderBy} LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({ success: true, attendance: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
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

  const { from, to } = req.query;

  try {
    const canView = await canViewStudent(req.user, studentId);
    if (!canView) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const conditions = ['a.student_id = ?'];
    const params = [studentId];
    // Per-row scope for a teacher (#6); parent and admin branches unchanged.
    if (req.user.role === 'teacher') {
      conditions.push(TEACHER_ATTENDANCE_READ_SQL);
      params.push(...teacherAttendanceParams(req.user.id));
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

    const { rows } = await pool.query(
      `SELECT a.status, COUNT(*) AS count
         FROM attendance a JOIN students s ON s.id = a.student_id
        WHERE ${conditions.join(' AND ')} GROUP BY a.status`,
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

// POST /api/attendance — record one entry for one day. Advisers are scoped
// to their own section; admin is unscoped (covers an adviser being absent
// or having left).
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { student_id, date, status } = req.body;

  const studentId = parseId(student_id);

  if (studentId === null || !date || !status) {
    return res.status(400).json({
      success: false,
      message: 'student_id, date, and status are required.',
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
    const { rows: studentRows } = await pool.query('SELECT * FROM students WHERE id = ? LIMIT 1', [studentId]);
    const student = studentRows[0];

    if (req.user.role === 'admin') {
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
    } else {
      // Collapse "student doesn't exist" and "exists but out of scope" into the
      // same 403 — a teacher probing student ids shouldn't be able to tell which.
      // student.section_id can be NULL (VARCHAR section didn't match any seeded
      // section) — the && short-circuit denies that case too, correctly.
      const allowed =
        student && student.section_id && (await teacherIsAdviserOfSection(req.user.id, student.section_id));
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "You are not the adviser of this student's section.",
        });
      }
    }

    if (student.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot record attendance for an inactive student.' });
    }

    // The upsert names its conflict target, uq_attendance (student_id, date);
    // EXCLUDED is the row the INSERT proposed, MySQL's VALUES(col). updated_at
    // moves only on a real change, through portal.touch_updated_at — as MySQL's
    // ON UPDATE CURRENT_TIMESTAMP did.
    await pool.query(
      `INSERT INTO attendance (student_id, date, status, recorded_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by`,
      [studentId, date, status, req.user.id]
    );

    const { rows } = await pool.query('SELECT * FROM attendance WHERE student_id = ? AND date = ? LIMIT 1', [
      studentId,
      date,
    ]);

    await logActivity(req.user.id, 'record_attendance', `Recorded ${status} for student #${studentId}, ${date}`);

    return res.status(201).json({ success: true, message: 'Attendance recorded.', attendance: rows[0] });
  } catch (error) {
    console.error('Record attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record attendance.' });
  }
});

// POST /api/attendance/bulk — record a whole section roster for one date.
// This is the primary path now: one section, one date, whole roster,
// matching how the adviser actually takes attendance during Homeroom
// Guidance. All-or-nothing: every entry is validated before anything is
// written, then written in one transaction.
router.post('/bulk', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { section_id, date, entries } = req.body;

  const sectionId = parseId(section_id);

  if (sectionId === null || !date || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'section_id, date, and a non-empty entries array are required.',
    });
  }

  if (!isValidDateFormat(date)) {
    return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
  }

  if (isFutureDate(date)) {
    return res.status(400).json({ success: false, message: 'date cannot be in the future.' });
  }

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
      const allowed = await teacherIsAdviserOfSection(req.user.id, sectionId);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'You are not the adviser of this section.',
        });
      }
    }

    // = ANY(?::int[]): mysql2 expanded IN (?), PostgreSQL does not.
    const { rows: students } = await pool.query('SELECT id, status, section_id FROM students WHERE id = ANY(?::int[])', [
      studentIds,
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));

    for (const studentId of studentIds) {
      const student = studentMap.get(studentId);
      if (!student || student.section_id !== sectionId) {
        return res.status(400).json({
          success: false,
          message: `Student #${studentId} is not in this section.`,
        });
      }
      if (student.status !== 'active') {
        return res.status(400).json({ success: false, message: `Student #${studentId} is not active.` });
      }
    }

    // One checked-out client for the transaction (config/db.js connect()).
    conn = await pool.connect();
    await conn.beginTransaction();

    // Each entry writes the id THAT WAS VALIDATED (studentIds[i]), not the raw
    // body value: mysql2 and MySQL coerced a JSON true, "5.0" or [5] to the
    // same number parseId read, while PostgreSQL's integer input refuses them
    // (22P02) and the adapter refuses an array — so the parsed id keeps
    // MySQL's outcome (P3-C-R2, the route-port review).
    for (let i = 0; i < entries.length; i += 1) {
      await conn.query(
        `INSERT INTO attendance (student_id, date, status, recorded_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by`,
        [studentIds[i], date, entries[i].status, req.user.id]
      );
    }

    await conn.commit();

    // ORDER BY student_id: MySQL's range read on uq_attendance (student_id,
    // date) returned the rows in that order; a PostgreSQL heap returns a
    // re-marked row after the others.
    const { rows } = await pool.query(
      'SELECT * FROM attendance WHERE date = ? AND student_id = ANY(?::int[]) ORDER BY student_id',
      [date, studentIds]
    );

    await logActivity(
      req.user.id,
      'bulk_record_attendance',
      `Recorded attendance for ${studentIds.length} students, section #${sectionId}, ${date}`
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

// PUT /api/attendance/:id — correct an entry. Advisers are scoped to their
// own section (out-of-scope or nonexistent id both return 404); admin is
// unscoped. Not routed through teacherIsAdviserOfSection — this starts from
// an attendance id, not a known section_id, so it joins students/sections
// directly in one query instead.
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
      const { rows } = await pool.query(
        `SELECT a.* FROM attendance a
         JOIN students s ON s.id = a.student_id
         JOIN sections sec ON sec.id = s.section_id
         WHERE a.id = ? AND sec.adviser_id = ?
         LIMIT 1`,
        [id, req.user.id]
      );
      existing = rows[0];
    } else {
      const { rows } = await pool.query('SELECT * FROM attendance WHERE id = ? LIMIT 1', [id]);
      existing = rows[0];
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    }

    await pool.query('UPDATE attendance SET status = ?, recorded_by = ? WHERE id = ?', [status, req.user.id, id]);

    const { rows } = await pool.query('SELECT * FROM attendance WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'correct_attendance', `Corrected attendance #${id} to ${status}`);

    return res.json({ success: true, message: 'Attendance updated.', attendance: rows[0] });
  } catch (error) {
    console.error('Update attendance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update attendance.' });
  }
});

module.exports = router;
