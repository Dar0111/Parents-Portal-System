/**
 * Unit test for the Socket.io handshake (socket.js → authenticateHandshake)
 * — direct calls, no server, no socket, and NO DATABASE: the pool is a stub
 * planted in require.cache before socket.js is loaded, scripted per call to
 * return rows or to throw the way mysql2 does when MySQL is down. The
 * test:auth-middleware pattern (fix/socket-handshake, 2026-10-11).
 *
 * What it proves: a token problem says "Invalid or expired token." and never
 * touches the pool; a database problem says "Database unreachable." with code
 * DB_UNAVAILABLE, never the token sentence; the restore cutoff and the
 * token's version refuse with the HTTP middleware's OWN sentences — each
 * verdict also runs through middleware/auth.js on the same rows and the two
 * messages are compared; PF2's two gates keep their sentence, code and order;
 * a good session reaches next() with socket.userId set.
 *
 * CONTROLS: every case runs again against socket.js compiled in memory with
 * the one check it depends on removed (or turned), and must FAIL there. A
 * mutation that does not match exactly once stops the run, so a control
 * cannot pass by mutating nothing.
 *
 * Usage: npm run test:socket-auth
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

// ---- the stub pool, planted BEFORE socket.js and the middleware load ------
const dbPath = require.resolve(path.join(__dirname, '..', 'config', 'db'));
const script = { answers: [], calls: 0 };
function scriptedError(code) {
  const err = new Error(`scripted ${code}`);
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
      throw new Error('the stub pool has no connections');
    },
  },
};

const socketPath = require.resolve(path.join(__dirname, '..', 'socket'));
const { authenticateHandshake } = require(socketPath);
const { authenticate } = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { DB_UNAVAILABLE_BODY } = require('../utils/dbUnavailable');
const policy = require('../utils/policy');

// socket.js compiled in memory with ONE change, never put in require.cache.
// Its own requires resolve beside the real file, so it gets the same stub.
const SOURCE = fs.readFileSync(socketPath, 'utf8');
function mutant(from, to) {
  const count = SOURCE.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`control mutation matched ${count} times, expected 1: ${from}`);
  }
  const m = new Module(socketPath, module);
  m.filename = socketPath;
  m.paths = Module._nodeModulePaths(path.dirname(socketPath));
  m._compile(SOURCE.replace(from, () => to), socketPath);
  return m.exports.authenticateHandshake;
}

// Silence the two outage logs (socket.js's and the middleware's) so the run
// reads clean; restored after, and asserted on.
const realError = console.error;
const logged = [];
console.error = (...args) => {
  const line = args.map(String).join(' ');
  if (/database unreachable/i.test(line)) logged.push(line);
  else realError(...args);
};

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    realError(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function viaSocket(handshake, { token, answers }) {
  script.answers = [...answers];
  script.calls = 0;
  const socket = { handshake: { auth: token === undefined ? {} : { token } } };
  let error = null;
  let nextCalls = 0;
  await handshake(socket, (err) => {
    nextCalls += 1;
    error = err || null;
  });
  return {
    message: error ? error.message : null,
    code: (error && error.data && error.data.code) || null,
    calls: script.calls,
    userId: socket.userId,
    nextCalls,
  };
}

// The same token and rows through the HTTP middleware, on a path past both
// gates' exemptions (not /me, /change-password or /api/policy).
async function viaHttp({ token, answers }) {
  script.answers = [...answers];
  script.calls = 0;
  const req = {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    baseUrl: '/api/students',
    path: '/',
  };
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
  await authenticate(req, res, () => {});
  return { status: res.statusCode, message: res.body && res.body.message, code: res.body && res.body.code };
}

const NOW = Math.floor(Date.now() / 1000);
const STATE_CLEAR = [{ token_valid_after: null }];
const TEACHER = { id: 7, role: 'teacher', status: 'active', token_version: 0, must_change_password: 0, policy_accepted: 0 };
const PARENT = { ...TEACHER, id: 9, role: 'parent' };

const good = signToken({ id: TEACHER.id, role: 'teacher', v: 0 });
const legacy = signToken({ id: TEACHER.id, role: 'teacher' });
const parentToken = signToken({ id: PARENT.id, role: 'parent', v: 0 });
// jsonwebtoken counts `exp` from a given `iat`, so this one expired long ago.
const expired = signToken({ id: TEACHER.id, role: 'teacher', v: 0, iat: NOW - 400 * 24 * 3600 });

const IF_FALSE = 'if (false) {';
const TOKEN_SENTENCE = 'Invalid or expired token.';
const admitted = (r) => r.message === null && r.nextCalls === 1;

const CASES = [
  {
    label: 'no token → "Authentication required.", the pool never called',
    input: { token: undefined, answers: [STATE_CLEAR, [TEACHER]] },
    check: (r) => r.message === 'Authentication required.' && r.calls === 0,
    control: ['if (!token) {', IF_FALSE],
  },
  {
    label: 'a malformed token → "Invalid or expired token.", the pool never called',
    input: { token: 'not.a.token', answers: [STATE_CLEAR, [TEACHER]] },
    check: (r, h) => r.message === TOKEN_SENTENCE && r.message === h.message && r.calls === 0,
    control: [`return next(new Error('${TOKEN_SENTENCE}'));`, 'decoded = {};'],
  },
  {
    label: 'an expired token → "Invalid or expired token.", the pool never called',
    input: { token: expired, answers: [STATE_CLEAR, [TEACHER]] },
    check: (r, h) => r.message === TOKEN_SENTENCE && r.message === h.message && r.calls === 0,
    control: [`return next(new Error('${TOKEN_SENTENCE}'));`, 'decoded = {};'],
  },
  {
    label: 'MySQL down on the first read → "Database unreachable." + DB_UNAVAILABLE (the HTTP 503 body), never the token sentence',
    input: { token: good, answers: [scriptedError('ECONNREFUSED')] },
    check: (r, h) =>
      r.message === DB_UNAVAILABLE_BODY.message &&
      r.code === 'DB_UNAVAILABLE' &&
      h.status === 503 &&
      h.message === r.message &&
      r.message !== TOKEN_SENTENCE,
    control: ["refusal(DB_UNAVAILABLE_BODY.message, 'DB_UNAVAILABLE')", `new Error('${TOKEN_SENTENCE}')`],
  },
  {
    label: 'the connection lost on the users read → "Database unreachable." + DB_UNAVAILABLE',
    input: { token: good, answers: [STATE_CLEAR, scriptedError('PROTOCOL_CONNECTION_LOST')] },
    check: (r, h) =>
      r.message === DB_UNAVAILABLE_BODY.message && r.code === 'DB_UNAVAILABLE' && h.status === 503 && r.calls === 2,
    control: ["refusal(DB_UNAVAILABLE_BODY.message, 'DB_UNAVAILABLE')", `new Error('${TOKEN_SENTENCE}')`],
  },
  {
    label: 'a token minted before the restore cutoff → the HTTP 401 sentence, the users row never read',
    input: { token: good, answers: [[{ token_valid_after: new Date(Date.now() + 60_000) }], [TEACHER]] },
    check: (r, h) => h.status === 401 && /restore/.test(h.message) && r.message === h.message && r.calls === 1,
    control: ['if (tokenValidAfter && decoded.iat * 1000 < new Date(tokenValidAfter).getTime()) {', IF_FALSE],
  },
  {
    label: 'a token minted after the restore cutoff → admitted',
    input: { token: good, answers: [[{ token_valid_after: new Date(Date.now() - 60_000) }], [TEACHER]] },
    check: (r) => admitted(r) && r.userId === TEACHER.id,
    control: [
      'decoded.iat * 1000 < new Date(tokenValidAfter).getTime()',
      'decoded.iat * 1000 >= new Date(tokenValidAfter).getTime()',
    ],
  },
  {
    label: 'no users row → "Account is not active." (the handshake\'s sentence, kept)',
    input: { token: good, answers: [STATE_CLEAR, []] },
    check: (r) => r.message === 'Account is not active.',
    control: ["if (!user || user.status !== 'active') {", IF_FALSE],
  },
  {
    label: 'an inactive account → "Account is not active.", the HTTP 401 sentence',
    input: { token: good, answers: [STATE_CLEAR, [{ ...TEACHER, status: 'inactive' }]] },
    check: (r, h) => h.status === 401 && r.message === h.message && r.message === 'Account is not active.',
    control: ["if (!user || user.status !== 'active') {", IF_FALSE],
  },
  {
    label: 'a token from before a password change (v 0, token_version 2) → the HTTP 401 sentence',
    input: { token: good, answers: [STATE_CLEAR, [{ ...TEACHER, token_version: 2 }]] },
    check: (r, h) => h.status === 401 && /password was changed/.test(h.message) && r.message === h.message,
    control: ['if ((decoded.v || 0) !== Number(user.token_version || 0)) {', IF_FALSE],
  },
  {
    label: 'a token with no `v` on a never-changed account → admitted (a missing v reads as 0)',
    input: { token: legacy, answers: [STATE_CLEAR, [TEACHER]] },
    check: (r) => admitted(r) && r.userId === TEACHER.id,
    control: ['(decoded.v || 0) !==', 'decoded.v !=='],
  },
  {
    label: 'the order: a stale version wins over the two gates, as in the HTTP middleware',
    input: { token: parentToken, answers: [STATE_CLEAR, [{ ...PARENT, token_version: 2, must_change_password: 1 }]] },
    check: (r, h) => r.message === h.message && /password was changed/.test(r.message),
    control: ['if ((decoded.v || 0) !== Number(user.token_version || 0)) {', IF_FALSE],
  },
  {
    label: 'PF2 — the forced change → its sentence and MUST_CHANGE_PASSWORD, as the HTTP 403',
    input: { token: good, answers: [STATE_CLEAR, [{ ...TEACHER, must_change_password: 1 }]] },
    check: (r, h) => h.status === 403 && r.message === h.message && r.code === 'MUST_CHANGE_PASSWORD' && r.code === h.code,
    control: ['if (user.must_change_password) {', IF_FALSE],
  },
  {
    label: 'PF2 — the forced change comes before the consent gate',
    input: { token: parentToken, answers: [STATE_CLEAR, [{ ...PARENT, must_change_password: 1 }]] },
    check: (r, h) => r.code === 'MUST_CHANGE_PASSWORD' && r.code === h.code,
    control: ['if (user.must_change_password) {', IF_FALSE],
  },
  {
    label: 'PF2 — a parent without the current notice and terms → its sentence and POLICY_ACCEPTANCE_REQUIRED, as the HTTP 403',
    input: { token: parentToken, answers: [STATE_CLEAR, [PARENT]] },
    check: (r, h) =>
      h.status === 403 && r.message === h.message && r.code === 'POLICY_ACCEPTANCE_REQUIRED' && r.code === h.code,
    control: ['if (policy.isPending(user.role, user.policy_accepted)) {', IF_FALSE],
  },
  {
    label: 'a parent who accepted both current documents → admitted',
    input: { token: parentToken, answers: [STATE_CLEAR, [{ ...PARENT, policy_accepted: policy.CURRENT.length }]] },
    check: (r) => admitted(r) && r.userId === PARENT.id,
    control: ['policy.isPending(user.role, user.policy_accepted)', 'policy.isPending(user.role, 0)'],
  },
  {
    label: 'a teacher (staff are not gated) → admitted, socket.userId set, two reads',
    input: { token: good, answers: [STATE_CLEAR, [TEACHER]] },
    check: (r) => admitted(r) && r.userId === TEACHER.id && r.calls === 2,
    control: ['socket.userId = user.id;', 'void 0;'],
  },
];

(async () => {
  console.log('Socket.io handshake — socket.js authenticateHandshake, stubbed pool\n');

  console.log('Cases, each beside the HTTP middleware on the same rows:');
  const http = [];
  for (const c of CASES) {
    const h = await viaHttp(c.input);
    http.push(h);
    const r = await viaSocket(authenticateHandshake, c.input);
    assert(c.check(r, h), c.label, `socket ${JSON.stringify(r)} · http ${JSON.stringify(h)}`);
  }

  console.log('\nControls — the same case against socket.js with its check removed must FAIL:');
  for (const [i, c] of CASES.entries()) {
    const handshake = mutant(c.control[0], c.control[1]);
    const r = await viaSocket(handshake, c.input);
    assert(!c.check(r, http[i]), `control: ${c.label}`, `the mutant passed: ${JSON.stringify(r)}`);
  }

  console.log('\nThe outage is logged, never shown:');
  assert(
    logged.some((line) => line.startsWith('Socket handshake: database unreachable:')),
    'socket.js logs "Socket handshake: database unreachable:" with the error'
  );

  console.error = realError;
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error = realError;
  console.error('Unexpected failure:', err);
  process.exit(1);
});
