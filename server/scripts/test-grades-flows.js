/**
 * Grades API tests — Stage G2b (POST /api/grades, row creation/scoping),
 * Stage G2c (POST /:id/components, PATCH /:id/exam — the first writes
 * that actually compute anything), Stage G2d (PATCH /:id/descriptive —
 * Grade 1's manual letter grade, the other side of the numerical/
 * descriptive gate), and Stage G2e (PUT/DELETE .../components/:componentId,
 * PATCH /:id/lock). The centerpiece is a full worked example driven
 * through the real HTTP endpoints, step by step, reusing the EXACT
 * numbers from utils/gradeComputation.js's own unit tests
 * (test-grade-computation.js) — a mismatch between that trusted pure
 * math and this wired-up HTTP result would surface as a wiring bug, not
 * a new, unverified expectation. Stage G2e's own fixture is built up to
 * FULL completion (a real non-null Initial Grade and Term Grade) before
 * any edit/delete runs, so deleting the last WW component demonstrates a
 * genuine reversion to NULL, not a trivial already-null case.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every grade row this script creates is tracked and deleted
 * in a finally block; the throwaway student fixtures (one inactive
 * Grade 6, one Grade 1 for the descriptive-mode WRITE tests) and the one
 * throwaway teacher_assignments row (TCH-001 -> Grade 1 Mathematics in
 * Matipid, for the "subject teacher succeeds" descriptive test) are
 * deleted the same way — passes on repeat runs with no db:setup.
 *
 * The seeded Grade 1 student (LRN 1090001, Mabait) is READ-ONLY here.
 * Do not POST/PATCH/DELETE grades against that student: a suite that
 * writes and deletes on the demo fixture is a suite that can break the
 * demo. The throwaway Matipid student remains the write target for
 * descriptive tests; DELETE /:id uses its own throwaway student + shell.
 * The seeded card is asserted as the seed left it (count stays 5).
 *
 * Usage: npm run test:grades
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

let passed = 0;
let failed = 0;

// mysql2 returns DECIMAL columns as strings (e.g. "90.00"), not numbers —
// gradeComputation.js's own functions already defensively call Number()
// on every input for exactly this reason, so the computation itself is
// unaffected, but a test asserting `=== 90.0` against the raw API
// response fails on a type mismatch even when the value is correct. null
// passes through unchanged, so a NULL-boundary assertion still works.
function num(value) {
  return value === null || value === undefined ? value : Number(value);
}

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// A failed FIXTURE is not a failed assertion. assert() only records, so a
// missing row let the run continue on undefined ids — a pile of misleading ✗
// lines, or a crash many statements later on a NULL column (test:grades was
// broken that way 2026-09-10 → 2026-09-13 and reported ER_BAD_NULL_ERROR
// instead of the one line that explained it). requireFixture counts exactly
// like assert() and then STOPS the run; the try/finally in run() still
// cleans up. Use it only where everything after depends on a row existing.
// A wrong computed VALUE is a finding, not a reason to stop — those stay
// ordinary assert() calls. Local to this file on purpose: all seventeen
// test scripts share assert() byte for byte, and changing them together is
// a shared-helper refactor, not a fixture fix.
class FixtureFailure extends Error {}

function requireFixture(condition, label, detail = '') {
  assert(condition, label, detail);
  if (!condition) throw new FixtureFailure(`${label}${detail ? ` — ${detail}` : ''}`);
}

function why(res) {
  return `got ${res.status}${res.data?.message ? `: ${res.data.message}` : ''}`;
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  console.log(`\nParents Portal — Grades API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 is assigned Grade 6 - Malikhain for Mathematics/English/Filipino
  // (setup-db.js's buildUserSeedSql) — NOT Science, which exists at Grade 6
  // in the current placeholder subjects seed but has no assignment row.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  const teacherId = teacherLogin.data?.user?.id;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (TCH-001, Grade 6 - Malikhain)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (for the parent-cannot-create test)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), "Resolve Marwin's student_id via /me (Grade 6 - Malikhain)");

  const adminStudentList = await request('GET', '/api/students?status=all', { token: adminToken });
  const jea = adminStudentList.data?.students?.find((s) => s.lrn === '1234567');
  const jeaId = jea?.id;
  assert(Number.isInteger(jeaId), "Resolve Jea's student id (Grade 5 - Masigasig, outside TCH-001's scope)");

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

  async function resolveSubjectId(name, gradeLevel) {
    const [rows] = await withDb((conn) =>
      conn.query('SELECT id FROM subjects WHERE name = ? AND grade_level = ? LIMIT 1', [name, gradeLevel])
    );
    return rows[0]?.id;
  }

  const mathGrade6Id = await resolveSubjectId('Mathematics', 6); // TCH-001 IS assigned this
  const scienceGrade6Id = await resolveSubjectId('Science', 6); // TCH-001 is NOT assigned this
  const mathGrade1Id = await resolveSubjectId('Mathematics', 1); // wrong grade level for Marwin (Grade 6)
  const filipinoGrade6Id = await resolveSubjectId('Filipino', 6); // TCH-001 IS assigned this
  const englishGrade6Id = await resolveSubjectId('English', 6); // TCH-001 IS assigned this
  const mapehGrade6Id = await resolveSubjectId('MAPEH', 6); // 20/60/20 weights, TCH-001 NOT assigned
  assert(
    [mathGrade6Id, scienceGrade6Id, mathGrade1Id, filipinoGrade6Id, englishGrade6Id, mapehGrade6Id].every(
      Number.isInteger
    ),
    'Resolve fixture subject ids (Math G6/G1, Science G6, Filipino G6, English G6, MAPEH G6)'
  );

  async function lookupTransmutedGrade(ig) {
    const [rows] = await withDb((conn) =>
      conn.query(
        'SELECT transmuted_grade FROM transmutation_table WHERE school_year = ? AND ig_min <= ? AND ig_max >= ? LIMIT 1',
        [schoolYear, ig, ig]
      )
    );
    return rows[0]?.transmuted_grade ?? null;
  }

  const runId = String(Date.now()).slice(-8);
  const schoolYear = '2026-2027';
  const createdGradeIds = [];
  let inactiveStudentId;
  let grade1StudentFixtureId;
  let grade1TeacherAssignmentId;
  let gaStudentFixtureId;
  const gaGradeIds = [];
  let deleteStudentFixtureId;

  async function cleanup() {
    if (createdGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id IN (?)', [createdGradeIds]));
    }
    if (inactiveStudentId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [inactiveStudentId]));
    }
    if (grade1StudentFixtureId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [grade1StudentFixtureId]));
    }
    if (grade1TeacherAssignmentId) {
      await withDb((conn) => conn.query('DELETE FROM teacher_assignments WHERE id = ?', [grade1TeacherAssignmentId]));
    }
    if (gaGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id IN (?)', [gaGradeIds]));
    }
    if (gaStudentFixtureId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [gaStudentFixtureId]));
    }
    if (deleteStudentFixtureId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [deleteStudentFixtureId]));
    }
  }

  try {
    // --- Fixture: an inactive student, Grade 6, for the active-status check ---
    const inactiveLrn = `6${runId}`;
    const createInactive = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: inactiveLrn, first_name: 'Inactive', last_name: 'Fixture', grade_level: 6, section: 'Malikhain' },
    });
    inactiveStudentId = createInactive.data?.student?.id;
    const deactivate = await request('PATCH', `/api/students/${inactiveStudentId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    requireFixture(
      createInactive.status === 201 && deactivate.status === 200,
      'Fixture: an inactive Grade 6 student for the active-status check',
      `create ${why(createInactive)}; deactivate ${why(deactivate)}`
    );

    // --- Success paths ---
    console.log('\nSuccess:');

    const teacherCreates = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(
      teacherCreates.status === 201 && teacherCreates.data?.grade?.student_id === marwinId,
      'Subject teacher creates a grade row for their own assignment'
    );
    const grade1Id = teacherCreates.data?.grade?.id;
    if (grade1Id) createdGradeIds.push(grade1Id);

    const g = teacherCreates.data?.grade || {};
    assert(
      g.ww_percentage === null &&
        g.ww_weighted === null &&
        g.pt_percentage === null &&
        g.pt_weighted === null &&
        g.ex_st1 === null &&
        g.ex_st1_max === null &&
        g.ex_st2 === null &&
        g.ex_st2_max === null &&
        g.ex_te === null &&
        g.ex_te_max === null &&
        g.ex_percentage === null &&
        g.ex_weighted === null &&
        g.initial_grade === null &&
        g.term_grade === null &&
        g.descriptive_grade === null,
      'Every score and computed column is NULL on creation'
    );
    assert(g.is_locked === 0, `is_locked is 0 on creation (got ${g.is_locked})`);

    const adminCreates = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: jeaId, subject_id: await resolveSubjectId('Mathematics', 5), term: 1, school_year: schoolYear },
    });
    assert(adminCreates.status === 201, 'Admin creates a grade row for any student, unscoped');
    if (adminCreates.data?.grade?.id) createdGradeIds.push(adminCreates.data.grade.id);

    // --- Scoping ---
    console.log('\nScoping:');

    const wrongSubject = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: scienceGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(
      wrongSubject.status === 403 && /not assigned to teach Science/i.test(wrongSubject.data?.message || ''),
      'Teacher assigned to the section but NOT the subject gets 403 naming the subject'
    );

    const outOfScope = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: jeaId, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(outOfScope.status === 403, 'Teacher fully out of scope (different grade/section) gets 403');

    const adminNonexistentStudent = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: 999999, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(adminNonexistentStudent.status === 404, 'Admin with a nonexistent student_id gets 404');

    const teacherNonexistentStudent = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: 999999, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(
      teacherNonexistentStudent.status === 403,
      'Teacher with a nonexistent student_id gets 403, NOT 404 — the anti-enumeration property'
    );

    const parentAttempts = await request('POST', '/api/grades', {
      token: parentToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 2, school_year: schoolYear },
    });
    assert(parentAttempts.status === 403, 'Parent cannot create a grade record');

    // --- Validation ---
    console.log('\nValidation:');

    const nonexistentSubject = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: 999999, term: 1, school_year: schoolYear },
    });
    assert(nonexistentSubject.status === 400, 'Nonexistent subject_id returns 400');

    const wrongGradeLevel = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: mathGrade1Id, term: 1, school_year: schoolYear },
    });
    assert(
      wrongGradeLevel.status === 400 &&
        /Grade 1/.test(wrongGradeLevel.data?.message || '') &&
        /Grade 6/.test(wrongGradeLevel.data?.message || ''),
      'Subject from the wrong grade level returns 400 naming both grades'
    );

    const termZero = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 0, school_year: schoolYear },
    });
    assert(termZero.status === 400, 'term 0 rejected');

    const termFour = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 4, school_year: schoolYear },
    });
    assert(termFour.status === 400, 'term 4 rejected');

    const malformedYear = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 1, school_year: '2026' },
    });
    assert(malformedYear.status === 400, 'Malformed school_year rejected');

    const nonConsecutiveYear = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 1, school_year: '2026-2028' },
    });
    assert(nonConsecutiveYear.status === 400, 'Non-consecutive school_year (2026-2028) rejected');

    const inactiveStudentAttempt = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: inactiveStudentId, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(inactiveStudentAttempt.status === 400, 'Inactive student rejected');

    // --- Duplicate ---
    console.log('\nDuplicate:');

    const duplicate = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 1, school_year: schoolYear },
    });
    assert(duplicate.status === 409, 'Duplicate (student, subject, term, school_year) returns 409');

    const unauth = await request('POST', '/api/grades', {
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 3, school_year: schoolYear },
    });
    assert(unauth.status === 401, 'Unauthenticated POST returns 401');

    // --- G2c: component/exam writes and recomputation ---
    console.log('\nWorked example (core weights 20/50/30) — same numbers as test-grade-computation.js:');

    // grade1Id (Marwin, Mathematics, term 1) was created above with every
    // score/computed column NULL and never touched since — reused here as
    // the target for the full step-by-step worked example.

    const parentComponent = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: parentToken,
      body: { type: 'WW', score: 1, max_score: 1, label: 'x' },
    });
    assert(parentComponent.status === 403, 'Parent cannot add a grade component');

    const parentExam = await request('PATCH', `/api/grades/${grade1Id}/exam`, {
      token: parentToken,
      body: { st1_score: 1, st1_max: 1 },
    });
    assert(parentExam.status === 403, 'Parent cannot set exam scores');

    const ww1 = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 45, max_score: 50, label: 'Quiz 1' },
    });
    assert(
      ww1.status === 201 && num(ww1.data?.grade?.ww_percentage) === 90.0 && num(ww1.data?.grade?.initial_grade) === null,
      `After WW 45/50: ww_percentage 90.00, initial_grade NULL (got ww_percentage=${ww1.data?.grade?.ww_percentage}, initial_grade=${ww1.data?.grade?.initial_grade})`
    );
    assert(
      ww1.data?.component?.type === 'WW' && num(ww1.data?.component?.score) === 45,
      'Response includes the new component row'
    );

    const ww2 = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 42, max_score: 50, label: 'Quiz 2' },
    });
    assert(
      ww2.status === 201 && num(ww2.data?.grade?.ww_percentage) === 87.0 && num(ww2.data?.grade?.initial_grade) === null,
      `After WW 42/50 added: ww_percentage 87.00 (recomputed from BOTH rows, not just the newest), initial_grade NULL (got ww_percentage=${ww2.data?.grade?.ww_percentage})`
    );

    await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 88, max_score: 100, label: 'Performance Task 1' },
    });
    const pt2 = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 92, max_score: 100, label: 'Performance Task 2' },
    });
    assert(
      pt2.status === 201 && num(pt2.data?.grade?.pt_percentage) === 90.0 && num(pt2.data?.grade?.initial_grade) === null,
      `After PT 88/100, 92/100: pt_percentage 90.00, initial_grade still NULL (WW+PT alone is not enough) (got pt_percentage=${pt2.data?.grade?.pt_percentage}, initial_grade=${pt2.data?.grade?.initial_grade})`
    );

    const st1 = await request('PATCH', `/api/grades/${grade1Id}/exam`, {
      token: teacherToken,
      body: { st1_score: 17, st1_max: 20 },
    });
    assert(
      st1.status === 200 && st1.data?.grade?.ex_percentage === null && st1.data?.grade?.initial_grade === null,
      `After ST1 17/20: ex_percentage NULL (ST2, TE still missing), initial_grade NULL (got ex_percentage=${st1.data?.grade?.ex_percentage})`
    );

    const st2 = await request('PATCH', `/api/grades/${grade1Id}/exam`, {
      token: teacherToken,
      body: { st2_score: 16, st2_max: 20 },
    });
    assert(
      st2.status === 200 && st2.data?.grade?.ex_percentage === null && st2.data?.grade?.initial_grade === null,
      `After ST2 16/20: ex_percentage still NULL (TE still missing), initial_grade NULL (got ex_percentage=${st2.data?.grade?.ex_percentage})`
    );

    const te = await request('PATCH', `/api/grades/${grade1Id}/exam`, {
      token: teacherToken,
      body: { te_score: 45, te_max: 50 },
    });
    assert(
      te.status === 200 && num(te.data?.grade?.ex_percentage) === 85.5,
      `After TE 45/50: ex_percentage 85.50 = (85x0.30)+(80x0.30)+(90x0.40) (got ${te.data?.grade?.ex_percentage})`
    );
    assert(
      num(te.data?.grade?.initial_grade) === 88.05,
      `Initial Grade now appears: 88.05 = ww_weighted(17.40) + pt_weighted(45.00) + ex_weighted(25.65) (got ${te.data?.grade?.initial_grade})`
    );

    const expectedTermGradeCore = await lookupTransmutedGrade(88.05);
    assert(
      num(te.data?.grade?.term_grade) === expectedTermGradeCore,
      `term_grade matches the seeded transmutation_table lookup for IG 88.05 (table says ${expectedTermGradeCore}, API returned ${te.data?.grade?.term_grade})`
    );

    // --- Same raw scores, MAPEH/EPP weights (20/60/20) ---
    console.log('\nSame raw scores — MAPEH/EPP weights (20/60/20):');

    const mapehCreate = await request('POST', '/api/grades', {
      token: adminToken, // TCH-001 is not assigned MAPEH — admin only
      body: { student_id: marwinId, subject_id: mapehGrade6Id, term: 2, school_year: schoolYear },
    });
    requireFixture(mapehCreate.status === 201, 'Fixture: MAPEH grade row for the second worked example', why(mapehCreate));
    const mapehGradeId = mapehCreate.data?.grade?.id;
    if (mapehGradeId) createdGradeIds.push(mapehGradeId);

    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 45, max_score: 50, label: 'Quiz 1' },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 42, max_score: 50, label: 'Quiz 2' },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'PT', score: 88, max_score: 100, label: 'Performance Task 1' },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'PT', score: 92, max_score: 100, label: 'Performance Task 2' },
    });
    await request('PATCH', `/api/grades/${mapehGradeId}/exam`, {
      token: adminToken,
      body: { st1_score: 17, st1_max: 20, st2_score: 16, st2_max: 20 },
    });
    const mapehFinal = await request('PATCH', `/api/grades/${mapehGradeId}/exam`, {
      token: adminToken,
      body: { te_score: 45, te_max: 50 },
    });
    assert(
      num(mapehFinal.data?.grade?.ww_percentage) === 87.0 && num(mapehFinal.data?.grade?.pt_percentage) === 90.0,
      'Same raw scores under MAPEH weights still produce ww_percentage 87.00, pt_percentage 90.00 (weights only change the WEIGHTED step)'
    );
    assert(
      mapehFinal.status === 200 && num(mapehFinal.data?.grade?.initial_grade) === 88.5,
      `MAPEH weights (20/60/20): Initial Grade 88.50 = 17.40 + 54.00 + 17.10 (got ${mapehFinal.data?.grade?.initial_grade})`
    );

    const expectedTermGradeMapeh = await lookupTransmutedGrade(88.5);
    assert(
      num(mapehFinal.data?.grade?.term_grade) === expectedTermGradeMapeh,
      `term_grade matches the seeded transmutation_table lookup for IG 88.50 (table says ${expectedTermGradeMapeh}, API returned ${mapehFinal.data?.grade?.term_grade})`
    );

    // --- Component validation ---
    console.log('\nComponent validation:');

    const validationCreate = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: filipinoGrade6Id, term: 1, school_year: schoolYear },
    });
    const validationGradeId = validationCreate.data?.grade?.id;
    if (validationGradeId) createdGradeIds.push(validationGradeId);

    const negativeScore = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: -5, max_score: 50, label: 'Bad' },
    });
    assert(negativeScore.status === 400, 'Negative score rejected');

    const zeroMax = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 5, max_score: 0, label: 'Bad' },
    });
    assert(zeroMax.status === 400, 'max_score of 0 rejected');

    const bonusPoints = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 110, max_score: 100, label: 'Bonus points' },
    });
    assert(
      bonusPoints.status === 201 && num(bonusPoints.data?.grade?.ww_percentage) === 110.0,
      `score > max_score (bonus points) is accepted, not clamped: ww_percentage 110.00 (got ${bonusPoints.data?.grade?.ww_percentage})`
    );

    // --- Exam edge cases (own grade row, kept separate from the worked example) ---
    console.log('\nExam edge cases:');

    const examEdgeCreate = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: englishGrade6Id, term: 1, school_year: schoolYear },
    });
    const examEdgeGradeId = examEdgeCreate.data?.grade?.id;
    if (examEdgeGradeId) createdGradeIds.push(examEdgeGradeId);

    const emptyBody = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: {},
    });
    assert(emptyBody.status === 400, 'Empty PATCH /:id/exam body rejected');

    const st1WithoutMax = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 18 },
    });
    assert(
      st1WithoutMax.status === 400,
      'st1_score without st1_max rejected when no existing st1_max is on the row'
    );

    const setSt1 = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 18, st1_max: 20 },
    });
    assert(
      setSt1.status === 200 && num(setSt1.data?.grade?.ex_st1) === 18 && num(setSt1.data?.grade?.ex_st1_max) === 20,
      'ST1 set with both fields together'
    );

    const clearSt1 = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: null },
    });
    assert(
      clearSt1.status === 200 && clearSt1.data?.grade?.ex_st1 === null && clearSt1.data?.grade?.ex_st1_max === null,
      'Explicit null on st1_score clears BOTH ex_st1 and ex_st1_max'
    );

    const conflictingNulls = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: null, st1_max: 20 },
    });
    assert(conflictingNulls.status === 400, 'One explicit null + one explicit number for the same sub-test is rejected');

    // --- Descriptive mode + transaction atomicity ---
    console.log('\nDescriptive mode (Grade 1) + atomicity:');

    const grade1FixtureLrn = `1${runId}`;
    const createGrade1Student = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: grade1FixtureLrn, first_name: 'Descriptive', last_name: 'Fixture', grade_level: 1, section: 'Matipid' },
    });
    grade1StudentFixtureId = createGrade1Student.data?.student?.id;

    const grade1DescriptiveCreate = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: grade1StudentFixtureId, subject_id: mathGrade1Id, term: 1, school_year: schoolYear },
    });
    const grade1DescriptiveId = grade1DescriptiveCreate.data?.grade?.id;
    if (grade1DescriptiveId) createdGradeIds.push(grade1DescriptiveId);
    requireFixture(
      createGrade1Student.status === 201 && grade1DescriptiveCreate.status === 201,
      'Fixture: a Grade 1 (descriptive-mode) grade row',
      `student ${why(createGrade1Student)}; grade ${why(grade1DescriptiveCreate)}`
    );

    const [componentsBefore] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM grade_components WHERE grade_id = ?', [grade1DescriptiveId])
    );

    const descriptiveModeComponent = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Should be rejected' },
    });
    assert(
      descriptiveModeComponent.status === 400,
      'POST /:id/components on a descriptive-mode (Grade 1) grade is rejected with 400'
    );

    const descriptiveModeExam = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: adminToken,
      body: { st1_score: 10, st1_max: 10 },
    });
    assert(
      descriptiveModeExam.status === 400,
      'PATCH /:id/exam on a descriptive-mode (Grade 1) grade is rejected with 400'
    );

    const [componentsAfter] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM grade_components WHERE grade_id = ?', [grade1DescriptiveId])
    );
    assert(
      componentsBefore[0].c === 0 && componentsAfter[0].c === 0,
      `A rejected write leaves zero grade_components rows — the pre-flight gate runs before any insert is attempted, not insert-then-rollback (before=${componentsBefore[0].c}, after=${componentsAfter[0].c})`
    );

    // --- Out-of-scope teacher: fully out of scope (different section) stays 404 ---
    // TCH-001 has NO teacher_assignments row at all for Grade 5 - Masigasig
    // (any subject) — fails the WIDE view-scope check too, so this stays
    // 404 even after the G3 two-tier refactor. This is exactly the
    // "cannot see this at all" branch loadAuthorizedGrade's 404 exists for.
    console.log('\nOut-of-scope teacher (different section entirely):');

    const outOfScopeGradeId = adminCreates.data?.grade?.id; // Jea, Mathematics, Grade 5 — TCH-001 has no assignment there
    const outOfScopeComponent = await request('POST', `/api/grades/${outOfScopeGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Should be 404' },
    });
    assert(outOfScopeComponent.status === 404, 'Fully out-of-scope teacher gets 404 on POST /:id/components (fails wide view-scope too)');

    const outOfScopeExam = await request('PATCH', `/api/grades/${outOfScopeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 10, st1_max: 10 },
    });
    assert(outOfScopeExam.status === 404, 'Fully out-of-scope teacher gets 404 on PATCH /:id/exam (fails wide view-scope too)');

    const nonexistentGradeComponent = await request('POST', '/api/grades/999999/components', {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'x' },
    });
    assert(nonexistentGradeComponent.status === 404, 'Nonexistent grade id on POST /:id/components returns 404, even for admin');

    // --- G3 resolution: view-scope vs encode-scope disagreement -> 403 ---
    // TCH-001 IS assigned Grade 6 - Malikhain (Math/English/Filipino), so a
    // Science grade for Marwin (same section, different subject) passes
    // the WIDE view-scope check even though TCH-001 doesn't teach
    // Science — the exact case that makes the two tiers disagree. This is
    // the resolution of the G2b-provisional decision: 403 naming the
    // subject, not 404, since a GET would now show this teacher the row.
    // Tested across all five :id-keyed write endpoints, since each has its
    // own separate call site for the shared encodeScopeError() check.
    console.log('\nView-scope vs encode-scope disagreement (G3 resolution):');

    const scienceGradeCreate = await request('POST', '/api/grades', {
      token: adminToken, // TCH-001 is not assigned Science — admin creates it
      body: { student_id: marwinId, subject_id: scienceGrade6Id, term: 1, school_year: schoolYear },
    });
    const scienceGradeId = scienceGradeCreate.data?.grade?.id;
    if (scienceGradeId) createdGradeIds.push(scienceGradeId);
    requireFixture(
      scienceGradeCreate.status === 201,
      'Fixture: a Science grade row for Marwin (Grade 6 - Malikhain), created by admin',
      why(scienceGradeCreate)
    );

    const viewScopeComponent = await request('POST', `/api/grades/${scienceGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Should be 403, not 404' },
    });
    assert(
      viewScopeComponent.status === 403 && /not assigned to teach Science/i.test(viewScopeComponent.data?.message || ''),
      `POST /:id/components: view-scope-but-not-encode-scope gets 403 naming the subject, NOT 404 (got ${viewScopeComponent.status})`
    );

    const viewScopePut = await request('PUT', `/api/grades/${scienceGradeId}/components/999999`, {
      token: teacherToken,
      body: { score: 1 },
    });
    assert(
      viewScopePut.status === 403 && /not assigned to teach Science/i.test(viewScopePut.data?.message || ''),
      `PUT .../components/:componentId: same disagreement, 403 before the component lookup even runs (got ${viewScopePut.status})`
    );

    const viewScopeDelete = await request('DELETE', `/api/grades/${scienceGradeId}/components/999999`, {
      token: teacherToken,
    });
    assert(
      viewScopeDelete.status === 403 && /not assigned to teach Science/i.test(viewScopeDelete.data?.message || ''),
      `DELETE .../components/:componentId: same disagreement, 403 (got ${viewScopeDelete.status})`
    );

    const viewScopeExam = await request('PATCH', `/api/grades/${scienceGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 10, st1_max: 10 },
    });
    assert(
      viewScopeExam.status === 403 && /not assigned to teach Science/i.test(viewScopeExam.data?.message || ''),
      `PATCH /:id/exam: same disagreement, 403 (got ${viewScopeExam.status})`
    );

    const viewScopeDescriptive = await request('PATCH', `/api/grades/${scienceGradeId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: 'A' },
    });
    assert(
      viewScopeDescriptive.status === 403 && /not assigned to teach Science/i.test(viewScopeDescriptive.data?.message || ''),
      `PATCH /:id/descriptive: scope check runs BEFORE the mode check — 403 naming the subject, not 400 for mode mismatch (got ${viewScopeDescriptive.status})`
    );

    // --- Descriptive grading (Stage G2d) ---
    // Grade 1 is a MANUAL teacher judgment call — an ASSUMPTION, not a
    // school-confirmed answer. DO 015 s.2026 defines no Initial-Grade-to-
    // letter mapping at all, and descriptive grading exists specifically
    // to avoid numerical labeling in Key Stage 1 — that reasoning, not a
    // school confirmation, is why grade1DescriptiveId's letter is set
    // directly here rather than computed. If the school later says a
    // computation feeds the letter, this test (and the endpoint) change;
    // the schema does not need to.
    console.log('\nDescriptive grading (Stage G2d):');

    // Fixture: give TCH-001 a real assignment for Grade 1 Mathematics in
    // the fixture student's section, so "subject teacher succeeds" can be
    // tested against an actual subject teacher, not just admin.
    const [assignmentResult] = await withDb((conn) =>
      conn.query('INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section) VALUES (?, ?, 1, ?)', [
        teacherId,
        mathGrade1Id,
        'Matipid',
      ])
    );
    grade1TeacherAssignmentId = assignmentResult.insertId;

    const teacherSetsA = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: 'A' },
    });
    assert(
      teacherSetsA.status === 200 && teacherSetsA.data?.grade?.descriptive_grade === 'A',
      'Subject teacher sets A on a Grade 1 grade'
    );
    assert(
      teacherSetsA.data?.grade?.ww_percentage === null &&
        teacherSetsA.data?.grade?.ww_weighted === null &&
        teacherSetsA.data?.grade?.pt_percentage === null &&
        teacherSetsA.data?.grade?.pt_weighted === null &&
        teacherSetsA.data?.grade?.ex_st1 === null &&
        teacherSetsA.data?.grade?.ex_st1_max === null &&
        teacherSetsA.data?.grade?.ex_st2 === null &&
        teacherSetsA.data?.grade?.ex_st2_max === null &&
        teacherSetsA.data?.grade?.ex_te === null &&
        teacherSetsA.data?.grade?.ex_te_max === null &&
        teacherSetsA.data?.grade?.ex_percentage === null &&
        teacherSetsA.data?.grade?.ex_weighted === null &&
        teacherSetsA.data?.grade?.initial_grade === null &&
        teacherSetsA.data?.grade?.term_grade === null,
      'Every numerical column is still NULL after setting a descriptive grade — the property that matters'
    );

    for (const letter of ['B', 'C', 'D', 'E']) {
      const setLetter = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
        token: teacherToken,
        body: { descriptive_grade: letter },
      });
      assert(
        setLetter.status === 200 && setLetter.data?.grade?.descriptive_grade === letter,
        `descriptive_grade ${letter} accepted`
      );
    }

    const clearDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: null },
    });
    assert(
      clearDescriptive.status === 200 && clearDescriptive.data?.grade?.descriptive_grade === null,
      'descriptive_grade: null clears the column'
    );

    const lowercase = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: 'a' },
    });
    assert(
      lowercase.status === 400 && /uppercase/i.test(lowercase.data?.message || ''),
      "Lowercase 'a' rejected, message mentions uppercase"
    );

    const invalidLetter = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: 'F' },
    });
    assert(invalidLetter.status === 400, "Invalid letter 'F' rejected");

    const missingField = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: teacherToken,
      body: {},
    });
    assert(missingField.status === 400, 'Missing descriptive_grade field rejected');

    const onNumericalGrade = await request('PATCH', `/api/grades/${outOfScopeGradeId}/descriptive`, {
      token: adminToken,
      body: { descriptive_grade: 'A' },
    });
    assert(
      onNumericalGrade.status === 400,
      'PATCH /:id/descriptive against a Grade 5 (numerical) grade is rejected with 400'
    );

    const componentOnDescriptive = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Should still be rejected' },
    });
    assert(
      componentOnDescriptive.status === 400,
      'POST /:id/components against the Grade 1 grade is still 400 — the other side of the gate, re-asserted here'
    );

    const outOfScopeDescriptive = await request('PATCH', `/api/grades/${outOfScopeGradeId}/descriptive`, {
      token: teacherToken,
      body: { descriptive_grade: 'A' },
    });
    assert(
      outOfScopeDescriptive.status === 404,
      'Out-of-scope teacher (TCH-001 has no assignment for Grade 5) gets 404 on PATCH /:id/descriptive'
    );

    const parentDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: parentToken,
      body: { descriptive_grade: 'A' },
    });
    assert(parentDescriptive.status === 403, 'Parent cannot set a descriptive grade');

    const adminDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: adminToken,
      body: { descriptive_grade: 'C' },
    });
    assert(
      adminDescriptive.status === 200 && adminDescriptive.data?.grade?.descriptive_grade === 'C',
      'Admin succeeds on any grade, unscoped'
    );

    // --- Component edit/delete and lock (Stage G2e) ---
    // A dedicated fixture, built up to FULL completion (WW+PT+EX all
    // present, a real non-null Initial Grade and Term Grade) before any
    // edit/delete runs — so deleting the last WW component later
    // demonstrates a genuine reversion from a real computed value back
    // to NULL, not a trivial "was already null, stays null" check.
    console.log('\nComponent edit/delete and lock (Stage G2e):');

    const editDeleteCreate = await request('POST', '/api/grades', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathGrade6Id, term: 2, school_year: schoolYear },
    });
    const editDeleteGradeId = editDeleteCreate.data?.grade?.id;
    if (editDeleteGradeId) createdGradeIds.push(editDeleteGradeId);
    requireFixture(editDeleteCreate.status === 201, 'Fixture: a fresh grade row for edit/delete/lock tests', why(editDeleteCreate));

    const wwA = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 40, max_score: 50, label: 'WW1' },
    });
    const wwAId = wwA.data?.component?.id;

    const wwB = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 30, max_score: 50, label: 'WW2' },
    });
    const wwBId = wwB.data?.component?.id;
    assert(
      wwB.status === 201 && num(wwB.data?.grade?.ww_percentage) === 70.0,
      `Fixture: WW 40/50 + 30/50 -> ww_percentage 70.00 (got ${wwB.data?.grade?.ww_percentage})`
    );

    const ptFixture = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 90, max_score: 100, label: 'PT1' },
    });
    const ptComponentId = ptFixture.data?.component?.id;
    assert(
      ptFixture.status === 201 && num(ptFixture.data?.grade?.pt_percentage) === 90.0,
      `Fixture: PT 90/100 -> pt_percentage 90.00 (got ${ptFixture.data?.grade?.pt_percentage})`
    );

    await request('PATCH', `/api/grades/${editDeleteGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 80, st1_max: 100, st2_score: 70, st2_max: 100 },
    });
    const examComplete = await request('PATCH', `/api/grades/${editDeleteGradeId}/exam`, {
      token: teacherToken,
      body: { te_score: 90, te_max: 100 },
    });
    assert(
      examComplete.status === 200 && num(examComplete.data?.grade?.ex_percentage) === 81.0,
      `Fixture: EX (80/100, 70/100, 90/100) -> ex_percentage 81.00 = (80x0.30)+(70x0.30)+(90x0.40) (got ${examComplete.data?.grade?.ex_percentage})`
    );
    assert(
      num(examComplete.data?.grade?.initial_grade) === 83.3,
      `Fixture complete: Initial Grade 83.30 = ww_weighted(14.00) + pt_weighted(45.00) + ex_weighted(24.30) (got ${examComplete.data?.grade?.initial_grade})`
    );

    // --- Edit ---
    const editScore = await request('PUT', `/api/grades/${editDeleteGradeId}/components/${wwAId}`, {
      token: teacherToken,
      body: { score: 45 },
    });
    assert(
      editScore.status === 200 && num(editScore.data?.grade?.ww_percentage) === 75.0,
      `Edit component score 40->45: ww_percentage recomputes to 75.00 = (45+30)/100 (got ${editScore.data?.grade?.ww_percentage})`
    );
    assert(
      num(editScore.data?.grade?.initial_grade) === 84.3,
      `Initial Grade recomputes to 84.30 = ww_weighted(15.00) + pt_weighted(45.00) + ex_weighted(24.30) (got ${editScore.data?.grade?.initial_grade})`
    );

    const editLabelOnly = await request('PUT', `/api/grades/${editDeleteGradeId}/components/${wwAId}`, {
      token: teacherToken,
      body: { label: 'WW1 (corrected)', date_recorded: '2026-09-01' },
    });
    assert(
      editLabelOnly.status === 200 && num(editLabelOnly.data?.grade?.ww_percentage) === 75.0,
      'Editing label/date_recorded only leaves the computation unchanged'
    );
    assert(editLabelOnly.data?.component?.label === 'WW1 (corrected)', 'The label actually sent is applied');

    const editTypeChange = await request('PUT', `/api/grades/${editDeleteGradeId}/components/${wwAId}`, {
      token: teacherToken,
      body: { type: 'PT' },
    });
    assert(editTypeChange.status === 400, 'Changing type on an existing component is rejected');

    const componentWrongGrade = await request('PUT', `/api/grades/${grade1Id}/components/${ptComponentId}`, {
      token: adminToken,
      body: { score: 1 },
    });
    assert(componentWrongGrade.status === 404, 'componentId belonging to a different grade returns 404');

    const componentNonexistent = await request('PUT', `/api/grades/${editDeleteGradeId}/components/999999`, {
      token: adminToken,
      body: { score: 1 },
    });
    assert(componentNonexistent.status === 404, 'Nonexistent componentId returns 404');

    // --- Delete ---
    const deleteOneOfTwo = await request('DELETE', `/api/grades/${editDeleteGradeId}/components/${wwBId}`, {
      token: teacherToken,
    });
    assert(
      deleteOneOfTwo.status === 200 && num(deleteOneOfTwo.data?.grade?.ww_percentage) === 90.0,
      `Deleting one of two WW components: ww_percentage recomputes to the remaining one alone, 90.00 = 45/50 (got ${deleteOneOfTwo.data?.grade?.ww_percentage})`
    );

    const deleteLastWw = await request('DELETE', `/api/grades/${editDeleteGradeId}/components/${wwAId}`, {
      token: teacherToken,
    });
    assert(
      deleteLastWw.status === 200 &&
        deleteLastWw.data?.grade?.ww_percentage === null &&
        deleteLastWw.data?.grade?.initial_grade === null &&
        deleteLastWw.data?.grade?.term_grade === null,
      'Deleting the LAST WW component reverts ww_percentage, initial_grade, AND term_grade to NULL — a real reversion from 87.30, not a trivial already-null case'
    );

    // --- Lock ---
    console.log('\nLock:');

    const teacherLocks = await request('PATCH', `/api/grades/${editDeleteGradeId}/lock`, {
      token: teacherToken,
      body: { is_locked: true },
    });
    assert(teacherLocks.status === 403, 'Teacher cannot lock a grade');

    const parentLocks = await request('PATCH', `/api/grades/${editDeleteGradeId}/lock`, {
      token: parentToken,
      body: { is_locked: true },
    });
    assert(parentLocks.status === 403, 'Parent cannot lock a grade');

    const adminLocks = await request('PATCH', `/api/grades/${editDeleteGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    assert(
      adminLocks.status === 200 && num(adminLocks.data?.grade?.is_locked) === 1,
      `Admin locks a grade with initial_grade NULL -> 200, is_locked 1 (got ${adminLocks.data?.grade?.is_locked})`
    );

    // Locking an already-locked grade: still 200 (the requested state holds)
    // but nothing changed, so no update_grade_lock entry — the log used to
    // read "from 1 to 1". Scoped to this run's own grade id.
    const countLockLogs = async (gradeId) => {
      const [rows] = await withDb((conn) =>
        conn.query("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'update_grade_lock' AND description LIKE ?", [
          `Set is_locked for grade #${gradeId} from %`,
        ])
      );
      return Number(rows[0].c);
    };
    const lockLogsBefore = await countLockLogs(editDeleteGradeId);
    const adminLocksAgain = await request('PATCH', `/api/grades/${editDeleteGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    assert(
      adminLocksAgain.status === 200 &&
        num(adminLocksAgain.data?.grade?.is_locked) === 1 &&
        /already locked/.test(adminLocksAgain.data?.message || ''),
      'Locking an already-locked grade is 200 and says nothing changed'
    );
    assert(
      (await countLockLogs(editDeleteGradeId)) === lockLogsBefore,
      'That no-op writes no update_grade_lock entry'
    );

    const postOnLocked = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 1, max_score: 1, label: 'Should be 403' },
    });
    assert(postOnLocked.status === 403, 'POST /:id/components on a locked grade is 403');

    const examOnLocked = await request('PATCH', `/api/grades/${editDeleteGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 1, st1_max: 1 },
    });
    assert(examOnLocked.status === 403, 'PATCH /:id/exam on a locked grade is 403');

    const editOnLocked = await request('PUT', `/api/grades/${editDeleteGradeId}/components/${ptComponentId}`, {
      token: teacherToken,
      body: { score: 1 },
    });
    assert(editOnLocked.status === 403, 'PUT .../components/:componentId on a locked grade is 403');

    const deleteOnLocked = await request('DELETE', `/api/grades/${editDeleteGradeId}/components/${ptComponentId}`, {
      token: teacherToken,
    });
    assert(deleteOnLocked.status === 403, 'DELETE .../components/:componentId on a locked grade is 403');

    const adminUnlocks = await request('PATCH', `/api/grades/${editDeleteGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: false },
    });
    assert(
      adminUnlocks.status === 200 && num(adminUnlocks.data?.grade?.is_locked) === 0,
      'Admin unlocks the grade'
    );

    const postAfterUnlock = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 20, max_score: 20, label: 'After unlock' },
    });
    assert(postAfterUnlock.status === 201, 'Writes work again after unlocking');

    // Grade 1 (descriptive) row already exists with initial_grade always
    // NULL — locking it is exactly the case a naive "initial_grade IS NOT
    // NULL" completeness gate would have permanently broken.
    const lockDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    assert(
      lockDescriptive.status === 200 && num(lockDescriptive.data?.grade?.is_locked) === 1,
      'Locking a Grade 1 descriptive row (initial_grade always NULL) succeeds — no completeness gate blocks it'
    );

    const descriptiveOnLocked = await request('PATCH', `/api/grades/${grade1DescriptiveId}/descriptive`, {
      token: adminToken,
      body: { descriptive_grade: 'A' },
    });
    assert(descriptiveOnLocked.status === 403, 'PATCH /:id/descriptive on a locked grade is 403');

    // --- Stage G3: GET endpoints ---
    console.log('\nGET /api/grades (list, scoped):');

    const unauthList = await request('GET', '/api/grades');
    assert(unauthList.status === 401, 'Unauthenticated GET / returns 401');

    const badTermFilter = await request('GET', '/api/grades?term=5', { token: adminToken });
    assert(badTermFilter.status === 400, 'GET / with invalid term filter (5) returns 400');

    const badSchoolYearFilter = await request('GET', '/api/grades?school_year=2026', { token: adminToken });
    assert(badSchoolYearFilter.status === 400, 'GET / with malformed school_year filter returns 400');

    const fourFilters = await request(
      'GET',
      `/api/grades?student_id=${marwinId}&subject_id=${mathGrade6Id}&term=1&school_year=${schoolYear}`,
      { token: adminToken }
    );
    assert(
      fourFilters.status === 200 && fourFilters.data?.grades?.length === 1 && fourFilters.data.grades[0].id === grade1Id,
      `All four filters together return exactly the one matching row, keyed on the same fields as uq_grade_record (got ${fourFilters.data?.grades?.length} rows)`
    );

    const listNoComponents = await request('GET', '/api/grades', { token: adminToken });
    assert(
      listNoComponents.status === 200 &&
        listNoComponents.data?.grades?.length > 0 &&
        listNoComponents.data.grades.every((row) => row.grade_components === undefined),
      'GET / list response never includes grade_components on any row'
    );

    const teacherList = await request('GET', '/api/grades', { token: teacherToken });
    const teacherListIds = (teacherList.data?.grades || []).map((row) => row.id);
    assert(
      teacherList.status === 200 && teacherListIds.includes(scienceGradeId) && !teacherListIds.includes(outOfScopeGradeId),
      'Teacher unfiltered GET / includes view-scope rows (Science, same section, different subject) but excludes fully out-of-scope rows (Jea, different section)'
    );

    const parentList = await request('GET', '/api/grades', { token: parentToken });
    assert(
      parentList.status === 200 &&
        parentList.data?.grades?.length > 0 &&
        parentList.data.grades.every((row) => row.student_id === marwinId),
      'Parent unfiltered GET / returns only rows for their own child'
    );

    const parentExplicitOtherStudent = await request('GET', `/api/grades?student_id=${jeaId}`, { token: parentToken });
    assert(parentExplicitOtherStudent.status === 403, 'Parent explicitly requesting a different student_id via GET / gets 403');

    console.log('\nGET /api/grades/:id (detail, with components):');

    const invalidIdGet = await request('GET', '/api/grades/abc', { token: adminToken });
    assert(invalidIdGet.status === 400, 'GET /:id with a non-numeric id returns 400');

    const nonexistentIdGet = await request('GET', '/api/grades/999999', { token: adminToken });
    assert(nonexistentIdGet.status === 404, 'GET /:id with a nonexistent id returns 404');

    const grade1Detail = await request('GET', `/api/grades/${grade1Id}`, { token: adminToken });
    assert(grade1Detail.status === 200 && grade1Detail.data?.grade?.id === grade1Id, 'GET /:id returns the grade record');
    assert(
      Array.isArray(grade1Detail.data?.grade_components) && grade1Detail.data.grade_components.length > 0,
      'GET /:id includes grade_components as a non-empty array (this grade has real WW/PT rows)'
    );
    assert(
      grade1Detail.data?.descriptor?.descriptor === 'Advancing',
      `GET /:id includes the qualitative descriptor for a numerical term_grade (TG 90 -> Advancing) (got ${grade1Detail.data?.descriptor?.descriptor})`
    );

    const teacherViewsScience = await request('GET', `/api/grades/${scienceGradeId}`, { token: teacherToken });
    assert(
      teacherViewsScience.status === 200 && teacherViewsScience.data?.grade?.id === scienceGradeId,
      'Teacher within view-scope (same section) sees a Science grade via GET /:id even though they do not teach it — 200, not 404'
    );

    const teacherViewsOutOfScope = await request('GET', `/api/grades/${outOfScopeGradeId}`, { token: teacherToken });
    assert(teacherViewsOutOfScope.status === 404, 'Teacher fully out of scope (different section) gets 404 on GET /:id');

    const parentViewsOwn = await request('GET', `/api/grades/${grade1Id}`, { token: parentToken });
    assert(
      parentViewsOwn.status === 200 && parentViewsOwn.data?.grade?.id === grade1Id,
      "Parent sees their own child's grade via GET /:id"
    );

    const parentViewsOther = await request('GET', `/api/grades/${outOfScopeGradeId}`, { token: parentToken });
    assert(parentViewsOther.status === 404, "Parent requesting another child's grade via GET /:id gets 404");

    console.log('\nGET /api/grades/student/:studentId (full report card):');

    const marwinReportCard = await request('GET', `/api/grades/student/${marwinId}`, { token: adminToken });
    assert(
      marwinReportCard.status === 200 && marwinReportCard.data?.school_year === schoolYear,
      `GET /student/:studentId without ?school_year defaults to system_settings.academic_year (${schoolYear}) (got ${marwinReportCard.data?.school_year})`
    );
    assert(
      Array.isArray(marwinReportCard.data?.subjects) && marwinReportCard.data.subjects.length === 8,
      `Report card lists all 8 Grade 6 subjects (got ${marwinReportCard.data?.subjects?.length})`
    );
    const gmrcEntry = marwinReportCard.data?.subjects?.find((s) => s.subject_name === 'GMRC');
    assert(
      gmrcEntry &&
        gmrcEntry.terms?.[1] === null &&
        gmrcEntry.terms?.[2] === null &&
        gmrcEntry.terms?.[3] === null &&
        gmrcEntry.final_grade === null,
      'A subject with zero grade rows (GMRC) still appears on the report card, fully empty — not silently missing'
    );

    const parentReportCard = await request('GET', `/api/grades/student/${marwinId}`, { token: parentToken });
    assert(
      parentReportCard.status === 200 && parentReportCard.data?.student?.id === marwinId,
      "Parent sees their own child's full report card"
    );

    const parentOtherReportCard = await request('GET', `/api/grades/student/${jeaId}`, { token: parentToken });
    assert(parentOtherReportCard.status === 404, "Parent requesting another student's report card gets 404");

    const teacherReportCardOutOfScope = await request('GET', `/api/grades/student/${jeaId}`, { token: teacherToken });
    assert(
      teacherReportCardOutOfScope.status === 404,
      "Teacher fully out of scope gets 404 on GET /student/:studentId for a different section's student"
    );

    const adminReportCardJea = await request('GET', `/api/grades/student/${jeaId}`, { token: adminToken });
    assert(adminReportCardJea.status === 200, "Admin sees any student's report card, unscoped");

    const invalidStudentIdGet = await request('GET', '/api/grades/student/abc', { token: adminToken });
    assert(invalidStudentIdGet.status === 400, 'GET /student/:studentId with a non-numeric id returns 400');

    const nonexistentStudentGet = await request('GET', '/api/grades/student/999999', { token: adminToken });
    assert(nonexistentStudentGet.status === 404, 'GET /student/:studentId with a nonexistent student returns 404');

    // --- Grade 1 (descriptive mode): FG/GA genuinely inapplicable, not "incomplete" ---
    const grade1ReportCard = await request('GET', `/api/grades/student/${grade1StudentFixtureId}`, { token: adminToken });
    assert(
      grade1ReportCard.status === 200 && grade1ReportCard.data?.grading_mode === 'descriptive',
      'Grade 1 report card: grading_mode is descriptive'
    );
    const grade1MathEntry = grade1ReportCard.data?.subjects?.find((s) => s.subject_id === mathGrade1Id);
    assert(
      grade1MathEntry?.terms?.[1]?.descriptive_grade === 'C' && grade1MathEntry?.terms?.[1]?.term_grade === null,
      `Grade 1 Mathematics term 1 shows letter C, term_grade null (got descriptive_grade=${grade1MathEntry?.terms?.[1]?.descriptive_grade}, term_grade=${grade1MathEntry?.terms?.[1]?.term_grade})`
    );
    assert(
      grade1MathEntry?.terms?.[1]?.descriptor?.descriptor === 'Connecting',
      `Letter C resolves to descriptor Connecting on the report card (got ${grade1MathEntry?.terms?.[1]?.descriptor?.descriptor})`
    );
    assert(
      grade1MathEntry?.final_grade === null,
      'Grade 1 subject final_grade is null — not applicable for descriptive mode, not "incomplete"'
    );
    assert(
      grade1ReportCard.data?.general_average === null,
      'Grade 1 general_average is null — GA does not apply to descriptive mode'
    );

    // Seeded Grade 1 card (Nino / 1090001 / Mabait). READ-ONLY.
    // The throwaway Matipid student above is still the write target for
    // PATCH /:id/descriptive. Writing to this student would make the
    // suite able to break the 2026-09-18 demo the fixture exists for.
    console.log('\nSeeded Grade 1 fixture (read-only — do not write):');

    const g1ParentLogin = await login('1090001', 'Parent@2026');
    const g1ParentToken = g1ParentLogin.data?.token;
    const g1StudentId = g1ParentLogin.data?.user?.student_id;
    assert(
      g1ParentLogin.status === 200 && Number.isInteger(g1StudentId),
      'Seeded Grade 1 parent (1090001) can log in — the account is active, not pending'
    );

    const seededCard = await request('GET', `/api/grades/student/${g1StudentId}`, { token: g1ParentToken });
    assert(
      seededCard.status === 200 && seededCard.data?.grading_mode === 'descriptive',
      `Seeded report card: grading_mode is descriptive (got ${seededCard.data?.grading_mode})`
    );
    assert(
      Array.isArray(seededCard.data?.subjects) && seededCard.data.subjects.length === 5,
      `Seeded report card has 5 Grade 1 subjects (got ${seededCard.data?.subjects?.length})`
    );

    const mathCard = seededCard.data?.subjects?.find((s) => s.subject_name === 'Mathematics');
    assert(
      mathCard?.terms?.[1]?.descriptive_grade === 'A' &&
        mathCard?.terms?.[2]?.descriptive_grade === 'B' &&
        mathCard?.terms?.[3]?.descriptive_grade === 'C' &&
        mathCard?.terms?.[1]?.term_grade === null &&
        mathCard?.final_grade === null,
      'Mathematics is fully lettered A/B/C, term_grade null, final_grade null (N/A, not incomplete)'
    );

    const readingCard = seededCard.data?.subjects?.find((s) => s.subject_name === 'Reading');
    assert(
      readingCard?.terms?.[1]?.descriptive_grade === 'D' &&
        readingCard?.terms?.[2]?.descriptive_grade === 'E' &&
        readingCard?.terms?.[3] === null,
      'Reading has terms 1-2 lettered and term 3 null — the Pending cell on a descriptive card'
    );

    const untouchedNames = ['GMRC', 'Language', 'Makabansa'];
    const untouchedEmpty = untouchedNames.every((name) => {
      const entry = seededCard.data?.subjects?.find((s) => s.subject_name === name);
      return entry && entry.terms?.[1] === null && entry.terms?.[2] === null && entry.terms?.[3] === null;
    });
    assert(untouchedEmpty, 'GMRC, Language, and Makabansa are fully empty (Pending), not missing from the card');

    assert(
      seededCard.data?.general_average === null && seededCard.data?.general_average_descriptor === null,
      'Seeded Grade 1 general_average is null — inapplicable, not pending'
    );

    const g1ParentOther = await request('GET', `/api/grades/student/${marwinId}`, { token: g1ParentToken });
    assert(g1ParentOther.status === 404, 'Grade 1 parent requesting Marwin\'s report card gets 404');

    // --- Final Grade / General Average: NULL-until-complete at BOTH levels ---
    console.log('\nFinal Grade / General Average (NULL until every term / every subject exists):');

    // A REAL Grade 2 section. Since 2026-09-10 POST /students resolves
    // section_id against the sections table and 400s an invented name — the
    // handler is correct. This fixture said 'Test-GA', written when an
    // unmatched name was still accepted, and the suite was broken for three
    // days because that dispatch ran test:students only. No Grade 2 section
    // has an adviser or an assignment in the seed, so which one does not
    // affect isolation; the student is admin-created and deleted in finally.
    const gaFixtureLrn = `2${runId}`;
    const createGaStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: gaFixtureLrn, first_name: 'GA', last_name: 'Fixture', grade_level: 2, section: 'Masikap' },
    });
    gaStudentFixtureId = createGaStudent.data?.student?.id;
    requireFixture(
      createGaStudent.status === 201 && Number.isInteger(gaStudentFixtureId),
      'Fixture: a fresh Grade 2 student for FG/GA aggregation tests',
      why(createGaStudent)
    );

    const [grade2Subjects] = await withDb((conn) =>
      conn.query('SELECT id, name FROM subjects WHERE grade_level = 2 ORDER BY name ASC')
    );
    requireFixture(grade2Subjects.length === 5, `Fixture: Grade 2 has exactly 5 subjects (got ${grade2Subjects.length})`);

    // 4 of the 5 subjects: all three terms inserted directly (term_grade
    // 84, 90, 87 -> FG 87.00 each) — bypassing the WW/PT/EX write path on
    // purpose, since that arithmetic is already proven by the worked
    // examples above; only the FG/GA AGGREGATION is under test here.
    for (const subject of grade2Subjects.slice(0, 4)) {
      for (const [term, termGrade] of [
        [1, 84],
        [2, 90],
        [3, 87],
      ]) {
        const [result] = await withDb((conn) =>
          conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, ?, ?, ?)', [
            gaStudentFixtureId,
            subject.id,
            term,
            schoolYear,
            termGrade,
          ])
        );
        gaGradeIds.push(result.insertId);
      }
    }

    // The 5th subject is built up ONE TERM AT A TIME — this doubles as the
    // Final Grade null-with-one/null-with-two/populated-with-three
    // progression, and the last insert is also what flips General Average
    // from null to populated (every OTHER subject already has an FG).
    const fifthSubject = grade2Subjects[4];

    const [term1Insert] = await withDb((conn) =>
      conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, 1, ?, 80)', [
        gaStudentFixtureId,
        fifthSubject.id,
        schoolYear,
      ])
    );
    gaGradeIds.push(term1Insert.insertId);

    const oneTermReport = await request('GET', `/api/grades/student/${gaStudentFixtureId}`, { token: adminToken });
    const oneTermEntry = oneTermReport.data?.subjects?.find((s) => s.subject_id === fifthSubject.id);
    assert(
      oneTermReport.status === 200 && oneTermEntry?.final_grade === null,
      `Final Grade is null with only 1 of 3 terms present (got ${oneTermEntry?.final_grade})`
    );
    assert(
      oneTermReport.data?.general_average === null,
      'General Average is null while any subject (this one) still lacks a Final Grade'
    );

    const [term2Insert] = await withDb((conn) =>
      conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, 2, ?, 85)', [
        gaStudentFixtureId,
        fifthSubject.id,
        schoolYear,
      ])
    );
    gaGradeIds.push(term2Insert.insertId);

    const twoTermReport = await request('GET', `/api/grades/student/${gaStudentFixtureId}`, { token: adminToken });
    const twoTermEntry = twoTermReport.data?.subjects?.find((s) => s.subject_id === fifthSubject.id);
    assert(
      twoTermReport.status === 200 && twoTermEntry?.final_grade === null,
      `Final Grade is still null with 2 of 3 terms present (got ${twoTermEntry?.final_grade})`
    );
    assert(twoTermReport.data?.general_average === null, 'General Average still null with 2 of 3 terms on the last subject');

    const [term3Insert] = await withDb((conn) =>
      conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, 3, ?, 90)', [
        gaStudentFixtureId,
        fifthSubject.id,
        schoolYear,
      ])
    );
    gaGradeIds.push(term3Insert.insertId);

    const completeReport = await request('GET', `/api/grades/student/${gaStudentFixtureId}`, { token: adminToken });
    const completeEntry = completeReport.data?.subjects?.find((s) => s.subject_id === fifthSubject.id);
    assert(
      completeReport.status === 200 && num(completeEntry?.final_grade) === 85.0,
      `Final Grade populates once all 3 terms exist: 85.00 = (80+85+90)/3 by hand (got ${completeEntry?.final_grade})`
    );
    assert(
      num(completeReport.data?.general_average) === 86.6,
      `General Average populates once every subject has a Final Grade: 86.60 = (87.00x4 + 85.00)/5 by hand (got ${completeReport.data?.general_average})`
    );

    // --- DELETE /api/grades/:id (admin-only hard delete) ---
    // Throwaway student + shell only. Nino's five seeded rows (LRN
    // 1090001) are read-only — a suite that deletes them can break the
    // demo the fixture exists for.
    console.log('\nDELETE /api/grades/:id:');

    async function ninoGradeCount() {
      const [rows] = await withDb((conn) =>
        conn.query(
          "SELECT COUNT(*) AS n FROM grades g JOIN students s ON s.id = g.student_id WHERE s.lrn = '1090001'"
        )
      );
      return Number(rows[0].n);
    }

    assert((await ninoGradeCount()) === 5, "Nino's five seeded grade rows are intact before DELETE tests");

    const deleteFixtureLrn = `7${runId}`;
    const createDeleteStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: deleteFixtureLrn,
        first_name: 'Delete',
        last_name: 'Fixture',
        grade_level: 6,
        section: 'Malikhain',
      },
    });
    deleteStudentFixtureId = createDeleteStudent.data?.student?.id;
    requireFixture(
      createDeleteStudent.status === 201 && Number.isInteger(deleteStudentFixtureId),
      'Fixture: throwaway student for grade DELETE',
      why(createDeleteStudent)
    );

    const deleteShell = await request('POST', '/api/grades', {
      token: adminToken,
      body: {
        student_id: deleteStudentFixtureId,
        subject_id: mathGrade6Id,
        term: 1,
        school_year: schoolYear,
      },
    });
    const deleteGradeId = deleteShell.data?.grade?.id;
    if (deleteGradeId) createdGradeIds.push(deleteGradeId);
    requireFixture(deleteShell.status === 201 && Number.isInteger(deleteGradeId), 'Fixture: shell grade for DELETE', why(deleteShell));

    const deleteComponent = await request('POST', `/api/grades/${deleteGradeId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Cascade check' },
    });
    requireFixture(deleteComponent.status === 201, 'Fixture: one WW component so CASCADE can be asserted', why(deleteComponent));

    const [componentsBeforeDelete] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM grade_components WHERE grade_id = ?', [deleteGradeId])
    );
    assert(Number(componentsBeforeDelete[0].n) === 1, 'One component row exists before deleting the grade');

    const teacherDeletes = await request('DELETE', `/api/grades/${deleteGradeId}`, { token: teacherToken });
    assert(
      teacherDeletes.status === 403 && teacherDeletes.data?.message === 'Access denied.',
      `Teacher DELETE is 403 Access denied (got ${teacherDeletes.status} ${teacherDeletes.data?.message})`
    );

    const parentDeletes = await request('DELETE', `/api/grades/${deleteGradeId}`, { token: parentToken });
    assert(parentDeletes.status === 403, 'Parent DELETE is 403');

    const badIdDelete = await request('DELETE', '/api/grades/abc', { token: adminToken });
    assert(badIdDelete.status === 400, 'Non-numeric grade id is 400');

    const missingDelete = await request('DELETE', '/api/grades/999999', { token: adminToken });
    assert(
      missingDelete.status === 404 && missingDelete.data?.message === 'Grade record not found.',
      `Missing grade id is 404 (got ${missingDelete.status} ${missingDelete.data?.message})`
    );

    const lockThenDelete = await request('PATCH', `/api/grades/${deleteGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    assert(lockThenDelete.status === 200, 'Admin locks the throwaway grade before the locked-delete check');

    const lockedDelete = await request('DELETE', `/api/grades/${deleteGradeId}`, { token: adminToken });
    assert(
      lockedDelete.status === 403 &&
        lockedDelete.data?.message === 'This grade is locked and cannot be deleted.',
      `Locked grade DELETE is 403 naming delete, not the edit wording (got ${lockedDelete.status} ${lockedDelete.data?.message})`
    );

    const unlockThenDelete = await request('PATCH', `/api/grades/${deleteGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: false },
    });
    assert(unlockThenDelete.status === 200, 'Admin unlocks so the row can be deleted');

    const adminDeletes = await request('DELETE', `/api/grades/${deleteGradeId}`, { token: adminToken });
    assert(
      adminDeletes.status === 200 &&
        adminDeletes.data?.success === true &&
        adminDeletes.data?.message === 'Grade record deleted.' &&
        adminDeletes.data?.grade === undefined,
      `Admin DELETE returns message only (got ${adminDeletes.status} ${JSON.stringify(adminDeletes.data)})`
    );

    const idx = createdGradeIds.indexOf(deleteGradeId);
    if (idx !== -1) createdGradeIds.splice(idx, 1);

    const getAfterDelete = await request('GET', `/api/grades/${deleteGradeId}`, { token: adminToken });
    assert(getAfterDelete.status === 404, 'GET /:id after DELETE is 404');

    const [componentsAfterDelete] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM grade_components WHERE grade_id = ?', [deleteGradeId])
    );
    assert(
      Number(componentsAfterDelete[0].n) === 0,
      `grade_components cascade with the parent row (got ${componentsAfterDelete[0].n})`
    );

    assert((await ninoGradeCount()) === 5, "Nino's five seeded grade rows are untouched after DELETE tests");
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  if (err instanceof FixtureFailure) {
    console.error(`\nSTOPPED — ${err.message}\nEverything after this fixture depends on it, so the run did not continue.`);
    console.error(`\n${passed} passed, ${failed} failed (run incomplete)\n`);
  } else {
    console.error('Test runner error:', err);
  }
  process.exit(1);
});
