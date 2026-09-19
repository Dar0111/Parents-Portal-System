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

// login, GET /me, and PUT /contact all come from fetchUserByLoginId. A
// parent's login_id IS the child's LRN, so s.lrn is not selected — the key
// must be absent, not null. The four JOIN columns are the regression
// guard: trimming one too many blanks Parent → Settings with every other
// assert still green.
function assertParentCredentialShape(user, label) {
  assert(
    user != null &&
      user.login_id === '13567454' &&
      !Object.hasOwn(user, 'lrn') &&
      user.student_first_name === 'Marwin' &&
      user.student_last_name === 'Conde' &&
      Number(user.grade_level) === 6 &&
      user.section === 'Malikhain',
    label,
    `keys=${JSON.stringify(Object.keys(user || {}))} lrn=${JSON.stringify(user?.lrn)} first=${JSON.stringify(user?.student_first_name)} last=${JSON.stringify(user?.student_last_name)} grade=${JSON.stringify(user?.grade_level)} section=${JSON.stringify(user?.section)}`
  );
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
  // 12 digits, the LRN rule since 2026-09-18. These students are inserted by
  // SQL (the rule runs on POST /students only), but the fixtures should look
  // like real LRNs anyway.
  const pendingLrn = String(runId).slice(-12);
  const rejectLrn = String(runId + 1).slice(-12);

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
    assert(
      !Object.hasOwn(teacherLogin.data?.user || {}, 'lrn'),
      'Teacher login has no lrn key'
    );
    const teacherToken = teacherLogin.data?.token;

    const parentActive = await login('13567454', 'Parent@2026');
    assert(
      parentActive.status === 200 && parentActive.data?.user?.role === 'parent',
      'Active parent login (Marwin LRN)'
    );
    assertParentCredentialShape(parentActive.data?.user, 'Parent login carries login_id, JOIN fields, and no lrn');
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
    assertParentCredentialShape(me.data?.user, 'GET /me carries login_id, JOIN fields, and no lrn');

    const noAuth = await request('GET', '/api/auth/me');
    assert(noAuth.status === 401, 'Unauthenticated /me rejected');

    try {
      // 403, not 401: the session is valid, and a 401 made the client log a
      // teacher or parent out on a typo before the message could show.
      const wrongCurrent = await request('PUT', '/api/auth/change-password', {
        token: parentToken,
        body: { current_password: 'NotTheRightOne@1', new_password: 'Parent@2026New' },
      });
      assert(
        wrongCurrent.status === 403 && /Current password is incorrect/.test(wrongCurrent.data?.message || ''),
        'Wrong current password is 403 naming it, not 401 — the session is still valid'
      );
      assert(
        wrongCurrent.data?.field === 'current_password',
        'Wrong current password names field "current_password" so the client can put it under the input'
      );

      // Password rule on new_password (utils/passwordRule.js): at least 8
      // characters AND at least one number; field "new_password"; same
      // message as POST /teachers and POST /parents. The current password is
      // correct here, so the rule is the only thing refusing.
      const ruleShort = await request('PUT', '/api/auth/change-password', {
        token: parentToken,
        body: { current_password: 'Parent@2026', new_password: 'abc1234' },
      });
      assert(
        ruleShort.status === 400 &&
          ruleShort.data?.field === 'new_password' &&
          /at least 8 characters and include at least one number/.test(ruleShort.data?.message || ''),
        'change-password: 7 chars with a digit is 400, field "new_password", the rule message'
      );
      const ruleNoDigit = await request('PUT', '/api/auth/change-password', {
        token: parentToken,
        body: { current_password: 'Parent@2026', new_password: 'abcdefgh' },
      });
      assert(
        ruleNoDigit.status === 400 && ruleNoDigit.data?.field === 'new_password',
        'change-password: 8 letters with no digit is 400, field "new_password"'
      );
      const stillOld = await login('13567454', 'Parent@2026');
      assert(stillOld.status === 200, 'A refused new password leaves the old one in place');

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

    // The rule runs only where a password is SET. Login compares against the
    // stored hash and nothing else, so an account whose password predates the
    // rule — or, as here, the seeded one — keeps logging in.
    const seededStillWorks = await login('13567454', 'Parent@2026');
    assert(seededStillWorks.status === 200, 'Seeded password still logs in — the rule never runs at login');

    // A1 (2026-09-19): changing a password now BUMPS users.token_version and
    // revokes every token minted before it, so `parentToken` — captured at the
    // top of this run and used to change the password above — is dead from
    // here on. The contact section below needs the token from the login that
    // just succeeded. Falls back to the old one so this file still runs on a
    // build without A1.
    const parentTokenNow = seededStillWorks.data?.token || parentToken;

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
      token: parentTokenNow,
      body: { contact_number: '09171111111', name: 'Hacker', lrn: '000', role: 'admin' },
    });
    assert(
      forbiddenContact.status === 400 && String(forbiddenContact.data?.message || '').includes('name'),
      'Forbidden identity fields rejected'
    );

    const missingContact = await request('PUT', '/api/auth/contact', {
      token: parentTokenNow,
      body: {},
    });
    assert(missingContact.status === 400, 'Missing contact_number rejected');

    const emptyContact = await request('PUT', '/api/auth/contact', {
      token: parentTokenNow,
      body: { contact_number: '   ' },
    });
    assert(emptyContact.status === 400, 'Blank contact_number rejected');

    const tooLongContact = await request('PUT', '/api/auth/contact', {
      token: parentTokenNow,
      body: { contact_number: '1'.repeat(21) },
    });
    assert(tooLongContact.status === 400, 'Contact number over 20 characters rejected');

    try {
      const updatedContact = await request('PUT', '/api/auth/contact', {
        token: parentTokenNow,
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
      assert(
        !Object.hasOwn(updatedContact.data?.user || {}, 'lrn'),
        'Contact update user has no lrn key'
      );

      const meAfterContact = await request('GET', '/api/auth/me', { token: parentTokenNow });
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

    const restoredContact = await request('GET', '/api/auth/me', { token: parentTokenNow });
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

    // --- Password rule on POST /teachers (utils/passwordRule.js): at least 8
    // characters AND at least one number. Each refusal names field "password"
    // with the one shared message; the accepted case is a distinct login id
    // so it cannot collide with the row above, and is deleted in finally.
    const ruleTeacherId = `${newTeacherId}R`;
    const tooShort = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: ruleTeacherId, password: 'abc1234', name: 'Rule Teacher' },
    });
    assert(
      tooShort.status === 400 &&
        tooShort.data?.field === 'password' &&
        /at least 8 characters and include at least one number/.test(tooShort.data?.message || ''),
      'POST /teachers: 7 chars with a digit is 400, field "password", the rule message'
    );
    const noDigit = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: ruleTeacherId, password: 'abcdefgh', name: 'Rule Teacher' },
    });
    assert(
      noDigit.status === 400 && noDigit.data?.field === 'password',
      'POST /teachers: 8 letters with no digit is 400, field "password"'
    );
    const ruleOk = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: ruleTeacherId, password: 'abcdefg1', name: 'Rule Teacher' },
    });
    assert(ruleOk.status === 201, 'POST /teachers: 8 chars with a digit is accepted (201)');
    if (ruleOk.status === 201) createdLoginIds.push(ruleTeacherId);

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
    // B1 (2026-09-19): an unknown LRN is the SAME 403 as an out-of-scope
    // student — never a 404 that would tell a teacher whether an LRN exists.
    assert(
      createParent.status === 403 && /assigned to this student's class, or the adviser/.test(createParent.data?.message || ''),
      'POST /parents: an unknown LRN is 403 naming the scope rule, not 404'
    );
    const unknownLrnResponse = `${createParent.status} ${JSON.stringify(createParent.data)}`;

    // Grade 6 - Malikhain: TCH-001 (teacherToken) is assigned there, which
    // POST /users/parents requires since 2026-09-18 (assigned OR adviser of
    // the student's section). Was Grade 4 - Bonifacio, where TCH-001 is neither.
    await insertTestStudent(pendingLrn, 'Test', 'Student', 6, 'Malikhain');
    createdLrns.push(pendingLrn);

    // --- Password rule on POST /parents: same rule, same message, field
    // "password". Checked before the student lookup. The accepted case is
    // createParent2 below (its password already satisfies the rule).
    const parentTooShort = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: pendingLrn, password: 'abc1234', name: 'Rule Guardian' },
    });
    assert(
      parentTooShort.status === 400 &&
        parentTooShort.data?.field === 'password' &&
        /at least 8 characters and include at least one number/.test(parentTooShort.data?.message || ''),
      'POST /parents: 7 chars with a digit is 400, field "password", the rule message'
    );
    const parentNoDigit = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: pendingLrn, password: 'abcdefgh', name: 'Rule Guardian' },
    });
    assert(
      parentNoDigit.status === 400 && parentNoDigit.data?.field === 'password',
      'POST /parents: 8 letters with no digit is 400, field "password"'
    );
    const nothingCreated = await login(pendingLrn, 'abc1234');
    assert(nothingCreated.status === 401, 'POST /parents: a refused password creates no account');

    // --- Who may create a parent account (2026-09-18): a teacher assigned to
    // OR advising the student's section — the shared read-scope predicate.
    // A student in Grade 3 - Aguinaldo is outside both for TCH-001, so the
    // create is 403 naming the rule, and nothing is created. B1 (2026-09-19):
    // the LRN lookup and the scope check are ONE query that runs BEFORE the
    // two duplicate 409s, so an out-of-scope teacher learns neither whether
    // an LRN exists nor whether that child already has a parent account —
    // unknown LRN, out-of-scope LRN, and out-of-scope LRN of a child WITH a
    // parent are byte-identical responses.
    const outsideLrn = String(runId + 2).slice(-12);
    await insertTestStudent(outsideLrn, 'Outside', 'Student', 3, 'Aguinaldo');
    createdLrns.push(outsideLrn);
    const outsideCreate = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: outsideLrn, password: 'Parent@2026', name: 'Outside Guardian' },
    });
    assert(
      outsideCreate.status === 403 && /assigned to this student's class, or the adviser/.test(outsideCreate.data?.message || ''),
      'POST /parents: a teacher neither assigned to nor advising the student\'s section is 403 naming the rule'
    );
    assert(
      `${outsideCreate.status} ${JSON.stringify(outsideCreate.data)}` === unknownLrnResponse,
      'POST /parents: unknown LRN and out-of-scope LRN are byte-identical responses'
    );
    const outsideLogin = await login(outsideLrn, 'Parent@2026');
    assert(outsideLogin.status === 401, 'POST /parents: the refused out-of-scope create made no account');

    // The out-of-scope child now HAS a parent account (inserted by SQL, never
    // logged in as). The same teacher posting that LRN must still get the
    // scope 403 — never the 409 that would reveal the account exists.
    const [[outsideStudentRow]] = await withDb((conn) =>
      conn.query('SELECT id FROM students WHERE lrn = ? LIMIT 1', [outsideLrn])
    );
    createdLoginIds.push(outsideLrn);
    await withDb((conn) =>
      conn.query(
        `INSERT INTO users (login_id, password, role, status, name, student_id, created_by)
         VALUES (?, 'not-a-real-hash', 'parent', 'pending', 'Outside Guardian', ?, 2)`,
        [outsideLrn, outsideStudentRow?.id]
      )
    );
    const outsideWithParent = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: outsideLrn, password: 'Parent@2026', name: 'Outside Guardian 2' },
    });
    assert(
      `${outsideWithParent.status} ${JSON.stringify(outsideWithParent.data)}` === unknownLrnResponse,
      'POST /parents: out-of-scope LRN of a child WITH a parent is the same 403, never a 409'
    );

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

    // parent_account on GET /students/:id (2026-09-18): the linked case — a
    // pending account exists for this student, so the detail says so and the
    // client can stop offering "Create parent account".
    const pendingStudentId = createParent2.data?.user?.student_id;
    const detailWithParent = await request('GET', `/api/students/${pendingStudentId}`, { token: adminToken });
    assert(
      detailWithParent.status === 200 &&
        detailWithParent.data?.parent_account?.id === pendingParentId &&
        detailWithParent.data?.parent_account?.status === 'pending',
      'GET /students/:id carries parent_account { id, status: "pending" } once a parent exists'
    );

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
    await insertTestStudent(rejectLrn, 'Reject', 'Student', 6, 'Malikhain');
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
