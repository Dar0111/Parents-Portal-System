#!/usr/bin/env node
// THE RECONSTRUCTION PROCEDURE for a Backup & Restore archive (Phase 3,
// commit 6 — docs/04 §2c): what to do with a `.zip` the admin page wrote when
// there is no running API to restore it through, or when an archive must be
// made from a database the page did not write (the MySQL-era recovery path,
// docs/04 §2b step 3). Three commands, all on the EMBEDDED LOCAL CLUSTER only
// (loopback, its own port): this script never opens a secrets file and has no
// staging target.
//
//   node scripts/reconstruct-archive.js verify <archive.zip>
//       Every check the restore makes on the FILE (lib: server/utils/
//       backupArchive.js inspectArchive): a complete manifest, every member
//       against its checksum, its records and its header. Prints counts only.
//
//   node scripts/reconstruct-archive.js load <archive.zip> --database <name>
//       Rebuilds a database from the archive: creates <name> if it does not
//       exist and refuses one that already holds a `portal` schema (a
//       reconstruction never lands on data), applies schema/001 and 003 in one
//       transaction, then restores the archive with the API's own code in a
//       second — the fingerprint must equal the fresh schema's, every member is
//       copied in, the sequences are set from the archive (never below a
//       restored id), the four retired learner fields stay empty, and a session
//       cutoff is written, so no token minted before the reconstruction works
//       on it. Prints, per table, the rows the archive holds and the rows the
//       database now holds.
//
//   node scripts/reconstruct-archive.js write --database <name> --out <file.zip>
//       Writes an archive of <name>'s portal schema, read in one snapshot —
//       e.g. a scratch database filled by scripts/transfer.js from a MySQL-era
//       dump, so the admin page can restore it after the owner registers the
//       file by hand (a manual_backup_adoption-style row, never a page button).
//       <file.zip> must not exist; the archive holds every learner's records.
//
// A database name is a plain identifier (^[a-z_][a-z0-9_]{0,62}$), never a
// connection string. Nothing here prints a row.
const fs = require('fs');
const path = require('path');
const { localConfig } = require('../lib/env');
const { client: connect } = require('../lib/pg');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');
const archive = require('../../server/utils/backupArchive');

const DB_NAME_RULE = /^[a-z_][a-z0-9_]{0,62}$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function databaseArg() {
  const name = arg('--database');
  if (!name || !DB_NAME_RULE.test(name)) throw new Error('--database <name> is required: a plain identifier, never a connection string.');
  return name;
}

function localFor(database) {
  const cfg = { ...localConfig(), database };
  if (cfg.host !== '127.0.0.1') throw new Error('The reconstruction runs on the embedded local cluster only.');
  return cfg;
}

async function withClient(database, fn) {
  const c = await connect(localFor(database));
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function verify(file) {
  const { manifest } = await archive.inspectArchive(file);
  const rows = manifest.tables.reduce((sum, t) => sum + t.rows, 0);
  console.log(`archive OK: format ${manifest.format} v${manifest.format_version}, PostgreSQL ${manifest.server_version}`);
  console.log(`  snapshot ${manifest.snapshot_at}, completed ${manifest.completed_at}`);
  console.log(`  ${manifest.tables.length} members, ${rows} rows, schema fingerprint ${manifest.schema_fingerprint.sha256.slice(0, 12)}`);
  console.log(`  excluded: ${manifest.excluded_tables.map((t) => t.name).join(', ')}`);
  return manifest;
}

async function load(file, database) {
  const manifest = await verify(file);

  // The database: created when missing, refused when it already holds data.
  const exists = await withClient('postgres', async (c) => (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount > 0);
  if (!exists) {
    await withClient('postgres', (c) => c.query(`CREATE DATABASE "${database}"`));
    console.log(`created database ${database}`);
  }
  await withClient(database, async (c) => {
    const taken = (await c.query("SELECT 1 FROM pg_namespace WHERE nspname = 'portal'")).rowCount > 0;
    if (taken) throw new Error(`${database} already has a portal schema; a reconstruction goes into an empty database.`);
    const role = (await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'portal_app'")).rowCount > 0;
    if (!role) throw new Error('The role portal_app does not exist on this cluster (scripts/apply-schema.js creates it).');

    const schemaSql = fs.readFileSync(path.join(P.SCHEMA_DIR, '001_portal_schema.sql'), 'utf8');
    const grantsSql = fs.readFileSync(path.join(P.SCHEMA_DIR, '003_grants_rls.sql'), 'utf8');
    await c.query('BEGIN');
    try {
      await c.query(schemaSql);
      await c.query(grantsSql);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK').catch(() => {});
      throw error;
    }
    console.log('applied 001_portal_schema.sql and 003_grants_rls.sql');

    const inspection = await archive.inspectArchive(file);
    const result = await archive.restoreArchive(c, file, inspection);
    console.log(
      `restored: ${result.members_loaded} members, ${result.rows_loaded} rows into ${result.tables_truncated} tables; ` +
        `learner fields cleared ${result.learner_fields_cleared}; cutoff written`
    );

    // auth_security_state holds one row afterwards whatever the archive held:
    // the cutoff this reconstruction writes.
    let mismatches = 0;
    for (const t of manifest.tables) {
      const { rows } = await c.query(`SELECT count(*)::bigint AS n FROM portal."${t.table}"`);
      const n = Number(rows[0].n);
      const expected = t.table === 'auth_security_state' ? 1 : t.rows;
      if (n !== expected) mismatches += 1;
      const note = t.table === 'auth_security_state' ? '  (the cutoff row)' : '';
      console.log(`  ${t.table.padEnd(24)} archive ${String(t.rows).padStart(6)}  database ${String(n).padStart(6)}${note}${n === expected ? '' : '  MISMATCH'}`);
    }
    for (const name of ['backups', 'auth_codes']) {
      const { rows } = await c.query(`SELECT count(*)::bigint AS n FROM portal."${name}"`);
      console.log(`  ${name.padEnd(24)} (not in an archive)  database ${String(Number(rows[0].n)).padStart(6)}`);
    }
    if (mismatches) throw new Error(`${mismatches} table(s) do not hold the archive's row count.`);
    console.log(`RECONSTRUCT OK: ${database} holds the archive's ${manifest.tables.length} tables`);
  });
}

async function write(database, out) {
  if (!out || !/\.zip$/.test(out)) throw new Error('--out <file.zip> is required.');
  if (fs.existsSync(out)) throw new Error('--out already exists; an archive is never overwritten.');
  const partial = `${out}.partial`;
  await withClient(database, (c) => archive.writeArchive(c, partial));
  await archive.inspectArchive(partial);
  fs.renameSync(partial, out);
  console.log(`wrote an archive of ${database} (${fs.statSync(out).size} bytes)`);
  await verify(out);
}

async function main() {
  const command = process.argv[2];
  if (command === 'verify') return verify(process.argv[3]);
  if (command === 'load') return load(process.argv[3], databaseArg());
  if (command === 'write') return write(databaseArg(), arg('--out'));
  console.error('usage: reconstruct-archive.js verify <archive.zip> | load <archive.zip> --database <name> | write --database <name> --out <file.zip>');
  process.exit(2);
  return undefined;
}

main().catch((e) => {
  console.error('reconstruct-archive failed:', e instanceof archive.ArchiveError ? e.message : safeMessage(e));
  process.exit(1);
});
