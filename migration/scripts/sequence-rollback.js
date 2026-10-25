#!/usr/bin/env node
// THE SEQUENCE-ROLLBACK TEST (Phase 3, commit 7 — the brief's section 4): the
// real scripts/transfer.js, failed AFTER its sequence step, and a record of
// what survives the rollback.
//
//   node scripts/sequence-rollback.js --source-db <name|latest>
//
// transfer.js writes in ONE transaction and sets every identity sequence
// inside it, table by table, then checks the fixed state row and COMMITs.
// setval() is not transactional. To fail the transfer after every sequence
// step without touching transfer.js, this script plants, for the run only, a
// DEFERRED constraint trigger on portal.auth_security_state that raises at
// COMMIT — the last moment of the transfer — runs transfer.js --truncate
// against the scratch, expects it to fail, and compares the target before
// and after: every table's rows, every sequence's next value and highest id.
// The trigger and its function are dropped in a finally, and asserted gone.
//
// SINCE P3-C-R2 C2 THE EXPECTATION IS INVERTED: transfer.js moves each
// sequence with ALTER SEQUENCE … RESTART, which rolls back, so a transfer
// failed here must leave every sequence where it was (`ok`). This script
// measured the defect (05 §0c, commit 7: every setval() survived); its
// successor with every failure point is scripts/transfer-failures.js.
//
// The disposable LOCAL target only (lib/env.js isDisposableLocal). Prints
// counts and sequence numbers, never a row. The report goes to
// <DATA_DIR>/rehearsal/seqrollback_<stamp>.json.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client: connect } = require('../lib/pg');
const { readOnly, admin } = require('../lib/mysql');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const FN = 'portal.zz_rehearsal_fail_at_commit';
const TRIGGER = 'zz_rehearsal_fail_at_commit';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function resolveSourceDb(name) {
  if (name !== 'latest') {
    if (!/^parents_portal_migsrc_[0-9_]+$/.test(name || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch database, or latest.');
    return name;
  }
  const conn = await admin();
  try {
    const [rows] = await conn.query("SHOW DATABASES LIKE 'parents\\_portal\\_migsrc\\_%'");
    const names = rows.map((r) => Object.values(r)[0]).sort();
    if (!names.length) throw new Error('No parents_portal_migsrc_* database exists.');
    return names[names.length - 1];
  } finally {
    await conn.end();
  }
}

async function state(c) {
  const { rows: tables } = await c.query(
    "SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname"
  );
  const { rows: seqs } = await c.query(
    `SELECT t.relname AS t, s.relname AS s FROM pg_depend d
       JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S' JOIN pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_class t ON t.oid = d.refobjid
      WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i') AND n.nspname = 'portal'`
  );
  const seqOf = new Map(seqs.map((r) => [r.t, r.s]));
  const out = {};
  for (const { t } of tables) {
    const rows = Number((await c.query(`SELECT count(*)::bigint AS n FROM portal."${t}"`)).rows[0].n);
    const entry = { rows };
    if (seqOf.has(t)) {
      const v = (await c.query(`SELECT last_value, is_called FROM portal."${seqOf.get(t)}"`)).rows[0];
      entry.next = v.is_called ? Number(v.last_value) + 1 : Number(v.last_value);
      const m = (await c.query(`SELECT max(id)::bigint AS m FROM portal."${t}"`)).rows[0].m;
      entry.max_id = m === null ? null : Number(m);
    }
    out[t] = entry;
  }
  return out;
}

async function main() {
  const target = targetConfig(['node', 'x', '--target', 'local']);
  if (!isDisposableLocal(target)) throw new Error('The sequence-rollback test runs on the disposable local cluster only.');
  const sourceDb = await resolveSourceDb(arg('--source-db', 'latest'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');

  // The source's AUTO_INCREMENT: transfer.js leaves each sequence's next value
  // equal to it.
  const src = await readOnly({ database: sourceDb });
  const [ai] = await src.query('SELECT TABLE_NAME t, AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [sourceDb]);
  await src.end();
  const sourceNext = new Map(ai.map((r) => [r.t, r.ai === null ? null : Number(r.ai)]));

  const c = await connect(target.pg);
  const report = { source_database: sourceDb, started_at: new Date().toISOString() };
  try {
    const before = await state(c);
    await c.query('BEGIN');
    await c.query(
      `CREATE FUNCTION ${FN}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'sequence-rollback test: refused at COMMIT, after every sequence step'; END $$`
    );
    await c.query(
      `CREATE CONSTRAINT TRIGGER ${TRIGGER} AFTER INSERT ON portal.auth_security_state
         DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${FN}()`
    );
    await c.query('COMMIT');
    console.log('planted: a deferred constraint trigger that refuses the transfer at COMMIT');

    const run = spawnSync(process.execPath, [path.join(__dirname, 'transfer.js'), '--target', 'local', '--source-db', sourceDb, '--truncate'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    report.transfer_exit = run.status;
    console.log(`transfer.js exit ${run.status} (expected 1: refused at COMMIT)`);

    const after = await state(c);
    const tables = Object.keys(before);
    const rowsKept = tables.filter((t) => after[t].rows === before[t].rows).length;
    const withSeq = tables.filter((t) => before[t].next !== undefined);
    const moved = withSeq.filter((t) => after[t].next !== before[t].next);
    const atSource = withSeq.filter((t) => sourceNext.get(t) !== null && after[t].next === sourceNext.get(t));
    const backwards = withSeq.filter((t) => after[t].next < before[t].next);
    const collide = withSeq.filter((t) => after[t].max_id !== null && after[t].next <= after[t].max_id);
    report.tables = tables.length;
    report.rows_unchanged = rowsKept;
    report.sequences = withSeq.length;
    report.sequences_moved = moved.length;
    report.sequences_at_source_next = atSource.length;
    report.sequences_moved_backwards = backwards;
    report.sequences_at_or_below_max_id = collide;
    report.per_table = Object.fromEntries(withSeq.map((t) => [t, { before: before[t].next, after: after[t].next, source: sourceNext.get(t), max_id: after[t].max_id }]));
    console.log(`rows: ${rowsKept} of ${tables.length} tables hold exactly what they held — the TRUNCATE and every insert were rolled back`);
    console.log(`sequences: ${moved.length} of ${withSeq.length} moved by the failed run (0 is the fix: ALTER SEQUENCE … RESTART rolls back; the setval() it replaced did not); ${atSource.length} stand at the source's AUTO_INCREMENT, as they did before it`);
    console.log(`moved backwards: ${backwards.length} (${backwards.join(', ') || 'none'}); now at or below their table's highest id, so the next insert would collide: ${collide.length} (${collide.join(', ') || 'none'})`);
    report.ok = run.status === 1 && rowsKept === tables.length && moved.length === 0;
    console.log(report.ok ? 'SEQUENCE ROLLBACK OK: the rows AND every sequence rolled back (P3-C-R2 C2)' : 'SEQUENCE ROLLBACK: unexpected outcome — see the report');
  } finally {
    try {
      await c.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON portal.auth_security_state`);
      await c.query(`DROP FUNCTION IF EXISTS ${FN}()`);
      const left = (await c.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = $1", [TRIGGER])).rows[0].n;
      report.trigger_removed = left === 0;
      console.log(`the planted trigger is removed: ${left === 0}`);
    } finally {
      await c.end();
    }
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const reportPath = path.join(P.REHEARSAL_DIR, `seqrollback_${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`report: ${reportPath}`);
  }
  if (!report.ok || !report.trigger_removed) process.exitCode = 1;
}

main().catch((e) => {
  console.error('sequence-rollback failed:', safeMessage(e));
  process.exit(1);
});
