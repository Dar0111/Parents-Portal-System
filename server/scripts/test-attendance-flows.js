/**
 * Attendance API tests — scoping (grade/section AND subject), validation,
 * bulk all-or-nothing, admin override.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: uses two fixed past dates that no seed data ever touches, plus
 * one extra timestamp-suffixed test student, and deletes everything it
 * created in a finally block — passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:attendance
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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Local wall-clock "today", NOT toISOString() — deliberately the same
// computation isFutureDate() itself now uses (routes/attendance.js), so
// this test exercises the actual local-vs-UTC fix: the old UTC-based
// isFutureDate would reject this value as "future" for the first 8 hours
// of every day at UTC+8, since UTC's calendar date lags behind local's
// until 8am.
function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  // TCH-001 (seeded) is assigned Math/English/Filipino for Grade 6 - Mabini only.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Mabini, Math/English/Filipino)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), "Resolve Marwin's student_id via /me");

  const adminStudentList = await request('GET', '/api/students?status=all', { token: adminToken });
  const jea = adminStudentList.data?.students?.find((s) => s.lrn === '1234567');
  const jeaId = jea?.id;
  assert(Number.isInteger(jeaId), "Resolve Jea's student id (Grade 5 - Rizal, outside TCH-001 scope)");

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
  async function getSubjectId(name, gradeLevel) {
    const [rows] = await withDb((conn) =>
      conn.query('SELECT id FROM subjects WHERE name = ? AND grade_level = ? LIMIT 1', [name, gradeLevel])
    );
    return rows[0]?.id;
  }

  const mathG6 = await getSubjectId('Mathematics', 6); // TCH-001 is assigned this
  const scienceG6 = await getSubjectId('Science', 6); // TCH-001 is NOT assigned this
  const mathG3 = await getSubjectId('Mathematics', 3); // different grade/section entirely
  assert(
    Number.isInteger(mathG6) && Number.isInteger(scienceG6) && Number.isInteger(mathG3),
    'Resolve test subject ids from seeded subjects'
  );

  // Two fixed past dates, plus one extra Grade 6 - Mabini student (for a real
  // multi-student bulk roster). Nothing in seed.sql ever touches these dates,
  // and everything created here is deleted in the finally block below.
  const dateA = daysAgo(2);
  const dateB = daysAgo(3);
  const uniqueSuffix = String(Date.now()).slice(-6);
  const rosterLrn = `6${uniqueSuffix}`;

  const createdStudentIds = [];

  async function cleanup() {
    await withDb(async (conn) => {
      await conn.query('DELETE FROM attendance WHERE date IN (?)', [[dateA, dateB]]);
      if (createdStudentIds.length) {
        await conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]);
      }
    });
  }

  try {
    const [rosterResult] = await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, status, created_by)
         VALUES (?, 'Roster', 'Student', 6, 'Malikhain', 'active', 2)`,
        [rosterLrn]
      )
    );
    const rosterStudentId = rosterResult.insertId;
    createdStudentIds.push(rosterStudentId);

    // --- Single record: create, update-in-place, scoping, validation ---
    console.log('\nRecord one entry:');

    const recordPresent = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathG6, date: dateA, status: 'Present' },
    });
    assert(
      recordPresent.status === 201 && recordPresent.data?.attendance?.status === 'Present',
      'Teacher records attendance for own subject/class'
    );
    const attendanceId = recordPresent.data?.attendance?.id;

    // The actual regression: post dateA, read the same field back on the
    // POST response, assert byte-identical strings. A JS Date round-trip
    // bug (dateStrings unset, res.json() serializing via toISOString()) at
    // UTC+8 would return dateA shifted one calendar day back — the 336
    // pre-existing tests never caught this because every prior assertion
    // compared against a value derived the same wrong way (e.g. dateA
    // itself came from daysAgo(), so a shifted response could still match
    // a similarly-shifted expectation in some checks). This compares the
    // response directly against the literal string that was sent.
    assert(
      recordPresent.data?.attendance?.date === dateA,
      `POST response date round-trips exactly as sent (sent ${dateA}, got ${recordPresent.data?.attendance?.date})`
    );

    const recordAgain = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathG6, date: dateA, status: 'Late' },
    });
    assert(
      recordAgain.status === 201 &&
        recordAgain.data?.attendance?.status === 'Late' &&
        recordAgain.data?.attendance?.id === attendanceId,
      'Recording the same (student, subject, date) again updates in place, not an error'
    );

    const wrongSubject = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: scienceG6, date: dateA, status: 'Present' },
    });
    assert(wrongSubject.status === 403, 'Teacher recording a subject they do not teach is rejected');

    const wrongClass = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: jeaId, subject_id: mathG6, date: dateA, status: 'Present' },
    });
    assert(wrongClass.status === 403, 'Teacher recording a student outside their grade/section is rejected');

    const futureDate = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathG6, date: tomorrow(), status: 'Present' },
    });
    assert(futureDate.status === 400, 'Future date rejected');

    // Regression for the isFutureDate() UTC-vs-local fix: today's actual
    // date must never be rejected as "future". Uses a different subject
    // (scienceG3 has no assignment overlap risk — grade 3 Math is unused
    // elsewhere in this file) so it can't collide with mathG6/dateA rows,
    // and is cleaned up immediately rather than added to the shared
    // dateA/dateB cleanup filter.
    const todayDate = todayLocal();
    const recordToday = await request('POST', '/api/attendance', {
      token: adminToken,
      body: { student_id: jeaId, subject_id: mathG3, date: todayDate, status: 'Present' },
    });
    assert(
      recordToday.status === 201,
      `Today's actual date is accepted, not rejected as "future" (isFutureDate UTC-vs-local fix; got ${recordToday.status})`
    );
    await withDb((conn) => conn.query('DELETE FROM attendance WHERE date = ?', [todayDate]));

    const badStatus = await request('POST', '/api/attendance', {
      token: teacherToken,
      body: { student_id: marwinId, subject_id: mathG6, date: dateA, status: 'Sick' },
    });
    assert(badStatus.status === 400, 'Invalid status rejected');

    const adminRecordsAnywhere = await request('POST', '/api/attendance', {
      token: adminToken,
      body: { student_id: jeaId, subject_id: mathG3, date: dateB, status: 'Present' },
    });
    assert(
      adminRecordsAnywhere.status === 201,
      'Admin records attendance for any subject and class (no teacher_assignments check)'
    );

    // --- Bulk: all-or-nothing ---
    console.log('\nBulk:');

    const bulkOk = await request('POST', '/api/attendance/bulk', {
      token: teacherToken,
      body: {
        subject_id: mathG6,
        grade_level: 6,
        section: 'Malikhain',
        date: dateB,
        entries: [
          { student_id: marwinId, status: 'Present' },
          { student_id: rosterStudentId, status: 'Absent' },
        ],
      },
    });
    assert(
      bulkOk.status === 201 && bulkOk.data?.attendance?.length === 2,
      'Teacher bulk-records a full class roster'
    );

    const bulkBadDate = daysAgo(4);
    const bulkWithBadStudent = await request('POST', '/api/attendance/bulk', {
      token: teacherToken,
      body: {
        subject_id: mathG6,
        grade_level: 6,
        section: 'Malikhain',
        date: bulkBadDate,
        entries: [
          { student_id: marwinId, status: 'Present' },
          { student_id: jeaId, status: 'Present' }, // Jea is Grade 5 - Rizal, not this class
        ],
      },
    });
    assert(bulkWithBadStudent.status === 400, 'Bulk with one student outside the stated class is rejected whole');

    const afterFailedBulk = await request('GET', `/api/attendance/student/${marwinId}?from=${bulkBadDate}&to=${bulkBadDate}`, {
      token: adminToken,
    });
    assert(
      (afterFailedBulk.data?.attendance || []).length === 0,
      'Failed bulk wrote nothing — all-or-nothing confirmed'
    );
    // bulkBadDate not part of dateA/dateB cleanup, so remove any accidental writes explicitly.
    await withDb((conn) => conn.query('DELETE FROM attendance WHERE date = ?', [bulkBadDate]));

    // --- Read: list + per-student, scoped ---
    console.log('\nRead (scoping):');

    // dateB is daysAgo(3), dateA is daysAgo(2) — dateB is chronologically earlier.
    const teacherList = await request('GET', `/api/attendance?from=${dateB}&to=${dateA}`, { token: teacherToken });
    const teacherListStudentIds = (teacherList.data?.attendance || []).map((a) => a.student_id);
    assert(teacherList.status === 200, 'Teacher can list attendance');
    assert(teacherListStudentIds.includes(marwinId), 'Teacher list includes in-scope student (Marwin)');
    assert(!teacherListStudentIds.includes(jeaId), 'Teacher list excludes out-of-scope student (Jea)');

    const marwinRowInList = (teacherList.data?.attendance || []).find((a) => a.student_id === marwinId);
    assert(
      marwinRowInList?.date === dateA,
      `GET / date round-trips on a fresh read, separate from the POST response (sent ${dateA}, got ${marwinRowInList?.date})`
    );
    assert(
      marwinRowInList?.subject_name === 'Mathematics',
      `GET / includes subject_name, not just subject_id (got ${JSON.stringify(marwinRowInList?.subject_name)})`
    );

    const parentOwn = await request('GET', `/api/attendance/student/${marwinId}`, { token: parentToken });
    assert(parentOwn.status === 200 && parentOwn.data?.attendance?.length > 0, 'Parent reads own child attendance');

    const parentOwnDateARow = (parentOwn.data?.attendance || []).find((a) => a.date === dateA);
    assert(
      parentOwnDateARow?.subject_name === 'Mathematics',
      `GET /student/:id includes subject_name, not just subject_id (got ${JSON.stringify(parentOwnDateARow?.subject_name)})`
    );

    const parentOther = await request('GET', `/api/attendance/student/${jeaId}`, { token: parentToken });
    assert(parentOther.status === 404, 'Parent reading another child returns 404');

    const teacherSummaryOutOfScope = await request('GET', `/api/attendance/summary/${jeaId}`, { token: teacherToken });
    assert(teacherSummaryOutOfScope.status === 404, 'Teacher summary for out-of-scope student returns 404');

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
      token: teacherToken,
      body: { status: 'Present' },
    });
    assert(nonNumericId.status === 400, 'PUT /api/attendance/abc returns 400, not 500');

    const teacherCorrectsOwn = await request('PUT', `/api/attendance/${attendanceId}`, {
      token: teacherToken,
      body: { status: 'Excused' },
    });
    assert(
      teacherCorrectsOwn.status === 200 && teacherCorrectsOwn.data?.attendance?.status === 'Excused',
      'Teacher corrects an in-scope record'
    );

    const outOfScopeRecord = await withDb((conn) =>
      conn.query('SELECT id FROM attendance WHERE student_id = ? AND date = ? LIMIT 1', [jeaId, dateB])
    );
    const outOfScopeId = outOfScopeRecord[0]?.[0]?.id;

    const teacherCorrectsOther = await request('PUT', `/api/attendance/${outOfScopeId}`, {
      token: teacherToken,
      body: { status: 'Present' },
    });
    assert(teacherCorrectsOther.status === 404, 'Teacher correcting an out-of-scope record returns 404');

    const adminCorrectsTeacherRecord = await request('PUT', `/api/attendance/${attendanceId}`, {
      token: adminToken,
      body: { status: 'Present' },
    });
    assert(
      adminCorrectsTeacherRecord.status === 200 && adminCorrectsTeacherRecord.data?.attendance?.status === 'Present',
      'Admin corrects a record originally created by a teacher'
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
