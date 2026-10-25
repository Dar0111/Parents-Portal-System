#!/usr/bin/env node
// THE TEST OF `staging-api.js --smoke-live` (the post-cutover web smoke, the
// owner's Q8 (b)) — on the embedded local cluster ONLY. Every launcher it
// starts is passed --local AND runs under test-loopback-guard.js
// (NODE_OPTIONS=--require, inherited by Playwright and its workers), so even
// a broken guard in the launcher cannot open a connection off the loopback:
// no run of this test can reach the Supabase project. Check 0 proves the
// guard is live first.
//
//   node scripts/test-smoke-live.js          the checks that need no servers
//   node scripts/test-smoke-live.js --e2e    and the whole smoke, against a
//       local API on 127.0.0.1:5000 and Vite on http://localhost:3000 that
//       the operator started first, on the embedded cluster
//
// Run it under the session's runner, which supplies the embedded cluster's
// PG_* keys (the launcher's --local mode reads them from its environment).
//
//   0. The guard is live: a child under it cannot open a socket to an
//      address off the loopback (a TEST-NET address that routes nowhere).
//   1. --local without --smoke-live: refused, exit 2.
//   2. --smoke-live --local with PG_HOST not the loopback: refused, exit 2,
//      before any request or count.
//   3. --smoke-live --local with the flag already in the launcher's own
//      shell: refused, exit 2 — the flag belongs to the smoke child only.
//   4. --smoke-live --local with nothing on 5000: exit 1, before any count
//      (skipped, and said so, when something answers on 5000).
//   5. The source: the flag is only ever a KEY of a child's environment
//      object; nothing assigns to process.env; no .env file in this tree
//      names the flag.
//   6. --e2e: the whole smoke — exit 0, 20 passed, the counts by role MATCH,
//      and the launcher reports the flag absent from its own process before
//      and after the run.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LAUNCHER = path.join(__dirname, 'staging-api.js');
const REPO = path.join(__dirname, '..', '..');
const FLAG = 'PORTAL_FIXTURE_HOSTED';
const E2E = process.argv.includes('--e2e');
const RUN_TIMEOUT_MS = E2E ? 15 * 60 * 1000 : 60 * 1000;

const results = [];
function check(name, ok, note) {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${results.length}. ${name}${!ok && note ? ` — ${note}` : ''}`);
}

const GUARD = path.join(__dirname, 'test-loopback-guard.js');
// forward slashes: inside NODE_OPTIONS's double quotes a backslash escapes
const GUARDED_OPTIONS = `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''}--require "${GUARD.replace(/\\/g, '/')}"`;

function guarded(argv, envPatch, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, NODE_OPTIONS: GUARDED_OPTIONS, ...envPatch };
    const child = spawn(process.execPath, argv, {
      cwd: path.join(__dirname, '..'),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s) => {
      out += s;
    });
    child.stderr.on('data', (s) => {
      out += s;
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code === null ? `signal ${signal}` : code, out });
    });
  });
}

const launcher = (args, envPatch, timeoutMs) => guarded([LAUNCHER, ...args], envPatch, timeoutMs);

// TEST-NET-1 (RFC 5737): routes nowhere, so even an unguarded attempt is inert.
const PROBE = [
  '-e',
  "try { require('net').connect(9, '192.0.2.1'); } catch (e) { console.log(e.message); process.exit(/loopback guard/.test(e.message) ? 0 : 1); } console.log('not blocked'); process.exit(1);",
];

async function answers(url) {
  return fetch(url, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.status)
    .catch(() => null);
}

function envFilesNaming(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) envFilesNaming(full, found);
    else if (/^\.env/.test(entry.name) && fs.readFileSync(full, 'utf8').includes(FLAG)) found.push(entry.name);
  }
  return found;
}

async function main() {
  if (process.env.PG_HOST !== '127.0.0.1') throw new Error('run this under the session runner (the embedded cluster PG_* keys are missing)');
  if (process.env[FLAG] !== undefined) throw new Error(`${FLAG} is set in this shell; clear it first`);

  const r0 = await guarded(PROBE, {});
  check('the loopback guard is live in the children (a socket off the loopback is refused)', r0.code === 0 && /loopback guard/.test(r0.out), `exit ${r0.code}: ${r0.out.trim().split(/\r?\n/)[0]}`);
  if (r0.code !== 0) throw new Error('the loopback guard is not live — nothing else is run');

  const r1 = await launcher(['--local'], {});
  check('--local without --smoke-live is refused (exit 2)', r1.code === 2 && /--local goes with --smoke-live only/.test(r1.out), `exit ${r1.code}`);

  const r2 = await launcher(['--smoke-live', '--local'], { PG_HOST: 'db.invalid' });
  check('--smoke-live --local with PG_HOST off the loopback is refused (exit 2) before any request or count', r2.code === 2 && !/counts BEFORE/.test(r2.out) && !/nothing answers/.test(r2.out), `exit ${r2.code}`);

  const r3 = await launcher(['--smoke-live', '--local'], { [FLAG]: 'staging-smoke' });
  check('the flag already in the launcher\'s own shell is refused (exit 2)', r3.code === 2 && /belongs to the smoke child's environment only/.test(r3.out), `exit ${r3.code}`);

  const busy = (await answers('http://127.0.0.1:5000/api/health')) !== null;
  if (busy) {
    console.log('skip: something answers on 5000 (the --e2e servers), so the nothing-on-5000 case is not run');
  } else {
    const r4 = await launcher(['--smoke-live', '--local'], {});
    check('nothing on 5000: exit 1 before any count', r4.code === 1 && /nothing answers http:\/\/127\.0\.0\.1:5000\/api\/health/.test(r4.out) && !/counts BEFORE/.test(r4.out), `exit ${r4.code}`);
  }

  const src = fs.readFileSync(LAUNCHER, 'utf8');
  const assigns = /process\.env\s*(\.\s*PORTAL_FIXTURE_HOSTED|\[\s*FLAG\s*\]|\[\s*['"]PORTAL_FIXTURE_HOSTED['"]\s*\])\s*=(?!=)/.test(src)
    || /process\.env\s*=(?!=)/.test(src)
    || /Object\.assign\(\s*process\.env/.test(src);
  const keyUses = (src.match(/\[FLAG\]: FLAG_VALUE/g) || []).length + (src.match(/PORTAL_FIXTURE_HOSTED: '/g) || []).length;
  check('the source: nothing assigns to process.env; the flag is a key of a child environment object (2 places: --smoke, --smoke-live)', !assigns && keyUses === 2, `assigns ${assigns}, key uses ${keyUses}`);
  const named = envFilesNaming(REPO);
  check('no .env file in this tree names the flag', named.length === 0, `${named.length} file(s)`);

  if (E2E) {
    const api = await answers('http://127.0.0.1:5000/api/health');
    const web = await answers('http://localhost:3000');
    if (api !== 200 || web !== 200) {
      check('--e2e: the local API on 5000 and Vite on 3000 answer', false, `api ${api}, web ${web}`);
    } else {
      const r6 = await launcher(['--smoke-live', '--local'], {}, RUN_TIMEOUT_MS);
      for (const line of r6.out.split(/\r?\n/)) {
        if (/^(smoke-live:|counts |flag|smoke exit)/.test(line) || /^\s+\d+ (passed|failed|flaky|skipped)/.test(line)) console.log(`  | ${line}`);
      }
      const absent = (r6.out.match(/this process:? absent/g) || []).length;
      check('--e2e: the whole smoke exits 0 with 20 passed', r6.code === 0 && /\b20 passed\b/.test(r6.out), `exit ${r6.code}`);
      check('--e2e: the counts by role MATCH', /counts by role MATCH/.test(r6.out));
      check('--e2e: the flag absent from the launcher\'s own process before and after', absent === 2, `${absent} report(s)`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed${E2E ? ' (with --e2e)' : ''}`);
  return passed === results.length && results.length > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`test-smoke-live failed: ${String(e && e.message ? e.message : e).split('\n')[0]}`);
    process.exit(1);
  });
