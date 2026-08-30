const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { isValidDateFormat } = require('../utils/dateFormat');

const router = express.Router();

function isValidGradeLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

async function getStudentClass(studentId) {
  const [rows] = await pool.query('SELECT grade_level, section FROM students WHERE id = ? LIMIT 1', [studentId]);
  return rows[0] || null;
}

async function teacherHasGradeAssignment(teacherId, gradeLevel) {
  const [rows] = await pool.query(
    'SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND grade_level = ? LIMIT 1',
    [teacherId, gradeLevel]
  );
  return rows.length > 0;
}

// grade_level is NOT NULL on this table — unlike announcements/events, there is
// no school-wide option to reject; every contribution targets exactly one grade.
async function resolveContributionGrade(user, gradeLevelInput) {
  if (gradeLevelInput === undefined || gradeLevelInput === null) {
    return { ok: false, status: 400, message: 'grade_level is required.' };
  }
  if (!isValidGradeLevel(gradeLevelInput)) {
    return { ok: false, status: 400, message: 'grade_level must be between 1 and 6.' };
  }
  const gradeLevel = Number(gradeLevelInput);

  if (user.role === 'admin') {
    return { ok: true, gradeLevel };
  }

  const allowed = await teacherHasGradeAssignment(user.id, gradeLevel);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      message: `You are not assigned to Grade ${gradeLevel}. You may only post contributions for a grade you teach.`,
    };
  }
  return { ok: true, gradeLevel };
}

// Shared read-scoping for a single contribution — collapses "doesn't exist" and
// "exists but out of scope" into the same null, same anti-enumeration pattern
// used everywhere else in this API.
async function getScopedContribution(user, id) {
  if (user.role === 'admin') {
    const [rows] = await pool.query('SELECT * FROM contributions WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }
  if (user.role === 'teacher') {
    const [rows] = await pool.query(
      `SELECT c.* FROM contributions c
       WHERE c.id = ?
         AND EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = ? AND ta.grade_level = c.grade_level)
       LIMIT 1`,
      [id, user.id]
    );
    return rows[0] || null;
  }
  // parent
  const student = await getStudentClass(user.student_id);
  if (!student) return null;
  const [rows] = await pool.query('SELECT * FROM contributions WHERE id = ? AND grade_level = ? LIMIT 1', [
    id,
    student.grade_level,
  ]);
  return rows[0] || null;
}

// GET /api/contributions — list, scoped by role (grade-only, contributions have no section)
router.get('/', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const { grade_level } = req.query;
  const conditions = [];
  const params = [];

  try {
    if (req.user.role === 'parent') {
      const student = await getStudentClass(req.user.student_id);
      if (!student) {
        return res.json({ success: true, contributions: [] });
      }
      conditions.push('c.grade_level = ?');
      params.push(student.grade_level);
    } else if (req.user.role === 'teacher') {
      conditions.push(`EXISTS (
        SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = ? AND ta.grade_level = c.grade_level
      )`);
      params.push(req.user.id);
    }
    // admin: no condition

    if (grade_level !== undefined) {
      if (!isValidGradeLevel(grade_level)) {
        return res.status(400).json({ success: false, message: 'grade_level must be between 1 and 6.' });
      }
      conditions.push('c.grade_level = ?');
      params.push(Number(grade_level));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`SELECT c.* FROM contributions c ${where} ORDER BY c.created_at DESC`, params);

    return res.json({ success: true, contributions: rows });
  } catch (error) {
    console.error('List contributions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contributions.' });
  }
});

// GET /api/contributions/my-records — parent only. Must be registered before
// GET /:id, or Express would try to parse "my-records" as an id.
router.get('/my-records', authenticate, authorize('parent'), async (req, res) => {
  try {
    const student = await getStudentClass(req.user.student_id);
    if (!student) {
      return res.json({ success: true, records: [] });
    }

    // Joins on cr.student_id = req.user.student_id only — never touches any
    // other student's row, individually or in aggregate.
    const [rows] = await pool.query(
      `SELECT c.id AS contribution_id, c.title, c.amount AS fee_amount, c.due_date,
              COALESCE(cr.status, 'Pending') AS status,
              COALESCE(cr.amount, c.amount) AS amount,
              cr.updated_at
       FROM contributions c
       LEFT JOIN contribution_records cr ON cr.contribution_id = c.id AND cr.student_id = ?
       WHERE c.grade_level = ?
       ORDER BY c.due_date IS NULL, c.due_date ASC, c.created_at DESC`,
      [req.user.student_id, student.grade_level]
    );

    return res.json({ success: true, records: rows });
  } catch (error) {
    console.error('Get my contribution records error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contribution records.' });
  }
});

// GET /api/contributions/:id — single, scoped, 404 on any violation
router.get('/:id', authenticate, authorize('teacher', 'admin', 'parent'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid contribution id.' });
  }

  try {
    const contribution = await getScopedContribution(req.user, id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }
    return res.json({ success: true, contribution });
  } catch (error) {
    console.error('Get contribution error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contribution.' });
  }
});

// GET /api/contributions/:id/records — roster with status. Lazy: every active
// student in the contribution's grade, LEFT JOINed against any existing
// contribution_records row, defaulting to Pending when none exists yet.
router.get('/:id/records', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid contribution id.' });
  }

  try {
    const contribution = await getScopedContribution(req.user, id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }

    const [rows] = await pool.query(
      `SELECT s.id AS student_id, s.lrn, s.first_name, s.last_name, s.grade_level, s.section,
              COALESCE(cr.status, 'Pending') AS status,
              COALESCE(cr.amount, ?) AS amount,
              cr.updated_at, cr.updated_by
       FROM students s
       LEFT JOIN contribution_records cr ON cr.contribution_id = ? AND cr.student_id = s.id
       WHERE s.grade_level = ? AND s.status = 'active'
       ORDER BY s.last_name, s.first_name`,
      [contribution.amount, id, contribution.grade_level]
    );

    return res.json({ success: true, contribution, records: rows });
  } catch (error) {
    console.error('Get contribution roster error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contribution roster.' });
  }
});

// POST /api/contributions — create. Teachers scoped to a grade they're assigned to.
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const { title, amount, grade_level, due_date } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, message: 'title is required.' });
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ success: false, message: 'amount must be a positive number.' });
  }

  if (due_date !== undefined && due_date !== null && !isValidDateFormat(due_date)) {
    return res.status(400).json({ success: false, message: 'due_date must be in YYYY-MM-DD format.' });
  }

  const target = await resolveContributionGrade(req.user, grade_level);
  if (!target.ok) {
    return res.status(target.status).json({ success: false, message: target.message });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO contributions (title, amount, grade_level, due_date, posted_by) VALUES (?, ?, ?, ?, ?)',
      [title, amountNum, target.gradeLevel, due_date || null, req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM contributions WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(
      req.user.id,
      'create_contribution',
      `Posted contribution "${title}" for Grade ${target.gradeLevel}`
    );

    return res.status(201).json({ success: true, message: 'Contribution posted.', contribution: rows[0] });
  } catch (error) {
    console.error('Create contribution error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post contribution.' });
  }
});

// PUT /api/contributions/:id — author or admin
router.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid contribution id.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM contributions WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only edit your own contributions.' });
    }

    const { title, amount, grade_level, due_date } = req.body;
    const nextTitle = title !== undefined ? title : existing.title;
    const nextAmountInput = amount !== undefined ? amount : existing.amount;
    const nextGradeInput = grade_level !== undefined ? grade_level : existing.grade_level;
    // existing.due_date is already a plain 'YYYY-MM-DD' string (or null, if
    // unset) — the pool's dateStrings: ['DATE'] option means DATE columns
    // never come back as JS Date objects, so no conversion is needed here.
    const nextDueDate = due_date !== undefined ? due_date : existing.due_date;

    if (!nextTitle) {
      return res.status(400).json({ success: false, message: 'title is required.' });
    }

    const nextAmount = Number(nextAmountInput);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number.' });
    }

    if (nextDueDate && !isValidDateFormat(nextDueDate)) {
      return res.status(400).json({ success: false, message: 'due_date must be in YYYY-MM-DD format.' });
    }

    const target = await resolveContributionGrade(req.user, nextGradeInput);
    if (!target.ok) {
      return res.status(target.status).json({ success: false, message: target.message });
    }

    await pool.query('UPDATE contributions SET title = ?, amount = ?, grade_level = ?, due_date = ? WHERE id = ?', [
      nextTitle,
      nextAmount,
      target.gradeLevel,
      nextDueDate || null,
      id,
    ]);

    const [updated] = await pool.query('SELECT * FROM contributions WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_contribution', `Updated contribution "${nextTitle}" (#${id})`);

    return res.json({ success: true, message: 'Contribution updated.', contribution: updated[0] });
  } catch (error) {
    console.error('Update contribution error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update contribution.' });
  }
});

// DELETE /api/contributions/:id — author or admin. Blocked with 409, naming the
// count, if any contribution_records exist (the FK is ON DELETE CASCADE — a
// plain delete would silently wipe payment history with no recovery).
router.delete('/:id', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid contribution id.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM contributions WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }
    if (req.user.role !== 'admin' && existing.posted_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You may only delete your own contributions.' });
    }

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM contribution_records WHERE contribution_id = ?',
      [id]
    );
    const count = countRows[0].count;

    if (count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete. ${count} payment record${count === 1 ? '' : 's'} exist${
          count === 1 ? 's' : ''
        } for this contribution. Clear the payment records first if you need to remove it.`,
      });
    }

    await pool.query('DELETE FROM contributions WHERE id = ?', [id]);
    await logActivity(req.user.id, 'delete_contribution', `Deleted contribution "${existing.title}" (#${id})`);

    return res.json({ success: true, message: 'Contribution deleted.' });
  } catch (error) {
    console.error('Delete contribution error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete contribution.' });
  }
});

// PATCH /api/contributions/:id/records/:studentId — mark paid/pending. An amount
// override is allowed (a student can owe less than the full fee — discount or
// partial arrangement) but can never exceed the contribution's amount.
router.patch('/:id/records/:studentId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const studentId = parseId(req.params.studentId);
  if (id === null || studentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  const { status, amount } = req.body;
  if (status !== 'Paid' && status !== 'Pending') {
    return res.status(400).json({ success: false, message: "status must be 'Paid' or 'Pending'." });
  }

  try {
    const contribution = await getScopedContribution(req.user, id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution not found.' });
    }

    const [studentRows] = await pool.query(
      `SELECT id FROM students WHERE id = ? AND grade_level = ? AND status = 'active' LIMIT 1`,
      [studentId, contribution.grade_level]
    );
    if (!studentRows.length) {
      return res.status(404).json({ success: false, message: 'Student not found in this roster.' });
    }

    const feeAmount = Number(contribution.amount);

    const [existingRecordRows] = await pool.query(
      'SELECT amount FROM contribution_records WHERE contribution_id = ? AND student_id = ? LIMIT 1',
      [id, studentId]
    );
    // Default to whatever amount is already on record (so a status-only PATCH
    // doesn't silently reset a previously-set discount back to full price);
    // fall back to the full fee if this is the first time this student's
    // record is touched.
    let recordAmount = existingRecordRows.length ? Number(existingRecordRows[0].amount) : feeAmount;

    if (amount !== undefined && amount !== null) {
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ success: false, message: 'amount must be a positive number.' });
      }
      if (amountNum > feeAmount) {
        return res.status(400).json({
          success: false,
          message: `amount cannot exceed the contribution's fee of ${feeAmount.toFixed(2)}.`,
        });
      }
      recordAmount = amountNum;
    }

    await pool.query(
      `INSERT INTO contribution_records (contribution_id, student_id, amount, status, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = VALUES(status), updated_by = VALUES(updated_by)`,
      [id, studentId, recordAmount, status, req.user.id]
    );

    const [rows] = await pool.query(
      'SELECT * FROM contribution_records WHERE contribution_id = ? AND student_id = ? LIMIT 1',
      [id, studentId]
    );

    await logActivity(
      req.user.id,
      'update_contribution_record',
      `Marked student #${studentId} ${status} for contribution #${id}`
    );

    return res.json({ success: true, message: 'Payment status updated.', record: rows[0] });
  } catch (error) {
    console.error('Update contribution record error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update payment status.' });
  }
});

module.exports = router;
