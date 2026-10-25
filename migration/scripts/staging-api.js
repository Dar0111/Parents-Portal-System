#!/usr/bin/env node
// THE PORTED API ON STAGING, RUN ON THIS LAPTOP (P3-C-R2 Phase L, the owner's
// step c; P7 described it). server/server.js against the Supabase project as
// portal_app through the SESSION pooler, every setting DERIVED IN MEMORY from
// <DATA_DIR>/secrets/supabase.env by lib/env.js and handed to the child as its
// environment — never written to a file, never printed. File mail and file
// SMS (nothing leaves the laptop). The restore's own credential is
// portal_migrate (routes/backups.js, migration/docs/04), as on the server.
//
//   node scripts/staging-api.js --check   the preflight alone: read-only
//                                         facts from both roles, then exit
//   node scripts/staging-api.js           the preflight, then the API on
//                                         127.0.0.1:5010 (foreground; stop it
//                                         with Ctrl+C or the task's stop)
//   node scripts/staging-api.js --smoke   the BROWSER SMOKE against the API
//                                         this script already runs on 5010
//                                         and Vite on 3010 (the owner's
//                                         approval of 2026-10-26, three
//                                         conditions): read-only counts by
//                                         role BEFORE, scripts/smoke-pg.js as
//                                         a child with the staging PG_* keys
//                                         and PORTAL_FIXTURE_HOSTED set in
//                                         ITS environment only (never a file),
//                                         read-only counts AFTER its teardown;
//                                         nothing is read during the run, and
//                                         the confirmed contacts and policy
//                                         acceptances by role must match
//   node scripts/staging-api.js --smoke-live
//                                         THE POST-CUTOVER WEB SMOKE (the
//                                         cutover plan's step 10; the owner's
//                                         Q8 (b)): the same smoke, the same
//                                         counts before and after and the same
//                                         flag in the child's environment only,
//                                         against the OWNER'S OWN API on
//                                         127.0.0.1:5000 (npm start, server/.env
//                                         on the Supabase project) and web on
//                                         http://localhost:3000 — this script
//                                         only connects to them. smoke-pg.js
//                                         is pinned to 5010/3010 and stays so,
//                                         so this mode derives the same five
//                                         accounts itself (the default
//                                         passwords from setup-db.js, the login
//                                         ids by role and child, read-only) and
//                                         runs Playwright directly. It refuses
//                                         to start if the flag is already set
//                                         in its own shell.
//   node scripts/staging-api.js --smoke-live --local
//                                         the same on the EMBEDDED cluster for
//                                         its test (scripts/test-smoke-live.js):
//                                         the PG_* keys come from this
//                                         process's environment (the session
//                                         runner) and must name 127.0.0.1 and
//                                         the cluster's port; no secrets file
//                                         is read
//
// TLS is verify-full or nothing: the CA file must be in the secrets folder
// (lib/env.js reads it; this script never opens it), and --tls-encrypt-only is
// refused here. JWT_SECRET is random per launch, so every token dies with the
// process. This script never LISTENS on 5000, 3000, 5001 or 3001: the API it
// starts listens on 5010 and allows the browser origin http://localhost:3010
// only; --smoke-live only connects to the owner's 5000 and 3000.
//
// Everything the child prints passes the same masks as the session runner,
// plus the pooler host, the project ref and the two role passwords.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const env = require('../lib/env');
const { client } = require('../lib/pg');

const SERVER = path.join(__dirname, '..', '..', 'server');
const PORT = '5010';
const ORIGIN = 'http://localhost:3010';
const CLIENT = path.join(__dirname, '..', '..', 'client');
// --smoke-live: the owner's own servers after the cutover
const LIVE = { api: 'http://127.0.0.1:5000', app: 'http://localhost:3000' };
const FLAG = 'PORTAL_FIXTURE_HOSTED';
const FLAG_VALUE = 'staging-smoke';

if (process.argv.includes('--tls-encrypt-only')) {
  console.error('staging-api: --tls-encrypt-only is refused — verify-full only (the CA file in the secrets folder).');
  process.exit(2);
}

function settings() {
  const missing = env.stagingKeysMissing();
  if (!missing.file || missing.missing.length) {
    throw new Error(`supabase.env is ${missing.file ? `missing ${missing.missing.join(', ')}` : 'not there'} (docs/06 §0)`);
  }
  if (!fs.existsSync(env.CA_FILE)) throw new Error('no CA file in the secrets folder — verify-full needs prod-ca-2021.crt');
  const app = env.stagingConfig('portal_app');
  const migrate = env.stagingConfig('portal_migrate');
  if (app.tlsMode !== 'verify-full' || migrate.tlsMode !== 'verify-full') throw new Error('TLS is not verify-full');
  return { app, migrate };
}

// The pooler host, the project ref, both role passwords and both pooler user
// names, whatever the context — applied to everything this script prints.
function makeScrub(cfg) {
  const secrets = [cfg.app.host, cfg.app.ref, cfg.app.password, cfg.migrate.password, cfg.app.user, cfg.migrate.user]
    .filter((s) => typeof s === 'string' && s.length >= 4)
    .sort((a, b) => b.length - a.length);
  return (line) => {
    let s = String(line);
    for (const v of secrets) s = s.split(v).join('<staging>');
    return s.replace(/postgres(?:ql)?:\/\/\S+/gi, '<connection string>').replace(/[\w-]+\.pooler\.supabase\.com/gi, '<host>');
  };
}

// The child's lines also get the session runner's masks (every quoted
// literal, ids, e-mail addresses, tokens, hashes, long digit runs).
function makeMask(cfg) {
  const scrub = makeScrub(cfg);
  return (line) =>
    scrub(line)
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
      .replace(/\$2[aby]\$\d\d\$[./\w]{53}/g, '<hash>')
      .replace(/'(?:[^'\\]|\\.)*'/g, "'…'")
      .replace(/"(?:[^"\\]|\\.)*"/g, '"…"')
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
      .replace(/\b[A-Z]{2,}[-_]?\d{1,}\b/g, '<id>')
      .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '<blob>')
      .replace(/\d{6,}/g, '<n>');
}

function connConfig(c) {
  const { tlsMode, ref, ...pg } = c;
  void tlsMode;
  void ref;
  return pg;
}

// --- the preflight: read-only, both roles ---------------------------------
async function preflight(cfg) {
  const out = {};
  const app = await client(connConfig(cfg.app));
  try {
    const q = async (sql, params) => (await app.query(sql, params)).rows;
    out.tls = env.tlsFacts(app);
    const [who] = await q("SELECT current_user AS role, current_database() AS db, current_setting('server_version_num') AS version_num, version() AS version");
    out.app_identity = { role: who.role, database: who.db, server_version_num: who.version_num, version: who.version.split(' on ')[0] };
    const [pid1] = await q("SELECT pg_backend_pid() AS pid, set_config('portal.preflight', 'session', false) AS v");
    const [pid2] = await q("SELECT pg_backend_pid() AS pid, current_setting('portal.preflight', true) AS v");
    out.pooler_session_mode = { same_backend: pid1.pid === pid2.pid, session_setting_kept: pid2.v === 'session' };
    const [sh] = await q(
      "SELECT current_setting('TimeZone') AS tz, current_setting('default_transaction_isolation') AS iso, current_setting('statement_timeout') AS stmt, current_setting('idle_in_transaction_session_timeout') AS idle_tx, current_setting('idle_session_timeout') AS idle_session, current_setting('search_path') AS search_path"
    );
    out.app_settings = sh;
    const skews = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      const [r] = await q('SELECT extract(epoch from clock_timestamp()) * 1000 AS ms');
      const t1 = Date.now();
      skews.push({ skew_ms: Math.round(Number(r.ms) - (t0 + t1) / 2), rtt_ms: t1 - t0 });
    }
    const sorted = skews.map((s) => s.skew_ms).sort((a, b) => a - b);
    out.clock = { median_skew_ms_db_minus_host: sorted[2], min: sorted[0], max: sorted[4], rtt_ms: skews.map((s) => s.rtt_ms) };
    const [app_rows] = await q('SELECT count(*)::int AS users FROM portal.users');
    out.app_can_read = { users_rows_visible: app_rows.users > 0 };
  } finally {
    await app.end();
  }

  const mig = await client(connConfig(cfg.migrate));
  try {
    const q = async (sql, params) => (await mig.query(sql, params)).rows;
    const [who] = await q('SELECT current_user AS role');
    out.migrate_identity = { role: who.role, tls_verified: env.tlsFacts(mig).chain_verified };
    out.roles = await q(
      "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolinherit FROM pg_roles WHERE rolname IN ('portal_app', 'portal_migrate') ORDER BY rolname"
    );
    const [icu] = await q("SELECT count(*)::int AS icu_collations FROM pg_collation WHERE collprovider = 'i'");
    out.icu = icu;
    const ci = (await q("SELECT to_jsonb(c) AS j FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'portal' AND c.collname = 'ci'"))[0];
    out.portal_ci = ci
      ? { provider: ci.j.collprovider, deterministic: ci.j.collisdeterministic, locale: ci.j.colllocale ?? ci.j.colliculocale ?? null, version: ci.j.collversion }
      : null;
    const dbrow = (await q('SELECT to_jsonb(d) AS j, pg_encoding_to_char(d.encoding) AS enc FROM pg_database d WHERE d.datname = current_database()'))[0];
    out.database = {
      encoding: dbrow.enc,
      provider: dbrow.j.datlocprovider,
      collate: dbrow.j.datcollate,
      ctype: dbrow.j.datctype,
      locale: dbrow.j.datlocale ?? dbrow.j.daticulocale ?? null,
      collversion: dbrow.j.datcollversion,
    };
    const names = ['Abad', 'abad', 'Ábrego', 'Abrego', 'de la Cruz', 'Dela Cruz', 'Ñuñez', 'Nunez', 'nuñez', 'Zuñiga', 'zuniga', 'b', 'B', 'a', 'A', 'Á', 'á', 'z'];
    const [order] = await q(
      'SELECT array_agg(v ORDER BY v, i) AS default_order, array_agg(v ORDER BY v COLLATE portal.ci, i) AS ci_order FROM unnest($1::text[]) WITH ORDINALITY AS t(v, i)',
      [names]
    );
    out.d2_tie_order = { input: names, default_collation: order.default_order, portal_ci_with_input_order: order.ci_order };
    const [rls] = await q(
      `SELECT count(*)::int AS tables,
              count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_on,
              count(*) FILTER (WHERE c.relforcerowsecurity)::int AS forced,
              count(*) FILTER (WHERE has_table_privilege('portal_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))::int AS app_dml_tables,
              count(*) FILTER (WHERE has_table_privilege('portal_app', c.oid, 'TRUNCATE'))::int AS app_truncate_tables
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'portal' AND c.relkind = 'r'`
    );
    const [pol] = await q(
      "SELECT count(*)::int AS policies, count(*) FILTER (WHERE policyname = 'portal_app_all')::int AS portal_app_all FROM pg_policies WHERE schemaname = 'portal'"
    );
    const [seq] = await q(
      "SELECT count(*)::int AS sequences, count(*) FILTER (WHERE has_sequence_privilege('portal_app', c.oid, 'USAGE'))::int AS app_usage_sequences FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'portal' AND c.relkind = 'S'"
    );
    const [sch] = await q(
      `SELECT has_schema_privilege('portal_app', 'portal', 'USAGE') AS app_usage,
              has_schema_privilege('portal_app', 'portal', 'CREATE') AS app_create,
              has_schema_privilege('anon', 'portal', 'USAGE') AS anon_usage,
              has_schema_privilege('authenticated', 'portal', 'USAGE') AS authenticated_usage,
              has_schema_privilege('service_role', 'portal', 'USAGE') AS service_role_usage`
    );
    out.rls = { ...rls, ...pol, ...seq, ...sch };
  } finally {
    await mig.end();
  }
  return out;
}

// The child's environment: the staging connection for both roles, verify-full.
function stagingPgEnv(cfg) {
  const out = { ...process.env };
  for (const k of Object.keys(out)) if (/^(DB_|PG|MYSQL)/.test(k)) delete out[k];
  return Object.assign(out, {
    PG_HOST: cfg.app.host,
    PG_PORT: String(cfg.app.port),
    PG_DATABASE: cfg.app.database,
    PG_USER: cfg.app.user,
    PG_PASSWORD: cfg.app.password,
    PG_MIGRATE_USER: cfg.migrate.user,
    PG_MIGRATE_PASSWORD: cfg.migrate.password,
    PG_SSL: 'verify-full',
    PG_CA_FILE: env.CA_FILE,
  });
}

function pipeMasked(child, mask) {
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let k;
      while ((k = buf.indexOf('\n')) >= 0) {
        console.log(mask(buf.slice(0, k).replace(/\r$/, '')));
        buf = buf.slice(k + 1);
      }
    });
    stream.on('end', () => {
      if (buf) console.log(mask(buf));
    });
  }
}

// Counts by role, read-only (BEGIN READ ONLY ... ROLLBACK, portal_migrate):
// the two the owner's condition compares, and what the smoke adds by design.
async function smokeCounts(cfg) {
  const c = await client(connConfig(cfg.migrate));
  try {
    await c.query('BEGIN READ ONLY');
    const byRole = (
      await c.query(
        `SELECT u.role,
                count(*) FILTER (WHERE u.email_verified_at IS NOT NULL OR u.contact_verified_at IS NOT NULL)::int AS confirmed_contacts,
                (SELECT count(*) FROM portal.policy_acceptances p JOIN portal.users x ON x.id = p.user_id WHERE x.role = u.role)::int AS policy_acceptances
           FROM portal.users u GROUP BY u.role ORDER BY u.role`
      )
    ).rows;
    const [info] = (
      await c.query(
        `SELECT (SELECT count(*) FROM portal.notifications)::int AS notifications,
                (SELECT count(*) FROM portal.notifications WHERE read_at IS NULL)::int AS unread,
                (SELECT count(*) FROM portal.auth_codes)::int AS auth_codes,
                (SELECT count(*) FROM portal.login_attempts)::int AS login_attempts,
                (SELECT count(*) FROM portal.activity_logs WHERE action = 'login')::int AS login_rows`
      )
    ).rows;
    await c.query('ROLLBACK');
    return { byRole, info };
  } finally {
    await c.end();
  }
}

async function smoke(cfg, mask) {
  const health = await fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.status).catch(() => null);
  if (health !== 200) throw new Error(`the API on ${PORT} does not answer — start this script without --smoke first`);
  const before = await smokeCounts(cfg);
  console.log(`BEFORE (read-only): ${JSON.stringify(before)}`);
  const childEnv = { ...stagingPgEnv(cfg), PORTAL_FIXTURE_HOSTED: 'staging-smoke' };
  const extra = process.argv.indexOf('--') > 0 ? process.argv.slice(process.argv.indexOf('--')) : [];
  const child = spawn(process.execPath, [path.join(__dirname, 'smoke-pg.js'), '--app', ORIGIN, '--api', `http://127.0.0.1:${PORT}`, ...extra], {
    cwd: __dirname,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pipeMasked(child, mask);
  const code = await new Promise((resolve) => child.on('close', (c) => resolve(c === null ? 1 : c)));
  const after = await smokeCounts(cfg);
  console.log(`AFTER the teardown (read-only): ${JSON.stringify(after)}`);
  const match = JSON.stringify(before.byRole) === JSON.stringify(after.byRole);
  const delta = Object.fromEntries(Object.keys(after.info).map((k) => [k, after.info[k] - before.info[k]]));
  console.log(`confirmed contacts and policy acceptances by role: ${match ? 'MATCH' : 'DIFFER'}; other deltas ${JSON.stringify(delta)}`);
  console.log(`staging-api --smoke: the smoke exited ${code}`);
  process.exitCode = code === 0 && match ? 0 : 1;
}

// --- the post-cutover web smoke (--smoke-live) -----------------------------

// --local: the embedded cluster, from the PG_* keys the session runner set.
function localSettings() {
  const e = process.env;
  if (e.PG_HOST !== '127.0.0.1' || Number(e.PG_PORT) !== env.LOCAL_PG.port || /^verify/.test(e.PG_SSL || '')) {
    return null;
  }
  const base = { host: e.PG_HOST, port: Number(e.PG_PORT), database: e.PG_DATABASE };
  return {
    app: { ...base, user: e.PG_USER, password: e.PG_PASSWORD },
    migrate: { ...base, user: e.PG_MIGRATE_USER, password: e.PG_MIGRATE_PASSWORD },
  };
}

// The default passwords, from setup-db.js (the one place they live).
function seededPasswords() {
  const src = fs.readFileSync(path.join(SERVER, 'scripts', 'setup-db.js'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/const (admin|teacher|parent)Hash = bcrypt\.hashSync\('([^']+)'/g)) out[m[1]] = m[2];
  if (!out.admin || !out.teacher || !out.parent) throw new Error('the three default passwords were not found in server/scripts/setup-db.js');
  return out;
}

// The five accounts smoke-pg.js uses, read-only: the admin; the Grade 1
// learner Nino's parent and class adviser; the Grade 6 learner Marwin's.
async function smokeLoginIds(cfg) {
  const c = await client(connConfig(cfg.migrate));
  try {
    await c.query('BEGIN READ ONLY');
    const one = async (sql, params, what) => {
      const { rows } = await c.query(sql, params);
      if (rows.length !== 1) throw new Error(`expected one ${what}, found ${rows.length}`);
      return rows[0].login_id;
    };
    const parentOf = (first, grade) =>
      one(
        `SELECT u.login_id FROM portal.users u JOIN portal.students s ON s.id = u.student_id
          WHERE u.role = 'parent' AND s.first_name = $1`,
        [first],
        `parent of the Grade ${grade} learner`
      );
    const adviserOf = (first, grade) =>
      one(
        `SELECT u.login_id FROM portal.students s
           JOIN portal.sections sec ON sec.id = s.section_id
           JOIN portal.users u ON u.id = sec.adviser_id
          WHERE s.first_name = $1`,
        [first],
        `adviser of the Grade ${grade} learner's class`
      );
    const ids = {
      admin: await one("SELECT login_id FROM portal.users WHERE role = 'admin'", [], 'admin'),
      teacher: await adviserOf('Nino', 1),
      parent: await parentOf('Nino', 1),
      teacher2: await adviserOf('Marwin', 6),
      parent2: await parentOf('Marwin', 6),
    };
    await c.query('ROLLBACK');
    return ids;
  } finally {
    await c.end();
  }
}

// The mask, plus every account value this run holds in memory.
function withSecrets(mask, values) {
  const list = values.filter((s) => typeof s === 'string' && s.length >= 4).sort((a, b) => b.length - a.length);
  return (line) => {
    let s = String(line);
    for (const v of list) s = s.split(v).join('…');
    return mask(s);
  };
}

async function smokeLive() {
  const local = process.argv.includes('--local');
  if (process.env[FLAG] !== undefined) {
    console.error(`${FLAG} is already set in this shell — it belongs to the smoke child's environment only; clear it and run again`);
    process.exitCode = 2;
    return;
  }
  const cfg = local ? localSettings() : settings();
  if (!cfg) {
    console.error('--local needs the PG_* keys of the embedded cluster (127.0.0.1, its own port, no TLS) in this environment');
    process.exitCode = 2;
    return;
  }
  const health = await fetch(`${LIVE.api}/api/health`, { signal: AbortSignal.timeout(10000) })
    .then(async (r) => ({ status: r.status, db: (await r.json().catch(() => ({}))).db }))
    .catch(() => null);
  if (!health || health.status !== 200 || health.db !== 'ok') {
    console.error(`nothing answers ${LIVE.api}/api/health with db ok (${health ? `status ${health.status}` : 'no answer'}) — start the API first`);
    process.exitCode = 1;
    return;
  }
  const web = await fetch(LIVE.app, { signal: AbortSignal.timeout(10000) }).then((r) => r.status).catch(() => null);
  if (web !== 200) {
    console.error(`nothing answers ${LIVE.app} (${web === null ? 'no answer' : `status ${web}`}) — start the web first`);
    process.exitCode = 1;
    return;
  }
  const cli = path.join(CLIENT, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(cli)) throw new Error('client/node_modules has no @playwright/test');

  const pw = seededPasswords();
  const ids = await smokeLoginIds(cfg);
  const mask = withSecrets(makeMask(cfg), [...Object.values(pw), ...Object.values(ids)]);
  console.log(`smoke-live: API ${LIVE.api} (health: db ok), web ${LIVE.app}; database: ${local ? 'the embedded local cluster' : 'the Supabase project, verify-full'}`);

  const before = await smokeCounts(cfg);
  console.log(`counts BEFORE (read-only): ${JSON.stringify(before)}`);
  const childEnv = {
    ...(local ? process.env : stagingPgEnv(cfg)),
    E2E_APP_ORIGIN: LIVE.app,
    E2E_API_ORIGIN: LIVE.api,
    E2E_ADMIN_ID: ids.admin,
    E2E_ADMIN_PW: pw.admin,
    E2E_TEACHER_ID: ids.teacher,
    E2E_TEACHER_PW: pw.teacher,
    E2E_PARENT_ID: ids.parent,
    E2E_PARENT_PW: pw.parent,
    E2E_TEACHER2_ID: ids.teacher2,
    E2E_TEACHER2_PW: pw.teacher,
    E2E_PARENT2_ID: ids.parent2,
    E2E_PARENT2_PW: pw.parent,
    [FLAG]: FLAG_VALUE,
  };
  console.log(`flag: ${FLAG} is in the smoke child's environment only; this process: ${process.env[FLAG] === undefined ? 'absent' : 'PRESENT'}`);
  // Anything after `--` goes to Playwright as it is (e.g. -g to run one test).
  const dashes = process.argv.indexOf('--');
  const extra = dashes > 0 ? process.argv.slice(dashes + 1) : [];
  const child = spawn(process.execPath, [cli, 'test', '--config', path.join(CLIENT, 'playwright.config.js'), ...extra], {
    cwd: CLIENT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pipeMasked(child, mask);
  const code = await new Promise((resolve) => child.on('close', (c) => resolve(c === null ? 1 : c)));
  const after = await smokeCounts(cfg);
  console.log(`counts AFTER (read-only, after the smoke's teardown): ${JSON.stringify(after)}`);
  const match = JSON.stringify(before.byRole) === JSON.stringify(after.byRole);
  const delta = Object.fromEntries(Object.keys(after.info).map((k) => [k, after.info[k] - before.info[k]]));
  console.log(`counts by role ${match ? 'MATCH' : 'DIFFER'}; what the smoke added by design: ${JSON.stringify(delta)}`);
  console.log(`flag after the run: this process ${process.env[FLAG] === undefined ? 'absent' : 'PRESENT'}`);
  console.log(`smoke exit ${code}`);
  process.exitCode = code === 0 && match && process.env[FLAG] === undefined ? 0 : 1;
}

async function main() {
  if (process.argv.includes('--local') && !process.argv.includes('--smoke-live')) {
    console.error('--local goes with --smoke-live only');
    process.exitCode = 2;
    return undefined;
  }
  if (process.argv.includes('--smoke-live')) return smokeLive();
  const cfg = settings();
  const scrub = makeScrub(cfg);
  const mask = makeMask(cfg);
  if (process.argv.includes('--smoke')) return smoke(cfg, mask);
  const facts = await preflight(cfg);
  // The facts are catalog names, booleans, counts and timings by
  // construction; the scrub still runs over them.
  console.log(scrub(`staging-api preflight: ${JSON.stringify(facts, null, 2)}`));
  if (process.argv.includes('--check')) return;

  const childEnv = Object.assign(stagingPgEnv(cfg), {
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    PORT,
    CORS_ORIGIN: ORIGIN,
    MAIL_TRANSPORT: 'file',
    SMS_TRANSPORT: 'file',
    NODE_ENV: 'development',
  });
  const child = spawn(process.execPath, ['server.js'], { cwd: SERVER, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  pipeMasked(child, mask);
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('close', (code, signal) => {
    console.log(`staging-api: the API exited ${code === null ? signal : code}`);
    process.exitCode = code === null ? 1 : code;
  });
}

main().catch((e) => {
  const msg = e && e.message ? e.message : String(e);
  console.error(`staging-api failed: ${e && e.code ? `${e.code} ` : ''}${msg.replace(/postgres(?:ql)?:\/\/\S+/gi, '<connection string>').replace(/[\w-]+\.pooler\.supabase\.com/gi, '<host>')}`);
  process.exit(1);
});
