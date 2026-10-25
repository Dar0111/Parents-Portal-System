const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams } = require('../utils/teacherScope');
const { readListParams, parsePagination, pageMeta } = require('../utils/pagination');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

// The security boundary for who may message whom. Used on every send
// (POST /api/messages) — reads are participant-scoped instead, not
// eligibility-scoped; see the read handlers below for why.
//
// THE ROLE PAIRS (the owner's decision, 2026-10-05 — the admin's inbox):
//   teacher ↔ parent   only the parents of the teacher's own learners
//   teacher ↔ teacher  allowed
//   teacher ↔ admin    allowed, both ways
//   parent  ↔ admin    REFUSED, both ways (403)
//   admin   ↔ admin    REFUSED (403)
// Until then an admin could message anyone and anyone the admin — that
// blanket allow is gone. A refusal is 403 like every other one here (§2:
// a write that is not permitted says why). History stays readable: a
// parent ↔ admin thread from before keeps its messages, and only a NEW
// send is refused — a scope change removes future authority, never past
// records.
//
// ON POSTGRESQL (Phase 3): recipientId comes from parseId(), which refuses an
// id past PostgreSQL's integer range (utils/validateId.js MAX_ID), so the
// lookup below — outside the send handler's try — cannot fail with 22003.
async function canMessage(senderUser, recipientId) {
  const { rows: recipientRows } = await pool.query(
    `SELECT id, role, student_id FROM users WHERE id = ? AND status = 'active' LIMIT 1`,
    [recipientId]
  );
  const recipient = recipientRows[0];
  if (!recipient) {
    return { ok: false, status: 404, message: 'Recipient not found.' };
  }

  if (senderUser.role === 'admin') {
    if (recipient.role !== 'teacher') {
      return { ok: false, status: 403, message: 'The admin may only message teachers.' };
    }
    return { ok: true };
  }

  if (senderUser.role === 'parent') {
    if (recipient.role !== 'teacher') {
      return {
        ok: false,
        status: 403,
        message: 'Parents may only message their child\'s teachers.',
      };
    }
    // Assigned to the child's class OR its section adviser — the shared
    // predicate, so who a parent may message matches who can see their child
    // everywhere else in the system. Before this an adviser holding no subject
    // assignment in their own section was unreachable by the parents of that
    // very section.
    const { rows } = await pool.query(
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
    if (recipient.role === 'teacher' || recipient.role === 'admin') {
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
    const { rows } = await pool.query(
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

  const list = readListParams(req.query, {
    sortable: { other_user_name: 'u.name', last_message_at: 'r.created_at', unread_count: 'unread_count' },
    defaultOrderBy: 'r.created_at DESC',
    tiebreaker: 'r.other_user_id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    // total = the people this user has exchanged messages with (C4: the same
    // set the CTE below ranks), counted without materialising the ranking.
    const {
      rows: [{ total }],
    } = await pool.query(
      `SELECT COUNT(DISTINCT CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END) AS total
       FROM messages m
       WHERE m.sender_id = ? OR m.receiver_id = ?`,
      [userId, userId, userId]
    );
    const { rows } = await pool.query(
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
         u.profile_pic AS other_user_profile_pic,
         r.id AS last_message_id, r.body AS last_message_body,
         r.sender_id AS last_message_sender_id, r.created_at AS last_message_at,
         r.read_status AS last_message_read_status,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.receiver_id = ? AND m2.sender_id = r.other_user_id AND m2.read_status = 0) AS unread_count
       FROM ranked r
       JOIN users u ON u.id = r.other_user_id
       WHERE r.rn = 1
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [userId, userId, userId, userId, userId, list.limit, list.offset]
    );

    return res.json({ success: true, conversations: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
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
//              child's class, or its section adviser — the shared predicate).
//              No admin since 2026-10-05: a parent may not message the admin.
//   teacher -> parents of students in their own scope (assigned or adviser),
//              plus other teachers and admins.
//   admin   -> active teachers only (2026-10-05) — the admin may message
//              teachers and nobody else.
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
      u.role = 'teacher' AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = ? AND ${TEACHER_VIEW_SCOPE_SQL.replace('ta.teacher_id = ?', 'ta.teacher_id = u.id').replace('sec.adviser_id = ?', 'sec.adviser_id = u.id')}
      )
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
  } else if (req.user.role === 'admin') {
    scopeSql = "u.role = 'teacher'";
    scopeParams = [];
  } else {
    // An unknown role is offered no one, never everyone.
    scopeSql = '1 = 0';
    scopeParams = [];
  }

  const conditions = ["u.status = 'active'", 'u.id <> ?', scopeSql];
  const params = [userId, ...scopeParams];

  if (search !== undefined && String(search).trim()) {
    // ON POSTGRESQL: the one name fold in config/db.js (the owner's Q5 (b)) —
    // case- and accent-insensitive, as MySQL's _ci LIKE was; it builds the
    // %…% pattern itself. A plain LIKE would be case-sensitive here.
    const term = pool.foldedContains(String(search).trim());
    // Matches the contact's own name OR the linked student's name — a teacher
    // looks for "Marwin's parent", not the guardian's name. Applied on top of
    // the scope condition above, never instead of it.
    conditions.push(`(${pool.foldedSql('u.name')} LIKE ? OR ${pool.foldedSql('st.student_name')} LIKE ?)`);
    params.push(term, term);
  }

  const list = readListParams(req.query, {
    // NULLS sort first ascending and last descending on MySQL, the other way
    // round on PostgreSQL. student_name (an account with no learner) and
    // last_message_at (no conversation yet) can be NULL, so each leads with an
    // IS NOT NULL key, which takes the same direction (the content.js category
    // sort does the same).
    sortable: {
      name: 'u.name',
      role: 'u.role',
      student_name: '(st.student_name IS NOT NULL), st.student_name',
      last_message_at: '(lm.created_at IS NOT NULL), lm.created_at',
    },
    defaultOrderBy: '(lm.created_at IS NULL), lm.created_at DESC, u.name ASC',
    tiebreaker: 'u.id ASC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    // total over the same scope + search (C4). Only the student subquery is
    // needed for the WHERE; the conversation and subject joins are display.
    const {
      rows: [{ total }],
    } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN (
         SELECT s.id, concat(s.first_name, ' ', s.last_name) AS student_name
         FROM students s
       ) st ON st.id = u.student_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    // GROUP_CONCAT(… SEPARATOR ', ') is string_agg(…, ', ' ORDER BY …) and
    // CONCAT is concat(). string_agg has no length cap where GROUP_CONCAT cut
    // at group_concat_max_len (1024 bytes) — no current label comes near it.
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.role,
         st.student_name,
         st.grade_level AS student_grade_level,
         st.section AS student_section,
         COALESCE(subj.subject_names, adv.adviser_label) AS subject,
         lm.body AS last_message,
         lm.created_at AS last_message_at,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.receiver_id = ? AND m2.sender_id = u.id AND m2.read_status = 0) AS unread_count
       FROM users u
       LEFT JOIN (
         SELECT s.id, concat(s.first_name, ' ', s.last_name) AS student_name,
                s.grade_level, s.section
         FROM students s
       ) st ON st.id = u.student_id
       LEFT JOIN (
         SELECT ta.teacher_id, string_agg(DISTINCT sub.name, ', ' ORDER BY sub.name) AS subject_names
         FROM teacher_assignments ta
         JOIN subjects sub ON sub.id = ta.subject_id
         GROUP BY ta.teacher_id
       ) subj ON subj.teacher_id = u.id AND u.role = 'teacher'
       -- THE ADVISER LABEL (2026-10-06): a teacher with NO subject assignment
       -- who advises a section is labelled "Adviser of Grade 5 - Masigasig"
       -- in the subject's place — the teacher dashboard's chip, word for word
       -- — so the pickers no longer show an adviser-only teacher bare. A
       -- teacher with subjects keeps the subject list (COALESCE above); one
       -- with neither stays NULL. Matched on sections.adviser_id alone, as the
       -- teacher view scope is (utils/teacherScope.js).
       LEFT JOIN (
         SELECT sec.adviser_id,
                string_agg(concat('Adviser of Grade ', sec.grade_level, ' - ', sec.name), ', '
                           ORDER BY sec.grade_level, sec.name) AS adviser_label
         FROM sections sec
         WHERE sec.adviser_id IS NOT NULL
         GROUP BY sec.adviser_id
       ) adv ON adv.adviser_id = u.id AND u.role = 'teacher'
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
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [userId, userId, userId, userId, userId, ...params, list.limit, list.offset]
    );

    return res.json({ success: true, contacts: rows, page: pageMeta({ limit: list.limit, offset: list.offset, total }) });
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

  // C3 (2026-09-19): this list pages on a CURSOR, not an offset. A thread is
  // appended to live (Socket.io), so an offset taken before a new message
  // arrived would skip or repeat a row on "Load earlier". ?before=<message_id>
  // returns the `limit` messages older than that id (newest page first: no
  // `before` means the tail of the thread). Within a page the rows stay in
  // reading order (oldest first) so the client prepends a page unchanged.
  // `page` here is { limit, before, total, has_more } — has_more is true when
  // older rows exist than the oldest one returned. offset/sort/order are
  // refused on this route so no caller can mix the two schemes.
  for (const key of ['offset', 'sort', 'order']) {
    if (req.query[key] !== undefined) {
      return res.status(400).json({
        success: false,
        message: `This thread pages with before=<message_id>, not ${key}.`,
      });
    }
  }
  const page = parsePagination(req.query);
  if (page.error) {
    return res.status(400).json({ success: false, message: page.error });
  }
  let before = null;
  if (req.query.before !== undefined) {
    before = parseId(req.query.before);
    if (before === null) {
      return res.status(400).json({ success: false, message: 'before must be a positive integer message id.' });
    }
  }

  try {
    const threadWhere = '((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))';
    const threadParams = [req.user.id, otherId, otherId, req.user.id];
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total FROM messages m WHERE ${threadWhere}`, threadParams);

    const cursor = before === null ? '' : 'AND m.id < ?';
    const cursorParams = before === null ? [] : [before];
    const { rows: newestFirst } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.body, m.read_status, m.created_at,
              s.name AS sender_name, s.role AS sender_role,
              r.name AS receiver_name, r.role AS receiver_role
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       WHERE ${threadWhere} ${cursor}
       ORDER BY m.id DESC
       LIMIT ?`,
      [...threadParams, ...cursorParams, page.limit]
    );
    const rows = newestFirst.reverse();

    let hasMore = false;
    if (rows.length) {
      const {
        rows: [{ older }],
      } = await pool.query(
        `SELECT COUNT(*) AS older FROM messages m WHERE ${threadWhere} AND m.id < ?`,
        [...threadParams, rows[0].id]
      );
      hasMore = older > 0;
    }

    return res.json({
      success: true,
      messages: rows,
      page: { limit: page.limit, before, total, has_more: hasMore },
    });
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
    // RETURNING id is mysql2's insertId; the re-select keeps the database's
    // defaults (read_status, created_at) in the reply and the socket payload.
    const { rows: inserted } = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?) RETURNING id',
      [req.user.id, receiverId, body.trim()]
    );

    const { rows } = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [inserted[0].id]);
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
    const { rows } = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    if (existing.receiver_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the recipient can mark a message as read.' });
    }

    await pool.query('UPDATE messages SET read_status = 1 WHERE id = ?', [id]);

    const { rows: updated } = await pool.query('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
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
    // rowCount is the MATCHED rows, the meaning affectedRows had here; the
    // read_status = 0 guard makes every matched row a changed one.
    const result = await pool.query(
      'UPDATE messages SET read_status = 1 WHERE sender_id = ? AND receiver_id = ? AND read_status = 0',
      [otherId, req.user.id]
    );

    await logActivity(
      req.user.id,
      'read_all_messages',
      `Marked ${result.rowCount} message(s) from user #${otherId} read`
    );

    return res.json({ success: true, message: 'Thread marked read.', count: result.rowCount });
  } catch (error) {
    console.error('Mark thread read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark thread read.' });
  }
});

module.exports = router;
