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
  const adminId = adminLogin.data?.user?.id;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
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

    const createThrowaway = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: throwawayLoginId, password: 'Teacher@2026', name: 'Throwaway Teacher' },
    });
    assert(createThrowaway.status === 201, 'Created throwaway teacher for edit/status tests');
    const throwawayId = createThrowaway.data?.user?.id;

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
    assert(
      staleTokenRejected.status === 403,
      "Deactivated user's already-issued token is rejected on its very next request"
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
