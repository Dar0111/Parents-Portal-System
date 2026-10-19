#!/usr/bin/env node
// Applies schema/001_portal_schema.sql to the target in ONE transaction and
// reports what the catalog now holds. Refuses a target that already has the
// `portal` schema; `--drop-first` (LOCAL target only) drops it for a re-run.
//
//   node scripts/apply-schema.js [--target local|staging] [--drop-first]
const fs = require('fs');
const path = require('path');
const { targetConfig } = require('../lib/env');
const { pool } = require('../lib/pg');
const P = require('../lib/paths');

async function main() {
  const target = targetConfig();
  const dropFirst = process.argv.includes('--drop-first');
  if (dropFirst && target.name !== 'local') throw new Error('--drop-first is allowed on the local target only.');
  const sql = fs.readFileSync(path.join(P.SCHEMA_DIR, '001_portal_schema.sql'), 'utf8');

  const p = pool(target.pg);
  const client = await p.connect();
  try {
    const v = (await client.query('SHOW server_version')).rows[0].server_version;
    const exists = (await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'portal'")).rowCount > 0;
    if (exists && !dropFirst) throw new Error(`target ${target.name} already has schema portal — refusing (local re-run: --drop-first).`);

    await client.query('BEGIN');
    if (exists) await client.query('DROP SCHEMA portal CASCADE');
    await client.query(sql);
    await client.query('COMMIT');

    const q = async (s) => (await client.query(s)).rows;
    const [counts] = await q(`SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal') AS tables,
      (SELECT count(*) FROM pg_indexes WHERE schemaname = 'portal') AS indexes,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'f') AS fks,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'u') AS uniques,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'c') AS checks,
      (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'portal' AND c.contype = 'p') AS pks,
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'portal' AND t.typtype = 'e') AS enums,
      (SELECT count(*) FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'portal' AND NOT t.tgisinternal) AS triggers,
      (SELECT count(*) FROM pg_sequences WHERE schemaname = 'portal') AS sequences`);
    const [coll] = await q(`SELECT c.collprovider AS provider, c.collisdeterministic AS deterministic, obj_description(c.oid, 'pg_collation') AS comment
      FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'portal' AND c.collname = 'ci'`);
    const [db] = await q('SELECT current_database() AS db, pg_encoding_to_char(encoding) AS enc, datcollate, datctype, datlocprovider FROM pg_database WHERE datname = current_database()');

    console.log(`APPLIED schema portal on ${target.name} (PostgreSQL ${v}) database=${db.db} encoding=${db.enc} collate=${db.datcollate} ctype=${db.datctype} provider=${db.datlocprovider}`);
    console.log(`COUNTS ${JSON.stringify(counts)}`);
    console.log(`COLLATION portal.ci provider=${coll.provider} deterministic=${coll.deterministic} :: ${coll.comment}`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* nothing to roll back */ }
    throw error;
  } finally {
    client.release();
    await p.end();
  }
}

main().catch((e) => { console.error('apply-schema failed:', require('../lib/safeMessage').safeMessage(e)); process.exit(1); });
