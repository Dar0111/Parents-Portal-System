/**
 * JWT_SECRET fails closed in production (Module 10, 2026-10-30) — a UNIT
 * test: no database, no running API, and NO .env: this file never loads
 * dotenv, and every child process gets a minimal environment built here
 * (the OS path keys plus the case's NODE_ENV and JWT_SECRET), so a real
 * secret in the shell cannot reach a case.
 *
 * Proves, in BOTH modes:
 *   production (NODE_ENV trimmed, any case) — a missing, empty, blank or
 *   default JWT_SECRET throws a message naming the key and carrying no
 *   value; so, since M18 (D-137), does one that starts with the old
 *   server/.env.example's placeholder prefix (trimmed, any case) or is
 *   shorter than 32 characters after trimming; a real value is returned
 *   unchanged; loading utils/jwt.js in a child exits non-zero, and so does
 *   loading middleware/auth.js through test-auth-middleware.js, while with a
 *   real value both load and a token signs and verifies;
 *   development (NODE_ENV unset, development, test) — the fallback is
 *   unchanged, and neither M18 check applies.
 * Negative controls: the old resolver (`JWT_SECRET || default`) is caught by
 * the same production checks, and Module 10's resolver (missing, blank,
 * default) does not refuse a placeholder-shaped value, which A does.
 *
 * THE PLACEHOLDER'S FULL VALUE IS NEVER WRITTEN HERE (KNOWN_ISSUES): the
 * cases use the prefix plus a filler of this file's own.
 *
 * Usage: npm run test:jwt-secret
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveJwtSecret, DEV_DEFAULT_SECRET } = require('../utils/jwt');

const JWT_PATH = path.join(__dirname, '..', 'utils', 'jwt.js');
const MIDDLEWARE_SUITE = path.join(__dirname, 'test-auth-middleware.js');
const TEST_VALUE = 'module10-test-value-not-a-secret-0123456789';

// M18's two requirements, stated here as the spec rather than imported, so a
// change to utils/jwt.js cannot quietly move the bar the test holds it to.
const PLACEHOLDER_PREFIX = 'change-this-';
const MIN_LENGTH = 32;
const PLACEHOLDER_SHAPED = `${PLACEHOLDER_PREFIX}m18-test-filler-not-the-old-value`;
const SHORT_VALUE = 'm18-short-'.padEnd(MIN_LENGTH - 1, '0');
const EXACT_MIN_VALUE = 'm18-exact-'.padEnd(MIN_LENGTH, '0');

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

// The error a call throws, or null when it returns.
function thrown(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

// What a production refusal must look like: it names the key and production,
// and it carries no value — neither the one configured nor the default.
function refusal(err, value) {
  if (!err) return false;
  const m = String(err.message);
  return m.includes('JWT_SECRET') && /production/.test(m) && !m.includes(DEV_DEFAULT_SECRET) && (!value || !value.trim() || !m.includes(value.trim()));
}

// The OS keys a Windows or Linux child needs to start, and nothing else.
function childEnv(extra) {
  const env = {};
  for (const key of Object.keys(process.env)) {
    if (/^(path|systemroot|temp|tmp)$/i.test(key)) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

const LOAD_AND_SIGN = "const j = require(process.argv[1]); const t = j.signToken({ id: 1 }); if (j.verifyToken(t).id !== 1) process.exit(3); console.log('ok');";

function loadJwt(extra) {
  return spawnSync(process.execPath, ['-e', LOAD_AND_SIGN, JWT_PATH], { env: childEnv(extra), encoding: 'utf8' });
}

function runMiddlewareSuite(extra) {
  return spawnSync(process.execPath, [MIDDLEWARE_SUITE], { env: childEnv(extra), encoding: 'utf8' });
}

function run() {
  console.log('\nParents Portal — JWT_SECRET fails closed in production (unit)\n');

  console.log('A. Production, the resolver:');
  for (const [label, value] of [
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['the public default', DEV_DEFAULT_SECRET],
    ['the default with spaces', `  ${DEV_DEFAULT_SECRET}  `],
    ['the old template placeholder prefix (M18)', PLACEHOLDER_SHAPED],
    ['the placeholder prefix with spaces (M18)', `  ${PLACEHOLDER_SHAPED}  `],
    ['the placeholder prefix in capitals (M18)', PLACEHOLDER_SHAPED.toUpperCase()],
    [`${MIN_LENGTH - 1} characters, one short of the minimum (M18)`, SHORT_VALUE],
  ]) {
    const env = { NODE_ENV: 'production' };
    if (value !== undefined) env.JWT_SECRET = value;
    const err = thrown(() => resolveJwtSecret(env));
    assert(refusal(err, value), `${label} → refused, naming JWT_SECRET and no value`, err ? err.message : 'returned instead');
  }
  assert(
    /missing/.test(String((thrown(() => resolveJwtSecret({ NODE_ENV: 'production' })) || {}).message)),
    'missing → the "missing" sentence'
  );
  assert(
    /public development default/.test(String((thrown(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: DEV_DEFAULT_SECRET })) || {}).message)),
    'the default → the "public development default" sentence'
  );
  assert(
    /old template placeholder/.test(String((thrown(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: PLACEHOLDER_SHAPED })) || {}).message)),
    'the placeholder prefix → the "old template placeholder" sentence (M18)'
  );
  assert(
    new RegExp(`shorter than ${MIN_LENGTH} characters`).test(String((thrown(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: SHORT_VALUE })) || {}).message)),
    `a short value → the "shorter than ${MIN_LENGTH} characters" sentence (M18)`
  );
  assert(
    resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: EXACT_MIN_VALUE }) === EXACT_MIN_VALUE,
    `exactly ${MIN_LENGTH} characters → returned unchanged (M18)`
  );
  assert(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: TEST_VALUE }) === TEST_VALUE, 'a real value → returned unchanged');
  for (const mode of [' Production ', 'PRODUCTION', 'production\n']) {
    assert(refusal(thrown(() => resolveJwtSecret({ NODE_ENV: mode })), undefined), `NODE_ENV ${JSON.stringify(mode)} counts as production (trimmed, any case)`);
  }

  console.log('\nB. Development, the resolver (unchanged):');
  for (const mode of [undefined, 'development', 'test']) {
    const env = mode === undefined ? {} : { NODE_ENV: mode };
    assert(resolveJwtSecret(env) === DEV_DEFAULT_SECRET, `NODE_ENV ${mode === undefined ? 'unset' : mode}, no secret → the development fallback`);
  }
  assert(resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: '' }) === DEV_DEFAULT_SECRET, 'development, empty → the fallback, as before');
  assert(resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: TEST_VALUE }) === TEST_VALUE, 'development, a set value → used as is');
  assert(
    resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: PLACEHOLDER_SHAPED }) === PLACEHOLDER_SHAPED,
    'development, the placeholder prefix → used as is (the M18 checks are production only)'
  );

  console.log('\nC. Loading utils/jwt.js in a child:');
  {
    const r = loadJwt({ NODE_ENV: 'production' });
    assert(r.status !== 0 && r.status !== null, 'production, no secret → the load exits non-zero', `status ${r.status}`);
    assert(r.stderr.includes('JWT_SECRET'), 'production, no secret → stderr names JWT_SECRET');
    assert(!r.stdout.includes('ok'), 'production, no secret → no token was signed');
  }
  {
    const r = loadJwt({ NODE_ENV: 'production', JWT_SECRET: DEV_DEFAULT_SECRET });
    assert(r.status !== 0 && r.status !== null, 'production, the default → the load exits non-zero', `status ${r.status}`);
    assert(r.stderr.includes('JWT_SECRET') && !r.stderr.includes(`'${DEV_DEFAULT_SECRET}'`), 'production, the default → stderr names the key, not the value');
  }
  {
    const r = loadJwt({ NODE_ENV: 'production', JWT_SECRET: PLACEHOLDER_SHAPED });
    assert(r.status !== 0 && r.status !== null, 'production, the placeholder prefix → the load exits non-zero (M18)', `status ${r.status}`);
    assert(
      r.stderr.includes('JWT_SECRET') && !r.stderr.includes(PLACEHOLDER_SHAPED) && !r.stdout.includes('ok'),
      'production, the placeholder prefix → stderr names the key, not the value, and nothing was signed (M18)'
    );
  }
  {
    const r = loadJwt({ NODE_ENV: 'production', JWT_SECRET: TEST_VALUE });
    assert(r.status === 0 && r.stdout.trim() === 'ok', 'production, a real value → loads, signs and verifies', `status ${r.status}`);
  }
  {
    const r = loadJwt({});
    assert(r.status === 0 && r.stdout.trim() === 'ok', 'development, no secret → loads on the fallback, as before', `status ${r.status}`);
  }

  console.log('\nD. test-auth-middleware.js under production:');
  {
    const r = runMiddlewareSuite({ NODE_ENV: 'production' });
    assert(r.status !== 0 && r.status !== null && r.stderr.includes('JWT_SECRET'), 'no secret → the middleware cannot load; the run exits non-zero naming JWT_SECRET', `status ${r.status}`);
  }
  {
    const r = runMiddlewareSuite({ NODE_ENV: 'production', JWT_SECRET: TEST_VALUE });
    const summary = (r.stdout.match(/(\d+) passed, (\d+) failed/) || []).slice(1).map(Number);
    assert(r.status === 0 && summary.length === 2 && summary[1] === 0, 'a real value → the middleware suite passes in production mode', `status ${r.status}, ${summary.join(' passed / ')} failed`);
  }

  console.log('\nE. Negative control — the old resolver:');
  const oldResolver = (env) => env.JWT_SECRET || DEV_DEFAULT_SECRET;
  assert(!refusal(thrown(() => oldResolver({ NODE_ENV: 'production' })), undefined), 'the old resolver, production + missing → NOT refused (A would catch it)');
  assert(
    !refusal(thrown(() => oldResolver({ NODE_ENV: 'production', JWT_SECRET: DEV_DEFAULT_SECRET })), DEV_DEFAULT_SECRET),
    'the old resolver, production + the default → NOT refused (A would catch it)'
  );
  // Module 10's resolver, as it stood before M18: missing, blank and the
  // default only.
  const module10Resolver = (env) => {
    const secret = env.JWT_SECRET;
    if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'production') return secret || DEV_DEFAULT_SECRET;
    if (typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET is missing and NODE_ENV is production.');
    if (secret.trim() === DEV_DEFAULT_SECRET) throw new Error('JWT_SECRET is the public development default and NODE_ENV is production.');
    return secret;
  };
  assert(
    !refusal(thrown(() => module10Resolver({ NODE_ENV: 'production', JWT_SECRET: PLACEHOLDER_SHAPED })), PLACEHOLDER_SHAPED),
    "Module 10's resolver, production + the placeholder prefix → NOT refused (A would catch it, M18)"
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

try {
  run();
} catch (err) {
  console.error('Test run crashed:', err);
  process.exit(1);
}
