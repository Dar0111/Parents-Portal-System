const express = require('express');
const pool = require('../config/db');
const { comparePassword, hashPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { sanitizeUser } = require('../utils/sanitizeUser');

const router = express.Router();

async function fetchUserByLoginId(loginId) {
  const [rows] = await pool.query(
    `SELECT u.*, s.lrn, s.first_name AS student_first_name, s.last_name AS student_last_name,
            s.grade_level, s.section
     FROM users u
     LEFT JOIN students s ON s.id = u.student_id
     WHERE u.login_id = ?
     LIMIT 1`,
    [loginId]
  );
  return rows[0] || null;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { login_id, password } = req.body;

  if (!login_id || !password) {
    return res.status(400).json({ success: false, message: 'login_id and password are required.' });
  }

  try {
    const user = await fetchUserByLoginId(String(login_id).trim());

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Account pending admin approval.',
        status: 'pending',
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: user.rejection_reason || 'Account was rejected by the administrator.',
        status: 'rejected',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.',
        status: user.status,
      });
    }

    const token = signToken({
      id: user.id,
      role: user.role,
      login_id: user.login_id,
      student_id: user.student_id || null,
    });

    await logActivity(user.id, 'login', `${user.role} logged in`);

    return res.json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      message: 'current_password and new_password are required.',
    });
  }

  if (String(new_password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters.',
    });
  }

  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const valid = await comparePassword(current_password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashed = await hashPassword(new_password);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    await logActivity(req.user.id, 'change_password', 'Password updated');

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// PUT /api/auth/contact — any authenticated user updates their own
// contact_number. Identity (name, LRN/login_id, role, student_id, email)
// is school-owned: sending those fields is 400, same loud-reject as
// PUT /api/users/:id, not a silent ignore. Id comes from req.user
// (authenticate re-reads the DB row), never the body.
const CONTACT_FORBIDDEN_FIELDS = [
  'name',
  'email',
  'login_id',
  'lrn',
  'role',
  'student_id',
  'password',
  'status',
];

router.put('/contact', authenticate, async (req, res) => {
  const body = req.body || {};
  const sentForbidden = CONTACT_FORBIDDEN_FIELDS.filter((field) => body[field] !== undefined);
  if (sentForbidden.length) {
    return res.status(400).json({
      success: false,
      message: `Cannot change ${sentForbidden.join(', ')} through this endpoint.`,
    });
  }

  if (body.contact_number === undefined) {
    return res.status(400).json({ success: false, message: 'contact_number is required.' });
  }

  const nextContact = String(body.contact_number).trim();
  if (!nextContact) {
    return res.status(400).json({ success: false, message: 'contact_number must not be empty.' });
  }
  if (nextContact.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'contact_number must be at most 20 characters.',
    });
  }

  try {
    await pool.query('UPDATE users SET contact_number = ? WHERE id = ?', [nextContact, req.user.id]);
    await logActivity(req.user.id, 'update_contact', 'Contact number updated');

    // Re-fetch via login_id so the JOIN student fields stay on the row —
    // a bare SELECT * after this UPDATE would drop lrn / student names
    // that GET /me already returns.
    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      message: 'Contact number updated.',
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Update contact error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update contact number.' });
  }
});

module.exports = router;
