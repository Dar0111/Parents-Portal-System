/**
 * Grades API tests — Stage G2b (POST /api/grades, row creation/scoping),
 * Stage G2c (POST /:id/components, PATCH /:id/exam — the first writes
 * that actually compute anything), Grade 1's COMPUTED letter — which was
 * Stage G2d's hand-picked one through PATCH /:id/descriptive until the
 * school answered on 2026-09-22 and that endpoint was retired, so the
 * letter now comes out of the same four score writes every other grade
 * level uses — and Stage G2e (PUT/DELETE .../components/:componentId,
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

  // SLOT FIXTURES (CR1, 2026-09-22). Every component write now needs a
  // slot_id — a score with no column is a score nobody can find on the class
  // record. This suite is not testing slot MANAGEMENT (that is
  // test:class-record); it just needs a valid slot to hang scores on, so it
  // inserts one directly, keyed off the grade's own class so the API's
  // same-class check passes.
  //
  // Auto-numbering per (grade, type) keeps every call site a one-liner: the
  // suite writes several WW rows to one grade, and they must land in
  // DIFFERENT slots, because one slot holds at most one score per learner.
  const createdSlotIds = [];
  const slotCounters = new Map();

  async function makeSlot(gradeId, type, maxScore) {
    const [rows] = await withDb((conn) =>
      conn.query(
        `SELECT g.subject_id, g.term, g.school_year, s.grade_level, s.section
           FROM grades g JOIN students s ON s.id = g.student_id
          WHERE g.id = ? LIMIT 1`,
        [gradeId]
      )
    );
    const g = rows[0];
    if (!g) throw new Error(`makeSlot: grade #${gradeId} not found`);

    const counterKey = `${gradeId}-${type}`;
    const slotNo = (slotCounters.get(counterKey) || 0) + 1;
    slotCounters.set(counterKey, slotNo);

    const [result] = await withDb((conn) =>
      conn.query(
        `INSERT INTO assessment_slots
           (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE max_score = VALUES(max_score), id = LAST_INSERT_ID(id)`,
        [g.subject_id, g.grade_level, g.section, g.term, g.school_year, type, slotNo, maxScore]
      )
    );
    createdSlotIds.push(result.insertId);
    return result.insertId;
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
  // 11 digits + a one-digit prefix = a 12-digit LRN, the rule POST /students
  // enforces since 2026-09-18 — every throwaway student here goes through
  // that endpoint. runId stays 8 digits for login ids and labels.
  const lrnSuffix = String(Date.now()).slice(-11);
  const schoolYear = '2026-2027';
  const createdGradeIds = [];
  let inactiveStudentId;
  let grade1StudentFixtureId;
  let grade1TeacherAssignmentId;
  let gaStudentFixtureId;
  const gaGradeIds = [];
  let roundingStudentFixtureId;
  const roundingGradeIds = [];
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
    if (roundingGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id IN (?)', [roundingGradeIds]));
    }
    if (roundingStudentFixtureId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [roundingStudentFixtureId]));
    }
    if (deleteStudentFixtureId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [deleteStudentFixtureId]));
    }
    // SLOTS LAST, after EVERY grade delete above. The FK is ON DELETE
    // RESTRICT, so a slot still holding a component cannot be dropped —
    // deleting the grades cascades their components away first, which is
    // what frees the slots. Put this any earlier and cleanup fails on
    // whichever grade list had not been deleted yet.
    if (createdSlotIds.length) {
      await withDb((conn) => conn.query('DELETE FROM assessment_slots WHERE id IN (?)', [createdSlotIds]));
    }
  }

  try {
    // --- Fixture: an inactive student, Grade 6, for the active-status check ---
    const inactiveLrn = `6${lrnSuffix}`;
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

    // One slot, created once and scored below. Every refusal test on this
    // grade reuses it rather than making its own — see the note on the
    // parent test.
    const sharedWwSlot = await makeSlot(grade1Id, 'WW', 50);

    const parentComponent = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: parentToken,
      // REUSES the slot ww1 is about to score, rather than creating one of
      // its own. Since 2026-09-22 a USED slot with no score makes the whole
      // class Pending, so a refusal test that invents a column nobody ever
      // marks would blank every arithmetic assertion below it — which is
      // exactly what happened when this line made its own.
      body: { type: 'WW', score: 1, max_score: 1, label: 'x', slot_id: sharedWwSlot },
    });
    assert(parentComponent.status === 403, 'Parent cannot add a grade component');

    const parentExam = await request('PATCH', `/api/grades/${grade1Id}/exam`, {
      token: parentToken,
      body: { st1_score: 1, st1_max: 1 },
    });
    assert(parentExam.status === 403, 'Parent cannot set exam scores');

    const ww1 = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 45, max_score: 50, label: 'Quiz 1', slot_id: sharedWwSlot },
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
      body: { type: 'WW', score: 42, max_score: 50, label: 'Quiz 2', slot_id: await makeSlot(grade1Id, 'WW', 50) },
    });
    assert(
      ww2.status === 201 && num(ww2.data?.grade?.ww_percentage) === 87.0 && num(ww2.data?.grade?.initial_grade) === null,
      `After WW 42/50 added: ww_percentage 87.00 (recomputed from BOTH rows, not just the newest), initial_grade NULL (got ww_percentage=${ww2.data?.grade?.ww_percentage})`
    );

    await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 88, max_score: 100, label: 'Performance Task 1', slot_id: await makeSlot(grade1Id, 'PT', 100) },
    });
    const pt2 = await request('POST', `/api/grades/${grade1Id}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 92, max_score: 100, label: 'Performance Task 2', slot_id: await makeSlot(grade1Id, 'PT', 100) },
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
      body: { type: 'WW', score: 45, max_score: 50, label: 'Quiz 1', slot_id: await makeSlot(mapehGradeId, 'WW', 50) },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 42, max_score: 50, label: 'Quiz 2', slot_id: await makeSlot(mapehGradeId, 'WW', 50) },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'PT', score: 88, max_score: 100, label: 'Performance Task 1', slot_id: await makeSlot(mapehGradeId, 'PT', 100) },
    });
    await request('POST', `/api/grades/${mapehGradeId}/components`, {
      token: adminToken,
      body: { type: 'PT', score: 92, max_score: 100, label: 'Performance Task 2', slot_id: await makeSlot(mapehGradeId, 'PT', 100) },
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

    // One real slot, reused by every refusal below. They are all rejected by
    // field validation long before the slot is looked at, but sending a
    // VALID slot_id is what proves that — a bad one would make every
    // assertion here pass for the wrong reason.
    const validationSlotId = await makeSlot(validationGradeId, 'WW', 50);

    const negativeScore = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: -5, max_score: 50, label: 'Bad', slot_id: validationSlotId },
    });
    assert(negativeScore.status === 400, 'Negative score rejected');

    const zeroMax = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 5, max_score: 0, label: 'Bad', slot_id: validationSlotId },
    });
    assert(zeroMax.status === 400, 'max_score of 0 rejected');

    const bonusPoints = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 110, max_score: 100, label: 'Bonus points', slot_id: validationSlotId },
    });
    assert(
      bonusPoints.status === 201 && num(bonusPoints.data?.grade?.ww_percentage) === 110.0,
      `score > max_score (bonus points) is accepted, not clamped: ww_percentage 110.00 (got ${bonusPoints.data?.grade?.ww_percentage})`
    );

    // --- WHOLE NUMBERS ONLY (2026-09-22) ---
    // The school never awards half points, so 42.5/50 is not a value the
    // system should be able to hold. The gate is on the SERVER, at every
    // write path, not on a form — these endpoints are callable directly and
    // Expo will call them.
    console.log('\nWhole-number scores:');

    const decimalScore = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 42.5, max_score: 50, label: 'Half point', slot_id: validationSlotId },
    });
    assert(
      decimalScore.status === 400 && /whole number/i.test(decimalScore.data?.message || ''),
      `A decimal score is refused, and the message says why (${why(decimalScore)})`
    );
    // The REASON reaches the user, not just the rule (§2) — and the value
    // actually sent is named back, so a teacher can see what was rejected.
    assert(
      /half points/i.test(decimalScore.data?.message || '') && /42\.5/.test(decimalScore.data?.message || ''),
      `The refusal names the school's rule and the value sent (got "${decimalScore.data?.message}")`
    );

    const decimalMax = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 40, max_score: 50.5, label: 'Half point max', slot_id: validationSlotId },
    });
    assert(
      decimalMax.status === 400 && /max_score/.test(decimalMax.data?.message || ''),
      `A decimal max_score is refused, naming max_score (${why(decimalMax)})`
    );

    // ORDER MATTERS, and this is the assertion that proves it. -1.5 breaks
    // BOTH rules; the range check runs first because "0 or greater" is the
    // more fundamental thing wrong with it. If the whole-number check were
    // moved above it, this message would change and a negative decimal would
    // be reported as a rounding problem.
    const negativeDecimal = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: -1.5, max_score: 50, label: 'Both wrong', slot_id: validationSlotId },
    });
    assert(
      negativeDecimal.status === 400 && /0 or greater/.test(negativeDecimal.data?.message || ''),
      `A negative decimal is refused by the RANGE check first, not the whole-number one (got "${negativeDecimal.data?.message}")`
    );

    const decimalOnEdit = await request('PUT', `/api/grades/${validationGradeId}/components/${bonusPoints.data.component.id}`, {
      token: teacherToken,
      body: { score: 99.25 },
    });
    assert(
      decimalOnEdit.status === 400 && /whole number/i.test(decimalOnEdit.data?.message || ''),
      `PUT /components/:id refuses a decimal too — a correction is a write (${why(decimalOnEdit)})`
    );

    // ZERO IS A WHOLE NUMBER and must still be accepted. A learner who
    // scored nothing is a real record, and `Number.isInteger(0)` is true —
    // but a truthiness check would have dropped it, which is exactly the
    // kind of slip this asserts against.
    const zeroScore = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: {
        type: 'WW',
        score: 0,
        max_score: 20,
        label: 'Absent, scored zero',
        slot_id: await makeSlot(validationGradeId, 'WW', 20),
      },
    });
    assert(zeroScore.status === 201, `A score of 0 is still accepted — 0 is a whole number (${why(zeroScore)})`);

    const wholeStillWorks = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: {
        type: 'PT',
        score: 18,
        max_score: 20,
        label: 'Ordinary whole score',
        slot_id: await makeSlot(validationGradeId, 'PT', 20),
      },
    });
    assert(wholeStillWorks.status === 201, `An ordinary whole score still saves (${why(wholeStillWorks)})`);

    // --- slot_id is REQUIRED, and must belong to THIS class (CR1) ---
    // The grid is the only way a score gets a column, so a component with no
    // slot is a mark nobody can find on the class record.
    console.log('\nslot_id on the per-row component endpoints:');

    const noSlot = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 20, label: 'No slot' },
    });
    assert(
      noSlot.status === 400 && /slot_id is required/.test(noSlot.data?.message || ''),
      `POST /components without slot_id is 400 (${why(noSlot)})`
    );

    const missingSlot = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 20, label: 'Ghost slot', slot_id: 999999 },
    });
    assert(missingSlot.status === 404, `A slot_id that does not exist is 404 (${why(missingSlot)})`);

    // THE CROSS-CLASS CHECK, and it is the one that matters. `mapehGradeId`
    // is a different SUBJECT in this same suite, so its slots pass the FK
    // and pass every scope check — the teacher really is allowed to write to
    // both grades. Only the same-class rule stops the score landing in the
    // wrong subject's column, where the other class's next HPS change would
    // silently rewrite it.
    const foreignSlotId = await makeSlot(mapehGradeId, 'WW', 50);
    const crossClass = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 50, label: 'Wrong class', slot_id: foreignSlotId },
    });
    assert(
      crossClass.status === 400 && /different class/i.test(crossClass.data?.message || ''),
      `A slot from another class is refused, saying so (${why(crossClass)})`
    );

    // A WW score in a PT slot would compute under the wrong weight — caught
    // here rather than noticed on a report card.
    const wrongTypeSlotId = await makeSlot(validationGradeId, 'PT', 50);
    const wrongType = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 50, label: 'Wrong type', slot_id: wrongTypeSlotId },
    });
    assert(
      wrongType.status === 400 && /slot of its own type/i.test(wrongType.data?.message || ''),
      `A WW score in a PT slot is refused (${why(wrongType)})`
    );

    // slot_id may be MOVED on an edit (a mark typed into the wrong column is
    // a real correction) but never CLEARED — a component with no slot is
    // exactly the state CR1 removed.
    const clearSlot = await request('PUT', `/api/grades/${validationGradeId}/components/${wholeStillWorks.data.component.id}`, {
      token: teacherToken,
      body: { slot_id: null },
    });
    assert(
      clearSlot.status === 400 && /cannot be cleared/i.test(clearSlot.data?.message || ''),
      `PUT cannot clear slot_id (${why(clearSlot)})`
    );

    const movedSlotId = await makeSlot(validationGradeId, 'PT', 20);
    const movedSlot = await request('PUT', `/api/grades/${validationGradeId}/components/${wholeStillWorks.data.component.id}`, {
      token: teacherToken,
      body: { slot_id: movedSlotId },
    });
    assert(
      movedSlot.status === 200 && Number(movedSlot.data?.component?.slot_id) === movedSlotId,
      `PUT can MOVE a score to another slot of the same class and type (${why(movedSlot)})`
    );

    const movedCrossClass = await request('PUT', `/api/grades/${validationGradeId}/components/${wholeStillWorks.data.component.id}`, {
      token: adminToken,
      body: { slot_id: foreignSlotId },
    });
    assert(movedCrossClass.status === 400, `PUT cannot move a score into another class's slot (${why(movedCrossClass)})`);

    // AN UNUSED SLOT (no highest possible score) CANNOT TAKE A SCORE on
    // either per-row endpoint. The bulk endpoint refused this from the
    // start and these two did not — a rule that held on the path people
    // use and not on the path a direct caller or Expo would take. A score
    // parked in an unused slot is invisible in every total, because the
    // computation leaves such a slot out, while still occupying the
    // learner's one row for that column.
    const unusedSlotId = await withDb(async (conn) => {
      const [[g]] = await conn.query(
        `SELECT g.subject_id, g.term, g.school_year, s.grade_level, s.section
           FROM grades g JOIN students s ON s.id = g.student_id WHERE g.id = ?`,
        [validationGradeId]
      );
      // A **PT** slot, matching the component that is moved into it below.
      // A WW one would be refused on TYPE before the HPS check ran, and
      // both assertions would then pass for the wrong reason.
      const [res] = await conn.query(
        `INSERT INTO assessment_slots
           (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
         VALUES (?, ?, ?, ?, ?, 'PT', 19, NULL)`,
        [g.subject_id, g.grade_level, g.section, g.term, g.school_year]
      );
      createdSlotIds.push(res.insertId);
      return res.insertId;
    });

    const postIntoUnused = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 5, max_score: 10, label: 'Into an unused slot', slot_id: unusedSlotId },
    });
    assert(
      postIntoUnused.status === 400 && /highest possible score/i.test(postIntoUnused.data?.message || ''),
      `POST into an UNUSED slot is refused (${why(postIntoUnused)})`
    );

    const moveIntoUnused = await request('PUT', `/api/grades/${validationGradeId}/components/${wholeStillWorks.data.component.id}`, {
      token: teacherToken,
      body: { slot_id: unusedSlotId },
    });
    assert(
      moveIntoUnused.status === 400 && /highest possible score/i.test(moveIntoUnused.data?.message || ''),
      `PUT cannot MOVE a score into an unused slot either (${why(moveIntoUnused)})`
    );

    // label is OPTIONAL now and the column is nullable: a slot-backed row
    // renders the slot's display_label instead, so storing a copy of it on
    // the row would be a snapshot that goes stale the moment it is renamed.
    const noLabel = await request('POST', `/api/grades/${validationGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 12, max_score: 20, slot_id: await makeSlot(validationGradeId, 'WW', 20) },
    });
    assert(
      noLabel.status === 201 && noLabel.data?.component?.label === null,
      `label may be omitted and stores NULL (${why(noLabel)})`
    );

    // ...and the read endpoint resolves what to SHOW, so no client has to.
    // The expected text is built from the slot row as STORED, not from a
    // number typed into this test: makeSlot auto-numbers, so a hardcoded
    // "Written Work 5" would break every time an earlier slot is added and
    // would be asserting the test's own bookkeeping rather than the server's
    // fallback. Reading slot_no back is not circular — it is data, not the
    // function under test.
    const [[noLabelSlot]] = await withDb((conn) =>
      conn.query('SELECT slot_no FROM assessment_slots WHERE id = ?', [noLabel.data.component.slot_id])
    );
    const withDisplay = await request('GET', `/api/grades/${validationGradeId}`, { token: teacherToken });
    const displayRow = withDisplay.data?.grade_components?.find((row) => row.id === noLabel.data.component.id);
    assert(
      displayRow?.display_label === `Written Work ${noLabelSlot.slot_no}`,
      `An unnamed slot resolves a display_label from its type and number (expected "Written Work ${noLabelSlot.slot_no}", got "${displayRow?.display_label}")`
    );

    // A NAMED slot wins over the fallback, and that is the whole reason the
    // column exists — the parent breakdown modal shows "Long quiz", not
    // "Written Work 3".
    await withDb((conn) =>
      conn.query('UPDATE assessment_slots SET name = ? WHERE id = ?', ['Long quiz', noLabel.data.component.slot_id])
    );
    const withName = await request('GET', `/api/grades/${validationGradeId}`, { token: teacherToken });
    const namedRow = withName.data?.grade_components?.find((row) => row.id === noLabel.data.component.id);
    assert(
      namedRow?.display_label === 'Long quiz',
      `A named slot's name is the display_label (got "${namedRow?.display_label}")`
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

    // EVERY ONE OF THE SIX, not a sample. The check is a loop over six named
    // fields, and the way a loop like that fails is by omitting one entry —
    // which sampling two of them would never find.
    for (const field of ['st1_score', 'st1_max', 'st2_score', 'st2_max', 'te_score', 'te_max']) {
      const isMax = field.endsWith('_max');
      // Both fields of the pair are sent so the request cannot be refused by
      // the pair rules above before it reaches the whole-number check.
      const pairField = isMax ? field.replace('_max', '_score') : field.replace('_score', '_max');
      const decimalExam = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
        token: teacherToken,
        body: { [field]: 15.5, [pairField]: 20 },
      });
      assert(
        decimalExam.status === 400 &&
          /whole number/i.test(decimalExam.data?.message || '') &&
          decimalExam.data.message.startsWith(field),
        `PATCH /:id/exam refuses a decimal ${field}, and names that field (got "${decimalExam.data?.message}")`
      );
    }

    const wholeExamStillWorks = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 18, st1_max: 20 },
    });
    assert(wholeExamStillWorks.status === 200, `Whole exam scores still save (${why(wholeExamStillWorks)})`);

    // Clearing a sub-test sends an explicit null, which is not a score and
    // must skip the whole-number check rather than be refused by it.
    const clearStillWorks = await request('PATCH', `/api/grades/${examEdgeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: null },
    });
    assert(
      clearStillWorks.status === 200 && clearStillWorks.data?.grade?.ex_st1 === null,
      `An explicit null still clears a sub-test — null is not a decimal (${why(clearStillWorks)})`
    );

    // --- Descriptive mode + transaction atomicity ---
    console.log('\nDescriptive mode (Grade 1) + atomicity:');

    const grade1FixtureLrn = `1${lrnSuffix}`;
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

    // A GRADE 1 ROW NOW ACCEPTS SCORES (2026-09-22). These four assertions
    // used to assert the exact opposite — a 400 with "record a letter
    // instead" — because the letter was believed to be a manual judgment.
    // The school answered that it is computed (GRADING_SPEC §6a), so the
    // write path is the same one Grades 2-6 use and this block inverts.
    //
    // The worked example: every component at 90% of its max, so the Initial
    // Grade is 90.00 whatever the weights are (30/50/20 for Grade 1), which
    // bands to A — the top boundary, checked exactly rather than safely
    // inside the band.
    const g1Ww = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: adminToken,
      body: {
        type: 'WW',
        score: 45,
        max_score: 50,
        label: 'Quiz 1',
        slot_id: await makeSlot(grade1DescriptiveId, 'WW', 50),
      },
    });
    assert(g1Ww.status === 201, `A Grade 1 row ACCEPTS a WW component — it is computed now, not hand-picked (${why(g1Ww)})`);
    assert(
      g1Ww.data?.grade?.descriptive_grade === null && g1Ww.data?.grade?.initial_grade === null,
      'No letter yet with only WW recorded — NULL until every required input exists, the same rule as a numerical row'
    );

    const g1Pt = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: adminToken,
      body: {
        type: 'PT',
        score: 90,
        max_score: 100,
        label: 'Performance Task 1',
        slot_id: await makeSlot(grade1DescriptiveId, 'PT', 100),
      },
    });
    assert(g1Pt.status === 201, `A Grade 1 row ACCEPTS a PT component (${why(g1Pt)})`);
    assert(
      g1Pt.data?.grade?.descriptive_grade === null,
      'Still no letter with WW+PT but no Summative — all three components required'
    );

    const g1Exam = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: adminToken,
      body: { st1_score: 27, st1_max: 30, st2_score: 27, st2_max: 30, te_score: 36, te_max: 40 },
    });
    assert(g1Exam.status === 200, `A Grade 1 row ACCEPTS Summative scores through PATCH /:id/exam (${why(g1Exam)})`);
    assert(
      num(g1Exam.data?.grade?.initial_grade) === 90.0,
      `Grade 1 Initial Grade is computed from 30/50/20: every part at 90% gives 90.00 (got ${g1Exam.data?.grade?.initial_grade})`
    );
    assert(
      g1Exam.data?.grade?.descriptive_grade === 'A',
      `The letter is COMPUTED and banded from the raw score: 90.00 -> A, the exact band boundary (got ${g1Exam.data?.grade?.descriptive_grade})`
    );
    assert(
      g1Exam.data?.grade?.term_grade === null,
      `term_grade stays NULL on a descriptive row — the dual-mode invariant (got ${g1Exam.data?.grade?.term_grade})`
    );

    // NO TRANSMUTATION for Grade 1. An Initial Grade of 90.00 would transmute
    // to 92 for a numerical grade level, and 92 is still an A — so a test
    // that only checked the letter could not tell the two apart. Checking the
    // stored initial_grade is what proves the transmutation step was skipped.
    assert(
      num(g1Exam.data?.grade?.initial_grade) === 90.0 && g1Exam.data?.grade?.term_grade === null,
      'The RAW score is banded, not a transmuted one — initial_grade is 90.00 and no transmuted value was stored anywhere'
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
      // A slot for the OTHER class, created so the request fails on SCOPE
      // rather than on a missing slot_id — otherwise this would assert 404
      // for the wrong reason.
      body: {
        type: 'WW',
        score: 10,
        max_score: 10,
        label: 'Should be 404',
        slot_id: await makeSlot(outOfScopeGradeId, 'WW', 10),
      },
    });
    assert(outOfScopeComponent.status === 404, 'Fully out-of-scope teacher gets 404 on POST /:id/components (fails wide view-scope too)');

    const outOfScopeExam = await request('PATCH', `/api/grades/${outOfScopeGradeId}/exam`, {
      token: teacherToken,
      body: { st1_score: 10, st1_max: 10 },
    });
    assert(outOfScopeExam.status === 404, 'Fully out-of-scope teacher gets 404 on PATCH /:id/exam (fails wide view-scope too)');

    // A REAL slot id, from another class, on purpose. Body validation runs
    // before the grade is looked up, so with no slot_id this returns 400
    // ("slot_id is required") and the assertion would pass for the wrong
    // reason — it would no longer be testing the missing GRADE at all.
    // Sending a valid slot forces the request past every field check so the
    // 404 can only come from grade #999999 not existing.
    const nonexistentGradeComponent = await request('POST', '/api/grades/999999/components', {
      token: adminToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'x', slot_id: validationSlotId },
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
      body: {
        type: 'WW',
        score: 10,
        max_score: 10,
        label: 'Should be 403, not 404',
        slot_id: await makeSlot(scienceGradeId, 'WW', 10),
      },
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

    // PATCH /:id/descriptive is RETIRED (2026-09-22) — the route is gone, so
    // Express has nothing mounted at this path and answers 404 regardless of
    // who asks. Asserted rather than deleted, because "the endpoint no longer
    // exists" is itself the thing a future session needs proved: a letter is
    // computed from scores now, and a second writer for the same column would
    // be a way to set a letter the scores do not support.
    const retiredDescriptive = await request('PATCH', `/api/grades/${scienceGradeId}/descriptive`, {
      token: adminToken,
      body: { descriptive_grade: 'A' },
    });
    assert(
      retiredDescriptive.status === 404,
      `PATCH /:id/descriptive is retired — the route is unmounted, so even admin gets 404 (got ${retiredDescriptive.status})`
    );

    // --- Descriptive grading: COMPUTED (2026-09-22, replacing Stage G2d) ---
    // The school confirmed the Grade 1 letter is computed from WW 30 / PT 50 /
    // Summative 20, banded on the RAW weighted score (GRADING_SPEC §6a). What
    // this block used to assert — a teacher PATCHing a letter directly — is
    // gone with the endpoint; what it asserts now is the band table, every
    // boundary of it, driven through the real write path.
    console.log('\nDescriptive grading — computed letters and their bands:');

    // Fixture: give TCH-001 a real assignment for Grade 1 Mathematics in the
    // fixture student's section, so a SUBJECT TEACHER (not just admin) is
    // proved able to encode a Grade 1 score.
    const [assignmentResult] = await withDb((conn) =>
      conn.query('INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section) VALUES (?, ?, 1, ?)', [
        teacherId,
        mathGrade1Id,
        'Matipid',
      ])
    );
    grade1TeacherAssignmentId = assignmentResult.insertId;

    // EVERY BAND BOUNDARY, exactly — 90/80/75/65 and one below. A band table
    // is all boundaries, so a test that only sampled the middle of each band
    // would pass with every threshold off by one. Each case re-drives the
    // same row through the real endpoints: all five parts at the same
    // percentage, so the Initial Grade IS that percentage whatever the
    // weights are, which makes the expected letter checkable by hand.
    //
    // EVERY MAX IS 100 AND EVERY SCORE IS A WHOLE NUMBER. Two separate
    // reasons, both found by this test failing:
    //
    //   max 100 — scores are DECIMAL(5,2), so a sub-boundary case scored out
    //   of 50 stored 44.995 as 45.00 and the row computed 90.00, not 89.99.
    //   Out of 100 the score IS the percentage and nothing is rounded on the
    //   way in.
    //
    //   whole numbers — since 2026-09-22 the server REFUSES a decimal score
    //   (the school does not award half points), so the 89.9 / 79.9 / 74.9 /
    //   64.9 this block used to send is now a 400. The sub-boundary cases are
    //   89 / 79 / 74 / 64, which sit inside the same bands and still prove the
    //   thresholds. The finest a score can probe is now one whole percent —
    //   a consequence of the school's rule, not a weakening of the test.
    async function setGrade1Score(percent) {
      const ww = await request('PUT', `/api/grades/${grade1DescriptiveId}/components/${g1Ww.data.component.id}`, {
        token: teacherToken,
        body: { score: percent, max_score: 100 },
      });
      const pt = await request('PUT', `/api/grades/${grade1DescriptiveId}/components/${g1Pt.data.component.id}`, {
        token: teacherToken,
        body: { score: percent, max_score: 100 },
      });
      const exam = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
        token: teacherToken,
        body: {
          st1_score: percent,
          st1_max: 100,
          st2_score: percent,
          st2_max: 100,
          te_score: percent,
          te_max: 100,
        },
      });
      return { ww, pt, exam };
    }

    // Each boundary is hit EXACTLY (90/80/75/65) and each band is also
    // entered one whole percent below the next one up. Both halves matter: a
    // threshold off by one would pass a test that only sampled the middle of
    // each band.
    for (const [percent, letter] of [
      [90, 'A'], // exact boundary
      [89, 'B'],
      [80, 'B'], // exact boundary
      [79, 'C'],
      [75, 'C'], // exact boundary
      [74, 'D'],
      [65, 'D'], // exact boundary
      [64, 'E'],
    ]) {
      const { exam } = await setGrade1Score(percent);
      assert(
        exam.status === 200 && exam.data?.grade?.descriptive_grade === letter,
        `A raw weighted score of ${percent} bands to ${letter} (got ${exam.data?.grade?.descriptive_grade}, IG ${exam.data?.grade?.initial_grade})`
      );
    }

    // A SUBJECT TEACHER can encode Grade 1, not only admin — every write
    // above went through teacherToken, and this pins the scope explicitly.
    const g1TeacherWrite = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: teacherToken,
      body: { st1_score: 45, st1_max: 50 },
    });
    assert(g1TeacherWrite.status === 200, `The Grade 1 SUBJECT TEACHER can encode scores (${why(g1TeacherWrite)})`);

    // Clearing an input clears the letter, the same way it clears a number.
    const clearSummative = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: teacherToken,
      body: { st1_score: null, st1_max: null },
    });
    assert(
      clearSummative.status === 200 &&
        clearSummative.data?.grade?.descriptive_grade === null &&
        clearSummative.data?.grade?.initial_grade === null,
      'Clearing a Summative sub-score clears the LETTER too — null until every input exists, in both directions'
    );

    const parentDescriptive = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: parentToken,
      body: {
        type: 'WW',
        score: 10,
        max_score: 10,
        label: 'Parent should not',
        // The slot g1Ww already scores — a refusal test must not invent a
        // used column nobody marks (see the parent test on grade1Id).
        slot_id: g1Ww.data.component.slot_id,
      },
    });
    assert(parentDescriptive.status === 403, 'Parent cannot encode a Grade 1 score');

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
      body: { type: 'WW', score: 40, max_score: 50, label: 'WW1', slot_id: await makeSlot(editDeleteGradeId, 'WW', 50) },
    });
    const wwAId = wwA.data?.component?.id;

    const wwB = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 30, max_score: 50, label: 'WW2', slot_id: await makeSlot(editDeleteGradeId, 'WW', 50) },
    });
    const wwBId = wwB.data?.component?.id;
    assert(
      wwB.status === 201 && num(wwB.data?.grade?.ww_percentage) === 70.0,
      `Fixture: WW 40/50 + 30/50 -> ww_percentage 70.00 (got ${wwB.data?.grade?.ww_percentage})`
    );

    const ptFixture = await request('POST', `/api/grades/${editDeleteGradeId}/components`, {
      token: teacherToken,
      body: { type: 'PT', score: 90, max_score: 100, label: 'PT1', slot_id: await makeSlot(editDeleteGradeId, 'PT', 100) },
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
    // DELETING A SCORE FROM A USED COLUMN MAKES THE GROUP PENDING, and this
    // line used to expect 90.00 — "recomputes to the remaining one alone",
    // which was the behaviour before 2026-09-22. The column is still one the
    // class sat; removing this learner's mark means they are unmarked in it,
    // which is not the same as the assessment not existing. Deleting a score
    // and never typing it must read the same way.
    assert(
      deleteOneOfTwo.status === 200 && deleteOneOfTwo.data?.grade?.ww_percentage === null,
      `Deleting one of two WW components leaves that learner unmarked in a USED column, so ww_percentage is Pending (got ${deleteOneOfTwo.data?.grade?.ww_percentage})`
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
      body: { type: 'WW', score: 1, max_score: 1, label: 'Should be 403', slot_id: wwA.data.component.slot_id },
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
      body: { type: 'WW', score: 20, max_score: 20, label: 'After unlock', slot_id: await makeSlot(editDeleteGradeId, 'WW', 20) },
    });
    assert(postAfterUnlock.status === 201, 'Writes work again after unlocking');

    // The Grade 1 row is INCOMPLETE at this point — the block above cleared
    // its Summative, so initial_grade and descriptive_grade are both NULL.
    // That is exactly the case a naive "initial_grade IS NOT NULL"
    // completeness gate would have permanently broken, and it is still the
    // case now that Grade 1 computes: a term nobody finished must still be
    // lockable when the school closes the term.
    const lockDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    assert(
      lockDescriptive.status === 200 && num(lockDescriptive.data?.grade?.is_locked) === 1,
      'Locking an INCOMPLETE Grade 1 row succeeds — no completeness gate blocks it'
    );

    // The lock covers the Grade 1 write path too. It has to be asserted
    // against a SCORE write now: the letter has no endpoint of its own any
    // more, so a lock that only guarded PATCH /:id/descriptive would guard
    // nothing at all.
    const scoreOnLockedGrade1 = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: adminToken,
      body: { st1_score: 45, st1_max: 50 },
    });
    assert(scoreOnLockedGrade1.status === 403, 'A score write against a LOCKED Grade 1 row is 403');

    const componentOnLockedGrade1 = await request('POST', `/api/grades/${grade1DescriptiveId}/components`, {
      token: teacherToken,
      body: { type: 'WW', score: 10, max_score: 10, label: 'Locked', slot_id: g1Ww.data.component.slot_id },
    });
    assert(componentOnLockedGrade1.status === 403, 'A component write against a LOCKED Grade 1 row is 403');

    const unlockDescriptive = await request('PATCH', `/api/grades/${grade1DescriptiveId}/lock`, {
      token: adminToken,
      body: { is_locked: false },
    });
    assert(unlockDescriptive.status === 200, 'The Grade 1 row unlocks again');

    // Put the row back on a KNOWN letter for the report-card assertions
    // below, which read it. 75 out of 100 on every part is an Initial Grade
    // of exactly 75, the bottom of band C — so the letter the card shows is
    // computed from these three writes, not set by hand anywhere. Out of 100
    // rather than the 37.5/50 this used to send: half points are refused by
    // the server now.
    await request('PUT', `/api/grades/${grade1DescriptiveId}/components/${g1Ww.data.component.id}`, {
      token: teacherToken,
      body: { score: 75, max_score: 100 },
    });
    await request('PUT', `/api/grades/${grade1DescriptiveId}/components/${g1Pt.data.component.id}`, {
      token: teacherToken,
      body: { score: 75, max_score: 100 },
    });
    const restoreGrade1C = await request('PATCH', `/api/grades/${grade1DescriptiveId}/exam`, {
      token: teacherToken,
      body: { st1_score: 75, st1_max: 100, st2_score: 75, st2_max: 100, te_score: 75, te_max: 100 },
    });
    assert(
      restoreGrade1C.status === 200 &&
        restoreGrade1C.data?.grade?.descriptive_grade === 'C' &&
        num(restoreGrade1C.data?.grade?.initial_grade) === 75,
      `The Grade 1 row is back on a computed C at an Initial Grade of 75.00 (got ${restoreGrade1C.data?.grade?.descriptive_grade} / ${restoreGrade1C.data?.grade?.initial_grade})`
    );

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
    // THE PRINTED ORDER COMES FROM THE SERVER (CR3a, 2026-09-22). Before this
    // the API returned name ASC and a CLIENT constant reordered the card, so
    // this assertion could not have existed — the order was not in the
    // payload. Asserted as an exact sequence, not a set: the whole point is
    // the sequence, and "contains all 8" would pass on alphabetical.
    const g6Order = (marwinReportCard.data?.subjects ?? []).map((s) => s.subject_name);
    assert(
      g6Order.join(' > ') ===
        'English > Mathematics > Filipino > Araling Panlipunan > GMRC > Science > MAPEH > EPP',
      `Grade 6 report card prints in the SF9's order, not A-Z (got ${g6Order.join(' > ')})`
    );
    assert(
      g6Order[0] === 'English' && g6Order[1] === 'Mathematics',
      'The first two are English then Mathematics — alphabetical would start Araling Panlipunan, English'
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

    // -----------------------------------------------------------------------
    // THE ADVISER LEG OF THE READ SCOPE (CR3, 2026-09-22)
    // -----------------------------------------------------------------------
    // TCH-002 advises Grade 5 - Masigasig and holds ZERO teacher_assignments
    // rows — Jea's section. Until CR3 `teacherCanViewGrade` was
    // assignments-only, so this account got 404 on every grade in the section
    // it advises. The pair below is the contract: READ widened, ENCODE did
    // NOT. If a later dispatch widens encoding to advisers, the second
    // assertion is what fails, and it should.
    const adviserLogin = await request('POST', '/api/auth/login', {
      body: { login_id: 'TCH-002', password: 'Teacher@2026' },
    });
    assert(adviserLogin.status === 200, 'TCH-002 (adviser, zero assignments) logs in');
    const adviserToken = adviserLogin.data?.token;

    const adviserReadsCard = await request('GET', `/api/grades/student/${jeaId}`, { token: adviserToken });
    assert(
      adviserReadsCard.status === 200,
      "An ADVISER with no assignments now READS their section's report card (was 404 before CR3)",
      why(adviserReadsCard)
    );

    const adviserReadsList = await request('GET', `/api/grades?student_id=${jeaId}`, { token: adviserToken });
    assert(
      adviserReadsList.status === 200,
      'and the grades list for that learner, through the same widened predicate',
      why(adviserReadsList)
    );

    const adviserTriesToEncode = await request('POST', '/api/grades', {
      token: adviserToken,
      body: {
        student_id: jeaId,
        subject_id: await resolveSubjectId('Mathematics', 5),
        term: 1,
        school_year: schoolYear,
      },
    });
    assert(
      adviserTriesToEncode.status === 403,
      'but STILL CANNOT ENCODE — encode scope is the subject teacher, and advising is not teaching the subject',
      why(adviserTriesToEncode)
    );
    assert(
      adviserTriesToEncode.status !== 201 && adviserTriesToEncode.data?.success !== true,
      'and no grade row was created by that attempt'
    );

    const invalidStudentIdGet = await request('GET', '/api/grades/student/abc', { token: adminToken });
    assert(invalidStudentIdGet.status === 400, 'GET /student/:studentId with a non-numeric id returns 400');

    const nonexistentStudentGet = await request('GET', '/api/grades/student/999999', { token: adminToken });
    assert(nonexistentStudentGet.status === 404, 'GET /student/:studentId with a nonexistent student returns 404');

    // --- Grade 1 (descriptive mode): a COMPUTED letter per term, a computed
    // Final LETTER across three, and no General Average at all ---
    const grade1ReportCard = await request('GET', `/api/grades/student/${grade1StudentFixtureId}`, { token: adminToken });
    assert(
      grade1ReportCard.status === 200 && grade1ReportCard.data?.grading_mode === 'descriptive',
      'Grade 1 report card: grading_mode is descriptive'
    );
    const grade1MathEntry = grade1ReportCard.data?.subjects?.find((s) => s.subject_id === mathGrade1Id);
    assert(
      grade1MathEntry?.terms?.[1]?.descriptive_grade === 'C' && grade1MathEntry?.terms?.[1]?.term_grade === null,
      `Grade 1 Mathematics term 1 shows the COMPUTED letter C, term_grade null (got descriptive_grade=${grade1MathEntry?.terms?.[1]?.descriptive_grade}, term_grade=${grade1MathEntry?.terms?.[1]?.term_grade})`
    );
    assert(
      grade1MathEntry?.terms?.[1]?.descriptor?.descriptor === 'Connecting',
      `Letter C resolves to descriptor Connecting on the report card (got ${grade1MathEntry?.terms?.[1]?.descriptor?.descriptor})`
    );
    // A Final LETTER exists now, and it obeys the same null-until-complete
    // rule a Final Grade does. One term of three is not a card.
    assert(
      grade1MathEntry?.final_grade === null,
      `Grade 1 subject final_grade is null with 1 of 3 terms recorded — INCOMPLETE, which is a different reason from the one this line used to assert (got ${grade1MathEntry?.final_grade})`
    );
    // The one thing that IS still inapplicable rather than incomplete. There
    // is no General Average in Key Stage 1 at all — an average of letters is
    // not a number, and the school does not print one.
    assert(
      grade1ReportCard.data?.general_average === null,
      'Grade 1 general_average is null — there is NO General Average in Key Stage 1, complete card or not'
    );
    // THE RESPONSE CONTRACT — the whole top-level key set, in one assertion.
    // Its reason is STAGE 5: Expo will read this same payload with its own
    // client, and a key quietly added, renamed or dropped is the kind of
    // change that two independent consumers discover at different times. The
    // set does not vary by grading mode (the handler returns one object
    // literal), so asserting it once, here, covers both.
    //
    // THIS DOES NOT CATCH THE DV3 UNWRAP DEFECT and must not be read as
    // doing so: that defect was a key the CLIENT never asked for, while the
    // server returned it correctly. No server assertion can see it. The guard
    // for that lives in the client render proof.
    const cardKeys = Object.keys(grade1ReportCard.data || {}).sort();
    const expectedCardKeys = [
      'general_average',
      'general_average_descriptor',
      'grading_mode',
      'school_year',
      'student',
      'subjects',
      'success',
      'term_averages',
    ];
    assert(
      JSON.stringify(cardKeys) === JSON.stringify(expectedCardKeys),
      `Report card returns exactly the documented keys — the seven payload keys plus the success envelope (got ${JSON.stringify(cardKeys)})`
    );

    // term_averages (DV3): three keys ALWAYS present so a caller can render
    // three cells without checking, and all three null in descriptive mode
    // for the same reason GA is — an average of letters is not a number.
    const g1TermAverages = grade1ReportCard.data?.term_averages;
    assert(
      g1TermAverages !== undefined &&
        g1TermAverages !== null &&
        g1TermAverages[1] === null &&
        g1TermAverages[2] === null &&
        g1TermAverages[3] === null,
      `Grade 1 term_averages is present with all three terms null (got ${JSON.stringify(g1TermAverages)})`
    );

    // --- The Final LETTER: the average of the three terms' RAW scores ---
    // Term 1 is already a computed C at an Initial Grade of exactly 75.
    // Terms 2 and 3 go on now, at 89 and 92, so the three letters are C, B, A
    // and the Final is (75 + 89 + 92) / 3 = 85.333... -> 85.33 -> B.
    //
    // THE POINT OF THOSE NUMBERS: a Final computed by averaging the three
    // LETTERS would have to pick between them by some other rule, and any
    // such rule lands somewhere this one does not. The Final letter is banded
    // from the mean of the scores, never from the letters the terms display.
    for (const [term, percent] of [
      [2, 89],
      [3, 92],
    ]) {
      const create = await request('POST', '/api/grades', {
        token: adminToken,
        body: { student_id: grade1StudentFixtureId, subject_id: mathGrade1Id, term, school_year: schoolYear },
      });
      const id = create.data?.grade?.id;
      if (id) createdGradeIds.push(id);
      requireFixture(create.status === 201, `Fixture: Grade 1 Mathematics term ${term}`, why(create));

      // Out of 100 and whole, for the same two reasons as setGrade1Score
      // above: the score IS the percentage, and a decimal is refused.
      await request('POST', `/api/grades/${id}/components`, {
        token: adminToken,
        body: {
          type: 'WW',
          score: percent,
          max_score: 100,
          label: `Quiz T${term}`,
          slot_id: await makeSlot(id, 'WW', 100),
        },
      });
      await request('POST', `/api/grades/${id}/components`, {
        token: adminToken,
        body: {
          type: 'PT',
          score: percent,
          max_score: 100,
          label: `PT T${term}`,
          slot_id: await makeSlot(id, 'PT', 100),
        },
      });
      const exam = await request('PATCH', `/api/grades/${id}/exam`, {
        token: adminToken,
        body: {
          st1_score: percent,
          st1_max: 100,
          st2_score: percent,
          st2_max: 100,
          te_score: percent,
          te_max: 100,
        },
      });
      assert(
        exam.status === 200 && num(exam.data?.grade?.initial_grade) === percent,
        `Grade 1 Mathematics term ${term} computes an Initial Grade of ${percent}.00 (got ${exam.data?.grade?.initial_grade})`
      );
    }

    const g1FinalCard = await request('GET', `/api/grades/student/${grade1StudentFixtureId}`, { token: adminToken });
    const g1FinalMath = g1FinalCard.data?.subjects?.find((s) => s.subject_id === mathGrade1Id);
    assert(
      g1FinalMath?.terms?.[1]?.descriptive_grade === 'C' &&
        g1FinalMath?.terms?.[2]?.descriptive_grade === 'B' &&
        g1FinalMath?.terms?.[3]?.descriptive_grade === 'A',
      `The three terms read C, B, A (got ${g1FinalMath?.terms?.[1]?.descriptive_grade}, ${g1FinalMath?.terms?.[2]?.descriptive_grade}, ${g1FinalMath?.terms?.[3]?.descriptive_grade})`
    );
    assert(
      g1FinalMath?.final_grade === 'B',
      `The Final LETTER populates once all three terms exist: (75 + 89 + 92)/3 = 85.33 -> B by hand (got ${g1FinalMath?.final_grade})`
    );
    assert(
      g1FinalMath?.final_grade_descriptor?.descriptor === 'Benchmarking',
      `The Final letter carries its descriptor (got ${g1FinalMath?.final_grade_descriptor?.descriptor})`
    );
    // The Final is a LETTER, not a number — the two columns never swap, at
    // term level or at final level.
    assert(
      typeof g1FinalMath?.final_grade === 'string' &&
        g1FinalCard.data?.subjects?.every((s) => s.terms?.[1] === null || s.terms?.[1]?.term_grade === null),
      'The Grade 1 Final is a LETTER and no term on the card carries a numerical term_grade'
    );
    // STILL no General Average, on a card that now has a complete subject.
    // This is the assertion that separates "inapplicable" from "incomplete":
    // completeness arrived and the GA did not.
    assert(
      g1FinalCard.data?.general_average === null &&
        g1FinalCard.data?.general_average_descriptor === null &&
        g1FinalCard.data?.term_averages?.[1] === null,
      `A Grade 1 card with a COMPLETE subject still has no General Average and no term averages (got ${g1FinalCard.data?.general_average})`
    );

    // Seeded Grade 1 card (Nino / 1090001 / Mabait). READ-ONLY.
    // The throwaway Matipid student above is the only write target. Writing
    // to this student would make the suite able to break the demo fixture.
    //
    // These five rows are LEGACY: they were seeded with hand-picked letters
    // and no component or Summative scores at all, back when a teacher chose
    // the letter. They keep their letters — nothing rewrites a stored grade —
    // and the assertions below pin what that means now that the letter is
    // computed: a term cell still reads, and everything DERIVED from the
    // scores behind it is null, because there are no scores behind it.
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

    // Grade 1's order is PROVISIONAL — it is the class program, a timetable,
    // not a report card (CLAUDE.md → OPEN QUESTIONS). It is asserted anyway,
    // and deliberately: CR3a's promise was that moving the order out of the
    // client constant does not change what Nino's card looks like, and this
    // is what proves it. If the school gives a real Key Stage 1 order, this
    // assertion is EXPECTED to fail and should be updated with the seed —
    // it is not a regression guard against the school.
    const g1Order = (seededCard.data?.subjects ?? []).map((s) => s.subject_name);
    assert(
      g1Order.join(' > ') === 'Makabansa > Mathematics > GMRC > Reading and Literacy > Language',
      `Grade 1 card keeps its provisional class-program order (got ${g1Order.join(' > ')})`
    );

    const mathCard = seededCard.data?.subjects?.find((s) => s.subject_name === 'Mathematics');
    assert(
      mathCard?.terms?.[1]?.descriptive_grade === 'A' &&
        mathCard?.terms?.[2]?.descriptive_grade === 'B' &&
        mathCard?.terms?.[3]?.descriptive_grade === 'C' &&
        mathCard?.terms?.[1]?.term_grade === null,
      'Seeded Mathematics keeps its three hand-set letters A/B/C, term_grade null — a stored grade is never rewritten by a rule change'
    );
    // THE LEGACY CASE, and the reason it gets its own assertion: all three
    // terms ARE recorded here, so "incomplete" cannot explain the null. The
    // Final letter is the average of the three terms' Initial Grades, and
    // these rows have none — the letters were typed, not computed. A Final
    // letter invented from A/B/C would be a number the school never produced.
    assert(
      mathCard?.terms?.[1]?.initial_grade === null &&
        mathCard?.terms?.[2]?.initial_grade === null &&
        mathCard?.terms?.[3]?.initial_grade === null &&
        mathCard?.final_grade === null,
      `A legacy Grade 1 subject with all three letters and NO scores has final_grade null (got ${mathCard?.final_grade})`
    );

    // "Reading and Literacy", the school's own name — renamed from "Reading"
    // on 2026-09-22 by scripts/migrate-reading-and-literacy.js. The row was
    // UPDATEd in place, so these two letters are the same rows they always
    // were; a delete-and-reinsert would have cascaded them away.
    const readingCard = seededCard.data?.subjects?.find((s) => s.subject_name === 'Reading and Literacy');
    assert(
      readingCard?.terms?.[1]?.descriptive_grade === 'D' &&
        readingCard?.terms?.[2]?.descriptive_grade === 'E' &&
        readingCard?.terms?.[3] === null,
      'Reading and Literacy has terms 1-2 lettered and term 3 null — the Pending cell on a descriptive card'
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
    const gaFixtureLrn = `2${lrnSuffix}`;
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
    // term_averages (DV3) rides on this same progression, and it is the
    // point of the field: Term 1 is COMPLETE across all five subjects here
    // while the General Average below is still null, so the report card can
    // print a real number months before the final one exists.
    assert(
      num(oneTermReport.data?.term_averages?.[1]) === 83.2,
      `Term 1 average populates once every subject has term 1: 83.20 = (84.00x4 + 80.00)/5 by hand (got ${oneTermReport.data?.term_averages?.[1]})`
    );
    assert(
      oneTermReport.data?.term_averages?.[2] === null && oneTermReport.data?.term_averages?.[3] === null,
      'Terms 2 and 3 averages are null while the fifth subject has neither — null-until-complete, never a running average'
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
    assert(
      num(twoTermReport.data?.term_averages?.[2]) === 89.0 && twoTermReport.data?.term_averages?.[3] === null,
      `Term 2 average populates independently of term 3: 89.00 = (90.00x4 + 85.00)/5 by hand (got ${twoTermReport.data?.term_averages?.[2]})`
    );

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
    assert(
      num(completeReport.data?.term_averages?.[3]) === 87.6,
      `Term 3 average populates last: 87.60 = (87.00x4 + 90.00)/5 by hand (got ${completeReport.data?.term_averages?.[3]})`
    );
    // Cross-check, not a restatement: the three term averages and the
    // General Average are computed down two DIFFERENT paths — GA averages
    // the per-subject Final Grades, term_averages averages across subjects
    // within a term — and on a complete card they must agree. Computed by
    // hand: (83.20 + 89.00 + 87.60)/3 = 86.60, the GA asserted above.
    const termAvgMean = num(
      (
        (num(completeReport.data?.term_averages?.[1]) +
          num(completeReport.data?.term_averages?.[2]) +
          num(completeReport.data?.term_averages?.[3])) /
        3
      ).toFixed(2)
    );
    assert(
      termAvgMean === num(completeReport.data?.general_average),
      `The mean of the three term averages equals the General Average on a complete card (got ${termAvgMean} vs ${completeReport.data?.general_average})`
    );

    // --- ROUNDING: a whole-number Final Grade, a 2-decimal General Average ---
    // The fixture above cannot prove either rule: its term grades happen to
    // average to whole numbers (85 and 87), so it passed identically when
    // computeFinalGrade still used roundTo2 and the report card was printing
    // 89.33. These cases are built to land OFF a whole number on purpose.
    //
    // Eight subjects, so the General Average divides by 8 — the school's own
    // summary sheet case, 721/8 = 90.125 -> 90.13. Five subjects cannot
    // produce it: any sum of whole finals over 5 ends in .0/.2/.4/.6/.8 and
    // never needs rounding at the second decimal at all.
    //
    // Term grades are inserted directly, exactly as the FG/GA fixture above
    // does and for the same reason: the WW/PT/EX write path and the
    // transmutation lookup are already proven by the worked examples earlier
    // in this file, and only the read-time aggregation is under test here.
    // A Grade 6 section OTHER than Malikhain, so nothing touches Marwin.
    console.log('\nRounding — whole Final Grade, 2-decimal General Average:');

    // Prefix 3: 1, 2, 6 and 7 are taken by the other fixtures in this file.
    const roundingLrn = `3${lrnSuffix}`;
    const createRoundingStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn: roundingLrn, first_name: 'Rounding', last_name: 'Fixture', grade_level: 6, section: 'Maunlad' },
    });
    roundingStudentFixtureId = createRoundingStudent.data?.student?.id;
    requireFixture(
      createRoundingStudent.status === 201 && Number.isInteger(roundingStudentFixtureId),
      'Fixture: a fresh Grade 6 student for the rounding tests',
      why(createRoundingStudent)
    );

    const [grade6Subjects] = await withDb((conn) =>
      conn.query('SELECT id, name FROM subjects WHERE grade_level = 6 ORDER BY id ASC')
    );
    requireFixture(grade6Subjects.length === 8, `Fixture: Grade 6 has exactly 8 subjects (got ${grade6Subjects.length})`);

    // Subject 0 is the reported defect verbatim: Marwin's Mathematics was
    // 87 / 91 / 90, which is 268/3 = 89.333..., and the card read 89.33.
    // The other seven are chosen so the eight finals sum to exactly 721.
    const roundingPlan = [
      [87, 91, 90], // -> 89.333... -> 89
      [90, 90, 90], // -> 90
      [90, 90, 90],
      [90, 90, 90],
      [90, 90, 90],
      [90, 90, 90],
      [90, 90, 90],
      [92, 92, 92], // -> 92    89 + (90 x 6) + 92 = 721
    ];
    for (let i = 0; i < grade6Subjects.length; i += 1) {
      const [t1, t2, t3] = roundingPlan[i];
      for (const [term, termGrade] of [[1, t1], [2, t2], [3, t3]]) {
        const [result] = await withDb((conn) =>
          conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, ?, ?, ?)', [
            roundingStudentFixtureId,
            grade6Subjects[i].id,
            term,
            schoolYear,
            termGrade,
          ])
        );
        roundingGradeIds.push(result.insertId);
      }
    }

    const roundingReport = await request('GET', `/api/grades/student/${roundingStudentFixtureId}`, { token: adminToken });
    const mathLikeEntry = roundingReport.data?.subjects?.find((s) => s.subject_id === grade6Subjects[0].id);
    assert(
      roundingReport.status === 200 && num(mathLikeEntry?.final_grade) === 89,
      `Final Grade is a WHOLE number: (87+91+90)/3 = 89.333... -> 89, not 89.33 (got ${mathLikeEntry?.final_grade})`
    );
    assert(
      roundingReport.data.subjects.every((s) => Number.isInteger(num(s.final_grade))),
      `Every Final Grade on the card is a whole number (got ${JSON.stringify(roundingReport.data.subjects.map((s) => s.final_grade))})`
    );
    assert(
      num(roundingReport.data?.general_average) === 90.13,
      `General Average is 2 decimals over the ROUNDED finals: 721/8 = 90.125 -> 90.13, the school's own sheet (got ${roundingReport.data?.general_average})`
    );
    // Guards the half-up direction specifically. 90.125 rounded half-DOWN or
    // half-to-even would be 90.12, which is what a naive implementation and
    // several rounding libraries return.
    assert(
      num(roundingReport.data?.general_average) !== 90.12,
      'General Average rounds 90.125 UP to 90.13, never down to 90.12 (half-up, not half-to-even)'
    );

    // The half case at the Final Grade level, and the band it moves.
    // WORTH KNOWING: x.5 is UNREACHABLE from three whole term grades — three
    // integers can never average to .5 — so this uses decimal term grades.
    // That is not a contrived state: from SY 2027-2028 the transmutation
    // table has no rows, recomputeGrade falls back to term_grade = the
    // Initial Grade, and Initial Grades carry two decimals. See the
    // no-transmutation-row note in KNOWN_ISSUES.
    for (const id of roundingGradeIds.slice(0, 3)) {
      await withDb((conn) => conn.query('UPDATE grades SET term_grade = 89.50 WHERE id = ?', [id]));
    }
    const halfReport = await request('GET', `/api/grades/student/${roundingStudentFixtureId}`, { token: adminToken });
    const halfEntry = halfReport.data?.subjects?.find((s) => s.subject_id === grade6Subjects[0].id);
    assert(
      num(halfEntry?.final_grade) === 90,
      `A Final Grade of exactly 89.50 rounds half-UP to 90 (got ${halfEntry?.final_grade})`
    );
    assert(
      halfEntry?.final_grade_descriptor?.descriptor === 'Advancing',
      `The descriptor follows the ROUNDED Final Grade: 89.50 -> 90 -> Advancing, not Benchmarking (got ${halfEntry?.final_grade_descriptor?.descriptor})`
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

    const deleteFixtureLrn = `7${lrnSuffix}`;
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
      body: { type: 'WW', score: 10, max_score: 10, label: 'Cascade check', slot_id: await makeSlot(deleteGradeId, 'WW', 10) },
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

    await checkPage('/api/grades', adminToken, 'grades', { sort: 'term', field: 'term' });
    await checkPage('/api/grades', teacherToken, 'grades', { sort: 'subject', field: 'subject_name' });

    // C4: a filter narrows total to the filtered set.
    const termPage = await request('GET', '/api/grades?term=1&limit=200', { token: adminToken });
    assert(
      termPage.status === 200 &&
        (termPage.data?.grades || []).every((g) => g.term === 1) &&
        (termPage.data?.page?.has_more || termPage.data?.page?.total === termPage.data?.grades?.length),
      'GET /grades?term=1: every row matches and total is the filtered count'
    );
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
