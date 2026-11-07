// D-312 — THE ACCOUNT DELETE'S OWN PROOF.
//
//   npm run test:account-delete              part 1: no database, no port. The
//                                            arguments, the --expect line, the
//                                            guard, the refusal rules and the
//                                            script's own text.
//   npm run test:account-delete -- --gate    part 1, then part 2 on ITS OWN
//                                            loopback cluster, in
//                                            parents_portal_d312 alone.
//
// PART 2's ENVIRONMENT (the approval's item 2 as changed on 2026-11-07). The
// command that starts this file sets, and part 2 refuses to run without:
//   - MIGRATION_PG_PORT=54341 and MIGRATION_PG_DIR = a scratch folder OUTSIDE
//     the repo, a cluster already serving there (migration/scripts/pg-local.js
//     serve with the same two values). It never connects to 54329: that
//     cluster belongs to another tab.
//   - MIGRATION_APP_TREE = this worktree, MIGRATION_SOURCE_ENV = a path that
//     does not exist (so nothing reads the main checkout's server/.env).
//   - NODE_OPTIONS loading migration/scripts/p4b-net-guard.js and
//     scripts/lib/listen-loopback.js (forward slashes), so this process and
//     every child are network-guarded, and every listen binds 127.0.0.1.
//   - no .env file anywhere in the worktree.
// It then makes the roles the schema grants to, runs db:setup there (captured,
// never printed: it lists the seeded sign-ins), starts server/server.js ITSELF
// on 5312 (never 3010, 5010 or 5011) and shows the netstat lines that prove the
// API and the cluster listen on loopback only. Tokens are signed with a secret
// made for this run, so no seeded password is read or typed.
//
// THE FIXTURE is built through the API, so its notifications are real: the
// adviser enrols a learner in Grade 1 – Mabait and creates the parent, the
// admin approves, the parent accepts the notice and terms and sends an excuse
// letter, the adviser declines it (an Absent day), and a Grade 1 letter is
// recorded (grade_available). Three such pairs: one for the dry run, the
// refusals and the apply, two consumed by the negative controls.
//
// NOTHING PRINTED HOLDS A NAME, A LOGIN ID, AN LRN, AN EMAIL, A PASSWORD OR A
// TOKEN. activity_logs.description is never selected. Every child's output is
// scanned for this run's LRNs, passwords and secret, a twelve-digit run and an
// address before it is trusted; a child's text is never shown whole.
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const demo = require('./demoData');
const del = require('./account-delete');
const reset = require('./activity-reset');
const { actionInfo } = require('../utils/activityActions');
const { SCHOOL_YEAR } = require('../utils/schoolCalendar');

const SERVER = path.resolve(__dirname, '..');
const ROOT = path.resolve(SERVER, '..');
const SCRIPT = path.join(__dirname, 'account-delete.js');
const GATE_DB = 'parents_portal_d312';
const GATE_PG_PORT = 54341;
const OTHER_TABS_PG_PORT = 54329;
const API_PORT = 5312;
const REFUSED_API_PORTS = [3010, 5010, 5011, 5000, 3000];
const BASE = `http://127.0.0.1:${API_PORT}`;
const SECTION = 'Mabait';
const TERM = 2;
const ABSENCE_DAY = '2026-10-30';
const FICTIONAL_HOST = 'db.example.invalid';

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function leaksIn(text, secrets = []) {
  const leaks = [];
  if (/\b\d{12}\b/.test(text)) leaks.push('a twelve-digit run');
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) leaks.push('an address');
  if (secrets.some((value) => value && text.includes(value))) leaks.push('a value made for this run');
  return leaks;
}

function assertClean(label, text, secrets = []) {
  const leaks = leaksIn(text, secrets);
  assert(leaks.length === 0, `${label}: nothing it printed holds a name, an LRN, an address or a secret`, leaks.join(', '));
  return leaks.length === 0;
}

function refusedBy(fn) {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof demo.Refusal;
  }
}

function child(script, args, env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: SERVER, env, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

// Neither hosted flag, nor the demo's or the reset's, whatever the shell had.
function withoutFlags(env) {
  const clean = { ...env };
  for (const key of [del.HOSTED_FLAG, demo.HOSTED_FLAG, reset.HOSTED_FLAG]) delete clean[key];
  return clean;
}

const ZERO_REFS = Object.fromEntries(del.EXPECT_KEYS.map((key) => [key, 0]));

// ---------------------------------------------------------------------------
// PART 1 — no database, no port
// ---------------------------------------------------------------------------

function partOneArguments() {
  console.log('\nPart 1 — the arguments');
  const parse = (argv) => {
    try {
      return del.parseArgs(argv);
    } catch (error) {
      return error;
    }
  };
  const refused = (argv) => parse(argv) instanceof demo.Refusal;
  const line = del.formatExpect(ZERO_REFS);

  const dry = parse(['--user=12', '--student=34']);
  assert(dry.user === 12 && dry.student === 34 && dry.apply === false && dry.expect === null, 'a dry run takes --user and --student only');
  const apply = parse(['--user=12', '--student=34', `--expect=${line}`, '--apply']);
  assert(apply.apply === true && apply.expect && apply.expect.grades === 0, 'an apply takes the --expect line and --apply');
  assert(refused([]), 'no arguments are refused');
  assert(refused(['--user=12']), 'a missing --student is refused');
  assert(refused(['--student=34']), 'a missing --user is refused');
  for (const bad of ['0', '-1', '1.5', '1e3', '07', 'abc', '2147483648', ' 12', '']) {
    assert(refused([`--user=${bad}`, '--student=34']), `--user=${JSON.stringify(bad)} is refused`);
  }
  assert(refused(['--user=12', '--student=34', '--user=13']), 'a repeated --user is refused');
  assert(refused(['--user=12', '--student=34', '--apply', '--apply', `--expect=${line}`]), 'a repeated --apply is refused');
  assert(refused(['--user=12', '--student=34', `--expect=${line}`]), '--expect without --apply is refused');
  assert(refused(['--user=12', '--student=34', '--apply']), '--apply without --expect is refused');

  const typed = String(Math.floor(1e11 + Math.random() * 8e11));
  const unknown = parse(['--user=12', '--student=34', typed]);
  assert(unknown instanceof demo.Refusal && !unknown.message.includes(typed), 'an unknown argument is refused without being echoed');

  assert(refused(['--user=647', '--student=34']), 'the protected parent (647) is refused before any connection');
  assert(refused(['--user=12', '--student=1037']), 'the protected learner (1037) is refused before any connection');
}

function partOneExpect() {
  console.log('\nPart 1 — the --expect line');
  const sample = Object.fromEntries(del.EXPECT_KEYS.map((key, i) => [key, i % 3 === 0 ? i : 0]));
  const line = del.formatExpect(sample);
  assert(line.split(',').length === del.EXPECT_KEYS.length, `the line names every count, zeros included (${del.EXPECT_KEYS.length})`);
  assert(JSON.stringify(del.parseExpect(line)) === JSON.stringify(sample), 'the dry run’s line reads back exactly');
  const reordered = line.split(',').reverse().join(',');
  assert(JSON.stringify(del.parseExpect(reordered)) === JSON.stringify(sample), 'the order of the parts does not matter');
  const parts = line.split(',');
  assert(refusedBy(() => del.parseExpect(parts.slice(1).join(','))), 'a missing count is refused');
  assert(refusedBy(() => del.parseExpect(`${line},users:1`)), 'a count the script does not make is refused');
  assert(refusedBy(() => del.parseExpect(`${line},${parts[0]}`)), 'a count named twice is refused');
  assert(refusedBy(() => del.parseExpect(line.replace(/^grades:\d+/, 'grades:1.5'))), 'a count that is not a whole number is refused');
  assert(refusedBy(() => del.parseExpect(line.replace(/^grades:\d+/, 'grades:-1'))), 'a negative count is refused');
  assert(refusedBy(() => del.parseExpect('')), 'an empty line is refused');
}

function partOneGuard() {
  console.log('\nPart 1 — the guard');
  const outcome = (host, apply, flag) => {
    try {
      del.assertTarget({ host, apply, flag });
      return 'allowed';
    } catch (error) {
      return error instanceof demo.Refusal ? 'refused' : 'error';
    }
  };
  assert(outcome('127.0.0.1', true, undefined) === 'allowed', 'a loopback apply needs no flag');
  assert(outcome('localhost', true, undefined) === 'allowed', 'localhost is loopback');
  assert(outcome(FICTIONAL_HOST, false, undefined) === 'allowed', 'a hosted dry run needs no flag (it is READ ONLY)');
  assert(outcome(FICTIONAL_HOST, true, undefined) === 'refused', 'a hosted apply without the flag is refused');
  assert(outcome(FICTIONAL_HOST, true, demo.HOSTED_VALUE) === 'refused', 'the demo load’s value does not unlock it');
  assert(outcome(FICTIONAL_HOST, true, reset.HOSTED_VALUE) === 'refused', 'the activity reset’s value does not unlock it');
  assert(outcome(FICTIONAL_HOST, true, `${del.HOSTED_VALUE} `) === 'refused', 'a near miss is refused');
  assert(outcome(FICTIONAL_HOST, true, del.HOSTED_VALUE) === 'allowed', 'the exact value unlocks it');
  assert(
    del.HOSTED_FLAG === 'PORTAL_ACCOUNT_DELETE' && del.HOSTED_FLAG !== demo.HOSTED_FLAG && del.HOSTED_FLAG !== reset.HOSTED_FLAG,
    'its own flag, not the demo’s or the reset’s'
  );
}

function partOneRules() {
  console.log('\nPart 1 — the refusal rules');
  const base = () => ({
    user: { id: 5, role: 'parent', status: 'active', student_id: 9, demo_marker: false },
    student: { id: 9, grade_level: 1, section: SECTION, demo_marker: false },
    linked: 1,
    lockedGrades: 0,
    restrict: { attendance_recorded_by: 0, announcements_posted_by: 0, memos_posted_by: 0, events_posted_by: 0, backups_created_by: 0 },
  });
  const refuses = (change) => {
    const facts = base();
    change(facts);
    return del.refusalsFor(facts, 5, 9).length > 0;
  };
  assert(del.refusalsFor(base(), 5, 9).length === 0, 'a parent and its own learner pass');
  assert(refuses((f) => (f.user = null)), 'a missing user is refused');
  assert(refuses((f) => (f.student = null)), 'a missing learner is refused');
  assert(refuses((f) => (f.user.role = 'teacher')), 'a teacher account is refused');
  assert(refuses((f) => (f.user.role = 'admin')), 'an admin account is refused');
  assert(refuses((f) => (f.user.student_id = 10)), 'a parent of another learner is refused');
  assert(refuses((f) => (f.linked = 2)), 'a learner with a second linked account is refused');
  assert(refuses((f) => (f.user.demo_marker = true)), 'a demo account is refused');
  assert(refuses((f) => (f.student.demo_marker = true)), 'a demo learner is refused');
  assert(refuses((f) => (f.lockedGrades = 1)), 'a locked grade is refused');
  for (const key of Object.keys(base().restrict)) {
    assert(refuses((f) => (f.restrict[key] = 1)), `a RESTRICT row (${key}) is refused`);
  }

  const refs = { ...ZERO_REFS, grades: 10, grade_components: 38, attendance: 10, excuse_letters: 1, notifications: 4, policy_acceptances: 2 };
  const changes = del.expectedChanges(refs);
  assert(
    changes.users === -1 &&
      changes.students === -1 &&
      changes.grades === -10 &&
      changes.grade_components === -38 &&
      changes.attendance === -10 &&
      changes.excuse_letters === -1 &&
      changes.notifications === -4 &&
      changes.policy_acceptances === -2 &&
      changes.activity_logs === 1,
    'the expected changes are the plan’s eight, and activity_logs +1'
  );
}

// The SQL in the script's own text: string literals that hold a statement.
function sqlOf(source) {
  const code = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const strings = code.match(/`[^`]*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
  return strings.filter((s) => /\b(SELECT|INSERT|DELETE|UPDATE|TRUNCATE)\b/.test(s));
}

function partOneSource() {
  console.log('\nPart 1 — the script’s own text');
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const sql = sqlOf(source);
  const all = sql.join('\n');
  assert(sql.length >= 20, `its statements are found (${sql.length})`);
  assert(!/\bTRUNCATE\b/i.test(all), 'no TRUNCATE');
  assert(!/\bUPDATE\s+[a-z_.]+\s+SET\b/.test(all), 'no UPDATE … SET: rows go by DELETE and the foreign keys, nothing is rewritten');
  const deleted = [...all.matchAll(/DELETE FROM ([a-z_]+)/g)].map((m) => m[1]);
  assert(
    deleted.length === 4 && deleted.every((table) => ['notifications', 'users', 'students'].includes(table)),
    'it deletes from notifications, users and students only',
    deleted.join(', ')
  );
  const descriptions = sql.filter((s) => /\bdescription\b/.test(s));
  assert(
    descriptions.length === 1 && /INSERT INTO activity_logs \(user_id, action, description\)/.test(descriptions[0]),
    'activity_logs.description appears once, in the INSERT, and is never selected'
  );
  assert(!/\blogin_id\b(?!\s*(COLLATE\s+"[^"]+"\s*)?(=|LIKE)\s*\?)/.test(all), 'login_id is only compared, never read');
  assert(!/\blrn\b(?!\s*(COLLATE\s+"[^"]+"\s*)?LIKE\s*\?)/.test(all), 'lrn is only compared, never read');
  assert(!/\b(email|contact_number|password|first_name|last_name|birthday|address)\b/.test(all), 'no email, number, password, name or address column is named');
  assert(/FOR UPDATE/.test(all), 'the apply locks the pair FOR UPDATE');
  const order = ['checkExpect(plan.refs, expect);', 'const gone = await deleteNotifications(conn, plan);', 'await deletePair(conn, plan);', 'await insertActivity(conn, plan);', 'const countsAfter = await verifyAfter('];
  const at = order.map((text) => source.indexOf(text));
  assert(
    at.every((i) => i > 0) && at.every((i, k) => k === 0 || i > at[k - 1]),
    'the apply runs: --expect check, notifications, the pair, the activity row, then the checks (approved change 4)'
  );
}

function partOneChildren() {
  console.log('\nPart 1 — the script as a process (no connection is made)');
  const line = del.formatExpect(ZERO_REFS);
  const base = withoutFlags({ ...process.env, PG_HOST: '127.0.0.1', PG_PORT: '1', PG_DATABASE: 'none', PG_MIGRATE_PASSWORD: '' });

  const none = child(SCRIPT, [], base);
  assert(none.status === 2 && none.out.includes('REFUSED:'), 'no arguments: REFUSED, exit 2', `exit ${none.status}`);

  const typed = String(Math.floor(1e11 + Math.random() * 8e11));
  const echo = child(SCRIPT, ['--user=12', '--student=34', typed], base);
  assert(echo.status === 2 && !echo.out.includes(typed), 'an unknown argument is not echoed', `exit ${echo.status}`);

  const noPassword = child(SCRIPT, ['--user=12', '--student=34'], base);
  assert(noPassword.status === 2 && noPassword.out.includes('PG_MIGRATE_PASSWORD'), 'no owner password: refused before connecting', `exit ${noPassword.status}`);

  // config/db.js builds its TLS options at load: verify-full needs a readable
  // CA file, and this file stands in (as test-fixture-guard.js does). No
  // handshake happens: the guard refuses first.
  const hosted = { ...base, PG_HOST: FICTIONAL_HOST, PG_SSL: 'verify-full', PG_CA_FILE: __filename, PG_MIGRATE_PASSWORD: 'not-a-real-password' };
  const bare = child(SCRIPT, ['--user=12', '--student=34', `--expect=${line}`, '--apply'], hosted);
  assert(bare.status === 2 && bare.out.includes(del.HOSTED_FLAG), 'a hosted apply without the flag is refused, naming it', `exit ${bare.status}`);
  const borrowed = child(SCRIPT, ['--user=12', '--student=34', `--expect=${line}`, '--apply'], {
    ...hosted,
    [demo.HOSTED_FLAG]: demo.HOSTED_VALUE,
    [reset.HOSTED_FLAG]: reset.HOSTED_VALUE,
  });
  assert(borrowed.status === 2 && borrowed.out.includes(del.HOSTED_FLAG), 'the demo’s and the reset’s flags together do not unlock it', `exit ${borrowed.status}`);
  const fixture = child(SCRIPT, ['--user=647', '--student=1037'], base);
  assert(fixture.status === 2 && fixture.out.includes('protected'), 'the protected family is refused by the process', `exit ${fixture.status}`);
}

// The gate's own preconditions, as a pure function so part 1 checks it too.
function gateProblems({ env, localPg, guardLoaded, loopbackLoaded, root }) {
  const problems = [];
  const inside = (p) => {
    const rel = path.relative(path.resolve(root), path.resolve(p));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  if (String(env.MIGRATION_PG_PORT) !== String(GATE_PG_PORT) || localPg.port !== GATE_PG_PORT) {
    problems.push(`MIGRATION_PG_PORT must be ${GATE_PG_PORT}`);
  }
  if (localPg.port === OTHER_TABS_PG_PORT) problems.push(`never ${OTHER_TABS_PG_PORT}: that cluster belongs to another tab`);
  if (!env.MIGRATION_PG_DIR) problems.push('MIGRATION_PG_DIR must name a scratch folder');
  else if (inside(env.MIGRATION_PG_DIR) || inside(localPg.dataDir)) problems.push('MIGRATION_PG_DIR must be outside the repo');
  if (!env.MIGRATION_APP_TREE || path.resolve(env.MIGRATION_APP_TREE).toLowerCase() !== path.resolve(root).toLowerCase()) {
    problems.push('MIGRATION_APP_TREE must be this worktree');
  }
  if (!env.MIGRATION_SOURCE_ENV || fs.existsSync(env.MIGRATION_SOURCE_ENV)) problems.push('MIGRATION_SOURCE_ENV must name a file that does not exist');
  const options = String(env.NODE_OPTIONS || '');
  if (!/p4b-net-guard\.js/.test(options) || !guardLoaded) problems.push('the network guard is not loaded (NODE_OPTIONS)');
  if (!/listen-loopback\.js/.test(options) || !loopbackLoaded) problems.push('the 127.0.0.1 preload is not loaded (NODE_OPTIONS)');
  for (const rel of ['.env', path.join('server', '.env'), path.join('client', '.env'), path.join('mobile', '.env')]) {
    if (fs.existsSync(path.join(root, rel))) problems.push(`${rel} exists in the worktree`);
  }
  if (REFUSED_API_PORTS.includes(API_PORT)) problems.push(`the API port ${API_PORT} is refused`);
  return problems;
}

function partOneGatePreconditions() {
  console.log('\nPart 1 — the gate’s own preconditions');
  const good = {
    env: {
      MIGRATION_PG_PORT: String(GATE_PG_PORT),
      MIGRATION_PG_DIR: path.join(path.parse(ROOT).root, 'scratch-d312-pg'),
      MIGRATION_APP_TREE: ROOT,
      MIGRATION_SOURCE_ENV: path.join(path.parse(ROOT).root, 'no-such-file-d312.env'),
      NODE_OPTIONS: '--require "a/p4b-net-guard.js" --require "b/listen-loopback.js"',
    },
    localPg: { port: GATE_PG_PORT, dataDir: path.join(path.parse(ROOT).root, 'scratch-d312-pg', 'data') },
    guardLoaded: true,
    loopbackLoaded: true,
    root: ROOT,
  };
  const envFiles = gateProblems(good).filter((p) => p.includes('.env'));
  assert(gateProblems(good).length === envFiles.length, 'a good environment passes (apart from any .env present)');
  const variant = (change) => {
    const copy = JSON.parse(JSON.stringify(good));
    change(copy);
    return gateProblems(copy).length > envFiles.length;
  };
  assert(variant((c) => (c.env.MIGRATION_PG_PORT = String(OTHER_TABS_PG_PORT))), 'the other tab’s cluster port is refused');
  assert(variant((c) => (c.localPg.port = OTHER_TABS_PG_PORT)), 'a cluster resolved to 54329 is refused');
  assert(variant((c) => (c.env.MIGRATION_PG_DIR = path.join(ROOT, 'pg'))), 'a cluster folder inside the repo is refused');
  assert(variant((c) => delete c.env.MIGRATION_PG_DIR), 'no cluster folder is refused');
  assert(variant((c) => (c.guardLoaded = false)), 'no network guard is refused');
  assert(variant((c) => (c.loopbackLoaded = false)), 'no 127.0.0.1 preload is refused');
  assert(variant((c) => (c.env.NODE_OPTIONS = '')), 'a NODE_OPTIONS without the preloads is refused (children would not inherit them)');
  assert(variant((c) => (c.env.MIGRATION_APP_TREE = path.join(ROOT, '..', 'Parents_Portal'))), 'the main checkout as the app tree is refused');
}

// ---------------------------------------------------------------------------
// PART 2 — the gate
// ---------------------------------------------------------------------------

function waitFor(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await waitFor(250);
  }
  return false;
}

// The network guard, proved live in THIS process: a socket to TEST-NET-1 (RFC
// 5737, routes nowhere) and one to the main checkout's API port must both
// throw before connecting.
function guardLive() {
  const attempt = (port, host) => {
    try {
      const socket = net.connect(port, host);
      socket.on('error', () => {});
      socket.destroy();
      return '';
    } catch (error) {
      return String(error && error.message);
    }
  };
  return {
    nonLoopback: /loopback guard/.test(attempt(5432, '192.0.2.1')),
    devPort: /p4b net guard/.test(attempt(5000, '127.0.0.1')),
  };
}

// netstat's LISTENING lines for one port, with their local address.
function listening(port) {
  const result = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => / LISTENING /.test(` ${line} `) && line.split(' ')[1] && line.split(' ')[1].endsWith(`:${port}`));
}

function api(token) {
  return async (method, urlPath, body) => {
    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  };
}

async function digestOf(client, sql, params = []) {
  const { rows } = await client.query(
    `SELECT md5(coalesce(string_agg(md5(x::text), '' ORDER BY md5(x::text)), '')) AS d FROM (${sql}) x`,
    params
  );
  return rows[0].d;
}

// Every table, hashed and never printed.
async function wholeDigest(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname`
  );
  const parts = [];
  for (const { name } of rows) parts.push(`${name}:${await digestOf(client, `SELECT * FROM portal.${name}`)}`);
  return parts.join('|');
}

async function tableCounts(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname`
  );
  const counts = {};
  for (const { name } of rows) counts[name] = Number((await client.query(`SELECT COUNT(*)::int AS n FROM portal.${name}`)).rows[0].n);
  return counts;
}

// The class's other learners and everything hanging from them, as one hash.
async function neighbours(client, excluded) {
  const { rows } = await client.query(
    'SELECT id FROM students WHERE grade_level = 1 AND section = $1 AND NOT (id = ANY($2::int[])) ORDER BY id',
    [SECTION, excluded]
  );
  const ids = rows.map((row) => row.id);
  const parts = [
    await digestOf(client, 'SELECT * FROM students WHERE id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT * FROM grades WHERE student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT gc.* FROM grade_components gc JOIN grades g ON g.id = gc.grade_id WHERE g.student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT * FROM attendance WHERE student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT * FROM excuse_letters WHERE student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT id, role, status, student_id, token_version FROM users WHERE student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT pa.* FROM policy_acceptances pa JOIN users u ON u.id = pa.user_id WHERE u.student_id = ANY($1::int[])', [ids]),
    await digestOf(client, 'SELECT n.* FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.student_id = ANY($1::int[])', [ids]),
  ];
  return { count: ids.length, digest: parts.join('|') };
}

// Notifications whose item is gone: what the explicit delete exists to prevent.
async function orphanNotifications(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM notifications n
      WHERE (n.item_type = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.item_id))
         OR (n.item_type = 'excuse_letter' AND NOT EXISTS (SELECT 1 FROM excuse_letters e WHERE e.id = n.item_id))
         OR (n.item_type = 'grade' AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.id = n.item_id))`
  );
  return rows[0].n;
}

// Every reference to the pair, counted independently of the script.
async function referencesTo(client, pair) {
  const one = async (sql, params) => Number((await client.query(sql, params)).rows[0].n);
  return {
    user: await one('SELECT COUNT(*)::int AS n FROM users WHERE id = $1', [pair.userId]),
    student: await one('SELECT COUNT(*)::int AS n FROM students WHERE id = $1', [pair.studentId]),
    grades: await one('SELECT COUNT(*)::int AS n FROM grades WHERE student_id = $1 OR id = $2', [pair.studentId, pair.gradeId]),
    attendance: await one('SELECT COUNT(*)::int AS n FROM attendance WHERE student_id = $1', [pair.studentId]),
    letters: await one('SELECT COUNT(*)::int AS n FROM excuse_letters WHERE student_id = $1 OR parent_id = $2 OR id = $3', [
      pair.studentId,
      pair.userId,
      pair.letterId,
    ]),
    notifications: await one(
      `SELECT COUNT(*)::int AS n FROM notifications
        WHERE user_id = $1 OR actor_id = $1 OR (item_type = 'user' AND item_id = $1)
           OR (item_type = 'excuse_letter' AND item_id = $2) OR (item_type = 'grade' AND item_id = $3)`,
      [pair.userId, pair.letterId, pair.gradeId]
    ),
    acceptances: await one('SELECT COUNT(*)::int AS n FROM policy_acceptances WHERE user_id = $1 OR student_id = $2', [
      pair.userId,
      pair.studentId,
    ]),
    activityByUser: await one('SELECT COUNT(*)::int AS n FROM activity_logs WHERE user_id = $1', [pair.userId]),
  };
}

// A changed copy, compiled in memory as migration/scripts/serve-pg.js does its
// mutants: nothing on disk changes. Each replacement must match exactly once.
function mutant(replacements, args, env) {
  const loader = `
    const Module = require('module');
    const fs = require('fs');
    const path = require('path');
    const file = ${JSON.stringify(SCRIPT)};
    let source = fs.readFileSync(file, 'utf8');
    for (const [from, to] of ${JSON.stringify(replacements)}) {
      const n = source.split(from).length - 1;
      if (n !== 1) { console.error('MUTANT: a replacement matched ' + n + ' times'); process.exit(3); }
      source = source.replace(from, () => to);
    }
    process.argv = [process.argv[0], file, ...${JSON.stringify(args)}];
    const copy = new Module(file, module);
    copy.filename = file;
    copy.paths = Module._nodeModulePaths(path.dirname(file));
    copy._compile(source, file);
    copy.exports.run();
  `;
  const result = spawnSync(process.execPath, ['-e', loader], { cwd: SERVER, env, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function expectLineIn(out) {
  const match = /The apply line: --expect=(\S+)/.exec(out);
  return match ? match[1] : null;
}

async function gate() {
  console.log(`\nPart 2 — the gate, in ${GATE_DB} on the loopback cluster at ${GATE_PG_PORT}, the API on ${API_PORT}`);
  const { LOCAL_PG } = require('../../migration/lib/env');
  const problems = gateProblems({
    env: process.env,
    localPg: LOCAL_PG,
    guardLoaded: Boolean(net[Symbol.for('p4b.netGuard')]),
    loopbackLoaded: Boolean(net[Symbol.for('d312.listenLoopback')]),
    root: ROOT,
  });
  if (problems.length) {
    for (const problem of problems) console.error(`  REFUSED: ${problem}`);
    failed += 1;
    return;
  }
  const live = guardLive();
  assert(live.nonLoopback && live.devPort, 'the network guard is live in this process (a non-loopback host and port 5000 both refused)');
  if (!live.nonLoopback || !live.devPort) return;

  const secret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = secret; // before utils/jwt.js loads, for this run alone
  delete require.cache[require.resolve('../utils/jwt')];
  const { signToken } = require('../utils/jwt');
  const { Client } = require('pg');
  const secrets = [secret, LOCAL_PG.password];

  const env = withoutFlags({
    ...process.env,
    PG_HOST: '127.0.0.1',
    PG_PORT: String(GATE_PG_PORT),
    PG_DATABASE: GATE_DB,
    PG_SSL: 'disable',
    PG_USER: LOCAL_PG.user,
    PG_PASSWORD: LOCAL_PG.password,
    PG_MIGRATE_USER: LOCAL_PG.user,
    PG_MIGRATE_PASSWORD: LOCAL_PG.password,
    PORT: String(API_PORT),
    API_BASE: BASE,
    MAIL_TRANSPORT: 'file',
    SMS_TRANSPORT: 'file',
    JWT_SECRET: secret,
  });
  for (const key of Object.keys(env)) {
    if (/^(SMTP_|DATABASE_URL$|PG_CA_FILE$|PG_OWNER|SUPABASE|NODE_ENV$|CORS_ORIGIN$)/.test(key)) delete env[key];
    if (/^SMS_/.test(key) && key !== 'SMS_TRANSPORT') delete env[key];
    if (/^MAIL_/.test(key) && key !== 'MAIL_TRANSPORT') delete env[key];
  }

  // The roles 003_grants_rls.sql grants to, as apply-schema.js makes them on
  // the local target. portal_migrate is this cluster's own superuser.
  console.log('\n  The cluster');
  const maintenance = new Client({ host: '127.0.0.1', port: GATE_PG_PORT, user: LOCAL_PG.user, password: LOCAL_PG.password, database: 'postgres', ssl: false });
  await maintenance.connect();
  await maintenance.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN CREATE ROLE portal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$`);
  const { rows: serverPort } = await maintenance.query("SELECT current_setting('port') AS port");
  assert(Number(serverPort[0].port) === GATE_PG_PORT, `connected to the cluster on ${GATE_PG_PORT}, not ${OTHER_TABS_PG_PORT}`);
  await maintenance.end();

  // db:setup prints the seeded sign-ins: captured, never shown, never scanned.
  const setup = child(path.join(SERVER, 'scripts', 'setup-db.js'), [], env);
  assert(setup.status === 0, `db:setup made ${GATE_DB} (its output is withheld)`, `exit ${setup.status}`);
  if (setup.status !== 0) return;

  const client = new Client({ host: '127.0.0.1', port: GATE_PG_PORT, user: LOCAL_PG.user, password: LOCAL_PG.password, database: GATE_DB, ssl: false });
  await client.connect();
  await client.query('SET search_path TO portal');

  let server = null;
  try {
    // ---- the staff: the seeded admin and Mabait's seeded adviser, their gates
    // stamped by hand on this disposable database, tokens signed for the run.
    const versions = JSON.parse(fs.readFileSync(path.join(SERVER, 'policy', 'versions.json'), 'utf8'));
    const stamp = async (userId) => {
      await client.query(
        `INSERT INTO policy_acceptances (user_id, document, version) VALUES ($1, 'privacy_notice', $2), ($1, 'terms_of_use', $3)
         ON CONFLICT DO NOTHING`,
        [userId, versions.privacy_notice.version, versions.terms_of_use.version]
      );
      await client.query(
        'UPDATE users SET email = $1, email_verified_at = portal.now_s(), must_change_password = 0 WHERE id = $2',
        [`d312-staff-${userId}@example.invalid`, userId]
      );
    };
    const { rows: admins } = await client.query("SELECT id, token_version FROM users WHERE login_id = $1 AND role = 'admin'", [demo.ADMIN_LOGIN]);
    const { rows: classes } = await client.query(
      `SELECT s.id AS section_id, u.id AS adviser_id, u.token_version
         FROM sections s JOIN users u ON u.id = s.adviser_id
        WHERE s.grade_level = 1 AND s.name = $1 AND s.school_year = $2`,
      [SECTION, SCHOOL_YEAR]
    );
    if (!admins[0] || !classes[0]) {
      assert(false, 'the seeded admin and Mabait’s adviser are on the database');
      return;
    }
    const admin = admins[0];
    const adviserId = classes[0].adviser_id;
    await stamp(admin.id);
    await stamp(adviserId);
    const asAdmin = api(signToken({ id: admin.id, role: 'admin', v: Number(admin.token_version) }));
    const asAdviser = api(signToken({ id: adviserId, role: 'teacher', v: Number(classes[0].token_version) }));

    // A Grade 1 subject with no grade and no column for anyone in Mabait this
    // term, so the fixture's columns touch no neighbour.
    const { rows: subjects } = await client.query(
      `SELECT s.id FROM subjects s
        WHERE s.grade_level = 1
          AND NOT EXISTS (SELECT 1 FROM grades g JOIN students st ON st.id = g.student_id
                           WHERE g.subject_id = s.id AND g.term = $1 AND st.grade_level = 1 AND st.section = $2)
          AND NOT EXISTS (SELECT 1 FROM assessment_slots a
                           WHERE a.subject_id = s.id AND a.term = $1 AND a.grade_level = 1 AND a.section = $2)
        ORDER BY s.display_order NULLS LAST, s.id LIMIT 1`,
      [TERM, SECTION]
    );
    const subjectId = subjects[0] && subjects[0].id;
    assert(Boolean(subjectId), 'a Grade 1 subject with no Mabait record this term is found');
    if (!subjectId) return;

    // ---- the API, this run's own, loopback only.
    console.log('\n  The API');
    server = spawn(process.execPath, [path.join(SERVER, 'server.js')], { cwd: SERVER, env, stdio: 'ignore' });
    assert(await waitForHealth(), `the API answers on 127.0.0.1:${API_PORT}`);
    const apiLines = listening(API_PORT);
    const pgLines = listening(GATE_PG_PORT);
    for (const line of [...apiLines, ...pgLines]) console.log(`        netstat: ${line}`);
    const loopbackOnly = (lines) => lines.length > 0 && lines.every((line) => /^(127\.0\.0\.1|\[::1\]):\d+$/.test(line.split(' ')[1]));
    assert(loopbackOnly(apiLines), `the API listens on 127.0.0.1:${API_PORT} only`);
    assert(loopbackOnly(pgLines), `the cluster listens on loopback only at ${GATE_PG_PORT}`);

    // ---- the fixture pairs.
    const buildPair = async () => {
      const lrn = `31${String(crypto.randomInt(0, 1e10)).padStart(10, '0')}`;
      const password = `D312-${crypto.randomBytes(9).toString('hex')}7`;
      secrets.push(lrn, password);
      const pair = { lrn };
      const enrol = await asAdviser('POST', '/api/students', { lrn, first_name: 'Test', last_name: 'Account', grade_level: 1, section: SECTION });
      if (enrol.status !== 201) throw new Error(`the fixture enrol answered ${enrol.status}`);
      pair.studentId = enrol.data.student.id;
      const parent = await asAdviser('POST', '/api/users/parents', { lrn, password, name: 'Test Parent' });
      if (parent.status !== 201) throw new Error(`the fixture parent answered ${parent.status}`);
      pair.userId = parent.data.user.id;
      const approve = await asAdmin('PUT', `/api/users/parents/${pair.userId}/approve`);
      if (approve.status !== 200) throw new Error(`the fixture approval answered ${approve.status}`);

      const { rows } = await client.query('SELECT token_version FROM users WHERE id = $1', [pair.userId]);
      pair.token = signToken({ id: pair.userId, role: 'parent', v: Number(rows[0].token_version) });
      secrets.push(pair.token);
      const asParent = api(pair.token);
      const docs = await asParent('GET', '/api/policy');
      const docVersions = Object.fromEntries(((docs.data && docs.data.documents) || []).map((d) => [d.document, d.version]));
      const accepted = await asParent('POST', '/api/policy/accept', { versions: docVersions, on_behalf_of_child: true });
      if (accepted.status !== 200) throw new Error(`the fixture acceptance answered ${accepted.status}`);
      // The contact step and the forced change, stamped as policyFixture.js and
      // clearForcedChange() do for an account the run just made.
      await client.query('UPDATE users SET email = $1, email_verified_at = portal.now_s(), must_change_password = 0 WHERE id = $2', [
        `d312-parent-${pair.userId}@example.invalid`,
        pair.userId,
      ]);

      const letter = await asParent('POST', '/api/excuse-letters', { absence_date: ABSENCE_DAY, reason: 'Fever.' });
      if (letter.status !== 201) throw new Error(`the fixture letter answered ${letter.status}`);
      pair.letterId = (letter.data.excuse_letter || letter.data.excuse || letter.data.letter || {}).id;
      if (!pair.letterId) {
        const { rows: found } = await client.query('SELECT id FROM excuse_letters WHERE parent_id = $1', [pair.userId]);
        pair.letterId = found[0] && found[0].id;
      }
      const decline = await asAdviser('PATCH', `/api/excuse-letters/${pair.letterId}/review`, { status: 'Declined', teacher_remarks: 'Please send a note.' });
      if (decline.status !== 200) throw new Error(`the fixture decline answered ${decline.status}`);

      const grade = await asAdmin('POST', '/api/grades', { student_id: pair.studentId, subject_id: subjectId, term: TERM, school_year: SCHOOL_YEAR });
      if (grade.status !== 201) throw new Error(`the fixture grade answered ${grade.status}`);
      pair.gradeId = grade.data.grade.id;
      const slot = async (type) => {
        await client.query(
          `INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
           VALUES ($1, 1, $2, $3, $4, $5, 1, 20) ON CONFLICT DO NOTHING`,
          [subjectId, SECTION, TERM, SCHOOL_YEAR, type]
        );
        const { rows: slots } = await client.query(
          `SELECT id FROM assessment_slots WHERE subject_id = $1 AND grade_level = 1 AND section = $2 AND term = $3
              AND school_year = $4 AND type = $5 AND slot_no = 1`,
          [subjectId, SECTION, TERM, SCHOOL_YEAR, type]
        );
        return slots[0].id;
      };
      const ww = await asAdmin('POST', `/api/grades/${pair.gradeId}/components`, { type: 'WW', score: 18, max_score: 20, label: 'Quiz 1', slot_id: await slot('WW') });
      const pt = await asAdmin('POST', `/api/grades/${pair.gradeId}/components`, { type: 'PT', score: 17, max_score: 20, label: 'Task 1', slot_id: await slot('PT') });
      if (ww.status !== 201 || pt.status !== 201) throw new Error(`the fixture scores answered ${ww.status} and ${pt.status}`);
      const exam = await asAdmin('PATCH', `/api/grades/${pair.gradeId}/exam`, { st1_score: 18, st1_max: 20, st2_score: 17, st2_max: 20, te_score: 36, te_max: 40 });
      if (exam.status !== 200 || !exam.data.grade.descriptive_grade) throw new Error(`the fixture exam answered ${exam.status}`);
      return pair;
    };

    console.log('\n  The fixture (three pairs, built through the API)');
    const neighboursBefore = await neighbours(client, []);
    const A = await buildPair();
    const B = await buildPair();
    const C = await buildPair();
    const fixtureIds = [A.studentId, B.studentId, C.studentId];
    const classBefore = await neighbours(client, fixtureIds);
    assert(classBefore.digest === neighboursBefore.digest && classBefore.count >= 1, `Mabait’s other learners (${classBefore.count}) are untouched by the fixture`);

    const { rows: aNotes } = await client.query(
      `SELECT type::text AS type, (user_id = $1) AS to_parent FROM notifications
        WHERE user_id = $1 OR (item_type = 'user' AND item_id = $1) OR (item_type = 'excuse_letter' AND item_id = $2) OR (item_type = 'grade' AND item_id = $3)
        ORDER BY type`,
      [A.userId, A.letterId, A.gradeId]
    );
    const kinds = aNotes.map((n) => `${n.type}${n.to_parent ? '' : '*'}`).join(', ');
    assert(aNotes.length === 4, `the pair has the production pair’s four notifications, two to staff (*): ${kinds}`);
    const before = await referencesTo(client, A);
    assert(
      before.grades === 1 && before.attendance === 1 && before.letters === 1 && before.acceptances === 2,
      'the pair holds a grade, an Absent day, a declined letter and two acceptances'
    );

    const ownerEnv = { ...env };
    const run = (args) => child(SCRIPT, args, ownerEnv);
    const idArgs = (pair) => [`--user=${pair.userId}`, `--student=${pair.studentId}`];

    // ---- the dry run.
    console.log('\n  The dry run');
    const digestBefore = await wholeDigest(client);
    const dry = run(idArgs(A));
    // reportFailure()'s line is the step, the code and a masked first line;
    // shown only after the leak scan passes.
    const failedLine = (out) => (leaksIn(out, secrets).length ? '(withheld: the scan failed)' : (/^(FAILED at .*|REFUSED: .*)$/m.exec(out) || [''])[0]);
    assert(dry.status === 0, 'the dry run exits 0', `exit ${dry.status} ${failedLine(dry.out)}`);
    assertClean('the dry run', dry.out, secrets);
    assert(dry.out.includes('BEGIN READ ONLY') && dry.out.includes('Dry run complete. Nothing was written.'), 'it runs READ ONLY and says nothing was written');
    const line = expectLineIn(dry.out);
    assert(Boolean(line), 'it prints a paste-ready --expect line');
    const refs = line ? del.parseExpect(line) : ZERO_REFS;
    assert(
      refs.grades === 1 &&
        refs.grade_components === 2 &&
        refs.attendance === 1 &&
        refs.excuse_letters === 1 &&
        refs.policy_acceptances === 2 &&
        refs.notifications === 4 &&
        refs.messages === 0 &&
        refs.auth_codes === 0 &&
        refs.teacher_assignments === 0 &&
        refs.grade_acknowledgements === 0,
      `its counts are the fixture’s: ${line}`
    );
    assert(refs.detached_activity_logs === before.activityByUser, `the parent’s own activity rows are counted to keep (${before.activityByUser})`);
    assert(dry.out.includes('No demo manifest on this database.'), 'it says there is no demo manifest here');
    assert((await wholeDigest(client)) === digestBefore, 'the database is unchanged, table by table');

    // ---- the refusals: each exits 2, prints REFUSED and writes nothing.
    console.log('\n  The refusals');
    const refusedRun = async (label, args, setUp, tearDown) => {
      if (setUp) await setUp();
      const d1 = await wholeDigest(client);
      const result = run(args);
      const d2 = await wholeDigest(client);
      if (tearDown) await tearDown();
      assert(result.status === 2 && result.out.includes('REFUSED:') && d1 === d2, `${label}: REFUSED, nothing written`, `exit ${result.status}`);
      assertClean(label, result.out, secrets);
    };
    await refusedRun('a teacher account', [`--user=${adviserId}`, `--student=${A.studentId}`]);
    await refusedRun('a parent of another learner', [`--user=${A.userId}`, `--student=${B.studentId}`]);
    await refusedRun('the protected family', ['--user=647', '--student=1037']);
    let dummyId = null;
    await refusedRun(
      'a second linked account',
      idArgs(A),
      async () => {
        const { rows } = await client.query(
          `INSERT INTO users (login_id, password, role, status, name, student_id)
           VALUES ($1, $2, 'parent', 'active', 'Test', $3) RETURNING id`,
          [`d312x${crypto.randomBytes(5).toString('hex')}`, crypto.randomBytes(16).toString('hex'), A.studentId]
        );
        dummyId = rows[0].id;
      },
      async () => client.query('DELETE FROM users WHERE id = $1', [dummyId])
    );
    await refusedRun(
      'a demo learner (the LRN prefix)',
      idArgs(A),
      async () => client.query("UPDATE students SET lrn = $1 || substr(lrn, 7) WHERE id = $2", [demo.LRN_PREFIX, A.studentId]),
      async () => client.query('UPDATE students SET lrn = $1 WHERE id = $2', [A.lrn, A.studentId])
    );
    await refusedRun(
      'a locked grade',
      idArgs(A),
      async () => client.query('UPDATE grades SET is_locked = 1 WHERE id = $1', [A.gradeId]),
      async () => client.query('UPDATE grades SET is_locked = 0 WHERE id = $1', [A.gradeId])
    );
    let postId = null;
    await refusedRun(
      'a RESTRICT row (an announcement by the user)',
      idArgs(A),
      async () => {
        const { rows } = await client.query("INSERT INTO announcements (title, content, posted_by) VALUES ('Control', 'Control.', $1) RETURNING id", [A.userId]);
        postId = rows[0].id;
      },
      async () => client.query('DELETE FROM announcements WHERE id = $1', [postId])
    );
    const offByOne = line ? line.replace(/^grades:(\d+)/, (m, n) => `grades:${Number(n) + 1}`) : '';
    await refusedRun('an --expect that is off by one', [...idArgs(A), `--expect=${offByOne}`, '--apply']);

    // ---- the negative controls: copies that would be wrong, proved caught.
    console.log('\n  The negative controls');
    const lineB = expectLineIn(run(idArgs(B)).out);
    const noNotificationStep = mutant(
      [
        ['const gone = await deleteNotifications(conn, plan);', 'const gone = { byItem: 0, byUser: 0 };'],
        ['const countsAfter = await verifyAfter(conn, plan, tables, countsBefore, gone);', 'const countsAfter = await tableCounts(conn, tables);'],
      ],
      [...idArgs(B), `--expect=${lineB}`, '--apply'],
      ownerEnv
    );
    const orphans = await orphanNotifications(client);
    assert(noNotificationStep.status === 0 && orphans === 2, `a copy without the notification step commits and leaves ${orphans} orphans, which this gate finds`, `exit ${noNotificationStep.status}`);
    await client.query(
      `DELETE FROM notifications n
        WHERE (n.item_type = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.item_id))
           OR (n.item_type = 'excuse_letter' AND NOT EXISTS (SELECT 1 FROM excuse_letters e WHERE e.id = n.item_id))
           OR (n.item_type = 'grade' AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.id = n.item_id))`
    );
    const withChecks = mutant(
      [['const gone = await deleteNotifications(conn, plan);', 'const gone = { byItem: 0, byUser: 0 };']],
      [...idArgs(C), `--expect=${expectLineIn(run(idArgs(C)).out)}`, '--apply'],
      ownerEnv
    );
    assert(
      withChecks.status === 2 && withChecks.out.includes('Rolled back') && (await referencesTo(client, C)).user === 1,
      'the same copy WITH the script’s own checks is rolled back: the checks catch it too',
      `exit ${withChecks.status}`
    );
    const lineC = expectLineIn(run(idArgs(C)).out);
    const offC = lineC ? lineC.replace(/^grades:(\d+)/, (m, n) => `grades:${Number(n) + 1}`) : '';
    const noExpectCheck = mutant([['checkExpect(plan.refs, expect);', '']], [...idArgs(C), `--expect=${offC}`, '--apply'], ownerEnv);
    const cAfter = await referencesTo(client, C);
    assert(
      noExpectCheck.status === 0 && cAfter.user === 0,
      'a copy without the --expect check deletes on a wrong line, which the off-by-one refusal above proves the script does not',
      `exit ${noExpectCheck.status}`
    );
    assertClean('the controls', `${noNotificationStep.out}${withChecks.out}${noExpectCheck.out}`, secrets);

    // ---- the apply.
    console.log('\n  The apply');
    const countsBefore = await tableCounts(client);
    const activityIdsBefore = (await client.query('SELECT id FROM activity_logs WHERE user_id = $1 ORDER BY id', [A.userId])).rows.map((r) => r.id);
    const applied = run([...idArgs(A), `--expect=${line}`, '--apply']);
    assert(applied.status === 0 && applied.out.includes('Committed.'), 'the apply commits', `exit ${applied.status}`);
    assertClean('the apply', applied.out, secrets);
    const countsAfter = await tableCounts(client);
    const want = { users: -1, students: -1, grades: -1, grade_components: -2, attendance: -1, excuse_letters: -1, notifications: -4, policy_acceptances: -2, activity_logs: 1 };
    const wrong = Object.keys(countsAfter).filter((table) => countsAfter[table] - countsBefore[table] !== (want[table] || 0));
    assert(wrong.length === 0, 'every table changed by exactly its count: the eight, activity_logs +1, every other 0', wrong.join(', '));
    const after = await referencesTo(client, A);
    assert(Object.values(after).every((n) => n === 0), 'nothing refers to the pair afterwards, notifications by item included', JSON.stringify(after));
    assert((await orphanNotifications(client)) === 0, 'no orphan notification anywhere');
    const classAfter = await neighbours(client, fixtureIds);
    assert(classAfter.digest === classBefore.digest, `Mabait’s other learners (${classAfter.count}) are unchanged, by fingerprint`);
    const kept = (await client.query('SELECT COUNT(*)::int AS n FROM activity_logs WHERE id = ANY($1::int[]) AND user_id IS NULL', [activityIdsBefore])).rows[0].n;
    assert(kept === activityIdsBefore.length, `the parent’s own activity rows are kept, detached (${kept})`);
    const { rows: newest } = await client.query('SELECT id, user_id FROM activity_logs WHERE action = $1 ORDER BY id DESC LIMIT 1', [del.ACTION]);
    assert(newest[0] && Number(newest[0].user_id) === Number(admin.id), 'one activity row, as the admin, code account_deleted_by_id');

    // ---- the Activity log and the token, through the API.
    console.log('\n  The Activity log and the token');
    const info = actionInfo(del.ACTION);
    assert(info.label === 'Deleted an account by id' && info.group === 'system', 'the code has its label, in System');
    const actions = await asAdmin('GET', '/api/activity-logs/actions');
    const system = actions.data && actions.data.groups && actions.data.groups.find((g) => g.key === 'system');
    assert(Boolean(system && system.actions.some((a) => a.code === del.ACTION && a.label === info.label)), 'the Activity log offers it as a filter, with the label');
    const listed = await asAdmin('GET', `/api/activity-logs?action=${del.ACTION}`);
    const entry = listed.data && listed.data.entries && listed.data.entries.find((e) => Number(e.id) === Number(newest[0] && newest[0].id));
    assert(Boolean(entry && entry.action_label === info.label && entry.action_group === 'system'), 'the new row lists with its label');
    const deleted = await asAdmin('GET', '/api/activity-logs?role=deleted');
    const deletedIds = new Set(((deleted.data && deleted.data.entries) || []).map((e) => Number(e.id)));
    assert(activityIdsBefore.every((id) => deletedIds.has(Number(id))), 'the parent’s own rows now list as a Deleted account');
    const me = await api(A.token)('GET', '/api/auth/me');
    assert(me.status === 401, 'the deleted account’s token answers 401', `status ${me.status}`);
  } finally {
    await client.end();
    if (server) {
      server.kill();
      await waitFor(800);
    }
  }
}

async function main() {
  console.log('test:account-delete');
  partOneArguments();
  partOneExpect();
  partOneGuard();
  partOneRules();
  partOneSource();
  partOneChildren();
  partOneGatePreconditions();
  if (process.argv.includes('--gate')) await gate();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`FAILED: ${(error && error.code) || ''} ${error && error.message ? String(error.message).replace(/\b\d{12}\b/g, '«12»') : ''}`);
  process.exitCode = 1;
});
