#!/usr/bin/env node
// Sets portal_migrate's and portal_app's passwords on the hosted target without
// psql and without the value ever sitting in a file in git, in the SQL
// editor's history or in a statement log (D-65, the owner's Q2.4).
//
//   node scripts/set-role-passwords.js --target staging [--dry-run] [--tls-encrypt-only]
//
// HOW THE VALUE TRAVELS: as a BIND PARAMETER of `SELECT set_config('portal.pw',
// $1, true)`, then a DO block runs `ALTER ROLE <role> PASSWORD %L` from
// current_setting('portal.pw') — the ALTER's text, as the server logs it,
// holds no literal; the setting is transaction-local and is cleared before
// COMMIT. The connection is the owner's (PG_OWNER_URL, the dashboard's Session
// pooler URI), over TLS (lib/env.js: verify-full with the CA file, or
// --tls-encrypt-only, said aloud). Each role is then verified by signing in
// THROUGH THE POOLER as <role>.<project ref> with the new password and running
// SELECT 1 — the pooler's auth query only works once a SCRAM secret exists.
//
// --dry-run opens no connection: it reports which of the three key NAMES the
// secrets file lacks, whether PG_OWNER_URL parses by the pooler rules (yes/no,
// never a value), whether the CA file is present and which TLS mode would be
// used. Nothing in this script prints a password, a URL or a host.
const { stagingKeysMissing, stagingConfig, parseOwnerUrl, targetName, tlsFacts, ROLES, SECRETS_FILE, CA_FILE } = require('../lib/env');
const { client: newClient } = require('../lib/pg');
const { safeMessage } = require('../lib/safeMessage');
const fs = require('fs');

const dep = require('../lib/deps').dep;
const dotenv = dep('dotenv');

function dryRun() {
  const state = stagingKeysMissing();
  console.log(`DRY RUN — secrets file: ${state.file ? 'present' : 'MISSING'} (${SECRETS_FILE})`);
  for (const key of ['PG_OWNER_URL', 'PORTAL_MIGRATE_PASSWORD', 'PORTAL_APP_PASSWORD']) {
    console.log(`  ${key}: ${state.missing.includes(key) ? 'MISSING' : 'present'}`);
  }
  let parses = null;
  if (state.file && !state.missing.includes('PG_OWNER_URL')) {
    const env = dotenv.parse(fs.readFileSync(SECRETS_FILE));
    try {
      const o = parseOwnerUrl(env.PG_OWNER_URL);
      parses = { pooler_host: true, session_port_5432: true, database_named: Boolean(o.database), ref_derived: Boolean(o.ref) };
    } catch (e) {
      parses = { error: safeMessage(e) };
    }
    console.log(`  PG_OWNER_URL parses by the pooler rules: ${JSON.stringify(parses)}`);
  }
  const ca = fs.existsSync(CA_FILE);
  console.log(`  CA file ${ca ? 'present' : 'MISSING'} (${CA_FILE}) → TLS mode would be ${ca ? 'verify-full' : 'refused unless --tls-encrypt-only'}`);
  console.log(`  would ALTER ROLE ${ROLES.join(' and ')} as the owner, then verify each by signing in through the Session pooler as <role>.<project ref>`);
  const complete = state.file && state.missing.length === 0 && parses && !parses.error;
  console.log(complete ? 'DRY RUN OK — every key present; run without --dry-run when the owner says so' : 'DRY RUN INCOMPLETE — see the names above');
  process.exitCode = complete ? 0 : 1;
}

async function setOne(owner, role, password) {
  await owner.query('BEGIN');
  try {
    const exists = (await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount === 1;
    if (!exists) throw new Error(`role ${role} does not exist — run schema/002_roles.sql as the owner first.`);
    await owner.query("SELECT set_config('portal.pw', $1, true)", [password]);
    await owner.query(`DO $$ BEGIN EXECUTE format('ALTER ROLE %I PASSWORD %L', '${role}', current_setting('portal.pw', true)); END $$`);
    await owner.query(`ALTER ROLE ${role} VALID UNTIL 'infinity'`);
    await owner.query("SELECT set_config('portal.pw', '', true)");
    await owner.query('COMMIT');
  } catch (error) {
    try { await owner.query('ROLLBACK'); } catch { /* already gone */ }
    throw error;
  }
}

async function verifyOne(role) {
  const cfg = stagingConfig(role);
  const { tlsMode, ref, ...pg } = cfg;
  void ref;
  const c = await newClient(pg);
  try {
    const row = (await c.query('SELECT current_user::text AS who, 1 AS one')).rows[0];
    return { signed_in_as_role: row.who === role, one: row.one, tls: tlsFacts(c), tls_mode: tlsMode };
  } finally {
    await c.end();
  }
}

async function main() {
  const name = targetName();
  if (name !== 'staging') throw new Error('set-role-passwords runs against --target staging only; the local cluster\'s roles are the embedded bootstrap user and the NOLOGIN probes.');
  if (process.argv.includes('--dry-run')) return dryRun();

  const state = stagingKeysMissing();
  if (!state.file || state.missing.length) throw new Error(`secrets incomplete — missing: ${state.missing.join(', ') || '(file)'}; run --dry-run for the list.`);
  const ownerCfg = stagingConfig('owner');
  const { tlsMode, ref, ...ownerPg } = ownerCfg;
  void ref;
  console.log(`connecting as the owner through the Session pooler; tls ${tlsMode}`);
  const owner = await newClient(ownerPg);
  try {
    console.log(`TLS ${JSON.stringify(tlsFacts(owner))}`);
    const env = dotenv.parse(fs.readFileSync(SECRETS_FILE));
    for (const role of ROLES) {
      const key = role === 'portal_app' ? 'PORTAL_APP_PASSWORD' : 'PORTAL_MIGRATE_PASSWORD';
      await setOne(owner, role, env[key]);
      console.log(`${role}: password set (bound as a parameter, never in statement text)`);
    }
  } finally {
    await owner.end();
  }
  for (const role of ROLES) {
    const v = await verifyOne(role);
    console.log(`${role}: verified through the pooler — ${JSON.stringify(v)}`);
    if (!v.signed_in_as_role || v.one !== 1) throw new Error(`${role}: verification sign-in did not answer as expected.`);
  }
  console.log('ROLE PASSWORDS OK');
  return undefined;
}

main().catch((e) => { console.error('set-role-passwords failed:', safeMessage(e)); process.exit(1); });
