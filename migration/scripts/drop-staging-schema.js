#!/usr/bin/env node
// THE CUTOVER'S DROP (docs/07 Phase 2; the cutover plan's step 4): removes the
// `portal` schema from staging so `apply-schema.js --target staging` can
// rebuild it from the files. THE OWNER RUNS IT; Code shows it first.
//
//   node scripts/drop-staging-schema.js --target staging
//       as portal_migrate (the schema's owner) through the session pooler,
//       TLS verify-full, from <DATA_DIR>/secrets/supabase.env (lib/env.js)
//
//   node scripts/drop-staging-schema.js --target local --database parents_portal_droptest_<x>
//       the embedded cluster only, a parents_portal_droptest_* database only:
//       what scripts/test-drop-staging-schema.js runs. Never parents_portal_pg.
//
// In order, and nothing is skipped:
//   1. The arguments are checked BEFORE any secret file is opened (D-65):
//      --target is required, --tls-encrypt-only is refused, --database is for
//      the local test target only.
//   2. Connect; on staging the chain must have verified. The role must be
//      portal_migrate and it must own `portal`.
//   3. THE SURVEY, in a READ ONLY transaction: every kind of object that goes
//      (tables, sequences, enum types, functions, the collation portal.ci,
//      policies, …), the rows in each table, and anything OUTSIDE the schema
//      that CASCADE would also reach — if there is any, it refuses.
//   4. THE STATEMENT, printed exactly as it will run.
//   5. The question: only the exact phrase DROP portal goes on. Anything else,
//      an empty line or the end of input refuses, and nothing has changed.
//   6. One transaction: BEGIN; SET LOCAL lock_timeout; DROP SCHEMA portal
//      CASCADE; the in-transaction count of `portal` schemas, which must be 0
//      or it rolls back; COMMIT.
//   7. THE READ-BACK on the same connection: `portal` absent; portal_app and
//      portal_migrate still present with the same settings (search_path) as in
//      the survey. Roles, passwords, the Data API settings and ensure_rls are
//      never touched by this script.
//
// Prints object names and counts only — never a host, the project ref, a user
// name with its ref, a password or a row value. Exit 0 dropped (or nothing
// to drop), 2 refused by the arguments, 3 refused at the question or by the
// survey, 1 any error — nothing is committed unless "COMMIT done" printed.
const readline = require('readline');
const env = require('../lib/env');
const { client } = require('../lib/pg');
const { safeMessage } = require('../lib/safeMessage');

const SCHEMA = 'portal';
const PHRASE = 'DROP portal';
const PROMPT = `Type ${PHRASE} to drop it, or anything else to stop: `;
const LOCK_TIMEOUT = '10s';
const ROLES = ['portal_app', 'portal_migrate'];
const LOCAL_DB = /^parents_portal_droptest_[a-z0-9_]{1,30}$/;

const STATEMENT = [
  'BEGIN;',
  `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`,
  `DROP SCHEMA ${SCHEMA} CASCADE;`,
  `SELECT count(*) FROM pg_namespace WHERE nspname = '${SCHEMA}';   -- must be 0, or ROLLBACK`,
  'COMMIT;',
];

class Refusal extends Error {
  constructor(message, code) {
    super(message);
    this.exitCode = code;
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// Step 1: the arguments alone, before any file is read or any socket opened.
function checkArguments() {
  const known = new Set(['--target', '--database']);
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--tls-encrypt-only') throw new Refusal('--tls-encrypt-only is refused: this drop runs with verify-full only', 2);
    if (!known.has(args[i])) throw new Refusal(`unknown argument ${args[i].startsWith('--') ? args[i] : '(a value)'}`, 2);
    i += 1;
  }
  const target = arg('--target');
  const database = arg('--database');
  if (target !== 'staging' && target !== 'local') throw new Refusal('--target staging or --target local is required', 2);
  if (target === 'staging' && database !== undefined) throw new Refusal('--database is for the local test target only; staging names its own database', 2);
  if (target === 'local' && !LOCAL_DB.test(database || '')) {
    throw new Refusal('--target local needs --database parents_portal_droptest_<x> (a disposable test database; never parents_portal_pg)', 2);
  }
  return { target, database };
}

// Step 2's settings. Staging: portal_migrate with the CA (verify-full) or a throw.
function connectionSettings({ target, database }) {
  if (target === 'local') {
    const pg = { ...env.localConfig(), database };
    if (pg.host !== '127.0.0.1' || pg.port !== env.LOCAL_PG.port || pg.ssl) throw new Refusal('the local target must be the embedded cluster on 127.0.0.1 without TLS', 2);
    return { label: `local disposable database ${database} on the embedded cluster`, pg, staging: false };
  }
  const cfg = env.stagingConfig('portal_migrate');
  if (!cfg) throw new Refusal(`no secrets file at ${env.SECRETS_FILE}`, 2);
  const { tlsMode, ref, ...pg } = cfg;
  void ref;
  if (!pg.ssl || pg.ssl.rejectUnauthorized !== true || !pg.ssl.ca) throw new Refusal(`TLS is ${tlsMode}, not verify-full — refused`, 2);
  return { label: 'staging (the Supabase project) as portal_migrate, through the session pooler', pg, staging: true };
}

const q = async (c, text, params) => (await c.query(text, params)).rows;

async function roleFacts(c) {
  return q(
    c,
    `SELECT r.rolname, COALESCE(array_to_json(r.rolconfig)::text, '[]') AS config
       FROM pg_roles r WHERE r.rolname = ANY($1::text[]) ORDER BY r.rolname`,
    [ROLES]
  );
}

// Step 3: what goes. Read-only; returns null when the schema is absent.
async function survey(c) {
  const [ns] = await q(c, 'SELECT oid, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = $1', [SCHEMA]);
  if (!ns) return null;
  const [kinds] = await q(
    c,
    `SELECT
       (SELECT count(*) FROM pg_class WHERE relnamespace = $1 AND relkind IN ('r', 'p'))::int AS tables,
       (SELECT count(*) FROM pg_class WHERE relnamespace = $1 AND relkind = 'S')::int AS sequences,
       (SELECT count(*) FROM pg_class WHERE relnamespace = $1 AND relkind = 'i')::int AS indexes,
       (SELECT count(*) FROM pg_class WHERE relnamespace = $1 AND relkind IN ('v', 'm'))::int AS views,
       (SELECT count(*) FROM pg_type WHERE typnamespace = $1 AND typtype = 'e')::int AS enum_types,
       (SELECT count(*) FROM pg_type t WHERE t.typnamespace = $1 AND (t.typtype IN ('d', 'r', 'm')
          OR (t.typtype = 'c' AND EXISTS (SELECT 1 FROM pg_class k WHERE k.oid = t.typrelid AND k.relkind = 'c'))))::int AS other_types,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = $1)::int AS functions,
       (SELECT count(*) FROM pg_collation WHERE collnamespace = $1)::int AS collations,
       (SELECT count(*) FROM pg_policy p JOIN pg_class k ON k.oid = p.polrelid WHERE k.relnamespace = $1)::int AS policies,
       (SELECT count(*) FROM pg_trigger g JOIN pg_class k ON k.oid = g.tgrelid WHERE k.relnamespace = $1 AND NOT g.tgisinternal)::int AS triggers,
       (SELECT count(*) FROM pg_default_acl WHERE defaclnamespace = $1)::int AS default_privileges`,
    [ns.oid]
  );
  const collations = (await q(c, 'SELECT collname FROM pg_collation WHERE collnamespace = $1 ORDER BY collname', [ns.oid])).map((r) => `${SCHEMA}.${r.collname}`);
  const functions = (await q(c, 'SELECT proname FROM pg_proc WHERE pronamespace = $1 ORDER BY proname', [ns.oid])).map((r) => `${SCHEMA}.${r.proname}()`);
  const tables = await q(c, "SELECT relname FROM pg_class WHERE relnamespace = $1 AND relkind IN ('r', 'p') ORDER BY relname", [ns.oid]);
  const rows = [];
  for (const t of tables) {
    const [r] = await q(c, `SELECT count(*)::int AS n FROM ${SCHEMA}.${c.escapeIdentifier(t.relname)}`);
    rows.push({ table: t.relname, rows: r.n });
  }
  // Anything outside the schema that depends on something inside it — what
  // CASCADE would reach beyond `portal`. Each dependent is resolved to the
  // namespace it lives in (a rule, a trigger, a policy, a constraint or a
  // default lives in its table's); no namespace at all counts as outside.
  const outside = await q(
    c,
    `WITH inside AS (
       SELECT 'pg_class'::regclass AS classid, oid AS objid FROM pg_class WHERE relnamespace = $1
       UNION ALL SELECT 'pg_type'::regclass, oid FROM pg_type WHERE typnamespace = $1
       UNION ALL SELECT 'pg_proc'::regclass, oid FROM pg_proc WHERE pronamespace = $1
       UNION ALL SELECT 'pg_collation'::regclass, oid FROM pg_collation WHERE collnamespace = $1
     ), dependents AS (
       SELECT DISTINCT d.classid, d.objid
         FROM pg_depend d JOIN inside i ON i.classid = d.refclassid AND i.objid = d.refobjid
        WHERE d.deptype IN ('n', 'a')
     ), homed AS (
       SELECT x.classid, x.objid,
              CASE x.classid
                WHEN 'pg_class'::regclass THEN (SELECT relnamespace FROM pg_class WHERE oid = x.objid)
                WHEN 'pg_type'::regclass THEN (SELECT typnamespace FROM pg_type WHERE oid = x.objid)
                WHEN 'pg_proc'::regclass THEN (SELECT pronamespace FROM pg_proc WHERE oid = x.objid)
                WHEN 'pg_collation'::regclass THEN (SELECT collnamespace FROM pg_collation WHERE oid = x.objid)
                WHEN 'pg_constraint'::regclass THEN (SELECT COALESCE(k.relnamespace, o.connamespace) FROM pg_constraint o LEFT JOIN pg_class k ON k.oid = o.conrelid WHERE o.oid = x.objid)
                WHEN 'pg_rewrite'::regclass THEN (SELECT k.relnamespace FROM pg_rewrite w JOIN pg_class k ON k.oid = w.ev_class WHERE w.oid = x.objid)
                WHEN 'pg_trigger'::regclass THEN (SELECT k.relnamespace FROM pg_trigger g JOIN pg_class k ON k.oid = g.tgrelid WHERE g.oid = x.objid)
                WHEN 'pg_policy'::regclass THEN (SELECT k.relnamespace FROM pg_policy p JOIN pg_class k ON k.oid = p.polrelid WHERE p.oid = x.objid)
                WHEN 'pg_attrdef'::regclass THEN (SELECT k.relnamespace FROM pg_attrdef a JOIN pg_class k ON k.oid = a.adrelid WHERE a.oid = x.objid)
                WHEN 'pg_default_acl'::regclass THEN (SELECT defaclnamespace FROM pg_default_acl WHERE oid = x.objid)
              END AS home
         FROM dependents x
     )
     SELECT o.type, o.identity
       FROM homed h CROSS JOIN LATERAL pg_identify_object(h.classid, h.objid, 0) o
      WHERE h.home IS DISTINCT FROM $1
      ORDER BY 1, 2`,
    [ns.oid]
  );
  const [db] = await q(c, 'SELECT current_database() AS database, current_user AS role, version() AS version');
  const [sessions] = await q(
    c,
    `SELECT count(*) FILTER (WHERE usename = 'portal_app')::int AS portal_app,
            count(*) FILTER (WHERE usename = 'portal_migrate')::int AS portal_migrate,
            count(*) FILTER (WHERE usename IS DISTINCT FROM 'portal_app' AND usename IS DISTINCT FROM 'portal_migrate')::int AS other
       FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`
  );
  return { owner: ns.owner, kinds, collations, functions, rows, outside, db, sessions, roles: await roleFacts(c) };
}

function printSurvey(s) {
  const totalRows = s.rows.reduce((sum, r) => sum + r.rows, 0);
  const k = s.kinds;
  console.log('--- SURVEY (read-only): what DROP SCHEMA portal CASCADE removes ---');
  console.log(`database ${s.db.database}; signed in as ${s.db.role}; portal is owned by ${s.owner}`);
  console.log(`server: ${String(s.db.version).split(' on ')[0]}`);
  console.log(`tables ${k.tables}, sequences ${k.sequences}, indexes ${k.indexes}, views ${k.views}`);
  console.log(`enum types ${k.enum_types}, other types ${k.other_types}, functions ${k.functions}, collations ${k.collations}`);
  console.log(`policies ${k.policies}, triggers ${k.triggers}, default privilege entries ${k.default_privileges}`);
  console.log(`functions: ${s.functions.join(', ') || '(none)'}`);
  console.log(`collations: ${s.collations.join(', ') || '(none)'}`);
  console.log(`rows: ${totalRows} in ${s.rows.filter((r) => r.rows > 0).length} of ${s.rows.length} tables`);
  for (const r of s.rows) if (r.rows > 0) console.log(`  ${r.table} ${r.rows}`);
  console.log(`objects outside portal that CASCADE would also reach: ${s.outside.length}`);
  for (const o of s.outside) console.log(`  ${o.type}: ${o.identity}`);
  console.log(`other sessions on this database: portal_app ${s.sessions.portal_app}, portal_migrate ${s.sessions.portal_migrate}, other roles ${s.sessions.other}`);
  console.log(`roles kept (not touched): ${s.roles.map((r) => r.rolname).join(', ')}`);
  console.log('--- end of survey ---');
}

function ask() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    let answered = false;
    rl.once('line', (line) => {
      answered = true;
      rl.close();
      resolve(line);
    });
    rl.once('close', () => {
      if (!answered) resolve(null);
    });
    process.stdout.write(PROMPT);
  });
}

async function main() {
  const args = checkArguments();
  const target = connectionSettings(args);
  console.log(`target: ${target.label}`);
  const c = await client(target.pg);
  try {
    if (target.staging) {
      const t = env.tlsFacts(c);
      console.log(`TLS: encrypted ${t.encrypted}, chain verified ${t.chain_verified}, protocol ${t.protocol}`);
      if (!t.encrypted || !t.chain_verified) throw new Refusal('the TLS chain did not verify — refused', 3);
    }
    await c.query('BEGIN READ ONLY');
    let s;
    try {
      s = await survey(c);
    } finally {
      await c.query('ROLLBACK');
    }
    if (!s) {
      console.log('portal is absent — nothing to drop');
      return 0;
    }
    printSurvey(s);
    if (s.db.role !== 'portal_migrate') throw new Refusal(`signed in as ${s.db.role}, not portal_migrate — refused`, 3);
    if (s.owner !== s.db.role) throw new Refusal(`portal is owned by ${s.owner}, not ${s.db.role} — refused`, 3);
    if (s.outside.length) throw new Refusal('CASCADE would reach objects outside portal — refused; nothing changed', 3);

    console.log('--- THE STATEMENT, exactly as it will run (one transaction) ---');
    for (const line of STATEMENT) console.log(`  ${line}`);
    console.log('--- end of statement ---');

    const answer = await ask();
    process.stdout.write('\n');
    if (answer !== PHRASE) {
      throw new Refusal(`REFUSED: the answer was not exactly ${PHRASE} — nothing changed`, 3);
    }

    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      await c.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
      const [inTx] = await q(c, 'SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = $1', [SCHEMA]);
      if (inTx.n !== 0) throw new Error(`portal still present inside the transaction (${inTx.n}) — rolled back`);
      await c.query('COMMIT');
      console.log('COMMIT done');
    } catch (error) {
      try {
        await c.query('ROLLBACK');
      } catch {
        // the connection's own failure; nothing was committed
      }
      if (error && error.code === '55P03') throw new Error(`the drop waited more than ${LOCK_TIMEOUT} for a lock (is the staging API still running?) — rolled back, nothing changed`);
      throw error;
    }

    const [after] = await q(c, 'SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = $1', [SCHEMA]);
    const roles = await roleFacts(c);
    const same = JSON.stringify(roles) === JSON.stringify(s.roles);
    console.log(`--- READ-BACK ---`);
    console.log(`portal schemas: ${after.n}`);
    console.log(`roles: ${roles.map((r) => r.rolname).join(', ')} present; their settings ${same ? 'unchanged' : 'CHANGED'}`);
    if (after.n !== 0 || !same) {
      console.log('READ-BACK FAILED');
      return 1;
    }
    console.log('DROPPED: portal is gone; the next step is apply-schema.js --target staging');
    return 0;
  } finally {
    await c.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    if (e instanceof Refusal) {
      console.error(e.message);
      process.exit(e.exitCode);
    }
    console.error(`drop-staging-schema failed: ${safeMessage(e)}`);
    process.exit(1);
  });
