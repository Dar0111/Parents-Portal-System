/**
 * End-to-end auth & account lifecycle tests.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every row this script creates is timestamp-suffixed and
 * deleted in a finally block, so it passes on repeat runs with no
 * db:setup in between.
 *
 * Usage: npm run test:auth
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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
  const res = await request('POST', '/api/auth/login', {
    body: { login_id: loginId, password },
  });
  return res;
}

async function run() {
  console.log(`\nParents Portal — Auth Flow Tests (${BASE})\n`);

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

  async function insertTestStudent(lrn, firstName, lastName, grade, section) {
    await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'active', 2)
         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name)`,
        [lrn, firstName, lastName, grade, section]
      )
    );
  }

  // Unique per run so repeat runs never collide on login_id/lrn uniqueness —
  // and everything pushed into these two arrays gets deleted in the finally
  // block below, so a run leaves the DB exactly as it found it.
  const runId = Date.now();
  const newTeacherId = `TCH-${runId}`;
  const pendingLrn = String(runId).slice(-10);
  const rejectLrn = String(runId + 1).slice(-10);

  const createdLoginIds = [];
  const createdLrns = [];

  async function cleanup() {
    await withDb(async (conn) => {
      if (createdLoginIds.length) {
        await conn.query('DELETE FROM users WHERE login_id IN (?)', [createdLoginIds]);
      }
      if (createdLrns.length) {
        await conn.query('DELETE FROM students WHERE lrn IN (?)', [createdLrns]);
      }
    });
  }

  // Health check
  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  try {
    // --- Login flows ---
    console.log('\nLogin:');

    const badLogin = await login('ADMIN001', 'wrong-password');
    assert(badLogin.status === 401, 'Invalid password rejected');

    const adminLogin = await login('ADMIN001', 'Admin@2026');
    assert(adminLogin.status === 200 && adminLogin.data?.token, 'Admin login');
    const adminToken = adminLogin.data?.token;

    const teacherLogin = await login('TCH-001', 'Teacher@2026');
    assert(teacherLogin.status === 200 && teacherLogin.data?.user?.role === 'teacher', 'Teacher login');
    const teacherToken = teacherLogin.data?.token;

    const parentActive = await login('13567454', 'Parent@2026');
    assert(
      parentActive.status === 200 && parentActive.data?.user?.role === 'parent',
      'Active parent login (Marwin LRN)'
    );
    const parentToken = parentActive.data?.token;

    const parentPending = await login('1234567', 'Parent@2026');
    assert(parentPending.status === 403 && parentPending.data?.status === 'pending', 'Pending parent blocked');

    // Deactivated account (status = 'inactive', a real ENUM value now that
    // User Management's PATCH /api/users/:id/status exists) must not receive
    // a token. No ALTER TABLE here — 'inactive' is permanent schema now, not
    // a temporary widen-for-this-test hack. (It used to be; narrowing the
    // ENUM back down in this test's finally block would have silently
    // stripped 'inactive' out of the schema on every test:auth run.)
    try {
      await withDb((conn) =>
        conn.query(`UPDATE users SET status = 'inactive' WHERE login_id = 'TCH-001' LIMIT 1`)
      );
      const inactiveLogin = await login('TCH-001', 'Teacher@2026');
      assert(
        inactiveLogin.status === 403 && !inactiveLogin.data?.token,
        'Deactivated account cannot obtain a token'
      );
    } finally {
      await withDb((conn) =>
        conn.query(`UPDATE users SET status = 'active' WHERE login_id = 'TCH-001' LIMIT 1`)
      );
    }

    // --- Profile & password ---
    console.log('\nProfile & password:');

    const me = await request('GET', '/api/auth/me', { token: parentToken });
    assert(me.status === 200 && me.data?.user?.login_id === '13567454', 'GET /api/auth/me');

    const noAuth = await request('GET', '/api/auth/me');
    assert(noAuth.status === 401, 'Unauthenticated /me rejected');

    try {
      const changePw = await request('PUT', '/api/auth/change-password', {
        token: parentToken,
        body: { current_password: 'Parent@2026', new_password: 'Parent@2026New' },
      });
      assert(changePw.status === 200, 'Change password');

      const oldPw = await login('13567454', 'Parent@2026');
      assert(oldPw.status === 401, 'Old password no longer works');

      const newPw = await login('13567454', 'Parent@2026New');
      assert(newPw.status === 200, 'Login with new password');
    } finally {
      // Re-derive the token instead of reusing one from the try block, so this
      // still lands on the known password even if an assertion above threw
      // before that token was captured.
      const recovery = await login('13567454', 'Parent@2026New');
      if (recovery.data?.token) {
        await request('PUT', '/api/auth/change-password', {
          token: recovery.data.token,
          body: { current_password: 'Parent@2026New', new_password: 'Parent@2026' },
        });
      }
    }

    // --- Own contact number (parent Settings) ---
    // Seeded parent 13567454 is 09170000003. Restore via a direct UPDATE in
    // finally so a failed assertion cannot leave the demo account dirty.
    // Do not write on pending parent 1234567 (Jea) — test:auth itself
    // depends on that row staying pending; this block does not touch it.
    console.log('\nContact number:');

    const noAuthContact = await request('PUT', '/api/auth/contact', {
      body: { contact_number: '09171111111' },
    });
    assert(noAuthContact.status === 401, 'Unauthenticated contact update rejected');

    const forbiddenContact = await request('PUT', '/api/auth/contact', {
      token: parentToken,
      body: { contact_number: '09171111111', name: 'Hacker', lrn: '000', role: 'admin' },
    });
    assert(
      forbiddenContact.status === 400 && String(forbiddenContact.data?.message || '').includes('name'),
      'Forbidden identity fields rejected'
    );

    const missingContact = await request('PUT', '/api/auth/contact', {
      token: parentToken,
      body: {},
    });
    assert(missingContact.status === 400, 'Missing contact_number rejected');

    const emptyContact = await request('PUT', '/api/auth/contact', {
      token: parentToken,
      body: { contact_number: '   ' },
    });
    assert(emptyContact.status === 400, 'Blank contact_number rejected');

    const tooLongContact = await request('PUT', '/api/auth/contact', {
      token: parentToken,
      body: { contact_number: '1'.repeat(21) },
    });
    assert(tooLongContact.status === 400, 'Contact number over 20 characters rejected');

    try {
      const updatedContact = await request('PUT', '/api/auth/contact', {
        token: parentToken,
        body: { contact_number: '09171111111' },
      });
      assert(
        updatedContact.status === 200 && updatedContact.data?.user?.contact_number === '09171111111',
        'Parent updates own contact'
      );
      assert(
        !Object.keys(updatedContact.data?.user || {}).some((k) => k.toLowerCase().includes('password')),
        'Updated user has no password key'
      );
      assert(
        updatedContact.data?.user?.student_first_name === 'Marwin',
        'Contact update keeps student JOIN fields'
      );

      const meAfterContact = await request('GET', '/api/auth/me', { token: parentToken });
      assert(
        meAfterContact.data?.user?.contact_number === '09171111111',
        'GET /me reflects new contact'
      );
    } finally {
      await withDb((conn) =>
        conn.query(
          `UPDATE users SET contact_number = '09170000003' WHERE login_id = '13567454' LIMIT 1`
        )
      );
    }

    const restoredContact = await request('GET', '/api/auth/me', { token: parentToken });
    assert(
      restoredContact.data?.user?.contact_number === '09170000003',
      'Seeded parent contact restored'
    );

    // --- Admin creates teacher ---
    console.log('\nAccount creation:');

    const createTeacher = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: {
        login_id: newTeacherId,
        password: 'Teacher@2026',
        name: 'Test Teacher',
        email: 'test.teacher@chfes.edu.ph',
        contact_number: '09170000999',
      },
    });
    assert(createTeacher.status === 201 && createTeacher.data?.user?.status === 'active', 'Admin creates teacher (active)');
    if (createTeacher.status === 201) createdLoginIds.push(newTeacherId);

    const teacherCanCreate = await request('POST', '/api/users/teachers', {
      token: teacherToken,
      body: { login_id: 'TCH-FAIL', password: 'x', name: 'Fail' },
    });
    assert(teacherCanCreate.status === 403, 'Teacher cannot create teacher');

    const newTeacherLogin = await login(newTeacherId, 'Teacher@2026');
    assert(newTeacherLogin.status === 200, 'New teacher can login immediately');

    // --- Teacher creates parent (pending) ---
    const createParent = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: {
        lrn: pendingLrn,
        password: 'Parent@2026',
        name: 'Test Guardian',
        email: 'guardian@test.com',
        contact_number: '09170000888',
      },
    });
    assert(createParent.status === 404, 'Parent creation fails for unknown LRN');

    await insertTestStudent(pendingLrn, 'Test', 'Student', 4, 'Bonifacio');
    createdLrns.push(pendingLrn);

    const createParent2 = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: {
        lrn: pendingLrn,
        password: 'Parent@2026',
        name: 'Test Guardian',
        email: 'guardian@test.com',
      },
    });
    assert(
      createParent2.status === 201 && createParent2.data?.user?.status === 'pending',
      'Teacher creates parent (pending)'
    );
    const pendingParentId = createParent2.data?.user?.id;
    if (createParent2.status === 201) createdLoginIds.push(pendingLrn);

    const pendingLogin = await login(pendingLrn, 'Parent@2026');
    assert(pendingLogin.status === 403, 'New pending parent cannot login');

    // --- Admin approval flow ---
    console.log('\nAdmin approval:');

    const listPending = await request('GET', '/api/users/parents/pending', { token: adminToken });
    assert(
      listPending.status === 200 && listPending.data?.parents?.some((p) => p.login_id === pendingLrn),
      'Admin lists pending parents'
    );

    const teacherList = await request('GET', '/api/users/parents/pending', { token: teacherToken });
    assert(teacherList.status === 403, 'Teacher cannot list pending parents');

    const approveNonNumeric = await request('PUT', '/api/users/parents/abc/approve', { token: adminToken });
    assert(approveNonNumeric.status === 400, 'Approve with non-numeric id returns 400, not 500');

    const approve = await request('PUT', `/api/users/parents/${pendingParentId}/approve`, {
      token: adminToken,
    });
    assert(approve.status === 200 && approve.data?.user?.status === 'active', 'Admin approves parent');

    const approvedLogin = await login(pendingLrn, 'Parent@2026');
    assert(approvedLogin.status === 200, 'Approved parent can login');

    // --- Rejection flow (second temp student) ---
    await insertTestStudent(rejectLrn, 'Reject', 'Student', 3, 'Aguinaldo');
    createdLrns.push(rejectLrn);

    const createForReject = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: rejectLrn, password: 'Parent@2026', name: 'Reject Guardian' },
    });
    const rejectParentId = createForReject.data?.user?.id;
    if (createForReject.status === 201) createdLoginIds.push(rejectLrn);

    const reject = await request('PUT', `/api/users/parents/${rejectParentId}/reject`, {
      token: adminToken,
      body: { reason: 'Invalid guardian documents' },
    });
    assert(reject.status === 200, 'Admin rejects parent');

    const rejectedLogin = await login(rejectLrn, 'Parent@2026');
    assert(rejectedLogin.status === 403 && rejectedLogin.data?.status === 'rejected', 'Rejected parent blocked');
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
