/**
 * Unit test for middleware/auth.js — direct calls, no server, no HTTP, and
 * NO DATABASE: the pool is a stub planted in require.cache before the
 * middleware is loaded, scripted per call to return rows or to throw the way
 * mysql2 does when MySQL is down. That is the only way to prove the outage
 * path without stopping MySQL under every other suite (fix/auth-503).
 *
 * What it proves: a token problem is 401 and never touches the pool; a
 * database problem is 503 with the health endpoint's body and never 401;
 * every session verdict (cutoff, missing, inactive, version) is still 401;
 * the forced-change 403 is untouched; a good session reaches next().
 *
 * Usage: npm run test:auth-middleware
 */
const path = require('path');

// ---- the stub pool, planted BEFORE the middleware is required ----------
const dbPath = require.resolve(path.join(__dirname, '..', 'config', 'db.js'));
const script = { answers: [], calls: 0 };
function scriptedError(code) {
  const err = new Error(`connect ${code} 127.0.0.1:3306`);
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
      return [next || []];
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
  email: null,
  contact_number: null,
  profile_pic: null,
  student_id: null,
  email_verified_at: null,
  password_changed_at: null,
  token_version: 0,
  must_change_password: 0,
  policy_accepted: 2, // both current documents: staff meet the consent gate since feat/staff-acceptance
};

async function run({ token, answers, reqPath = '/students' }) {
  script.answers = answers;
  script.calls = 0;
  const req = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` }, path: reqPath };
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
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], scriptedError('PROTOCOL_CONNECTION_LOST')] });
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
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, must_change_password: 1 }]] });
    assert(r.status === 403 && r.body.code === 'MUST_CHANGE_PASSWORD', 'must_change_password off /me → 403 with the code', `got ${r.status}`);
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [{ ...ACTIVE, must_change_password: 1 }]], reqPath: '/me' });
    assert(r.next && r.req.user && r.req.user.must_change_password === 1, 'must_change_password on /me → next()');
  }
  {
    const r = await run({ token: good, answers: [[{ token_valid_after: null }], [ACTIVE]] });
    assert(r.next && r.status === 200 && r.req.user && r.req.user.id === ACTIVE.id, 'a live session → next() with req.user set');
    assert(r.calls === 2, 'a live session costs exactly two pool calls', `got ${r.calls}`);
  }

  console.log('\nisDbUnavailable — what /me treats as an outage:');
  assert(isDbUnavailable(scriptedError('ECONNREFUSED')) && isDbUnavailable(scriptedError('PROTOCOL_CONNECTION_LOST')), 'connection-level codes are an outage');
  {
    const sqlError = new Error("Unknown column 'nope' in 'field list'");
    sqlError.code = 'ER_BAD_FIELD_ERROR';
    assert(!isDbUnavailable(sqlError) && !isDbUnavailable(new Error('plain')) && !isDbUnavailable(null), 'NEGATIVE CONTROL: a SQL error, a plain Error and null are NOT an outage — those stay 500');
  }

  console.error = realError;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error = realError;
  console.error('Test runner error:', err);
  process.exit(1);
});
