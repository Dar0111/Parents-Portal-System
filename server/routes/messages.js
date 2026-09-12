const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');

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
    // Assigned to the child's class OR its section adviser — the shared
    // predicate, so who a parent may message matches who can see their child
    // everywhere else in the system. Before this an adviser holding no subject
    // assignment in their own section was unreachable by the parents of that
    // very section.
    const [rows] = await pool.query(
      `SELECT 1 FROM students s WHERE s.id = ? AND ${TEACHER_VIEW_SCOPE_SQL} LIMIT 1`,
      [senderUser.student_id, ...teacherViewScopeParams(recipientId)]
    );
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        // Must be true for BOTH legs (assigned and adviser) without naming the
        // mechanism: "not assigned to your child's class" became false the
        // moment an adviser qualified.
        message: 'This teacher is not connected to your child\'s class.',
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
    // Same predicate, other direction.
    const [rows] = await pool.query(
      `SELECT 1 FROM students s WHERE s.id = ? AND ${TEACHER_VIEW_SCOPE_SQL} LIMIT 1`,
      [recipient.student_id, ...teacherViewScopeParams(senderUser.id)]
    );
    if (!rows.length) {
      return {
        ok: false,
        status: 403,
        message: 'This parent\'s child is not in one of your classes.',
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

// GET /api/messages/contacts — who this user may start a conversation with.
//
// The INVERSE of canMessage(): same boundary, read direction instead of a
// permission check. Without it a parent has no way to discover their child's
// teachers' user ids, so a first conversation is unstartable from the UI.
//
// Scope per role, stated plainly because this is the endpoint that would leak
// the whole school if it were ever loosened:
//   parent  -> teachers connected to THEIR OWN CHILD only (assigned to the
//              child's class, or its section adviser — the shared predicate),
//              plus admins.
//   teacher -> parents of students in their own scope (assigned or adviser),
//              plus other teachers and admins.
//   admin   -> everyone else.
// NEVER an unscoped user search. ?search= filters WITHIN the already-scoped
// set only; it can never widen it.
//
// ACTIVE ACCOUNTS ONLY. A pending parent cannot log in, so listing them offers
// a conversation that cannot happen — and would show a teacher a contact who
// will never reply with no way to tell why. Consequence worth knowing when
// reading test output: an adviser whose section's only parent is still pending
// sees zero parent contacts, and that is correct, not the scope bug returning.
// The UX gap it leaves (the teacher is told nothing about why) is recorded as a
// Stage 4 question in CLAUDE.md, not a backend one.
//
// Conversation state is joined inline, same shape as GET /conversations, so the
// frontend renders a combined contacts-and-conversations view from one call.
router.get('/contacts', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { search } = req.query;

  let scopeSql;
  let scopeParams;

  if (req.user.role === 'parent') {
    if (!req.user.student_id) {
      return res.json({ success: true, contacts: [] });
    }
    scopeSql = `(
      u.role = 'admin'
      OR (u.role = 'teacher' AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = ? AND ${TEACHER_VIEW_SCOPE_SQL.replace('ta.teacher_id = ?', 'ta.teacher_id = u.id').replace('sec.adviser_id = ?', 'sec.adviser_id = u.id')}
      ))
    )`;
    scopeParams = [req.user.student_id];
  } else if (req.user.role === 'teacher') {
    scopeSql = `(
      u.role IN ('admin', 'teacher')
      OR (u.role = 'parent' AND u.student_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = u.student_id AND ${TEACHER_VIEW_SCOPE_SQL}
      ))
    )`;
    scopeParams = teacherViewScopeParams(userId);
  } else {
    scopeSql = '1 = 1';
    scopeParams = [];
  }

  const conditions = ["u.status = 'active'", 'u.id <> ?', scopeSql];
  const params = [userId, ...scopeParams];

  if (search !== undefined && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    // Matches the contact's own name OR the linked student's name — a teacher
    // looks for "Marwin's parent", not the guardian's name. Applied on top of
    // the scope condition above, never instead of it.
    conditions.push('(u.name LIKE ? OR st.student_name LIKE ?)');
    params.push(term, term);
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         u.id, u.name, u.role,
         st.student_name,
         st.grade_level AS student_grade_level,
         st.section AS student_section,
         subj.subject_names AS subject,
         lm.body AS last_message,
         lm.created_at AS last_message_at,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.receiver_id = ? AND m2.sender_id = u.id AND m2.read_status = 0) AS unread_count
       FROM users u
       LEFT JOIN (
         SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS student_name,
                s.grade_level, s.section
         FROM students s
       ) st ON st.id = u.student_id
       LEFT JOIN (
         SELECT ta.teacher_id, GROUP_CONCAT(DISTINCT sub.name ORDER BY sub.name SEPARATOR ', ') AS subject_names
         FROM teacher_assignments ta
         JOIN subjects sub ON sub.id = ta.subject_id
         GROUP BY ta.teacher_id
       ) subj ON subj.teacher_id = u.id AND u.role = 'teacher'
       LEFT JOIN (
         SELECT
           CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
           m.body, m.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
             ORDER BY m.created_at DESC, m.id DESC
           ) AS rn
         FROM messages m
         WHERE m.sender_id = ? OR m.receiver_id = ?
       ) lm ON lm.other_user_id = u.id AND lm.rn = 1
       WHERE ${conditions.join(' AND ')}
       ORDER BY (lm.created_at IS NULL), lm.created_at DESC, u.name ASC`,
      [userId, userId, userId, userId, userId, ...params]
    );

    return res.json({ success: true, contacts: rows });
  } catch (error) {
    console.error('List contacts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch contacts.' });
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
