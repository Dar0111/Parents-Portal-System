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

  // TCH-001 (seeded) is BOTH assigned to Grade 6 - Malikhain (Math/English/
  // Filipino) AND its section adviser — so it satisfies either scoping rule and
  // cannot, on its own, distinguish them. That is what TCH-002 below is for.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Malikhain)');

  // TCH-002 is adviser of Grade 5 - Masigasig with ZERO teacher_assignments
  // rows. It is the only fixture in the system that can tell the two scoping
  // authorities apart: anything it can see, it can see ONLY as an adviser.
  // Do not give it assignment rows to make some future test more convenient —
  // that would delete the only account capable of failing these checks.
  const adviserLogin = await login('TCH-002', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  assert(adviserLogin.status === 200 && adviserToken, 'Adviser-only teacher login (TCH-002, Grade 5 - Masigasig)');

  // Marwin Conde (LRN 13567454) is seeded as Grade 6 - Malikhain — inside TCH-001's scope.
  // Jea Mae Bargaso (LRN 1234567) is seeded as Grade 5 - Masigasig — outside it,
  // but inside TCH-002's ADVISER scope.
  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), 'Resolve Marwin\'s student_id via /me');

  const adminList = await request('GET', '/api/students', { token: adminToken });
  const jea = adminList.data?.students?.find((s) => s.lrn === '1234567');
  const jeaId = jea?.id;
  assert(Number.isInteger(jeaId), 'Resolve Jea\'s student id (Grade 5 - Masigasig, outside TCH-001 scope)');

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
        section: 'Malikhain',
        birthday: inScopeBirthday,
      },
    });
    assert(createInScope.status === 201, 'Teacher creates student inside own assignment (Grade 6 - Malikhain)');
    const inScopeId = createInScope.data?.student?.id;
    if (createInScope.status === 201 && inScopeId) createdStudentIds.push(inScopeId);
    assert(
      createInScope.data?.student?.section_id != null,
      `in-scope Malikhain create stores non-null section_id (got ${createInScope.data?.student?.section_id})`
    );
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

    // Mabini is fictional. Duplicate-LRN must fire BEFORE section resolve,
    // or this is 400 "no section named Mabini" instead of 409.
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

    const createInventedSection = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `8${uniqueSuffix}`,
        first_name: 'Invented',
        last_name: 'Section',
        grade_level: 5,
        section: 'Rizal',
      },
    });
    assert(
      createInventedSection.status === 400,
      'Admin cannot invent a section name (Grade 5 - Rizal is fictional)'
    );
    assert(
      /Rizal/.test(createInventedSection.data?.message || ''),
      'That 400 names the unmatched section'
    );

    const createByAdminAnywhere = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `5${uniqueSuffix}`,
        first_name: 'AdminCreated',
        last_name: 'Student',
        grade_level: 5,
        section: 'Masigasig',
      },
    });
    assert(createByAdminAnywhere.status === 201, 'Admin creates student in any real grade/section');
    const adminCreatedId = createByAdminAnywhere.data?.student?.id;
    if (createByAdminAnywhere.status === 201 && adminCreatedId) createdStudentIds.push(adminCreatedId);
    assert(
      createByAdminAnywhere.data?.student?.section_id != null,
      `admin Masigasig create stores non-null section_id (got ${createByAdminAnywhere.data?.student?.section_id})`
    );

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

    // --- Read scope is WIDER than write scope (adviser leg) ---
    // A teacher sees a student via teacher_assignments OR via being the adviser
    // of that student's section. Before this, an adviser with no assignments
    // could record attendance (scoped on sections.adviser_id) for a student
    // this endpoint would not list — TCH-002 was exactly that account.
    console.log('\nRead (adviser scope):');

    const adviserList = await request('GET', '/api/students', { token: adviserToken });
    const adviserListIds = (adviserList.data?.students || []).map((s) => s.id);
    assert(adviserList.status === 200, 'Adviser-only teacher can list students');
    assert(
      adviserListIds.includes(jeaId),
      'Adviser-only teacher list INCLUDES the student in their advisory section (Jea)'
    );
    // The other half of the property: widening must not make everything visible.
    assert(
      !adviserListIds.includes(marwinId),
      'Adviser-only teacher list still EXCLUDES a student they neither teach nor advise (Marwin)'
    );

    const adviserGetOwnSection = await request('GET', `/api/students/${jeaId}`, { token: adviserToken });
    assert(adviserGetOwnSection.status === 200, 'Adviser-only teacher reads a student in their advisory section');

    const adviserGetOutside = await request('GET', `/api/students/${marwinId}`, { token: adviserToken });
    assert(adviserGetOutside.status === 404, 'Adviser-only teacher reading a student outside both scopes returns 404');

    // --- Update ---
    console.log('\nUpdate:');

    const teacherUpdateInScope = await request('PUT', `/api/students/${inScopeId}`, {
      token: teacherToken,
      body: { contact_number: '09171234567' },
    });
    assert(teacherUpdateInScope.status === 200, 'Teacher updates in-scope student');
    assert(
      teacherUpdateInScope.data?.student?.section_id === createInScope.data?.student?.section_id,
      'Contact-only PUT leaves a non-null section_id unchanged'
    );
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

    // Write scope did NOT move with the read widening. An adviser who can now
    // GET a student still cannot edit them — and the refusal is 403, not 404,
    // because a 404 would contradict the 200 that GET /:id just returned to the
    // same account. Same distinction routes/grades.js draws after Stage G3.
    const adviserUpdateOwnSection = await request('PUT', `/api/students/${jeaId}`, {
      token: adviserToken,
      body: { contact_number: '09170000000' },
    });
    assert(
      adviserUpdateOwnSection.status === 403,
      `Adviser-only teacher updating a student they can VIEW returns 403, not 404 (got ${adviserUpdateOwnSection.status})`
    );
    assert(
      /assigned to teach/i.test(adviserUpdateOwnSection.data?.message || ''),
      'That 403 names why editing is refused, not a bare "Access denied."'
    );

    // Outside BOTH scopes stays 404 — indistinguishable from a nonexistent id.
    const adviserUpdateOutside = await request('PUT', `/api/students/${marwinId}`, {
      token: adviserToken,
      body: { contact_number: '09170000000' },
    });
    assert(
      adviserUpdateOutside.status === 404,
      'Adviser-only teacher updating a student outside both scopes still returns 404'
    );

    const adminUpdateBadGrade = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { grade_level: 0 },
    });
    assert(adminUpdateBadGrade.status === 400, 'Update with invalid grade_level rejected');
    assert(
      /between 1 and 6/i.test(adminUpdateBadGrade.data?.message || ''),
      'grade_level: 0 is the range 400, not the class-change refusal'
    );

    // Must match CLASS_CHANGE_REFUSED in routes/students.js.
    const CLASS_CHANGE_REFUSED =
      "Changing a student's class is not supported. Nothing else in this request was saved; other fields can be updated without sending a different grade_level or section.";

    const inScopeSectionId = createInScope.data?.student?.section_id;
    const matchingClassPut = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { grade_level: 6, section: 'Malikhain', contact_number: '09179990001' },
    });
    assert(matchingClassPut.status === 200, 'Matching class PUT succeeds');
    assert(
      Number(matchingClassPut.data?.student?.grade_level) === 6 &&
        matchingClassPut.data?.student?.section === 'Malikhain',
      'Matching class PUT leaves grade_level and section unchanged'
    );
    assert(
      matchingClassPut.data?.student?.contact_number === '09179990001',
      'Matching class PUT still saves other fields'
    );
    assert(
      matchingClassPut.data?.student?.section_id === inScopeSectionId,
      'Matching class PUT does not overwrite a non-null section_id'
    );

    const beforeGradeChange = matchingClassPut.data?.student;
    const changeGradeLevel = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { grade_level: 5, contact_number: '09179990099' },
    });
    assert(changeGradeLevel.status === 400, 'Differing grade_level is 400, not applied');
    assert(
      changeGradeLevel.data?.message === CLASS_CHANGE_REFUSED,
      'Differing grade_level 400 names the refusal and that nothing else was saved'
    );
    const afterGradeChange = await request('GET', `/api/students/${inScopeId}`, { token: adminToken });
    assert(
      Number(afterGradeChange.data?.student?.grade_level) === 6 &&
        afterGradeChange.data?.student?.section === 'Malikhain' &&
        afterGradeChange.data?.student?.section_id === inScopeSectionId &&
        afterGradeChange.data?.student?.contact_number === beforeGradeChange?.contact_number,
      'Refused grade_level change leaves VARCHAR, section_id, and other fields untouched'
    );

    const changeSection = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { section: 'Masigasig', contact_number: '09179990099' },
    });
    assert(changeSection.status === 400, 'Differing section is 400, not applied');
    assert(
      changeSection.data?.message === CLASS_CHANGE_REFUSED,
      'Differing section 400 names the refusal and that nothing else was saved'
    );
    const afterSectionChange = await request('GET', `/api/students/${inScopeId}`, { token: adminToken });
    assert(
      Number(afterSectionChange.data?.student?.grade_level) === 6 &&
        afterSectionChange.data?.student?.section === 'Malikhain' &&
        afterSectionChange.data?.student?.section_id === inScopeSectionId &&
        afterSectionChange.data?.student?.contact_number === beforeGradeChange?.contact_number,
      'Refused section change leaves VARCHAR, section_id, and other fields untouched'
    );

    // NULL section_id cannot come from POST (refused since 2026-09-10). Direct
    // SQL only. Seed has zero such rows — these fixtures exist so resolve-on-NULL
    // is tested, not because the live database needed a repair.
    const malikhainSectionId = await withDb(async (conn) => {
      const [rows] = await conn.query(
        `SELECT sec.id FROM sections sec
         JOIN system_settings ss ON ss.setting_key = 'academic_year'
         WHERE sec.name = 'Malikhain' AND sec.grade_level = 6 AND sec.school_year = ss.setting_value
         LIMIT 1`
      );
      return rows[0]?.id ?? null;
    });
    assert(Number.isInteger(malikhainSectionId), 'Resolve Malikhain sections.id for the NULL-FK fixture');

    const nullSidId = await withDb(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by)
         VALUES (?, 'NullSid', 'Malikhain', 6, 'Malikhain', NULL, 1)`,
        [`TNUL${uniqueSuffix}`]
      );
      return result.insertId;
    });
    if (nullSidId) createdStudentIds.push(nullSidId);

    const resolveNull = await request('PUT', `/api/students/${nullSidId}`, {
      token: adminToken,
      body: { grade_level: 6, section: 'Malikhain' },
    });
    assert(resolveNull.status === 200, 'Matching PUT on a NULL section_id resolves and succeeds');
    assert(
      resolveNull.data?.student?.section_id === malikhainSectionId,
      `NULL section_id resolves to Malikhain sections.id (got ${resolveNull.data?.student?.section_id})`
    );

    const unmatchedNullId = await withDb(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by)
         VALUES (?, 'Unmatched', 'Mabini', 6, 'Mabini', NULL, 1)`,
        [`TMAB${uniqueSuffix}`]
      );
      return result.insertId;
    });
    if (unmatchedNullId) createdStudentIds.push(unmatchedNullId);

    const resolveMiss = await request('PUT', `/api/students/${unmatchedNullId}`, {
      token: adminToken,
      body: { grade_level: 6, section: 'Mabini', contact_number: '09178880001' },
    });
    assert(
      resolveMiss.status === 200,
      'Matching PUT whose VARCHAR matches no sections row still succeeds (does not 400 the rest of the form)'
    );
    assert(
      resolveMiss.data?.student?.contact_number === '09178880001',
      'Resolve miss still saves other fields'
    );
    assert(
      resolveMiss.data?.student?.section_id == null,
      `Resolve miss leaves section_id NULL (got ${resolveMiss.data?.student?.section_id})`
    );

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
