#!/usr/bin/env node
// REVIEW FINDING backup-1 (P3-C-R2 Phase H) — an archive made while a restore
// holds its locks.
//
// A restore-shaped transaction on the OWNER connection takes ACCESS EXCLUSIVE
// on portal.activity_logs (the archive's first table, alphabetically),
// TRUNCATEs it and puts the very same rows back (their own ids), and holds
// that open. Meanwhile server/utils/backupArchive.js writeArchive() runs on
// the API's role. The proof checks that the archive WAITED (its backend shows
// an ungranted lock), then commits the restore-shaped transaction and checks
// the archive: it must hold every activity_logs row and pass inspectArchive.
// The data ends as it began (the same rows, the same ids).
//
// --mutant no-lock loads backupArchive.js IN MEMORY without its LOCK TABLE
// statement (the file on disk is never written: sha256 before and after) —
// the code before the fix. It must FAIL: the snapshot is fixed before the
// table is touched, TRUNCATE is not MVCC-safe, and the archive comes out with
// 0 activity_logs rows while still passing inspectArchive.
//
// The disposable local cluster only; run under the session's runner (the
// PG_* keys) with PG_DATABASE naming a disposable database:
//   node scripts/backup-during-restore.js [--mutant no-lock]
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const SERVER = path.join(__dirname, '..', '..', 'server');
const ARCHIVE_FILE = path.join(SERVER, 'utils', 'backupArchive.js');
const { Client } = require(path.join(SERVER, 'node_modules', 'pg'));
const db = require(path.join(SERVER, 'config', 'db.js'));

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const sha = () => crypto.createHash('sha256').update(fs.readFileSync(ARCHIVE_FILE)).digest('hex').slice(0, 16);

function loadArchive(mutant) {
  if (!mutant) return require(ARCHIVE_FILE);
  const src = fs.readFileSync(ARCHIVE_FILE, 'utf8');
  const re = / {4}await client\.query\(`LOCK TABLE \$\{lockedNames[^\n]*IN ACCESS SHARE MODE`\);\r?\n/;
  if (!re.test(src)) throw new Error('mutant anchor not found — refusing to run');
  const m = new Module(ARCHIVE_FILE, module);
  m.filename = ARCHIVE_FILE;
  m.paths = Module._nodeModulePaths(path.dirname(ARCHIVE_FILE));
  m._compile(src.replace(re, ''), ARCHIVE_FILE);
  return m.exports;
}

async function main() {
  const mutant = process.argv.includes('--mutant') ? process.argv[process.argv.indexOf('--mutant') + 1] : null;
  if (mutant && mutant !== 'no-lock') throw new Error('--mutant must be no-lock');
  const runtime = db.settings('runtime');
  const owner = db.settings('migrate');
  if (!LOOPBACK.has(runtime.host) || !LOOPBACK.has(owner.host)) throw new Error('loopback PostgreSQL only');
  if (runtime.database === 'parents_portal_pg') throw new Error('name a disposable database (PG_DATABASE), not the transfer target');
  const before = sha();
  const archive = loadArchive(mutant);
  if (mutant) console.log('MUTANT no-lock: the archive without its LOCK TABLE (in memory) — this run must FAIL');

  const o = new Client(owner);
  const r = new Client(runtime);
  await o.connect();
  await r.connect();
  const out = path.join(os.tmpdir(), `backup-during-restore-${process.pid}-${Date.now()}.zip.partial`);
  const problems = [];
  try {
    const n = Number((await o.query('SELECT count(*) AS n FROM portal.activity_logs')).rows[0].n);
    const idsBefore = (await o.query('SELECT coalesce(sum(id), 0)::text AS s, coalesce(max(id), 0)::text AS m FROM portal.activity_logs')).rows[0];
    const rPid = (await r.query('SELECT pg_backend_pid() AS p')).rows[0].p;

    await o.query('BEGIN');
    await o.query('LOCK TABLE portal.activity_logs IN ACCESS EXCLUSIVE MODE');
    await o.query('CREATE TEMPORARY TABLE keep_rows ON COMMIT DROP AS SELECT * FROM portal.activity_logs');
    await o.query('TRUNCATE TABLE portal.activity_logs');
    await o.query('INSERT INTO portal.activity_logs SELECT * FROM pg_temp.keep_rows');

    const writing = archive.writeArchive(r, out).then(
      (manifest) => ({ manifest }),
      (error) => ({ error })
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const waiting = Number((await o.query('SELECT count(*) AS n FROM pg_catalog.pg_locks WHERE pid = $1 AND NOT granted', [rPid])).rows[0].n);
    await o.query('COMMIT');
    const done = await writing;
    if (done.error) {
      problems.push(`the archive failed (${done.error.code || done.error.message})`);
    } else {
      const member = done.manifest.tables.find((t) => t.table === 'activity_logs');
      let inspected = 'passed';
      try {
        await archive.inspectArchive(out);
      } catch (e) {
        inspected = `refused (${e.code || e.message})`;
      }
      console.log(`activity_logs: ${n} rows in the table; the archive holds ${member.rows}; inspectArchive ${inspected}; the archive waited on a lock: ${waiting > 0}`);
      if (member.rows !== n) problems.push(`the archive holds ${member.rows} activity_logs rows for ${n} in the table`);
      if (inspected !== 'passed') problems.push('inspectArchive refused the archive');
      if (!(waiting > 0)) problems.push('the archive did not wait for the restore-shaped transaction');
    }
    const idsAfter = (await o.query('SELECT coalesce(sum(id), 0)::text AS s, coalesce(max(id), 0)::text AS m FROM portal.activity_logs')).rows[0];
    const nAfter = Number((await o.query('SELECT count(*) AS n FROM portal.activity_logs')).rows[0].n);
    const unchanged = nAfter === n && idsAfter.s === idsBefore.s && idsAfter.m === idsBefore.m;
    console.log(`the table is as it began (count, id sum, highest id): ${unchanged}`);
    if (!unchanged) problems.push('activity_logs changed');
  } finally {
    await o.end().catch(() => {});
    await r.end().catch(() => {});
    for (const p of [out, out.replace(/\.partial$/, '')]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const after = sha();
  console.log(`backupArchive.js on disk: sha ${before} -> ${after} ${before === after ? 'unchanged' : 'CHANGED'}`);
  console.log(problems.length ? `BACKUP DURING RESTORE: ${problems.join('; ')}` : 'BACKUP DURING RESTORE OK');
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
  console.error('backup-during-restore failed:', e.code || e.message);
  process.exit(1);
});
