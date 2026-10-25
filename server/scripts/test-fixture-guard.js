/**
 * The suites' fixture connection still refuses the hosted project — the
 * negative test the owner made a condition of the one exception (P3-C-R2
 * Phase L, 2026-10-26; scripts/test-helpers/db.js).
 *
 * config() is called with the PG_* keys and the flag set in THIS process's
 * environment, case by case; nothing ever connects — not even if the guard
 * were broken, because no case opens a connection. The stand-in CA is this file —
 * verify-full only needs a readable file to build its options, and no TLS
 * handshake happens.
 *
 * Usage: node scripts/test-fixture-guard.js
 */
const path = require('path');

const KEYS = ['PG_HOST', 'PG_PORT', 'PG_SSL', 'PG_CA_FILE', 'PORTAL_FIXTURE_HOSTED'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const helper = require(path.join(__dirname, 'test-helpers', 'db.js'));

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

function setEnv(values) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

// The guard's answer for one environment: 'accepted' or the error's message.
function outcome(values) {
  setEnv(values);
  try {
    helper.config();
    return 'accepted';
  } catch (error) {
    return `refused: ${error.message}`;
  }
}

const POOLER = 'aws-0-ap-southeast-1.pooler.supabase.com';
const CA = __filename;
const FLAG = { PORTAL_FIXTURE_HOSTED: helper.HOSTED_VALUE };
const VERIFY = { PG_SSL: 'verify-full', PG_CA_FILE: CA };

async function run() {
  console.log('\nThe fixture connection and the hosted project (scripts/test-helpers/db.js):');
  assert(helper.HOSTED_FLAG === 'PORTAL_FIXTURE_HOSTED' && helper.HOSTED_VALUE === 'staging-smoke', 'the flag is PORTAL_FIXTURE_HOSTED=staging-smoke');

  const loopback = outcome({ PG_HOST: '127.0.0.1' });
  assert(loopback === 'accepted', 'a loopback host is accepted, no flag needed', loopback);

  // The reference refusal: a hosted host that is no pooler, with no flag — the
  // guard's own message. Every negative case below must answer exactly it.
  const refusal = outcome({ PG_HOST: 'db.example.supabase.co', ...VERIFY });
  assert(refusal.startsWith('refused: ') && refusal.length > 'refused: '.length, 'the reference: a hosted non-pooler host without the flag is refused', refusal);

  const noFlag = outcome({ PG_HOST: POOLER, ...VERIFY });
  assert(noFlag === refusal, 'the pooler host WITHOUT the flag is refused (verify-full and a CA do not open it)', noFlag);

  const wrongValue = outcome({ PG_HOST: POOLER, ...VERIFY, PORTAL_FIXTURE_HOSTED: 'staging' });
  assert(wrongValue === refusal, 'a flag with any other value is refused the same way', wrongValue);

  const flagRequire = outcome({ PG_HOST: POOLER, PG_SSL: 'require', ...FLAG });
  assert(flagRequire === refusal, 'the flag with TLS that does not verify (require) is refused', flagRequire);

  const flagDisable = outcome({ PG_HOST: POOLER, PG_SSL: 'disable', ...FLAG });
  assert(flagDisable === refusal, 'the flag with TLS off is refused', flagDisable);

  const otherHost = outcome({ PG_HOST: 'db.example.supabase.co', ...VERIFY, ...FLAG });
  assert(otherHost === refusal, 'the flag with a hosted host that is not the session pooler is refused', otherHost);

  const lookalike = outcome({ PG_HOST: `${POOLER}.example.net`, ...VERIFY, ...FLAG });
  assert(lookalike === refusal, 'a look-alike host that only contains the pooler name is refused', lookalike);

  const allowed = outcome({ PG_HOST: POOLER, ...VERIFY, ...FLAG });
  assert(allowed === 'accepted', 'control: the flag, the pooler host and verify-full together are accepted (config only — nothing connects)', allowed);
  // NO createConnection() case: config() is the one gate (createConnection
  // builds its client from it), and a connection attempt in a test would
  // reach the network the moment the guard were broken — the first version of
  // this file did exactly that under its in-memory mutant (one TLS attempt to
  // a pooler host name, refused by the stand-in CA before any startup message).
}

run()
  .catch((error) => {
    failed += 1;
    console.error('Test runner error:', error.message);
  })
  .finally(() => {
    setEnv(Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)));
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
