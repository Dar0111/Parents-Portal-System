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
const { pairsFor, deleteNotificationsFor, countNotificationsFor } = require('./test-helpers/notifications');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally. The teacher this run uses for the parents gate skips the
// first-sign-in password change; the forced change itself is proved end to end
// below on fresh accounts (scripts/policyFixture.js, feat/privacy).
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

  // PostgreSQL since Phase 3 (commit F): the PG_* keys, the API's own role,
  // loopback only (test-helpers/db.js).
  const { withDb } = require('./test-helpers/db');

  // section_id is resolved the way POST /students stores it (pre-Stage-5
  // #4): the parents gate keys on sections.adviser_id through s.section_id,
  // so a fixture inserted with NULL there is a learner with no adviser and
  // no possible parent account — which is not what this fixture represents.
  async function insertTestStudent(lrn, firstName, lastName, grade, section) {
    await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, status, created_by)
         VALUES (?, ?, ?, ?, ?,
                 (SELECT id FROM sections WHERE name = ? AND grade_level = ? AND school_year = '2026-2027' LIMIT 1),
                 'active', 2)
         ON CONFLICT (lrn) DO UPDATE SET first_name = EXCLUDED.first_name`,
        [lrn, firstName, lastName, grade, section, section, grade]
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
  // Creating a parent fans out `parent_pending` to every admin, keyed on the
  // new USER id (item_type 'user'), and deleting the user leaves those rows
  // behind — 2 per run, measured 2026-09-19 (pre-Stage-5 #3a). The login ids
  // above cannot address them; this holds the ids.
  const createdParentUserIds = [];

  async function cleanup() {
    const notificationPairs = pairsFor('user', createdParentUserIds);
    await withDb(async (conn) => {
      if (createdLoginIds.length) {
        await conn.query('DELETE FROM users WHERE login_id = ANY(?::text[])', [createdLoginIds]);
      }
      if (createdLrns.length) {
        await conn.query('DELETE FROM students WHERE lrn = ANY(?::text[])', [createdLrns]);
      }
      const deleted = await deleteNotificationsFor(conn, notificationPairs);
      const leftover = await countNotificationsFor(conn, notificationPairs);
      assert(
        leftover === 0,
        `every notification row THIS RUN fanned out is gone (${deleted} deleted over ${notificationPairs.length} parent accounts)`,
        `got ${leftover}`
      );
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
    await policy.accept(adminToken);

    const teacherLogin = await login('TCH-001', 'Teacher@2026');
    assert(teacherLogin.status === 200 && teacherLogin.data?.user?.role === 'teacher', 'Teacher login');
    assert(
      !Object.hasOwn(teacherLogin.data?.user || {}, 'lrn'),
      'Teacher login has no lrn key'
    );
    const teacherToken = teacherLogin.data?.token;
    await policy.accept(teacherToken);

    const parentActive = await login('13567454', 'Parent@2026');
    assert(
      parentActive.status === 200 && parentActive.data?.user?.role === 'parent',
      'Active parent login (Marwin LRN)'
    );
    assertParentCredentialShape(parentActive.data?.user, 'Parent login carries login_id, JOIN fields, and no lrn');
    const parentToken = parentActive.data?.token;
    // Consent and the contact step first (feat/first-signin): the consent gate
    // no longer lets PUT /auth/change-password through, and the password
    // checks below are about the password, not the gates.
    await policy.accept(parentToken);

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
        conn.query(`UPDATE users SET status = 'inactive' WHERE login_id = 'TCH-001'`)
      );
      const inactiveLogin = await login('TCH-001', 'Teacher@2026');
      assert(
        inactiveLogin.status === 403 && !inactiveLogin.data?.token,
        'Deactivated account cannot obtain a token'
      );
    } finally {
      await withDb((conn) =>
        conn.query(`UPDATE users SET status = 'active' WHERE login_id = 'TCH-001'`)
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
    await policy.accept(parentTokenNow);

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
          `UPDATE users SET contact_number = '09170000003' WHERE login_id = '13567454'`
        )
      );
    }

    const restoredContact = await request('GET', '/api/auth/me', { token: parentTokenNow });
    assert(
      restoredContact.data?.user?.contact_number === '09170000003',
      'Seeded parent contact restored'
    );

    // feat/account-create (2026-10-21): POST /users/teachers and /users/parents
    // take no email and no contact number (400 "no longer collected"), so a
    // fixture that needs one is created bare, then given the address or the
    // number through the admin's PUT /users/:id — the office's own path. The
    // returned shape is the POST's, with `data.user` re-read after the PUT; a
    // refused create (no 201) comes back untouched.
    const createWithContact = async (path, { token, adminToken: adminTok, body }) => {
      const { email, contact_number, ...rest } = body;
      const res = await request('POST', path, { token, body: rest });
      if (res.status !== 201 || (email === undefined && contact_number === undefined)) return res;
      const put = await request('PUT', `/api/users/${res.data.user.id}`, {
        token: adminTok,
        body: { email, contact_number },
      });
      if (put.status === 200 && put.data?.user) res.data.user = put.data.user;
      return res;
    };

    // --- Admin creates teacher ---
    console.log('\nAccount creation:');

    const createTeacher = await createWithContact('/api/users/teachers', {
      token: adminToken,
      adminToken,
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
    if (createTeacher.status === 201) await clearForcedChange(createTeacher.data.user.id);

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
    const createParent = await createWithContact('/api/users/parents', {
      token: teacherToken,
      adminToken,
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
      createParent.status === 403 && /adviser of this student's section/.test(createParent.data?.message || ''),
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
      outsideCreate.status === 403 && /adviser of this student's section/.test(outsideCreate.data?.message || ''),
      "POST /parents: a teacher who is not the adviser of the student's section is 403 naming the rule"
    );
    assert(
      `${outsideCreate.status} ${JSON.stringify(outsideCreate.data)}` === unknownLrnResponse,
      'POST /parents: unknown LRN and out-of-scope LRN are byte-identical responses'
    );
    const outsideLogin = await login(outsideLrn, 'Parent@2026');
    assert(outsideLogin.status === 401, 'POST /parents: the refused out-of-scope create made no account');

    // --- The retired-field refusal (feat/account-create: no email and no
    // contact number on a create, 400 "no longer collected") runs BEFORE the
    // scope query, like the password rule did and the email rule before it:
    // an email on an OUT-OF-SCOPE LRN is the field's 400, not the scope 403,
    // so the refusal reveals nothing about the LRN.
    const outsideBadEmail = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: outsideLrn, password: 'Parent@2026', name: 'Outside Guardian', email: 'guardian@nowhere' },
    });
    assert(
      outsideBadEmail.status === 400 &&
        outsideBadEmail.data?.field === 'email' &&
        /no longer collected/.test(outsideBadEmail.data?.message || ''),
      'POST /parents: an email is 400 field "email" ("no longer collected") BEFORE the scope check (order proved on an out-of-scope LRN)'
    );

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

    const createParent2 = await createWithContact('/api/users/parents', {
      token: teacherToken,
      adminToken,
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
    assert(
      createParent2.data?.user?.email === 'guardian@test.com',
      `POST /parents: a valid email is stored as sent (got ${JSON.stringify(createParent2.data?.user?.email)})`
    );
    const pendingParentId = createParent2.data?.user?.id;
    if (createParent2.status === 201) {
      createdLoginIds.push(pendingLrn);
      createdParentUserIds.push(pendingParentId);
    }

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
    if (createForReject.status === 201) {
      createdLoginIds.push(rejectLrn);
      createdParentUserIds.push(rejectParentId);
    }

    const reject = await request('PUT', `/api/users/parents/${rejectParentId}/reject`, {
      token: adminToken,
      body: { reason: 'Invalid guardian documents' },
    });
    assert(reject.status === 200, 'Admin rejects parent');

    const rejectedLogin = await login(rejectLrn, 'Parent@2026');
    assert(rejectedLogin.status === 403 && rejectedLogin.data?.status === 'rejected', 'Rejected parent blocked');

    // --- The parents gate is the ADVISER only (pre-Stage-5 #4): a teacher
    // ASSIGNED to the learner's class but not its adviser is refused — the
    // case the 2026-09-18 widening had allowed. The minted teacher above
    // (active, no assignments) gets one Grade 6 - Malikhain assignment,
    // which TCH-001 advises; the learner already has a (rejected) parent
    // account, and B1 still holds: the scope 403 lands before the 409 and
    // is byte-identical to the unknown-LRN reply. The assignment goes with
    // the user in cleanup (fk_assignments_teacher cascades).
    const g6Subjects = await request('GET', '/api/subjects?grade_level=6', { token: adminToken });
    const teacherRow = await withDb((conn) => conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [newTeacherId]));
    const mintedTeacherId = teacherRow[0]?.[0]?.id;
    const assignMinted = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: mintedTeacherId, subject_id: g6Subjects.data?.subjects?.[0]?.id, grade_level: 6, section: 'Malikhain' },
    });
    const mintedLogin = await login(newTeacherId, 'Teacher@2026');
    await policy.accept(mintedLogin.data?.token);
    const assignedNotAdviser = await request('POST', '/api/users/parents', {
      token: mintedLogin.data?.token,
      body: { lrn: rejectLrn, password: 'Parent@2026', name: 'Assigned Guardian' },
    });
    assert(
      assignMinted.status === 201 &&
        mintedLogin.status === 200 &&
        assignedNotAdviser.status === 403 &&
        `${assignedNotAdviser.status} ${JSON.stringify(assignedNotAdviser.data)}` === unknownLrnResponse,
      `POST /parents: a teacher assigned to the class but not its adviser is the same 403 as an unknown LRN (assign ${assignMinted.status}, login ${mintedLogin.status}, create ${assignedNotAdviser.status})`
    );

    // --- The forced change, end to end (feat/privacy, 2026-10-10; the
    // owner's answer 4). A teacher the admin creates and a parent an adviser
    // creates must change the password someone else typed before anything
    // else, and a parent then meets the consent gate. Fresh accounts with
    // passwords made here at run time, so nothing above is reused.
    console.log('\nForced change on new accounts (privacy build):');
    const firstPw = `Fc${String(runId).slice(-6)}x1`;
    const ownPw = `Own${String(runId).slice(-6)}y2`;

    const fcTeacherLogin = `TFC${String(runId).slice(-8)}`;
    const fcCreate = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: fcTeacherLogin, password: firstPw, name: 'Forced Change Teacher' },
    });
    if (fcCreate.status === 201) createdLoginIds.push(fcTeacherLogin);
    // THE ORDER SINCE feat/first-signin (2026-10-18): consent, then a
    // confirmed Gmail or mobile number, then the new password through
    // PUT /auth/first-password. test:privacy walks each step through its own
    // endpoints; here the fixture's accept() does the first two (it confirms a
    // placeholder address on this fresh account) and the password is set here.
    const fcFirst = await login(fcTeacherLogin, firstPw);
    assert(
      fcCreate.status === 201 &&
        fcFirst.status === 200 &&
        fcFirst.data?.user?.must_change_password === 1 &&
        fcFirst.data?.user?.policy_pending === true &&
        fcFirst.data?.user?.contact_pending === true,
      'a teacher the admin creates signs in with policy_pending, contact_pending and must_change_password = 1'
    );
    const fcToken = fcFirst.data?.token;
    const fcBlocked = await request('GET', '/api/students', { token: fcToken });
    assert(
      fcBlocked.status === 403 && fcBlocked.data?.code === 'POLICY_ACCEPTANCE_REQUIRED',
      'consent comes first: any other endpoint is 403 POLICY_ACCEPTANCE_REQUIRED'
    );
    await policy.accept(fcToken);
    const fcPwGate = await request('GET', '/api/students', { token: fcToken });
    const fcChange = await request('PUT', '/api/auth/change-password', {
      token: fcToken,
      body: { current_password: firstPw, new_password: ownPw },
    });
    assert(
      fcPwGate.status === 403 &&
        fcPwGate.data?.code === 'MUST_CHANGE_PASSWORD' &&
        fcChange.status === 403 &&
        fcChange.data?.code === 'MUST_CHANGE_PASSWORD',
      'consent and the contact done: 403 MUST_CHANGE_PASSWORD, and PUT /auth/change-password is refused too'
    );
    const fcFirstPw = await request('PUT', '/api/auth/first-password', {
      token: fcToken,
      body: { new_password: ownPw },
    });
    const fcOpen = await request('GET', '/api/students', { token: fcFirstPw.data?.token });
    const fcMe = await request('GET', '/api/auth/me', { token: fcFirstPw.data?.token });
    assert(
      fcFirstPw.status === 200 &&
        fcFirstPw.data?.message === 'Password saved.' &&
        fcOpen.status === 200 &&
        fcMe.data?.user?.must_change_password === 0 &&
        fcMe.data?.user?.policy_pending === false &&
        fcMe.data?.user?.contact_pending === false,
      'PUT /auth/first-password: the replacement token opens the API, and every step reads done'
    );
    const fcOldToken = await request('GET', '/api/auth/me', { token: fcToken });
    assert(fcOldToken.status === 401, 'the sign-in token is revoked by the new password');

    const fcLrn = String(runId + 5).slice(-12);
    await insertTestStudent(fcLrn, 'Forced', 'Change', 6, 'Malikhain');
    createdLrns.push(fcLrn);
    const fcParent = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn: fcLrn, password: firstPw, name: 'Forced Change Guardian' },
    });
    const fcParentId = fcParent.data?.user?.id;
    const fcChildId = fcParent.data?.user?.student_id;
    if (fcParent.status === 201) {
      createdLoginIds.push(fcLrn);
      createdParentUserIds.push(fcParentId);
    }
    const fcApprove = await request('PUT', `/api/users/parents/${fcParentId}/approve`, { token: adminToken });
    const fcParentFirst = await login(fcLrn, firstPw);
    assert(
      fcParent.status === 201 &&
        fcApprove.status === 200 &&
        fcParentFirst.status === 200 &&
        fcParentFirst.data?.user?.must_change_password === 1 &&
        fcParentFirst.data?.user?.policy_pending === true &&
        fcParentFirst.data?.user?.contact_pending === true,
      'a parent an adviser creates signs in with policy_pending, contact_pending and must_change_password = 1'
    );
    const fcEarlyAccept = await request('POST', '/api/policy/accept', {
      token: fcParentFirst.data?.token,
      body: { versions: {}, on_behalf_of_child: true },
    });
    assert(
      fcEarlyAccept.status !== 403,
      'consent comes FIRST: /api/policy/accept is reached at once (an empty body is refused by the route, never by a gate)',
      `got ${fcEarlyAccept.status} ${fcEarlyAccept.data?.code || ''}`
    );
    const fcParentToken = fcParentFirst.data?.token;
    await policy.accept(fcParentToken);
    const fcGated = await request('GET', `/api/students/${fcChildId}`, { token: fcParentToken });
    assert(
      fcGated.status === 403 && fcGated.data?.code === 'MUST_CHANGE_PASSWORD',
      'consent and the contact done, the password is last: the child record is 403 MUST_CHANGE_PASSWORD'
    );
    const fcParentPw = await request('PUT', '/api/auth/first-password', {
      token: fcParentToken,
      body: { new_password: ownPw },
    });
    const fcChild = await request('GET', `/api/students/${fcChildId}`, { token: fcParentPw.data?.token });
    assert(
      fcParentPw.status === 200 && fcChild.status === 200 && fcChild.data?.student?.id === fcChildId,
      'after PUT /auth/first-password, the parent reads their child'
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
