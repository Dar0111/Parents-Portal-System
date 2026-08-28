/**
 * System Settings API tests — allow-list enforcement, per-key validation,
 * PATCH all-or-nothing, and a source check confirming current_quarter's
 * validator actually reads grades.quarter's ENUM rather than a hardcoded list.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: these are fixed seeded rows, not created ones. Original values
 * for academic_year, current_quarter, and logo_url are captured up front and
 * restored in a finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:settings
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

async function run() {
  console.log(`\nParents Portal — System Settings API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login');

  // Capture originals before touching anything, so everything can be restored
  // in the finally block below regardless of what the test run does.
  const originalSettings = await request('GET', '/api/settings', { token: adminToken });
  const original = originalSettings.data?.settings || {};
  assert(
    typeof original.academic_year === 'string' && typeof original.current_quarter === 'string',
    'Captured original settings for restore'
  );

  try {
    // --- Reads: open to all roles ---
    console.log('\nReads:');

    assert(originalSettings.status === 200 && original.school_name, 'Admin GET /api/settings');

    const teacherGetAll = await request('GET', '/api/settings', { token: teacherToken });
    assert(teacherGetAll.status === 200, 'Teacher GET /api/settings');

    const parentGetAll = await request('GET', '/api/settings', { token: parentToken });
    assert(parentGetAll.status === 200, 'Parent GET /api/settings');

    const getOne = await request('GET', '/api/settings/academic_year', { token: parentToken });
    assert(getOne.status === 200 && getOne.data?.value === original.academic_year, 'GET /api/settings/:key');

    const getUnknown = await request('GET', '/api/settings/nonexistent_key', { token: adminToken });
    assert(getUnknown.status === 404, 'GET on an unknown key returns 404');

    // --- Write permission ---
    console.log('\nWrite permission:');

    const teacherWrite = await request('PUT', '/api/settings/school_name', {
      token: teacherToken,
      body: { value: 'Hijacked' },
    });
    assert(teacherWrite.status === 403, 'Teacher cannot write a setting');

    const parentWrite = await request('PUT', '/api/settings/school_name', {
      token: parentToken,
      body: { value: 'Hijacked' },
    });
    assert(parentWrite.status === 403, 'Parent cannot write a setting');

    // --- Allow-list enforcement ---
    console.log('\nAllow-list:');

    const unknownKeyPut = await request('PUT', '/api/settings/mascot', {
      token: adminToken,
      body: { value: 'Eagles' },
    });
    assert(
      unknownKeyPut.status === 400 && /Allowed keys/.test(unknownKeyPut.data?.message || ''),
      'PUT on an unknown key returns 400 naming the allowed keys'
    );

    // --- Per-key validation ---
    console.log('\nValidation:');

    const badYearFormat = await request('PUT', '/api/settings/academic_year', {
      token: adminToken,
      body: { value: '2026' },
    });
    assert(badYearFormat.status === 400, 'academic_year not matching YYYY-YYYY rejected');

    const nonConsecutiveYear = await request('PUT', '/api/settings/academic_year', {
      token: adminToken,
      body: { value: '2026-2028' },
    });
    assert(nonConsecutiveYear.status === 400, 'academic_year with non-consecutive years rejected');

    const validYear = await request('PUT', '/api/settings/academic_year', {
      token: adminToken,
      body: { value: '2027-2028' },
    });
    assert(validYear.status === 200 && validYear.data?.value === '2027-2028', 'Valid academic_year accepted');

    const badQuarter = await request('PUT', '/api/settings/current_quarter', {
      token: adminToken,
      body: { value: 'Q5' },
    });
    assert(
      badQuarter.status === 400 && /current_quarter must be one of/.test(badQuarter.data?.message || ''),
      'current_quarter outside the ENUM rejected, naming the allowed values'
    );

    const validQuarter = await request('PUT', '/api/settings/current_quarter', {
      token: adminToken,
      body: { value: 'Q3' },
    });
    assert(validQuarter.status === 200 && validQuarter.data?.value === 'Q3', 'Valid current_quarter accepted');

    const emptyLogo = await request('PUT', '/api/settings/logo_url', {
      token: adminToken,
      body: { value: '' },
    });
    assert(emptyLogo.status === 200 && emptyLogo.data?.value === '', 'Empty logo_url accepted');

    const emptySchoolName = await request('PUT', '/api/settings/school_name', {
      token: adminToken,
      body: { value: '   ' },
    });
    assert(emptySchoolName.status === 400, 'Blank school_name rejected');

    // --- PATCH: all-or-nothing ---
    console.log('\nPATCH (all-or-nothing):');

    const patchUnknownKey = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { academic_year: '2028-2029', mascot: 'Eagles' } },
    });
    assert(
      patchUnknownKey.status === 400 && /mascot/.test(patchUnknownKey.data?.message || ''),
      'PATCH with one unknown key rejects the whole request, naming it'
    );

    const afterBadKeyPatch = await request('GET', '/api/settings/academic_year', { token: adminToken });
    assert(
      afterBadKeyPatch.data?.value === '2027-2028',
      'PATCH rejected on an unknown key wrote nothing — academic_year unchanged'
    );

    const patchBadValue = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { academic_year: '2028-2029', current_quarter: 'Q9' } },
    });
    assert(patchBadValue.status === 400, 'PATCH with one invalid value rejects the whole request');

    const afterBadValuePatch = await request('GET', '/api/settings/academic_year', { token: adminToken });
    assert(
      afterBadValuePatch.data?.value === '2027-2028',
      'PATCH rejected on an invalid value wrote nothing — academic_year unchanged'
    );

    const patchOk = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { academic_year: '2029-2030', current_quarter: 'Q4' } },
    });
    assert(
      patchOk.status === 200 &&
        patchOk.data?.settings?.academic_year === '2029-2030' &&
        patchOk.data?.settings?.current_quarter === 'Q4',
      'PATCH with all valid keys updates every key'
    );

    // --- Mechanism check: does current_quarter really read the ENUM? ---
    console.log('\ncurrent_quarter validator mechanism:');

    // A pure HTTP test can't distinguish "reads the live ENUM" from "hardcoded
    // to today's ENUM values" — both accept Q1-Q4 and reject Q5 identically
    // unless the ENUM itself changes, and mutating grades.quarter mid-test-run
    // was explicitly ruled out. This is a source check instead: it confirms the
    // shipped code actually queries INFORMATION_SCHEMA for grades.quarter,
    // rather than just asserting behavior that a hardcoded list would also
    // produce today.
    const fs = require('fs');
    const path = require('path');
    const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'settings.js'), 'utf8');
    assert(
      /INFORMATION_SCHEMA\.COLUMNS/i.test(settingsSource) &&
        /TABLE_NAME\s*=\s*'grades'/i.test(settingsSource) &&
        /COLUMN_NAME\s*=\s*'quarter'/i.test(settingsSource),
      'current_quarter validator reads grades.quarter live from INFORMATION_SCHEMA, not a hardcoded list'
    );
  } finally {
    // Restore every key this run may have touched, regardless of pass/fail.
    await request('PATCH', '/api/settings', {
      token: adminToken,
      body: {
        settings: {
          school_name: original.school_name,
          academic_year: original.academic_year,
          current_quarter: original.current_quarter,
          logo_url: original.logo_url,
        },
      },
    });
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
