#!/usr/bin/env node
// THE TEST OF scripts/drop-staging-schema.js — on the embedded local cluster
// ONLY (127.0.0.1, its own port). It never passes --target staging, never
// reads supabase.env and opens no connection anywhere else: the staging path
// is the owner's to run (the cutover plan's step 4).
//
//   node scripts/test-drop-staging-schema.js [--script <path>]
//
// It creates its OWN database, parents_portal_droptest_<stamp> (refusing one
// that already exists), applies schema/001 and schema/003 to it in one
// transaction as on staging, adds one row, and drops that database at the end,
// pass or fail. Nothing else on the cluster is written.
//
//   A. The argument guard: exit 2, with no survey and no question, for
//      parents_portal_pg, a name outside parents_portal_droptest_*, a missing
//      --database, a missing --target, --tls-encrypt-only and an unknown
//      argument; parents_portal_pg's schema is the same afterwards.
//   B. THE SURVEY BEFORE THE QUESTION: on every run that asks, the script is
//      HELD at its question — no answer is sent until the question has been
//      printed — and at that moment the output already holds the survey (the
//      plan's 26 tables, 25 sequences, 13 enum types, 3 functions, portal.ci,
//      26 policies, the one row, nothing outside portal) and then the
//      statement, in that order, and the schema is still in the database.
//   C. Every answer that is not exactly DROP portal refuses with exit 3 and
//      changes nothing: other case, a leading or trailing space, a double
//      space, other words, an empty line, and the end of input.
//  C2. A view OUTSIDE portal that depends on it: the survey names it and the
//      script refuses (exit 3) before asking, with DROP portal waiting on the
//      input; the schema and the view are both still there.
//   D. DROP portal (with CRLF, as a Windows console sends it): exit 0, the
//      read-back says 0, the catalog agrees, portal_app and portal_migrate
//      are still there.
//   E. A second run finds nothing to drop and asks nothing.
//
// --script runs the same checks against another copy (a negative control).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const env = require('../lib/env');
const { client } = require('../lib/pg');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const MIGRATION_DIR = path.join(__dirname, '..');
const scriptArg = process.argv.indexOf('--script');
const SCRIPT = scriptArg > 0 ? path.resolve(process.argv[scriptArg + 1]) : path.join(__dirname, 'drop-staging-schema.js');
const QUESTION = 'Type DROP portal to drop it';
const RUN_TIMEOUT_MS = 60000;

const results = [];
function check(name, ok, note) {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${results.length}. ${name}${!ok && note ? ` — ${note}` : ''}`);
}

function stamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function localSettings(database) {
  const cfg = { ...env.localConfig(), database };
  if (cfg.host !== '127.0.0.1' || cfg.port !== env.LOCAL_PG.port) throw new Error('not the embedded local cluster');
  return cfg;
}

async function schemaFacts(database) {
  const c = await client(localSettings(database));
  try {
    const [r] = (
      await c.query(
        `SELECT (SELECT count(*) FROM pg_namespace WHERE nspname = 'portal')::int AS schemas,
                (SELECT count(*) FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
                  WHERE n.nspname = 'portal' AND k.relkind IN ('r', 'p'))::int AS tables`
      )
    ).rows;
    return r;
  } finally {
    await c.end();
  }
}

// 001 + 003 in one transaction, as apply-schema.js does on staging, and one row.
async function applySchema(database) {
  const c = await client(localSettings(database));
  try {
    await c.query('BEGIN');
    await c.query(fs.readFileSync(path.join(P.SCHEMA_DIR, '001_portal_schema.sql'), 'utf8'));
    await c.query(fs.readFileSync(path.join(P.SCHEMA_DIR, '003_grants_rls.sql'), 'utf8'));
    await c.query("INSERT INTO portal.system_settings (setting_key, setting_value) VALUES ('droptest', 'one row')");
    await c.query('COMMIT');
  } finally {
    await c.end();
  }
}

// The one row the test added; null once the table is gone (a wrong drop is
// then a FAIL line, not a crash of the test).
async function settingsRows(database) {
  const c = await client(localSettings(database));
  try {
    const [t] = (await c.query("SELECT to_regclass('portal.system_settings') IS NOT NULL AS present")).rows;
    if (!t.present) return null;
    return (await c.query('SELECT count(*)::int AS n FROM portal.system_settings')).rows[0].n;
  } finally {
    await c.end();
  }
}

// One run of the script. `answer` is a string to send once the question is
// printed, null to close the input at the question (the end of input), or
// undefined for a run that must never ask (the input is closed at once).
// While the script is held at its question, `onQuestion(outSoFar)` runs
// BEFORE anything is sent.
function run(args, answer, onQuestion) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: MIGRATION_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    let asked = false;
    let atQuestion = null;
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    // a write after the script has already exited is not a failure of the test
    child.stdin.on('error', () => {});
    if (answer === undefined) child.stdin.end();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (!asked && out.includes(QUESTION)) {
        asked = true;
        const snapshot = out;
        Promise.resolve(onQuestion ? onQuestion(snapshot) : null)
          .then((facts) => {
            atQuestion = { out: snapshot, facts };
          })
          .catch((e) => {
            atQuestion = { out: snapshot, error: safeMessage(e) };
          })
          .finally(() => {
            if (answer === undefined) return;
            if (answer !== null) child.stdin.write(answer);
            child.stdin.end();
          });
      }
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code === null ? `signal ${signal}` : code, out, err, asked, atQuestion });
    });
  });
}

const SURVEY_LINES = [
  '--- SURVEY (read-only)',
  'tables 26, sequences 25,',
  'enum types 13,',
  'functions 3, collations 1',
  'policies 26,',
  'collations: portal.ci',
  'rows: 1 in 1 of 26 tables',
  'objects outside portal that CASCADE would also reach: 0',
  '--- end of survey ---',
];
const STATEMENT_LINE = 'DROP SCHEMA portal CASCADE;';

function surveyBeforeQuestion(out) {
  const missing = SURVEY_LINES.filter((l) => !out.includes(l));
  if (missing.length) return `missing at the question: ${missing.join(' | ')}`;
  const iSurvey = out.indexOf('--- end of survey ---');
  const iStatement = out.indexOf(STATEMENT_LINE);
  const iQuestion = out.indexOf(QUESTION);
  if (iStatement < 0) return 'the statement was not printed before the question';
  if (!(iSurvey < iStatement && iStatement < iQuestion)) return 'not in the order survey, statement, question';
  return null;
}

async function main() {
  if (!fs.existsSync(SCRIPT)) throw new Error('the script under test is missing');
  const name = `parents_portal_droptest_${stamp()}`;
  const admin = await client(localSettings('postgres'));
  let created = false;
  try {
    const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount > 0;
    if (exists) throw new Error(`${name} already exists — refusing to reuse a database this run did not create`);
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);
    created = true;
    console.log(`created ${name} on the embedded cluster`);

    await applySchema(name);
    const start = await schemaFacts(name);
    console.log(`schema applied: ${start.schemas} portal schema, ${start.tables} tables`);
    const ppg = (await admin.query("SELECT 1 FROM pg_database WHERE datname = 'parents_portal_pg'")).rowCount > 0;
    const ppgBefore = ppg ? await schemaFacts('parents_portal_pg') : null;

    // --- A. the argument guard ---------------------------------------------
    const guard = [
      ['parents_portal_pg', ['--target', 'local', '--database', 'parents_portal_pg']],
      ['a name outside parents_portal_droptest_*', ['--target', 'local', '--database', 'parents_portal_fixround_20261025']],
      ['a missing --database', ['--target', 'local']],
      ['a missing --target', ['--database', name]],
      ['--tls-encrypt-only', ['--target', 'local', '--database', name, '--tls-encrypt-only']],
      ['an unknown argument', ['--target', 'local', '--database', name, '--yes']],
    ];
    for (const [label, args] of guard) {
      const r = await run(args, undefined);
      check(`guard: ${label} is refused with exit 2 before any survey or question`, r.code === 2 && !r.asked && !r.out.includes('--- SURVEY'), `exit ${r.code}`);
    }
    if (ppgBefore) {
      const ppgAfter = await schemaFacts('parents_portal_pg');
      check('guard: parents_portal_pg is the same afterwards', JSON.stringify(ppgAfter) === JSON.stringify(ppgBefore));
    }

    // --- B + C. every wrong answer, each held at the question first --------
    const wrong = [
      ['other case: drop portal', 'drop portal\n'],
      ['a trailing space', 'DROP portal \n'],
      ['a leading space', ' DROP portal\n'],
      ['a double space', 'DROP  portal\n'],
      ['other words: DROP SCHEMA portal', 'DROP SCHEMA portal\n'],
      ['yes', 'yes\n'],
      ['an empty line', '\n'],
      ['the end of input', null],
    ];
    for (const [label, answer] of wrong) {
      const r = await run(['--target', 'local', '--database', name], answer, () => schemaFacts(name));
      const order = r.atQuestion ? surveyBeforeQuestion(r.atQuestion.out) : 'never asked';
      const present = r.atQuestion && r.atQuestion.facts && r.atQuestion.facts.schemas === 1 && r.atQuestion.facts.tables === 26;
      check(`survey before the question (${label}): the survey, then the statement, then the question, with the schema still present`, r.asked && !order && present, order || 'the schema was not present at the question');
      const after = await schemaFacts(name);
      const rows = await settingsRows(name);
      check(`refused (${label}): exit 3, nothing changed`, r.code === 3 && after.schemas === 1 && after.tables === 26 && rows === 1 && /REFUSED/.test(r.err), `exit ${r.code}`);
      // a copy that dropped on a wrong answer: rebuild, so each case is judged alone
      if (after.schemas === 0) await applySchema(name);
    }

    // --- C2. something OUTSIDE portal depends on it: refused before asking,
    // even with the exact phrase waiting on the input --------------------------
    const v = await client(localSettings(name));
    try {
      await v.query('CREATE VIEW public.droptest_outside AS SELECT id FROM portal.system_settings');
    } finally {
      await v.end();
    }
    const reach = await run(['--target', 'local', '--database', name], 'DROP portal\n');
    const kept = await schemaFacts(name);
    const w = await client(localSettings(name));
    let viewKept;
    try {
      viewKept = (await w.query("SELECT to_regclass('public.droptest_outside') IS NOT NULL AS present")).rows[0].present;
      await w.query('DROP VIEW IF EXISTS public.droptest_outside');
    } finally {
      await w.end();
    }
    check(
      'outside dependents: the survey names 1, exit 3, no question, the schema and the outside view both kept',
      reach.code === 3 && !reach.asked && reach.out.includes('objects outside portal that CASCADE would also reach: 1') && reach.out.includes('public.droptest_outside') && kept.schemas === 1 && kept.tables === 26 && viewKept,
      `exit ${reach.code}`
    );

    // --- D. the exact phrase ------------------------------------------------
    const ok = await run(['--target', 'local', '--database', name], 'DROP portal\r\n', () => schemaFacts(name));
    const order = ok.atQuestion ? surveyBeforeQuestion(ok.atQuestion.out) : 'never asked';
    check('survey before the question (DROP portal): the survey, then the statement, then the question', ok.asked && !order, order);
    const gone = await schemaFacts(name);
    check('DROP portal: exit 0, COMMIT done, the read-back says 0', ok.code === 0 && ok.out.includes('COMMIT done') && ok.out.includes('portal schemas: 0'), `exit ${ok.code}`);
    check('DROP portal: the catalog has no portal schema and no portal table', gone.schemas === 0 && gone.tables === 0);
    check('DROP portal: portal_app and portal_migrate are present and unchanged', ok.out.includes('roles: portal_app, portal_migrate present; their settings unchanged'));
    const [roles] = (await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('portal_app', 'portal_migrate')")).rows;
    check('DROP portal: both roles still in pg_roles', roles.n === 2);
    console.log('  what that run printed (names and counts only):');
    for (const line of ok.out.split(/\r?\n/)) if (line.trim()) console.log(`  | ${line}`);

    // --- E. nothing left to drop -------------------------------------------
    const again = await run(['--target', 'local', '--database', name], undefined);
    check('a second run: nothing to drop, exit 0, no question', again.code === 0 && !again.asked && again.out.includes('portal is absent — nothing to drop'), `exit ${again.code}`);
  } finally {
    if (created) {
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(name)} WITH (FORCE)`);
      const left = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount;
      console.log(`${left ? 'STILL PRESENT' : 'dropped'} ${name}`);
    }
    await admin.end();
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed${SCRIPT.endsWith(path.join('scripts', 'drop-staging-schema.js')) ? '' : ' (against another copy of the script)'}`);
  return passed === results.length && results.length > 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`test-drop-staging-schema failed: ${safeMessage(e)}`);
    process.exit(1);
  });
