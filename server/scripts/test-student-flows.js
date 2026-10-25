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

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally. A teacher this run creates skips the first-sign-in
// password change (scripts/policyFixture.js, feat/privacy).
const { createPolicyFixture, clearForcedChange } = require('./policyFixture');
const policy = createPolicyFixture();

// The four learner fields the portal no longer collects (the privacy build,
// decision 6), each with a value the old rules accepted.
const RETIRED_VALUES = [
  ['birthday', '2015-08-29'],
  ['gender', 'female'],
  ['address', 'Pateros, Metro Manila'],
  ['contact_number', '09171234567'],
];

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
  await policy.accept(adminToken);
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is BOTH assigned to Grade 6 - Malikhain (Math/English/
  // Filipino) AND its section adviser — so it satisfies either scoping rule and
  // cannot, on its own, distinguish them. That is what TCH-002 below is for.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  await policy.accept(teacherToken);
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Malikhain)');

  // TCH-002 is adviser of Grade 5 - Masigasig with ZERO teacher_assignments
  // rows. It is the only fixture in the system that can tell the two scoping
  // authorities apart: anything it can see, it can see ONLY as an adviser.
  // Do not give it assignment rows to make some future test more convenient —
  // that would delete the only account capable of failing these checks.
  const adviserLogin = await login('TCH-002', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  await policy.accept(adviserToken);
  assert(adviserLogin.status === 200 && adviserToken, 'Adviser-only teacher login (TCH-002, Grade 5 - Masigasig)');

  // Marwin Conde (LRN 13567454) is seeded as Grade 6 - Malikhain — inside TCH-001's scope.
  // Jea Mae Bargaso (LRN 1234567) is seeded as Grade 5 - Masigasig — outside it,
  // but inside TCH-002's ADVISER scope.
  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
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
  // The suites' PostgreSQL connection (Phase 3): the API's own role, loopback only.
  const { withDb } = require('./test-helpers/db');
  const createdStudentIds = [];
  // Teachers this run mints for the enrolment gate; their assignment rows
  // cascade away with the user (fk_assignments_teacher).
  const createdTeacherIds = [];
  async function cleanup() {
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ANY(?::int[])', [createdStudentIds]));
    }
    if (createdTeacherIds.length) {
      await withDb((conn) => conn.query('DELETE FROM users WHERE id = ANY(?::int[])', [createdTeacherIds]));
    }
  }

  try {
    // --- Create ---
    console.log('\nCreate:');

    // 11 digits + a one-digit prefix = a 12-digit LRN, the rule POST /students
    // enforces since 2026-09-18 (utils/lrnRule.js). Seeded rows keep their
    // shorter LRNs; only creates are checked.
    const uniqueSuffix = String(Date.now()).slice(-11);
    const inScopeLrn = `6${uniqueSuffix}`;

    const createInScope = await request('POST', '/api/students', {
      token: teacherToken,
      body: {
        lrn: inScopeLrn,
        first_name: 'InScope',
        last_name: 'Student',
        grade_level: 6,
        section: 'Malikhain',
      },
    });
    assert(createInScope.status === 201, 'Teacher creates student inside own assignment (Grade 6 - Malikhain)');
    const inScopeId = createInScope.data?.student?.id;
    if (createInScope.status === 201 && inScopeId) createdStudentIds.push(inScopeId);
    assert(
      createInScope.data?.student?.section_id != null,
      `in-scope Malikhain create stores non-null section_id (got ${createInScope.data?.student?.section_id})`
    );
    // Not collected since the privacy build (2026-10-10, decision 6): a
    // learner's record carries none of the four retired fields.
    assert(
      ['birthday', 'gender', 'address', 'contact_number'].every((k) => !(k in (createInScope.data?.student || {}))),
      'POST /students: the response carries no birthday, gender, address or contact number'
    );

    const createOutOfScope = await request('POST', '/api/students', {
      token: teacherToken,
      body: {
        lrn: `3${uniqueSuffix}`,
        first_name: 'OutOfScope',
        last_name: 'Student',
        // A REAL Grade 3 section (seed.sql) with no adviser. The section is
        // resolved before the gate since pre-Stage-5 #4, so a fictional name
        // here would be the 400 "no section named", not the scope 403.
        grade_level: 3,
        section: 'Magiliw',
      },
    });
    assert(
      createOutOfScope.status === 403,
      'Teacher creating a student into a section they do not advise (Grade 3 - Magiliw) is rejected'
    );

    // --- WHO ENROLS: THE ADVISER OF THE TARGET SECTION (pre-Stage-5 #4).
    // TCH-002 advises Grade 5 - Masigasig and holds ZERO assignments — until
    // today the assignments-only gate refused it; the school's rule is the
    // opposite. A teacher ASSIGNED to a class but not its adviser is now the
    // one refused: none is seeded, so one is minted (active, one Malikhain
    // assignment — TCH-001 advises Malikhain) and deleted in cleanup.
    const adviserCreate = await request('POST', '/api/students', {
      token: adviserToken,
      body: { lrn: `2${uniqueSuffix}`, first_name: 'Advised', last_name: 'Student', grade_level: 5, section: 'Masigasig' },
    });
    const adviserCreatedId = adviserCreate.data?.student?.id;
    if (adviserCreate.status === 201 && adviserCreatedId) createdStudentIds.push(adviserCreatedId);
    assert(adviserCreate.status === 201, `Adviser-only teacher (TCH-002) enrols into their own advisory section (got ${adviserCreate.status})`);
    assert(
      adviserCreate.data?.student?.section_id != null,
      `adviser create stores non-null section_id (got ${adviserCreate.data?.student?.section_id})`
    );

    const mintedLoginId = `TCH-${uniqueSuffix}`;
    const mintTeacher = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: mintedLoginId, password: 'Teacher@2026', name: 'Assigned Only Teacher' },
    });
    const mintedTeacherId = mintTeacher.data?.user?.id;
    if (mintedTeacherId) await clearForcedChange(mintedTeacherId);
    if (mintTeacher.status === 201 && mintedTeacherId) createdTeacherIds.push(mintedTeacherId);
    const g6Subjects = await request('GET', '/api/subjects?grade_level=6', { token: adminToken });
    const assignMinted = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: mintedTeacherId, subject_id: g6Subjects.data?.subjects?.[0]?.id, grade_level: 6, section: 'Malikhain' },
    });
    const mintedLogin = await login(mintedLoginId, 'Teacher@2026');
    await policy.accept(mintedLogin.data?.token);
    const assignedNotAdviserCreate = await request('POST', '/api/students', {
      token: mintedLogin.data?.token,
      body: { lrn: `1${uniqueSuffix}`, first_name: 'Refused', last_name: 'Student', grade_level: 6, section: 'Malikhain' },
    });
    assert(
      mintTeacher.status === 201 && assignMinted.status === 201 && mintedLogin.status === 200 && assignedNotAdviserCreate.status === 403,
      `A teacher assigned to Grade 6 - Malikhain but not its adviser is refused (mint ${mintTeacher.status}, assign ${assignMinted.status}, login ${mintedLogin.status}, create ${assignedNotAdviserCreate.status})`
    );
    assert(
      /adviser of Grade 6 - Malikhain/.test(assignedNotAdviserCreate.data?.message || ''),
      'That 403 names the adviser rule and the class, not a bare "Access denied."'
    );

    // Mabini is fictional. Duplicate-LRN must fire BEFORE section resolve,
    // or this is 400 "no section named Mabini" instead of 409. The duplicate
    // is the 12-digit in-scope student created above — Marwin's seeded 8-digit
    // LRN would now be refused by the LRN rule (400) before the lookup.
    const createDuplicate = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: inScopeLrn, // already exists (created above)
        first_name: 'Dup',
        last_name: 'Student',
        grade_level: 6,
        section: 'Mabini',
      },
    });
    assert(createDuplicate.status === 409, 'Duplicate LRN rejected');

    // --- The LRN rule and the optional-field rules on POST (2026-09-18) ---
    // Each refusal is a 400 naming its field; nothing is created.
    const shortLrn = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: uniqueSuffix, first_name: 'Short', last_name: 'Lrn', grade_level: 6, section: 'Malikhain' },
    });
    assert(
      shortLrn.status === 400 && shortLrn.data?.field === 'lrn' && /12 digits/.test(shortLrn.data?.message || ''),
      'POST /students: an 11-digit LRN is 400, field "lrn", naming 12 digits'
    );
    const spacedLrn = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: 'Test Student', first_name: 'Text', last_name: 'Lrn', grade_level: 6, section: 'Malikhain' },
    });
    assert(spacedLrn.status === 400 && spacedLrn.data?.field === 'lrn', 'POST /students: "Test Student" (12 chars, not digits) is 400, field "lrn"');
    // Decision 6 (the privacy build, 2026-10-10): a VALUE for any of the four
    // retired fields is 400 naming it, and nothing is created.
    for (const [field, value] of RETIRED_VALUES) {
      const refused = await request('POST', '/api/students', {
        token: adminToken,
        body: { lrn: `4${uniqueSuffix}`, first_name: 'Retired', last_name: 'Field', grade_level: 6, section: 'Malikhain', [field]: value },
      });
      assert(
        refused.status === 400 && refused.data?.field === field && /no longer collected/.test(refused.data?.message || ''),
        `POST /students: a ${field} value is 400, field "${field}" — no longer collected`
      );
    }
    const notCreated = await request('GET', `/api/students?search=${'4' + uniqueSuffix}`, { token: adminToken });
    assert(notCreated.status === 200 && (notCreated.data?.students || []).length === 0, 'POST /students: the refused bodies created nothing');
    // ...while a null or empty retired key is IGNORED, so a client echoing an
    // old row back is not broken.
    const emptyRetired = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: `4${uniqueSuffix}`, first_name: 'Empty', last_name: 'Retired', grade_level: 6, section: 'Malikhain', birthday: '', gender: null, address: '  ', contact_number: null },
    });
    assert(emptyRetired.status === 201, 'POST /students: null or empty retired keys are ignored — 201');
    const emptyRetiredId = emptyRetired.data?.student?.id;
    if (emptyRetired.status === 201 && emptyRetiredId) createdStudentIds.push(emptyRetiredId);

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
      body: { last_name: 'Edited' },
    });
    assert(teacherUpdateInScope.status === 200, 'Teacher updates in-scope student');
    assert(
      teacherUpdateInScope.data?.student?.section_id === createInScope.data?.student?.section_id,
      'A last-name-only PUT leaves a non-null section_id unchanged'
    );

    // --- Decision 6 on PUT (the privacy build, 2026-10-10): a value for a
    // retired field is 400 naming it and saves nothing — the last name set
    // just above must survive each one.
    for (const [field, value] of RETIRED_VALUES) {
      const refused = await request('PUT', `/api/students/${inScopeId}`, {
        token: teacherToken,
        body: { last_name: 'Refused', [field]: value },
      });
      assert(refused.status === 400 && refused.data?.field === field, `PUT /students: a ${field} value is 400, field "${field}"`);
    }
    const afterRefusals = await request('GET', `/api/students/${inScopeId}`, { token: teacherToken });
    assert(
      afterRefusals.data?.student?.last_name === 'Edited' &&
        ['birthday', 'gender', 'address', 'contact_number'].every((k) => !(k in (afterRefusals.data?.student || {}))),
      'PUT /students: the refused bodies changed nothing, and GET /:id carries none of the four'
    );
    // parent_account on GET /:id (2026-09-18): null here — no parent was
    // created for this fixture; the linked case is asserted in test:auth.
    assert(
      afterRefusals.status === 200 && 'parent_account' in (afterRefusals.data || {}) && afterRefusals.data.parent_account === null,
      'GET /students/:id carries parent_account (null when no parent account exists)'
    );

    const teacherUpdateOutOfScope = await request('PUT', `/api/students/${jeaId}`, {
      token: teacherToken,
      body: { last_name: 'Edited' },
    });
    assert(teacherUpdateOutOfScope.status === 404, 'Teacher updating out-of-scope student returns 404');

    // EDIT scope is assigned OR adviser since pre-Stage-5 #4: the adviser who
    // enrolled a learner can correct the record. Written on THIS RUN's own
    // Masigasig fixture (adviserCreatedId), never on Jea's seeded row, and
    // re-read so the value asserted is the stored one (§5b).
    const adviserUpdateOwnSection = await request('PUT', `/api/students/${adviserCreatedId}`, {
      token: adviserToken,
      body: { last_name: 'Adviser Edit' },
    });
    assert(
      adviserUpdateOwnSection.status === 200 && adviserUpdateOwnSection.data?.student?.last_name === 'Adviser Edit',
      `Adviser-only teacher edits a learner in their advisory section — 200 (got ${adviserUpdateOwnSection.status})`
    );
    const adviserEditReRead = await request('GET', `/api/students/${adviserCreatedId}`, { token: adviserToken });
    assert(
      adviserEditReRead.data?.student?.last_name === 'Adviser Edit',
      'and the edit is what GET /:id returns afterwards'
    );

    // Outside BOTH scopes stays 404 — indistinguishable from a nonexistent id.
    const adviserUpdateOutside = await request('PUT', `/api/students/${marwinId}`, {
      token: adviserToken,
      body: { last_name: 'Edited' },
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
      body: { grade_level: 6, section: 'Malikhain', last_name: 'Matching' },
    });
    assert(matchingClassPut.status === 200, 'Matching class PUT succeeds');
    assert(
      Number(matchingClassPut.data?.student?.grade_level) === 6 &&
        matchingClassPut.data?.student?.section === 'Malikhain',
      'Matching class PUT leaves grade_level and section unchanged'
    );
    assert(
      matchingClassPut.data?.student?.last_name === 'Matching',
      'Matching class PUT still saves other fields'
    );
    assert(
      matchingClassPut.data?.student?.section_id === inScopeSectionId,
      'Matching class PUT does not overwrite a non-null section_id'
    );

    const beforeGradeChange = matchingClassPut.data?.student;
    const changeGradeLevel = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { grade_level: 5, last_name: 'Refused' },
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
        afterGradeChange.data?.student?.last_name === beforeGradeChange?.last_name,
      'Refused grade_level change leaves VARCHAR, section_id, and other fields untouched'
    );

    const changeSection = await request('PUT', `/api/students/${inScopeId}`, {
      token: adminToken,
      body: { section: 'Masigasig', last_name: 'Refused' },
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
        afterSectionChange.data?.student?.last_name === beforeGradeChange?.last_name,
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
         VALUES (?, 'NullSid', 'Malikhain', 6, 'Malikhain', NULL, 1) RETURNING id`,
        [`TN${uniqueSuffix.slice(-10)}`] // 12 chars, non-numeric on purpose (VARCHAR(12))
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
         VALUES (?, 'Unmatched', 'Mabini', 6, 'Mabini', NULL, 1) RETURNING id`,
        [`TM${uniqueSuffix.slice(-10)}`] // 12 chars, non-numeric on purpose (VARCHAR(12))
      );
      return result.insertId;
    });
    if (unmatchedNullId) createdStudentIds.push(unmatchedNullId);

    const resolveMiss = await request('PUT', `/api/students/${unmatchedNullId}`, {
      token: adminToken,
      body: { grade_level: 6, section: 'Mabini', last_name: 'Resolve Miss' },
    });
    assert(
      resolveMiss.status === 200,
      'Matching PUT whose VARCHAR matches no sections row still succeeds (does not 400 the rest of the form)'
    );
    assert(
      resolveMiss.data?.student?.last_name === 'Resolve Miss',
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

    const listActiveExplicit = await request('GET', '/api/students?status=active', { token: adminToken });
    assert(
      listActiveExplicit.status === 200 &&
        !(listActiveExplicit.data?.students || []).some((s) => s.id === inScopeId),
      'status=active is accepted explicitly and excludes the inactive student'
    );

    // A typo used to fall through to active-only silently.
    const listTypo = await request('GET', '/api/students?status=activ', { token: adminToken });
    assert(
      listTypo.status === 400 && /active, inactive, all/.test(listTypo.data?.message || ''),
      'status=activ (a typo) is 400 naming the valid values, not a silent active-only list'
    );

    // A second PATCH to the state the student is already in: still success
    // (the requested state holds) but nothing changed, so nothing is logged.
    // Scoped to this run's own student id.
    const countStatusLogs = async () => {
      const [rows] = await withDb((conn) =>
        conn.query(
          "SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'update_student_status' AND description LIKE ?",
          [`%student #${inScopeId} to %`]
        )
      );
      return Number(rows[0].c);
    };
    // The pattern follows the route's template, `Set student #<id> to
    // <status>` (routes/students.js, since 2026-09-18). It looked for
    // `(#<id>) to` until the P3-C-R2 fix round, so the counter read 0 before
    // and after whatever the route did and the check below could not fail;
    // this one proves the counter sees the run's own change above.
    const statusLogsBefore = await countStatusLogs();
    assert(
      statusLogsBefore >= 1,
      "the status-log counter sees this run's own deactivation (it is not vacuous)",
      `counted ${statusLogsBefore}`
    );
    const adminStatusNoop = await request('PATCH', `/api/students/${inScopeId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(
      adminStatusNoop.status === 200 &&
        adminStatusNoop.data?.student?.status === 'inactive' &&
        /already inactive/.test(adminStatusNoop.data?.message || ''),
      'Setting a student to the status they already have is 200 and says nothing changed'
    );
    assert(
      (await countStatusLogs()) === statusLogsBefore,
      'That no-op writes no update_student_status entry'
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

    await checkPage('/api/students?status=all', adminToken, 'students', { sort: 'name', field: 'last_name' });
    await checkPage('/api/students', teacherToken, 'students', { sort: 'lrn', field: 'lrn' });

    // C4: search narrows total to the filtered, scoped set (Marwin is seeded).
    const searchPage = await request('GET', '/api/students?search=Conde&limit=200', { token: adminToken });
    assert(
      searchPage.status === 200 &&
        (searchPage.data?.students || []).every((s) => `${s.first_name} ${s.last_name}`.includes('Conde')) &&
        (searchPage.data?.page?.has_more || searchPage.data?.page?.total === searchPage.data?.students?.length),
      'GET /students?search=Conde: every row matches and total is the filtered count'
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
