/**
 * Student Records API tests — scoping, validation, lifecycle.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every student this script creates uses a timestamp-suffixed
 * LRN and is deleted in a finally block, so it passes on repeat runs with
 * no db:setup in between.
 *
 * Usage: npm run test:students
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
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

async function run() {
  console.log(`\nParents Portal — Student Records API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned to Grade 6 - Mabini only (Math/English/Filipino).
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Mabini)');

  // Marwin Conde (LRN 13567454) is seeded as Grade 6 - Mabini — inside TCH-001's scope.
  // Jea Mae Bargaso (LRN 1234567) is seeded as Grade 5 - Rizal — outside it.
  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), 'Resolve Marwin\'s student_id via /me');

  const adminList = await request('GET', '/api/students', { token: adminToken });
  const jea = adminList.data?.students?.find((s) => s.lrn === '1234567');
  const jeaId = jea?.id;
  assert(Number.isInteger(jeaId), 'Resolve Jea\'s student id (Grade 5 - Rizal, outside TCH-001 scope)');

  // Every student created below is tracked here and deleted in the finally
  // block, so a run leaves the DB exactly as it found it.
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
  const createdStudentIds = [];
  async function cleanup() {
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
  }

  try {
    // --- Create ---
    console.log('\nCreate:');

    const uniqueSuffix = String(Date.now()).slice(-6);
    const inScopeLrn = `6${uniqueSuffix}`;

    const inScopeBirthday = '2015-08-29';
    const createInScope = await request('POST', '/api/students', {
      token: teacherToken,
      body: {
        lrn: inScopeLrn,
        first_name: 'InScope',
        last_name: 'Student',
        grade_level: 6,
        section: 'Mabini',
        birthday: inScopeBirthday,
      },
    });
    assert(createInScope.status === 201, 'Teacher creates student inside own assignment (Grade 6 - Mabini)');
    const inScopeId = createInScope.data?.student?.id;
    if (createInScope.status === 201 && inScopeId) createdStudentIds.push(inScopeId);
    // Same class of regression as attendance.date/events.event_date/
    // contributions.due_date — a DATE column round-tripping through
    // mysql2 without dateStrings: ['DATE'] would come back shifted a
    // calendar day at UTC+8.
    assert(
      createInScope.data?.student?.birthday === inScopeBirthday,
      `birthday round-trips exactly as sent (sent ${inScopeBirthday}, got ${createInScope.data?.student?.birthday})`
    );

    const createOutOfScope = await request('POST', '/api/students', {
      token: teacherToken,
      body: {
        lrn: `3${uniqueSuffix}`,
        first_name: 'OutOfScope',
        last_name: 'Student',
        grade_level: 3,
        section: 'Aguinaldo',
      },
    });
    assert(
      createOutOfScope.status === 403,
      'Teacher creating student outside own assignment (Grade 3 - Aguinaldo) is rejected'
    );

    const createDuplicate = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: '13567454', // Marwin's LRN — already exists
        first_name: 'Dup',
        last_name: 'Student',
        grade_level: 6,
        section: 'Mabini',
      },
    });
    assert(createDuplicate.status === 409, 'Duplicate LRN rejected');

    const createBadGrade = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `9${uniqueSuffix}`,
        first_name: 'Bad',
        last_name: 'Grade',
        grade_level: 7,
        section: 'Test',
      },
    });
    assert(createBadGrade.status === 400, 'grade_level outside 1-6 rejected');

    const createByAdminAnywhere = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `5${uniqueSuffix}`,
        first_name: 'AdminCreated',
        last_name: 'Student',
        grade_level: 5,
        section: 'Rizal',
      },
    });
    assert(createByAdminAnywhere.status === 201, 'Admin creates student in any grade/section');
    const adminCreatedId = createByAdminAnywhere.data?.student?.id;
    if (createByAdminAnywhere.status === 201 && adminCreatedId) createdStudentIds.push(adminCreatedId);

    // --- Read: list + single, scoped ---
    console.log('\nRead (scoping):');

    const teacherList = await request('GET', '/api/students', { token: teacherToken });
    const teacherListIds = (teacherList.data?.students || []).map((s) => s.id);
    assert(teacherList.status === 200, 'Teacher can list students');
    assert(teacherListIds.includes(marwinId), 'Teacher list includes in-scope student (Marwin)');
    assert(!teacherListIds.includes(jeaId), 'Teacher list excludes out-of-scope student (Jea)');

    const teacherGetInScope = await request('GET', `/api/students/${marwinId}`, { token: teacherToken });
    assert(teacherGetInScope.status === 200, 'Teacher reads in-scope student by id');

    const teacherGetOutOfScope = await request('GET', `/api/students/${jeaId}`, { token: teacherToken });
    assert(teacherGetOutOfScope.status === 404, 'Teacher reading out-of-scope student returns 404');

    const nonNumericId = await request('GET', '/api/students/abc', { token: adminToken });
    assert(nonNumericId.status === 400, 'GET /api/students/abc returns 400, not 500');

    const negativeId = await request('GET', '/api/students/-1', { token: adminToken });
    assert(negativeId.status === 400, 'GET /api/students/-1 returns 400');

    const parentGetOwn = await request('GET', `/api/students/${marwinId}`, { token: parentToken });
    assert(parentGetOwn.status === 200, 'Parent reads own child');

    const parentGetOther = await request('GET', `/api/students/${jeaId}`, { token: parentToken });
    assert(parentGetOther.status === 404, 'Parent reading another student returns 404 (not 403)');

    const adminGetAny = await request('GET', `/api/students/${jeaId}`, { token: adminToken });
    assert(adminGetAny.status === 200, 'Admin reads any student');

    // --- Update ---
    console.log('\nUpdate:');

    const teacherUpdateInScope = await request('PUT', `/api/students/${inScopeId}`, {
      token: teacherToken,
      body: { contact_number: '09171234567' },
    });
    assert(teacherUpdateInScope.status === 200, 'Teacher updates in-scope student');
    // birthday omitted from the PUT body — falls back to existing.birthday,
    // already a plain string post-fix, so it must survive unchanged.
    assert(
      teacherUpdateInScope.data?.student?.birthday === inScopeBirthday,
      `birthday is unchanged after a PUT that omits it (still ${inScopeBirthday}, got ${teacherUpdateInScope.data?.student?.birthday})`
    );

    const teacherUpdateOutOfScope = await request('PUT', `/api/students/${jeaId}`, {
      token: teacherToken,
      body: { contact_number: '09170000000' },
    });
    assert(teacherUpdateOutOfScope.status === 404, 'Teacher updating out-of-scope student returns 404');

    const adminUpdateBadGrade = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { grade_level: 0 },
    });
    assert(adminUpdateBadGrade.status === 400, 'Update with invalid grade_level rejected');

    // --- Status (admin only, no hard delete) ---
    console.log('\nStatus:');

    const teacherStatusChange = await request('PATCH', `/api/students/${inScopeId}/status`, {
      token: teacherToken,
      body: { status: 'inactive' },
    });
    assert(teacherStatusChange.status === 403, 'Teacher cannot change student status');

    const adminStatusChange = await request('PATCH', `/api/students/${inScopeId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      adminStatusChange.status === 200 && adminStatusChange.data?.student?.status === 'inactive',
      'Admin deactivates student'
    );

    const listExcludesInactiveByDefault = await request('GET', '/api/students', { token: adminToken });
    const stillListed = (listExcludesInactiveByDefault.data?.students || []).some((s) => s.id === inScopeId);
    assert(!stillListed, 'Default list excludes inactive students');

    const listAllIncludesInactive = await request('GET', '/api/students?status=all', { token: adminToken });
    const nowListed = (listAllIncludesInactive.data?.students || []).some((s) => s.id === inScopeId);
    assert(nowListed, 'status=all includes inactive students');
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
