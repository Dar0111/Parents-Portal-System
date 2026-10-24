#!/usr/bin/env node
// Applies schema/001_portal_schema.sql and schema/003_grants_rls.sql to the
// target in ONE transaction and reports what the catalog now holds. Refuses a
// target that already has the `portal` schema; `--drop-first` (the disposable
// LOCAL cluster only) drops it for a re-run.
//
//   node scripts/apply-schema.js [--target local|staging] [--drop-first]
//
// THE GUARD, FLAG FIRST (D-65): the flag is refused by the target NAME before
// any secret file is opened, so the refusal is testable with no supabase.env
// at all; then, once the target is resolved, it must be the embedded cluster
// on the loopback address, its own port and database (lib/env.js
// isDisposableLocal) — a target that merely calls itself local is not enough.
// Before a drop, the schema's table count and approximate row count are
// printed so the discard is visible, never silent.
//
// On the local target the roles 003 names (portal_app and the three Data API
// roles) are created NOLOGIN/LOGIN-without-password if absent, so 003 and
// scripts/rls-check.js run the same here as on Supabase, where 002 made them.
const fs = require('fs');
const path = require('path');
const { targetName, targetConfig, isDisposableLocal } = require('../lib/env');
const { pool } = require('../lib/pg');
const P = require('../lib/paths');

const LOCAL_ROLES_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    CREATE ROLE portal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;`;

async function main() {
  const dropFirst = process.argv.includes('--drop-first');
  const name = targetName();
  if (dropFirst && name !== 'local') {
    throw new Error(`--drop-first is allowed on the local target only (refused for ${name} before any secret was read).`);
  }
  const target = targetConfig();
  if (dropFirst && !isDisposableLocal(target)) {
    throw new Error('--drop-first refused: the target is not the disposable local cluster (127.0.0.1, the embedded port and database, no TLS).');
  }
  console.log(`target ${target.name}: tls ${target.tlsMode}`);
  const schemaSql = fs.readFileSync(path.join(P.SCHEMA_DIR, '001_portal_schema.sql'), 'utf8');
  const grantsSql = fs.readFileSync(path.join(P.SCHEMA_DIR, '003_grants_rls.sql'), 'utf8');

  const p = pool(target.pg);
  const client = await p.connect();
  try {
    const v = (await client.query('SHOW server_version')).rows[0].server_version;
    const exists = (await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'portal'")).rowCount > 0;
    if (exists && !dropFirst) throw new Error(`target ${target.name} already has schema portal — refusing (local re-run: --drop-first).`);
    if (exists) {
      const [before] = (await client.query(`SELECT count(*)::int AS tables, coalesce(sum(n_live_tup), 0)::bigint AS approx_rows
        FROM pg_stat_user_tables WHERE schemaname = 'portal'`)).rows;
      console.log(`DROPPING schema portal on ${target.name}: ${before.tables} tables, about ${before.approx_rows} rows (the disposable local cluster)`);
    }

    await client.query('BEGIN');
    if (exists) await client.query('DROP SCHEMA portal CASCADE');
    await client.query(schemaSql);
    if (target.name === 'local') {
      await client.query(LOCAL_ROLES_SQL);
      console.log('local roles present: portal_app, anon, authenticated, service_role (created here if absent; Supabase has them from 002)');
    }
    await client.query(grantsSql);
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
    const [policies] = await q(`SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND rowsecurity) AS rls_on,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'portal' AND c.relkind = 'r' AND c.relforcerowsecurity) AS forced,
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'portal') AS policies,
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'portal' AND policyname = 'portal_app_all' AND roles = ARRAY['portal_app']::name[] AND cmd = 'ALL' AND permissive = 'PERMISSIVE') AS portal_app_all,
      has_schema_privilege('portal_app', 'portal', 'USAGE') AS app_schema_usage,
      has_schema_privilege('portal_app', 'portal', 'CREATE') AS app_schema_create,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('portal_app', format('%I.%I', schemaname, tablename), 'SELECT, INSERT, UPDATE, DELETE')) AS app_dml_tables,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('portal_app', format('%I.%I', schemaname, tablename), 'TRUNCATE')) AS app_truncate_tables,
      (SELECT count(*) FROM pg_sequences WHERE schemaname = 'portal' AND has_sequence_privilege('portal_app', format('%I.%I', schemaname, sequencename), 'USAGE')) AS app_usage_sequences,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN has_schema_privilege('anon', 'portal', 'USAGE') END AS anon_schema_usage,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN has_schema_privilege('authenticated', 'portal', 'USAGE') END AS authenticated_schema_usage,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN has_schema_privilege('service_role', 'portal', 'USAGE') END AS service_role_schema_usage,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'SELECT')) END AS anon_select_tables,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('service_role', format('%I.%I', schemaname, tablename), 'SELECT')) END AS service_role_select_tables`);
    const [coll] = await q(`SELECT c.collprovider AS provider, c.collisdeterministic AS deterministic, obj_description(c.oid, 'pg_collation') AS comment
      FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'portal' AND c.collname = 'ci'`);
    const [db] = await q('SELECT current_database() AS db, pg_encoding_to_char(encoding) AS enc, datcollate, datctype, datlocprovider FROM pg_database WHERE datname = current_database()');

    console.log(`APPLIED schema portal on ${target.name} (PostgreSQL ${v}) database=${db.db} encoding=${db.enc} collate=${db.datcollate} ctype=${db.datctype} provider=${db.datlocprovider}`);
    console.log(`COUNTS ${JSON.stringify(counts)}`);
    console.log(`POLICIES ${JSON.stringify(policies)}`);
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
