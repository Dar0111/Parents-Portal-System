// MODULE 15 (2026-11-03) — THE ACTIVITY RESET'S OWN PROOF.
//
//   npm run test:activity-reset              part 1: no database, no port. Every
//                                            refusal, the guard, the keep-list and
//                                            the script's own text.
//   npm run test:activity-reset -- --gate    part 1, then part 2 on the loopback
//                                            cluster, in parents_portal_m15 alone:
//                                            the dry run, the refusals, the
//                                            rollback, the rule with its negative
//                                            controls, the Activity log after it,
//                                            and a real restore of an archive made
//                                            after the reset.
//
// PART 2 NEVER TOUCHES ANOTHER DATABASE. It refuses every target but its own,
// runs db:setup there (captured, never printed: it lists the seeded sign-ins),
// starts its own API on 5010 (migration/scripts/serve-pg.js) and signs a token
// with a secret made for this run, so no password is read or typed here.
// migration/scripts/restore-e2e.js reads the seeded admin's at run time and never
// prints it.
//
// THE HOSTED FLAGS ARE NEVER SET. The guard is called as a pure function with a
// value as an argument, and both flags are taken OUT of every child's environment.
//
// `description` IS NEVER SELECTED. Each fixture row carries a marker in it, and
// every child's output is scanned for that marker, a twelve-digit run and an
// address; a child's text is shown only after the scan passes.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const demo = require('./demoData');
const reset = require('./activity-reset');
const { actionInfo } = require('../utils/activityActions');

const SERVER = path.resolve(__dirname, '..');
const ROOT = path.resolve(SERVER, '..');
const SCRIPT = 'scripts/activity-reset.js';
const GATE_DB = 'parents_portal_m15';
const GATE_PORT = 5010;
const BASE = `http://127.0.0.1:${GATE_PORT}`;

const T = '2026-11-03T03:35:00+08:00';
const JUST_BEFORE = '2026-11-03T03:34:59+08:00';
const JUST_AFTER = '2026-11-03T03:35:01+08:00';
const OLD = '2026-10-10T08:00:00+08:00';
const CLOCK_DAY = '2026-09-21T01:26:00+08:00';
const AFTER_T = Date.parse('2026-11-04T00:00:00+08:00');

const OWNER_KEEP_CODES = Object.freeze([
  'create_contribution',
  'delete_contribution',
  'demo_data_load',
  'demo_data_undo',
  'demo_messages_clear',
  'demo_passwords_set',
  'restore_backup',
  'restore_wiped_activity_logs',
  'seed',
  'update_contribution',
  'update_contribution_record',
]);
const GOES = Object.freeze([
  'login',
  'login_failed',
  'restore_refused',
  'create_student',
  'accept_policy',
  'admin_temp_password',
  'password_alert_sent',
  'zz_gate_unknown_code',
]);
const SINCE_CODES = Object.freeze(['admin_temp_password', 'accept_policy', 'password_alert_sent']);

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function leaksIn(text, secrets = []) {
  const leaks = [];
  if (/\b\d{12}\b/.test(text)) leaks.push('a twelve-digit run');
  if (/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(text)) leaks.push('an address');
  if (secrets.some((value) => value && text.includes(value))) leaks.push('a marked value');
  return leaks;
}

function assertClean(label, text, secrets = []) {
  const leaks = leaksIn(text, secrets);
  assert(leaks.length === 0, `${label}: nothing it printed is a value`, leaks.join(', '));
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

// A copy of the environment without either hosted flag, whatever the shell had.
function withoutFlags(env) {
  const clean = { ...env };
  delete clean[reset.HOSTED_FLAG];
  delete clean[demo.HOSTED_FLAG];
  return clean;
}

// ---------------------------------------------------------------------------
// PART 1 — no database, no port
// ---------------------------------------------------------------------------
function partOneArguments() {
  console.log('\nThe arguments');
  const before = `--before=${T}`;
  const refused = {
    'no --before': [],
    'a Z time': ['--before=2026-11-03T03:35:00Z'],
    'no offset': ['--before=2026-11-03T03:35:00'],
    'a zero offset': ['--before=2026-11-03T03:35:00+00:00'],
    'a space for the T': ['--before=2026-11-03 03:35:00+08:00'],
    'no seconds': ['--before=2026-11-03T03:35+08:00'],
    'an impossible day': ['--before=2026-02-30T03:35:00+08:00'],
    'hour 24': ['--before=2026-11-03T24:00:00+08:00'],
    'minute 60': ['--before=2026-11-03T03:60:00+08:00'],
    'a future time': ['--before=2026-11-04T00:00:00+08:00'],
    'the value as its own argument': ['--before', T],
    '--apply with no --expect': [before, '--apply'],
    '--expect with no --apply': [before, '--expect=3'],
    'a negative --expect': [before, '--expect=-1', '--apply'],
    'a decimal --expect': [before, '--expect=1.5', '--apply'],
    'a word for --expect': [before, '--expect=all', '--apply'],
    'an unknown argument': [before, '--aply'],
  };
  for (const [name, args] of Object.entries(refused)) {
    assert(refusedBy(() => reset.parseArgs(args, AFTER_T)), `refused: ${name}`);
  }

  const dry = reset.parseArgs([before], AFTER_T);
  assert(dry.before === T && dry.apply === false && dry.expect === null, 'a dry run needs only --before');
  const apply = reset.parseArgs([before, '--expect=42', '--apply'], AFTER_T);
  assert(apply.apply === true && apply.expect === 42, '--apply carries the count the dry run gave');
}

function partOneGuard() {
  console.log('\nThe guard, as a pure function');
  const host = 'db.example.invalid';
  assert(refusedBy(() => reset.assertTarget({ host, apply: true, flag: undefined })), 'a hosted --apply with no flag is refused');
  assert(refusedBy(() => reset.assertTarget({ host, apply: true, flag: 'yes' })), 'a hosted --apply with a wrong value is refused');
  assert(refusedBy(() => reset.assertTarget({ host, apply: true, flag: demo.HOSTED_VALUE })), "the demo load's value does not unlock it");
  assert(reset.HOSTED_FLAG !== demo.HOSTED_FLAG && reset.HOSTED_VALUE !== demo.HOSTED_VALUE, 'the flag and its value are its own');
  assert(!refusedBy(() => reset.assertTarget({ host, apply: true, flag: reset.HOSTED_VALUE })), 'the exact value passes');
  assert(!refusedBy(() => reset.assertTarget({ host, apply: false, flag: undefined })), 'a hosted dry run needs no flag');
  assert(!refusedBy(() => reset.assertTarget({ host: '127.0.0.1', apply: true, flag: undefined })), 'a loopback --apply needs no flag');
}

function partOneKeepList() {
  console.log("\nThe keep-list, the owner's answer of 2026-11-03");
  assert(JSON.stringify([...reset.KEEP_CODES].sort()) === JSON.stringify(OWNER_KEEP_CODES), 'the eleven codes, exactly');
  assert(JSON.stringify(reset.KEEP_IDS) === JSON.stringify([5515, 5516, 5517]), 'the three clock rows, exactly');
  assert(!reset.KEEP_CODES.includes('restore_refused'), 'restore_refused goes');
  const unlabelled = [...reset.KEEP_CODES, 'activity_log_reset'].filter((code) => actionInfo(code).group === 'other');
  assert(unlabelled.length === 0, 'every kept code and the reset row have a label', unlabelled.join(', '));
}

// The script's own text. Comments are dropped first: the header may name what the
// code must not do.
function sourceProblems(source) {
  const code = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const problems = [];
  const lines = code.split('\n');
  const onlyInsert = (word) => lines.filter((line) => line.includes(word)).every((line) => line.includes('INSERT INTO activity_logs (user_id, action, description)'));
  if (!onlyInsert('description')) problems.push('description outside the one INSERT');
  if (!onlyInsert('user_id')) problems.push('user_id outside the one INSERT');
  if (/RETURNING|TRUNCATE|setval|RESTART/i.test(code)) problems.push('a statement the reset must not run');
  if (/PORTAL_DEMO_HOSTED|demo\.HOSTED_/.test(code)) problems.push("the demo load's flag");
  if (!code.includes('await begin(conn, apply)')) problems.push('not the shared begin');
  return problems;
}

function partOneSource() {
  console.log("\nThe script's own text");
  const source = fs.readFileSync(path.join(SERVER, SCRIPT), 'utf8');
  assert(sourceProblems(source).length === 0, 'it selects no description or user_id, and has no TRUNCATE, RETURNING or sequence call', sourceProblems(source).join(', '));
  const changed = {
    'a SELECT with description': source.replace('SELECT action, COUNT(*) AS n FROM activity_logs', 'SELECT action, description, COUNT(*) AS n FROM activity_logs'),
    'a SELECT with user_id': source.replace('SELECT action, COUNT(*) AS n FROM activity_logs', 'SELECT action, user_id, COUNT(*) AS n FROM activity_logs'),
    "the demo load's flag": source.replace('process.env[HOSTED_FLAG]', 'process.env[demo.HOSTED_FLAG]'),
    'a TRUNCATE': `${source}\nconst extra = 'TRUNCATE TABLE activity_logs';\n`,
    'a transaction of its own': source.replace('await begin(conn, apply)', "await conn.query('BEGIN')"),
  };
  for (const [name, copy] of Object.entries(changed)) {
    assert(copy !== source && sourceProblems(copy).length > 0, `control: ${name} fails the check`);
  }
  const mark = `m15-${crypto.randomBytes(6).toString('hex')}`;
  assert(leaksIn(`line ${mark}`, [mark]).length === 1, 'control: the scan finds a marker in the text');
  assert(leaksIn('0123456 012345678901').length === 1, 'control: the scan finds a twelve-digit run');
  assert(leaksIn('name@example.invalid').length === 1, 'control: the scan finds an address');
}

function partOneChildren() {
  console.log('\nThe refusals, as commands, and no connection is opened');
  const base = withoutFlags({ ...process.env, PG_SSL: 'require', PG_MIGRATE_PASSWORD: crypto.randomBytes(8).toString('hex') });
  const hosted = child(SCRIPT, [`--before=${T}`, '--expect=1', '--apply'], { ...base, PG_HOST: 'db.example.invalid' });
  assert(hosted.status === 2 && hosted.out.includes('REFUSED') && hosted.out.includes(reset.HOSTED_FLAG), 'a hosted --apply stops at the guard');
  assert(!hosted.out.includes('BEGIN') && !hosted.out.includes('Target:'), 'and before anything connects');
  assertClean('that refusal', hosted.out);

  const shape = child(SCRIPT, ['--before=yesterday'], { ...base, PG_HOST: 'db.example.invalid' });
  assert(shape.status === 2 && shape.out.includes('REFUSED'), 'a bad --before stops first, on any host');

  const noPassword = child(SCRIPT, [`--before=${T}`], { ...base, PG_HOST: '127.0.0.1', PG_SSL: 'disable', PG_MIGRATE_PASSWORD: '' });
  assert(noPassword.status === 2 && noPassword.out.includes('PG_MIGRATE_PASSWORD'), 'no owner password, named and not connected');
}

// ---------------------------------------------------------------------------
// PART 2 — the loopback cluster, in parents_portal_m15 alone
// ---------------------------------------------------------------------------
function waitFor(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
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

// Every other table, as hashes compared and never printed. `users` is in here,
// so an account's whole row is covered.
async function othersDigest(client) {
  const { rows: tables } = await client.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname`
  );
  const digests = {};
  for (const { name } of tables) {
    if (name === 'activity_logs') continue;
    const { rows } = await client.query(`SELECT md5(COALESCE(string_agg(t::text, '|' ORDER BY t::text), '')) AS d FROM portal.${name} t`);
    digests[name] = rows[0].d;
  }
  return JSON.stringify(digests);
}

async function activityIds(client) {
  const { rows } = await client.query(`SELECT COALESCE(string_agg(id::text, ',' ORDER BY id), '') AS ids FROM portal.activity_logs`);
  return rows[0].ids;
}

// The fixture, planted again after every control that really deletes. Each row
// has the marker in `description`, the one place a leak would come from.
async function plant(client, mark, previous) {
  if (previous) {
    await client.query('DELETE FROM portal.activity_logs WHERE id = ANY($1::int[])', [
      [...previous.goes, ...previous.keptCodes, ...previous.clock, ...previous.since],
    ]);
  }
  await client.query(`DELETE FROM portal.activity_logs WHERE action = 'activity_log_reset'`);

  const add = async (action, at) => {
    const { rows } = await client.query(
      'INSERT INTO portal.activity_logs (action, description, created_at) VALUES ($1, $2, $3::timestamptz) RETURNING id',
      [action, `gate row ${mark}`, at]
    );
    return rows[0].id;
  };
  const plan = { goes: [], keptCodes: [], clock: [...reset.KEEP_IDS], since: [] };
  for (const action of GOES) plan.goes.push(await add(action, OLD));
  plan.goes.push(await add('login', JUST_BEFORE));
  for (const action of reset.KEEP_CODES) plan.keptCodes.push(await add(action, OLD));
  for (const id of reset.KEEP_IDS) {
    await client.query(
      'INSERT INTO portal.activity_logs (id, action, description, created_at) VALUES ($1, $2, $3, $4::timestamptz)',
      [id, 'bulk_record_attendance', `gate row ${mark}`, CLOCK_DAY]
    );
  }
  plan.since.push(await add('login', T));
  for (const action of SINCE_CODES) plan.since.push(await add(action, JUST_AFTER));
  return plan;
}

async function ruleProblems(client, plan) {
  const { rows } = await client.query('SELECT id FROM portal.activity_logs');
  const present = new Set(rows.map((row) => row.id));
  const problems = [];
  if ([...plan.keptCodes, ...plan.clock, ...plan.since].some((id) => !present.has(id))) problems.push('a kept row is gone');
  if (plan.goes.some((id) => present.has(id))) problems.push('a row that should go is still here');
  return problems;
}

async function resetRows(client) {
  const { rows } = await client.query(`SELECT user_id FROM portal.activity_logs WHERE action = 'activity_log_reset'`);
  return rows;
}

// A changed copy, compiled in memory as migration/scripts/serve-pg.js does its
// mutants: nothing on disk changes. run() is called because require.main is not
// this module.
function mutant(replacements, args, env) {
  const loader = `
    const fs = require('fs');
    const path = require('path');
    const Module = require('module');
    const file = path.resolve(${JSON.stringify(SCRIPT)});
    let source = fs.readFileSync(file, 'utf8');
    for (const [from, to] of ${JSON.stringify(replacements)}) {
      if (!source.includes(from)) {
        console.error('THE MUTANT DID NOT APPLY');
        process.exit(9);
      }
      source = source.replace(from, to);
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

async function theDryRun(client, plan, env, secrets) {
  console.log('\nThe dry run');
  const idsBefore = await activityIds(client);
  const othersBefore = await othersDigest(client);
  const dry = child(SCRIPT, [`--before=${T}`], env);
  assert(dry.status === 0, 'it exits 0', `status ${dry.status}`);
  assertClean('the dry run', dry.out, secrets);
  assert(dry.out.includes('Target: loopback.') && dry.out.includes('BEGIN READ ONLY'), 'it says where it is and that it cannot write');
  assert(dry.out.includes(`Delete: ${plan.goes.length} rows`), `it counts the ${plan.goes.length} rows that go`);
  assert(dry.out.includes(`Keep, older than the cutoff: ${plan.keptCodes.length + plan.clock.length} rows`), 'it counts the kept older rows');
  assert(dry.out.includes('Clock rows found: 3 of 3.'), 'it finds the clock rows');
  assert(dry.out.includes('restore_refused') && dry.out.includes('zz_gate_unknown_code'), 'it lists by action code, an unknown code included');
  assert(dry.out.includes('Dry run complete. Nothing was written.'), 'it says nothing was written');
  assert((await activityIds(client)) === idsBefore && (await othersDigest(client)) === othersBefore, 'and nothing was: every table is unchanged');

  await client.query('BEGIN READ ONLY');
  let code = null;
  try {
    await client.query('DELETE FROM portal.activity_logs WHERE id = -1');
  } catch (error) {
    code = error.code;
  }
  await client.query('ROLLBACK');
  assert(code === '25006', 'control: a READ ONLY transaction refuses a DELETE itself', String(code));
}

async function theRefusals(client, plan, env, secrets) {
  console.log('\nA wrong count, and a failure after the delete');
  const idsBefore = await activityIds(client);
  const othersBefore = await othersDigest(client);
  const same = async () => (await activityIds(client)) === idsBefore && (await othersDigest(client)) === othersBefore;

  const wrong = child(SCRIPT, [`--before=${T}`, `--expect=${plan.goes.length + 1}`, '--apply'], env);
  assert(wrong.status === 2 && wrong.out.includes('REFUSED'), 'an --expect that disagrees is refused');
  assertClean('that refusal', wrong.out, secrets);
  assert(await same(), 'and every table is unchanged');

  const midway = mutant([["atStep('commit');", "throw new Error('the gate stops here');"]], [`--before=${T}`, `--expect=${plan.goes.length}`, '--apply'], env);
  assert(midway.status === 1 && midway.out.includes('FAILED at'), 'a failure after the delete exits 1');
  assertClean('that failure', midway.out, secrets);
  assert(await same(), 'and the delete and the reset row are rolled back: every table is unchanged');
}

// Each one really commits on the fixture, so each is followed by a new planting.
async function theControls(client, firstPlan, mark, env) {
  console.log('\nNegative controls: each changed copy must break the rule the check holds');
  let plan = firstPlan;
  const n = () => plan.goes.length;
  const controls = [
    {
      name: 'no keep codes',
      replacements: [['const KEEP_CODES = Object.freeze([', "const KEEP_CODES = Object.freeze(['zz_none']); const UNUSED_CODES = Object.freeze(["]],
      expect: () => n() + plan.keptCodes.length,
    },
    {
      name: 'no keep ids',
      replacements: [['const KEEP_IDS = Object.freeze([5515, 5516, 5517]);', 'const KEEP_IDS = Object.freeze([1]);']],
      expect: () => n() + plan.clock.length,
    },
    {
      name: '<= for <, the row exactly at the cutoff',
      replacements: [["const OLDER = 'created_at < ?::timestamptz';", "const OLDER = 'created_at <= ?::timestamptz';"]],
      expect: () => n() + 1,
    },
  ];
  for (const control of controls) {
    const result = mutant(control.replacements, [`--before=${T}`, `--expect=${control.expect()}`, '--apply'], env);
    assert(result.status === 0, `${control.name}: the copy ran`, `status ${result.status}`);
    assert((await ruleProblems(client, plan)).length > 0, `control: ${control.name} fails the check`);
    plan = await plant(client, mark, plan);
  }

  const idsBefore = await activityIds(client);
  const unguarded = mutant(
    [
      ['if (parts.toDelete.total !== expect) {', 'if (false) {'],
      ['if (deleted.rowCount !== expect) {', 'if (false) {'],
    ],
    [`--before=${T}`, `--expect=${n() + 1}`, '--apply'],
    env
  );
  assert(unguarded.status === 0 && (await activityIds(client)) !== idsBefore, 'control: without its two count checks a wrong --expect commits');
  return plant(client, mark, plan);
}

async function theReset(client, plan, env, secrets, adminId) {
  console.log('\nThe reset');
  const othersBefore = await othersDigest(client);
  const applied = child(SCRIPT, [`--before=${T}`, `--expect=${plan.goes.length}`, '--apply'], env);
  assert(applied.status === 0, 'it exits 0', `status ${applied.status}`);
  assertClean('the reset', applied.out, secrets);
  assert(applied.out.includes('Reset committed.') && applied.out.includes('Row counts equal, activity_logs aside.'), 'it commits, and says the other counts held');

  const problems = await ruleProblems(client, plan);
  assert(problems.length === 0, 'exactly the rows the rule names are gone: the keep-list, the clock rows and the row at the cutoff stay', problems.join(', '));
  assert((await othersDigest(client)) === othersBefore, 'every other table is unchanged, users included');
  const rows = await resetRows(client);
  assert(rows.length === 1 && rows[0].user_id === adminId, 'one activity_log_reset row, on the admin');

  const again = child(SCRIPT, [`--before=${T}`], env);
  assert(again.out.includes('Delete: 0 rows.') && again.out.includes(`Keep, older than the cutoff: ${plan.keptCodes.length + plan.clock.length} rows`), 'a dry run after it finds nothing to delete and the same kept rows');
  const twice = child(SCRIPT, [`--before=${T}`, '--expect=0', '--apply'], env);
  assert(twice.status === 0 && twice.out.includes('Nothing to delete.'), 'a second --apply writes nothing');
  assert((await resetRows(client)).length === 1, 'and adds no second reset row');
}

async function theLogAfter(client, token, secrets, otherBefore) {
  console.log('\nThe Activity log after it');
  const headers = { Authorization: `Bearer ${token}` };
  const get = (route) => fetch(`${BASE}/api${route}`, { headers });

  assert(otherBefore === true, 'control: before the reset, the unknown code made an Other group');
  const actions = await (await get('/activity-logs/actions')).json();
  assert(actions.success && !actions.groups.some((group) => group.key === 'other'), 'afterwards there is no Other group: every code left has a label');

  const from = '2026-09-01';
  const { rows } = await client.query(`SELECT COUNT(*) AS n FROM portal.activity_logs WHERE created_at >= '2026-09-01T00:00:00+08:00'`);
  const list = await (await get(`/activity-logs?from=${from}`)).json();
  assert(list.success && Number(list.page.total) === Number(rows[0].n), 'the list answers, with the right total');
  const keys = list.entries.length ? Object.keys(list.entries[0]).sort().join(',') : '';
  assert(keys === 'action,action_group,action_label,actor_name,actor_role,created_at,id', 'an entry is still its seven fields');

  const mine = await (await get('/activity-logs?action=activity_log_reset')).json();
  const entry = mine.entries[0];
  assert(mine.entries.length === 1 && entry.action_label === 'Reset the activity log' && entry.action_group === 'system' && entry.actor_role === 'admin', 'the reset row reads in English, in System, on the admin');

  const csv = await get(`/activity-logs/export?from=${from}`);
  const bytes = Buffer.from(await csv.arrayBuffer());
  const text = bytes.toString('utf8');
  assert(csv.status === 200 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'the CSV downloads, with its BOM');
  assert(text.split('\r\n')[0].split(',').length === 8, 'its header is eight columns');
  assert(leaksIn(text, secrets.slice(0, 1)).length === 0, 'and no description reached it');
}

async function theRestore(client, plan, env, secrets) {
  console.log('\nA real restore of an archive made after the reset');
  const script = path.join(ROOT, 'migration', 'scripts', 'restore-e2e.js');
  const restored = child(script, ['--api', BASE], env);
  const clean = assertClean('restore-e2e', restored.out, secrets);
  assert(restored.status === 0, 'restore-e2e passes: every table back, every session cut, no sequence backwards', `status ${restored.status}`);
  if (clean && restored.status !== 0) console.error(restored.out.trim());
  const problems = await ruleProblems(client, plan);
  assert(problems.length === 0, 'the deleted rows stay gone and the kept rows stay', problems.join(', '));
  assert((await resetRows(client)).length === 1, 'the reset row came back with the archive');
}

async function gate() {
  console.log(`\nPART 2 — the gate, in ${GATE_DB} on the loopback cluster`);
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = secret; // before utils/jwt.js loads, for this run alone
  const { Client } = require('pg');
  const { LOCAL_PG } = require('../../migration/lib/env');
  const { signToken } = require('../utils/jwt');

  const mark = `m15-marker-${crypto.randomBytes(6).toString('hex')}`;
  const secrets = [mark, secret, LOCAL_PG.password];
  const env = withoutFlags({
    ...process.env,
    PG_HOST: '127.0.0.1',
    PG_PORT: String(LOCAL_PG.port),
    PG_DATABASE: GATE_DB,
    PG_SSL: 'disable',
    PG_USER: LOCAL_PG.user,
    PG_PASSWORD: LOCAL_PG.password,
    PG_MIGRATE_USER: LOCAL_PG.user,
    PG_MIGRATE_PASSWORD: LOCAL_PG.password,
    PORT: String(GATE_PORT),
    MAIL_TRANSPORT: 'file',
    SMS_TRANSPORT: 'file',
    JWT_SECRET: secret,
  });

  // db:setup prints the seeded sign-ins: captured, never shown, never scanned.
  const setup = child('scripts/setup-db.js', [], env);
  assert(setup.status === 0, 'db:setup, on this database alone', `status ${setup.status}`);
  if (setup.status !== 0) return;

  const client = new Client({ host: '127.0.0.1', port: LOCAL_PG.port, user: LOCAL_PG.user, password: LOCAL_PG.password, database: GATE_DB, ssl: false });
  await client.connect();
  await client.query('SET search_path TO portal, pg_catalog');

  let server = null;
  try {
    // Past the clock rows, as production's ids are, or a restore's lost-entries
    // count (every id above the archive's highest) would read 0.
    await client.query(`SELECT setval(pg_get_serial_sequence('portal.activity_logs', 'id'), 6000)`);
    let plan = await plant(client, mark, null);

    await theDryRun(client, plan, env, secrets);
    await theRefusals(client, plan, env, secrets);
    plan = await theControls(client, plan, mark, env);

    // The account gates, stamped by hand on this disposable database.
    const { rows: admins } = await client.query('SELECT id, token_version FROM users WHERE login_id = $1', [demo.ADMIN_LOGIN]);
    const admin = admins[0];
    const versions = JSON.parse(fs.readFileSync(path.join(SERVER, 'policy', 'versions.json'), 'utf8'));
    await client.query(`INSERT INTO policy_acceptances (user_id, document, version) VALUES ($1, 'privacy_notice', $2), ($1, 'terms_of_use', $3)`, [
      admin.id,
      versions.privacy_notice.version,
      versions.terms_of_use.version,
    ]);
    await client.query('UPDATE users SET email = $1, email_verified_at = portal.now_s() WHERE id = $2', ['gate@example.invalid', admin.id]);
    const token = signToken({ id: admin.id, role: 'admin', v: Number(admin.token_version) });

    server = spawn(process.execPath, [path.join(ROOT, 'migration', 'scripts', 'serve-pg.js')], { cwd: SERVER, env, stdio: 'ignore' });
    assert(await waitForHealth(), `the API answers on ${GATE_PORT}`);
    const groupsBefore = await (await fetch(`${BASE}/api/activity-logs/actions`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const otherBefore = Boolean(groupsBefore.success) && groupsBefore.groups.some((group) => group.key === 'other');

    await theReset(client, plan, env, secrets, admin.id);
    await theLogAfter(client, token, secrets, otherBefore);
    await theRestore(client, plan, env, secrets);
  } finally {
    await client.end();
    if (server) {
      server.kill();
      await waitFor(500);
    }
  }
}

async function main() {
  console.log('PART 1 — no database, no port');
  partOneArguments();
  partOneGuard();
  partOneKeepList();
  partOneSource();
  partOneChildren();
  if (process.argv.includes('--gate')) await gate();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`FAILED: ${(error && error.code) || 'no code'} — ${error && error.name}`);
  process.exitCode = 1;
});
