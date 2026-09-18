const express = require('express');
const pool = require('../config/db');
const { hashPassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRule');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { sanitizeUser } = require('../utils/sanitizeUser');

const router = express.Router();

// POST /api/users/teachers — Admin creates teacher (active immediately)
router.post('/teachers', authenticate, authorize('admin'), async (req, res) => {
  const { login_id, password, name, email, contact_number } = req.body;

  if (!login_id || !password || !name) {
    return res.status(400).json({
      success: false,
      message: 'login_id, password, and name are required.',
    });
  }

  // The one password rule (utils/passwordRule.js); `field` names the input.
  const ruleError = validateNewPassword(password);
  if (ruleError) {
    return res.status(400).json({ success: false, message: ruleError, field: 'password' });
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

  // The one password rule (utils/passwordRule.js); `field` names the input.
  // Checked before the student lookup so a weak password never reveals
  // whether an LRN exists.
  const ruleError = validateNewPassword(password);
  if (ruleError) {
    return res.status(400).json({ success: false, message: ruleError, field: 'password' });
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

// GET /api/users — Admin lists all users, filterable
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const { role, status, search } = req.query;

  const conditions = [];
  const params = [];

  if (role !== undefined) {
    if (!['parent', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be 'parent', 'teacher', or 'admin'." });
    }
    conditions.push('role = ?');
    params.push(role);
  }

  if (status !== undefined) {
    if (!['pending', 'active', 'rejected', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be 'pending', 'active', 'rejected', or 'inactive'.",
      });
    }
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    const term = `%${String(search).trim()}%`;
    conditions.push('(name LIKE ? OR login_id LIKE ?)');
    params.push(term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(`SELECT * FROM users ${where} ORDER BY created_at DESC`, params);
    return res.json({ success: true, users: rows.map(sanitizeUser) });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// GET /api/users/:id — Admin views a single user
router.get('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: sanitizeUser(rows[0]) });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
});

// PUT /api/users/:id — Admin edits name/email/contact_number only. role,
// login_id, student_id, password, and status are set at creation or through
// their own dedicated endpoints — sending them here is rejected outright
// rather than silently ignored, so a bug that tries to smuggle a role change
// through this route fails loudly instead of quietly no-op'ing.
const PUT_FORBIDDEN_FIELDS = ['role', 'login_id', 'student_id', 'password', 'status'];

router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  const sentForbidden = PUT_FORBIDDEN_FIELDS.filter((field) => req.body[field] !== undefined);
  if (sentForbidden.length) {
    return res.status(400).json({
      success: false,
      message: `Cannot change ${sentForbidden.join(', ')} through this endpoint.`,
    });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { name, email, contact_number } = req.body;
    const nextName = name !== undefined ? name : existing.name;
    const nextEmail = email !== undefined ? email || null : existing.email;
    const nextContact = contact_number !== undefined ? contact_number || null : existing.contact_number;

    if (!nextName || !String(nextName).trim()) {
      return res.status(400).json({ success: false, message: 'name must not be empty.' });
    }

    await pool.query('UPDATE users SET name = ?, email = ?, contact_number = ? WHERE id = ?', [
      nextName,
      nextEmail,
      nextContact,
      id,
    ]);

    const [updated] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_user', `Updated user #${id} (${existing.login_id})`);

    return res.json({ success: true, message: 'User updated.', user: sanitizeUser(updated[0]) });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// PATCH /api/users/:id/status — Admin activates/deactivates. active/inactive
// only — pending/rejected belong to the approve/reject flow, both as the
// target value and as the account's current state (a pending account must
// go through approve/reject so approved_by gets set and the event is logged
// there, not bypassed through this endpoint).
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  const { status } = req.body;
  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ success: false, message: "status must be 'active' or 'inactive'." });
  }

  if (id === req.user.id && status === 'inactive') {
    return res.status(400).json({
      success: false,
      message: 'You cannot deactivate your own account. Ask another admin to do this if needed.',
    });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const target = rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (target.status !== 'active' && target.status !== 'inactive') {
      return res.status(400).json({
        success: false,
        message: `Cannot set status directly — account is currently ${target.status}. Use the approve/reject flow first.`,
      });
    }

    // Locking the only admin out of the system is unrecoverable short of
    // direct database access — block deactivating the last active admin,
    // not just self-deactivation (admin A deactivating B, then B deactivating
    // A, reaches the same dead end). Only applies when the target is
    // *currently* active — deactivating an already-inactive admin doesn't
    // reduce the active count, so it isn't a lockout risk and shouldn't be
    // blocked by this check.
    if (target.role === 'admin' && status === 'inactive' && target.status === 'active') {
      const [activeAdmins] = await pool.query(
        `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`
      );
      if (activeAdmins[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the last active admin account. Activate another admin first.',
        });
      }
    }

    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);

    const [updated] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'update_user_status', `Set user #${id} (${target.login_id}) to ${status}`);

    return res.json({ success: true, message: 'User status updated.', user: sanitizeUser(updated[0]) });
  } catch (error) {
    console.error('Update user status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user status.' });
  }
});

module.exports = router;
