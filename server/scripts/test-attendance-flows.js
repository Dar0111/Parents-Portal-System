/**
 * Attendance API tests — per-day model (Stage B1). Attendance is recorded
 * once per day by the section ADVISER (sections.adviser_id), not per
 * subject by teacher_assignments — that scoping shape is gone from this
 * file entirely, matching routes/attendance.js.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: uses two fixed past dates that no seed data ever touches, plus
 * one extra timestamp-suffixed test student, and deletes everything it
 * created in a finally block — passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:attendance
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

// Local wall-clock dates — no toISOString(), matching todayLocalDateString()
// in utils/dateFormat.js and the lesson from the UTC test-helper bug.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function tomorrow() {
  return daysAgo(-1);
}
function todayLocal() {
  return daysAgo(0);
}

async function run() {
  console.log(`\nParents Portal — Attendance API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is the adviser of Grade 6 - Malikhain.
  const adviserLogin = await login('TCH-001', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  assert(adviserLogin.status === 200 && adviserToken, 'Adviser login (TCH-001, Grade 6 - Malikhain)');

  // TCH-002 (seeded) is the adviser of Grade 5 - Masigasig — a real, live
  // non-adviser for Grade 6 - Malikhain, not a fabricated third fixture.
  const otherAdviserLogin = await login('TCH-002', 'Teacher@2026');
  const otherAdviserToken = otherAdviserLogin.data?.token;
  assert(
    otherAdviserLogin.status === 200 && otherAdviserToken,
    'Other adviser login (TCH-002, Grade 5 - Masigasig)'
  );

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Malikhain)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), "Resolve Marwin's student_id via /me");

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
  async function getSectionId(name, gradeLevel) {
    const [rows] = await withDb((conn) =>
      conn.query('SELECT id FROM sections WHERE name = ? AND grade_level = ? AND school_year = ? LIMIT 1', [
        name,
        gradeLevel,
        '2026-2027',
      ])
    );
    return rows[0]?.id;
  }

  const malikhainId = await getSectionId('Malikhain', 6); // TCH-001's section
  const masigasigId = await getSectionId('Masigasig', 5); // TCH-002's section, Jea's class
  assert(
    Number.isInteger(malikhainId) && Number.isInteger(masigasigId),
    'Resolve both seeded section ids'
  );

  const adminStudentList = await request('GET', '/api/students?status=all', { token: adminToken });
  const jea = adminStudentList.data?.students?.find((s) => s.lrn === '1234567');
  const jeaId = jea?.id;
  assert(Number.isInteger(jeaId), "Resolve Jea's student id (Grade 5 - Masigasig, outside TCH-001's scope)");

  // Two fixed past dates, plus one extra Grade 6 - Malikhain student (for a
  // real multi-student bulk roster). Nothing in seed.sql ever touches these
  // dates, and everything created here is deleted in the finally block below.
  const dateA = daysAgo(2);
  const dateB = daysAgo(3);
  const uniqueSuffix = String(Date.now()).slice(-6);
  // 12 digits (the LRN rule since 2026-09-18). Inserted by SQL, so the rule
  // does not run here; the fixture just looks like a real LRN.
  const rosterLrn = `6${String(Date.now()).slice(-11)}`;

  const createdStudentIds = [];

  async function cleanup() {
    await withDb(async (conn) => {
      await conn.query('DELETE FROM attendance WHERE date IN (?)', [[dateA, dateB, todayLocal()]]);
      if (createdStudentIds.length) {
        await conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]);
      }
    });
  }

  try {
    const [rosterResult] = await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, status, created_by)
         VALUES (?, 'Roster', 'Student', 6, 'Malikhain', ?, 'active', 2)`,
        [rosterLrn, malikhainId]
      )
    );
    const rosterStudentId = rosterResult.insertId;
    createdStudentIds.push(rosterStudentId);

    // --- Single record: create, update-in-place, scoping, validation ---
    console.log('\nRecord one entry:');

    const recordPresent = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: dateA, status: 'Present' },
    });
    assert(
      recordPresent.status === 201 && recordPresent.data?.attendance?.status === 'Present',
      'Adviser records attendance for their own section'
    );
    const attendanceId = recordPresent.data?.attendance?.id;
    assert(
      recordPresent.data?.attendance?.date === dateA,
      `POST response date round-trips exactly as sent (sent ${dateA}, got ${recordPresent.data?.attendance?.date})`
    );
    assert(
      recordPresent.data?.attendance?.subject_id === undefined,
      'Response carries no subject_id — the column is gone'
    );

    const recordAgain = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: dateA, status: 'Late' },
    });
    assert(
      recordAgain.status === 201 &&
        recordAgain.data?.attendance?.status === 'Late' &&
        recordAgain.data?.attendance?.id === attendanceId,
      'Recording the same (student, date) again updates in place, not an error'
    );

    const nonAdviserAttempt = await request('POST', '/api/attendance', {
      token: otherAdviserToken,
      body: { student_id: marwinId, date: dateA, status: 'Present' },
    });
    assert(
      nonAdviserAttempt.status === 403 &&
        /not the adviser of this student's section/i.test(nonAdviserAttempt.data?.message || ''),
      "Non-adviser teacher (TCH-002) recording for Marwin's class gets 403 naming the reason"
    );

    const futureDate = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: tomorrow(), status: 'Present' },
    });
    assert(futureDate.status === 400, 'Future date rejected');

    const recordToday = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: todayLocal(), status: 'Present' },
    });
    assert(
      recordToday.status === 201,
      `Today's actual date is accepted, not rejected as "future" (got ${recordToday.status})`
    );

    const badStatus = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: dateA, status: 'Sick' },
    });
    assert(badStatus.status === 400, 'Invalid status rejected');

    const missingFields = await request('POST', '/api/attendance', {
      token: adviserToken,
      body: { student_id: marwinId, date: dateA },
    });
    assert(missingFields.status === 400, 'Missing status rejected');

    const adminRecordsAnywhere = await request('POST', '/api/attendance', {
      token: adminToken,
      body: { student_id: jeaId, date: dateB, status: 'Present' },
    });
    assert(
      adminRecordsAnywhere.status === 201,
      'Admin records attendance for any section (no adviser check)'
    );

    // --- Bulk: primary path, all-or-nothing ---
    console.log('\nBulk:');

    const bulkOk = await request('POST', '/api/attendance/bulk', {
      token: adviserToken,
      body: {
        section_id: malikhainId,
        date: dateB,
        entries: [
          { student_id: marwinId, status: 'Present' },
          { student_id: rosterStudentId, status: 'Absent' },
        ],
      },
    });
    assert(
      bulkOk.status === 201 && bulkOk.data?.attendance?.length === 2,
      'Adviser bulk-records a full section roster'
    );

    const bulkWrongSection = await request('POST', '/api/attendance/bulk', {
      token: adminToken,
      body: {
        section_id: malikhainId,
        date: dateB,
        entries: [
          { student_id: marwinId, status: 'Present' },
          { student_id: jeaId, status: 'Present' }, // Jea is Grade 5 - Masigasig, not this section
        ],
      },
    });
    assert(
      bulkWrongSection.status === 400 && new RegExp(`#${jeaId} is not in this section`).test(bulkWrongSection.data?.message || ''),
      'Bulk rejects a student not in the given section_id, naming the student'
    );

    const bulkBadDate = daysAgo(4);
    const bulkAllOrNothing = await request('POST', '/api/attendance/bulk', {
      token: adviserToken,
      body: {
        section_id: malikhainId,
        date: bulkBadDate,
        entries: [
          { student_id: marwinId, status: 'Present' },
          { student_id: jeaId, status: 'Present' }, // still wrong-section — this is the "one bad entry"
        ],
      },
    });
    assert(bulkAllOrNothing.status === 400, 'Bulk with one student outside the section is rejected whole');

    const afterFailedBulk = await request('GET', `/api/attendance/student/${marwinId}?from=${bulkBadDate}&to=${bulkBadDate}`, {
      token: adminToken,
    });
    assert(
      (afterFailedBulk.data?.attendance || []).length === 0,
      'Failed bulk wrote nothing for the valid entry either — all-or-nothing confirmed'
    );
    // bulkBadDate not part of the cleanup date list, so remove any accidental writes explicitly.
    await withDb((conn) => conn.query('DELETE FROM attendance WHERE date = ?', [bulkBadDate]));

    const nonAdviserBulk = await request('POST', '/api/attendance/bulk', {
      token: otherAdviserToken,
      body: {
        section_id: malikhainId,
        date: dateB,
        entries: [{ student_id: marwinId, status: 'Present' }],
      },
    });
    assert(
      nonAdviserBulk.status === 403 && /not the adviser of this section/i.test(nonAdviserBulk.data?.message || ''),
      'Non-adviser bulk attempt gets 403 naming the reason'
    );

    const missingSectionId = await request('POST', '/api/attendance/bulk', {
      token: adviserToken,
      body: { date: dateB, entries: [{ student_id: marwinId, status: 'Present' }] },
    });
    assert(missingSectionId.status === 400, 'Bulk missing section_id rejected');

    // --- Read (scoping) ---
    console.log('\nRead (scoping):');

    const teacherList = await request('GET', `/api/attendance?from=${dateB}&to=${dateA}`, { token: adviserToken });
    const teacherListStudentIds = (teacherList.data?.attendance || []).map((a) => a.student_id);
    assert(teacherList.status === 200, 'Adviser can list attendance');
    assert(teacherListStudentIds.includes(marwinId), "Adviser list includes in-scope student (own section)");
    assert(!teacherListStudentIds.includes(jeaId), 'Adviser list excludes out-of-scope student (other section)');

    const marwinRowInList = (teacherList.data?.attendance || []).find((a) => a.student_id === marwinId);
    assert(
      marwinRowInList?.date === dateB || marwinRowInList?.date === dateA,
      'GET / date round-trips on a fresh read, separate from the POST response'
    );
    assert(
      marwinRowInList?.subject_id === undefined && marwinRowInList?.subject_name === undefined,
      'GET / carries no subject_id or subject_name — attendance is no longer per subject'
    );

    const parentOwn = await request('GET', `/api/attendance/student/${marwinId}`, { token: parentToken });
    assert(parentOwn.status === 200 && parentOwn.data?.attendance?.length > 0, 'Parent reads own child attendance');

    const parentOther = await request('GET', `/api/attendance/student/${jeaId}`, { token: parentToken });
    assert(parentOther.status === 404, 'Parent reading another child returns 404');

    const teacherOtherStudent = await request('GET', `/api/attendance/student/${jeaId}`, { token: adviserToken });
    assert(teacherOtherStudent.status === 404, "Adviser reading a student outside their section returns 404");

    const teacherSummaryOutOfScope = await request('GET', `/api/attendance/summary/${jeaId}`, { token: adviserToken });
    assert(teacherSummaryOutOfScope.status === 404, 'Adviser summary for out-of-scope student returns 404');

    const summary = await request('GET', `/api/attendance/summary/${marwinId}?from=${dateA}&to=${dateA}`, {
      token: parentToken,
    });
    assert(
      summary.status === 200 && summary.data?.summary?.Late === 1 && summary.data?.summary?.total === 1,
      'Summary returns raw counts, no rate'
    );

    // --- Correction ---
    console.log('\nCorrect:');

    const nonNumericId = await request('PUT', '/api/attendance/abc', {
      token: adviserToken,
      body: { status: 'Present' },
    });
    assert(nonNumericId.status === 400, 'PUT /api/attendance/abc returns 400, not 500');

    const teacherCorrectsOwn = await request('PUT', `/api/attendance/${attendanceId}`, {
      token: adviserToken,
      body: { status: 'Excused' },
    });
    assert(
      teacherCorrectsOwn.status === 200 && teacherCorrectsOwn.data?.attendance?.status === 'Excused',
      'Adviser corrects an in-scope record'
    );

    const outOfScopeRecord = await withDb((conn) =>
      conn.query('SELECT id FROM attendance WHERE student_id = ? AND date = ? LIMIT 1', [jeaId, dateB])
    );
    const outOfScopeId = outOfScopeRecord[0]?.[0]?.id;

    const teacherCorrectsOther = await request('PUT', `/api/attendance/${outOfScopeId}`, {
      token: adviserToken,
      body: { status: 'Present' },
    });
    assert(teacherCorrectsOther.status === 404, 'Adviser correcting an out-of-scope record returns 404');

    const adminCorrectsTeacherRecord = await request('PUT', `/api/attendance/${attendanceId}`, {
      token: adminToken,
      body: { status: 'Present' },
    });
    assert(
      adminCorrectsTeacherRecord.status === 200 && adminCorrectsTeacherRecord.data?.attendance?.status === 'Present',
      "Admin corrects a record originally created by an adviser"
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

    await checkPage('/api/attendance', adminToken, 'attendance', { sort: 'date', field: 'date' });
    await checkPage('/api/attendance', adviserToken, 'attendance', { sort: 'student', field: 'last_name' });
    await checkPage(`/api/attendance/student/${marwinId}`, parentToken, 'attendance', { sort: 'date', field: 'date' });

    // C4: a filter narrows total to the filtered set.
    const presentPage = await request('GET', '/api/attendance?status=Present&limit=200', { token: adminToken });
    assert(
      presentPage.status === 200 &&
        (presentPage.data?.attendance || []).every((a) => a.status === 'Present') &&
        (presentPage.data?.page?.has_more || presentPage.data?.page?.total === presentPage.data?.attendance?.length),
      'GET /attendance?status=Present: every row matches and total is the filtered count'
    );
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
