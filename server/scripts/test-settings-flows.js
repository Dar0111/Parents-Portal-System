/**
 * System Settings API tests — allow-list enforcement, per-key validation,
 * PATCH all-or-nothing. current_term is NOT a setting since pre-Stage-5 #7
 * (2026-09-26): the term is derived from the date by utils/schoolCalendar.js,
 * so this suite asserts the key is refused as unknown and that a row left on
 * a live database never surfaces through the API.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: these are fixed seeded rows, not created ones. Original values
 * for academic_year and logo_url are captured up front and restored in a
 * finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:settings
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally (scripts/policyFixture.js, feat/privacy).
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

// PostgreSQL (Phase 3): the suites' one fixture connection, test-helpers/db.js.
const { withDb } = require('./test-helpers/db');

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
  await policy.accept(adminToken);
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  await policy.accept(teacherToken);
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  assert(parentLogin.status === 200 && parentToken, 'Parent login');

  // Capture originals before touching anything, so everything can be restored
  // in the finally block below regardless of what the test run does.
  const originalSettings = await request('GET', '/api/settings', { token: adminToken });
  const original = originalSettings.data?.settings || {};
  assert(
    typeof original.academic_year === 'string' && typeof original.logo_url === 'string',
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
        body: { settings: { academic_year: original.academic_year } },
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

    // current_term is RETIRED (pre-Stage-5 #7): the term comes from the school
    // calendar, never from a typed value, so the key is unknown to the API.
    const retiredTerm = await request('PUT', '/api/settings/current_term', {
      token: adminToken,
      body: { value: '3' },
    });
    assert(
      retiredTerm.status === 400 && !/current_term/.test(retiredTerm.data?.message || ''),
      'PUT current_term is the unknown-key 400, and the allowed list no longer names it'
    );
    // A live database upgraded from before #7 still holds the old row. It
    // must never reach a reader: GET / filters on the allow-list.
    const [[deadRow]] = await withDb((conn) =>
      conn.query("SELECT COUNT(*) AS n FROM system_settings WHERE setting_key = 'current_term'")
    );
    const listAfterRetire = await request('GET', '/api/settings', { token: adminToken });
    assert(
      listAfterRetire.status === 200 && !('current_term' in (listAfterRetire.data?.settings || {})),
      `GET /api/settings carries no current_term (a dead row ${deadRow.n ? 'EXISTS' : 'does not exist'} on this database)`
    );

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
      body: { settings: { academic_year: '2028-2029', school_id: '12' } },
    });
    assert(patchBadValue.status === 400, 'PATCH with one invalid value rejects the whole request');

    const afterBadValuePatch = await request('GET', '/api/settings/academic_year', { token: adminToken });
    assert(
      afterBadValuePatch.data?.value === '2027-2028',
      'PATCH rejected on an invalid value wrote nothing — academic_year unchanged'
    );

    const patchOk = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { academic_year: '2029-2030', logo_url: 'https://example.com/seal.png' } },
    });
    assert(
      patchOk.status === 200 &&
        patchOk.data?.settings?.academic_year === '2029-2030' &&
        patchOk.data?.settings?.logo_url === 'https://example.com/seal.png',
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

    // --- THE 64 KB TEXT CAP on every setting value (P3-C-R2 fix round, the
    // owner's answer of 2026-10-25): system_settings.setting_value was TEXT,
    // 65,535 bytes at most; utils/requestLimits.js keeps the cap after each
    // key's own validator, on PUT and PATCH alike. Only keys the finally
    // restores (school_name, logo_url) are written.
    console.log('\nThe 64 KB text cap on setting values:');
    const capMessage = (key) => `${key} must be 65,535 bytes or fewer.`;
    const putNamePast = await request('PUT', '/api/settings/school_name', { token: adminToken, body: { value: 'n'.repeat(65536) } });
    const putNamePastWide = await request('PUT', '/api/settings/school_name', { token: adminToken, body: { value: 'é'.repeat(32768) } });
    assert(
      putNamePast.status === 400 && putNamePast.data?.message === capMessage('school_name') &&
        putNamePastWide.status === 400 && putNamePastWide.data?.message === capMessage('school_name'),
      'PUT /settings/school_name: 65,536 bytes (ASCII, and as 32,768 é) is 400, naming the key',
      `got ${putNamePast.status} and ${putNamePastWide.status}`
    );
    const putNameAt = await request('PUT', '/api/settings/school_name', { token: adminToken, body: { value: 'é'.repeat(32767) + 'n' } });
    const readNameAt = await request('GET', '/api/settings/school_name', { token: adminToken });
    assert(
      putNameAt.status === 200 && readNameAt.data?.value === 'é'.repeat(32767) + 'n',
      'PUT /settings/school_name: 65,535 bytes (é) is 200, stored whole',
      `got ${putNameAt.status}`
    );
    const patchLogoPast = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { logo_url: 'l'.repeat(65536) } },
    });
    const patchLogoAt = await request('PATCH', '/api/settings', {
      token: adminToken,
      body: { settings: { logo_url: 'l'.repeat(65535) } },
    });
    assert(
      patchLogoPast.status === 400 && patchLogoPast.data?.message === `logo_url: ${capMessage('logo_url')}` &&
        patchLogoAt.status === 200 && patchLogoAt.data?.settings?.logo_url === 'l'.repeat(65535),
      'PATCH /settings: logo_url of 65,536 bytes is 400, of 65,535 bytes 200 and stored whole',
      `got ${patchLogoPast.status} and ${patchLogoAt.status}`
    );
  } finally {
    // Restore every key this run may have touched, regardless of pass/fail.
    await request('PATCH', '/api/settings', {
      token: adminToken,
      body: {
        settings: {
          school_name: original.school_name,
          academic_year: original.academic_year,
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
    // This run's acceptances go LAST: the restore above is signed with the
    // admin's token, and staff meet the consent gate since
    // feat/staff-acceptance — removing them first got the restore a 403.
    await policy.cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
