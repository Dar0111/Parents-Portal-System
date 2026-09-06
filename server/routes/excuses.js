const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { isValidDateFormat, todayLocalDateString } = require('../utils/dateFormat');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');

const router = express.Router();

// CRUD half — submit, list, view, edit — plus PATCH /:id/review
// (approve/decline). Both school-visit blockers on review are answered:
// the section ADVISER only may review (not any assigned teacher), and
// review never touches the attendance table (the learner stays Absent;
// the letter documents the reason, nothing more).
const VALID_STATUSES = ['Pending', 'Approved', 'Declined']; // for ?status= filter validation only


function isFutureDate(value) {
  return value > todayLocalDateString();
}

// GET /api/excuse-letters/mine — parent only. Declared before GET /:id:
// routing is first-match, and parseId('mine') would otherwise fire first
// and return 400 for every request to this path.
router.get('/mine', authenticate, authorize('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM excuse_letters WHERE parent_id = ? ORDER BY absence_date DESC, id DESC',
      [req.user.id]
    );
    return res.json({ success: true, excuse_letters: rows });
  } catch (error) {
    console.error('List own excuse letters error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letters.' });
  }
});

// GET /api/excuse-letters — teacher, admin. Admin sees all; teacher sees
// only letters for students they're assigned to — same EXISTS-against-
// teacher_assignments shape routes/students.js uses for its own list
// (matched on the student's grade_level + section, since neither column
// lives on excuse_letters itself).
router.get('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { status, student_id, from, to } = req.query;

  const conditions = [];
  const params = [];

  if (req.user.role === 'teacher') {
    conditions.push(TEACHER_VIEW_SCOPE_SQL);
    params.push(...teacherViewScopeParams(req.user.id));
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${VALID_STATUSES.join(', ')}.` });
    }
    conditions.push('el.status = ?');
    params.push(status);
  }

  if (student_id !== undefined) {
    const studentId = parseId(student_id);
    if (studentId === null) {
      return res.status(400).json({ success: false, message: 'Invalid student_id filter.' });
    }
    conditions.push('el.student_id = ?');
    params.push(studentId);
  }

  if (from !== undefined) {
    if (!isValidDateFormat(from)) {
      return res.status(400).json({ success: false, message: 'from must be in YYYY-MM-DD format.' });
    }
    conditions.push('el.absence_date >= ?');
    params.push(from);
  }

  if (to !== undefined) {
    if (!isValidDateFormat(to)) {
      return res.status(400).json({ success: false, message: 'to must be in YYYY-MM-DD format.' });
    }
    conditions.push('el.absence_date <= ?');
    params.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT el.*, s.first_name, s.last_name, s.grade_level, s.section
       FROM excuse_letters el
       JOIN students s ON s.id = el.student_id
       ${where}
       ORDER BY el.absence_date DESC, el.id DESC`,
      params
    );

    return res.json({ success: true, excuse_letters: rows });
  } catch (error) {
    console.error('List excuse letters error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letters.' });
  }
});

// GET /api/excuse-letters/:id — all roles, scoped. Reads that fall outside
// scope return 404 (anti-enumeration), never 403.
router.get('/:id', authenticate, authorize('parent', 'teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  try {
    if (req.user.role === 'parent') {
      const [rows] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? AND parent_id = ? LIMIT 1', [
        id,
        req.user.id,
      ]);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
      }
      return res.json({ success: true, excuse_letter: rows[0] });
    }

    if (req.user.role === 'teacher') {
      const [rows] = await pool.query(
        `SELECT el.* FROM excuse_letters el
         JOIN students s ON s.id = el.student_id
         WHERE el.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, ...teacherViewScopeParams(req.user.id)]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
      }
      return res.json({ success: true, excuse_letter: rows[0] });
    }

    // admin
    const [rows] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }
    return res.json({ success: true, excuse_letter: rows[0] });
  } catch (error) {
    console.error('Get excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch excuse letter.' });
  }
});

// POST /api/excuse-letters — parent only. parent_id/student_id come from
// the authenticated user, never the body; status is always 'Pending' on
// create. attachment_url is not accepted — upload isn't built, stays NULL.
router.post('/', authenticate, authorize('parent'), async (req, res) => {
  const { absence_date, reason, details } = req.body;

  if (!absence_date || !reason || !String(reason).trim()) {
    return res.status(400).json({
      success: false,
      message: 'absence_date and reason are required.',
    });
  }

  if (!isValidDateFormat(absence_date)) {
    return res.status(400).json({ success: false, message: 'absence_date must be in YYYY-MM-DD format.' });
  }

  if (isFutureDate(absence_date)) {
    return res.status(400).json({ success: false, message: 'absence_date cannot be in the future.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason, details)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.student_id, req.user.id, absence_date, reason, details || null]
    );

    const [rows] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'submit_excuse_letter',
      `Submitted excuse letter for student #${req.user.student_id}, absence on ${absence_date}`
    );

    return res.status(201).json({ success: true, message: 'Excuse letter submitted.', excuse_letter: rows[0] });
  } catch (error) {
    console.error('Submit excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit excuse letter.' });
  }
});

// PUT /api/excuse-letters/:id — parent, own letter, only while Pending.
// Editable: absence_date, reason, details only — status/teacher_remarks/
// reviewed_by/parent_id/student_id are never read from the body at all.
router.put('/:id', authenticate, authorize('parent'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  const { absence_date, reason, details } = req.body;

  if (absence_date !== undefined) {
    if (!isValidDateFormat(absence_date)) {
      return res.status(400).json({ success: false, message: 'absence_date must be in YYYY-MM-DD format.' });
    }
    if (isFutureDate(absence_date)) {
      return res.status(400).json({ success: false, message: 'absence_date cannot be in the future.' });
    }
  }

  if (reason !== undefined && !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason must not be empty.' });
  }

  try {
    // Read-scope fails first: not found or not this parent's letter both
    // return the same 404, so a parent probing ids can't distinguish them.
    const [rows] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? AND parent_id = ? LIMIT 1', [
      id,
      req.user.id,
    ]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }

    if (existing.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed and can no longer be edited.',
      });
    }

    // Absent fields keep the existing value — no computed default.
    const nextAbsenceDate = absence_date !== undefined ? absence_date : existing.absence_date;
    const nextReason = reason !== undefined ? reason : existing.reason;
    const nextDetails = details !== undefined ? details || null : existing.details;

    await pool.query(
      'UPDATE excuse_letters SET absence_date = ?, reason = ?, details = ? WHERE id = ?',
      [nextAbsenceDate, nextReason, nextDetails, id]
    );

    const [updated] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_excuse_letter', `Updated excuse letter #${id}`);

    return res.json({ success: true, message: 'Excuse letter updated.', excuse_letter: updated[0] });
  } catch (error) {
    console.error('Update excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update excuse letter.' });
  }
});

// PATCH /api/excuse-letters/:id/review — adviser of the student's section,
// or admin. This is a documentation act only: it writes status,
// teacher_remarks, and reviewed_by, nothing else. It must NEVER touch the
// attendance table — the school was explicit that an approved excuse
// letter does not change the learner's attendance record ("excuse lang
// yung bata pero absent pa rin"). This exact constraint blocked the
// endpoint for weeks; do not "helpfully" add an attendance write here.
router.patch('/:id/review', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid excuse letter id.' });
  }

  const { status, teacher_remarks } = req.body;
  const REVIEW_STATUSES = ['Approved', 'Declined'];
  if (!REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of ${REVIEW_STATUSES.join(', ')}.`,
    });
  }

  try {
    let existing;

    if (req.user.role === 'admin') {
      const [rows] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
      existing = rows[0];
    } else {
      // Same existence/read-scope query GET /:id already uses for a teacher —
      // assigned to the class OR adviser of the section. A teacher who can't
      // even GET this letter gets the same 404 here — never a leak that the
      // id exists.
      //
      // This clause MUST be the wide one. It is an existence check, not the
      // authority gate: the adviser check below is the authority, and it does
      // not move. Narrowing this back to teacher_assignments would 404 an
      // adviser out before they ever reach the check they would pass — which
      // is exactly the bug fixed on 2026-09-06.
      const [rows] = await pool.query(
        `SELECT el.*, s.grade_level, s.section, s.section_id
         FROM excuse_letters el
         JOIN students s ON s.id = el.student_id
         WHERE el.id = ?
           AND ${TEACHER_VIEW_SCOPE_SQL}
         LIMIT 1`,
        [id, ...teacherViewScopeParams(req.user.id)]
      );
      existing = rows[0];
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Excuse letter not found.' });
    }

    if (req.user.role === 'teacher') {
      // Read-scope above is teacher_assignments-based — any assigned
      // teacher can see the letter. Review authority is narrower: the
      // section ADVISER only (school-confirmed). A non-adviser teacher
      // who reached this point already got 200 from GET /:id on this
      // same id, so 404 here would contradict GET and hide nothing —
      // 403 naming the reason instead. Deliberately NOT matching
      // PUT /api/attendance/:id's 404-for-out-of-scope precedent: that
      // precedent holds there because attendance's read-scope and
      // write-scope are both adviser-only already, so GET and PUT never
      // disagree. Here they can, so this is an intentional exception —
      // do not "fix" it back to 404.
      let isAdviser = false;
      if (existing.section_id) {
        const [adviserRows] = await pool.query('SELECT 1 FROM sections WHERE id = ? AND adviser_id = ? LIMIT 1', [
          existing.section_id,
          req.user.id,
        ]);
        isAdviser = adviserRows.length > 0;
      }
      // existing.section_id can be NULL (VARCHAR section never matched a
      // seeded section) — isAdviser stays false, so only admin can review
      // that letter. Same accepted edge case as attendance.js.

      if (!isAdviser) {
        return res.status(403).json({
          success: false,
          message: "Only the adviser of this student's section can review excuse letters.",
        });
      }
    }

    if (existing.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'This excuse letter has already been reviewed.',
      });
    }

    const remarks = teacher_remarks || null;

    // Writes ONLY status, teacher_remarks, reviewed_by (+ updated_at via
    // ON UPDATE CURRENT_TIMESTAMP). See the constraint noted at the top
    // of this handler — attendance is never touched here.
    await pool.query('UPDATE excuse_letters SET status = ?, teacher_remarks = ?, reviewed_by = ? WHERE id = ?', [
      status,
      remarks,
      req.user.id,
      id,
    ]);

    const [updated] = await pool.query('SELECT * FROM excuse_letters WHERE id = ? LIMIT 1', [id]);
    await logActivity(
      req.user.id,
      'review_excuse_letter',
      `Reviewed excuse letter #${id}: ${existing.status} -> ${status}`
    );

    return res.json({ success: true, message: 'Excuse letter reviewed.', excuse_letter: updated[0] });
  } catch (error) {
    console.error('Review excuse letter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to review excuse letter.' });
  }
});

module.exports = router;
