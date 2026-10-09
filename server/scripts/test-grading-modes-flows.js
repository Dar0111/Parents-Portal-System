/**
 * GET /api/grading-modes tests.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Read-only against seeded grading_mode_configs. Does not insert or
 * delete config rows — a missing-config 409 is asserted against
 * school_year 2027-2028, which the seed has no rows for.
 *
 * Usage: npm run test:grading-modes
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Parent sign-ins accept the privacy notice and terms first; this run's rows
// go before it exits (scripts/policyFixture.js, feat/privacy).
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
  console.log(`\nParents Portal — Grading Modes API Tests (${BASE})\n`);

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

  const parentLogin = await login('1090001', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Grade 1)');

  const noAuth = await request('GET', '/api/grading-modes?grade_level=1');
  assert(noAuth.status === 401, 'GET without a token is 401');

  const missingGrade = await request('GET', '/api/grading-modes', { token: adminToken });
  assert(
    missingGrade.status === 400 && /grade_level/.test(missingGrade.data?.message || ''),
    'Missing grade_level is 400'
  );

  const badGrade = await request('GET', '/api/grading-modes?grade_level=9', { token: adminToken });
  assert(badGrade.status === 400, 'grade_level=9 is 400');

  const badYear = await request('GET', '/api/grading-modes?grade_level=1&school_year=2026', { token: adminToken });
  assert(
    badYear.status === 400 && /YYYY-YYYY/.test(badYear.data?.message || ''),
    'Malformed school_year is 400'
  );

  const settings = await request('GET', '/api/settings/academic_year', { token: adminToken });
  const academicYear = settings.data?.value;
  assert(typeof academicYear === 'string' && academicYear.length > 0, 'Resolve academic_year from settings');

  const grade1 = await request('GET', '/api/grading-modes?grade_level=1', { token: parentToken });
  assert(
    grade1.status === 200 &&
      grade1.data?.grading_mode?.mode === 'descriptive' &&
      grade1.data.grading_mode.grade_level === 1 &&
      grade1.data.grading_mode.school_year === academicYear,
    `Parent GET Grade 1 defaults to academic_year and mode descriptive (got ${JSON.stringify(grade1.data?.grading_mode)})`
  );

  const grade6 = await request('GET', `/api/grading-modes?grade_level=6&school_year=${academicYear}`, {
    token: teacherToken,
  });
  assert(
    grade6.status === 200 &&
      grade6.data?.grading_mode?.mode === 'numerical' &&
      grade6.data.grading_mode.grade_level === 6,
    `Teacher GET Grade 6 is numerical (got ${grade6.data?.grading_mode?.mode})`
  );

  const grade5 = await request('GET', '/api/grading-modes?grade_level=5', { token: adminToken });
  assert(
    grade5.status === 200 && grade5.data?.grading_mode?.mode === 'numerical',
    'Admin GET Grade 5 is numerical'
  );

  const missingConfig = await request('GET', '/api/grading-modes?grade_level=1&school_year=2027-2028', {
    token: adminToken,
  });
  assert(
    missingConfig.status === 409 &&
      /Grade 1/.test(missingConfig.data?.message || '') &&
      /2027-2028/.test(missingConfig.data?.message || ''),
    `Missing config for an unseeded year is 409 naming grade and year (got ${missingConfig.status} ${missingConfig.data?.message})`
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await policy.cleanup();
  process.exit(failed ? 1 : 0);
}

run().catch(async (err) => {
  await policy.cleanup().catch(() => {});
  console.error(err);
  process.exit(1);
});
