/**
 * System Settings API tests — allow-list enforcement, per-key validation,
 * PATCH all-or-nothing. current_term (was current_quarter) is now validated
 * against a hardcoded ['1','2','3'] — the old live INFORMATION_SCHEMA ENUM
 * introspection was removed once DO 009 s.2026 confirmed three terms as a
 * settled DepEd fact, not a provisional placeholder (see routes/settings.js
 * and the Grades module CHANGELOG entry).
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: these are fixed seeded rows, not created ones. Original values
 * for academic_year, current_term, and logo_url are captured up front and
 * restored in a finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:settings
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

async function withDb(fn) {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
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
    typeof original.academic_year === 'string' && typeof original.current_term === 'string',
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

    // A row in system_settings that isn't in ALLOWED_KEYS (inserted directly,
    // bypassing the API entirely — the only way such a row could exist, since
    // PUT/PATCH already reject unknown keys) must not appear in the "list
    // all" response. This was a real bug: GET / had no WHERE filter, so it
    // returned every row in the table regardless of the allow-list.
    const unlistedKey = `test_unlisted_${Date.now()}`;
    await withDb((conn) =>
      conn.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [
        unlistedKey,
        'should never be readable',
      ])
    );
    try {
      const listAfterDirectInsert = await request('GET', '/api/settings', { token: adminToken });
      assert(
        !(unlistedKey in (listAfterDirectInsert.data?.settings || {})),
        'A row outside the allow-list does not appear in GET /api/settings, even if it exists in the table'
      );

      // The PATCH response used to re-read the whole table with no filter.
      const patchWhileUnlistedExists = await request('PATCH', '/api/settings', {
        token: adminToken,
        body: { settings: { current_term: original.current_term } },
      });
      assert(
        patchWhileUnlistedExists.status === 200 &&
          !(unlistedKey in (patchWhileUnlistedExists.data?.settings || {})),
        'A row outside the allow-list does not appear in the PATCH response either'
      );
    } finally {
      await withDb((conn) => conn.query('DELETE FROM system_settings WHERE setting_key = ?', [unlistedKey]));
    }

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

    const badTerm = await request('PUT', '/api/settings/current_term', {
      token: adminToken,
      body: { value: '5' },
    });
    assert(
      badTerm.status === 400 && /current_term must be one of/.test(badTerm.data?.message || ''),
      'current_term outside 1-3 rejected, naming the allowed values'
    );

    const validTerm = await request('PUT', '/api/settings/current_term', {
      token: adminToken,
      body: { value: '3' },
    });
    assert(validTerm.status === 200 && validTerm.data?.value === '3', 'Valid current_term accepted');

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

    // Validation always checked the trimmed value; storage used to keep the
    // raw one. The same text padded with spaces must be stored without them.
    // school_name is restored in the finally block below.
    const paddedPut = await request('PUT', '/api/settings/school_name', {
      token: adminToken,
      body: { value: `  ${original.school_name}  ` },
    });
    const afterPaddedPut = await request('GET', '/api/settings/school_name', { token: adminToken });
    assert(
      paddedPut.status === 200 &&
        paddedPut.data?.value === original.school_name &&
        afterPaddedPut.data?.value === original.school_name,
      'PUT stores the trimmed value — surrounding spaces are not saved'
    );

    const paddedPatch = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { school_name: `\t${original.school_name} ` } },
    });
    const afterPaddedPatch = await request('GET', '/api/settings/school_name', { token: adminToken });
    assert(
      paddedPatch.status === 200 &&
        paddedPatch.data?.settings?.school_name === original.school_name &&
        afterPaddedPatch.data?.value === original.school_name,
      'PATCH stores the trimmed value too'
    );

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
      body: { settings: { academic_year: '2028-2029', current_term: '9' } },
    });
    assert(patchBadValue.status === 400, 'PATCH with one invalid value rejects the whole request');

    const afterBadValuePatch = await request('GET', '/api/settings/academic_year', { token: adminToken });
    assert(
      afterBadValuePatch.data?.value === '2027-2028',
      'PATCH rejected on an invalid value wrote nothing — academic_year unchanged'
    );

    const patchOk = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { academic_year: '2029-2030', current_term: '2' } },
    });
    assert(
      patchOk.status === 200 &&
        patchOk.data?.settings?.academic_year === '2029-2030' &&
        patchOk.data?.settings?.current_term === '2',
      'PATCH with all valid keys updates every key'
    );

    // --- The four school_* keys (pre-Stage-5 #5a): each has its own rule,
    // and the public read carries exactly these plus name and address.
    console.log('\nSchool details keys:');

    const badSchoolId = await request('PUT', '/api/settings/school_id', { token: adminToken, body: { value: '12345' } });
    assert(badSchoolId.status === 400 && /6 digits/.test(badSchoolId.data?.message || ''), 'school_id of 5 digits is 400 naming the rule');
    const badSchoolEmail = await request('PUT', '/api/settings/school_email', {
      token: adminToken,
      body: { value: 'office@localhost' },
    });
    assert(badSchoolEmail.status === 400 && /name@example\.com/.test(badSchoolEmail.data?.message || ''), 'school_email without a dotted domain is 400, the email rule');
    const badSchoolPhone = await request('PUT', '/api/settings/school_phone', { token: adminToken, body: { value: 'call us' } });
    assert(badSchoolPhone.status === 400 && /7 to 15 digits/.test(badSchoolPhone.data?.message || ''), 'school_phone with letters is 400 naming the rule');
    const patchSchoolKeys = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: {
        settings: {
          school_id: '136893',
          school_email: '136893@deped.gov.ph',
          school_phone: '(02) 8350-6114',
          facebook_page: 'Captain H. Francisco Elementary School – Main',
        },
      },
    });
    assert(
      patchSchoolKeys.status === 200 &&
        patchSchoolKeys.data?.settings?.school_id === '136893' &&
        patchSchoolKeys.data?.settings?.school_phone === '(02) 8350-6114' &&
        patchSchoolKeys.data?.settings?.facebook_page === 'Captain H. Francisco Elementary School – Main',
      'PATCH of the four school keys stores each as typed (a landline with spaces and dashes accepted)'
    );

    // GET /settings/public — no token, six keys, nothing else.
    const publicRead = await request('GET', '/api/settings/public');
    const publicKeys = Object.keys(publicRead.data?.settings || {}).sort();
    assert(
      publicRead.status === 200 &&
        JSON.stringify(publicKeys) ===
          JSON.stringify(['facebook_page', 'school_address', 'school_email', 'school_id', 'school_name', 'school_phone']),
      `GET /settings/public needs no token and carries exactly the six school keys (got ${JSON.stringify(publicKeys)})`
    );
    const privateStillPrivate = await request('GET', '/api/settings');
    assert(privateStillPrivate.status === 401, 'GET /settings without a token is still 401 — only /public opened');
  } finally {
    // Restore every key this run may have touched, regardless of pass/fail.
    await request('PATCH', '/api/settings', {
      token: adminToken,
      body: {
        settings: {
          school_name: original.school_name,
          academic_year: original.academic_year,
          current_term: original.current_term,
          logo_url: original.logo_url,
          // The four school keys, restored to what this run found — a live
          // database that had none gets them back as '' (a valid state).
          school_id: original.school_id ?? '',
          school_email: original.school_email ?? '',
          school_phone: original.school_phone ?? '',
          facebook_page: original.facebook_page ?? '',
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
