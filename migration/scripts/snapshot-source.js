#!/usr/bin/env node
// A fresh, uniquely named, verified snapshot of the source database — OUTSIDE
// server/backups (the application's Backups page never sees it) and outside
// every git tree, in <DATA_DIR>/snapshots.
//
//   node scripts/snapshot-source.js                 dump + verify + manifest
//   node scripts/snapshot-source.js --restore-check  …and load it into an
//        isolated MySQL database parents_portal_migsrc_<stamp>, compare every
//        table's row count and AUTO_INCREMENT with the live database
//   --drop-scratch   drop that scratch database at the end
//
// mysqldump options (MySQL 8.0.43 client against 8.0.43 server, InnoDB):
//   --single-transaction  consistent InnoDB snapshot, no table locks
//   --quick --hex-blob    streaming, binary-safe
//   --routines --triggers --events  none exist; included so their absence is
//                         in the file, not an assumption
//   --no-create-db, no --databases  the file carries no CREATE DATABASE / USE,
//                         so a restore goes where the CLIENT says, never
//                         implicitly to parents_portal
//   --tz-utc (default, made explicit)  TIMESTAMP values are written in UTC
//                         with SET TIME_ZONE='+00:00' at the top
//   --set-gtid-purged=OFF  no GTID preamble
//   --default-character-set=utf8mb4
// The password reaches mysqldump / mysql through MYSQL_PWD in the child's
// environment only, never on the command line (the same rule routes/backups.js
// follows). Nothing from .env is printed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { readOnly, scratch, admin, dropScratch, sourceConfig } = require('../lib/mysql');
const P = require('../lib/paths');

function stampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function run(bin, args, env, outPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, windowsHide: true });
    const out = outPath ? fs.createWriteStream(outPath) : null;
    let stderr = '';
    let stdout = '';
    if (out) child.stdout.pipe(out);
    else child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      const finish = () => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.trim().split('\n')[0]}`)));
      if (out) out.close(finish);
      else finish();
    });
  });
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

async function tableFacts(conn, db) {
  const [tables] = await conn.query(
    'SELECT TABLE_NAME t, AUTO_INCREMENT ai, ENGINE e, TABLE_COLLATION c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME', [db]
  );
  const facts = {};
  for (const t of tables) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) n FROM \`${t.t}\``);
    const [[{ cs }]] = await conn.query(`CHECKSUM TABLE \`${t.t}\``).then(([r]) => [[{ cs: r[0].Checksum }]]);
    facts[t.t] = { rows: n, auto_increment: t.ai === null ? null : Number(t.ai), engine: t.e, collation: t.c, checksum: cs };
  }
  return facts;
}

async function main() {
  const cfg = sourceConfig();
  const restoreCheck = process.argv.includes('--restore-check');
  const dropAfter = process.argv.includes('--drop-scratch');
  const stamp = stampNow();
  fs.mkdirSync(P.SNAPSHOT_DIR, { recursive: true });
  fs.mkdirSync(P.MANIFEST_DIR, { recursive: true });
  const dumpPath = path.join(P.SNAPSHOT_DIR, `source_${cfg.database}_${stamp}.sql`);
  const manifestPath = path.join(P.MANIFEST_DIR, `snapshot_${stamp}.json`);
  const env = { ...process.env, MYSQL_PWD: cfg.password };
  const common = ['-h', cfg.host, '-P', String(cfg.port), '-u', cfg.user];
  const mysqlBin = cfg.mysqldumpPath.replace(/mysqldump(\.exe)?$/i, 'mysql$1');

  const versions = {
    mysqldump: spawnSync(cfg.mysqldumpPath, ['--version'], { encoding: 'utf8', env }).stdout.trim(),
    mysql_client: spawnSync(mysqlBin, ['--version'], { encoding: 'utf8', env }).stdout.trim(),
  };

  const live = await readOnly();
  const [[server]] = await live.query(
    'SELECT VERSION() v, @@sql_mode sql_mode, @@system_time_zone stz, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) offset_min, @@character_set_database cs, @@collation_database coll, @@transaction_isolation iso, @@auto_increment_increment aii, @@auto_increment_offset aio, @@explicit_defaults_for_timestamp edt'
  );
  // Facts BEFORE the dump, from a consistent snapshot, so the comparison is
  // against what the dump saw (the application may be in use).
  await live.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const before = await tableFacts(live, cfg.database);

  const args = [
    '--single-transaction', '--quick', '--hex-blob', '--routines', '--triggers', '--events',
    '--no-create-db', '--tz-utc', '--set-gtid-purged=OFF', '--default-character-set=utf8mb4',
    '--complete-insert', ...common, cfg.database,
  ];
  console.log(`dumping ${cfg.database} -> ${dumpPath}`);
  await run(cfg.mysqldumpPath, args, env, dumpPath);
  await live.query('ROLLBACK');
  await live.end();

  const stat = fs.statSync(dumpPath);
  const text = fs.readFileSync(dumpPath, 'utf8');
  const footer = /-- Dump completed on [0-9: -]+\s*$/.test(text.slice(-200));
  const createTables = (text.match(/^CREATE TABLE `/gm) || []).length;
  const insertTables = new Set((text.match(/^INSERT INTO `([^`]+)`/gm) || []).map((l) => l.replace(/^INSERT INTO `([^`]+)`.*/, '$1')));
  const hasCreateDb = /^CREATE DATABASE/m.test(text);
  const hasUse = /^USE `/m.test(text);
  const tzLine = /SET TIME_ZONE='\+00:00'/.test(text);
  const manifest = {
    snapshot: { file: dumpPath, bytes: stat.size, sha256: sha256(dumpPath), created_at: new Date().toISOString(), stamp },
    verification: { footer_present: footer, create_table_statements: createTables, tables_with_rows: insertTables.size, carries_create_database: hasCreateDb, carries_use: hasUse, utc_time_zone_preamble: tzLine },
    tool_versions: versions,
    mysqldump_options: args.filter((a) => !['-h', '-P', '-u'].includes(a) && a !== cfg.host && a !== String(cfg.port) && a !== cfg.user),
    source_server: { ...server, source_tz_assumption: 'TIMESTAMP columns are stored as UTC instants and rendered in the session zone; SYSTEM = UTC+8 on this host; the dump renders them in UTC (--tz-utc)' },
    tables_at_dump_time: before,
    restore_check: null,
  };
  if (!footer) throw new Error('dump has no "-- Dump completed on" footer — not a complete dump');
  if (createTables !== Object.keys(before).length) throw new Error(`dump has ${createTables} CREATE TABLE statements, source has ${Object.keys(before).length} tables`);
  console.log(`dump ok: ${stat.size} bytes, ${createTables} tables, footer present, sha256 ${manifest.snapshot.sha256.slice(0, 16)}…`);

  if (restoreCheck) {
    const scratchDb = `parents_portal_migsrc_${stamp}`;
    const adm = await admin();
    await adm.query(`CREATE DATABASE \`${scratchDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`restoring into isolated database ${scratchDb}`);
    // `source` is a mysql client command; the file is read by the client, no
    // shell, no redirect.
    await run(mysqlBin, [...common, `--database=${scratchDb}`, '--default-character-set=utf8mb4', `--execute=source ${dumpPath.replace(/\\/g, '/')}`], env, null);
    const sc = await scratch(scratchDb);
    const after = await tableFacts(sc, scratchDb);
    await sc.end();
    const diffs = [];
    for (const [t, b] of Object.entries(before)) {
      const a = after[t];
      if (!a) { diffs.push({ table: t, problem: 'missing after restore' }); continue; }
      if (a.rows !== b.rows) diffs.push({ table: t, problem: 'row count', before: b.rows, after: a.rows });
      if (a.auto_increment !== b.auto_increment) diffs.push({ table: t, problem: 'auto_increment', before: b.auto_increment, after: a.auto_increment });
      if (a.checksum !== b.checksum) diffs.push({ table: t, problem: 'checksum', before: b.checksum, after: a.checksum });
    }
    manifest.restore_check = { scratch_database: scratchDb, tables_after_restore: after, differences: diffs, ok: diffs.length === 0, dropped: false };
    console.log(diffs.length === 0 ? `restore check OK: ${Object.keys(after).length} tables, every count, AUTO_INCREMENT and CHECKSUM TABLE match` : `restore check DIFFERENCES: ${JSON.stringify(diffs)}`);
    if (dropAfter) {
      await dropScratch(adm, scratchDb);
      manifest.restore_check.dropped = true;
      console.log(`dropped ${scratchDb}`);
    }
    await adm.end();
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${manifestPath}`);
}

main().catch((e) => { console.error('snapshot failed:', require('../lib/safeMessage').safeMessage(e)); process.exit(1); });
