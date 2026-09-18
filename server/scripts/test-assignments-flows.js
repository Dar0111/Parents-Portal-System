/**
 * Assignments + Subjects API tests — GET /subjects, GET /assignments,
 * POST /assignments, DELETE /assignments/:id.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every assignment this suite creates is tracked and deleted
 * in a finally block (direct SQL, not a remembered API call). Seeded
 * rows are never deleted — TCH-001's three Grade 6 Malikhain assignments
 * and TCH-003's five Grade 1 Mabait assignments stay put. The Grade 1
 * fixture's five grade rows are not touched.
 *
 * TCH-002's empty list is asserted as correct: that account's value is
 * being assignment-less. A mid-suite POST to it is cleaned up so the
 * invariant holds after.
 *
 * Usage: npm run test:assignments
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
  console.log(`\nParents Portal — Assignments + Subjects API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  const tch001 = await login('TCH-001', 'Teacher@2026');
  const tch001Token = tch001.data?.token;
  const tch001Id = tch001.data?.user?.id;
  assert(tch001.status === 200 && tch001Token, 'Teacher login (TCH-001)');

  const tch002 = await login('TCH-002', 'Teacher@2026');
  const tch002Token = tch002.data?.token;
  const tch002Id = tch002.data?.user?.id;
  assert(tch002.status === 200 && tch002Token, 'Teacher login (TCH-002, zero assignments)');

  const tch003 = await login('TCH-003', 'Teacher@2026');
  const tch003Token = tch003.data?.token;
  const tch003Id = tch003.data?.user?.id;
  assert(tch003.status === 200 && tch003Token, 'Teacher login (TCH-003, Grade 1 Mabait)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login');

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

  const createdAssignmentIds = [];
  const createdGradeIds = [];
  let inactiveTeacherId = null;

  async function cleanup() {
    await withDb(async (conn) => {
      if (createdGradeIds.length) {
        await conn.query('DELETE FROM grades WHERE id IN (?)', [createdGradeIds]);
      }
      if (createdAssignmentIds.length) {
        await conn.query('DELETE FROM teacher_assignments WHERE id IN (?)', [createdAssignmentIds]);
      }
      if (inactiveTeacherId) {
        await conn.query('DELETE FROM activity_logs WHERE user_id = ?', [inactiveTeacherId]);
        await conn.query('DELETE FROM users WHERE id = ?', [inactiveTeacherId]);
      }
    });
  }

  try {
    // --- GET /api/subjects ---
    console.log('\nGET /api/subjects:');

    const subjectsAll = await request('GET', '/api/subjects', { token: adminToken });
    assert(
      subjectsAll.status === 200 && subjectsAll.data?.subjects?.length === 40,
      `GET / returns 40 subjects (got ${subjectsAll.data?.subjects?.length})`
    );

    const grade1 = await request('GET', '/api/subjects?grade_level=1', { token: tch003Token });
    const grade1Names = (grade1.data?.subjects || []).map((s) => s.name).sort();
    assert(
      grade1.status === 200 &&
        grade1.data.subjects.length === 5 &&
        grade1.data.subjects.every((s) => s.grade_level === 1),
      'GET /?grade_level=1 returns the five Grade 1 subjects'
    );
    assert(
      JSON.stringify(grade1Names) === JSON.stringify(['GMRC', 'Language', 'Makabansa', 'Mathematics', 'Reading'].sort()),
      `Grade 1 names match the seeded curriculum (got ${grade1Names.join(', ')})`
    );

    const badGrade = await request('GET', '/api/subjects?grade_level=9', { token: adminToken });
    assert(badGrade.status === 400, 'GET /?grade_level=9 rejected');

    const parentSubjects = await request('GET', '/api/subjects', { token: parentToken });
    assert(parentSubjects.status === 200 && parentSubjects.data?.subjects?.length === 40, 'Parent can read subjects (unscoped reference data)');

    const noAuthSubjects = await request('GET', '/api/subjects');
    assert(noAuthSubjects.status === 401, 'GET /subjects without a token is 401');

    // --- GET /api/assignments ---
    console.log('\nGET /api/assignments:');

    const tch002Own = await request('GET', '/api/assignments', { token: tch002Token });
    assert(
      tch002Own.status === 200 && Array.isArray(tch002Own.data?.assignments) && tch002Own.data.assignments.length === 0,
      'TCH-002 own list is empty (correct — zero seeded assignments)'
    );

    const tch001Own = await request('GET', '/api/assignments', { token: tch001Token });
    const tch001Names = (tch001Own.data?.assignments || []).map((a) => a.subject_name).sort();
    assert(
      tch001Own.status === 200 &&
        tch001Own.data.assignments.every((a) => a.teacher_id === tch001Id) &&
        tch001Names.includes('Mathematics') &&
        tch001Names.includes('English') &&
        tch001Names.includes('Filipino') &&
        tch001Own.data.assignments.every((a) => a.section === 'Malikhain' && a.grade_level === 6),
      'TCH-001 sees own Grade 6 Malikhain Mathematics/English/Filipino'
    );

    const tch003Own = await request('GET', '/api/assignments', { token: tch003Token });
    const tch003Rows = tch003Own.data?.assignments || [];
    const tch003Names = tch003Rows.map((a) => a.subject_name).sort();
    assert(
      tch003Own.status === 200 &&
        tch003Rows.length >= 5 &&
        tch003Rows.every((a) => a.teacher_id === tch003Id && a.grade_level === 1 && a.section === 'Mabait') &&
        ['GMRC', 'Language', 'Makabansa', 'Mathematics', 'Reading'].every((n) => tch003Names.includes(n)),
      'TCH-003 sees own five Grade 1 Mabait assignments (seeded fixture, not deleted)'
    );

    const probeOther = await request('GET', `/api/assignments?teacher_id=${tch003Id}`, { token: tch001Token });
    assert(
      probeOther.status === 403 && /own assignments/i.test(probeOther.data?.message || ''),
      `Teacher naming another teacher_id is 403, not 404 (got ${probeOther.status})`
    );

    const adminTch002 = await request('GET', `/api/assignments?teacher_id=${tch002Id}`, { token: adminToken });
    assert(
      adminTch002.status === 200 && adminTch002.data?.assignments?.length === 0,
      'Admin filter for TCH-002 returns empty (same invariant)'
    );

    const parentList = await request('GET', '/api/assignments', { token: parentToken });
    assert(parentList.status === 403, 'Parent GET /assignments is 403');

    const badTeacherId = await request('GET', '/api/assignments?teacher_id=abc', { token: adminToken });
    assert(badTeacherId.status === 400, 'GET /assignments?teacher_id=abc is 400');

    // --- POST refusals ---
    console.log('\nPOST /api/assignments:');

    const grade5 = await request('GET', '/api/subjects?grade_level=5', { token: adminToken });
    const science = (grade5.data?.subjects || []).find((s) => s.name === 'Science');
    assert(science && Number.isInteger(science.id), 'Resolve Grade 5 Science subject id');

    const teacherPost = await request('POST', '/api/assignments', {
      token: tch001Token,
      body: { teacher_id: tch001Id, subject_id: science.id, section: 'Masigasig' },
    });
    assert(teacherPost.status === 403, 'Teacher POST is 403 (admin-only)');

    const parentPost = await request('POST', '/api/assignments', {
      token: parentToken,
      body: { teacher_id: tch002Id, subject_id: science.id, section: 'Masigasig' },
    });
    assert(parentPost.status === 403, 'Parent POST is 403');

    const missing = await request('POST', '/api/assignments', { token: adminToken, body: {} });
    assert(missing.status === 400, 'POST with empty body is 400');

    const badSubject = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: tch002Id, subject_id: 999999, section: 'Masigasig' },
    });
    assert(badSubject.status === 400 && /subject/i.test(badSubject.data?.message || ''), 'Nonexistent subject_id is 400');

    const unknownSection = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: tch002Id, subject_id: science.id, section: 'NotARealSection' },
    });
    assert(
      unknownSection.status === 400 && /NotARealSection/.test(unknownSection.data?.message || ''),
      'Unknown section name is 400 naming the value'
    );

    const adminAsTeacher = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: adminLogin.data?.user?.id, subject_id: science.id, section: 'Masigasig' },
    });
    assert(
      adminAsTeacher.status === 400 && /role 'teacher'/.test(adminAsTeacher.data?.message || ''),
      'Assigning a non-teacher user is 400 naming the found role'
    );

    const suffix = String(Date.now()).slice(-6);
    const newTeacher = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: {
        login_id: `TCH-ASGN-${suffix}`,
        password: 'Teacher@2026',
        name: 'Inactive Assignment Fixture',
        email: `asgn.inactive.${suffix}@chfes.edu.ph`,
      },
    });
    inactiveTeacherId = newTeacher.data?.user?.id;
    assert(newTeacher.status === 201 && Number.isInteger(inactiveTeacherId), 'Create throwaway teacher for inactive check');

    const deactivate = await request('PATCH', `/api/users/${inactiveTeacherId}/status`, {
      token: adminToken,
      body: { status: 'inactive' },
    });
    assert(deactivate.status === 200, 'Deactivate the throwaway teacher');

    const inactivePost = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: inactiveTeacherId, subject_id: science.id, section: 'Masigasig' },
    });
    assert(
      inactivePost.status === 400 && /inactive/.test(inactivePost.data?.message || ''),
      'Assigning an inactive teacher is 400 naming the status'
    );

    // --- POST success, duplicate, DELETE ---
    const created = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: tch002Id, subject_id: science.id, section: 'Masigasig' },
    });
    const createdId = created.data?.assignment?.id;
    if (Number.isInteger(createdId)) createdAssignmentIds.push(createdId);
    assert(
      created.status === 201 &&
        created.data?.assignment?.teacher_id === tch002Id &&
        created.data.assignment.subject_id === science.id &&
        created.data.assignment.grade_level === 5 &&
        created.data.assignment.section === 'Masigasig' &&
        Number.isInteger(created.data.assignment.section_id) &&
        created.data.assignment.subject_name === 'Science',
      `Admin POST Grade 5 Science / Masigasig for TCH-002 (got ${created.status})`
    );

    const tch002After = await request('GET', '/api/assignments', { token: tch002Token });
    assert(
      tch002After.status === 200 && tch002After.data?.assignments?.some((a) => a.id === createdId),
      'TCH-002 now sees the assignment just created'
    );

    const duplicate = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: tch002Id, subject_id: science.id, section: 'Masigasig' },
    });
    assert(duplicate.status === 409 && /already assigned/i.test(duplicate.data?.message || ''), 'Duplicate POST is 409');

    const teacherDelete = await request('DELETE', `/api/assignments/${createdId}`, { token: tch002Token });
    assert(teacherDelete.status === 403, 'Teacher DELETE is 403');

    const missingDelete = await request('DELETE', '/api/assignments/999999', { token: adminToken });
    assert(missingDelete.status === 404, 'DELETE nonexistent id is 404');

    const badDeleteId = await request('DELETE', '/api/assignments/abc', { token: adminToken });
    assert(badDeleteId.status === 400, 'DELETE non-numeric id is 400');

    // Grade rows survive assignment delete — no grades → teacher_assignments FK.
    const students = await request('GET', '/api/students', { token: tch002Token });
    const jea = (students.data?.students || []).find((s) => s.last_name === 'Bargaso');
    assert(jea && Number.isInteger(jea.id), 'Resolve Jea (Grade 5 Masigasig) for the grade-survival check');

    const gradeShell = await request('POST', '/api/grades', {
      token: adminToken,
      body: { student_id: jea.id, subject_id: science.id, term: 1, school_year: '2026-2027' },
    });
    const gradeId = gradeShell.data?.grade?.id;
    if (Number.isInteger(gradeId)) createdGradeIds.push(gradeId);
    assert(gradeShell.status === 201 && Number.isInteger(gradeId), `Admin creates a Science grade for Jea (got ${gradeShell.status})`);

    const deleted = await request('DELETE', `/api/assignments/${createdId}`, { token: adminToken });
    assert(deleted.status === 200 && deleted.data?.success, 'Admin DELETE assignment succeeds');
    createdAssignmentIds.splice(createdAssignmentIds.indexOf(createdId), 1);

    const gradeAfter = await request('GET', `/api/grades/${gradeId}`, { token: adminToken });
    assert(
      gradeAfter.status === 200 && gradeAfter.data?.grade?.id === gradeId,
      'Grade row still exists after the assignment is deleted (scope change, not record wipe)'
    );

    const tch002Clean = await request('GET', '/api/assignments', { token: tch002Token });
    assert(
      tch002Clean.status === 200 && tch002Clean.data?.assignments?.length === 0,
      'TCH-002 list is empty again after DELETE'
    );

    const tch003Unchanged = await request('GET', '/api/assignments', { token: tch003Token });
    assert(
      tch003Unchanged.status === 200 &&
        (tch003Unchanged.data?.assignments || []).length === tch003Rows.length,
      'TCH-003 seeded assignments were not deleted'
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

    await checkPage('/api/assignments', adminToken, 'assignments', { sort: 'subject', field: 'subject_name' });
    await checkPage('/api/assignments', tch001Token, 'assignments', { sort: 'class', field: 'grade_level' });

    // C4: the teacher's own scope IS the filter — total counts only their rows.
    const ownPage = await request('GET', '/api/assignments?limit=200', { token: tch001Token });
    assert(
      ownPage.status === 200 &&
        (ownPage.data?.assignments || []).every((a) => a.teacher_id === tch001.data?.user?.id) &&
        (ownPage.data?.page?.has_more || ownPage.data?.page?.total === ownPage.data?.assignments?.length),
      'GET /assignments as a teacher: every row is theirs and total is the scoped count'
    );
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
