// P4 PART B — the shared harness (D-167, the plan approved as D-261).
//
// Josh's Part B: "Use a separate, disposable local PostgreSQL database ...
// Verify successful and failed operations through independent database
// observations. Ensure the local test environment cannot connect to
// production credentials or endpoints."
//
// What lives here, used by every p4b-*.js script:
//
//   ISOLATION   isolationProblems() / assertIsolation(): the run's refusal,
//               checked before anything connects. The worktree must hold no
//               .env, the migration paths must resolve inside it (lib/paths.js
//               otherwise points a sibling worktree at the MAIN checkout's
//               server/.env), the database must be one of this run's two
//               disposable ones on the loopback cluster, mail and SMS must be
//               file transports, no credential or hosted flag may be set, and
//               p4b-net-guard.js must be loaded and inherited.
//   OBSERVER    observe(): a READ ONLY transaction on its OWN connection, as
//               the cluster's superuser, never the API's pool. Per table the
//               row count and a content hash; every identity sequence against
//               its table's highest id; the session cutoff row; the sessions
//               of the database by state; the backup files on disk. Counts,
//               booleans and 16-hex hashes only: no row, no value.
//   FIXTURES    run-made accounts and learners with run-made passwords and
//               LRNs, held in memory and never printed; the seeded sign-ins
//               are not used.
//   API         spawnApi(): server/server.js in a child, refused unless the
//               database is this run's and the port is 5010 or 5030.
//   RELAY       makeRelay(): a TCP relay in front of the cluster that can cut
//               every connection, refuse new ones, and drop the reply to the
//               next COMMIT.
//   ARCHIVES    read and rewrite a backup .zip in memory (yauzl / yazl).
//
// Nothing here prints an environment value, a password, a token, an LRN, a
// login id or an email. say() masks every line it prints.
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const P = require('./paths');
const { LOCAL_PG, localConfig } = require('./env');

const ROOT = path.resolve(P.REPO_ROOT);
const SERVER = path.join(ROOT, 'server');
const BACKUPS_DIR = path.join(SERVER, 'backups');
const serverModule = (...parts) => require(path.join(SERVER, ...parts));
const { Client } = serverModule('node_modules', 'pg');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const ALLOWED_DB = /^parents_portal_p4b(_reconstruct)?$/;
const API_PORTS = new Set([5010, 5030]);
const API_BASE_RE = /^http:\/\/(127\.0\.0\.1|localhost):5010$/;
const CREDENTIAL_KEYS = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMS_GATEWAY_URL',
  'SMS_GATEWAY_USER',
  'SMS_GATEWAY_PASS',
  'SMS_ENCRYPTION_PASSPHRASE',
  'DATABASE_URL',
];
const HOSTED_FLAGS = ['PORTAL_FIXTURE_HOSTED', 'PORTAL_DEMO_HOSTED', 'PORTAL_ACTIVITY_RESET'];
const ENV_FILES = [path.join('server', '.env'), path.join('client', 'e2e', '.env.e2e'), path.join('mobile', '.env')];

// ---------------------------------------------------------------------------
// printing — every line masked
// ---------------------------------------------------------------------------
function mask(text) {
  let s = String(text);
  for (const secret of [LOCAL_PG.password, process.env.JWT_SECRET, process.env.PG_PASSWORD, process.env.PG_MIGRATE_PASSWORD]) {
    if (secret && String(secret).length >= 4) s = s.split(String(secret)).join('…');
  }
  return s
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '…jwt…')
    .replace(/[^\s'"<>(),]+@[^\s'"<>(),]+/g, '…@…')
    .replace(/\b\d{7,}\b/g, '…')
    .replace(/\bP4B-[AT]-[0-9a-f]+\b/g, 'P4B-…')
    .replace(/\bTCH-[A-Z0-9]+\b/g, 'TCH-…')
    .replace(/\bADMIN\d+\b/g, 'ADMIN…');
}

function say(text = '') {
  process.stdout.write(`${mask(text)}\n`);
}

function makeChecks(name) {
  let passed = 0;
  let failed = 0;
  const results = [];
  return {
    check(label, condition, detail) {
      const ok = Boolean(condition);
      if (ok) passed += 1;
      else failed += 1;
      results.push({ label, ok });
      say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
      return ok;
    },
    note(label, value) {
      results.push({ label, note: value });
      say(`  info  ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    },
    get failed() {
      return failed;
    },
    results,
    summary() {
      say(`P4B ${name} ${failed ? 'FAIL' : 'OK'} ${passed}/${passed + failed}`);
      return { name, passed, failed, results };
    },
  };
}

// ---------------------------------------------------------------------------
// isolation
// ---------------------------------------------------------------------------
function isolationProblems({ root = ROOT, env = process.env, requireDatabase = true } = {}) {
  const problems = [];
  const add = (code, detail) => problems.push({ code, detail });
  for (const rel of ENV_FILES) {
    if (fs.existsSync(path.join(root, rel))) add('ENV_FILE_PRESENT', rel);
  }
  if (!env.MIGRATION_APP_TREE) add('APP_TREE_UNSET', 'MIGRATION_APP_TREE');
  else if (path.resolve(env.MIGRATION_APP_TREE).toLowerCase() !== path.resolve(root).toLowerCase()) add('APP_TREE_NOT_ROOT', 'MIGRATION_APP_TREE');
  if (path.resolve(P.APP_TREE).toLowerCase() !== path.resolve(root).toLowerCase()) add('APP_TREE_NOT_ROOT', 'lib/paths.js APP_TREE');
  if (!path.resolve(P.APP_BACKUPS_DIR).toLowerCase().startsWith(path.resolve(root).toLowerCase())) add('BACKUPS_DIR_OUTSIDE', 'lib/paths.js APP_BACKUPS_DIR');
  if (!env.MIGRATION_SOURCE_ENV) add('SOURCE_ENV_UNSET', 'MIGRATION_SOURCE_ENV');
  if (fs.existsSync(P.SOURCE_ENV_FILE)) add('SOURCE_ENV_EXISTS', 'lib/paths.js SOURCE_ENV_FILE');
  if (!LOOPBACK.has(String(env.PG_HOST || ''))) add('HOST_NOT_LOOPBACK', 'PG_HOST');
  if (Number(env.PG_PORT) !== LOCAL_PG.port) add('PORT_NOT_LOCAL', 'PG_PORT');
  if (requireDatabase && !ALLOWED_DB.test(String(env.PG_DATABASE || ''))) add('DATABASE_NOT_DISPOSABLE', 'PG_DATABASE');
  if (env.PORT !== undefined && !API_PORTS.has(Number(env.PORT))) add('API_PORT', 'PORT');
  if (!API_BASE_RE.test(String(env.API_BASE || ''))) add('API_BASE_NOT_LOCAL', 'API_BASE');
  if (env.PG_SSL !== undefined && String(env.PG_SSL).toLowerCase() !== 'disable') add('TLS_SET', 'PG_SSL');
  if (env.PG_CA_FILE !== undefined) add('TLS_SET', 'PG_CA_FILE');
  const hosted = HOSTED_FLAGS.filter((k) => env[k] !== undefined);
  if (hosted.length) add('HOSTED_FLAG_SET', hosted.join(','));
  if (env.MAIL_TRANSPORT !== 'file') add('MAIL_NOT_FILE', 'MAIL_TRANSPORT');
  if (env.SMS_TRANSPORT !== 'file') add('SMS_NOT_FILE', 'SMS_TRANSPORT');
  const creds = CREDENTIAL_KEYS.filter((k) => env[k] !== undefined);
  if (creds.length) add('CREDENTIAL_ENV_SET', creds.join(','));
  if (!net[Symbol.for('p4b.netGuard')]) add('GUARD_NOT_LOADED', 'p4b-net-guard.js');
  if (!/p4b-net-guard\.js/.test(String(env.NODE_OPTIONS || ''))) add('GUARD_NOT_INHERITED', 'NODE_OPTIONS');
  return problems;
}

function assertIsolation(options) {
  const problems = isolationProblems(options);
  if (problems.length) {
    say(`REFUSED: ${[...new Set(problems.map((p) => p.code))].join(' ')}`);
    for (const p of problems) say(`  ${p.code}: ${p.detail}`);
    process.exit(2);
  }
}

// The guard, proved live in THIS process: a socket to TEST-NET-1 (RFC 5737:
// routes nowhere, so even an unguarded attempt is inert) and one to the main
// checkout's API port must both throw before connecting.
function guardLive() {
  const attempt = (port, host) => {
    try {
      const s = net.connect(port, host);
      s.on('error', () => {});
      s.destroy();
      return { refused: false, message: '' };
    } catch (error) {
      return { refused: true, message: String(error && error.message) };
    }
  };
  const off = attempt(5432, '192.0.2.1');
  const dev = attempt(5000, '127.0.0.1');
  return {
    nonLoopbackRefused: off.refused && /loopback guard/.test(off.message),
    devPortRefused: dev.refused && /p4b net guard/.test(dev.message),
  };
}

// Is something listening on a loopback port? Probed through the layer UNDER
// the deny-list (still loopback-guarded), so 5000 and 3000 can be checked.
function probePort(port) {
  const g = net[Symbol.for('p4b.netGuard')];
  const connect = g ? g.inner : net.Socket.prototype.connect;
  return new Promise((resolve) => {
    const s = new net.Socket();
    const timer = setTimeout(() => {
      s.destroy();
      resolve('timeout');
    }, 2000);
    s.once('connect', () => {
      clearTimeout(timer);
      s.destroy();
      resolve('open');
    });
    s.once('error', (error) => {
      clearTimeout(timer);
      resolve(error.code === 'ECONNREFUSED' ? 'closed' : String(error.code || 'error'));
    });
    connect.call(s, { port, host: '127.0.0.1' });
  });
}

// ---------------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------------
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function superClient(database = process.env.PG_DATABASE, applicationName = 'p4b-observer') {
  if (database !== 'postgres' && !ALLOWED_DB.test(String(database || ''))) {
    throw new Error('superClient: the database is not one of this run\'s');
  }
  const cfg = localConfig();
  if (!LOOPBACK.has(cfg.host) || cfg.port !== LOCAL_PG.port) throw new Error('superClient: not the loopback cluster');
  const c = new Client({ ...cfg, database, application_name: applicationName });
  c.on('error', () => {});
  await c.connect();
  return c;
}

// The API's own runtime / migrate settings, as server/config/db.js builds them.
function serverDb() {
  return serverModule('config', 'db.js');
}

// ---------------------------------------------------------------------------
// the observer
// ---------------------------------------------------------------------------
async function tableNames(c) {
  const { rows } = await c.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind IN ('r', 'p') ORDER BY c.relname`
  );
  return rows.map((r) => r.name);
}

async function sequenceState(c) {
  const { rows } = await c.query(
    `SELECT c.table_name AS t, c.column_name AS col,
            pg_catalog.pg_get_serial_sequence(pg_catalog.format('portal.%I', c.table_name), c.column_name) AS seq
       FROM information_schema.columns c
      WHERE c.table_schema = 'portal' AND c.is_identity = 'YES'
      ORDER BY c.table_name`
  );
  const out = [];
  for (const r of rows) {
    const { rows: s } = await c.query(`SELECT last_value::bigint AS v, is_called FROM ${r.seq}`);
    const { rows: m } = await c.query(`SELECT max(${quoteIdent(r.col)})::bigint AS m FROM portal.${quoteIdent(r.t)}`);
    const next = s[0].is_called ? Number(s[0].v) + 1 : Number(s[0].v);
    out.push({ table: r.t, next, max: m[0].m === null ? null : Number(m[0].m) });
  }
  return out;
}

async function sessionState(c) {
  const { rows } = await c.query(
    `SELECT coalesce(application_name, '') AS app, coalesce(state, '') AS state, coalesce(wait_event_type, '') AS wait, count(*)::int AS n
       FROM pg_catalog.pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_catalog.pg_backend_pid() AND backend_type = 'client backend'
      GROUP BY 1, 2, 3`
  );
  const { rows: prepared } = await c.query(
    'SELECT count(*)::int AS n FROM pg_catalog.pg_prepared_xacts WHERE database = current_database()'
  );
  const { rows: ungranted } = await c.query(
    `SELECT count(*)::int AS n FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_database d ON d.oid = l.database
      WHERE NOT l.granted AND d.datname = current_database()`
  );
  const byApp = {};
  let total = 0;
  let idleInTx = 0;
  let waitingLock = 0;
  for (const r of rows) {
    total += r.n;
    byApp[r.app || '(none)'] = (byApp[r.app || '(none)'] || 0) + r.n;
    if (/^idle in transaction/.test(r.state)) idleInTx += r.n;
    if (r.wait === 'Lock') waitingLock += r.n;
  }
  return { total, idleInTx, waitingLock, byApp, prepared: prepared[0].n, ungranted: ungranted[0].n };
}

function backupFiles() {
  const names = fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR) : [];
  return {
    zip: names.filter((n) => n.endsWith('.zip')).sort(),
    partial: names.filter((n) => n.endsWith('.partial')).length,
    sql: names.filter((n) => n.endsWith('.sql')).length,
  };
}

async function observe(c, label = '') {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const tables = {};
    for (const t of await tableNames(c)) {
      const { rows } = await c.query(
        `SELECT count(*)::bigint AS n, md5(coalesce(string_agg(md5(x::text), ',' ORDER BY md5(x::text)), '')) AS h
           FROM portal.${quoteIdent(t)} x`
      );
      tables[t] = { n: Number(rows[0].n), h: rows[0].h.slice(0, 16) };
    }
    const sequences = await sequenceState(c);
    const { rows: cut } = await c.query(
      'SELECT count(*)::int AS n, max(extract(epoch FROM token_valid_after))::bigint AS at FROM portal.auth_security_state'
    );
    const { rows: db } = await c.query('SELECT current_database() AS d');
    await c.query('COMMIT');
    const sessions = await sessionState(c);
    return {
      label,
      at: new Date().toISOString(),
      database: db[0].d,
      tables,
      sequences,
      cutoff: { rows: cut[0].n, at: cut[0].at === null ? null : Number(cut[0].at) },
      sessions,
      files: backupFiles(),
    };
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

function changedTables(a, b) {
  const names = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)]);
  return [...names].filter((t) => !a.tables[t] || !b.tables[t] || a.tables[t].n !== b.tables[t].n || a.tables[t].h !== b.tables[t].h).sort();
}

// Tables that changed although they were not expected to.
function unexpectedChanges(a, b, allowed = []) {
  const ok = new Set(allowed);
  return changedTables(a, b).filter((t) => !ok.has(t));
}

// Every sequence ahead of its table's highest id; with a baseline, none moved
// backwards since it.
function sequenceViolations(snap, baseline = null) {
  const out = [];
  const before = baseline ? new Map(baseline.sequences.map((s) => [s.table, s.next])) : null;
  for (const s of snap.sequences) {
    if (s.max !== null && s.next <= s.max) out.push({ table: s.table, problem: 'BEHIND_MAX' });
    if (before && before.has(s.table) && s.next < before.get(s.table)) out.push({ table: s.table, problem: 'BACKWARDS' });
  }
  return out;
}

function nextValue(snap, table) {
  const s = snap.sequences.find((x) => x.table === table);
  return s ? s.next : null;
}

function writeReport(name, data) {
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const file = path.join(P.REHEARSAL_DIR, `p4b_${name}_${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  return file;
}

// ---------------------------------------------------------------------------
// fixtures — run-made accounts and learners, nothing seeded
// ---------------------------------------------------------------------------
function runLrn() {
  // 12 digits, starting 9; never printed (say() masks any run of 7+ digits)
  let s = '9';
  while (s.length < 12) s += String(crypto.randomInt(0, 10));
  return s;
}

async function schoolYear(c) {
  const { rows } = await c.query("SELECT setting_value AS v FROM portal.system_settings WHERE setting_key = 'academic_year'");
  if (!rows.length) throw new Error('no academic_year setting');
  return rows[0].v;
}

async function makeLearner(c, { gradeLevel, section, sectionId, last = 'Fixture' }) {
  const lrn = runLrn();
  const { rows } = await c.query(
    `INSERT INTO portal.students (lrn, first_name, last_name, grade_level, section, section_id, status)
     VALUES ($1, 'Pfour', $2, $3, $4, $5, 'active') RETURNING id`,
    [lrn, `B${last}`, gradeLevel, section, sectionId]
  );
  return { id: rows[0].id, lrn };
}

// An account that passes all three gates: both CURRENT documents accepted, a
// confirmed address, no forced change. The password exists only in memory.
async function makeAccount(c, { role, name, studentId = null, login = null }) {
  const bcrypt = serverModule('node_modules', 'bcryptjs');
  const policy = serverModule('utils', 'policy.js');
  const tag = crypto.randomBytes(4).toString('hex');
  const loginId = login || `P4B-${role === 'admin' ? 'A' : 'T'}-${tag}`;
  const password = crypto.randomBytes(18).toString('base64url');
  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await c.query(
    `INSERT INTO portal.users (login_id, password, role, status, name, email, email_verified_at, must_change_password, student_id)
     VALUES ($1, $2, $3, 'active', $4, $5, portal.now_s() - interval '1 day', 0, $6) RETURNING id`,
    [loginId, hash, role, name, `p4b-${tag}@example.invalid`, studentId]
  );
  const id = rows[0].id;
  for (const d of policy.CURRENT) {
    await c.query(
      'INSERT INTO portal.policy_acceptances (user_id, document, version, student_id) VALUES ($1, $2, $3, $4)',
      [id, d.document, d.version, role === 'parent' ? studentId : null]
    );
  }
  return { id, login: loginId, password, role };
}

// A section of this grade level with no learners, for the school year: a class
// no seeded row and no other fixture touches. `skip` picks the next one.
async function emptySection(c, gradeLevel, year, skip = 0) {
  const { rows } = await c.query(
    `SELECT s.id, s.name FROM portal.sections s
      WHERE s.grade_level = $1 AND s.school_year = $2
        AND NOT EXISTS (SELECT 1 FROM portal.students st WHERE st.grade_level = s.grade_level AND st.section = s.name)
      ORDER BY s.id OFFSET $3 LIMIT 1`,
    [gradeLevel, year, skip]
  );
  if (!rows.length) throw new Error(`no empty Grade ${gradeLevel} section`);
  return { sectionId: rows[0].id, section: rows[0].name, gradeLevel };
}

async function subjectIds(c, gradeLevel) {
  const { rows } = await c.query('SELECT id FROM portal.subjects WHERE grade_level = $1 ORDER BY display_order NULLS LAST, id', [gradeLevel]);
  return rows.map((r) => r.id);
}

// One graded row per subject; returns the ids in subject order.
async function gradeAll(c, { studentId, subjects, term, year, value = 85, locked = 0 }) {
  const ids = [];
  for (const subjectId of subjects) {
    const { rows } = await c.query(
      `INSERT INTO portal.grades (student_id, subject_id, term, school_year, initial_grade, term_grade, is_locked)
       VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id`,
      [studentId, subjectId, term, year, value, locked]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

// The first class day of the school year (a weekday inside a term).
function firstClassDay() {
  const { isClassDay } = serverModule('utils', 'excuseAttendance.js');
  const d = new Date(Date.UTC(2026, 5, 1));
  for (let i = 0; i < 120; i += 1) {
    const s = d.toISOString().slice(0, 10);
    if (isClassDay(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error('no class day found');
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function call(base, method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const started = Date.now();
  try {
    const res = await fetch(`${base}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: res.status, data, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, data: null, ms: Date.now() - started, error: String((error && error.cause && error.cause.code) || (error && error.code) || 'fetch') };
  }
}

async function signIn(base, account) {
  const r = await call(base, 'POST', '/api/auth/login', { body: { login_id: account.login, password: account.password } });
  if (r.status !== 200 || !r.data || !r.data.token) throw new Error(`sign-in refused (${r.status})`);
  return r.data.token;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const started = Date.now();
  for (;;) {
    let value;
    try {
      value = await predicate();
    } catch {
      value = false;
    }
    if (value) return { ok: true, ms: Date.now() - started, value };
    if (Date.now() - started > timeoutMs) return { ok: false, ms: Date.now() - started };
    await sleep(intervalMs);
  }
}

// Sessions of the API waiting on a lock, by application name.
async function waitingOnLock(c, app = 'parents-portal-api') {
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity
      WHERE datname = current_database() AND application_name = $1 AND wait_event_type = 'Lock'`,
    [app]
  );
  return rows[0].n;
}

// ---------------------------------------------------------------------------
// the API in a child process
// ---------------------------------------------------------------------------
function spawnApi({ port = 5010, pgPort = LOCAL_PG.port, env: extra = {} } = {}) {
  const env = { ...process.env, ...extra, PORT: String(port), PG_PORT: String(pgPort) };
  if (!API_PORTS.has(port)) throw new Error('spawnApi: the API port must be 5010 or 5030');
  if (!LOOPBACK.has(String(env.PG_HOST))) throw new Error('spawnApi: PG_HOST is not loopback');
  if (!ALLOWED_DB.test(String(env.PG_DATABASE || ''))) throw new Error('spawnApi: not this run\'s database');
  if (!/p4b-net-guard\.js/.test(String(env.NODE_OPTIONS || ''))) throw new Error('spawnApi: the guard is not inherited');
  const child = spawn(process.execPath, [path.join(SERVER, 'server.js')], { cwd: SERVER, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tail = [];
  const take = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line) tail.push(mask(line).slice(0, 300));
    while (tail.length > 40) tail.shift();
  };
  let listening = false;
  child.stdout.on('data', (d) => {
    if (/listening/.test(String(d))) listening = true;
    take(d);
  });
  child.stderr.on('data', take);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  const ready = waitFor(() => listening, { timeoutMs: 20000, intervalMs: 100 });
  return { child, pid: child.pid, port, ready, exited, tail, alive: () => child.exitCode === null && child.signalCode === null };
}

async function killApi(api) {
  if (api.alive()) spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { encoding: 'utf8' });
  await Promise.race([api.exited, sleep(10000)]);
  await waitFor(async () => (await probePort(api.port)) === 'closed', { timeoutMs: 10000 });
}

// ---------------------------------------------------------------------------
// the relay
// ---------------------------------------------------------------------------
// A simple-query COMMIT: 'Q', a 4-byte length, "COMMIT", NUL.
function holdsCommit(chunk) {
  for (let i = chunk.indexOf(0x51); i >= 0 && i + 5 < chunk.length; i = chunk.indexOf(0x51, i + 1)) {
    const len = chunk.readUInt32BE(i + 1);
    const text = chunk.slice(i + 5, Math.min(chunk.length, i + 1 + len)).toString('utf8').replace(/\0$/, '');
    if (/^\s*COMMIT\s*;?\s*$/i.test(text)) return true;
  }
  return false;
}

function makeRelay(targetPort = LOCAL_PG.port) {
  const pairs = new Set();
  let mode = 'pass';
  let dropNextCommitReply = false;
  const stats = { accepted: 0, refused: 0, commitRepliesDropped: 0 };
  const server = net.createServer((sock) => {
    sock.on('error', () => {});
    if (mode === 'cut') {
      stats.refused += 1;
      sock.resetAndDestroy();
      return;
    }
    stats.accepted += 1;
    const up = net.connect(targetPort, '127.0.0.1');
    up.on('error', () => {});
    const pair = { sock, up, mute: false };
    pairs.add(pair);
    sock.on('data', (chunk) => {
      if (dropNextCommitReply && holdsCommit(chunk)) {
        dropNextCommitReply = false;
        pair.mute = true;
        stats.commitRepliesDropped += 1;
        up.write(chunk);
        setTimeout(() => {
          sock.resetAndDestroy();
          up.destroy();
        }, 500);
        return;
      }
      if (!pair.mute) up.write(chunk);
    });
    up.on('data', (chunk) => {
      if (!pair.mute) sock.write(chunk);
    });
    const end = () => {
      pairs.delete(pair);
      sock.destroy();
      up.destroy();
    };
    sock.on('close', end);
    up.on('close', end);
  });
  return {
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    cut() {
      mode = 'cut';
      for (const p of [...pairs]) {
        p.sock.resetAndDestroy();
        p.up.destroy();
      }
    },
    pass() {
      mode = 'pass';
    },
    armCommitDrop() {
      dropNextCommitReply = true;
    },
    stats,
    open: () => pairs.size,
    close: () =>
      new Promise((resolve) => {
        for (const p of [...pairs]) {
          p.sock.destroy();
          p.up.destroy();
        }
        server.close(() => resolve());
      }),
  };
}

// ---------------------------------------------------------------------------
// archives
// ---------------------------------------------------------------------------
async function readZip(file) {
  const yauzl = serverModule('node_modules', 'yauzl');
  const zip = await yauzl.openPromise(file, { autoClose: false });
  const entries = [];
  try {
    for await (const entry of zip.eachEntry()) {
      const chunks = [];
      for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk);
      entries.push([entry.fileName, Buffer.concat(chunks)]);
    }
  } finally {
    zip.close();
  }
  return entries;
}

function writeZip(file, entries) {
  const yazl = serverModule('node_modules', 'yazl');
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const out = fs.createWriteStream(file, { flags: 'wx' });
    out.on('close', resolve);
    out.on('error', reject);
    zip.outputStream.pipe(out);
    for (const [name, buffer] of entries) zip.addBuffer(buffer, name);
    zip.end();
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  ROOT,
  SERVER,
  BACKUPS_DIR,
  LOCAL_PG,
  LOOPBACK,
  ALLOWED_DB,
  mask,
  say,
  makeChecks,
  isolationProblems,
  assertIsolation,
  guardLive,
  probePort,
  quoteIdent,
  superClient,
  serverDb,
  serverModule,
  observe,
  changedTables,
  unexpectedChanges,
  sequenceViolations,
  nextValue,
  writeReport,
  runLrn,
  schoolYear,
  makeLearner,
  makeAccount,
  emptySection,
  subjectIds,
  gradeAll,
  firstClassDay,
  call,
  signIn,
  sleep,
  waitFor,
  waitingOnLock,
  spawnApi,
  killApi,
  makeRelay,
  holdsCommit,
  readZip,
  writeZip,
  sha256,
};
