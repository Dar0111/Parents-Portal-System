/**
 * The privacy build's suite (feat/privacy, 2026-10-10): the consent gate, the
 * forced first-sign-in password change, the sign-in limits, and the four
 * learner fields that are no longer collected.
 * Prerequisite: npm run db:migrate:privacy, and the API running (npm run dev).
 *
 * ITS OWN ACCOUNTS, NO SEEDED PASSWORD IN THIS FILE. The admin sign-in is read
 * at run time from scripts/proof-backup-loop.js (the line the dispatches name)
 * and never printed; every other account is created here — a teacher by the
 * admin, a learner by that teacher, a parent by that teacher — with passwords
 * made at run time. Nothing prints a login id, an LRN or a password.
 *
 * CLEANUP BY WHAT THIS RUN MADE, in the finally: its acceptance rows, its
 * sign-in failures (by the keys of the ids it typed), its parent, learner and
 * teacher, the admins' parent_pending notifications for its parent, and the
 * section it borrowed goes back to no adviser. activity_logs keeps its audit
 * rows, as every suite does.
 *
 * THE PER-IP LIMIT IS REACHED FOR REAL (100 failures from this machine), so
 * for those few seconds every sign-in from this machine answers 429 — run it
 * on its own, like every other suite, never beside another.
 *
 * Usage: npm run test:privacy
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { loginKey, MAX_PER_ACCOUNT, MAX_PER_IP, TOO_MANY } = require('../utils/loginThrottle');

const BASE = process.env.API_BASE || 'http://localhost:5000';
const POLICY_DIR = path.join(__dirname, '..', 'policy');

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, text };
}

async function login(loginId, password) {
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

async function withDb(fn) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

// The admin sign-in, read where the dispatches keep it. Never printed.
function adminSignIn() {
  const line = fs.readFileSync(path.join(__dirname, 'proof-backup-loop.js'), 'utf8').split(/\r?\n/)[171];
  const m = /login_id:\s*'([^']+)',\s*password:\s*'([^']+)'/.exec(line || '');
  if (!m) throw new Error('scripts/proof-backup-loop.js:172 is no longer the admin sign-in line');
  return { loginId: m[1], password: m[2] };
}

function requireFixture(condition, label, res) {
  if (!condition) {
    throw new Error(`fixture failed: ${label}${res ? ` (HTTP ${res.status})` : ''}`);
  }
}

async function run() {
  console.log('\nPrivacy flows (feat/privacy)\n');

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API is up');
  if (health.status !== 200) {
    console.error('Start the API first (npm run dev).');
    process.exit(1);
  }

  const runId = Date.now();
  const tail = String(runId).slice(-8);
  const firstPw = `Pv${tail}a1`;
  const ownPw = `Pw${tail}b2`;
  const teacherLoginId = `TPV${tail}`;
  const childLrn = `9${String(runId).slice(-11)}`;
  const typedIds = new Set(); // every login id this run types, for the cleanup by key

  const created = { teacherId: null, studentId: null, parentId: null, sectionId: null };

  try {
    const admin = adminSignIn();
    const adminLogin = await login(admin.loginId, admin.password);
    requireFixture(adminLogin.status === 200, 'admin signs in', adminLogin);
    const adminToken = adminLogin.data.token;

    // --- The documents ---------------------------------------------------
    console.log('The documents');
    const versions = JSON.parse(fs.readFileSync(path.join(POLICY_DIR, 'versions.json'), 'utf8'));
    const noToken = await request('GET', '/api/policy');
    assert(noToken.status === 401, 'GET /api/policy needs a session');
    const docs = await request('GET', '/api/policy', { token: adminToken });
    const list = docs.data?.documents || [];
    assert(
      docs.status === 200 && list.map((d) => d.document).join(',') === 'privacy_notice,terms_of_use',
      'GET /api/policy lists the Data Privacy Notice, then the Terms of Use'
    );
    assert(
      list.every((d) => d.version === versions[d.document].version && d.title === versions[d.document].title),
      'each version and title is the one in server/policy/versions.json'
    );
    assert(
      list.every((d) => d.text.startsWith("Draft — awaiting the school's approval")),
      "both documents are still the placeholder: \"Draft — awaiting the school's approval\""
    );
    const current = Object.fromEntries(list.map((d) => [d.document, d.version]));

    const adminStatus = await request('GET', '/api/policy/status', { token: adminToken });
    assert(
      adminStatus.status === 200 &&
        adminStatus.data?.required === false &&
        adminStatus.data?.policy_pending === false &&
        (adminStatus.data?.acceptances || []).every((a) => a.accepted_at === null),
      'staff: not required, not pending, nothing accepted (staff acceptance is deferred)'
    );
    const adminAccept = await request('POST', '/api/policy/accept', {
      token: adminToken,
      body: { versions: current, on_behalf_of_child: true },
    });
    assert(adminAccept.status === 403, 'only a parent can accept in this build — the admin gets 403');

    // --- A teacher the admin creates: the forced change ------------------
    console.log('\nA new teacher: the forced first-sign-in change');
    typedIds.add(teacherLoginId);
    const mkTeacher = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: teacherLoginId, password: firstPw, name: 'Privacy Fixture Teacher' },
    });
    requireFixture(mkTeacher.status === 201, 'admin creates the fixture teacher', mkTeacher);
    created.teacherId = mkTeacher.data.user.id;
    const tFirst = await login(teacherLoginId, firstPw);
    assert(tFirst.status === 200 && tFirst.data?.user?.must_change_password === 1, 'it signs in with must_change_password = 1');
    const tBlocked = await request('GET', '/api/students', { token: tFirst.data?.token });
    assert(tBlocked.status === 403 && tBlocked.data?.code === 'MUST_CHANGE_PASSWORD', 'everything else is 403 MUST_CHANGE_PASSWORD');
    const tMe = await request('GET', '/api/auth/me', { token: tFirst.data?.token });
    assert(tMe.status === 200 && tMe.data?.user?.must_change_password === 1, 'GET /api/auth/me still answers, with the flag');
    const tChange = await request('PUT', '/api/auth/change-password', {
      token: tFirst.data?.token,
      body: { current_password: firstPw, new_password: ownPw },
    });
    requireFixture(tChange.status === 200 && tChange.data?.token, 'the teacher changes the password', tChange);
    const teacherToken = tChange.data.token;
    const tOpen = await request('GET', '/api/students', { token: teacherToken });
    assert(tOpen.status === 200, 'after the change, the replacement token works');
    const tOld = await login(teacherLoginId, firstPw);
    assert(tOld.status === 401, 'the password the admin typed no longer signs in');

    // --- The teacher becomes an adviser and enrols: decision 6 -----------
    console.log('\nEnrolment: the four learner fields are no longer collected');
    const [[section]] = await withDb((conn) =>
      conn.query(
        `SELECT sec.id, sec.name, sec.grade_level FROM sections sec
           JOIN system_settings ss ON ss.setting_key = 'academic_year' AND sec.school_year = ss.setting_value
          WHERE sec.adviser_id IS NULL
          ORDER BY sec.grade_level DESC, sec.id DESC
          LIMIT 1`
      )
    );
    requireFixture(section, 'a section with no adviser exists to borrow');
    const assign = await request('PATCH', `/api/sections/${section.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: created.teacherId },
    });
    requireFixture(assign.status === 200, 'the admin makes the fixture teacher its adviser', assign);
    created.sectionId = section.id;

    const enrolBody = { lrn: childLrn, first_name: 'Privacy', last_name: 'Fixture', grade_level: section.grade_level, section: section.name };
    for (const [field, value] of [
      ['birthday', '2016-01-15'],
      ['gender', 'male'],
      ['address', 'Pateros'],
      ['contact_number', '09171234567'],
    ]) {
      const refused = await request('POST', '/api/students', { token: teacherToken, body: { ...enrolBody, [field]: value } });
      assert(
        refused.status === 400 && refused.data?.field === field && /no longer collected/.test(refused.data?.message || ''),
        `POST /students with a value for ${field}: 400, field "${field}", "no longer collected"`
      );
    }
    const enrol = await request('POST', '/api/students', {
      token: teacherToken,
      body: { ...enrolBody, birthday: null, gender: '', address: null, contact_number: '' },
    });
    assert(enrol.status === 201, 'POST /students: null and empty retired keys are ignored (201)');
    requireFixture(enrol.status === 201, 'the fixture learner is enrolled', enrol);
    created.studentId = enrol.data.student.id;
    const RETIRED = ['birthday', 'gender', 'address', 'contact_number'];
    assert(RETIRED.every((k) => !(k in enrol.data.student)), 'the created record carries none of the four');
    const putValue = await request('PUT', `/api/students/${created.studentId}`, {
      token: teacherToken,
      body: { first_name: 'Changed', gender: 'female' },
    });
    const putEmpty = await request('PUT', `/api/students/${created.studentId}`, {
      token: teacherToken,
      body: { first_name: 'Privacy', birthday: '', address: null },
    });
    assert(putValue.status === 400 && putValue.data?.field === 'gender', 'PUT /students with a gender value: 400, field "gender"');
    assert(putEmpty.status === 200 && putEmpty.data?.student?.first_name === 'Privacy', 'PUT /students: empty retired keys are ignored (200)');
    const listed = await request('GET', `/api/students?search=Fixture`, { token: teacherToken });
    assert(
      listed.status === 200 && (listed.data?.students || []).every((s) => RETIRED.every((k) => !(k in s))),
      'GET /students rows carry none of the four'
    );
    const [[stored]] = await withDb((conn) =>
      conn.query(
        'SELECT birthday IS NULL AND gender IS NULL AND address IS NULL AND contact_number IS NULL AS none_held FROM students WHERE id = ?',
        [created.studentId]
      )
    );
    assert(Number(stored.none_held) === 1, 'and the database row holds none of them');

    // --- A parent the adviser creates: forced change, then consent -------
    console.log('\nA new parent: the forced change first, then the consent gate');
    typedIds.add(childLrn);
    const mkParent = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: childLrn, password: firstPw, name: 'Privacy Fixture Guardian' },
    });
    requireFixture(mkParent.status === 201, 'the adviser creates the parent account', mkParent);
    created.parentId = mkParent.data.user.id;
    const approve = await request('PUT', `/api/users/parents/${created.parentId}/approve`, { token: adminToken });
    requireFixture(approve.status === 200, 'the admin approves it', approve);

    const pFirst = await login(childLrn, firstPw);
    assert(
      pFirst.status === 200 && pFirst.data?.user?.must_change_password === 1 && pFirst.data?.user?.policy_pending === true,
      'the parent signs in with must_change_password = 1 and policy_pending = true'
    );
    const pEarly = await request('GET', '/api/policy', { token: pFirst.data?.token });
    assert(pEarly.status === 403 && pEarly.data?.code === 'MUST_CHANGE_PASSWORD', 'the forced change comes first — even /api/policy waits for it');
    const pChange = await request('PUT', '/api/auth/change-password', {
      token: pFirst.data?.token,
      body: { current_password: firstPw, new_password: ownPw },
    });
    requireFixture(pChange.status === 200 && pChange.data?.token, 'the parent changes the password', pChange);
    const parentToken = pChange.data.token;

    const gated = await request('GET', `/api/students/${created.studentId}`, { token: parentToken });
    assert(
      gated.status === 403 &&
        gated.data?.code === 'POLICY_ACCEPTANCE_REQUIRED' &&
        !JSON.stringify(gated.data).includes(childLrn),
      'then the consent gate: the child record is 403 POLICY_ACCEPTANCE_REQUIRED (no LRN in the body)'
    );
    const gatedBell = await request('GET', '/api/notifications', { token: parentToken });
    assert(gatedBell.status === 403 && gatedBell.data?.code === 'POLICY_ACCEPTANCE_REQUIRED', 'every other endpoint is gated too (the bell)');
    const pMe = await request('GET', '/api/auth/me', { token: parentToken });
    assert(
      pMe.status === 200 && pMe.data?.user?.policy_pending === true && pMe.data?.user?.student_first_name === 'Privacy',
      '/api/auth/me still answers: policy_pending, and the child\'s first name for the third tick'
    );
    const pDocs = await request('GET', '/api/policy', { token: parentToken });
    const pStatus = await request('GET', '/api/policy/status', { token: parentToken });
    assert(pDocs.status === 200 && (pDocs.data?.documents || []).length === 2, 'the documents are readable before accepting');
    assert(
      pStatus.status === 200 && pStatus.data?.required === true && pStatus.data?.policy_pending === true,
      'GET /api/policy/status: required and pending'
    );

    console.log('\nAccepting: all three ticks, the current versions');
    const noChild = await request('POST', '/api/policy/accept', { token: parentToken, body: { versions: current } });
    assert(noChild.status === 400 && noChild.data?.field === 'on_behalf_of_child', 'without "on behalf of my child": 400, field on_behalf_of_child');
    const oneDoc = await request('POST', '/api/policy/accept', {
      token: parentToken,
      body: { versions: { privacy_notice: current.privacy_notice }, on_behalf_of_child: true },
    });
    assert(oneDoc.status === 400 && oneDoc.data?.field === 'terms_of_use', 'without the terms: 400, field terms_of_use');
    const stale = await request('POST', '/api/policy/accept', {
      token: parentToken,
      body: { versions: { ...current, privacy_notice: 'old-version' }, on_behalf_of_child: true },
    });
    assert(stale.status === 409 && stale.data?.field === 'privacy_notice', 'a version other than the current one: 409 — never a silent acceptance');
    const [[{ n: rowsBefore }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM policy_acceptances WHERE user_id = ?', [created.parentId])
    );
    assert(Number(rowsBefore) === 0, 'the refused bodies recorded nothing');

    const accept = await request('POST', '/api/policy/accept', {
      token: parentToken,
      body: { versions: current, on_behalf_of_child: true },
    });
    assert(accept.status === 200 && accept.data?.policy_pending === false, 'all three ticks and the current versions: 200, no longer pending');
    const [rows] = await withDb((conn) =>
      conn.query('SELECT document, version, student_id FROM policy_acceptances WHERE user_id = ? ORDER BY document', [created.parentId])
    );
    assert(
      rows.length === 2 &&
        rows.every((r) => r.version === current[r.document] && Number(r.student_id) === Number(created.studentId)),
      'one row per document: the user, the version, and the child accepted for'
    );
    const [[{ logs }]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS logs FROM activity_logs WHERE user_id = ? AND action = 'accept_policy'", [created.parentId])
    );
    assert(Number(logs) === 1, 'logged once as accept_policy');
    const again = await request('POST', '/api/policy/accept', { token: parentToken, body: { versions: current, on_behalf_of_child: true } });
    const [[{ n: rowsAfterAgain }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM policy_acceptances WHERE user_id = ?', [created.parentId])
    );
    assert(again.status === 200 && Number(rowsAfterAgain) === 2, 'accepting again is a no-op (a double tap adds nothing)');

    const open = await request('GET', `/api/students/${created.studentId}`, { token: parentToken });
    const openMe = await request('GET', '/api/auth/me', { token: parentToken });
    const openStatus = await request('GET', '/api/policy/status', { token: parentToken });
    assert(open.status === 200 && open.data?.student?.id === created.studentId, 'after accepting, the parent reads their child');
    assert(openMe.data?.user?.policy_pending === false, '/api/auth/me: policy_pending false');
    assert(
      (openStatus.data?.acceptances || []).every((a) => a.accepted_at),
      'GET /api/policy/status: a date for each document (Settings → Security & policy)'
    );

    // Accepting one document is not enough: a version bump on either asks again.
    await withDb((conn) =>
      conn.query("DELETE FROM policy_acceptances WHERE user_id = ? AND document = 'terms_of_use'", [created.parentId])
    );
    const reopened = await request('GET', `/api/students/${created.studentId}`, { token: parentToken });
    const reMe = await request('GET', '/api/auth/me', { token: parentToken });
    assert(
      reopened.status === 403 && reopened.data?.code === 'POLICY_ACCEPTANCE_REQUIRED' && reMe.data?.user?.policy_pending === true,
      'without the current Terms of Use (as after a version bump), the gate closes again'
    );
    const reAccept = await request('POST', '/api/policy/accept', { token: parentToken, body: { versions: current, on_behalf_of_child: true } });
    assert(reAccept.status === 200 && reAccept.data?.policy_pending === false, 'and accepting again reopens it');

    // --- Sign-in limits ---------------------------------------------------
    console.log('\nSign-in limits');
    // A success resets the account: MAX-1 failures, a success, MAX-1 more,
    // and the right password still works. It starts from a success, because
    // the old-password check above left one failure on this account.
    const reset = await login(teacherLoginId, ownPw);
    assert(reset.status === 200, 'the teacher signs in (one earlier failure is not a lock)');
    const [[{ n: failLogsBefore }]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS n FROM activity_logs WHERE user_id = ? AND action = 'login_failed'", [created.teacherId])
    );
    for (let i = 0; i < MAX_PER_ACCOUNT - 1; i += 1) await login(teacherLoginId, `wrong-${i}-x9`);
    const midOk = await login(teacherLoginId, ownPw);
    for (let i = 0; i < MAX_PER_ACCOUNT - 1; i += 1) await login(teacherLoginId, `wrong-${i}-y9`);
    const stillOk = await login(teacherLoginId, ownPw);
    assert(midOk.status === 200 && stillOk.status === 200, `a success resets the account: ${MAX_PER_ACCOUNT - 1} failures, a success, ${MAX_PER_ACCOUNT - 1} more, and it still signs in`);
    const [[{ n: failLogsAfter }]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS n FROM activity_logs WHERE user_id = ? AND action = 'login_failed'", [created.teacherId])
    );
    assert(
      Number(failLogsAfter) - Number(failLogsBefore) === 2 * (MAX_PER_ACCOUNT - 1),
      'each failure is logged as login_failed against the user id'
    );

    // A real account: MAX failures in a row, then even the right password is 429.
    const realFails = [];
    for (let i = 0; i < MAX_PER_ACCOUNT; i += 1) realFails.push(await login(childLrn, `wrong-${i}-z9`));
    const realLocked = await login(childLrn, ownPw);
    assert(realFails.every((r) => r.status === 401), `${MAX_PER_ACCOUNT} wrong passwords: 401 each`);
    assert(realLocked.status === 429 && realLocked.data?.message === TOO_MANY, 'then 429 — even with the right password');

    // An unknown login id locks the same way, with the same body.
    const unknownId = `ZZ${tail}`;
    typedIds.add(unknownId);
    const [[{ n: nullLogsBefore }]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS n FROM activity_logs WHERE user_id IS NULL AND action = 'login_failed'")
    );
    const unknownFails = [];
    for (let i = 0; i < MAX_PER_ACCOUNT; i += 1) unknownFails.push(await login(unknownId, `wrong-${i}-q9`));
    const unknownLocked = await login(unknownId, 'anything-1');
    assert(
      unknownFails.every((r) => r.status === 401 && r.text === realFails[0].text),
      'an unknown login id: the same 401, byte for byte, as a real one'
    );
    assert(
      unknownLocked.status === 429 && unknownLocked.text === realLocked.text,
      'then the same 429, byte for byte — a lock does not tell whether an LRN exists'
    );
    const [[{ n: nullLogsAfter }]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS n FROM activity_logs WHERE user_id IS NULL AND action = 'login_failed'")
    );
    assert(Number(nullLogsAfter) === Number(nullLogsBefore), 'an unknown id is counted, not logged (there is no user to name)');
    const [[{ n: keyRows }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = ?', [loginKey(unknownId)])
    );
    const [[{ n: plainRows }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = ? OR login_key = ?', [unknownId, childLrn])
    );
    assert(Number(keyRows) === MAX_PER_ACCOUNT && Number(plainRows) === 0, 'stored by HMAC key only — never the typed login id');

    // The per-IP limit: fill this machine's window to MAX_PER_IP with
    // distinct unknown ids (no account limit can trip), then any sign-in is 429.
    const [[mine]] = await withDb((conn) =>
      conn.query('SELECT ip FROM login_attempts WHERE login_key = ? ORDER BY id DESC LIMIT 1', [loginKey(unknownId)])
    );
    const [[{ n: ipNow }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > (NOW() - INTERVAL 15 MINUTE)', [mine.ip])
    );
    const toFill = Math.max(0, MAX_PER_IP - Number(ipNow));
    for (let i = 0; i < toFill; i += 1) {
      const id = `IP${tail}${i}`;
      typedIds.add(id);
      await login(id, 'wrong-ip-1');
    }
    const ipLocked = await login(teacherLoginId, ownPw);
    assert(
      ipLocked.status === 429 && ipLocked.text === realLocked.text,
      `${MAX_PER_IP} failures from one address: every sign-in from it is 429, the same body`
    );
  } finally {
    await cleanup(created, typedIds);
  }

  const after = await login(adminSignIn().loginId, adminSignIn().password);
  assert(after.status === 200, 'after the cleanup, this machine signs in again (the run\'s failures are gone)');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(created, typedIds) {
  await withDb(async (conn) => {
    const keys = [...typedIds].map(loginKey);
    if (keys.length) await conn.query('DELETE FROM login_attempts WHERE login_key IN (?)', [keys]);
    if (created.parentId) {
      await conn.query('DELETE FROM policy_acceptances WHERE user_id = ?', [created.parentId]);
      await conn.query("DELETE FROM notifications WHERE item_type = 'user' AND item_id = ?", [created.parentId]);
      await conn.query("DELETE FROM users WHERE id = ? AND role = 'parent'", [created.parentId]);
    }
    if (created.studentId) await conn.query('DELETE FROM students WHERE id = ?', [created.studentId]);
    if (created.sectionId && created.teacherId) {
      await conn.query('UPDATE sections SET adviser_id = NULL WHERE id = ? AND adviser_id = ?', [created.sectionId, created.teacherId]);
    }
    if (created.teacherId) await conn.query("DELETE FROM users WHERE id = ? AND role = 'teacher'", [created.teacherId]);
  });
}

run().catch((err) => {
  console.error('Privacy flows crashed:', err.message);
  process.exit(1);
});
