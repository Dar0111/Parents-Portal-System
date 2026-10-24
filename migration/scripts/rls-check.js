#!/usr/bin/env node
// Proves 003_grants_rls.sql (D-83) on a target: the catalog on any target, the
// behaviour matrix on the disposable local cluster, where the connected role is
// the cluster's superuser and may SET ROLE to anyone.
//
//   node scripts/rls-check.js [--target local|staging]
//
// THE MATRIX (docs/06 §2a). Everything runs in ONE transaction that is ROLLED
// BACK: the throwaway roles, the grants, the ownership moves and every
// synthetic row disappear with it, and the last checks prove nothing stayed.
//   catalog     26 tables with RLS on, none FORCED, 26 policies named
//               portal_app_all FOR ALL TO portal_app; portal_app holds USAGE
//               and DML, never TRUNCATE or CREATE; anon, authenticated and
//               service_role hold nothing on the schema or any table
//   deny        anon, authenticated, service_role (BYPASSRLS, like Supabase's):
//               SELECT, INSERT, UPDATE and DELETE on every table are 42501 —
//               the privilege wall, before RLS is even consulted
//   rls alone   zz_probe is GRANTED SELECT and INSERT but has no policy: every
//               SELECT returns 0 rows (the populated tables included) and an
//               INSERT is 42501 "new row violates row-level security policy"
//   allow       portal_app: the same counts as the owner on every table; a
//               synthetic INSERT / UPDATE / DELETE succeed (with an explicit
//               id, so no sequence moves); TRUNCATE, ALTER TABLE, DROP TABLE
//               and CREATE TABLE in portal are 42501
//   owner       the 26 tables moved to zz_owner inside the transaction: the
//               owner reads every row and inserts WITHOUT a policy — the
//               no-FORCE rule the transfer and the restore rely on (Q2.1)
// Synthetic rows use ids far above the source's (2,147,000,000 +), inserted
// explicitly on the identity column, so no sequence advances and a reconcile
// after this script still prints every sequence equal to the source.
const fs = require('fs');
const path = require('path');
const { targetConfig } = require('../lib/env');
const { pool } = require('../lib/pg');
const { TABLES } = require('../lib/tables');
const { safeMessage } = require('../lib/safeMessage');
const P = require('../lib/paths');

const DATA_API_ROLES = ['anon', 'authenticated', 'service_role'];
const BIG_ID = 2147000000;
const report = { cases: {} };
let failures = 0;

function check(name, value, expect) {
  const ok = JSON.stringify(value) === JSON.stringify(expect);
  if (!ok) failures += 1;
  report.cases[name] = { value, expect, ok };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${ok ? '' : ` (expected ${JSON.stringify(expect)})`}`);
}
function info(name, value) {
  report.cases[name] = { value };
  console.log(`INFO ${name} = ${JSON.stringify(value)}`);
}

let sp = 0;
// Run `sql` as `role` inside its own savepoint and come back to the caller's
// role either way; returns 'ok' with the rowCount, or the SQLSTATE.
async function asRole(c, role, sql, params) {
  sp += 1;
  const name = `rls_sp_${sp}`;
  await c.query(`SAVEPOINT ${name}`);
  try {
    await c.query(`SET LOCAL ROLE ${role}`);
    const r = await c.query(sql, params);
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return { ok: true, rowCount: r.rowCount, rows: r.rows };
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return { ok: false, code: e.code, message: safeMessage(e) };
  }
}
// The same, but the statement's effect is KEPT (released savepoint) — for the
// synthetic writes whose follow-up reads must see them.
async function asRoleKeep(c, role, sql, params) {
  sp += 1;
  const name = `rls_sp_${sp}`;
  await c.query(`SAVEPOINT ${name}`);
  try {
    await c.query(`SET LOCAL ROLE ${role}`);
    const r = await c.query(sql, params);
    await c.query('RESET ROLE');
    await c.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, rowCount: r.rowCount, rows: r.rows };
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return { ok: false, code: e.code };
  }
}

async function main() {
  const target = targetConfig();
  console.log(`target ${target.name}: tls ${target.tlsMode}`);
  const p = pool(target.pg);
  const c = await p.connect();
  try {
    // --- catalog (any target) ------------------------------------------------
    const [cat] = (await c.query(`SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal') AS tables,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND rowsecurity) AS rls_on,
      (SELECT count(*) FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace WHERE n.nspname = 'portal' AND k.relkind = 'r' AND k.relforcerowsecurity) AS forced,
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'portal') AS policies,
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'portal' AND policyname = 'portal_app_all' AND roles = ARRAY['portal_app']::name[] AND cmd = 'ALL' AND permissive = 'PERMISSIVE') AS portal_app_all,
      (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'portal') AS tables_with_a_policy,
      has_schema_privilege('portal_app', 'portal', 'USAGE') AS app_usage,
      has_schema_privilege('portal_app', 'portal', 'CREATE') AS app_create,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('portal_app', format('%I.%I', schemaname, tablename), 'SELECT, INSERT, UPDATE, DELETE')) AS app_dml_tables,
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege('portal_app', format('%I.%I', schemaname, tablename), 'TRUNCATE')) AS app_truncate_tables,
      (SELECT count(*) FROM pg_sequences WHERE schemaname = 'portal' AND has_sequence_privilege('portal_app', format('%I.%I', schemaname, sequencename), 'USAGE')) AS app_sequences,
      (SELECT count(*) FROM pg_sequences WHERE schemaname = 'portal') AS sequences,
      has_function_privilege('portal_app', 'portal.now_s()', 'EXECUTE') AS app_now_s,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS i_am_superuser`)).rows;
    check('catalog.tables_rls_on_none_forced', [cat.tables, cat.rls_on, cat.forced], [TABLES.length, TABLES.length, 0]);
    check('catalog.one_portal_app_all_policy_per_table', [cat.policies, cat.portal_app_all, cat.tables_with_a_policy], [TABLES.length, TABLES.length, TABLES.length]);
    check('catalog.portal_app_usage_and_dml_never_truncate_or_create', [cat.app_usage, cat.app_create, cat.app_dml_tables, cat.app_truncate_tables], [true, false, TABLES.length, 0]);
    check('catalog.portal_app_sequences_and_now_s', [cat.app_sequences === cat.sequences, cat.app_now_s], [true, true]);
    const present = (await c.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1::name[]) ORDER BY rolname', [DATA_API_ROLES])).rows.map((r) => r.rolname);
    info('catalog.data_api_roles_present', present);
    for (const role of present) {
      const [priv] = (await c.query(`SELECT has_schema_privilege($1, 'portal', 'USAGE') AS usage,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND has_table_privilege($1, format('%I.%I', schemaname, tablename), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')) AS any_table_privilege,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = $1) AS bypassrls`, [role])).rows;
      check(`catalog.${role}_no_schema_usage_no_table_privilege`, [priv.usage, priv.any_table_privilege], [false, 0]);
      info(`catalog.${role}_bypassrls`, priv.bypassrls);
    }

    if (!cat.i_am_superuser) {
      info('behaviour.skipped', 'the connected role is not a superuser (the hosted proof is docs/06 §4 item 13: SET LOCAL ROLE anon through the read-only MCP)');
    } else {
      // --- behaviour (the local cluster) --------------------------------------
      await c.query('BEGIN');
      const ownerCounts = {};
      for (const t of TABLES) ownerCounts[t.name] = (await c.query(`SELECT count(*)::int AS n FROM portal.${t.name}`)).rows[0].n;
      const populated = TABLES.filter((t) => ownerCounts[t.name] > 0).map((t) => t.name);
      info('behaviour.populated_tables', populated.length);
      const beforeLogins = ownerCounts.login_attempts;

      // deny: the three Data API roles, four verbs, every table
      for (const role of present) {
        const codes = {};
        for (const t of TABLES) {
          const probes = [
            ['select', `SELECT 1 FROM portal.${t.name} LIMIT 1`],
            ['insert', `INSERT INTO portal.${t.name} SELECT * FROM portal.${t.name} WHERE false`],
            ['update', `UPDATE portal.${t.name} SET id = id WHERE false`],
            ['delete', `DELETE FROM portal.${t.name} WHERE false`],
          ];
          for (const [verb, sql] of probes) {
            const r = await asRole(c, role, sql);
            const k = r.ok ? 'accepted' : r.code;
            codes[k] = (codes[k] || 0) + 1;
            void verb;
          }
        }
        check(`deny.${role}_every_verb_on_every_table_is_42501`, codes, { 42501: TABLES.length * 4 });
      }

      // rls alone: zz_probe has SELECT + INSERT and no policy
      // EXECUTE on the functions too: 003 revokes it from PUBLIC, and a default
      // such as attempted_at's portal.now_s() would otherwise refuse the INSERT
      // with its own 42501 before RLS is consulted — the refusal below must be
      // RLS's own ("new row violates row-level security policy").
      await c.query('CREATE ROLE zz_probe NOLOGIN');
      await c.query('GRANT USAGE ON SCHEMA portal TO zz_probe');
      await c.query('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA portal TO zz_probe');
      await c.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA portal TO zz_probe');
      let probeZero = 0;
      let probeErrors = 0;
      for (const t of TABLES) {
        const r = await asRole(c, 'zz_probe', `SELECT count(*)::int AS n FROM portal.${t.name}`);
        if (!r.ok) probeErrors += 1;
        else if (r.rows[0].n === 0) probeZero += 1;
      }
      check('rls_alone.granted_role_without_a_policy_sees_zero_rows_in_every_table', [probeZero, probeErrors], [TABLES.length, 0]);
      const probeInsert = await asRole(c, 'zz_probe', 'INSERT INTO portal.login_attempts (id, login_key, ip) VALUES ($1, $2, $3)', [BIG_ID + 1, 'f'.repeat(64), '127.0.0.1']);
      check('rls_alone.granted_role_without_a_policy_cannot_insert_42501_by_RLS_itself', [probeInsert.ok ? 'accepted' : probeInsert.code, probeInsert.ok ? null : /row-level security/.test(probeInsert.message)], ['42501', true]);
      info('rls_alone.populated_tables_hidden_from_zz_probe', populated.length);

      // allow: portal_app
      let appEqual = 0;
      for (const t of TABLES) {
        const r = await asRole(c, 'portal_app', `SELECT count(*)::int AS n FROM portal.${t.name}`);
        if (r.ok && r.rows[0].n === ownerCounts[t.name]) appEqual += 1;
      }
      check('allow.portal_app_sees_the_owner_counts_on_every_table', appEqual, TABLES.length);
      const appInsert = await asRoleKeep(c, 'portal_app', 'INSERT INTO portal.login_attempts (id, login_key, ip) VALUES ($1, $2, $3) RETURNING id', [BIG_ID + 2, 'f'.repeat(64), '127.0.0.1']);
      const appUpdate = await asRoleKeep(c, 'portal_app', 'UPDATE portal.login_attempts SET cleared = 1 WHERE id = $1', [BIG_ID + 2]);
      const appDelete = await asRoleKeep(c, 'portal_app', 'DELETE FROM portal.login_attempts WHERE id = $1', [BIG_ID + 2]);
      check('allow.portal_app_insert_update_delete_rowCounts', [appInsert.ok ? appInsert.rowCount : appInsert.code, appUpdate.ok ? appUpdate.rowCount : appUpdate.code, appDelete.ok ? appDelete.rowCount : appDelete.code], [1, 1, 1]);
      const appTruncate = await asRole(c, 'portal_app', 'TRUNCATE portal.login_attempts');
      const appAlter = await asRole(c, 'portal_app', 'ALTER TABLE portal.login_attempts ADD COLUMN zz_probe_col integer');
      const appDrop = await asRole(c, 'portal_app', 'DROP TABLE portal.login_attempts');
      const appCreate = await asRole(c, 'portal_app', 'CREATE TABLE portal.zz_probe_table (id integer)');
      check('allow.portal_app_truncate_alter_drop_create_are_42501', [appTruncate, appAlter, appDrop, appCreate].map((r) => (r.ok ? 'accepted' : r.code)), ['42501', '42501', '42501', '42501']);
      const appNow = await asRole(c, 'portal_app', 'SELECT portal.now_s() IS NOT NULL AS ok');
      check('allow.portal_app_executes_now_s', appNow.ok ? appNow.rows[0].ok : appNow.code, true);
      const appLogins = (await c.query('SELECT count(*)::int AS n FROM portal.login_attempts')).rows[0].n;
      check('allow.synthetic_row_gone_after_its_delete', appLogins, beforeLogins);

      // owner: the no-FORCE exemption
      // zz_owner receives the TABLES (and their identity sequences) but not the
      // functions, which stay with the real owner; the real portal_migrate owns
      // both, so EXECUTE is granted here to emulate it. The first run of this
      // script found that gap: the owner's INSERT was refused by now_s(), not by
      // RLS — which is also the measured proof that 003's function revoke holds.
      await c.query('CREATE ROLE zz_owner NOLOGIN');
      await c.query('GRANT USAGE ON SCHEMA portal TO zz_owner');
      await c.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA portal TO zz_owner');
      for (const t of TABLES) await c.query(`ALTER TABLE portal.${t.name} OWNER TO zz_owner`);
      let ownerEqual = 0;
      for (const t of TABLES) {
        const r = await asRole(c, 'zz_owner', `SELECT count(*)::int AS n FROM portal.${t.name}`);
        if (r.ok && r.rows[0].n === ownerCounts[t.name]) ownerEqual += 1;
      }
      check('owner.table_owner_reads_every_row_without_a_policy_(no_FORCE)', ownerEqual, TABLES.length);
      const ownerInsert = await asRole(c, 'zz_owner', 'INSERT INTO portal.login_attempts (id, login_key, ip) VALUES ($1, $2, $3)', [BIG_ID + 3, 'f'.repeat(64), '127.0.0.1']);
      check('owner.table_owner_inserts_without_a_policy_(no_FORCE)', ownerInsert.ok ? ownerInsert.rowCount : ownerInsert.code, 1);

      await c.query('ROLLBACK');
      const [after] = (await c.query(`SELECT
        (SELECT count(*) FROM pg_roles WHERE rolname IN ('zz_probe', 'zz_owner')) AS zz_roles,
        (SELECT count(*)::int FROM portal.login_attempts) AS logins,
        (SELECT count(*)::int FROM portal.login_attempts WHERE id >= $1) AS big_ids,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'portal' AND tableowner = current_user) AS owned_by_me,
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'portal') AS policies`, [BIG_ID])).rows;
      check('rollback.left_nothing_behind', [after.zz_roles, after.logins === beforeLogins, after.big_ids, after.owned_by_me, after.policies], [0, true, 0, TABLES.length, TABLES.length]);
    }
  } catch (error) {
    failures += 1;
    console.error('RLS CHECK FAILED:', safeMessage(error));
    try { await c.query('ROLLBACK'); } catch { /* nothing open */ }
  } finally {
    c.release(true);
    await p.end();
    report.failures = failures;
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const out = path.join(P.REHEARSAL_DIR, `rlscheck_${target.name}_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`${failures === 0 ? 'RLS CHECK OK' : `RLS CHECK: ${failures} check(s) failed`} — report: ${out}`);
    if (failures) process.exitCode = 1;
  }
}

main().catch((e) => { console.error('rls-check failed:', safeMessage(e)); process.exit(1); });
