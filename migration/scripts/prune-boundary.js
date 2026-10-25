#!/usr/bin/env node
// CHECK 1's BOUNDARY EVIDENCE (Phase B, docs/05 §3b) — the 24-hour sign-in
// prune, the ORIGINAL statement (server/utils/loginThrottle.js at 5426b70,
// read from git) on the MySQL scratch and the PORTED statement (this tree's
// server/utils/loginThrottle.js, numbered by config/db.js's toPg) on the local
// PostgreSQL copy. Each engine runs, for each session time zone (UTC and
// Manila), inside ONE transaction that is ROLLED BACK, with the clock FROZEN
// at one instant: MySQL through SET TIMESTAMP, PostgreSQL by replacing
// portal.now_s() inside the transaction (DDL rolls back with it).
//
// Seven synthetic rows sit around the cutoff beside the copied rows (mixed
// data): one second past it, exactly on it, one second inside it, an hour old,
// now, thirty days old, and an hour in the future. The copied rows' expected
// deletions come from an INDEPENDENT oracle — each row's epoch compared in
// JavaScript with T - KEEP_HOURS * 3600 — never from the statement under test.
// The prune then runs a second time (it must remove nothing more), the
// transaction rolls back, and a SEPARATE connection confirms nothing remains.
//
// Synthetic rows print by their label; copied rows only as counts.
//   node scripts/prune-boundary.js --target local --source-db <parents_portal_migsrc_*> [--control le|minutes]
// --control breaks BOTH statements in memory (`<` becomes `<=`, or hours
// become minutes) — a negative control: the run must then FAIL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client } = require('../lib/pg');
const { scratch } = require('../lib/mysql');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const ROOT = path.join(__dirname, '..', '..');
const ORIGINAL_REV = '5426b70';
const T = Date.UTC(2026, 9, 25, 4, 0, 0) / 1000; // 2026-10-25 12:00:00 in Manila
const LABELS = [
  ['past_cutoff_by_1s', -86401, 'deleted'],
  ['exactly_on_cutoff', -86400, 'kept'],
  ['inside_cutoff_by_1s', -86399, 'kept'],
  ['one_hour_old', -3600, 'kept'],
  ['now', 0, 'kept'],
  ['thirty_days_old', -30 * 86400, 'deleted'],
  ['one_hour_in_future', 3600, 'kept'],
];
const ZONES = [
  { name: 'UTC', mysql: '+00:00', pg: 'UTC' },
  { name: 'Manila', mysql: '+08:00', pg: 'Asia/Manila' },
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function only(re, text, what) {
  const all = [...text.matchAll(new RegExp(re.source, 'g'))];
  if (all.length !== 1) throw new Error(`${what}: expected exactly one match, found ${all.length}`);
  return all[0];
}

function statements() {
  const original = execFileSync('git', ['-C', ROOT, 'show', `${ORIGINAL_REV}:server/utils/loginThrottle.js`], { encoding: 'utf8' });
  const ported = fs.readFileSync(path.join(ROOT, 'server', 'utils', 'loginThrottle.js'), 'utf8');
  const hours = (src, what) => Number(only(/const KEEP_HOURS = (\d+);/, src, `${what} KEEP_HOURS`)[1]);
  return {
    mysql: only(/'(DELETE FROM login_attempts WHERE attempted_at < \(NOW\(\) - INTERVAL \? HOUR\))'/, original, 'the original prune')[1],
    pg: only(/'(DELETE FROM login_attempts WHERE attempted_at < \(portal\.now_s\(\) - make_interval\(hours => \?\)\))'/, ported, 'the ported prune')[1],
    hoursMysql: hours(original, 'the original'),
    hoursPg: hours(ported, 'the ported'),
  };
}

async function onMysql(db, sql, hours, zone, key) {
  const c = await scratch(db);
  const out = { zone: zone.name };
  try {
    await c.query('SET time_zone = ?', [zone.mysql]);
    await c.query('START TRANSACTION');
    await c.query('SET TIMESTAMP = ?', [T]);
    const [real] = await c.query('SELECT UNIX_TIMESTAMP(attempted_at) AS e FROM login_attempts');
    out.copied_rows = real.length;
    out.copied_expected_deleted = real.filter((r) => Number(r.e) < T - hours * 3600).length;
    const ids = {};
    for (const [label, offset] of LABELS) {
      const [r] = await c.query('INSERT INTO login_attempts (login_key, ip, cleared, attempted_at) VALUES (?, ?, 0, FROM_UNIXTIME(?))', [key, '192.0.2.1', T + offset]);
      ids[r.insertId] = label;
    }
    const [first] = await c.query(sql, [hours]);
    const [survivors] = await c.query('SELECT id FROM login_attempts WHERE login_key = ?', [key]);
    const [[after]] = await c.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key <> ?', [key]);
    const [second] = await c.query(sql, [hours]);
    out.removed_first_run = first.affectedRows;
    out.copied_deleted = real.length - Number(after.n);
    out.removed_second_run = second.affectedRows;
    out.synthetic_kept = survivors.map((r) => ids[r.id]).sort();
    await c.query('ROLLBACK');
    await c.query('SET TIMESTAMP = DEFAULT');
  } finally {
    await c.end();
  }
  const v = await scratch(db);
  try {
    const [[left]] = await v.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = ?', [key]);
    const [[all]] = await v.query('SELECT COUNT(*) AS n FROM login_attempts');
    out.after_rollback_synthetic_left = Number(left.n);
    out.after_rollback_rows = Number(all.n);
  } finally {
    await v.end();
  }
  return out;
}

async function onPg(cfg, sql, hours, zone, key) {
  const c = await client(cfg);
  const out = { zone: zone.name };
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL search_path = portal, public');
    await c.query(`SET LOCAL TIME ZONE '${zone.pg}'`);
    await c.query(`CREATE OR REPLACE FUNCTION portal.now_s() RETURNS timestamptz LANGUAGE sql STABLE AS $f$ SELECT to_timestamp(${Number(T)}) $f$`);
    const real = (await c.query('SELECT extract(epoch FROM attempted_at)::bigint AS e FROM login_attempts')).rows;
    out.copied_rows = real.length;
    out.copied_expected_deleted = real.filter((r) => Number(r.e) < T - hours * 3600).length;
    const ids = {};
    for (const [label, offset] of LABELS) {
      const r = await c.query('INSERT INTO login_attempts (login_key, ip, cleared, attempted_at) VALUES ($1, $2, 0, to_timestamp($3)) RETURNING id', [key, '192.0.2.1', T + offset]);
      ids[r.rows[0].id] = label;
    }
    const first = await c.query(sql.text, [hours]);
    const survivors = (await c.query('SELECT id FROM login_attempts WHERE login_key = $1', [key])).rows;
    const after = (await c.query('SELECT COUNT(*)::int AS n FROM login_attempts WHERE login_key <> $1', [key])).rows[0].n;
    const second = await c.query(sql.text, [hours]);
    out.removed_first_run = first.rowCount;
    out.copied_deleted = real.length - after;
    out.removed_second_run = second.rowCount;
    out.synthetic_kept = survivors.map((r) => ids[r.id]).sort();
    await c.query('ROLLBACK');
  } finally {
    await c.end();
  }
  const v = await client(cfg);
  try {
    out.after_rollback_synthetic_left = (await v.query('SELECT COUNT(*)::int AS n FROM portal.login_attempts WHERE login_key = $1', [key])).rows[0].n;
    out.after_rollback_rows = (await v.query('SELECT COUNT(*)::int AS n FROM portal.login_attempts')).rows[0].n;
    const fn = (await v.query("SELECT pg_get_functiondef('portal.now_s()'::regprocedure) AS d")).rows[0].d;
    out.now_s_restored = /statement_timestamp\(\)/.test(fn) && !/to_timestamp/.test(fn);
  } finally {
    await v.end();
  }
  return out;
}

async function main() {
  const target = targetConfig();
  if (!isDisposableLocal(target)) throw new Error('prune-boundary runs on the disposable local target only (--target local).');
  const sourceDb = arg('--source-db');
  if (!/^parents_portal_migsrc_[0-9_]+$/.test(sourceDb || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch.');
  const s = statements();
  const control = arg('--control');
  if (control === 'le') {
    s.mysql = s.mysql.replace('attempted_at <', 'attempted_at <=');
    s.pg = s.pg.replace('attempted_at <', 'attempted_at <=');
  } else if (control === 'minutes') {
    s.mysql = s.mysql.replace('INTERVAL ? HOUR', 'INTERVAL ? MINUTE');
    s.pg = s.pg.replace('hours =>', 'mins =>');
  } else if (control) {
    throw new Error('--control must be le or minutes.');
  }
  if (control) console.log(`NEGATIVE CONTROL ${control}: both statements broken in memory — this run must FAIL`);
  const pgSql = require('../../server/config/db').toPg(s.pg, [s.hoursPg]);
  const expectKept = LABELS.filter((l) => l[2] === 'kept').map((l) => l[0]).sort();
  const results = { T_epoch: T, keep_hours: [s.hoursMysql, s.hoursPg], runs: [] };
  let failures = 0;
  for (const zone of ZONES) {
    for (const engine of ['mysql', 'pg']) {
      const key = crypto.randomBytes(32).toString('hex');
      const r = engine === 'mysql' ? await onMysql(sourceDb, s.mysql, s.hoursMysql, zone, key) : await onPg(target.pg, pgSql, s.hoursPg, zone, key);
      r.engine = engine;
      const problems = [];
      if (JSON.stringify(r.synthetic_kept) !== JSON.stringify(expectKept)) problems.push('the synthetic survivors differ from the expectation');
      if (r.copied_deleted !== r.copied_expected_deleted) problems.push('the copied rows deleted differ from the epoch oracle');
      if (r.removed_first_run !== r.copied_expected_deleted + (LABELS.length - expectKept.length)) problems.push('the first run removed an unexpected number of rows');
      if (r.removed_second_run !== 0) problems.push('the second run removed rows');
      if (r.after_rollback_synthetic_left !== 0) problems.push('synthetic rows survived the rollback');
      if (r.after_rollback_rows !== r.copied_rows) problems.push('the copied row count changed across the rollback');
      if (engine === 'pg' && !r.now_s_restored) problems.push('portal.now_s() was not restored by the rollback');
      r.problems = problems;
      failures += problems.length;
      results.runs.push(r);
      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${engine.padEnd(5)} ${zone.name.padEnd(6)} copied ${r.copied_rows} (oracle deletes ${r.copied_expected_deleted}, deleted ${r.copied_deleted}); first run removed ${r.removed_first_run}, second ${r.removed_second_run}; synthetic kept: ${r.synthetic_kept.join(', ')}${problems.length ? ` — ${problems.join('; ')}` : ''}`);
    }
  }
  const byZone = (engine) => results.runs.filter((r) => r.engine === engine).map((r) => [r.copied_deleted, r.removed_first_run, r.synthetic_kept.join()]);
  const zonesAgree = ['mysql', 'pg'].every((e) => new Set(byZone(e).map((x) => JSON.stringify(x))).size === 1);
  const enginesAgree = JSON.stringify(byZone('mysql')) === JSON.stringify(byZone('pg'));
  if (!zonesAgree) failures += 1;
  if (!enginesAgree) failures += 1;
  console.log(`time zones agree on each engine: ${zonesAgree}; MySQL and PostgreSQL agree: ${enginesAgree}`);
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = path.join(P.REHEARSAL_DIR, `prune_boundary_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ ...results, zonesAgree, enginesAgree, failures }, null, 2));
  console.log(`${failures ? `PRUNE BOUNDARY: ${failures} problem(s)` : 'PRUNE BOUNDARY OK'} — report: ${out}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error('prune-boundary failed:', safeMessage(e));
  process.exit(1);
});
