#!/usr/bin/env node
// P3-C-R2 C1's REGRESSION EVIDENCE — MySQL's cached AUTO_INCREMENT. On a
// DISPOSABLE MySQL database this script creates (parents_portal_migtest_*,
// dropped at the end and asserted gone — lib/mysql.js refuses any other name),
// five tables are put in the states a transfer must read right: a normal
// table; rows inserted AFTER the statistics were cached; rows deleted after an
// insert (the next id stays above the highest id); an empty table whose
// counter was moved up; and all of them read in ONE query, as transfer.js
// reads them. Each is read on a session at MySQL's default
// information_schema_stats_expiry (the old behaviour) and on a session from
// lib/mysql.js's scratch() (the fix: 0, read back). The transfer's guard — an
// AUTO_INCREMENT not above the highest id is a refusal — is applied to both.
//   node scripts/autoinc-fresh.js
const fs = require('fs');
const path = require('path');
const { admin, scratch, dropScratch } = require('../lib/mysql');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const TABLES = ['t_normal', 't_recent_insert', 't_recent_delete', 't_empty_advanced'];

async function main() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const db = `parents_portal_migtest_autoinc_${stamp.replace('T', '_')}`;
  const a = await admin();
  const report = { database: db, cases: [], failures: 0 };
  let failures = 0;
  try {
    await a.query(`CREATE DATABASE \`${db}\``);
    const w = await scratch(db); // the writer (its own session; expiry 0 is irrelevant to writes)
    const stale = await scratch(db);
    await stale.query('SET SESSION information_schema_stats_expiry = DEFAULT');
    const [[st]] = await stale.query('SELECT @@SESSION.information_schema_stats_expiry AS e');
    const fresh = await scratch(db);
    const [[fr]] = await fresh.query('SELECT @@SESSION.information_schema_stats_expiry AS e');
    report.expiry = { stale_session: Number(st.e), fresh_session: Number(fr.e) };
    console.log(`sessions: the old default expiry ${Number(st.e)} s, the fix ${Number(fr.e)} s`);
    try {
      for (const t of TABLES) await w.query(`CREATE TABLE ${t} (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, v INT NOT NULL) ENGINE=InnoDB`);
      const ins = (t, n) => w.query(`INSERT INTO ${t} (v) VALUES ${Array.from({ length: n }, () => '(1)').join(', ')}`);
      // the cache is filled by a read through the STALE session right after ANALYZE
      const cache = async (t) => {
        await w.query(`ANALYZE TABLE ${t}`);
        await stale.query('SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t]);
      };
      await ins('t_normal', 5);
      await cache('t_normal');
      await ins('t_recent_insert', 3);
      await cache('t_recent_insert');
      await ins('t_recent_insert', 4); // after the cache: 7 rows, next id 8
      await ins('t_recent_delete', 10);
      await cache('t_recent_delete');
      await w.query('DELETE FROM t_recent_delete WHERE id > 5'); // highest id 5, next id still 11
      await cache('t_empty_advanced');
      await w.query('ALTER TABLE t_empty_advanced AUTO_INCREMENT = 500');

      const expected = { t_normal: 6, t_recent_insert: 8, t_recent_delete: 11, t_empty_advanced: 500 };
      const readAll = async (c) => {
        const [rows] = await c.query('SELECT TABLE_NAME t, AUTO_INCREMENT ai FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
        return Object.fromEntries(rows.map((r) => [r.t, r.ai === null ? null : Number(r.ai)]));
      };
      const vStale = await readAll(stale);
      const vFresh = await readAll(fresh);
      for (const t of TABLES) {
        const [[m]] = await w.query(`SELECT MAX(id) AS m FROM ${t}`);
        const maxId = m.m === null ? null : Number(m.m);
        const guard = (ai) => (ai === null ? 'refuses (no AUTO_INCREMENT)' : maxId !== null && ai <= maxId ? 'refuses (not above the highest id)' : 'passes');
        const c = { table: t, max_id: maxId, expected_next: expected[t], stale_read: vStale[t], fresh_read: vFresh[t], guard_on_stale: guard(vStale[t]), guard_on_fresh: guard(vFresh[t]) };
        c.ok = c.fresh_read === c.expected_next && c.guard_on_fresh === 'passes';
        if (!c.ok) failures += 1;
        report.cases.push(c);
        console.log(`${c.ok ? 'PASS' : 'FAIL'} ${t.padEnd(17)} highest id ${String(maxId).padEnd(4)} expected next ${String(c.expected_next).padEnd(4)} — old session ${String(c.stale_read).padEnd(4)} (guard ${c.guard_on_stale}); fixed session ${String(c.fresh_read).padEnd(4)} (guard ${c.guard_on_fresh})`);
      }
      report.stale_reproduced = TABLES.some((t) => vStale[t] !== expected[t]);
      console.log(`the stale cache ${report.stale_reproduced ? 'WAS reproduced on the old session' : 'was not reproduced on this server (every old-session read was current)'}`);
    } finally {
      await w.end();
      await stale.end();
      await fresh.end();
    }
  } finally {
    try {
      await dropScratch(a, db);
      const [left] = await a.query('SHOW DATABASES LIKE ?', [db]);
      report.dropped = left.length === 0;
      console.log(`the disposable database dropped: ${report.dropped}`);
      if (!report.dropped) failures += 1;
    } finally {
      await a.end();
    }
  }
  report.failures = failures;
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const out = path.join(P.REHEARSAL_DIR, `autoinc_fresh_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`${failures ? `AUTOINC FRESH: ${failures} failure(s)` : 'AUTOINC FRESH OK'} — report: ${out}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error('autoinc-fresh failed:', safeMessage(e));
  process.exit(1);
});
