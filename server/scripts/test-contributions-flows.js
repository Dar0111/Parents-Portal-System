/**
 * Contributions API tests — grade-only scoping, lazy roster, amount-override
 * cap, delete guard naming the record count, parent isolation on my-records.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every contribution this script creates is tracked and deleted
 * (via raw SQL in the finally block, which cascades to contribution_records)
 * so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:contributions
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

// contributions.due_date has no future/past restriction (unlike attendance's
// date or events' event_date) — any valid YYYY-MM-DD works. Local getters,
// not toISOString(), matching the fix under test.
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function login(loginId, password) {
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

async function run() {
  console.log(`\nParents Portal — Contributions API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Mabini only.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Mabini)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(
    Number.isInteger(marwinId) && meParent.data?.user?.grade_level === 6,
    "Resolve Marwin's student_id and grade via /me"
  );

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

  const createdContributionIds = [];

  async function cleanup() {
    if (createdContributionIds.length) {
      // ON DELETE CASCADE on contribution_records.contribution_id cleans those up too.
      await withDb((conn) => conn.query('DELETE FROM contributions WHERE id IN (?)', [createdContributionIds]));
    }
  }

  try {
    // --- Create: scoping and validation ---
    console.log('\nCreate:');

    const fieldTripDueDate = daysFromNow(14);
    const teacherOwnGrade = await request('POST', '/api/contributions', {
      token: teacherToken,
      body: { title: 'Field Trip Fee', amount: 500, grade_level: 6, due_date: fieldTripDueDate },
    });
    assert(teacherOwnGrade.status === 201, 'Teacher posts contribution for their own assigned grade');
    const g6ContributionId = teacherOwnGrade.data?.contribution?.id;
    if (g6ContributionId) createdContributionIds.push(g6ContributionId);
    // The actual regression: post a due_date, read it back on the same
    // response, assert byte-identical strings — same shape as the
    // attendance.date and events.event_date checks. Without
    // dateStrings: ['DATE'] on the pool, this would come back shifted a
    // calendar day at UTC+8 (mysql2 returns a JS Date, res.json()
    // serializes it via toISOString()).
    assert(
      teacherOwnGrade.data?.contribution?.due_date === fieldTripDueDate,
      `due_date round-trips exactly as sent (sent ${fieldTripDueDate}, got ${teacherOwnGrade.data?.contribution?.due_date})`
    );

    const teacherWrongGrade = await request('POST', '/api/contributions', {
      token: teacherToken,
      body: { title: 'Grade 3 Fee', amount: 200, grade_level: 3 },
    });
    assert(
      teacherWrongGrade.status === 403 && /not assigned to Grade 3/.test(teacherWrongGrade.data?.message || ''),
      'Teacher posting outside their assigned grade gets 403 naming the grade'
    );

    const adminOtherGrade = await request('POST', '/api/contributions', {
      token: adminToken,
      body: { title: 'Grade 5 Fee', amount: 300, grade_level: 5 },
    });
    assert(adminOtherGrade.status === 201, 'Admin posts contribution for any grade');
    const g5ContributionId = adminOtherGrade.data?.contribution?.id;
    if (g5ContributionId) createdContributionIds.push(g5ContributionId);

    const missingTitle = await request('POST', '/api/contributions', {
      token: adminToken,
      body: { amount: 100, grade_level: 6 },
    });
    assert(missingTitle.status === 400, 'Missing title rejected');

    const badAmount = await request('POST', '/api/contributions', {
      token: adminToken,
      body: { title: 'Bad amount', amount: 0, grade_level: 6 },
    });
    assert(badAmount.status === 400, 'amount <= 0 rejected');

    const missingGrade = await request('POST', '/api/contributions', {
      token: adminToken,
      body: { title: 'No grade', amount: 100 },
    });
    assert(
      missingGrade.status === 400 && /grade_level is required/.test(missingGrade.data?.message || ''),
      'Missing grade_level rejected'
    );

    const badGrade = await request('POST', '/api/contributions', {
      token: adminToken,
      body: { title: 'Bad grade', amount: 100, grade_level: 7 },
    });
    assert(badGrade.status === 400, 'grade_level outside 1-6 rejected');

    // --- Read: list + single, scoped ---
    console.log('\nRead (scoping):');

    const parentList = await request('GET', '/api/contributions', { token: parentToken });
    const parentIds = (parentList.data?.contributions || []).map((c) => c.id);
    assert(parentIds.includes(g6ContributionId), "Parent sees contribution for Marwin's grade");
    assert(!parentIds.includes(g5ContributionId), 'Parent does not see a different grade');

    const teacherList = await request('GET', '/api/contributions', { token: teacherToken });
    const teacherIds = (teacherList.data?.contributions || []).map((c) => c.id);
    assert(teacherIds.includes(g6ContributionId), 'Teacher sees contribution for their assigned grade');
    assert(!teacherIds.includes(g5ContributionId), 'Teacher does not see out-of-scope grade');

    const adminList = await request('GET', '/api/contributions', { token: adminToken });
    const adminIds = (adminList.data?.contributions || []).map((c) => c.id);
    assert(adminIds.includes(g5ContributionId), 'Admin sees every contribution');

    const parentGetOwnGrade = await request('GET', `/api/contributions/${g6ContributionId}`, { token: parentToken });
    assert(parentGetOwnGrade.status === 200, "Parent reads a contribution for Marwin's grade");

    const parentGetOtherGrade = await request('GET', `/api/contributions/${g5ContributionId}`, {
      token: parentToken,
    });
    assert(parentGetOtherGrade.status === 404, 'Parent reading a different grade returns 404');

    const teacherGetOtherGrade = await request('GET', `/api/contributions/${g5ContributionId}`, {
      token: teacherToken,
    });
    assert(teacherGetOtherGrade.status === 404, 'Teacher reading out-of-scope grade returns 404');

    // --- Roster + PATCH ---
    console.log('\nRoster and payment status:');

    const rosterBefore = await request('GET', `/api/contributions/${g6ContributionId}/records`, {
      token: teacherToken,
    });
    const marwinRowBefore = (rosterBefore.data?.records || []).find((r) => r.student_id === marwinId);
    assert(
      rosterBefore.status === 200 && marwinRowBefore?.status === 'Pending' && Number(marwinRowBefore.amount) === 500,
      'Roster includes an active student with no record yet, defaulted to Pending at the full fee'
    );

    const markPaid = await request('PATCH', `/api/contributions/${g6ContributionId}/records/${marwinId}`, {
      token: teacherToken,
      body: { status: 'Paid' },
    });
    assert(markPaid.status === 200 && markPaid.data?.record?.status === 'Paid', 'Teacher marks a student Paid');

    const markPendingAgain = await request('PATCH', `/api/contributions/${g6ContributionId}/records/${marwinId}`, {
      token: teacherToken,
      body: { status: 'Pending' },
    });
    assert(
      markPendingAgain.status === 200 && markPendingAgain.data?.record?.status === 'Pending',
      'Re-PATCHing the same student updates in place, not an error'
    );

    const discountedPatch = await request('PATCH', `/api/contributions/${g6ContributionId}/records/${marwinId}`, {
      token: teacherToken,
      body: { status: 'Paid', amount: 300 },
    });
    assert(
      discountedPatch.status === 200 && Number(discountedPatch.data?.record?.amount) === 300,
      'Amount override below the fee is accepted'
    );

    const statusOnlyAfterDiscount = await request(
      'PATCH',
      `/api/contributions/${g6ContributionId}/records/${marwinId}`,
      { token: teacherToken, body: { status: 'Pending' } }
    );
    assert(
      statusOnlyAfterDiscount.status === 200 && Number(statusOnlyAfterDiscount.data?.record?.amount) === 300,
      'A status-only PATCH after a discount does not reset the amount back to full price'
    );

    const overCapPatch = await request('PATCH', `/api/contributions/${g6ContributionId}/records/${marwinId}`, {
      token: teacherToken,
      body: { status: 'Paid', amount: 999 },
    });
    assert(
      overCapPatch.status === 400 && /cannot exceed/.test(overCapPatch.data?.message || ''),
      "Amount override above the fee amount is rejected, naming the limit"
    );

    const wrongGradeStudent = await request('PATCH', `/api/contributions/${g6ContributionId}/records/999999999`, {
      token: teacherToken,
      body: { status: 'Paid' },
    });
    assert(wrongGradeStudent.status === 404, 'PATCH for a nonexistent/out-of-roster student returns 404');

    const nonNumericContribId = await request('PATCH', '/api/contributions/abc/records/1', {
      token: teacherToken,
      body: { status: 'Paid' },
    });
    assert(nonNumericContribId.status === 400, 'PATCH with a non-numeric contribution id returns 400');

    // --- my-records: parent isolation ---
    console.log('\nmy-records:');

    const myRecords = await request('GET', '/api/contributions/my-records', { token: parentToken });
    const myRecordEntry = (myRecords.data?.records || []).find((r) => r.contribution_id === g6ContributionId);
    const otherGradeEntry = (myRecords.data?.records || []).find((r) => r.contribution_id === g5ContributionId);
    assert(myRecords.status === 200 && !!myRecordEntry, "Parent's my-records includes their child's grade");
    assert(!otherGradeEntry, "Parent's my-records excludes a different grade");
    assert(
      Object.keys(myRecordEntry).every((k) => !/count|total|other/i.test(k)),
      'my-records response carries no aggregate/other-student fields'
    );

    // --- Edit/delete ---
    console.log('\nEdit/delete:');

    const nonNumericId = await request('PUT', '/api/contributions/abc', { token: adminToken, body: { title: 'x' } });
    assert(nonNumericId.status === 400, 'PUT /api/contributions/abc returns 400, not 500');

    const nonAuthorEdit = await request('PUT', `/api/contributions/${g5ContributionId}`, {
      token: teacherToken,
      body: { title: 'Hijacked' },
    });
    assert(nonAuthorEdit.status === 403, "Non-author teacher cannot edit admin's contribution");

    const authorEdit = await request('PUT', `/api/contributions/${g6ContributionId}`, {
      token: teacherToken,
      body: { title: 'Field Trip Fee (updated)' },
    });
    assert(authorEdit.status === 200, 'Author edits their own contribution');
    // The actual regression: PUT omits due_date, so the handler falls back
    // to the existing row's value. Before the fix, that fallback
    // (toDateString(existing.due_date)) re-serialized a JS Date via
    // toISOString(), silently shifting it back a calendar day at UTC+8 on
    // every edit that didn't resend due_date.
    assert(
      authorEdit.data?.contribution?.due_date === fieldTripDueDate,
      `due_date is unchanged after a PUT that omits it (still ${fieldTripDueDate}, got ${authorEdit.data?.contribution?.due_date})`
    );

    const deleteWithRecords = await request('DELETE', `/api/contributions/${g6ContributionId}`, {
      token: teacherToken,
    });
    assert(
      deleteWithRecords.status === 409 &&
        /1 payment record exists/.test(deleteWithRecords.data?.message || '') &&
        /Clear the payment records first/.test(deleteWithRecords.data?.message || ''),
      'Deleting a contribution with existing records is blocked with 409 naming the count'
    );

    const emptyContribution = await request('POST', '/api/contributions', {
      token: teacherToken,
      body: { title: 'Untouched Fee', amount: 150, grade_level: 6 },
    });
    const emptyContributionId = emptyContribution.data?.contribution?.id;
    if (emptyContributionId) createdContributionIds.push(emptyContributionId);

    const deleteWithoutRecords = await request('DELETE', `/api/contributions/${emptyContributionId}`, {
      token: teacherToken,
    });
    assert(deleteWithoutRecords.status === 200, 'Deleting a contribution with no records succeeds');
    // Deleted directly via the API — drop it from the cleanup list.
    const idx = createdContributionIds.indexOf(emptyContributionId);
    if (idx !== -1) createdContributionIds.splice(idx, 1);
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
