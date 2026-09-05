/**
 * Grades API tests — Stage G2b: POST /api/grades only. Creates a shell
 * row (every score/computed column NULL, is_locked 0) — no computation
 * happens here, utils/gradeComputation.js is not touched by this file
 * either. Scoping is the SUBJECT TEACHER's, via teacher_assignments
 * (teacher_id + subject_id + grade_level + section, all four), not
 * sections.adviser_id — a deliberate second scoping authority alongside
 * attendance/excuse-letter review's adviser-based one.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every grade row this script creates is tracked and deleted
 * in a finally block; the one throwaway inactive-student fixture is
 * deleted the same way — passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:grades
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
  assert(
    Number.isInteger(mathGrade6Id) && Number.isInteger(scienceGrade6Id) && Number.isInteger(mathGrade1Id),
    'Resolve three fixture subject ids (Math G6, Science G6, Math G1)'
  );

  const runId = String(Date.now()).slice(-8);
  const schoolYear = '2026-2027';
  const createdGradeIds = [];
  let inactiveStudentId;

  async function cleanup() {
    if (createdGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id IN (?)', [createdGradeIds]));
    }
    if (inactiveStudentId) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ?', [inactiveStudentId]));
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
