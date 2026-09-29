// Notification fan-out. One place, seven event types, N1 (2026-09-19).
//
// THE RULE THIS FILE EXISTS TO ENFORCE — Darryl, 2026-09-19:
//
//   A recipient set is the matching list endpoint's OWN WHERE, or a DECLARED
//   NARROWING of it. NEVER a widening.
//
// Nobody may be notified about an item they cannot open. Every audience query
// below is written against the same columns the list handler filters on, and
// where it differs the narrowing is named above the query. Two are in force:
//
//   1. ACTIVE ACCOUNTS ONLY. The list endpoints do not filter on users.status
//      because they only ever run for an already-authenticated caller. Fanning
//      out, we choose the audience ourselves, so a pending or inactive account
//      is skipped — it cannot log in to read the row.
//   2. excuse_submitted GOES TO THE ADVISER ALONE. GET /api/excuse-letters is
//      assigned-OR-adviser (the wider read scope), but review AUTHORITY is
//      adviser-only (routes/excuses.js — school-confirmed). Notifying an
//      assigned-but-not-adviser teacher would announce a queue they cannot act
//      on. Strictly inside the list's set.
//
// AMENDMENT A1 — THE ACTOR IS NEVER A RECIPIENT. Whoever posted, submitted,
// reviewed or created the item gets no notification for it. Applied once, in
// insertNotifications(), rather than in seven audience queries: a missed
// `AND u.id <> ?` would stay invisible until someone noticed their own bell
// lighting up for their own post.
//
// WHY ROWS RATHER THAN READ-MARKERS. Three of the seven are events, not items,
// and no list WHERE can reproduce them: a grade BECOMING computable (once per
// subject+term), and the two distinct things that happen to one excuse_letter
// id (submitted, then reviewed — updated_at cannot tell them apart, because a
// parent editing a Pending letter moves it too). A row per recipient is the
// only shape that carries "what happened". The cost of that choice — an
// audience frozen at write time — is paid back at READ time:
// routes/notifications.js re-checks visibility on every read, so a teacher
// whose assignment was deleted stops seeing rows they can no longer open,
// with nothing re-fanning-out.
//
// NO FK ON item_id. It points at six different tables, so the schema's 26-FK
// convention cannot reach it. The read-time re-check is what compensates: a
// notification whose item is gone fails its LEFT JOIN and is filtered out.
//
// EMIT AFTER COMMIT, ALWAYS. insertNotifications() writes on whatever
// connection it is handed (a transaction, for the grades hooks); the caller
// collects recipient ids and calls emitNotifications() only once the write is
// durable. A socket event for a row that rolled back would be the fake
// liveness 5g forbids, one layer up.
//
// A FAN-OUT MUST NEVER TURN ITS OWN HANDLER INTO A 500. Every hook runs after
// the thing it describes has been written and logged; if the insert fails, the
// announcement was still posted. Each hook site wraps this in its own catch
// and logs — same posture as logActivity's best-effort write.

// ---------------------------------------------------------------------------
// Audience queries — each mirrors one list handler's WHERE.
// ---------------------------------------------------------------------------

// GET /api/announcements, routes/content.js:195-223
//   parent : (target_grade IS NULL OR (target_grade = s.grade_level
//             AND (target_section IS NULL OR target_section = s.section)))
//   teacher: (target_grade IS NULL OR EXISTS teacher_assignments
//             OR EXISTS sections.adviser_id)
//   admin  : no condition
async function announcementAudience(conn, { target_grade, target_section }) {
  const [rows] = await conn.query(
    `SELECT u.id FROM users u
       LEFT JOIN students s ON s.id = u.student_id
      WHERE u.status = 'active'
        AND (
          u.role = 'admin'
          OR (u.role = 'parent' AND s.id IS NOT NULL AND (
                ? IS NULL OR (s.grade_level = ? AND (? IS NULL OR s.section = ?))
              ))
          OR (u.role = 'teacher' AND (
                ? IS NULL
                OR EXISTS (SELECT 1 FROM teacher_assignments ta
                            WHERE ta.teacher_id = u.id AND ta.grade_level = ?
                              AND (? IS NULL OR ta.section = ?))
                OR EXISTS (SELECT 1 FROM sections sec
                            WHERE sec.adviser_id = u.id AND sec.grade_level = ?
                              AND (? IS NULL OR sec.name = ?))
              ))
        )`,
    [
      target_grade, target_grade, target_section, target_section,
      target_grade, target_grade, target_section, target_section,
      target_grade, target_section, target_section,
    ]
  );
  return rows.map((r) => r.id);
}

// GET /api/memos, routes/content.js:392-407, has NO scoping clause at all —
// memos are school-wide by schema design and every role sees every one. So
// does this. Confirmed by Darryl 2026-09-19 as intended, not an oversight:
// every active account is notified for every memo.
async function memoAudience(conn) {
  const [rows] = await conn.query("SELECT id FROM users WHERE status = 'active'");
  return rows.map((r) => r.id);
}

// GET /api/events, routes/content.js:538-551 — the announcements shape minus
// the section leg; the events table has no target_section column.
//
// NARROWING 3, found while writing this and worth stating plainly: ADMINS ARE
// NOT NOTIFIED ABOUT EVENTS. GET /api/events authorizes admin and returns
// every row, but admin's nav is eight items and has no Events page — Events
// was one of the five removed on 2026-09-18 because it has no Figure 5
// process. The standing rule is "nobody may be notified about an item they
// cannot open", and an admin has nowhere to open an event. So the audience
// stops at parents and teachers. routes/notifications.js's admin visibility
// clause omits events as well; the two run at different times and both need
// to agree.
//
// If Admin -> Events is ever built, this exclusion and that clause are the two
// places to change, and flipping the nav flag alone will not do it.
async function eventAudience(conn, { target_grade }) {
  const [rows] = await conn.query(
    `SELECT u.id FROM users u
       LEFT JOIN students s ON s.id = u.student_id
      WHERE u.status = 'active'
        AND (
          (u.role = 'parent' AND s.id IS NOT NULL AND (? IS NULL OR s.grade_level = ?))
          OR (u.role = 'teacher' AND (
                ? IS NULL
                OR EXISTS (SELECT 1 FROM teacher_assignments ta
                            WHERE ta.teacher_id = u.id AND ta.grade_level = ?)
                OR EXISTS (SELECT 1 FROM sections sec
                            WHERE sec.adviser_id = u.id AND sec.grade_level = ?)
              ))
        )`,
    [target_grade, target_grade, target_grade, target_grade, target_grade]
  );
  return rows.map((r) => r.id);
}

// NARROWING 2 (see the header): the adviser of the student's section, and only
// them. sections.adviser_id via students.section_id is the same authority
// routes/excuses.js:387 checks before allowing a review.
//
// KNOWN CONSEQUENCE, accepted by Darryl 2026-09-19: 20 of the 23 seeded
// sections have no adviser, so a letter from a student in one of them notifies
// NOBODY, silently. That mirrors the blind spot attendance already has for the
// same reason. The fix is an adviser on every real section before the pilot —
// not a fallback recipient here, which would hand a letter to someone with no
// authority to review it.
async function excuseAdviserAudience(conn, studentId) {
  const [rows] = await conn.query(
    `SELECT sec.adviser_id AS id
       FROM students s
       JOIN sections sec ON sec.id = s.section_id
       JOIN users u ON u.id = sec.adviser_id AND u.status = 'active'
      WHERE s.id = ? LIMIT 1`,
    [studentId]
  );
  return rows.map((r) => r.id);
}

async function activeAdmins(conn) {
  const [rows] = await conn.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  return rows.map((r) => r.id);
}

async function parentOfStudent(conn, studentId) {
  const [rows] = await conn.query(
    "SELECT id FROM users WHERE role = 'parent' AND status = 'active' AND student_id = ? LIMIT 1",
    [studentId]
  );
  return rows.map((r) => r.id);
}

async function activeUserById(conn, userId) {
  const [rows] = await conn.query("SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1", [userId]);
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Insert + emit
// ---------------------------------------------------------------------------

// Returns the recipient ids actually offered to the insert (A1 already
// applied), for the caller to emit after commit.
//
// INSERT IGNORE against uq_notifications_once (user_id, type, item_id) is what
// makes "at most once per subject + term" free for grade_available: a grades
// row already IS one (student, subject, term, school_year), so its id is that
// key. It also makes every hook idempotent under a retry.
async function insertNotifications(conn, { type, itemType, itemId, actorId, titleSnapshot, userIds }) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (!recipients.length) return [];

  const values = recipients.map((uid) => [uid, type, itemType, itemId, titleSnapshot || null, actorId || null]);
  await conn.query(
    `INSERT IGNORE INTO notifications (user_id, type, item_type, item_id, title_snapshot, actor_id)
     VALUES ?`,
    [values]
  );
  return recipients;
}

// DELETING AN ITEM DELETES ITS NOTIFICATIONS (fix/server-reliability,
// 2026-09-30). Called inside the item's DELETE transaction, BEFORE the item
// row goes. Returns the recipients so the caller can emitNotifications()
// after commit — without that signal each recipient's cached bell and badge
// kept counting a row the read-time visibility check already hid (KNOWN
// ISSUES A2: "1 unread" over "No notifications yet"). The rows are not left
// to be hidden forever: a notification about something that no longer
// exists cannot be opened (§10), and leaving it was what every cleanup kept
// finding.
async function removeItemNotifications(conn, itemType, itemId) {
  const [rows] = await conn.query('SELECT DISTINCT user_id FROM notifications WHERE item_type = ? AND item_id = ?', [
    itemType,
    itemId,
  ]);
  await conn.query('DELETE FROM notifications WHERE item_type = ? AND item_id = ?', [itemType, itemId]);
  return rows.map((r) => r.user_id);
}

// Per-user rooms already exist — socket.js:44 joins `user:<id>` at connect
// time and routes/messages.js:402 established the pattern. NEVER io.emit().
//
// ONE EVENT, CARRYING NOTHING. `notification_counts` means "refetch". The
// counts and the rows must come from the server, never from client arithmetic
// on a pushed payload — that is convention 5b one component out, and it is the
// exact defect UnreadProvider's own header records from 2026-09-07 ("THE FIX
// IS A SIGNAL, NOT A LOCAL DECREMENT"). A payload event can be added in N2 if
// the dropdown wants to prepend without a round trip; it is not needed to make
// the bell correct, and a payload that disagreed with the next refetch would
// be worse than a round trip.
function emitNotifications(req, userIds) {
  const io = req && req.app && req.app.get('io');
  if (!io || !userIds || !userIds.length) return;
  for (const uid of new Set(userIds)) {
    io.to(`user:${uid}`).emit('notification_counts');
  }
}

module.exports = {
  announcementAudience,
  memoAudience,
  eventAudience,
  excuseAdviserAudience,
  activeAdmins,
  parentOfStudent,
  activeUserById,
  insertNotifications,
  removeItemNotifications,
  emitNotifications,
};
