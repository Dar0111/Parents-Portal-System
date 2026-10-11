/**
 * Sections API tests — GET /, GET /:id, PATCH /:id/adviser.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: sections are unscoped reference data with a fixed 23-row
 * inventory (no POST/DELETE exists), so PATCH is the only mutation this
 * suite can make. Every PATCH test runs against two of the 21 currently-
 * NULL-adviser sections (resolved by id, deterministic ordering) — the two
 * real seeded adviser assignments (Malikhain -> TCH-001, Masigasig ->
 * TCH-002) are never written to, only read. Both test sections are reset
 * to adviser_id = NULL in a finally block, via a direct DB write rather
 * than a remembered "restore at the end" API call, so a mid-suite failure
 * still leaves the two test sections NULL on the next run. The one
 * throwaway user fixture (an inactive teacher, needed to test the status
 * check) is deleted the same way.
 *
 * Usage: npm run test:sections
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Staff sign-ins accept the privacy notice and terms first (feat/staff-
// acceptance); this run's rows go in the finally (scripts/policyFixture.js).
const policy = require('./policyFixture').createPolicyFixture();

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
  console.log(`\nParents Portal — Sections API Tests (${BASE})\n`);

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

  const adviserLogin = await login('TCH-001', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  await policy.accept(adviserToken);
  const adviserId = adviserLogin.data?.user?.id;
  assert(adviserLogin.status === 200 && adviserToken, 'Teacher login (TCH-001, adviser of Grade 6 - Malikhain)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentUserId = parentLogin.data?.user?.id;
  assert(parentLogin.status === 200 && Number.isInteger(parentUserId), 'Parent login (for the wrong-role PATCH test)');

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

  const [nullSections] = await withDb((conn) =>
    conn.query('SELECT id, name, grade_level FROM sections WHERE adviser_id IS NULL ORDER BY id LIMIT 2')
  );
  const [sectionA, sectionB] = nullSections;
  assert(
    sectionA && sectionB,
    'Resolve two currently-NULL-adviser sections to test against (never Malikhain/Masigasig)'
  );

  const [malikhainRows] = await withDb((conn) =>
    conn.query(
      "SELECT id FROM sections WHERE name = 'Malikhain' AND grade_level = 6 AND school_year = '2026-2027' LIMIT 1"
    )
  );
  const malikhainId = malikhainRows[0]?.id;
  assert(Number.isInteger(malikhainId), 'Resolve the seeded Malikhain section id');

  // Throwaway inactive-teacher fixture, for the "inactive teacher" PATCH check.
  const suffix = String(Date.now()).slice(-6);
  const newTeacher = await request('POST', '/api/users/teachers', {
    token: adminToken,
    body: {
      login_id: `TCH-TEST-${suffix}`,
      password: 'Teacher@2026',
      name: 'Inactive Fixture Teacher',
      email: `inactive.fixture.${suffix}@chfes.edu.ph`,
    },
  });
  const inactiveTeacherId = newTeacher.data?.user?.id;
  assert(newTeacher.status === 201 && Number.isInteger(inactiveTeacherId), 'Create throwaway teacher fixture');

  const deactivate = await request('PATCH', `/api/users/${inactiveTeacherId}/status`, {
    token: adminToken,
    body: { status: 'inactive' },
  });
  assert(deactivate.status === 200, 'Deactivate the fixture teacher');

  async function cleanup() {
    await withDb(async (conn) => {
      await conn.query('UPDATE sections SET adviser_id = NULL WHERE id IN (?)', [[sectionA.id, sectionB.id]]);
      if (inactiveTeacherId) {
        await conn.query('DELETE FROM activity_logs WHERE user_id = ?', [inactiveTeacherId]);
        await conn.query('DELETE FROM users WHERE id = ?', [inactiveTeacherId]);
      }
    });
  }

  try {
    // --- GET / ---
    console.log('\nGET /api/sections:');

    const listAll = await request('GET', '/api/sections', { token: adminToken });
    assert(listAll.status === 200 && listAll.data?.sections?.length === 23, 'GET / returns all 23 sections');

    const listGrade6 = await request('GET', '/api/sections?grade_level=6', { token: adminToken });
    const grade6Sections = listGrade6.data?.sections || [];
    assert(
      listGrade6.status === 200 && grade6Sections.length > 0 && grade6Sections.every((s) => s.grade_level === 6),
      'GET /?grade_level=6 returns only Grade 6 sections'
    );

    const listBadGrade = await request('GET', '/api/sections?grade_level=9', { token: adminToken });
    assert(listBadGrade.status === 400, 'GET /?grade_level=9 rejected (out of 1-6 range)');

    const malikhainRow = grade6Sections.find((s) => s.id === malikhainId);
    assert(
      malikhainRow?.adviser_name === 'Maria Santos',
      `GET / includes adviser_name for an assigned section (got "${malikhainRow?.adviser_name}")`
    );

    const [[{ c: malikhainStudentCount }]] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM students WHERE section_id = ?', [malikhainId])
    );
    assert(
      malikhainRow?.student_count === malikhainStudentCount,
      `GET / student_count matches ground truth (API said ${malikhainRow?.student_count}, DB has ${malikhainStudentCount})`
    );

    const anyUnassigned = (listAll.data?.sections || []).find((s) => s.adviser_id === null);
    assert(anyUnassigned && anyUnassigned.adviser_name === null, 'GET / returns adviser_name: null for an unassigned section');

    // --- GET /:id ---
    console.log('\nGET /api/sections/:id:');

    const getOne = await request('GET', `/api/sections/${malikhainId}`, { token: adviserToken });
    assert(getOne.status === 200 && getOne.data?.section?.id === malikhainId, 'GET /:id returns the section');

    const getNonNumeric = await request('GET', '/api/sections/abc', { token: adminToken });
    assert(getNonNumeric.status === 400, 'GET /:id with a non-numeric id returns 400');

    const getMissing = await request('GET', '/api/sections/999999', { token: adminToken });
    assert(getMissing.status === 404, 'GET /:id for a nonexistent section returns 404');

    // --- PATCH /:id/adviser: validation ---
    console.log('\nPATCH /api/sections/:id/adviser — validation:');

    const patchByTeacher = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adviserToken,
      body: { adviser_id: adviserId },
    });
    assert(patchByTeacher.status === 403, 'PATCH by a teacher (not admin) is rejected with 403');

    const patchMissingBody = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: {},
    });
    assert(
      patchMissingBody.status === 400 && /adviser_id is required/i.test(patchMissingBody.data?.message || ''),
      'PATCH with no adviser_id field returns 400 naming it as required'
    );

    const patchNonexistentSection = await request('PATCH', '/api/sections/999999/adviser', {
      token: adminToken,
      body: { adviser_id: adviserId },
    });
    assert(patchNonexistentSection.status === 404, 'PATCH on a nonexistent section id returns 404');

    const patchNonNumericId = await request('PATCH', '/api/sections/abc/adviser', {
      token: adminToken,
      body: { adviser_id: adviserId },
    });
    assert(patchNonNumericId.status === 400, 'PATCH with a non-numeric section id returns 400');

    const patchParent = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: parentUserId },
    });
    assert(
      patchParent.status === 400 && /role 'teacher'/i.test(patchParent.data?.message || ''),
      "PATCH with a parent's user id returns 400 naming the role check"
    );

    const patchInactive = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: inactiveTeacherId },
    });
    assert(
      patchInactive.status === 400 && /active teacher account/i.test(patchInactive.data?.message || ''),
      'PATCH with an inactive teacher returns 400 naming the status check'
    );

    const patchNonexistentUser = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: 999999 },
    });
    assert(
      patchNonexistentUser.status === 400 && /does not reference an existing user/i.test(patchNonexistentUser.data?.message || ''),
      'PATCH with a nonexistent user id returns 400'
    );

    // --- PATCH /:id/adviser: success paths ---
    console.log('\nPATCH /api/sections/:id/adviser — success:');

    const patchAssign = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: adviserId },
    });
    assert(
      patchAssign.status === 200 && patchAssign.data?.section?.adviser_id === adviserId,
      'PATCH assigns an adviser to a NULL section'
    );

    const reread = await request('GET', `/api/sections/${sectionA.id}`, { token: adminToken });
    assert(
      reread.data?.section?.adviser_id === adviserId && reread.data?.section?.adviser_name === 'Maria Santos',
      'Assignment verified by a fresh GET /:id'
    );

    const patchClear = await request('PATCH', `/api/sections/${sectionA.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: null },
    });
    assert(
      patchClear.status === 200 && patchClear.data?.section?.adviser_id === null,
      'PATCH with adviser_id: null clears the adviser'
    );

    const rereadCleared = await request('GET', `/api/sections/${sectionA.id}`, { token: adminToken });
    assert(rereadCleared.data?.section?.adviser_id === null, 'Clear verified by a fresh GET /:id');

    // One teacher advising two sections: TCH-001 already advises Malikhain
    // (untouched throughout this suite) — assign them to sectionB too.
    const patchSecondSection = await request('PATCH', `/api/sections/${sectionB.id}/adviser`, {
      token: adminToken,
      body: { adviser_id: adviserId },
    });
    assert(
      patchSecondSection.status === 200 && patchSecondSection.data?.section?.adviser_id === adviserId,
      'One teacher (TCH-001) can advise a second section without being blocked'
    );

    const malikhainStillIntact = await request('GET', `/api/sections/${malikhainId}`, { token: adminToken });
    assert(
      malikhainStillIntact.data?.section?.adviser_id === adviserId,
      "Malikhain's own seeded adviser assignment is untouched by this suite"
    );
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
