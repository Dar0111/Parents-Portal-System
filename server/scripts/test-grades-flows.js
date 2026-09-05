/**
 * Grades API tests — Stage G2b (POST /api/grades, row creation/scoping),
 * Stage G2c (POST /:id/components, PATCH /:id/exam — the first writes
 * that actually compute anything), and Stage G2d (PATCH /:id/descriptive
 * — Grade 1's manual letter grade, the other side of the numerical/
 * descriptive gate). The centerpiece is a full worked example driven
 * through the real HTTP endpoints, step by step, reusing the EXACT
 * numbers from utils/gradeComputation.js's own unit tests
 * (test-grade-computation.js) — a mismatch between that trusted pure
 * math and this wired-up HTTP result would surface as a wiring bug, not
 * a new, unverified expectation.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every grade row this script creates is tracked and deleted
 * in a finally block; the throwaway student fixtures (one inactive
 * Grade 6, one Grade 1 for the descriptive-mode tests) and the one
 * throwaway teacher_assignments row (TCH-001 -> Grade 1 Mathematics, for
 * the "subject teacher succeeds" descriptive test) are deleted the same
 * way — passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:grades
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;

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
    assert(
      createInactive.status === 201 && deactivate.status === 200,
      'Fixture: an inactive Grade 6 student for the active-status check'
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
    assert(mapehCreate.status === 201, 'Fixture: MAPEH grade row for the second worked example');
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
    assert(grade1DescriptiveCreate.status === 201, 'Fixture: a Grade 1 (descriptive-mode) grade row');

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

    // --- Out-of-scope teacher: 404, not 403 (no GET exists yet) ---
    console.log('\nOut-of-scope teacher:');

    const outOfScopeGradeId = adminCreates.data?.grade?.id; // Jea, Mathematics, Grade 5 — TCH-001 has no assignment there
    const outOfScopeComponent = await request('POST', `/api/grades/${outOfScopeGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Should be 404' },
    });
    assert(outOfScopeComponent.status === 404, 'Out-of-scope teacher gets 404 on POST /:id/components (no GET exists yet)');

    const outOfScopeExam = await request('PATCH', `/api/grades/${outOfScopeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 10, st1_max: 10 },
    });
    assert(outOfScopeExam.status === 404, 'Out-of-scope teacher gets 404 on PATCH /:id/exam (no GET exists yet)');

    const nonexistentGradeComponent = await request('POST', '/api/grades/999999/components', {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'x' },
    });
    assert(nonexistentGradeComponent.status === 404, 'Nonexistent grade id on POST /:id/components returns 404, even for admin');

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
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
