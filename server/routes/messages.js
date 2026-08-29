const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

// The security boundary for who may message whom. Used on every send
// (POST /api/messages) — reads are participant-scoped instead, not
// eligibility-scoped; see the read handlers below for why.
async function canMessage(senderUser, recipientId) {
  const [recipientRows] = await pool.query(
    `SELECT id, role, student_id FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
    [recipientId]
  );
  const recipient = recipientRows[0];
  if (!recipient) {
    return { ok: false, status: 404, message: 'Recipient not found.' };
  }

  if (senderUser.role === 'admin' || recipient.role === 'admin') {
    return { ok: true };
  }

  if (senderUser.role === 'parent') {
    if (recipient.role !== 'teacher') {
      return {
        ok: false,
        status: 403,
        message: 'Parents may only message their child\'s teachers or an admin.',
      };
    }
    const [rows] = await pool.query(
      `SELECT 1 FROM teacher_assignments ta
       JOIN students s ON s.grade_level = ta.grade_level AND s.section = ta.section
       WHERE ta.teacher_id = ? AND s.id = ?
       LIMIT 1`,
      [recipientId, senderUser.student_id]
    );
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        message: 'This teacher is not assigned to your child\'s class.',
      };
    }
    return { ok: true };
  }

  if (senderUser.role === 'teacher') {
    if (recipient.role === 'teacher') {
      return { ok: true };
    }
    if (recipient.role !== 'parent') {
      return {
        ok: false,
        status: 403,
        message: 'Teachers may only message parents of their own students, other teachers, or an admin.',
      };
    }
    const [rows] = await pool.query(
      `SELECT 1 FROM teacher_assignments ta
       JOIN students s ON s.grade_level = ta.grade_level AND s.section = ta.section
       WHERE ta.teacher_id = ? AND s.id = ?
       LIMIT 1`,
      [senderUser.id, recipient.student_id]
    );
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        message: 'This parent\'s child is not in one of your assigned classes.',
      };
    }
    return { ok: true };
  }

  return { ok: false, status: 403, message: 'Messaging is not permitted for this role.' };
}

// GET /api/messages/conversations — list of people this user has exchanged
// messages with, most recent first, with the last message and unread count.
// Participant-scoped by the WHERE clause, not re-run through canMessage —
// this is history, not a live directory. See routes/messages.js plan notes.
router.get('/conversations', authenticate, async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      `WITH ranked AS (
         SELECT
           m.*,
           CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
             ORDER BY m.created_at DESC, m.id DESC
           ) AS rn
         FROM messages m
         WHERE m.sender_id = ? OR m.receiver_id = ?
       )
       SELECT
         r.other_user_id, u.name AS other_user_name, u.role AS other_user_role,
         r.id AS last_message_id, r.body AS last_message_body,
         r.sender_id AS last_message_sender_id, r.created_at AS last_message_at,
         r.read_status AS last_message_read_status,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.receiver_id = ? AND m2.sender_id = r.other_user_id AND m2.read_status = 0) AS unread_count
       FROM ranked r
       JOIN users u ON u.id = r.other_user_id
       WHERE r.rn = 1
       ORDER BY r.created_at DESC`,
      [userId, userId, userId, userId, userId]
    );

    return res.json({ success: true, conversations: rows });
  } catch (error) {
    console.error('List conversations error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
});

// GET /api/messages/with/:userId — full thread with one person.
// Participant-scoped (sender_id/receiver_id = req.user.id on one side),
// same reasoning as /conversations — no canMessage re-check on read.
router.get('/with/:userId', authenticate, async (req, res) => {
  const otherId = parseId(req.params.userId);
  if (otherId === null) {
    return res.status(400).json({ success: false, message: 'Invalid user id.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.body, m.read_status, m.created_at,
              s.name AS sender_name, s.role AS sender_role,
              r.name AS receiver_name, r.role AS receiver_role
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC, m.id ASC`,
      [req.user.id, otherId, otherId, req.user.id]
    );

    return res.json({ success: true, messages: rows });
  } catch (error) {
    console.error('Get thread error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
});

// POST /api/messages — send. sender_id always from req.user.id, never the body.
router.post('/', authenticate, async (req, res) => {
  const { receiver_id, body } = req.body;

  const receiverId = parseId(receiver_id);
  if (receiverId === null) {
    return res.status(400).json({ success: false, message: 'A valid receiver_id is required.' });
  }

  if (receiverId === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot send a message to yourself.' });
  }

  if (typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ success: false, message: 'body must not be empty.' });
  }

  const permission = await canMessage(req.user, receiverId);
  if (!permission.ok) {
    return res.status(permission.status).json({ success: false, message: permission.message });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?)',
      [req.user.id, receiverId, body.trim()]
    );

    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [result.insertId]);
    const message = rows[0];

    await logActivity(req.user.id, 'send_message', `Sent message #${message.id} to user #${receiverId}`);

    // REST is the source of truth: persisted above, emitted after. The
    // room-scoped emit is the only delivery path — no socket event accepts
    // a write. Never io.emit() — that would broadcast to every connection.
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${receiverId}`).emit('new_message', message);
    }

    return res.status(201).json({ success: true, message: 'Message sent.', data: message });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

// PATCH /api/messages/:id/read — recipient only.
router.patch('/:id/read', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid message id.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    if (existing.receiver_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the recipient can mark a message as read.' });
    }

    await pool.query('UPDATE messages SET read_status = 1 WHERE id = ?', [id]);

    const [updated] = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
    await logActivity(req.user.id, 'read_message', `Marked message #${id} read`);

    return res.json({ success: true, message: 'Message marked read.', data: updated[0] });
  } catch (error) {
    console.error('Mark message read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark message read.' });
  }
});

// PATCH /api/messages/read-all/:userId — mark every message from :userId to
// the caller as read. Recipient only, by construction (receiver_id = req.user.id).
router.patch('/read-all/:userId', authenticate, async (req, res) => {
  const otherId = parseId(req.params.userId);
  if (otherId === null) {
    return res.status(400).json({ success: false, message: 'Invalid user id.' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE messages SET read_status = 1 WHERE sender_id = ? AND receiver_id = ? AND read_status = 0',
      [otherId, req.user.id]
    );

    await logActivity(
      req.user.id,
      'read_all_messages',
      `Marked ${result.affectedRows} message(s) from user #${otherId} read`
    );

    return res.json({ success: true, message: 'Thread marked read.', count: result.affectedRows });
  } catch (error) {
    console.error('Mark thread read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark thread read.' });
  }
});

module.exports = router;
