#!/usr/bin/env node
// P4 PART B — THE ISOLATION PREFLIGHT (D-261, the plan's section C). Run it
// before anything else; a refusal, or a control that does not behave as
// designed, is a STOP before any suite runs (the owner's change B).
//
//   node scripts/p4b-preflight.js               the checks, then the target's identity
//   node scripts/p4b-preflight.js --controls    the negative controls, each in its own child
//   node scripts/p4b-preflight.js --drop <db>…  teardown: drop this run's databases, only those
//
// The checks (lib/p4b.js isolationProblems, then here):
//   * the worktree holds no server/.env, client/e2e/.env.e2e or mobile/.env
//     (existence only; nothing is opened);
//   * MIGRATION_APP_TREE is this worktree and MIGRATION_SOURCE_ENV names a file
//     that does not exist, so lib/paths.js cannot resolve to the MAIN checkout's
//     server/.env or server/backups (it does, from a sibling worktree, when the
//     two are unset);
//   * PG_HOST is loopback, PG_PORT the local cluster's, PG_DATABASE one of this
//     run's two, API_BASE the 5010 API, no TLS setting, no hosted flag, no
//     mail / SMS / database credential, mail and SMS on the file transports;
//   * p4b-net-guard.js is loaded, inherited, and live: a socket to TEST-NET-1
//     and one to 127.0.0.1:5000 both throw before connecting;
//   * nothing listens on 5000 or 3000 (the main checkout's dev servers);
//   * the server answering is 127.0.0.1:54329 without TLS, and the API's own
//     runtime role lands in this run's database.
// Prints names, codes and booleans; never a value.
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../lib/p4b');

const SELF = __filename;

function refuse(codes) {
  h.say(`REFUSED: ${codes.join(' ')}`);
  process.exit(2);
}

async function identity() {
  const out = { server: null, database: null, roles: {} };
  const sup = await h.superClient('postgres', 'p4b-preflight');
  try {
    const { rows } = await sup.query(
      `SELECT host(inet_server_addr()) AS addr, inet_server_port() AS port,
              current_setting('server_version') AS version,
              (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()) AS ssl,
              EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1) AS db_exists`,
      [process.env.PG_DATABASE]
    );
    out.server = rows[0];
  } finally {
    await sup.end();
  }
  const db = h.serverDb();
  const { Client } = h.serverModule('node_modules', 'pg');
  for (const which of ['runtime', 'migrate']) {
    const settings = db.settings(which);
    const target = out.server.db_exists ? settings.database : 'postgres';
    const c = new Client({ ...settings, database: target, application_name: 'p4b-preflight' });
    c.on('error', () => {});
    try {
      await c.connect();
      const { rows } = await c.query(
        `SELECT current_database() AS db, current_user AS role, host(inet_server_addr()) AS addr, inet_server_port() AS port,
                (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()) AS ssl`
      );
      out.roles[which] = { ok: true, ...rows[0] };
    } catch (error) {
      out.roles[which] = { ok: false, code: String(error.code || 'error') };
    } finally {
      await c.end().catch(() => {});
    }
  }
  db.end && (await db.end().catch(() => {}));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === '--probe-guard') {
    // for the controls: this process's guard, as JSON
    process.stdout.write(`${JSON.stringify(h.guardLive())}\n`);
    return;
  }

  if (argv[0] === '--drop') {
    h.assertIsolation({ requireDatabase: false });
    const names = argv.slice(1);
    if (!names.length || !names.every((n) => h.ALLOWED_DB.test(n))) refuse(['DROP_NOT_THIS_RUN']);
    const sup = await h.superClient('postgres', 'p4b-preflight');
    try {
      for (const name of names) {
        const { rows } = await sup.query('SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname = $1', [name]);
        if (rows[0].n) {
          h.say(`REFUSED: DROP_IN_USE ${name} (${rows[0].n} connection(s))`);
          process.exitCode = 2;
          continue;
        }
        const { rows: exists } = await sup.query('SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1', [name]);
        if (!exists.length) {
          h.say(`absent: ${name}`);
          continue;
        }
        await sup.query(`DROP DATABASE ${h.quoteIdent(name)}`);
        const { rows: after } = await sup.query('SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1', [name]);
        h.say(`${after.length ? 'STILL PRESENT' : 'dropped'}: ${name}`);
        if (after.length) process.exitCode = 1;
      }
    } finally {
      await sup.end();
    }
    return;
  }

  if (argv[0] === '--controls') {
    await controls();
    return;
  }

  const rootAt = argv.indexOf('--root');
  const root = rootAt >= 0 ? path.resolve(argv[rootAt + 1]) : h.ROOT;

  // 1. everything that needs no connection
  const problems = h.isolationProblems({ root });
  if (problems.length) {
    h.say(`REFUSED: ${[...new Set(problems.map((p) => p.code))].join(' ')}`);
    for (const p of problems) h.say(`  ${p.code}: ${p.detail}`);
    process.exit(2);
  }
  // 2. the guard, live in this process
  const guard = h.guardLive();
  h.say(`guard: non-loopback refused ${guard.nonLoopbackRefused ? 'yes' : 'no'}, port 5000 refused ${guard.devPortRefused ? 'yes' : 'no'}`);
  if (!guard.nonLoopbackRefused || !guard.devPortRefused) refuse(['GUARD_NOT_LIVE']);
  // 3. the main checkout's dev servers are not running
  const ports = { 5000: await h.probePort(5000), 3000: await h.probePort(3000) };
  h.say(`ports: 5000 ${ports[5000]}, 3000 ${ports[3000]}`);
  if (ports[5000] !== 'closed' || ports[3000] !== 'closed') refuse(['DEV_PORT_OPEN']);
  // 4. who answers
  const id = await identity();
  const s = id.server;
  h.say(`server: ${s.addr}:${s.port}, PostgreSQL ${s.version}, TLS ${s.ssl ? 'on' : 'off'}`);
  h.say(`database ${process.env.PG_DATABASE}: ${s.db_exists ? 'exists' : 'not created yet (db:setup creates it)'}`);
  for (const [which, r] of Object.entries(id.roles)) {
    h.say(r.ok ? `role ${which}: ${r.role} in ${r.db} at ${r.addr}:${r.port}, TLS ${r.ssl ? 'on' : 'off'}` : `role ${which}: FAILED ${r.code}`);
  }
  const bad = [];
  if (!h.LOOPBACK.has(String(s.addr)) || Number(s.port) !== h.LOCAL_PG.port || s.ssl) bad.push('SERVER_NOT_LOCAL');
  for (const r of Object.values(id.roles)) {
    if (!r.ok) bad.push('ROLE_LOGIN_FAILED');
    else if (!h.LOOPBACK.has(String(r.addr)) || Number(r.port) !== h.LOCAL_PG.port || r.ssl) bad.push('ROLE_NOT_LOCAL');
    else if (s.db_exists && r.db !== process.env.PG_DATABASE) bad.push('ROLE_WRONG_DATABASE');
  }
  if (bad.length) refuse([...new Set(bad)]);
  h.say('PREFLIGHT OK');
}

// ---------------------------------------------------------------------------
// the negative controls: each must be refused, for its own reason
// ---------------------------------------------------------------------------
function child(args, envChanges, { dropGuard = false } = {}) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(envChanges)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  if (dropGuard) delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SELF, ...args], { env, encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: String(r.stdout || '') };
}

async function controls() {
  const checks = h.makeChecks('preflight-controls');
  const mainTree = path.resolve(h.ROOT, '..', 'Parents_Portal');

  // n1 / n7: the guard, live in a child that inherits it — and absent from one that does not
  const guarded = child(['--probe-guard'], {});
  let g = {};
  try {
    g = JSON.parse(guarded.out.trim().split(/\r?\n/).pop());
  } catch {
    g = {};
  }
  checks.check('n1 a socket to TEST-NET-1 (192.0.2.1:5432) is refused by the guard before connecting', g.nonLoopbackRefused === true, g);
  checks.check('n7 a socket to 127.0.0.1:5000 (the main checkout API port) is refused by the guard', g.devPortRefused === true, g);
  const unguarded = child(['--probe-guard'], {}, { dropGuard: true });
  let u = {};
  try {
    u = JSON.parse(unguarded.out.trim().split(/\r?\n/).pop());
  } catch {
    u = {};
  }
  checks.check('control: without the preload neither socket is refused (the probe can fail)', u.nonLoopbackRefused === false && u.devPortRefused === false, u);

  const cases = [
    ['n2 PG_HOST on a non-loopback address (TEST-NET-1), guard absent: refused before any connection', { PG_HOST: '192.0.2.1' }, 'HOST_NOT_LOOPBACK', [], true],
    ['n3 PG_DATABASE = the suites\' shared parents_portal_pg', { PG_DATABASE: 'parents_portal_pg' }, 'DATABASE_NOT_DISPOSABLE'],
    ['n3 PG_DATABASE = postgres', { PG_DATABASE: 'postgres' }, 'DATABASE_NOT_DISPOSABLE'],
    ['n4 PG_PORT = 5432', { PG_PORT: '5432' }, 'PORT_NOT_LOCAL'],
    ['n5 the root pointed at the MAIN checkout: its server/.env exists (checked, never opened)', {}, 'ENV_FILE_PRESENT', ['--root', mainTree]],
    ['n6 MIGRATION_APP_TREE unset: lib/paths.js would resolve to the main checkout', { MIGRATION_APP_TREE: undefined }, 'APP_TREE_UNSET'],
    ['n6 MIGRATION_SOURCE_ENV unset', { MIGRATION_SOURCE_ENV: undefined }, 'SOURCE_ENV_UNSET'],
    ['n8 PORTAL_FIXTURE_HOSTED set', { PORTAL_FIXTURE_HOSTED: 'staging-smoke' }, 'HOSTED_FLAG_SET'],
    ['n9 API_BASE on 5000', { API_BASE: 'http://127.0.0.1:5000' }, 'API_BASE_NOT_LOCAL'],
    ['n10 MAIL_TRANSPORT not file', { MAIL_TRANSPORT: 'smtp' }, 'MAIL_NOT_FILE'],
    ['n11 a mail credential key set (dummy value)', { SMTP_PASS: 'p4b-dummy' }, 'CREDENTIAL_ENV_SET'],
    ['n12 PG_SSL = require', { PG_SSL: 'require' }, 'TLS_SET'],
  ];
  for (const [label, changes, code, args = [], dropGuard = false] of cases) {
    const r = child(args, changes, { dropGuard });
    checks.check(label, r.code === 2 && new RegExp(`\\b${code}\\b`).test(r.out) && !/PREFLIGHT OK/.test(r.out), `exit ${r.code}`);
  }

  // and the unchanged environment passes, so each refusal above is its change's
  const ok = child([], {});
  checks.check('control: the unchanged environment passes the preflight', ok.code === 0 && /PREFLIGHT OK/.test(ok.out), `exit ${ok.code}`);

  const s = checks.summary();
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`preflight error: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
