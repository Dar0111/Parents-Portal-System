const express = require('express');
const pool = require('../config/db');
const { hashPassword } = require('../utils/password');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

// POST /api/users/teachers — Admin creates teacher (active immediately)
router.post('/teachers', authenticate, authorize('admin'), async (req, res) => {
  const { login_id, password, name, email, contact_number } = req.body;

  if (!login_id || !password || !name) {
    return res.status(400).json({
      success: false,
      message: 'login_id, password, and name are required.',
    });
  }

  const trimmedLoginId = String(login_id).trim();
  if (trimmedLoginId.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'login_id must be 20 characters or fewer.',
    });
  }

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [
      trimmedLoginId,
    ]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Login ID already exists.' });
    }

    const hashed = await hashPassword(password);
    const [result] = await pool.query(
      `INSERT INTO users (login_id, password, role, status, name, email, contact_number, created_by)
       VALUES (?, ?, 'teacher', 'active', ?, ?, ?, ?)`,
      [trimmedLoginId, hashed, name, email || null, contact_number || null, req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(req.user.id, 'create_teacher', `Created teacher account ${login_id}`);

    return res.status(201).json({
      success: true,
      message: 'Teacher account created and activated.',
      user: sanitizeUser(rows[0]),
    });
  } catch (error) {
    console.error('Create teacher error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create teacher account.' });
  }
});

// POST /api/users/parents — Teacher creates parent account (pending approval)
router.post('/parents', authenticate, authorize('teacher'), async (req, res) => {
  const { lrn, password, name, email, contact_number } = req.body;

  if (!lrn || !password || !name) {
    return res.status(400).json({
      success: false,
      message: 'lrn, password, and guardian name are required.',
    });
  }

  const loginId = String(lrn).trim();

  try {
    const [students] = await pool.query('SELECT id, lrn FROM students WHERE lrn = ? LIMIT 1', [loginId]);
    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: 'Student with this LRN not found. Enroll the student first.',
      });
    }
    const student = students[0];

    const [existingUser] = await pool.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [loginId]);
    if (existingUser.length) {
      return res.status(409).json({ success: false, message: 'Parent account for this LRN already exists.' });
    }

    const [existingParent] = await pool.query(
      'SELECT id FROM users WHERE student_id = ? AND role = ? LIMIT 1',
      [student.id, 'parent']
    );
    if (existingParent.length) {
      return res.status(409).json({ success: false, message: 'A parent account is already linked to this student.' });
    }

    const hashed = await hashPassword(password);
    const [result] = await pool.query(
      `INSERT INTO users (login_id, password, role, status, name, email, contact_number, student_id, created_by)
       VALUES (?, ?, 'parent', 'pending', ?, ?, ?, ?, ?)`,
      [loginId, hashed, name, email || null, contact_number || null, student.id, req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT u.*, s.lrn, s.first_name AS student_first_name, s.last_name AS student_last_name
       FROM users u
       JOIN students s ON s.id = u.student_id
       WHERE u.id = ? LIMIT 1`,
      [result.insertId]
    );

    await logActivity(req.user.id, 'create_parent', `Created pending parent account for LRN ${loginId}`);

    return res.status(201).json({
      success: true,
      message: 'Parent account created. Pending admin approval.',
      user: sanitizeUser(rows[0]),
    });
  } catch (error) {
    console.error('Create parent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create parent account.' });
  }
});

// GET /api/users/parents/pending — Admin lists pending parent accounts
router.get('/parents/pending', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.login_id, u.name, u.email, u.contact_number, u.status, u.created_at,
              s.lrn, s.first_name AS student_first_name, s.last_name AS student_last_name,
              s.grade_level, s.section,
              creator.name AS created_by_name
       FROM users u
       JOIN students s ON s.id = u.student_id
       LEFT JOIN users creator ON creator.id = u.created_by
       WHERE u.role = 'parent' AND u.status = 'pending'
       ORDER BY u.created_at ASC`
    );

    return res.json({ success: true, parents: rows });
  } catch (error) {
    console.error('List pending parents error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending accounts.' });
  }
});

// PUT /api/users/parents/:id/approve — Admin approves parent account
router.put('/parents/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  const parentId = parseId(req.params.id);
  if (parentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE id = ? AND role = 'parent' LIMIT 1`,
      [parentId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Parent account not found.' });
    }

    const parent = rows[0];
    if (parent.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Account is already ${parent.status}.`,
      });
    }

    await pool.query(
      `UPDATE users SET status = 'active', approved_by = ?, rejection_reason = NULL WHERE id = ?`,
      [req.user.id, parentId]
    );

    const [updated] = await pool.query(
      `SELECT u.*, s.lrn, s.first_name AS student_first_name, s.last_name AS student_last_name
       FROM users u JOIN students s ON s.id = u.student_id WHERE u.id = ? LIMIT 1`,
      [parentId]
    );

    await logActivity(req.user.id, 'approve_parent', `Approved parent account LRN ${parent.login_id}`);

    return res.json({
      success: true,
      message: 'Parent account approved and activated.',
      user: sanitizeUser(updated[0]),
    });
  } catch (error) {
    console.error('Approve parent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve account.' });
  }
});

// PUT /api/users/parents/:id/reject — Admin rejects parent account
router.put('/parents/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  const parentId = parseId(req.params.id);
  if (parentId === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE id = ? AND role = 'parent' LIMIT 1`,
      [parentId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Parent account not found.' });
    }

    const parent = rows[0];
    if (parent.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Account is already ${parent.status}.`,
      });
    }

    await pool.query(
      `UPDATE users SET status = 'rejected', approved_by = ?, rejection_reason = ? WHERE id = ?`,
      [req.user.id, String(reason).trim(), parentId]
    );

    await logActivity(req.user.id, 'reject_parent', `Rejected parent account LRN ${parent.login_id}`);

    return res.json({
      success: true,
      message: 'Parent account rejected.',
    });
  } catch (error) {
    console.error('Reject parent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject account.' });
  }
});

module.exports = router;
