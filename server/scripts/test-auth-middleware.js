/**
 * Unit test for middleware/auth.js — direct calls, no server, no HTTP, and
 * NO DATABASE: the pool is a stub planted in require.cache before the
 * middleware is loaded, scripted per call to return rows or to throw the way
 * node-postgres does when the database is down. That is the only way to prove
 * the outage path without stopping the database under every other suite
 * (fix/auth-503). Since Phase 3 (commit F, PostgreSQL) the stub answers pg's
 * shape, `{ rows, rowCount }`, and the scripted outages are pg's: a refused
 * socket (ECONNREFUSED), an administrator shutdown (57P01, where mysql2 said
 * PROTOCOL_CONNECTION_LOST) and a timeout; the coded query failure that must
 * stay a 500 is 42703 (undefined column, mysql2's ER_BAD_FIELD_ERROR).
 *
 * What it proves: a token problem is 401 and never touches the pool; a
 * database problem is 503 with the health endpoint's body and never 401;
 * every session verdict (cutoff, missing, inactive, version) is still 401;
 * the three account gates (feat/first-signin) answer in their order —
 * consent, contact, password — on the FULL path and the method; a good
 * session reaches next().
 *
 * Usage: npm run test:auth-middleware
 */
const path = require('path');

// ---- the stub pool, planted BEFORE the middleware is required ----------
const dbPath = require.resolve(path.join(__dirname, '..', 'config', 'db.js'));
const script = { answers: [], calls: 0 };
function scriptedError(code) {
  const err = new Error(`connect ${code} 127.0.0.1:5432`);
  err.code = code;
  return err;
}
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async () => {
      script.calls += 1;
      const next = script.answers.shift();
      if (next instanceof Error) throw next;
      const rows = next || [];
      return { rows, rowCount: rows.length };
    },
    getConnection: async () => {
      throw new Error('getConnection is not used by the middleware');
    },
  },
};

const { authenticate } = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { DB_UNAVAILABLE_BODY, isDbUnavailable } = require('../utils/dbUnavailable');

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

// Silence the middleware's console.error for the outage cases so the run
// reads clean; restored after.
const realError = console.error;
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(' '));

const ACTIVE = {
  id: 7,
  login_id: 'TCH-001',
  role: 'teacher',
  status: 'active',
  name: 'Test Teacher',
  // A confirmed address (long before any token here), so the contact gate is
  // clear: only its truthiness and the stamp are read.
  email: 'stub-address',
  contact_number: null,
  profile_pic: null,
  student_id: null,
  email_verified_at: new Date(0),
  contact_verified_at: null,
  password_changed_at: null,
  token_version: 0,
  must_change_password: 0,
  policy_accepted: 2, // both current documents: staff meet the consent gate since feat/staff-acceptance
};

// `reqPath` is the FULL path (the middleware joins baseUrl and path since
// feat/first-signin, so baseUrl stays empty here) and `method` is part of the
// gates' match.
async function run({ token, answers, reqPath = '/api/students', method = 'GET' }) {
  script.answers = answers;
  script.calls = 0;
  const req = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` }, method, baseUrl: '', path: reqPath };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  await authenticate(req, res, () => {
    nextCalled = true;
  });
  return { status: res.statusCode, body: res.body, next: nextCalled, calls: script.calls, req };
}

(async () => {
  console.log('\nmiddleware/auth.js unit tests (stubbed pool)\n');

  // A confirmation stamp AFTER the token's sign-in: "confirmed in this
  // session" for the forced-change cases (utils/accountGates.js).
  const SINCE = new Date(Date.now() + 60_000);
  const good = signToken({ id: ACTIVE.id, role: 'teacher', v: 0 });

  console.log('A database outage is 503, never 401:');
  {
    const r = await run({ token: good, answers: [scriptedError('ECONNREFUSED')] });
    assert(r.status === 503, 'pool throws on the cutoff read → 503', `got ${r.status}`);
    assert(
      JSON.stringify(r.body) === JSON.stringify(DB_UNAVAILABLE_BODY),
      'the 503 body is the health endpoint\'s, verbatim: { success: false, message: "Database unreachable." }',
      JSON.stringify(r.body)
    );
    assert(!r.next, 'next() is not called on an outage');
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], scriptedError('57P01')] });
    assert(r.status === 503 && r.body.message === 'Database unreachable.', 'pool throws on the users read → 503 too', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [new Error('some non-mysql throw inside the block')] });
    assert(r.status === 503, 'ANY throw inside the DB block is 503 — the block holds nothing but database work', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [scriptedError('ETIMEDOUT')] });
    const text = JSON.stringify(r.body).toLowerCase();
    assert(!/token/.test(text) && !/log ?in/.test(text), 'NEGATIVE CONTROL: the 503 body never says "token" or "log in" — nothing in it can be read as a session verdict');
    assert(logged.some((line) => /database unreachable/i.test(line)), 'the outage is console.error\'d naming the condition');
  }

  console.log('\nA token problem is 401 and never reaches the pool:');
  {
    const r = await run({ token: undefined, answers: [scriptedError('ECONNREFUSED')] });
    assert(r.status === 401 && r.body.message === 'Authentication required.', 'no token → 401 "Authentication required."', `got ${r.status}`);
    assert(r.calls === 0, 'no token → the pool was not called');
  }
  {
    const r = await run({ token: 'not.a.jwt', answers: [scriptedError('ECONNREFUSED')] });
    assert(r.status === 401 && r.body.message === 'Invalid or expired token.', 'garbage token → 401 "Invalid or expired token." (wording unchanged)', `got ${r.status} ${r.body && r.body.message}`);
    assert(r.calls === 0, 'garbage token → the pool was not called — verify runs BEFORE any database work, so an outage cannot mask a bad token or vice versa');
  }
  {
    const expired = signToken({ id: ACTIVE.id, role: 'teacher', v: 0 });
    // An expired token: sign with a negative lifetime through jsonwebtoken directly.
    const jwt = require('jsonwebtoken');
    const dead = jwt.sign({ id: ACTIVE.id, v: 0 }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: -10 });
    const r = await run({ token: dead, answers: [scriptedError('ECONNREFUSED')] });
    assert(r.status === 401 && r.calls === 0, 'expired token → 401 with no pool call', `got ${r.status}, calls ${r.calls}`);
    assert(typeof expired === 'string', 'a fresh token signs (control for the expired case)');
  }

  console.log('\nEvery session verdict is still 401:');
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: new Date(Date.now() + 60_000) }]] });
    assert(r.status === 401 && /restore/.test(r.body.message), 'issued before the restore cutoff → 401 naming the restore', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], []] });
    assert(r.status === 401 && r.body.message === 'User not found.', 'user row missing → 401', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, status: 'inactive' }]] });
    assert(r.status === 401 && r.body.message === 'Account is not active.', 'inactive account → 401', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, token_version: 2 }]] });
    assert(r.status === 401 && /password was changed/.test(r.body.message), 'token_version mismatch → 401', `got ${r.status}`);
  }

  console.log('\nThe forced change and the good path are untouched:');
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }]] });
    assert(r.status === 403 && r.body.code === 'MUST_CHANGE_PASSWORD', 'must_change_password off /me → 403 with the code', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }]], reqPath: '/api/auth/me' });
    assert(r.next && r.req.user && r.req.user.must_change_password === 1, 'must_change_password on /me → next()');
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [ACTIVE]] });
    assert(r.next && r.status === 200 && r.req.user && r.req.user.id === ACTIVE.id, 'a live session → next() with req.user set');
    assert(r.calls === 2, 'a live session costs exactly two pool calls', `got ${r.calls}`);
  }

  console.log('\nisDbUnavailable — what /me treats as an outage:');
  assert(isDbUnavailable(scriptedError('ECONNREFUSED')) && isDbUnavailable(scriptedError('57P01')), 'connection-level codes are an outage');
  {
    const sqlError = new Error("Unknown column 'nope' in 'field list'");
    sqlError.code = '42703';
    assert(!isDbUnavailable(sqlError) && !isDbUnavailable(new Error('plain')) && !isDbUnavailable(null), 'NEGATIVE CONTROL: a SQL error, a plain Error and null are NOT an outage — those stay 500');
  }

  console.log('\nThe three account gates (feat/first-signin): consent, then contact, then password, on full paths');
  const NOTHING_CONFIRMED = { ...ACTIVE, email_verified_at: null, contact_verified_at: null };
  const gateCase = (row, reqPath, method = 'GET') =>
    run({ token: good, answers: [[{ token_valid_after: null }], [row]], reqPath, method });
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0, must_change_password: 1 }, '/api/students');
    assert(
      r.status === 403 && r.body.code === 'POLICY_ACCEPTANCE_REQUIRED',
      'all three pending: the consent gate answers first',
      `got ${r.status} ${r.body && r.body.code}`
    );
  }
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0 }, '/api/policy/accept', 'POST');
    const s = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0 }, '/api/policy');
    assert(r.next && s.next, 'consent pending: /api/policy and /api/policy/* pass');
  }
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0 }, '/api/policyx');
    assert(r.status === 403, 'consent pending: a path that only begins with /api/policy is refused');
  }
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0 }, '/api/auth/email', 'PUT');
    assert(r.status === 403 && r.body.code === 'POLICY_ACCEPTANCE_REQUIRED', 'consent pending: PUT /auth/email waits for consent');
  }
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, policy_accepted: 0 }, '/api/auth/change-password', 'PUT');
    assert(
      r.status === 403 && r.body.code === 'POLICY_ACCEPTANCE_REQUIRED',
      'consent pending: PUT /auth/change-password is no longer let through'
    );
  }
  {
    const r = await gateCase(NOTHING_CONFIRMED, '/api/students');
    assert(
      r.status === 403 &&
        r.body.code === 'CONTACT_VERIFICATION_REQUIRED' &&
        r.body.message === 'Confirm your Gmail or mobile number before continuing.' &&
        r.body.success === false,
      'nothing confirmed: 403 CONTACT_VERIFICATION_REQUIRED with its sentence',
      `got ${r.status} ${JSON.stringify(r.body)}`
    );
  }
  for (const [method, p] of [
    ['GET', '/api/auth/me'],
    ['PUT', '/api/auth/email'],
    ['PUT', '/api/auth/contact'],
    ['POST', '/api/auth/verify-email/request'],
    ['POST', '/api/auth/verify-email/confirm'],
    ['POST', '/api/auth/verify-contact/request'],
    ['POST', '/api/auth/verify-contact/confirm'],
    ['GET', '/api/policy'],
  ]) {
    const r = await gateCase(NOTHING_CONFIRMED, p, method);
    assert(r.next, `contact pending: ${method} ${p} passes`, `got ${r.status}`);
  }
  {
    const r = await gateCase(NOTHING_CONFIRMED, '/api/auth/email', 'GET');
    assert(r.status === 403, 'contact pending: the method is part of the match (GET /api/auth/email refused)');
  }
  {
    const r = await gateCase(NOTHING_CONFIRMED, '/api/auth/first-password', 'PUT');
    const s = await gateCase(NOTHING_CONFIRMED, '/api/auth/change-password', 'PUT');
    assert(
      r.status === 403 && r.body.code === 'CONTACT_VERIFICATION_REQUIRED' && s.status === 403,
      'contact pending: neither password endpoint passes'
    );
  }
  {
    const r = await gateCase(
      { ...NOTHING_CONFIRMED, email: null, contact_number: 'stub-number', contact_verified_at: new Date(0) },
      '/api/students'
    );
    assert(r.next, 'a confirmed mobile number alone clears the contact gate');
  }
  {
    const r = await gateCase({ ...NOTHING_CONFIRMED, email: null, email_verified_at: new Date(0) }, '/api/students');
    assert(
      r.status === 403 && r.body.code === 'CONTACT_VERIFICATION_REQUIRED',
      'a confirmation stamp with no address behind it does not count'
    );
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1 }, '/api/students');
    assert(
      r.status === 403 && r.body.code === 'CONTACT_VERIFICATION_REQUIRED',
      'forced change confirmed only BEFORE this sign-in: the contact gate (confirm it again)'
    );
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1 }, '/api/auth/verify-email/request', 'POST');
    assert(r.next, 'forced change, reconfirm: the verify request passes');
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }, '/api/auth/first-password', 'PUT');
    assert(r.next, 'forced change confirmed since this sign-in: PUT /auth/first-password passes');
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }, '/api/auth/change-password', 'PUT');
    assert(
      r.status === 403 && r.body.code === 'MUST_CHANGE_PASSWORD',
      'forced change: PUT /auth/change-password is refused (first-password replaces it)'
    );
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }, '/api/auth/email', 'PUT');
    assert(r.status === 403 && r.body.code === 'MUST_CHANGE_PASSWORD', 'password gate: the contact paths are closed again');
  }
  {
    const r = await gateCase({ ...ACTIVE, must_change_password: 1, email_verified_at: SINCE }, '/api/users/me');
    assert(
      r.status === 403 && r.body.code === 'MUST_CHANGE_PASSWORD',
      'full-path matching: /api/users/me is not /api/auth/me (the router-relative hole is closed)'
    );
  }
  {
    const r = await gateCase(ACTIVE, '/api/students');
    assert(r.next && typeof r.req.tokenIat === 'number', "a clear session carries the token's iat as req.tokenIat");
  }

  console.error = realError;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error = realError;
  console.error('Test runner error:', err);
  process.exit(1);
});
