/**
 * User Management API tests — list/view/edit/status endpoints on
 * routes/users.js. Admin-only enforcement, PUT forbidden-field rejection,
 * PATCH status guards (approval-flow-only transitions, self-deactivation,
 * last-active-admin protection).
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every row this script creates is timestamp-suffixed and
 * deleted in a finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:users
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

async function run() {
  console.log(`\nParents Portal — User Management API Tests (${BASE})\n`);

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

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  await policy.accept(teacherToken);
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  assert(parentLogin.status === 200 && parentToken, 'Parent login');

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

  const createdLoginIds = [];

  async function cleanup() {
    if (createdLoginIds.length) {
      await withDb((conn) => conn.query('DELETE FROM users WHERE login_id IN (?)', [createdLoginIds]));
    }
  }

  try {
    // --- Admin-only enforcement ---
    console.log('\nAdmin-only:');

    const teacherList = await request('GET', '/api/users', { token: teacherToken });
    assert(teacherList.status === 403, 'Teacher cannot GET /api/users');

    const parentList = await request('GET', '/api/users', { token: parentToken });
    assert(parentList.status === 403, 'Parent cannot GET /api/users');

    const teacherGetOne = await request('GET', `/api/users/${adminId}`, { token: teacherToken });
    assert(teacherGetOne.status === 403, 'Teacher cannot GET /api/users/:id');

    const teacherPut = await request('PUT', `/api/users/${adminId}`, { token: teacherToken, body: { name: 'x' } });
    assert(teacherPut.status === 403, 'Teacher cannot PUT /api/users/:id');

    const teacherPatch = await request('PATCH', `/api/users/${adminId}/status`, {
      token: teacherToken,
      body: { status: 'inactive' },
    });
    assert(teacherPatch.status === 403, 'Teacher cannot PATCH /api/users/:id/status');

    // --- List: filters ---
    console.log('\nList and filters:');

    const allUsers = await request('GET', '/api/users', { token: adminToken });
    const allLoginIds = (allUsers.data?.users || []).map((u) => u.login_id);
    assert(
      allUsers.status === 200 &&
        allLoginIds.includes('ADMIN001') &&
        allLoginIds.includes('TCH-001') &&
        allLoginIds.includes('13567454'),
      'Admin lists all users'
    );
    assert(
      (allUsers.data?.users || []).every((u) => !('password' in u)),
      'No response row exposes a password field'
    );

    const teacherOnly = await request('GET', '/api/users?role=teacher', { token: adminToken });
    assert(
      (teacherOnly.data?.users || []).every((u) => u.role === 'teacher'),
      'role filter returns only that role'
    );

    const pendingOnly = await request('GET', '/api/users?status=pending', { token: adminToken });
    const pendingIds = (pendingOnly.data?.users || []).map((u) => u.login_id);
    assert(pendingIds.includes('1234567') && !pendingIds.includes('13567454'), 'status filter returns only that status');

    const searchByName = await request('GET', '/api/users?search=Maria', { token: adminToken });
    assert(
      (searchByName.data?.users || []).some((u) => u.login_id === 'TCH-001'),
      'search matches by name'
    );

    const searchByLoginId = await request('GET', '/api/users?search=13567454', { token: adminToken });
    assert(
      (searchByLoginId.data?.users || []).some((u) => u.login_id === '13567454'),
      'search matches by login_id'
    );

    const badRoleFilter = await request('GET', '/api/users?role=superadmin', { token: adminToken });
    assert(badRoleFilter.status === 400, 'Invalid role filter rejected');

    // --- Single-user reads ---
    console.log('\nSingle-user reads:');

    const getOne = await request('GET', `/api/users/${adminId}`, { token: adminToken });
    assert(getOne.status === 200 && getOne.data?.user?.login_id === 'ADMIN001', 'GET /api/users/:id');

    const getUnknown = await request('GET', '/api/users/999999999', { token: adminToken });
    assert(getUnknown.status === 404, 'GET on a nonexistent id returns 404');

    const getNonNumeric = await request('GET', '/api/users/abc', { token: adminToken });
    assert(getNonNumeric.status === 400, 'GET /api/users/abc returns 400, not 500');

    // --- Set up a throwaway teacher for PUT/PATCH tests ---
    const runId = String(Date.now()).slice(-8);
    const throwawayLoginId = `TCH-UM${runId}`;
    createdLoginIds.push(throwawayLoginId);

    // --- Password rule on POST /teachers (utils/passwordRule.js): at least 8
    // characters AND at least one number; refusals name field "password"
    // with the shared message and create nothing. The accepted case is the
    // throwaway below (its fixture password already satisfies the rule; the
    // exactly-8-with-a-digit acceptance is asserted in test-auth-flows.js).
    const ruleShort = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'abc1234', name: 'Throwaway Teacher' },
    });
    assert(
      ruleShort.status === 400 &&
        ruleShort.data?.field === 'password' &&
        /at least 8 characters and include at least one number/.test(ruleShort.data?.message || ''),
      'POST /teachers: 7 chars with a digit is 400, field "password", the rule message'
    );
    const ruleNoDigit = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'abcdefgh', name: 'Throwaway Teacher' },
    });
    assert(
      ruleNoDigit.status === 400 && ruleNoDigit.data?.field === 'password',
      'POST /teachers: 8 letters with no digit is 400, field "password"'
    );
    const refusedLogin = await login(throwawayLoginId, 'abc1234');
    assert(refusedLogin.status === 401, 'POST /teachers: a refused password creates no account');

    // --- Email rule on POST /teachers (utils/emailRule.js, pre-Stage-5 #4):
    // optional; if given, one @, no whitespace, a dotted domain, ASCII only;
    // a refusal names field "email" and creates nothing.
    const emailSpace = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'Teacher@2026', name: 'Throwaway Teacher', email: 'not an email' },
    });
    assert(
      emailSpace.status === 400 && emailSpace.data?.field === 'email' && /name@example\.com/.test(emailSpace.data?.message || ''),
      'POST /teachers: "not an email" is 400, field "email", the rule message'
    );
    const emailNoDot = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'Teacher@2026', name: 'Throwaway Teacher', email: 'user@localhost' },
    });
    assert(
      emailNoDot.status === 400 && emailNoDot.data?.field === 'email',
      'POST /teachers: a domain with no dot (user@localhost) is 400, field "email" — not routable from here'
    );

    const createThrowaway = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'Teacher@2026', name: 'Throwaway Teacher' },
    });
    assert(createThrowaway.status === 201, 'Created throwaway teacher for edit/status tests');
    const throwawayId = createThrowaway.data?.user?.id;
    if (throwawayId) await clearForcedChange(throwawayId);

    // --- PUT: forbidden fields, validation, happy path ---
    console.log('\nPUT (edit):');

    const putForbiddenRole = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { name: 'x', role: 'admin' },
    });
    assert(
      putForbiddenRole.status === 400 && /role/.test(putForbiddenRole.data?.message || ''),
      'PUT with role in the body rejected, naming it'
    );

    const putForbiddenStatus = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      putForbiddenStatus.status === 400 && /status/.test(putForbiddenStatus.data?.message || ''),
      'PUT with status in the body rejected, naming it'
    );

    const putForbiddenPassword = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { password: 'NewPass@2026' },
    });
    assert(
      putForbiddenPassword.status === 400 && /password/.test(putForbiddenPassword.data?.message || ''),
      'PUT with password in the body rejected, naming it'
    );

    const putValid = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { name: 'Renamed Teacher', email: 'renamed@chfes.edu.ph', contact_number: '09171112222' },
    });
    assert(
      putValid.status === 200 &&
        putValid.data?.user?.name === 'Renamed Teacher' &&
        putValid.data?.user?.email === 'renamed@chfes.edu.ph',
      'PUT with name/email/contact_number succeeds'
    );

    const putBlankName = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { name: '   ' },
    });
    assert(putBlankName.status === 400, 'PUT with a blank name rejected');

    // --- Email rule on PUT (pre-Stage-5 #4): a bad address is 400 naming the
    // field and changes nothing; an empty string clears it (stored NULL).
    const putBadEmail = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { email: 'renamed@@chfes.edu.ph' },
    });
    assert(putBadEmail.status === 400 && putBadEmail.data?.field === 'email', 'PUT with two @ is 400, field "email"');
    const putClearEmail = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { email: '' },
    });
    assert(
      putClearEmail.status === 200 && putClearEmail.data?.user?.email === null,
      `PUT with email "" clears the address to NULL (got ${JSON.stringify(putClearEmail.data?.user?.email)})`
    );

    // --- Contact-number rule (utils/contactRule.js, 2026-09-18): optional;
    // if given, 11 digits starting with 09 after spaces/dashes are stripped,
    // stored digits-only; a refusal names field "contact_number".
    const putBadContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: 'Test' },
    });
    assert(
      putBadContact.status === 400 && putBadContact.data?.field === 'contact_number',
      'PUT /users/:id: contact "Test" is 400, field "contact_number"'
    );
    const putSpacedContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: '0917 111 2233' },
    });
    assert(
      putSpacedContact.status === 200 && putSpacedContact.data?.user?.contact_number === '09171112233',
      'PUT /users/:id: "0917 111 2233" is accepted and stored as 09171112233'
    );

    // --- feat/sms-transport (2026-09-29): the two international forms are
    // accepted and folded onto the one stored form; a change of number
    // unconfirms it and burns the codes sent to the old one; and (Q4) the same
    // for an email change. Codes are planted in the DB directly — this suite
    // runs against a normal server and must never send a real mail or text.
    const { hashPassword } = require('../utils/password');
    const putPlusContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: '+63 917 111 2233' },
    });
    assert(
      putPlusContact.status === 200 && putPlusContact.data?.user?.contact_number === '09171112233',
      'PUT /users/:id: "+63 917 111 2233" is stored as 09171112233'
    );
    const plant = async (purpose, email, contact) => {
      const hash = await hashPassword('246810');
      await withDb((conn) =>
        conn.query(
          `INSERT INTO auth_codes (user_id, purpose, code_hash, email_snapshot, contact_snapshot, expires_at)
           VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL 10 MINUTE)`,
          [throwawayId, purpose, hash, email, contact]
        )
      );
    };
    const liveCodes = async (purpose) => {
      const [[row]] = await withDb((conn) =>
        conn.query('SELECT COUNT(*) AS n FROM auth_codes WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [throwawayId, purpose])
      );
      return Number(row.n);
    };

    await withDb((conn) => conn.query('UPDATE users SET contact_verified_at = NOW() WHERE id = ?', [throwawayId]));
    await plant('contact_verification', null, '09171112233');
    const putSameContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: '639171112233' },
    });
    assert(
      putSameContact.status === 200 && Boolean(putSameContact.data?.user?.contact_verified_at) && (await liveCodes('contact_verification')) === 1,
      'PUT /users/:id: the same number re-typed as 639… is not a change — still confirmed, the pending code survives'
    );
    const putNewContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: '09171112244' },
    });
    assert(
      putNewContact.status === 200 && putNewContact.data?.user?.contact_verified_at == null && (await liveCodes('contact_verification')) === 0,
      'PUT /users/:id: a NEW number clears contact_verified_at and burns the pending text code'
    );

    const putOldEmail = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { email: 'um.old@example.test' },
    });
    await plant('email_verification', 'um.old@example.test', null);
    const putNewEmail = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { email: 'um.new@example.test' },
    });
    assert(
      putOldEmail.status === 200 && putNewEmail.status === 200 && (await liveCodes('email_verification')) === 0,
      'Q4: an admin email change burns the code already mailed to the OLD address'
    );
    const staleLogin = await login(throwawayLoginId, 'Teacher@2026');
    await policy.accept(staleLogin.data?.token);
    const staleConfirm = await request('POST', '/api/auth/verify-email/confirm', {
      token: staleLogin.data?.token,
      body: { code: '246810' },
    });
    const [[staleRow]] = await withDb((conn) => conn.query('SELECT email_verified_at FROM users WHERE id = ?', [throwawayId]));
    assert(
      staleConfirm.status === 400 && staleRow.email_verified_at == null,
      'Q4: that old code can no longer confirm the new address'
    );
    await withDb((conn) => conn.query('DELETE FROM auth_codes WHERE user_id = ?', [throwawayId]));

    const putClearContact = await request('PUT', `/api/users/${throwawayId}`, {
      token: adminToken,
      body: { contact_number: '' },
    });
    assert(
      putClearContact.status === 200 && putClearContact.data?.user?.contact_number === null,
      'PUT /users/:id: an empty contact_number clears it (optional field)'
    );
    const createBadContact = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: `${throwawayLoginId}C`, password: 'Teacher@2026', name: 'Bad Contact', contact_number: 'Test' },
    });
    assert(
      createBadContact.status === 400 && createBadContact.data?.field === 'contact_number',
      'POST /teachers: contact "Test" is 400, field "contact_number", nothing created'
    );
    const badContactLogin = await login(`${throwawayLoginId}C`, 'Teacher@2026');
    assert(badContactLogin.status === 401, 'POST /teachers: the refused contact created no account');

    const putUnknownId = await request('PUT', '/api/users/999999999', { token: adminToken, body: { name: 'x' } });
    assert(putUnknownId.status === 404, 'PUT on a nonexistent id returns 404');

    const putNonNumeric = await request('PUT', '/api/users/abc', { token: adminToken, body: { name: 'x' } });
    assert(putNonNumeric.status === 400, 'PUT /api/users/abc returns 400, not 500');

    // --- PATCH status: target-value and current-state guards ---
    console.log('\nPATCH status (approval-flow guard):');

    const patchBadTarget = await request('PATCH', `/api/users/${throwawayId}/status`, {
      token: adminToken,
      body: { status: 'pending' },
    });
    assert(patchBadTarget.status === 400, "PATCH status target 'pending' rejected");

    const patchBadTarget2 = await request('PATCH', `/api/users/${throwawayId}/status`, {
      token: adminToken,
      body: { status: 'rejected' },
    });
    assert(patchBadTarget2.status === 400, "PATCH status target 'rejected' rejected");

    const pendingParent = (pendingOnly.data?.users || []).find((u) => u.login_id === '1234567');
    const patchPendingAccount = await request('PATCH', `/api/users/${pendingParent.id}/status`, {
      token: adminToken,
      body: { status: 'active' },
    });
    assert(
      patchPendingAccount.status === 400 && /approve\/reject/i.test(patchPendingAccount.data?.message || ''),
      "PATCH status on a pending account rejected — must go through approve/reject"
    );

    // --- PATCH status: deactivation takes effect immediately ---
    console.log('\nPATCH status (deactivation):');

    const throwawayLoginBefore = await login(throwawayLoginId, 'Teacher@2026');
    const throwawayTokenBefore = throwawayLoginBefore.data?.token;
    await policy.accept(throwawayTokenBefore);
    assert(throwawayLoginBefore.status === 200 && throwawayTokenBefore, 'Throwaway teacher can log in while active');

    const deactivate = await request('PATCH', `/api/users/${throwawayId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      deactivate.status === 200 && deactivate.data?.user?.status === 'inactive',
      'Admin deactivates the throwaway teacher'
    );

    const staleTokenRejected = await request('GET', '/api/auth/me', { token: throwawayTokenBefore });
    // 401 since 2026-09-18 (was 403): a token that no longer identifies a
    // usable session is an authentication failure, and the client logs out
    // on 401. Login below keeps its 403 — credentials valid, account unusable.
    assert(
      staleTokenRejected.status === 401 && /not active/.test(staleTokenRejected.data?.message || ''),
      "Deactivated user's already-issued token is rejected on its very next request — 401 \"Account is not active.\""
    );

    const loginAfterDeactivate = await login(throwawayLoginId, 'Teacher@2026');
    assert(loginAfterDeactivate.status === 403, 'Deactivated user cannot log in fresh either');

    const reactivate = await request('PATCH', `/api/users/${throwawayId}/status`, {
      token: adminToken,
      body: { status: 'active' },
    });
    assert(
      reactivate.status === 200 && reactivate.data?.user?.status === 'active',
      'Admin reactivates the throwaway teacher'
    );

    const loginAfterReactivate = await login(throwawayLoginId, 'Teacher@2026');
    assert(loginAfterReactivate.status === 200, 'Reactivated user can log in again');

    // --- PATCH status: self-deactivation blocked ---
    console.log('\nPATCH status (self and last-admin protection):');

    const selfDeactivate = await request('PATCH', `/api/users/${adminId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      selfDeactivate.status === 400 && /own account/i.test(selfDeactivate.data?.message || ''),
      'Admin cannot deactivate their own account'
    );

    // Last-active-admin guard: reachable branch only. With 2 active admins,
    // deactivating one is allowed (count was 2 before the action). See the
    // note below on why the *blocked* branch can't be triggered by any real
    // HTTP request given the self-check above.
    const throwawayAdminLoginId = `ADMIN-UM${runId}`;
    createdLoginIds.push(throwawayAdminLoginId);
    await withDb((conn) =>
      conn.query(
        `INSERT INTO users (login_id, password, role, status, name, created_by) VALUES (?, 'not-a-real-hash', 'admin', 'active', 'Throwaway Admin', ?)`,
        [throwawayAdminLoginId, adminId]
      )
    );
    const [throwawayAdminRows] = await withDb((conn) =>
      conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [throwawayAdminLoginId])
    );
    const throwawayAdminId = throwawayAdminRows[0].id;

    const deactivateOtherAdmin = await request('PATCH', `/api/users/${throwawayAdminId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      deactivateOtherAdmin.status === 200,
      'Deactivating one admin while 2+ are active is allowed (count check does not false-positive)'
    );

    // The blocked branch (count <= 1) is only reachable when actor === target,
    // because authorize('admin') + authenticate's live status re-check mean
    // any *other* admin performing this action is themselves necessarily
    // active — so they always count toward the total alongside the target,
    // keeping count >= 2 whenever a non-self actor targets a currently-active
    // admin. That case is caught by the unconditional self-deactivation check
    // above before the count query ever runs. Verifying the count-check's
    // *blocked* branch end-to-end would require either bypassing the
    // self-check (not real usage) or a second concurrently-active admin
    // deactivating themselves through someone else's identity, which isn't
    // possible. This is a source check instead — same reasoning as the
    // current_quarter ENUM check in test-settings-flows.js — confirming the
    // guard exists and is wired to the right condition and message, not
    // claiming to have triggered it over HTTP.
    const fs = require('fs');
    const path = require('path');
    const usersSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'users.js'), 'utf8');
    assert(
      /role\s*=\s*'admin'\s*AND\s*status\s*=\s*'active'/i.test(usersSource) &&
        /count\s*<=\s*1/.test(usersSource) &&
        /last active admin/i.test(usersSource),
      'Last-active-admin guard is implemented as an independent check (count query, threshold, named message) — see comment above for why HTTP alone can\'t trigger its blocked branch'
    );
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

    await checkPage('/api/users', adminToken, 'users', { sort: 'name', field: 'name' });

    // o3 (pre-Stage-5 #2): `role` and `status` are ENUMs and sorted by their
    // ORDINAL until now — parent, teacher, admin — while the column header
    // said A–Z. No case here sorted on either key, so the wrong order passed
    // for a week. Asserted as an invariant over the page, string-compared.
    for (const key of ['role', 'status']) {
      const asc = await request('GET', `/api/users?sort=${key}&order=asc&limit=200`, { token: adminToken });
      const values = (asc.data?.users || []).map((u) => String(u[key]));
      assert(
        asc.status === 200 && values.every((v, i) => i === 0 || values[i - 1].localeCompare(v) <= 0),
        `sort=${key}&order=asc is alphabetical, not ENUM order (got ${JSON.stringify([...new Set(values)])})`
      );
    }
    const roleAsc = await request('GET', '/api/users?sort=role&order=asc&limit=200', { token: adminToken });
    const roles = [...new Set((roleAsc.data?.users || []).map((u) => u.role))];
    assert(
      roles.length >= 2 && roles.indexOf('admin') < roles.indexOf('parent'),
      `admin sorts before parent — which ENUM order (parent, teacher, admin) never did (got ${JSON.stringify(roles)})`
    );
    await checkPage('/api/users/parents/pending', adminToken, 'parents', { sort: 'created_at', field: 'created_at' });

    // C4: a filter narrows total to the filtered set.
    const teachersPage = await request('GET', '/api/users?role=teacher&limit=200', { token: adminToken });
    assert(
      teachersPage.status === 200 &&
        (teachersPage.data?.users || []).every((u) => u.role === 'teacher') &&
        (teachersPage.data?.page?.has_more || teachersPage.data?.page?.total === teachersPage.data?.users?.length),
      'GET /users?role=teacher: every row matches and total is the filtered count'
    );
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
