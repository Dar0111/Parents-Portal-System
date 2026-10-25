#!/usr/bin/env node
// THE GOLDEN MASTER (Phase 3, commit 7 — the owner's Q7): the UNPORTED API
// (main at 5426b70, this branch's base) and the PORTED API answer the same
// requests over the same data, and their JSON is compared by PATH and TYPE
// only. No value is compared, kept or printed — a path's object keys are
// generalised wherever they could be data ({n}, {date}, {key}).
//
//   node scripts/golden-master.js fixtures --source-db <name|latest>
//       A few rows with populated DATE fields, into the MySQL SCRATCH only
//       (attendance, events, an excuse letter), for the seeded parent's
//       learner — the snapshot copies hold no non-null DATE (05 §3). Refuses
//       the application database (lib/mysql.js scratch()); idempotent.
//
//   node scripts/golden-master.js confirm-parent --source-db <name|latest>
//       The seeded parent's contact step, done the same way on BOTH sides —
//       the MySQL scratch and the local PostgreSQL copy transferred from it:
//       one `.invalid` address marked confirmed, so the parent's requests
//       reach their routes instead of both answering the contact gate's 403.
//       Nothing is sent; no other row changes.
//
//   node scripts/golden-master.js serve-mysql --source-db <name|latest> --app-dir <dir> [--port 5030]
//       Starts the unported API from <dir>/server (a `git archive` export
//       outside every tree) against the scratch, with file mail and file
//       SMS. The MySQL credentials come from the source .env in memory
//       (lib/env.js), never from a file of its own and never printed; its
//       dependencies resolve through NODE_PATH from this worktree's
//       server/node_modules (mysql2 is still installed there).
//
//   node scripts/golden-master.js compare --a <url> --b <url>
//       The seeded admin, teacher and parent sign in on both (their default
//       passwords read from server/scripts/setup-db.js at run time); each
//       request goes to A, then to the same path on B, in one fixed order, so
//       the two databases see the same writes. Ids a path needs are read
//       from A's answers (the data is the same transfer). Prints, per request,
//       the two statuses and the number of path/type differences, then each
//       difference as a path and its types. The full report (paths and types
//       only) goes to <DATA_DIR>/rehearsal/golden_<stamp>.json.
//
// "latest" is the newest parents_portal_migsrc_* database on the source
// server — what snapshot-source.js --restore-check made last.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { scratch, admin, sourceConfig } = require('../lib/mysql');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const FORBIDDEN_PORTS = new Set([5000, 3000, 5001, 3001, 5020, 54339, 5010]);
const MARKER = 'Golden master DATE fixture';
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function resolveSourceDb(name) {
  if (!name) throw new Error('--source-db <name|latest> is required.');
  if (name !== 'latest') {
    if (!/^parents_portal_migsrc_[0-9_]+$/.test(name)) throw new Error('--source-db must name a parents_portal_migsrc_* scratch database.');
    return name;
  }
  const conn = await admin();
  try {
    const [rows] = await conn.query("SHOW DATABASES LIKE 'parents\\_portal\\_migsrc\\_%'");
    const names = rows.map((r) => Object.values(r)[0]).sort();
    if (!names.length) throw new Error('No parents_portal_migsrc_* database exists; run snapshot-source.js --restore-check first.');
    return names[names.length - 1];
  } finally {
    await conn.end();
  }
}

// The seeded accounts and their default passwords, from setup-db.js — the
// one place they live. Never printed.
function seededAccounts() {
  const src = fs.readFileSync(path.join(P.SERVER_SRC_DIR, 'scripts', 'setup-db.js'), 'utf8');
  const passwords = {};
  for (const m of src.matchAll(/const (admin|teacher|parent)Hash = bcrypt\.hashSync\('([^']*)', 10\)/g)) passwords[m[1]] = m[2];
  const rows = [...src.matchAll(/\('([^']*)', '\$\{(admin|teacher|parent)Hash\}', '(admin|teacher|parent)', '([a-z]+)'/g)].map((m) => ({
    login: m[1],
    password: passwords[m[2]],
    role: m[3],
    status: m[4],
  }));
  const pick = (role) => rows.find((r) => r.role === role && r.status === 'active' && r.password);
  return { admin: pick('admin'), teacher: pick('teacher'), parent: pick('parent') };
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
async function fixtures() {
  const db = await resolveSourceDb(arg('--source-db'));
  const accounts = seededAccounts();
  const conn = await scratch(db);
  try {
    const idOf = async (login) => {
      const [rows] = await conn.query('SELECT id, student_id FROM users WHERE login_id = ? LIMIT 1', [login]);
      if (!rows.length) throw new Error('A seeded account is missing from the scratch.');
      return rows[0];
    };
    const adminRow = await idOf(accounts.admin.login);
    const teacherRow = await idOf(accounts.teacher.login);
    const parentRow = await idOf(accounts.parent.login);
    if (!parentRow.student_id) throw new Error('The seeded parent has no learner in the scratch.');
    // MySQL 8 CACHES information_schema.TABLES.AUTO_INCREMENT (the statistics
    // expiry, a day by default), and transfer.js reads its sequence values
    // there: after an insert the cached figure is stale and the transfer's
    // own guard refuses ("AUTO_INCREMENT is not above MAX(id)" — measured on
    // this scratch, Phase 3 commit 7). The three tables written here are
    // analysed afterwards, which refreshes the figure. Scratch only.
    const refresh = async () => {
      await conn.query('ANALYZE TABLE attendance, events, excuse_letters');
      console.log('statistics refreshed for the three fixture tables (ANALYZE TABLE, scratch only)');
    };
    const [[{ n: present }]] = await conn.query('SELECT COUNT(*) AS n FROM events WHERE title = ?', [MARKER]);
    if (present > 0) {
      console.log('fixtures already present in the scratch; nothing inserted');
      await refresh();
      return;
    }
    await conn.query('START TRANSACTION');
    const attendance = [
      ['2026-12-31', 'Present'],
      ['2027-01-04', 'Late'],
    ];
    for (const [date, status] of attendance) {
      await conn.query('INSERT INTO attendance (student_id, date, status, recorded_by) VALUES (?, ?, ?, ?)', [parentRow.student_id, date, status, teacherRow.id]);
    }
    for (const date of ['2026-12-31', '2027-01-01']) {
      await conn.query('INSERT INTO events (title, description, event_date, target_grade, posted_by) VALUES (?, ?, ?, NULL, ?)', [MARKER, 'the year boundary', date, adminRow.id]);
    }
    await conn.query("INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason, status) VALUES (?, ?, ?, ?, 'Pending')", [
      parentRow.student_id,
      parentRow.id,
      '2026-12-30',
      MARKER,
    ]);
    await conn.query('COMMIT');
    console.log('fixtures inserted into the scratch: attendance 2, events 2, excuse_letters 1 (every DATE populated)');
    await refresh();
  } finally {
    await conn.end();
  }
}

// ---------------------------------------------------------------------------
// confirm-parent
// ---------------------------------------------------------------------------
async function confirmParent() {
  const db = await resolveSourceDb(arg('--source-db'));
  const login = seededAccounts().parent.login;
  const address = 'golden-master-parent@example.invalid';
  const conn = await scratch(db);
  try {
    const [res] = await conn.query('UPDATE users SET email = ?, email_verified_at = NOW() WHERE login_id = ?', [address, login]);
    console.log(`MySQL scratch: ${res.affectedRows} account confirmed`);
  } finally {
    await conn.end();
  }
  const { localConfig } = require('../lib/env');
  const { client } = require('../lib/pg');
  const c = await client(localConfig());
  try {
    const r = await c.query('UPDATE portal.users SET email = $1, email_verified_at = portal.now_s() WHERE login_id = $2', [address, login]);
    console.log(`PostgreSQL copy: ${r.rowCount} account confirmed`);
  } finally {
    await c.end();
  }
}

// ---------------------------------------------------------------------------
// serve-mysql
// ---------------------------------------------------------------------------
async function serveMysql() {
  const db = await resolveSourceDb(arg('--source-db'));
  const appDir = arg('--app-dir');
  const port = Number(arg('--port', '5030'));
  if (!appDir || !fs.existsSync(path.join(appDir, 'server', 'server.js'))) throw new Error('--app-dir must hold the exported server/ tree.');
  const resolved = path.resolve(appDir).toLowerCase();
  if (resolved.startsWith(path.resolve(P.REPO_ROOT).toLowerCase()) || resolved.startsWith(path.resolve(P.APP_TREE).toLowerCase())) {
    throw new Error('--app-dir must be outside every tree.');
  }
  if (!Number.isInteger(port) || FORBIDDEN_PORTS.has(port)) throw new Error('That port is reserved for another server.');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set for the run.');
  const cfg = sourceConfig();
  const env = {
    ...process.env,
    DB_HOST: cfg.host,
    DB_PORT: String(cfg.port),
    DB_USER: cfg.user,
    DB_PASSWORD: cfg.password,
    DB_NAME: db,
    PORT: String(port),
    MAIL_TRANSPORT: 'file',
    SMS_TRANSPORT: 'file',
    CORS_ORIGIN: 'http://localhost:3030',
    NODE_ENV: 'development',
    NODE_PATH: path.join(P.SERVER_SRC_DIR, 'node_modules'),
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(appDir, 'server'), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stdout);
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise((resolve) => child.on('close', resolve));
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------
function keyLabel(k) {
  if (/^\d+$/.test(k)) return '{n}';
  if (/^\d{4}-\d{2}-\d{2}/.test(k)) return '{date}';
  if (!/^[a-z_][a-z0-9_]*$/.test(k)) return '{key}';
  return k;
}

function shapeOf(value, at = '$', out = new Map()) {
  const t = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!out.has(at)) out.set(at, new Set());
  out.get(at).add(t);
  if (t === 'array') value.forEach((v) => shapeOf(v, `${at}[]`, out));
  else if (t === 'object') for (const [k, v] of Object.entries(value)) shapeOf(v, `${at}.${keyLabel(k)}`, out);
  return out;
}

function diffShapes(a, b) {
  const out = [];
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const ta = a.get(p);
    const tb = b.get(p);
    if (!ta) out.push({ path: p, a: null, b: [...tb].sort() });
    else if (!tb) out.push({ path: p, a: [...ta].sort(), b: null });
    else if ([...ta].sort().join('|') !== [...tb].sort().join('|')) out.push({ path: p, a: [...ta].sort(), b: [...tb].sort() });
  }
  return out;
}

async function call(base, method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const kind = (res.headers.get('content-type') || '').split(';')[0];
  let json;
  if (kind === 'application/json') {
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
  } else {
    await res.arrayBuffer();
  }
  return { status: res.status, kind, json };
}

async function compare() {
  const A = arg('--a');
  const B = arg('--b');
  if (!LOOPBACK.test(A || '') || !LOOPBACK.test(B || '')) throw new Error('--a and --b must be loopback base URLs.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const accounts = seededAccounts();
  const results = [];
  const tokens = { a: {}, b: {} };

  // One request, to A then to B. `template` is the path with its ids named,
  // which is all that is printed.
  async function both(role, method, template, urlPath, body) {
    const ra = await call(A, method, urlPath, { token: role ? tokens.a[role] : null, body });
    const rb = await call(B, method, urlPath, { token: role ? tokens.b[role] : null, body });
    const differences = ra.json !== undefined && rb.json !== undefined ? diffShapes(shapeOf(ra.json), shapeOf(rb.json)) : [];
    const entry = {
      role: role || 'none',
      method,
      template,
      status: [ra.status, rb.status],
      kind: [ra.kind, rb.kind],
      differences,
    };
    results.push(entry);
    const same = ra.status === rb.status && ra.kind === rb.kind && differences.length === 0;
    console.log(`${same ? 'SAME' : 'DIFF'} ${entry.role.padEnd(7)} ${method.padEnd(4)} ${template.padEnd(46)} ${ra.status}/${rb.status}${differences.length ? `  ${differences.length} path(s)` : ''}`);
    return ra;
  }

  await both(null, 'GET', '/api/health', '/api/health');
  await both(null, 'GET', '/api/settings/public', '/api/settings/public');

  const gates = {};
  for (const role of ['admin', 'teacher', 'parent']) {
    const acct = accounts[role];
    const body = { login_id: acct.login, password: acct.password };
    const la = await call(A, 'POST', '/api/auth/login', { body });
    const lb = await call(B, 'POST', '/api/auth/login', { body });
    results.push({
      role,
      method: 'POST',
      template: '/api/auth/login',
      status: [la.status, lb.status],
      kind: [la.kind, lb.kind],
      differences: diffShapes(shapeOf(la.json), shapeOf(lb.json)),
    });
    console.log(`${la.status === lb.status ? 'SAME' : 'DIFF'} ${role.padEnd(7)} POST /api/auth/login${' '.repeat(31)} ${la.status}/${lb.status}`);
    tokens.a[role] = la.json && la.json.token;
    tokens.b[role] = lb.json && lb.json.token;
    const me = await both(role, 'GET', '/api/auth/me', '/api/auth/me');
    const user = (me.json && me.json.user) || {};
    gates[role] = { policy_pending: Boolean(user.policy_pending), contact_pending: Boolean(user.contact_pending), must_change_password: Number(user.must_change_password) === 1 };
    if (gates[role].policy_pending) {
      const docs = await call(A, 'GET', '/api/policy', { token: tokens.a[role] });
      const versions = Object.fromEntries(((docs.json && docs.json.documents) || []).map((d) => [d.document, d.version]));
      await both(role, 'POST', '/api/policy/accept', '/api/policy/accept', role === 'parent' ? { versions, on_behalf_of_child: true } : { versions });
    }
  }
  console.log(`gates on A (booleans only): ${JSON.stringify(gates)}`);

  const adminMe = await call(A, 'GET', '/api/auth/me', { token: tokens.a.admin });
  const teacherMe = await call(A, 'GET', '/api/auth/me', { token: tokens.a.teacher });
  const parentMe = await call(A, 'GET', '/api/auth/me', { token: tokens.a.parent });
  const adminId = adminMe.json && adminMe.json.user && adminMe.json.user.id;
  const teacherId = teacherMe.json && teacherMe.json.user && teacherMe.json.user.id;
  const studentId = parentMe.json && parentMe.json.user && parentMe.json.user.student_id;
  const settings = await call(A, 'GET', '/api/settings', { token: tokens.a.admin });
  const schoolYear = settings.json && settings.json.settings && settings.json.settings.academic_year;
  const assignments = await call(A, 'GET', '/api/assignments', { token: tokens.a.teacher });
  const assignment = ((assignments.json && assignments.json.assignments) || [])[0] || {};
  const sections = await call(A, 'GET', '/api/sections', { token: tokens.a.admin });
  const sectionRows = (sections.json && sections.json.sections) || [];
  const advised = sectionRows.find((s) => s.adviser_id === teacherId) || {};
  const grades = await call(A, 'GET', '/api/grades?limit=1', { token: tokens.a.admin });
  const gradeId = (((grades.json && grades.json.grades) || [])[0] || {}).id;
  const letters = await call(A, 'GET', '/api/excuse-letters?limit=1', { token: tokens.a.admin });
  const letterId = (((letters.json && letters.json.excuse_letters) || [])[0] || {}).id;
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();
  const record = q({ subject_id: assignment.subject_id, grade_level: assignment.grade_level, section: assignment.section, term: 1, school_year: schoolYear });
  const summary = q({ grade_level: advised.grade_level, section: advised.name, term: 1, school_year: schoolYear });

  const plan = {
    admin: [
      ['/api/users?limit=200', '/api/users?limit=200'],
      ['/api/users/parents/pending', '/api/users/parents/pending'],
      ['/api/users/:id', `/api/users/${adminId}`],
      ['/api/students?limit=200', '/api/students?limit=200'],
      ['/api/students/:id', `/api/students/${studentId}`],
      ['/api/sections', '/api/sections'],
      ['/api/sections/:id', `/api/sections/${(sectionRows[0] || {}).id}`],
      ['/api/subjects', '/api/subjects'],
      ['/api/assignments', '/api/assignments'],
      ['/api/grades?limit=200', '/api/grades?limit=200'],
      ['/api/grades/:id', `/api/grades/${gradeId}`],
      ['/api/grades/student/:id', `/api/grades/student/${studentId}`],
      ['/api/grades/class-record?…', `/api/grades/class-record?${record}`],
      ['/api/grades/class-summary?…', `/api/grades/class-summary?${summary}`],
      ['/api/grading-modes?grade_level=6', '/api/grading-modes?grade_level=6'],
      ['/api/attendance?limit=200', '/api/attendance?limit=200'],
      ['/api/attendance/student/:id', `/api/attendance/student/${studentId}`],
      ['/api/attendance/summary/:id', `/api/attendance/summary/${studentId}`],
      ['/api/announcements', '/api/announcements'],
      ['/api/memos', '/api/memos'],
      ['/api/events', '/api/events'],
      ['/api/excuse-letters', '/api/excuse-letters'],
      ['/api/excuse-letters/:id', `/api/excuse-letters/${letterId}`],
      ['/api/settings', '/api/settings'],
      ['/api/settings/school_name', '/api/settings/school_name'],
      ['/api/backups', '/api/backups'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/messages/conversations', '/api/messages/conversations'],
      ['/api/messages/with/:id', `/api/messages/with/${teacherId}`],
      ['/api/notifications', '/api/notifications'],
      ['/api/notifications/unread-counts', '/api/notifications/unread-counts'],
      ['/api/dashboard', '/api/dashboard'],
      ['/api/policy', '/api/policy'],
      ['/api/policy/status', '/api/policy/status'],
      ['/api/activity-logs', '/api/activity-logs'],
      ['/api/activity-logs/actions', '/api/activity-logs/actions'],
    ],
    teacher: [
      ['/api/students', '/api/students'],
      ['/api/students/:id', `/api/students/${studentId}`],
      ['/api/sections', '/api/sections'],
      ['/api/subjects', '/api/subjects'],
      ['/api/assignments', '/api/assignments'],
      ['/api/grades', '/api/grades'],
      ['/api/grades/class-record?…', `/api/grades/class-record?${record}`],
      ['/api/grades/class-summary?…', `/api/grades/class-summary?${summary}`],
      ['/api/grades/student/:id', `/api/grades/student/${studentId}`],
      ['/api/grading-modes?grade_level=6', '/api/grading-modes?grade_level=6'],
      ['/api/attendance?…', `/api/attendance?${q({ grade_level: advised.grade_level, section: advised.name })}`],
      ['/api/attendance/student/:id', `/api/attendance/student/${studentId}`],
      ['/api/announcements', '/api/announcements'],
      ['/api/memos', '/api/memos'],
      ['/api/events', '/api/events'],
      ['/api/excuse-letters', '/api/excuse-letters'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/messages/conversations', '/api/messages/conversations'],
      ['/api/notifications', '/api/notifications'],
      ['/api/notifications/unread-counts', '/api/notifications/unread-counts'],
      ['/api/dashboard', '/api/dashboard'],
      ['/api/policy/status', '/api/policy/status'],
      ['/api/settings', '/api/settings'],
    ],
    parent: [
      ['/api/students/:id', `/api/students/${studentId}`],
      ['/api/grades/student/:id', `/api/grades/student/${studentId}`],
      ['/api/grades?student_id=:id', `/api/grades?student_id=${studentId}`],
      ['/api/attendance/student/:id', `/api/attendance/student/${studentId}`],
      ['/api/attendance/summary/:id', `/api/attendance/summary/${studentId}`],
      ['/api/excuse-letters/mine', '/api/excuse-letters/mine'],
      ['/api/announcements', '/api/announcements'],
      ['/api/memos', '/api/memos'],
      ['/api/events', '/api/events'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/messages/conversations', '/api/messages/conversations'],
      ['/api/notifications', '/api/notifications'],
      ['/api/notifications/unread-counts', '/api/notifications/unread-counts'],
      ['/api/dashboard', '/api/dashboard'],
      ['/api/policy/status', '/api/policy/status'],
      ['/api/settings', '/api/settings'],
      ['/api/grading-modes?grade_level=6', '/api/grading-modes?grade_level=6'],
    ],
  };
  for (const role of ['admin', 'teacher', 'parent']) {
    for (const [template, urlPath] of plan[role]) await both(role, 'GET', template, urlPath);
  }

  const differing = results.filter((r) => r.status[0] !== r.status[1] || r.kind[0] !== r.kind[1] || r.differences.length);
  console.log(`\n${results.length} requests compared; ${results.length - differing.length} the same by status, content type, path and type; ${differing.length} differ`);
  for (const r of differing) {
    console.log(`\n${r.role} ${r.method} ${r.template}: status ${r.status[0]}/${r.status[1]}${r.kind[0] !== r.kind[1] ? `, type ${r.kind[0]}/${r.kind[1]}` : ''}`);
    for (const d of r.differences.slice(0, 15)) {
      console.log(`  ${d.path}: A ${d.a ? d.a.join('|') : '(absent)'}  B ${d.b ? d.b.join('|') : '(absent)'}`);
    }
    if (r.differences.length > 15) console.log(`  … and ${r.differences.length - 15} more`);
  }
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const reportPath = path.join(P.REHEARSAL_DIR, `golden_${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ a: 'unported (MySQL)', b: 'ported (PostgreSQL)', gates, results }, null, 2));
  console.log(`\nreport (paths and types only): ${reportPath}`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'fixtures') return fixtures();
  if (command === 'confirm-parent') return confirmParent();
  if (command === 'serve-mysql') return serveMysql();
  if (command === 'compare') return compare();
  console.error('usage: golden-master.js fixtures --source-db <name|latest> | confirm-parent --source-db <name|latest> | serve-mysql --source-db <name|latest> --app-dir <dir> [--port 5030] | compare --a <url> --b <url>');
  process.exit(2);
  return undefined;
}

// The helpers other proofs reuse (scripts/search-route.js); main() runs only
// when this file is the one started.
module.exports = { seededAccounts, resolveSourceDb, call, shapeOf, diffShapes, LOOPBACK, FORBIDDEN_PORTS };

if (require.main === module) main().catch((e) => {
  console.error('golden-master failed:', safeMessage(e));
  process.exit(1);
});
