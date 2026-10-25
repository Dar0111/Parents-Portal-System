#!/usr/bin/env node
// P3-C-R2 C2's REGRESSION EVIDENCE — a failed transfer leaves the target
// exactly as it was, sequences included, and a retry makes it READY. Every
// case runs the REAL scripts/transfer.js (and reconcile.js) as a child process
// against the disposable local target, from a parents_portal_migsrc_* scratch,
// and every before/after state is read on a connection of this script's own:
// per table the row count, per identity sequence its next value and the
// table's highest id (numbers only).
//
//   1–6  a failure at each MIGRATION_FAILPOINT — before the load, midway,
//        immediately before the first sequence change, after the last one,
//        a deferred foreign key broken so the COMMIT's constraint check fails,
//        and a deferred trigger that raises at COMMIT: exit 1, `ready` false,
//        rows AND sequences exactly as before, then (7) a retry: READY and
//        RECONCILE OK
//   8    sequences set BELOW their tables' highest ids first: reconcile
//        refuses that target; a failed transfer leaves them as they were
//        (it neither hides nor worsens them); a retry repairs them
//   9    sequences set far AHEAD first: a failed transfer leaves them; a
//        retry puts them back at the source's AUTO_INCREMENT
//   10   an OLDER source snapshot (lower AUTO_INCREMENT values): READY and
//        RECONCILE OK against it, then the newest again
//   11   a concurrent nextval() and INSERT while the transfer's own kind of
//        change (ALTER SEQUENCE … RESTART) is uncommitted: both wait; the
//        rollback leaves the sequence unchanged
// Each failure must come from its NAMED point (the report's error), or the
// case fails.
//
//   node scripts/transfer-failures.js --target local --source-db <parents_portal_migsrc_*>
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client } = require('../lib/pg');
const { admin } = require('../lib/mysql');
const { TABLES } = require('../lib/tables');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function state(cfg) {
  const c = await client(cfg);
  try {
    const rows = {};
    const seqs = {};
    for (const t of TABLES) {
      rows[t.name] = (await c.query(`SELECT count(*)::int AS n FROM portal.${t.name}`)).rows[0].n;
      if (t.sequence) {
        const seq = (await c.query(`SELECT pg_get_serial_sequence('portal.${t.name}', 'id') AS s`)).rows[0].s;
        const s = (await c.query(`SELECT last_value, is_called FROM ${seq}`)).rows[0];
        const max = (await c.query(`SELECT max(id) AS m FROM portal.${t.name}`)).rows[0].m;
        seqs[t.name] = { seq, next: Number(s.last_value) + (s.is_called ? 1 : 0), max_id: max === null ? null : Number(max) };
      }
    }
    return { rows, seqs };
  } finally {
    await c.end();
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const seqNexts = (s) => Object.fromEntries(Object.entries(s.seqs).map(([k, v]) => [k, v.next]));

function run(script, sourceDb, env = {}) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), '--target', 'local', '--source-db', sourceDb, ...(script === 'transfer.js' ? ['--truncate'] : [])], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const m = /report: (.+\.json)/.exec(text);
  let report = null;
  if (m && fs.existsSync(m[1].trim())) report = JSON.parse(fs.readFileSync(m[1].trim(), 'utf8'));
  return { status: r.status, report, saysReady: /^READY: /m.test(text), saysReconcileOk: /RECONCILE OK/.test(text), saysFailpoint: /FAILPOINT \w+/.test(text) };
}

async function setSequences(cfg, fn) {
  const c = await client(cfg);
  try {
    for (const t of TABLES.filter((x) => x.sequence)) {
      const seq = (await c.query(`SELECT pg_get_serial_sequence('portal.${t.name}', 'id') AS s`)).rows[0].s;
      const max = (await c.query(`SELECT coalesce(max(id), 0)::int AS m FROM portal.${t.name}`)).rows[0].m;
      const v = fn(t.name, max);
      if (v !== null) await c.query('SELECT setval($1, $2, true)', [seq, v]);
    }
  } finally {
    await c.end();
  }
}

async function main() {
  const target = targetConfig();
  if (!isDisposableLocal(target)) throw new Error('transfer-failures runs on the disposable local target only (--target local).');
  const sourceDb = arg('--source-db');
  if (!/^parents_portal_migsrc_[0-9_]+$/.test(sourceDb || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch.');
  const results = [];
  let failures = 0;
  const record = (name, ok, facts) => {
    if (!ok) failures += 1;
    results.push({ case: name, ok, ...facts });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${facts.note ? ` — ${facts.note}` : ''}`);
  };

  // A known-good start: transfer, READY, reconcile.
  const start = run('transfer.js', sourceDb);
  const startRec = run('reconcile.js', sourceDb);
  record('the starting transfer is READY and reconciles', start.status === 0 && start.report && start.report.ready === true && startRec.status === 0, { note: `exit ${start.status}, ready ${start.report && start.report.ready}, reconcile exit ${startRec.status}` });

  // THE CAUSE IS PART OF THE CASE: a run that fails anywhere else proves
  // nothing about the named point (the first version of this proof accepted
  // any failure, and an unrelated ALTER TABLE refusal hid behind it).
  const CAUSE = {
    before_load: /^FAILPOINT before_load\b/,
    mid_load: /^FAILPOINT mid_load\b/,
    before_sequences: /^FAILPOINT before_sequences\b/,
    after_sequences: /^FAILPOINT after_sequences\b/,
    deferred_fk: /violates foreign key constraint/,
    at_commit: /FAILPOINT at_commit\b/,
  };
  const failAndRetry = async (label, fp, prepare, expectAfter) => {
    if (prepare) await prepare();
    const before = await state(target.pg);
    const f = run('transfer.js', sourceDb, { MIGRATION_FAILPOINT: fp });
    const after = await state(target.pg);
    const rowsSame = same(before.rows, after.rows);
    const seqsSame = same(seqNexts(before), seqNexts(after));
    const rep = f.report || {};
    const cause = CAUSE[fp].test(String(rep.error || ''));
    const okFail = f.status === 1 && cause && rep.ok === false && rep.ready === false && rowsSame && seqsSame && rep.sequences_after_failure && rep.sequences_after_failure.unchanged === true;
    record(`${label}: the failed run (${fp}) changed nothing`, okFail, { exit: f.status, cause_is_the_failpoint: cause, ready: rep.ready, rows_unchanged: rowsSame, sequences_unchanged: seqsSame, transfer_saw_unchanged: rep.sequences_after_failure ? rep.sequences_after_failure.unchanged : null, note: `exit ${f.status}, failed at the named point ${cause}, rows unchanged ${rowsSame}, ${Object.keys(before.seqs).length} sequences unchanged ${seqsSame}, transfer's own check ${rep.sequences_after_failure ? rep.sequences_after_failure.unchanged : 'none'}` });
    if (expectAfter) await expectAfter(after);
    const r = run('transfer.js', sourceDb);
    const rec = run('reconcile.js', sourceDb);
    record(`${label}: the retry is READY and reconciles`, r.status === 0 && r.report && r.report.ready === true && rec.status === 0, { note: `exit ${r.status}, ready ${r.report && r.report.ready}, reconcile exit ${rec.status}` });
  };

  for (const fp of ['before_load', 'mid_load', 'before_sequences', 'after_sequences', 'deferred_fk', 'at_commit']) {
    await failAndRetry(`case ${['before_load', 'mid_load', 'before_sequences', 'after_sequences', 'deferred_fk', 'at_commit'].indexOf(fp) + 1}`, fp);
  }

  // 8. sequences BELOW the highest ids
  await failAndRetry('case 8 (sequences below the highest ids)', 'after_sequences',
    async () => {
      await setSequences(target.pg, (name, max) => (max > 1 ? 1 : null));
      const rec = run('reconcile.js', sourceDb);
      record('case 8: reconcile refuses a target whose sequences sit below its ids', rec.status === 1, { note: `reconcile exit ${rec.status}` });
    },
    async (after) => {
      const low = Object.values(after.seqs).filter((s) => s.max_id !== null && s.next <= s.max_id).length;
      record('case 8: after the failure the low sequences are still low (not hidden, not worsened)', low > 0, { note: `${low} sequence(s) still at or below their highest id` });
    });

  // 9. sequences far AHEAD
  await failAndRetry('case 9 (sequences already advanced)', 'at_commit',
    async () => setSequences(target.pg, (name, max) => max + 1000),
    async (after) => {
      const ahead = Object.values(after.seqs).filter((s) => s.max_id === null || s.next > s.max_id + 999).length;
      record('case 9: after the failure the advanced sequences are still advanced', ahead === Object.keys(after.seqs).length, { note: `${ahead} of ${Object.keys(after.seqs).length} still ahead` });
    });

  // 10. an OLDER source snapshot
  const a = await admin();
  let older = null;
  try {
    const [dbs] = await a.query("SHOW DATABASES LIKE 'parents\\_portal\\_migsrc\\_%'");
    const names = dbs.map((r) => Object.values(r)[0]).sort();
    older = names.filter((n) => n < sourceDb).pop() || null;
  } finally {
    await a.end();
  }
  if (!older) {
    record('case 10 (an older source snapshot)', false, { note: 'NOT RUN — no older parents_portal_migsrc_* scratch on this server' });
  } else {
    const o = run('transfer.js', older);
    const oRec = run('reconcile.js', older);
    const sOld = await state(target.pg);
    const back = run('transfer.js', sourceDb);
    const backRec = run('reconcile.js', sourceDb);
    const sNew = await state(target.pg);
    const lower = Object.keys(sOld.seqs).filter((k) => sOld.seqs[k].next < sNew.seqs[k].next).length;
    record('case 10: an older snapshot is READY and reconciles against itself, with lower sequences', o.status === 0 && o.report && o.report.ready && oRec.status === 0, { note: `exit ${o.status}, ready ${o.report && o.report.ready}, reconcile exit ${oRec.status}; ${lower} sequence(s) lower than the newest snapshot's` });
    record('case 10: the newest snapshot again is READY and reconciles', back.status === 0 && back.report && back.report.ready && backRec.status === 0, { note: `exit ${back.status}, reconcile exit ${backRec.status}` });
  }

  // 11. a concurrent nextval() and INSERT while the RESTART is uncommitted
  {
    const w = await client(target.pg);
    const r = await client(target.pg);
    try {
      const seq = (await w.query("SELECT pg_get_serial_sequence('portal.login_attempts', 'id') AS s")).rows[0].s;
      const before = (await w.query(`SELECT last_value, is_called FROM ${seq}`)).rows[0];
      await w.query('BEGIN');
      await w.query(`ALTER SEQUENCE ${seq} RESTART WITH 7000000`);
      await r.query("SET statement_timeout = '1500ms'");
      let nv = 'answered';
      try { await r.query('SELECT nextval($1)', [seq]); } catch (e) { nv = `waited (${e.code})`; }
      let ins = 'answered';
      try { await r.query("INSERT INTO portal.login_attempts (login_key, ip) VALUES (repeat('z', 64), NULL)"); } catch (e) { ins = `waited (${e.code})`; }
      await w.query('ROLLBACK');
      const afterS = (await w.query(`SELECT last_value, is_called FROM ${seq}`)).rows[0];
      const ok = nv.startsWith('waited (57014') && ins.startsWith('waited (57014') && same(before, afterS);
      record('case 11: a concurrent nextval() and INSERT wait on the uncommitted RESTART; the rollback leaves the sequence as it was', ok, { note: `nextval ${nv}, INSERT ${ins}, unchanged ${same(before, afterS)}` });
    } finally {
      try { await w.query('ROLLBACK'); } catch { /* none open */ }
      await w.end();
      await r.end();
    }
  }

  // The end state: READY and reconciled, as the next consumer expects it.
  const end = run('transfer.js', sourceDb);
  const endRec = run('reconcile.js', sourceDb);
  record('the final transfer is READY and reconciles', end.status === 0 && end.report && end.report.ready === true && endRec.status === 0, { note: `exit ${end.status}, reconcile exit ${endRec.status}` });

  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = path.join(P.REHEARSAL_DIR, `transfer_failures_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ source: 'parents_portal_migsrc_*', older_source_used: Boolean(older), results, failures }, null, 2));
  console.log(`${failures ? `TRANSFER FAILURES: ${failures} problem(s)` : 'TRANSFER FAILURES OK'} — report: ${out}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error('transfer-failures failed:', safeMessage(e));
  process.exit(1);
});
