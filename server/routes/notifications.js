const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { parseId } = require('../utils/validateId');
const { readListParams, pageMeta } = require('../utils/pagination');
const { emitNotifications } = require('../utils/notify');

const router = express.Router();

// Notifications — the bell. N1, 2026-09-19.
//
// Follows routes/users.js and routes/students.js: authenticate on every route,
// parseId() on the one :id param, the uniform { success, message } error body.
// Two deliberate departures from the template, both argued rather than
// silently taken:
//
// 1. NO sanitizeUser. Every query here names the columns it wants
//    (users.name only); none is built from SELECT * or u.* on users, so
//    calling it would be theatre rather than defense — the same reasoning
//    that keeps it out of routes/messages.js.
//
// 2. NO logActivity ON MARK-READ, and this one IS a real exception to "every
//    write logs". A row per notification opened is hundreds of activity_logs
//    rows a day for a school this size, against a table that has no pruning
//    and that the restore machinery counts and reports on
//    (restore_wiped_activity_logs). Opening a notification is a READ the user
//    performs, recorded as a timestamp on the row the user already owns; the
//    thing worth auditing — the announcement, the review, the approval — is
//    already logged by the handler that caused it. Drowning that record in
//    read receipts makes the audit trail worse, not better. If a reviewer
//    later wants read receipts audited, the right move is a decision about
//    activity_logs retention first, not a logActivity call here.
//
// NO user id is ever accepted from a request. Every statement filters on
// req.user.id, which authenticate re-read from the database on this request.
// Marking someone else's notification is 404, not 403: it is a read-shaped
// failure and anti-enumeration applies (convention 2).

// ---------------------------------------------------------------------------
// The read-time visibility re-check — the half of the design that makes
// fan-out safe.
// ---------------------------------------------------------------------------
//
// utils/notify.js chose the audience when the item was created. Between then
// and now a teacher_assignments row may have been deleted (allowed, and
// deliberately does not touch past records), an announcement may have been
// deleted outright, or a pending parent may have been approved. So every read
// re-derives visibility from the SAME predicate the matching list endpoint
// uses, against live rows, and a notification that fails it is simply not
// returned — no cleanup job, no re-fan-out, nothing to forget.
//
// It also covers the one thing item_id cannot express: there is no FK on it
// (it points at six tables), so a deleted item leaves the row behind. Its
// LEFT JOIN then yields NULL and the `IS NOT NULL` test drops it.
//
// EVENTS ARE NOT LISTED FOR ADMIN, and that is not an oversight. Admin's nav
// is eight items and has no Events page (client/src/layout/nav.js, after the
// 2026-09-18 trim). GET /api/events authorizes admin, but the standing rule is
// "nobody may be notified about an item they cannot open", and an admin has
// nowhere to open an event. utils/notify.js therefore does not fan out events
// to admins and this WHERE does not list them — belt and braces, because the
// two run at different times.
function visibilityClause(user) {
  if (user.role === 'parent') {
    // An UNLINKED parent (users.student_id NULL) sees nothing at all — not
    // even school-wide posts. That is not a shortcut: GET /api/announcements
    // and GET /api/events both return an empty array outright when
    // getStudentClass() finds no student (content.js:197, :540), so listing
    // school-wide notifications here would show a bell pointing at a page
    // that shows nothing.
    if (user.student_id == null) {
      return { sql: '(1 = 0)', params: [] };
    }

    // The child's grade and section are read LIVE inside the query rather
    // than carried on req.user — which does not have them anyway (middleware/
    // auth.js selects student_id, not the class) — so the same EXISTS is
    // re-evaluated on every read. That is what makes a section change, if one
    // ever becomes possible, correct here for free. Today PUT
    // /api/students/:id refuses a class change with 400, so the only way it
    // can move is a direct database write.
    //
    // GRADES_LOCKED SELF-HEALS (feat/grade-acknowledgement, 2026-10-21), the
    // excuse_submitted shape: "please confirm" is a call to act, so the row
    // stops being listed and counted once a grade_acknowledgements row for
    // that learner, school year and term exists — nothing deleted, nothing
    // marked read; the acknowledge handler signals the parent so the drop is
    // live. An unlock deletes the row outright (routes/grades.js), so a relock
    // can ask again.
    return {
      sql: `(
        (n.item_type = 'announcement' AND a.id IS NOT NULL AND (
            a.target_grade IS NULL
            OR EXISTS (SELECT 1 FROM students s3
                        WHERE s3.id = ? AND s3.grade_level = a.target_grade
                          AND (a.target_section IS NULL OR a.target_section = s3.section))))
        OR (n.item_type = 'memo' AND m.id IS NOT NULL)
        OR (n.item_type = 'event' AND e.id IS NOT NULL AND (
            e.target_grade IS NULL
            OR EXISTS (SELECT 1 FROM students s4 WHERE s4.id = ? AND s4.grade_level = e.target_grade)))
        OR (n.item_type = 'excuse_letter' AND x.id IS NOT NULL AND x.parent_id = n.user_id)
        OR (n.item_type = 'grade' AND g.id IS NOT NULL AND g.student_id = ?
            AND (n.type <> 'grades_locked' OR NOT EXISTS (
                  SELECT 1 FROM grade_acknowledgements ga
                   WHERE ga.student_id = g.student_id AND ga.school_year = g.school_year AND ga.term = g.term)))
      )`,
      params: [user.student_id, user.student_id, user.student_id],
    };
  }

  if (user.role === 'teacher') {
    // A GRADE ROW REACHES A TEACHER ONLY AS THE ADVISER (feat/grade-
    // acknowledgement, 2026-10-21): grades_acknowledged goes to the adviser of
    // the learner's section (utils/notify.js excuseAdviserAudience — the same
    // authority), and the clause re-checks it live, so a teacher who stops
    // advising the section stops seeing the row. grade_available is never
    // fanned out to a teacher, so this clause never lists one.
    //
    // EXCUSE LETTERS SELF-HEAL, the pending-parent shape (admin clause
    // below): "a letter was submitted" is a call to review it, so an
    // adviser's excuse_submitted row stops being listed and counted once the
    // letter is no longer Pending — `n.type <> 'excuse_submitted' OR
    // x.status = 'Pending'`. Nothing is deleted or marked read; the row
    // stays, as history. Before this (fix/smoke-gate) the sidebar badge and
    // the bell both still said 1 after the adviser approved the only letter,
    // because reviewing never read that row. The review handler signals the
    // reviewer so the drop is live (routes/excuses.js).
    return {
      sql: `(
        (n.item_type = 'announcement' AND a.id IS NOT NULL AND (
            a.target_grade IS NULL
            OR EXISTS (SELECT 1 FROM teacher_assignments ta
                        WHERE ta.teacher_id = n.user_id AND ta.grade_level = a.target_grade
                          AND (a.target_section IS NULL OR a.target_section = ta.section))
            OR EXISTS (SELECT 1 FROM sections sec
                        WHERE sec.adviser_id = n.user_id AND sec.grade_level = a.target_grade
                          AND (a.target_section IS NULL OR a.target_section = sec.name))))
        OR (n.item_type = 'memo' AND m.id IS NOT NULL)
        OR (n.item_type = 'event' AND e.id IS NOT NULL AND (
            e.target_grade IS NULL
            OR EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = n.user_id AND ta.grade_level = e.target_grade)
            OR EXISTS (SELECT 1 FROM sections sec WHERE sec.adviser_id = n.user_id AND sec.grade_level = e.target_grade)))
        OR (n.item_type = 'excuse_letter' AND x.id IS NOT NULL
            AND (n.type <> 'excuse_submitted' OR x.status = 'Pending')
            AND EXISTS (SELECT 1 FROM students s2
                          JOIN sections sec2 ON sec2.id = s2.section_id
                         WHERE s2.id = x.student_id AND sec2.adviser_id = n.user_id))
        OR (n.item_type = 'grade' AND g.id IS NOT NULL
            AND EXISTS (SELECT 1 FROM students s5
                          JOIN sections sec5 ON sec5.id = s5.section_id
                         WHERE s5.id = g.student_id AND sec5.adviser_id = n.user_id))
      )`,
      params: [],
    };
  }

  // admin — unscoped on content, but only for the two things admin has a page
  // for. The pending-parent row carries its own self-healing test: once the
  // account is approved or rejected it is no longer pending, so the
  // notification stops being listed without anything deleting it.
  return {
    sql: `(
      (n.item_type = 'announcement' AND a.id IS NOT NULL)
      OR (n.item_type = 'memo' AND m.id IS NOT NULL)
      OR (n.item_type = 'user' AND pu.id IS NOT NULL AND pu.status = 'pending')
    )`,
    params: [],
  };
}

// Every join is a LEFT JOIN on a primary key, gated by item_type so only one
// can match per row.
const FROM_CLAUSE = `
  FROM notifications n
  LEFT JOIN users act        ON act.id = n.actor_id
  LEFT JOIN announcements a  ON n.item_type = 'announcement'  AND a.id = n.item_id
  LEFT JOIN memos m          ON n.item_type = 'memo'          AND m.id = n.item_id
  LEFT JOIN events e         ON n.item_type = 'event'         AND e.id = n.item_id
  LEFT JOIN excuse_letters x ON n.item_type = 'excuse_letter' AND x.id = n.item_id
  LEFT JOIN students xs      ON xs.id = x.student_id
  LEFT JOIN users pu         ON n.item_type = 'user'          AND pu.id = n.item_id
  LEFT JOIN students ps      ON ps.id = pu.student_id
  LEFT JOIN grades g         ON n.item_type = 'grade'         AND g.id = n.item_id
  LEFT JOIN subjects gs      ON gs.id = g.subject_id
  LEFT JOIN students gst     ON gst.id = g.student_id`;

const SELECT_COLUMNS = `
  n.id, n.type, n.item_type, n.item_id, n.title_snapshot, n.created_at, n.read_at,
  act.name AS actor_name,
  a.title AS announcement_title,
  m.title AS memo_title,
  e.title AS event_title, e.event_date,
  x.absence_date, x.status AS excuse_status,
  xs.first_name AS excuse_student_first, xs.last_name AS excuse_student_last,
  ps.first_name AS pending_student_first, ps.last_name AS pending_student_last,
  g.term AS grade_term, gs.name AS subject_name,
  gst.first_name AS grade_student_first, gst.last_name AS grade_student_last`;

// ---------------------------------------------------------------------------
// Text — composed server-side from the LIVE item, never from the request.
// ---------------------------------------------------------------------------
//
// The snapshot title is a fallback only: an edited announcement should read as
// it reads now, so the live title wins wherever there is one. An edit does NOT
// re-notify — an admin PUT on a teacher's announcement already keeps the
// teacher as posted_by under admin targeting rules (KNOWN ISSUES), and
// re-notifying would amplify exactly that.
//
// WHAT NEVER APPEARS IN THIS TEXT, and why each one matters:
//   - NO LRN and no login_id. A parent's login_id IS their child's LRN
//     (convention 5c). parent_pending names the STUDENT, which is what the
//     admin needs to identify the account, and nothing else.
//   - NO score, letter, average or verdict on grade_available, grades_locked
//     or grades_acknowledged (conventions 3 and 4). The system counts and
//     displays; it never concludes. The text says a grade is ready, or a term
//     is final, or a parent has seen it, and the report card says what it is.
//   - NO teacher_remarks inlined on a declined letter. They are optional and
//     can be long; the row sends the parent to the letter to read them.
//   - NO claim that anyone was told anything else (convention 5i). Nothing in
//     this system emails or texts anybody.
function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ');
}

function compose(row, role) {
  const actor = row.actor_name || 'Someone';

  switch (row.type) {
    case 'announcement': {
      const title = row.announcement_title || row.title_snapshot;
      return {
        title: 'New announcement',
        body: `${actor} posted "${title}".`,
        link: `/${role}/announcements`,
      };
    }
    case 'memo': {
      const title = row.memo_title || row.title_snapshot;
      return {
        title: 'New memo',
        body: `${actor} posted "${title}".`,
        // Admin has no Memos page: memos live on Admin -> Announcements, which
        // is the only place a memo can ever be written (2026-09-14 decision).
        link: role === 'admin' ? '/admin/announcements' : `/${role}/memos`,
      };
    }
    case 'event': {
      const title = row.event_title || row.title_snapshot;
      return {
        title: 'New event',
        body: `${actor} added "${title}" on ${row.event_date}.`,
        link: `/${role}/events`,
      };
    }
    case 'excuse_submitted':
      return {
        title: 'New excuse letter',
        body: `${fullName(row.excuse_student_first, row.excuse_student_last)} has a new excuse letter for ${row.absence_date}.`,
        link: '/teacher/excuse-letters',
      };
    case 'excuse_reviewed':
      return row.excuse_status === 'Approved'
        ? {
            title: 'Excuse letter approved',
            body: `Your excuse letter for ${row.absence_date} was approved.`,
            link: '/parent/excuse-letters',
          }
        : {
            title: 'Excuse letter declined',
            body: `Your excuse letter for ${row.absence_date} was declined. Open it to read the teacher's remarks.`,
            link: '/parent/excuse-letters',
          };
    case 'parent_pending':
      return {
        title: 'Parent account waiting for approval',
        body: `A new parent account for ${fullName(row.pending_student_first, row.pending_student_last)} is waiting for approval.`,
        link: '/admin/users',
      };
    case 'grade_available':
      return {
        title: 'A grade is ready to view',
        body: `${row.subject_name} — Term ${row.grade_term} is now on the report card.`,
        link: '/parent/grades',
      };
    // feat/grade-acknowledgement (2026-10-21), the owner's Q4 and Q5. Both
    // ride a grade row of the term (its lowest id); the term is the row's own.
    // No score, letter or average — the report card says what the grades are.
    case 'grades_locked':
      return {
        title: `Term ${row.grade_term} grades are final`,
        body: `Please confirm you have seen your child's Term ${row.grade_term} grades.`,
        link: '/parent/grades',
      };
    // The link names the confirmed term (B1 fix round, 2026-10-22): without
    // it Class summary opens on today's term and reads "0 of N learners".
    // The web page reads `?term=`; the phone hands it on as the screen's
    // preset (mobile navigation/routes.js linkParams).
    case 'grades_acknowledged':
      return {
        title: 'Grades confirmed',
        body: `${fullName(row.grade_student_first, row.grade_student_last)}'s parent has seen the Term ${row.grade_term} grades.`,
        link: `/teacher/class-summary?term=${row.grade_term}`,
      };
    default:
      // Unreachable while `type` is an ENUM, but a silent undefined here would
      // render an empty row rather than fail loudly.
      return { title: 'Notification', body: '', link: `/${role}` };
  }
}

function toResponse(row, role) {
  const { title, body, link } = compose(row, role);
  return {
    id: row.id,
    type: row.type,
    item_type: row.item_type,
    item_id: row.item_id,
    title,
    body,
    link,
    actor_name: row.actor_name || null,
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

// Which nav section each type badges. `grade_available` is deliberately absent
// from the sidebar (Darryl, 2026-09-19: bell only) — it is counted in `total`
// and returned under its own key so the bell is right, but N2 must not badge
// it. That makes `total` larger than the sum of the badges for a parent, which
// is correct and is the kind of thing that reads as a bug if nobody wrote it
// down. grades_locked and grades_acknowledged are the same: bell only, under
// the `grades` key (the owner's Q4 and Q5, 2026-10-21).
const NAV_SECTION = {
  announcement: 'announcements',
  memo: 'memos',
  event: 'events',
  excuse_submitted: 'excuse_letters',
  excuse_reviewed: 'excuse_letters',
  parent_pending: 'users',
  grade_available: 'grades',
  grades_locked: 'grades',
  grades_acknowledged: 'grades',
};

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res) => {
  const list = readListParams(req.query, {
    sortable: { created_at: 'n.created_at' },
    defaultOrderBy: 'n.created_at DESC',
    tiebreaker: 'n.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  if (req.query.unread_only !== undefined && !['true', 'false'].includes(req.query.unread_only)) {
    return res.status(400).json({ success: false, message: "unread_only must be 'true' or 'false'." });
  }

  try {
    const visibility = visibilityClause(req.user);
    const conditions = ['n.user_id = ?', visibility.sql];
    const params = [req.user.id, ...visibility.params];

    if (req.query.unread_only === 'true') {
      conditions.push('n.read_at IS NULL');
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    // `total` counts the same filtered-AND-visibility-checked set the rows
    // come from (the pagination contract's C4), not every row this user owns.
    const {
      rows: [{ total }],
    } = await pool.query(`SELECT COUNT(*) AS total ${FROM_CLAUSE} ${where}`, params);
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${where} ${list.orderBy} LIMIT ? OFFSET ?`,
      [...params, list.limit, list.offset]
    );

    return res.json({
      success: true,
      notifications: rows.map((row) => toResponse(row, req.user.role)),
      page: pageMeta({ limit: list.limit, offset: list.offset, total }),
    });
  } catch (error) {
    console.error('List notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-counts
// ---------------------------------------------------------------------------
// Mounted before /:id would be an issue only if a GET /:id existed; there is
// none. Kept above the PATCH routes for readability.
router.get('/unread-counts', authenticate, async (req, res) => {
  try {
    const visibility = visibilityClause(req.user);
    const { rows } = await pool.query(
      `SELECT n.type, COUNT(*) AS count
         ${FROM_CLAUSE}
        WHERE n.user_id = ? AND n.read_at IS NULL AND ${visibility.sql}
        GROUP BY n.type`,
      [req.user.id, ...visibility.params]
    );

    const counts = {
      total: 0,
      announcements: 0,
      memos: 0,
      events: 0,
      excuse_letters: 0,
      users: 0,
      grades: 0,
    };
    for (const row of rows) {
      const section = NAV_SECTION[row.type];
      const n = Number(row.count);
      counts.total += n;
      if (section) counts[section] += n;
    }

    return res.json({ success: true, counts });
  } catch (error) {
    console.error('Notification counts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notification counts.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:id/read
// ---------------------------------------------------------------------------
router.patch('/:id/read', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid notification id.' });
  }

  try {
    // The ownership test is in the UPDATE itself, so there is no window
    // between a check and the write, and no way to mark a row this user does
    // not own. Already-read rows are absorbed (read_at IS NULL in the WHERE),
    // so a double click is not an error — the same reversibility reasoning as
    // convention 5e: this is a repeat, not a second decision.
    // portal.now_s(): whole seconds at statement time, as MySQL's
    // CURRENT_TIMESTAMP stored them (migration/docs/02 §C).
    await pool.query('UPDATE notifications SET read_at = portal.now_s() WHERE id = ? AND user_id = ? AND read_at IS NULL', [
      id,
      req.user.id,
    ]);

    const visibility = visibilityClause(req.user);
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE n.id = ? AND n.user_id = ? AND ${visibility.sql} LIMIT 1`,
      [id, req.user.id, ...visibility.params]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.json({ success: true, notification: toResponse(rows[0], req.user.role) });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark the notification as read.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/notifications/read-all
// ---------------------------------------------------------------------------
// NO :userId in the path, unlike PATCH /api/messages/read-all/:userId. The
// caller is the only possible subject here, and an id in the path would invite
// exactly the mistake that route has to guard against.
//
// THE VISIT CLEAR (fix/f3-badges, 2026-10-22 — the smoke gate's F3 and the
// owner's decision). A badged page sends `{ section }` after it loads, and the
// rows that badge counted are marked read — but only the INFORMATION ones.
// A call to act keeps clearing only on the decision, as built: an adviser's
// excuse_submitted once the letter is reviewed, the admin's parent_pending
// once the account is decided (§10's self-heal). Which types a section covers
// is decided HERE, per role, the badges' own mapping (NAV_SECTION above, the
// admin's Announcements badge carrying memos too) minus the calls to act. No
// grade type is in any section — Grades is never badged, the two
// grade-acknowledgement types are bell-only (§33) — and messages are not
// notifications. A section with no clearable type answers 0 and runs no query.
//
// Without `section` this is the bell's "Mark all as read", exactly as before.
const VISIT_CLEAR = {
  parent: {
    announcements: ['announcement'],
    memos: ['memo'],
    events: ['event'],
    excuse_letters: ['excuse_reviewed'],
  },
  teacher: {
    announcements: ['announcement'],
    memos: ['memo'],
    events: ['event'],
    excuse_letters: [],
  },
  admin: {
    announcements: ['announcement', 'memo'],
    users: [],
  },
};

router.patch('/read-all', authenticate, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (body.section === undefined) {
    try {
      const result = await pool.query(
        'UPDATE notifications SET read_at = portal.now_s() WHERE user_id = ? AND read_at IS NULL',
        [req.user.id]
      );
      return res.json({ success: true, message: 'All notifications marked as read.', updated: result.rowCount });
    } catch (error) {
      console.error('Mark all notifications read error:', error);
      return res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
    }
  }

  const sections = VISIT_CLEAR[req.user.role] || {};
  const { section } = body;
  if (typeof section !== 'string' || !Object.prototype.hasOwnProperty.call(sections, section)) {
    return res.status(400).json({
      success: false,
      message: `section must be one of: ${Object.keys(sections).join(', ')}.`,
    });
  }

  const types = sections[section];
  if (!types.length) {
    return res.json({ success: true, message: 'Marked as read.', section, updated: 0 });
  }

  try {
    // Two plain statements rather than a multi-table UPDATE (portable — Phase
    // 3). The SELECT is the badge's own count — unread, these types, and the
    // read-time visibility re-check — so the clear marks exactly the rows the
    // badge counted. No ids found means no UPDATE (an empty IN () was not SQL
    // on MySQL; an empty ANY is harmless here, but the skip saves a statement).
    // The type list binds as an array of the ENUM; the ids as int[].
    const visibility = visibilityClause(req.user);
    const { rows } = await pool.query(
      `SELECT n.id ${FROM_CLAUSE}
        WHERE n.user_id = ? AND n.read_at IS NULL AND n.type = ANY(?::portal.notification_type[]) AND ${visibility.sql}`,
      [req.user.id, types, ...visibility.params]
    );
    let updated = 0;
    if (rows.length) {
      const result = await pool.query(
        'UPDATE notifications SET read_at = portal.now_s() WHERE user_id = ? AND read_at IS NULL AND id = ANY(?::int[])',
        [req.user.id, rows.map((r) => r.id)]
      );
      updated = result.rowCount;
    }
    // The caller's OTHER devices and tabs refetch their counts (the owner's
    // Q4); a clear of nothing signals nothing.
    if (updated > 0) emitNotifications(req, [req.user.id]);
    return res.json({ success: true, message: 'Marked as read.', section, updated });
  } catch (error) {
    console.error('Mark section notifications read error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
  }
});

module.exports = router;
