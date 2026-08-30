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

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;

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
  const adminId = adminLogin.data?.user?.id;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Mabini only.
  const teacher1Login = await login('TCH-001', 'Teacher@2026');
  const teacher1Token = teacher1Login.data?.token;
  const teacher1Id = teacher1Login.data?.user?.id;
  assert(teacher1Login.status === 200 && teacher1Token, 'Teacher (TCH-001) login');

  const parent1Login = await login('13567454', 'Parent@2026');
  const parent1Token = parent1Login.data?.token;
  const parent1Id = parent1Login.data?.user?.id;
  assert(parent1Login.status === 200 && parent1Token, 'Parent login (Marwin, Grade 6 - Mabini)');

  const mysql = require('mysql2/promise');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  };
  async function withDb(fn) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  const createdMessageIds = [];
  const createdLoginIds = [];
  const createdStudentIds = [];

  async function cleanup() {
    if (createdMessageIds.length) {
      await withDb((conn) => conn.query('DELETE FROM messages WHERE id IN (?)', [createdMessageIds]));
    }
    if (createdLoginIds.length) {
      await withDb((conn) => conn.query('DELETE FROM users WHERE login_id IN (?)', [createdLoginIds]));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
  }

  try {
    // --- Fixtures: an unassigned teacher, and a parent/student in a
    // different class than TCH-001's assignment ---
    const runId = String(Date.now()).slice(-8);

    const teacher2LoginId = `TCH-MSG${runId}`;
    createdLoginIds.push(teacher2LoginId);
    const createTeacher2 = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: teacher2LoginId, password: 'Teacher@2026', name: 'Unassigned Teacher' },
    });
    const teacher2Id = createTeacher2.data?.user?.id;
    const teacher2Login = await login(teacher2LoginId, 'Teacher@2026');
    const teacher2Token = teacher2Login.data?.token;
    assert(
      createTeacher2.status === 201 && teacher2Login.status === 200,
      'Fixture: created an unassigned second teacher'
    );

    const student2Lrn = `3${runId}`;
    const [studentResult] = await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, status, created_by)
         VALUES (?, 'Other', 'Student', 3, 'Aguinaldo', 'active', ?)`,
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
      parentToUnassigned.status === 403 && /not assigned to your child's class/i.test(parentToUnassigned.data?.message || ''),
      'Parent messaging a teacher not assigned to their child is blocked, naming the reason'
    );

    const m2 = await request('POST', '/api/messages', {
      token: parent1Token,
      body: { receiver_id: adminId, body: 'Hello admin' },
    });
    assert(m2.status === 201, 'Parent messages admin');
    if (m2.data?.data?.id) createdMessageIds.push(m2.data.data.id);

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
        /not in one of your assigned classes/i.test(teacherToWrongParent.data?.message || ''),
      'Teacher messaging a parent outside their assignment is blocked, naming the reason'
    );

    const m4 = await request('POST', '/api/messages', {
      token: teacher1Token,
      body: { receiver_id: parent1Id, body: 'Hello parent' },
    });
    assert(m4.status === 201, 'Teacher messages the parent of their own assigned student');
    if (m4.data?.data?.id) createdMessageIds.push(m4.data.data.id);

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
  } finally {
    await cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
