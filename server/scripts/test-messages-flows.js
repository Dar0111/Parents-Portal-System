/**
 * Messages API + Socket.io tests — canMessage boundary, read-vs-write
 * scoping, sender_id spoofing, socket connection-time auth, and a source
 * check guarding against a room-scoped emit regressing into a broadcast.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every message/user/student this script creates is tracked
 * and deleted in a finally block, so it passes on repeat runs with no
 * db:setup.
 *
 * Usage: npm run test:messages
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { io: ioClient } = require('socket.io-client');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally. A teacher this run creates skips the first-sign-in
// password change (scripts/policyFixture.js, feat/privacy).
const { createPolicyFixture, clearForcedChange } = require('./policyFixture');
const policy = createPolicyFixture();

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { status: res.status, data };
}

async function login(loginId, password) {
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

function connectSocket(token) {
  return new Promise((resolve) => {
    const socket = ioClient(BASE, {
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 3000,
    });

    const timer = setTimeout(() => {
      socket.close();
      resolve({ connected: false, error: 'timeout waiting for connect/connect_error' });
    }, 4000);

    socket.on('connect', () => {
      clearTimeout(timer);
      resolve({ connected: true, socket });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      resolve({ connected: false, error: err.message });
    });
  });
}

async function run() {
  console.log(`\nParents Portal — Messages API + Socket.io Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  await policy.accept(adminToken);
  const adminId = adminLogin.data?.user?.id;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Mabini only.
  const teacher1Login = await login('TCH-001', 'Teacher@2026');
  const teacher1Token = teacher1Login.data?.token;
  await policy.accept(teacher1Token);
  const teacher1Id = teacher1Login.data?.user?.id;
  assert(teacher1Login.status === 200 && teacher1Token, 'Teacher (TCH-001) login');

  const parent1Login = await login('13567454', 'Parent@2026');
  const parent1Token = parent1Login.data?.token;
  await policy.accept(parent1Token);
  const parent1Id = parent1Login.data?.user?.id;
  assert(parent1Login.status === 200 && parent1Token, 'Parent login (Marwin, Grade 6 - Mabini)');

  // PostgreSQL (Phase 3): the suites' one fixture connection, test-helpers/db.js.
  const { withDb } = require('./test-helpers/db');

  const createdMessageIds = [];
  const createdLoginIds = [];
  const createdStudentIds = [];

  async function cleanup() {
    if (createdMessageIds.length) {
      await withDb((conn) => conn.query('DELETE FROM messages WHERE id = ANY(?::int[])', [createdMessageIds]));
    }
    if (createdLoginIds.length) {
      await withDb((conn) => conn.query('DELETE FROM users WHERE login_id = ANY(?::text[])', [createdLoginIds]));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ANY(?::int[])', [createdStudentIds]));
    }
  }

  try {
    // --- Fixtures: an unassigned teacher, and a parent/student in a
    // different class than TCH-001's assignment ---
    const runId = String(Date.now()).slice(-8);

    // TCH-002 advises Grade 5 - Masigasig with ZERO teacher_assignments rows —
  // the only fixture that can tell "assigned" apart from "adviser".
  const adviserLogin = await login('TCH-002', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  await policy.accept(adviserToken);
  assert(
    adviserLogin.status === 200 && adviserToken,
    'Adviser-only teacher login (TCH-002, Grade 5 - Masigasig, no assignments)'
  );

  const teacher2LoginId = `TCH-MSG${runId}`;
    createdLoginIds.push(teacher2LoginId);
    const createTeacher2 = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: teacher2LoginId, password: 'Teacher@2026', name: 'Unassigned Teacher' },
    });
    const teacher2Id = createTeacher2.data?.user?.id;
    if (teacher2Id) await clearForcedChange(teacher2Id);
    const teacher2Login = await login(teacher2LoginId, 'Teacher@2026');
    const teacher2Token = teacher2Login.data?.token;
    await policy.accept(teacher2Token);
    assert(
      createTeacher2.status === 201 && teacher2Login.status === 200,
      'Fixture: created an unassigned second teacher'
    );

    // 12 digits (the LRN rule since 2026-09-18); inserted by SQL, so the rule
    // does not run here — the fixture just looks like a real LRN.
    const student2Lrn = `3${String(Date.now()).slice(-11)}`;
    const [studentResult] = await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, status, created_by)
         VALUES (?, 'Other', 'Student', 3, 'Aguinaldo', 'active', ?) RETURNING id`,
        [student2Lrn, adminId]
      )
    );
    const student2Id = studentResult.insertId;
    createdStudentIds.push(student2Id);

    const parent2LoginId = student2Lrn;
    createdLoginIds.push(parent2LoginId);
    await withDb((conn) =>
      conn.query(
        `INSERT INTO users (login_id, password, role, status, name, student_id, created_by)
         VALUES (?, 'not-a-real-hash', 'parent', 'active', 'Other Guardian', ?, ?)`,
        [parent2LoginId, student2Id, adminId]
      )
    );
    const [parent2Rows] = await withDb((conn) =>
      conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [parent2LoginId])
    );
    const parent2Id = parent2Rows[0].id;
    assert(Number.isInteger(parent2Id), 'Fixture: created a parent/student outside TCH-001\'s assignment');

    // --- canMessage: parent boundary ---
    console.log('\ncanMessage — parent sender:');

    const m1 = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: teacher1Id, body: 'Hello teacher' },
    });
    assert(m1.status === 201, 'Parent messages their child\'s assigned teacher');
    if (m1.data?.data?.id) createdMessageIds.push(m1.data.data.id);
    const m1Id = m1.data?.data?.id;

    const parentToUnassigned = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: teacher2Id, body: 'Should be blocked' },
    });
    assert(
      parentToUnassigned.status === 403 && /not connected to your child's class/i.test(parentToUnassigned.data?.message || ''),
      'Parent messaging a teacher not assigned to their child is blocked, naming the reason'
    );

    // Parent → admin is REFUSED since 2026-10-05 (the owner's decision: the
    // admin's inbox is teacher ↔ admin only). Was: 201 "Parent messages admin".
    const parentToAdmin = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: adminId, body: 'Should be blocked' },
    });
    assert(
      parentToAdmin.status === 403 && parentToAdmin.data?.message === "Parents may only message their child's teachers.",
      'Parent messaging the admin is blocked (403), naming the reason'
    );
    if (parentToAdmin.data?.data?.id) createdMessageIds.push(parentToAdmin.data.data.id);

    const parentToParent = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: parent2Id, body: 'Should be blocked' },
    });
    assert(
      parentToParent.status === 403 && /only message their child's teachers/i.test(parentToParent.data?.message || ''),
      'Parent messaging another parent is blocked, naming the reason'
    );

    // --- canMessage: teacher boundary ---
    console.log('\ncanMessage — teacher sender:');

    const m3 = await request('POST', '/api/messages', {
      token: teacher1Token,
      body: { receiver_id: teacher2Id, body: 'Hello colleague' },
    });
    assert(m3.status === 201, 'Teacher messages another teacher unconditionally');
    if (m3.data?.data?.id) createdMessageIds.push(m3.data.data.id);

    const teacherToWrongParent = await request('POST', '/api/messages', {
      token: teacher1Token,
      body: { receiver_id: parent2Id, body: 'Should be blocked' },
    });
    assert(
      teacherToWrongParent.status === 403 &&
        /not in one of your classes/i.test(teacherToWrongParent.data?.message || ''),
      'Teacher messaging a parent outside their assignment is blocked, naming the reason'
    );

    const m4 = await request('POST', '/api/messages', {
      token: teacher1Token,
      body: { receiver_id: parent1Id, body: 'Hello parent' },
    });
    assert(m4.status === 201, 'Teacher messages the parent of their own assigned student');
    if (m4.data?.data?.id) createdMessageIds.push(m4.data.data.id);

    // --- canMessage: the admin (teacher ↔ admin only, since 2026-10-05) ---
    console.log('\ncanMessage — the admin:');

    const teacherToAdmin = await request('POST', '/api/messages', {
      token: teacher1Token,
      body: { receiver_id: adminId, body: 'Hello admin' },
    });
    assert(teacherToAdmin.status === 201, 'Teacher messages the admin');
    if (teacherToAdmin.data?.data?.id) createdMessageIds.push(teacherToAdmin.data.data.id);

    const adminToTeacher = await request('POST', '/api/messages', {
      token: adminToken,
      body: { receiver_id: teacher1Id, body: 'Hello teacher' },
    });
    assert(adminToTeacher.status === 201, 'The admin messages a teacher');
    if (adminToTeacher.data?.data?.id) createdMessageIds.push(adminToTeacher.data.data.id);

    const adminToParent = await request('POST', '/api/messages', {
      token: adminToken,
      body: { receiver_id: parent1Id, body: 'Should be blocked' },
    });
    assert(
      adminToParent.status === 403 && adminToParent.data?.message === 'The admin may only message teachers.',
      'The admin messaging a parent is blocked (403), naming the reason'
    );
    if (adminToParent.data?.data?.id) createdMessageIds.push(adminToParent.data.data.id);

    // A second admin, inserted for this run only (the seed has one) and
    // removed by its login id in cleanup(), like the parent fixture above.
    const admin2LoginId = `ADM-MSG${runId}`;
    createdLoginIds.push(admin2LoginId);
    await withDb((conn) =>
      conn.query(
        `INSERT INTO users (login_id, password, role, status, name, created_by)
         VALUES (?, 'not-a-real-hash', 'admin', 'active', 'Second Admin', ?)`,
        [admin2LoginId, adminId]
      )
    );
    const [admin2Rows] = await withDb((conn) =>
      conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [admin2LoginId])
    );
    const admin2Id = admin2Rows[0]?.id;
    const adminToAdmin = await request('POST', '/api/messages', {
      token: adminToken,
      body: { receiver_id: admin2Id, body: 'Should be blocked' },
    });
    assert(
      Number.isInteger(admin2Id) && adminToAdmin.status === 403 && adminToAdmin.data?.message === 'The admin may only message teachers.',
      'The admin messaging another admin is blocked (403)'
    );
    if (adminToAdmin.data?.data?.id) createdMessageIds.push(adminToAdmin.data.data.id);

    // --- Validation ---
    console.log('\nValidation:');

    const emptyBody = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: teacher1Id, body: '' },
    });
    assert(emptyBody.status === 400, 'Empty body rejected');

    const whitespaceBody = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: teacher1Id, body: '   ' },
    });
    assert(whitespaceBody.status === 400, 'Whitespace-only body rejected');

    const missingReceiver = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { body: 'No receiver' },
    });
    assert(missingReceiver.status === 400, 'Missing receiver_id rejected');

    const selfMessage = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: parent1Id, body: 'Talking to myself' },
    });
    assert(selfMessage.status === 400, 'Messaging yourself rejected');

    const nonexistentRecipient = await request('POST', '/api/messages', {
      token: adminToken,
      body: { receiver_id: 999999999, body: 'Nobody home' },
    });
    assert(nonexistentRecipient.status === 404, 'Nonexistent recipient returns 404');

    // sender_id spoofing: send a bogus sender_id in the body, confirm the
    // server ignores it and uses req.user.id instead.
    const m5 = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: teacher1Id, sender_id: teacher1Id, body: 'Spoofed sender test' },
    });
    assert(m5.status === 201, 'Send with a spoofed sender_id in the body still succeeds');
    if (m5.data?.data?.id) createdMessageIds.push(m5.data.data.id);
    assert(
      m5.data?.data?.sender_id === parent1Id,
      'Spoofed sender_id in the body is ignored — actual sender_id is req.user.id'
    );

    // --- Read: conversations + thread ---
    console.log('\nRead:');

    // Ground truth from the DB directly, not a hardcoded literal — same
    // reasoning as the thread-order fix above: parent1/teacher1 are the
    // permanently-reused seeded accounts, and real messages will flow
    // through them (demo, manual testing, Stage 4 web dev). Asserting
    // against "the actual last message"/"the actual unread count",
    // computed the same way the endpoint itself computes them, still
    // catches a real bug (e.g. a GROUP BY + MAX picking the wrong row —
    // exactly the concern the window-function design in routes/messages.js
    // was built to avoid) without breaking the moment someone sends a real
    // message through these accounts.
    const [trueLastMessageRows] = await withDb((conn) =>
      conn.query(
        `SELECT body FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [parent1Id, teacher1Id, teacher1Id, parent1Id]
      )
    );
    const [trueUnreadFromTeacher1Rows] = await withDb((conn) =>
      conn.query(
        'SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND receiver_id = ? AND read_status = 0',
        [teacher1Id, parent1Id]
      )
    );

    const conversations = await request('GET', '/api/messages/conversations', { token: parent1Token });
    const withTeacher1 = (conversations.data?.conversations || []).find((c) => c.other_user_id === teacher1Id);
    assert(conversations.status === 200 && withTeacher1, "Parent's conversation list includes the teacher");
    assert(
      withTeacher1?.last_message_body === trueLastMessageRows[0]?.body,
      'Conversation list shows the actual last message for that pair, not an arbitrary row'
    );
    assert(
      withTeacher1?.unread_count === trueUnreadFromTeacher1Rows[0]?.c,
      'Unread count matches the DB, not just a value this run expects to be the only activity'
    );

    const thread = await request('GET', `/api/messages/with/${teacher1Id}`, { token: parent1Token });
    // Filtered to the 3 messages *this run* created (m1, m4, m5), not the
    // whole thread verbatim. parent1/teacher1 are the seeded accounts
    // (13567454/TCH-001), reused across every run rather than created
    // fresh — a real message between them from a demo, manual testing, or
    // actual use is legitimate data, not pollution, and asserting the
    // thread's exact full content would fail against it with no broken
    // code behind it (found exactly this: one stray manual-test row broke
    // this assertion with the ordering logic completely correct). Still
    // catches the actual regression this guards against — a reversed
    // ORDER BY — since these three IDs' relative order in the response
    // must match the order they were actually sent in, regardless of
    // whatever else is in the thread.
    const ownMessageIds = [m1.data?.data?.id, m4.data?.data?.id, m5.data?.data?.id];
    const ownBodiesInThreadOrder = (thread.data?.messages || [])
      .filter((m) => ownMessageIds.includes(m.id))
      .map((m) => m.body);
    assert(
      thread.status === 200 && ownBodiesInThreadOrder.join('|') === 'Hello teacher|Hello parent|Spoofed sender test',
      'Thread returns this run\'s own messages in chronological order'
    );
    assert(
      thread.data?.messages?.every((m) => m.sender_name && m.receiver_name),
      'Thread messages include sender_name/receiver_name from the double JOIN'
    );

    const threadBadId = await request('GET', '/api/messages/with/abc', { token: parent1Token });
    assert(threadBadId.status === 400, 'GET /with/abc returns 400, not 500');

    // --- Read-status ---
    console.log('\nRead-status:');

    // Ground truth captured immediately before the call, same reasoning as
    // above — real usage may have left other parent1->teacher1 messages
    // unread, and a hardcoded "2" (just m1, m5) would fail against that
    // with the endpoint behaving correctly.
    const [trueUnreadFromParent1Rows] = await withDb((conn) =>
      conn.query(
        'SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND receiver_id = ? AND read_status = 0',
        [parent1Id, teacher1Id]
      )
    );
    const readAll = await request('PATCH', `/api/messages/read-all/${parent1Id}`, { token: teacher1Token });
    assert(
      readAll.status === 200 && readAll.data?.count === trueUnreadFromParent1Rows[0]?.c,
      'Teacher marks the whole thread from parent1 read — count matches what was actually unread'
    );

    const convosAfterReadAll = await request('GET', '/api/messages/conversations', { token: teacher1Token });
    const teacherWithParent1 = (convosAfterReadAll.data?.conversations || []).find(
      (c) => c.other_user_id === parent1Id
    );
    assert(teacherWithParent1?.unread_count === 0, 'Unread count is 0 after read-all');

    const senderMarksOwnRead = await request('PATCH', `/api/messages/${m1Id}/read`, { token: parent1Token });
    assert(
      senderMarksOwnRead.status === 403,
      'The sender (not recipient) marking a message read is 403, even after it is already read'
    );

    const recipientMarksRead = await request('PATCH', `/api/messages/${m4.data.data.id}/read`, {
      token: parent1Token,
    });
    assert(recipientMarksRead.status === 200, 'The actual recipient marks a message read');

    const unrelatedMarksRead = await request('PATCH', `/api/messages/${m1Id}/read`, { token: adminToken });
    assert(
      unrelatedMarksRead.status === 403,
      'An unrelated third party (admin, not sender or recipient) cannot mark a message read'
    );

    const readBadId = await request('PATCH', '/api/messages/abc/read', { token: parent1Token });
    assert(readBadId.status === 400, 'PATCH /abc/read returns 400, not 500');

    const readAllBadId = await request('PATCH', '/api/messages/read-all/abc', { token: parent1Token });
    assert(readAllBadId.status === 400, 'PATCH /read-all/abc returns 400, not 500');

    // --- Socket.io: connection-time auth only ---
    console.log('\nSocket.io connection auth:');

    const noToken = await connectSocket(null);
    assert(!noToken.connected, 'Socket connection with no token is rejected');

    const validConnection = await connectSocket(adminToken);
    assert(validConnection.connected, 'Socket connection with a valid active user token succeeds');
    if (validConnection.socket) validConnection.socket.close();

    const deactivate = await request('PATCH', `/api/users/${teacher2Id}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(deactivate.status === 200, 'Fixture: deactivated the throwaway teacher for the next check');

    const deactivatedConnection = await connectSocket(teacher2Token);
    assert(
      !deactivatedConnection.connected,
      "A deactivated user's token is rejected at connection time, same live status re-check as HTTP auth"
    );

    // --- Source check: room-scoped emit, never a broadcast ---
    // A real delivery test needs two concurrent sockets and a
    // wait-for-an-event-that-should-not-arrive assertion on the second one
    // — a timeout dressed up as proof. This checks the actual regression
    // risk instead: a future refactor turning io.to(...).emit(...) into a
    // bare io.emit(...), which would broadcast every message to every
    // connected socket regardless of who it's for.
    console.log('\nSource check (delivery mechanism):');

    // Strip // line comments first — this file's own comments explain the
    // rule in prose ("Never io.emit()"), which would otherwise false-match
    // the negative check below. Check code, not prose about the code.
    //
    // No `$` anchor: these files have Windows CRLF line endings, so after
    // splitting on '\n' each line still carries a trailing '\r'. JS's `.`
    // doesn't match line terminators (which includes `\r`), so `.*` stops
    // right before it — but `$` (no `m` flag) only matches true end-of-string,
    // never that position, so the whole regex silently failed to match at
    // all and stripped nothing. `.*` alone already extends to the end of
    // each single line without needing an anchor.
    const stripLineComments = (source) =>
      source
        .split('\n')
        .map((line) => line.replace(/\/\/.*/, ''))
        .join('\n');

    const socketSource = stripLineComments(fs.readFileSync(path.join(__dirname, '..', 'socket.js'), 'utf8'));
    const messagesSource = stripLineComments(
      fs.readFileSync(path.join(__dirname, '..', 'routes', 'messages.js'), 'utf8')
    );
    const combinedSource = `${socketSource}\n${messagesSource}`;

    assert(
      /io\.to\([^)]*\)\.emit\(/.test(combinedSource),
      'Delivery uses a room-scoped io.to(...).emit(...) call'
    );
    assert(
      !/\bio\.emit\(/.test(combinedSource),
      'No bare io.emit( anywhere in actual code — that would broadcast to every connected socket'
    );

    // --- GET /api/messages/contacts ---
    // The inverse of canMessage(): same boundary, read direction. Without it a
    // parent has no way to discover their child's teachers' user ids, so a
    // first conversation cannot be started from the UI.
    console.log('\nContacts:');

    const parentContacts = await request('GET', '/api/messages/contacts', { token: parent1Token });
    const parentContactIds = (parentContacts.data?.contacts || []).map((c) => c.id);
    assert(parentContacts.status === 200, 'Parent can list contacts');
    assert(
      parentContactIds.includes(teacher1Id),
      "Parent sees their own child's teacher"
    );
    // Since 2026-10-05 a parent may not message the admin, so the admin is
    // not offered. Was: 'Parent sees admin'.
    assert(
      !(parentContacts.data?.contacts || []).some((c) => c.role === 'admin'),
      'Parent never sees the admin'
    );
    // The privacy property this endpoint exists to protect: a parent must never
    // see a teacher with no connection to their own child.
    assert(
      !(parentContacts.data?.contacts || []).some(
        (c) => c.role === 'teacher' && c.id !== teacher1Id && c.id !== teacher2Id
      ) || !parentContactIds.includes(adviserLogin.data?.user?.id),
      'Parent does NOT see an unrelated teacher (TCH-002, who teaches and advises neither)'
    );
    assert(
      !(parentContacts.data?.contacts || []).some((c) => c.role === 'parent'),
      'Parent never sees another parent'
    );
    const teacherRow = (parentContacts.data?.contacts || []).find((c) => c.id === teacher1Id);
    assert(
      teacherRow && typeof teacherRow.subject === 'string' && teacherRow.subject.length > 0,
      "A teacher row carries the subject(s) they teach — a bare name can't tell two teachers apart"
    );
    // LEFT JOIN: a teacher has no student_id, so child-derived fields are null.
    assert(
      teacherRow.student_grade_level == null && teacherRow.student_section == null,
      'Parent seeing a teacher: student_grade_level and student_section are null'
    );

    const teacherContacts = await request('GET', '/api/messages/contacts', { token: teacher1Token });
    const teacherParentRows = (teacherContacts.data?.contacts || []).filter((c) => c.role === 'parent');
    assert(teacherContacts.status === 200, 'Teacher can list contacts');
    assert(
      teacherParentRows.every((c) => c.student_name),
      "Every parent row carries the student's name — a teacher looks for \"Marwin's parent\""
    );
    // Seeded parent 13567454 / Marwin, Grade 6 - Malikhain. Read only — do not
    // write on that class. Prefix: these are the CHILD's class, not the user's.
    const marwinParent = (teacherContacts.data?.contacts || []).find((c) => c.id === parent1Id);
    assert(
      marwinParent &&
        Number(marwinParent.student_grade_level) === 6 &&
        marwinParent.student_section === 'Malikhain',
      "TCH-001's parent contact for Marwin carries student_grade_level 6 and student_section Malikhain"
    );
    const teacherAdminRow = (teacherContacts.data?.contacts || []).find((c) => c.role === 'admin');
    assert(
      teacherAdminRow &&
        teacherAdminRow.student_grade_level == null &&
        teacherAdminRow.student_section == null,
      'Teacher seeing admin: student_grade_level and student_section are null'
    );
    assert(
      (teacherContacts.data?.contacts || []).some((c) => c.role === 'admin'),
      'Teacher sees admin'
    );

    // TCH-002 advises Grade 5 - Masigasig, whose only student's parent account
    // (login 1234567) is deliberately seeded as 'pending'. Contacts lists ACTIVE
    // accounts only — a pending parent cannot log in, so offering that
    // conversation would promise something that cannot happen.
    // SO: ZERO PARENT CONTACTS HERE IS CORRECT, NOT THE SCOPE BUG RETURNING.
    // If this ever fails, check that parent's status before touching the scope.
    const adviserContacts = await request('GET', '/api/messages/contacts', { token: adviserToken });
    assert(adviserContacts.status === 200, 'Adviser-only teacher can list contacts');
    assert(
      (adviserContacts.data?.contacts || []).filter((c) => c.role === 'parent').length === 0,
      'Adviser-only teacher sees zero parents — correct: their section\'s only parent is still pending'
    );
    assert(
      (adviserContacts.data?.contacts || []).some((c) => c.role === 'admin'),
      'Adviser-only teacher still sees admin and other teachers'
    );

    // Since 2026-10-05 the admin may message teachers only, so its contacts
    // are the ACTIVE teachers. Was: 'Admin sees everyone (never fewer than a
    // scoped role does)'.
    const adminContacts = await request('GET', '/api/messages/contacts', { token: adminToken });
    const adminContactRows = adminContacts.data?.contacts || [];
    assert(
      adminContacts.status === 200 &&
        adminContactRows.length > 0 &&
        adminContactRows.every((c) => c.role === 'teacher') &&
        adminContactRows.some((c) => c.id === teacher1Id),
      'The admin sees active teachers only — no parent, no admin'
    );
    assert(
      !(adminContacts.data?.contacts || []).some((c) => c.id === adminId),
      'Contacts never include the caller themselves'
    );

    // THE ADVISER LABEL (2026-10-06): a teacher with NO subject assignment who
    // advises a section is labelled "Adviser of <section>" in the subject's
    // place (the teacher dashboard's chip); a teacher with subjects keeps the
    // subject list — teacher1 advises a section AND teaches, so it is the
    // control. The adviser is the seeded adviser-only account (Grade 5 -
    // Masigasig, zero assignments), signed in above.
    const adviserUserId = adviserLogin.data?.user?.id;
    const adviserRow = adminContactRows.find((c) => c.id === adviserUserId);
    assert(
      Number.isInteger(adviserUserId) && adviserRow?.subject === 'Adviser of Grade 5 - Masigasig',
      'An adviser with no subjects is labelled "Adviser of Grade 5 - Masigasig" where the subject list would be',
      `got ${JSON.stringify(adviserRow?.subject)}`
    );
    const subjectTeacherRow = adminContactRows.find((c) => c.id === teacher1Id);
    assert(
      typeof subjectTeacherRow?.subject === 'string' &&
        subjectTeacherRow.subject.length > 0 &&
        !subjectTeacherRow.subject.includes('Adviser of'),
      'A teacher with subjects keeps the subject list, unchanged (the label is only for a teacher with none)',
      `got ${JSON.stringify(subjectTeacherRow?.subject)}`
    );

    // ?search= filters WITHIN scope; it can never widen it.
    const searched = await request('GET', '/api/messages/contacts?search=zzzznomatch', {
      token: parent1Token,
    });
    assert(
      searched.status === 200 && (searched.data?.contacts || []).length === 0,
      'search with no match returns an empty list, not an unscoped one'
    );

    const unauthContacts = await request('GET', '/api/messages/contacts');
    assert(unauthContacts.status === 401, 'Unauthenticated GET /contacts returns 401');

    // --- Pagination contract (2026-09-19, utils/pagination.js): every list
    // carries page { limit, offset, total, has_more }; limit default 50, max
    // 200; sort against an allow-list. Invariants only — never an exact count
    // on a table the application also writes to.
    console.log('\nPagination:');
    const qs = (path, q) => `${path}${path.includes('?') ? '&' : '?'}${q}`;
    const ordered = (rows, field) =>
      rows.every((row, i) => {
        if (i === 0) return true;
        const a = rows[i - 1][field];
        const b = row[field];
        if (a === null || a === undefined || b === null || b === undefined) return true;
        return typeof a === 'number' && typeof b === 'number'
          ? a >= b
          : String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) >= 0;
      });
    async function checkPage(path, token, key, { sort, field, idField = 'id' }) {
      const first = await request('GET', path, { token });
      const rows = first.data?.[key] || [];
      const page = first.data?.page;
      assert(
        first.status === 200 && page && page.limit === 50 && page.offset === 0 && Number.isInteger(page.total),
        `${path}: page { limit 50, offset 0, total } by default`
      );
      assert(
        rows.length <= 50 && page?.has_more === (page?.total > 50) && (page?.has_more || rows.length === page?.total),
        `${path}: rows <= limit, has_more = total > limit, a last page holds the rest`
      );
      const one = await request('GET', qs(path, 'limit=1'), { token });
      assert(
        one.status === 200 &&
          (one.data?.[key] || []).length === Math.min(1, page?.total ?? 0) &&
          one.data?.page?.has_more === (page?.total > 1),
        `${path}: limit=1 returns one row and has_more when more exist`
      );
      if ((page?.total ?? 0) >= 2) {
        const second = await request('GET', qs(path, 'limit=1&offset=1'), { token });
        assert(
          second.status === 200 && second.data?.[key]?.[0]?.[idField] !== one.data?.[key]?.[0]?.[idField],
          `${path}: offset=1 returns a different row than offset=0`
        );
      }
      const bad = await Promise.all(
        ['limit=0', 'limit=201', 'offset=-1', 'sort=nope', `sort=${sort}&order=sideways`, 'order=desc'].map((q) =>
          request('GET', qs(path, q), { token })
        )
      );
      assert(bad.every((r) => r.status === 400), `${path}: limit 0/201, offset -1, unknown sort, bad order, order without sort are 400`);
      assert(new RegExp(`sort must be one of: .*\\b${sort}\\b`).test(bad[3].data?.message || ''), `${path}: the sort 400 names the allowed keys`);
      const sorted = await request('GET', qs(path, `sort=${sort}&order=desc`), { token });
      assert(sorted.status === 200 && ordered(sorted.data?.[key] || [], field), `${path}: sort=${sort}&order=desc is ordered on the page`);
    }

    // TEACHER1's conversations since 2026-10-05: the parent's second
    // conversation was with the admin, which is refused now, so the parent
    // holds one and the offset=1 check below would never run. Teacher1 holds
    // at least two this run (parent1, and the admin both ways).
    await checkPage('/api/messages/conversations', teacher1Token, 'conversations', {
      sort: 'last_message_at',
      field: 'last_message_at',
      idField: 'other_user_id',
    });
    await checkPage('/api/messages/contacts', adminToken, 'contacts', { sort: 'name', field: 'name' });

    // C4: ?search= narrows total within scope. A TEACHER-name search since
    // 2026-10-05 (the admin's contacts are teachers only, so the old parent
    // search would have passed on zero rows): the term is a word of TCH-001's
    // own name, read from the admin's contacts, so the row must come back.
    const searchTerm = String(adminContactRows.find((c) => c.id === teacher1Id)?.name || '').split(/\s+/).filter(Boolean).pop() || 'zzzznomatch';
    const searchContacts = await request('GET', `/api/messages/contacts?search=${encodeURIComponent(searchTerm)}&limit=200`, { token: adminToken });
    const searchRows = searchContacts.data?.contacts || [];
    assert(
      searchContacts.status === 200 &&
        searchRows.some((c) => c.id === teacher1Id) &&
        searchRows.every((c) => c.role === 'teacher' && new RegExp(searchTerm, 'i').test(`${c.name} ${c.student_name || ''}`)) &&
        (searchContacts.data?.page?.has_more || searchContacts.data?.page?.total === searchRows.length),
      "GET /messages/contacts?search=<a teacher's name> (the admin): the teacher comes back, every row matches, and total is the filtered count"
    );

    // --- C3: the thread pages on a cursor, newest page first, oldest-first
    // within the page. This run created at least three messages between
    // parent1 and teacher1 (m1, m4, m5), so the tail has a page before it.
    const tail = await request('GET', `/api/messages/with/${teacher1Id}?limit=1`, { token: parent1Token });
    const tailRows = tail.data?.messages || [];
    assert(
      tail.status === 200 && tailRows.length === 1 && tail.data?.page?.before === null && tail.data?.page?.limit === 1,
      'GET /with/:id?limit=1: one row, page.before null, page.limit 1'
    );
    assert(
      Number.isInteger(tail.data?.page?.total) && tail.data?.page?.total >= 3 && tail.data?.page?.has_more === true,
      'GET /with/:id?limit=1: total counts the whole thread and has_more is true with older rows'
    );
    const [[trueNewest]] = await withDb((conn) =>
      conn.query(
        `SELECT id FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY id DESC LIMIT 1`,
        [parent1Id, teacher1Id, teacher1Id, parent1Id]
      )
    );
    assert(tailRows[0]?.id === trueNewest?.id, 'GET /with/:id?limit=1 without before returns the NEWEST message');
    const earlier = await request('GET', `/api/messages/with/${teacher1Id}?limit=2&before=${tailRows[0]?.id}`, {
      token: parent1Token,
    });
    const earlierRows = earlier.data?.messages || [];
    assert(
      earlier.status === 200 &&
        earlierRows.length === 2 &&
        earlierRows.every((m) => m.id < tailRows[0]?.id) &&
        earlierRows[0].id < earlierRows[1].id &&
        earlier.data?.page?.before === tailRows[0]?.id,
      'GET /with/:id?before=<newest>&limit=2: two older rows, oldest first, page.before echoes the cursor'
    );
    assert(
      earlier.data?.page?.has_more === (earlier.data?.page?.total > 3),
      'GET /with/:id?before=: has_more is true exactly when rows older than the page exist'
    );
    const threadOffset = await request('GET', `/api/messages/with/${teacher1Id}?offset=1`, { token: parent1Token });
    const threadSort = await request('GET', `/api/messages/with/${teacher1Id}?sort=created_at`, { token: parent1Token });
    const threadBadBefore = await request('GET', `/api/messages/with/${teacher1Id}?before=abc`, { token: parent1Token });
    assert(
      threadOffset.status === 400 && /before=<message_id>, not offset/.test(threadOffset.data?.message || '') &&
        threadSort.status === 400 && threadBadBefore.status === 400,
      'GET /with/:id refuses offset, sort and a non-numeric before with 400'
    );

    // --- THE 64 KB TEXT CAP on messages.body (P3-C-R2 fix round, the owner's
    // answer of 2026-10-25): MySQL's TEXT held 65,535 bytes and refused more
    // (a 500); utils/requestLimits.js keeps the cap as the route's 400, on the
    // body as stored — after the route's trim.
    console.log('\nThe 64 KB text cap on messages.body:');
    const capBodies = [
      ['65,535 ASCII bytes', 'a'.repeat(65535), true],
      ['65,536 ASCII bytes', 'a'.repeat(65536), false],
      ['65,535 bytes as 32,767 é + 1 ASCII', 'é'.repeat(32767) + 'a', true],
      ['65,536 bytes as 32,768 é', 'é'.repeat(32768), false],
      ['65,535 bytes inside surrounding spaces (the cap is on the trimmed body)', `  ${'c'.repeat(65535)}  `, true],
    ];
    for (const [what, body, accepted] of capBodies) {
      const res = await request('POST', '/api/messages', { token: teacher1Token, body: { receiver_id: parent1Id, body } });
      if (res.data?.data?.id) createdMessageIds.push(res.data.data.id);
      assert(
        accepted
          ? res.status === 201 && res.data?.data?.body === body.trim()
          : res.status === 400 && res.data?.message === 'body must be 65,535 bytes or fewer.' && !res.data?.data,
        `POST /messages: a body of ${what} is ${accepted ? '201, stored whole' : '400, naming the field'}`,
        `got ${res.status} ${JSON.stringify(res.data?.message)}`
      );
    }
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
