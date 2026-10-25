#!/usr/bin/env node
// THE GOLDEN MASTER, BY VALUE (P3-C-R2 Phase G). golden-master.js compares the
// two APIs' JSON by path and type; this compares the VALUES too — and array
// ORDER — over the same requests, then runs a fixed sequence of WRITES on both
// and compares those answers and the reads after them, then measures D-2 (the
// name sorts) with synthetic learners. A is the unported API (MySQL scratch),
// B the ported one (the PostgreSQL copy transferred from that scratch).
//
//   node scripts/golden-values.js --a http://127.0.0.1:5030 --b http://127.0.0.1:5010 --source-db <parents_portal_migsrc_*>
//
// NOTHING IS PRINTED BUT PATHS, KINDS AND STATUSES. A difference is reported as
// its JSON path (object keys generalised where they could be data, as in
// golden-master.js) and its kind:
//   status / content-type / shape   as golden-master.js
//   value      the two values differ at that path
//   order      an array holds the same elements in another order
//   length     an array's length differs
//   timestamp  two instants differ (in the write phase: by more than TOL_S)
//   timestamp~ two instants a write stamped, within TOL_S of each other — the
//              two APIs answered the same write a moment apart; not a defect
// The synthetic learners' last names are fictional words and print by name.
//
// Writes go to A, then the same write to B, in one fixed order, so the two
// databases see the same history: the ids each side hands out must be EQUAL
// (the transfer set every sequence to the source's next id). Everything the
// run creates is deleted BY ID on both sides at the end — the API's own deletes
// where it has them, SQL for the rest — and checked gone from a second
// connection. The report goes to <DATA_DIR>/rehearsal/golden_values_<stamp>.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seededAccounts, call, shapeOf, diffShapes, LOOPBACK } = require('./golden-master');
const { scratch } = require('../lib/mysql');
const { localConfig } = require('../lib/env');
const { client } = require('../lib/pg');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const TOL_S = 15;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SKIP_KEYS = new Set(['token']);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function keyLabel(k) {
  if (/^\d+$/.test(k)) return '{n}';
  if (/^\d{4}-\d{2}-\d{2}/.test(k)) return '{date}';
  if (!/^[a-z_][a-z0-9_]*$/.test(k)) return '{key}';
  return k;
}

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

function valueDiffs(a, b, tolerant, at = '$', out = []) {
  if (typeof a === 'string' && typeof b === 'string' && ISO.test(a) && ISO.test(b)) {
    const d = Math.abs(Date.parse(a) - Date.parse(b)) / 1000;
    if (d > 0) out.push({ path: at, kind: tolerant && d <= TOL_S ? 'timestamp~' : 'timestamp' });
    return out;
  }
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) {
    out.push({ path: at, kind: 'value' });
    return out;
  }
  if (ta === 'array') {
    if (a.length !== b.length) {
      out.push({ path: at, kind: 'length' });
      return out;
    }
    const same = a.every((x, i) => canon(x) === canon(b[i]));
    if (same) return out;
    const sa = a.map(canon).sort();
    const sb = b.map(canon).sort();
    if (sa.every((x, i) => x === sb[i])) {
      out.push({ path: at, kind: 'order' });
      return out;
    }
    a.forEach((x, i) => valueDiffs(x, b[i], tolerant, `${at}[]`, out));
    return out;
  }
  if (ta === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (SKIP_KEYS.has(k)) continue;
      if (!(k in a) || !(k in b)) out.push({ path: `${at}.${keyLabel(k)}`, kind: 'shape' });
      else valueDiffs(a[k], b[k], tolerant, `${at}.${keyLabel(k)}`, out);
    }
    return out;
  }
  if (a !== b) out.push({ path: at, kind: 'value' });
  return out;
}

function summarise(diffs) {
  const byKind = {};
  const paths = new Map();
  for (const d of diffs) {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    const key = `${d.kind} ${d.path}`;
    paths.set(key, (paths.get(key) || 0) + 1);
  }
  return { byKind, paths: [...paths.entries()].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`) };
}

// A past class day (Term 2, a weekday) on which the learner has no attendance
// row on EITHER side, so a review's write and the POST below create rows this
// run owns and deletes — never touching a row that was there.
async function freeDays(sourceDb, studentId, candidates, n) {
  const my = await scratch(sourceDb);
  const pg = await client(localConfig());
  try {
    const free = [];
    for (const date of candidates) {
      const [[a]] = await my.query('SELECT COUNT(*) AS n FROM attendance WHERE student_id = ? AND date = ?', [studentId, date]);
      const b = (await pg.query('SELECT COUNT(*)::int AS n FROM portal.attendance WHERE student_id = $1 AND date = $2', [studentId, date])).rows[0];
      const [[la]] = await my.query('SELECT COUNT(*) AS n FROM excuse_letters WHERE student_id = ? AND absence_date = ?', [studentId, date]);
      const lb = (await pg.query('SELECT COUNT(*)::int AS n FROM portal.excuse_letters WHERE student_id = $1 AND absence_date = $2', [studentId, date])).rows[0];
      if (Number(a.n) === 0 && b.n === 0 && Number(la.n) === 0 && lb.n === 0) free.push(date);
      if (free.length === n) return free;
    }
    throw new Error('no free class day for the write phase');
  } finally {
    await my.end();
    await pg.end();
  }
}

function createdId(json) {
  if (!json || typeof json !== 'object') return null;
  for (const [k, v] of Object.entries(json)) {
    if (k === 'page') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && Number.isInteger(v.id)) return v.id;
  }
  return null;
}

async function main() {
  const A = arg('--a');
  const B = arg('--b');
  const sourceDb = arg('--source-db');
  if (!LOOPBACK.test(A || '') || !LOOPBACK.test(B || '')) throw new Error('--a and --b must be loopback base URLs.');
  if (!/^parents_portal_migsrc_[0-9_]+$/.test(sourceDb || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch.');
  const accounts = seededAccounts();
  const tokens = { a: {}, b: {} };
  const results = [];
  const made = { messages: [[], []], letters: [[], []], attendance: [[], []], students: [[], []], content: [[], []] };
  const keep = (type, r) => {
    made.content[0].push([type, createdId(r.a.json)]);
    made.content[1].push([type, createdId(r.b.json)]);
  };

  async function both(phase, role, method, template, urlPath, body) {
    const ra = await call(A, method, urlPath, { token: role ? tokens.a[role] : null, body });
    const rb = await call(B, method, urlPath, { token: role ? tokens.b[role] : null, body });
    const shape = ra.json !== undefined && rb.json !== undefined ? diffShapes(shapeOf(ra.json), shapeOf(rb.json)) : [];
    const values = ra.json !== undefined && rb.json !== undefined ? valueDiffs(ra.json, rb.json, phase !== 'read') : [];
    const ids = method === 'POST' ? [createdId(ra.json), createdId(rb.json)] : null;
    const entry = { phase, role: role || 'none', method, template, status: [ra.status, rb.status], kind: [ra.kind, rb.kind], shape: shape.length, ...summarise(values), ids };
    const statusSame = ra.status === rb.status && ra.kind === rb.kind;
    const real = values.filter((d) => d.kind !== 'timestamp~');
    entry.same = statusSame && shape.length === 0 && real.length === 0 && (!ids || ids[0] === ids[1]);
    results.push(entry);
    const kinds = Object.entries(entry.byKind).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${entry.same ? 'SAME' : 'DIFF'} ${phase.padEnd(5)} ${entry.role.padEnd(7)} ${method.padEnd(6)} ${template.padEnd(44)} ${ra.status}/${rb.status}${kinds ? `  (${kinds})` : ''}${ids ? `  ids ${ids[0] === ids[1] ? 'equal' : 'DIFFER'}` : ''}`);
    return { a: ra, b: rb };
  }

  // --- sign in --------------------------------------------------------------
  for (const role of ['admin', 'teacher', 'parent']) {
    const body = { login_id: accounts[role].login, password: accounts[role].password };
    const la = await call(A, 'POST', '/api/auth/login', { body });
    const lb = await call(B, 'POST', '/api/auth/login', { body });
    if (la.status !== 200 || lb.status !== 200) throw new Error(`the ${role} sign-in failed (${la.status}/${lb.status})`);
    tokens.a[role] = la.json.token;
    tokens.b[role] = lb.json.token;
  }
  const meA = {};
  for (const role of ['admin', 'teacher', 'parent']) meA[role] = (await call(A, 'GET', '/api/auth/me', { token: tokens.a[role] })).json.user;
  for (const role of ['admin', 'teacher', 'parent']) {
    if (meA[role].policy_pending || meA[role].contact_pending || Number(meA[role].must_change_password) === 1) {
      throw new Error(`the ${role} has a first-sign-in step pending on A — run golden-master.js compare once (it accepts) and confirm-parent first`);
    }
  }
  const adminId = meA.admin.id;
  const teacherId = meA.teacher.id;
  const parentUserId = meA.parent.id;
  const studentId = meA.parent.student_id;
  const settings = (await call(A, 'GET', '/api/settings', { token: tokens.a.admin })).json.settings;
  const schoolYear = settings.academic_year;
  const assignment = ((await call(A, 'GET', '/api/assignments', { token: tokens.a.teacher })).json.assignments || [])[0] || {};
  const sectionRows = (await call(A, 'GET', '/api/sections', { token: tokens.a.admin })).json.sections || [];
  const advised = sectionRows.find((s) => s.adviser_id === teacherId) || {};
  const gradeId = (((await call(A, 'GET', '/api/grades?limit=1', { token: tokens.a.admin })).json.grades || [])[0] || {}).id;
  const letterId = (((await call(A, 'GET', '/api/excuse-letters?limit=1', { token: tokens.a.admin })).json.excuse_letters || [])[0] || {}).id;
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();
  const record = q({ subject_id: assignment.subject_id, grade_level: assignment.grade_level, section: assignment.section, term: 1, school_year: schoolYear });
  const summary = q({ grade_level: advised.grade_level, section: advised.name, term: 1, school_year: schoolYear });

  // --- READS: every read route of each role, by value -----------------------
  console.log('\nREADS (values and order, exact)');
  const reads = {
    admin: [
      ['/api/users?limit=200', '/api/users?limit=200'],
      ['/api/users?sort=name&limit=200', '/api/users?sort=name&limit=200'],
      ['/api/users/parents/pending', '/api/users/parents/pending'],
      ['/api/users/:id', `/api/users/${adminId}`],
      ['/api/students?limit=200', '/api/students?limit=200'],
      ['/api/students?sort=name&limit=200', '/api/students?sort=name&limit=200'],
      ['/api/students/:id', `/api/students/${studentId}`],
      ['/api/sections', '/api/sections'],
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
      ['/api/events?sort=event_date&order=asc', '/api/events?sort=event_date&order=asc'],
      ['/api/excuse-letters', '/api/excuse-letters'],
      ['/api/excuse-letters?sort=student', '/api/excuse-letters?sort=student'],
      ['/api/excuse-letters/:id', `/api/excuse-letters/${letterId}`],
      ['/api/settings', '/api/settings'],
      ['/api/settings/public', '/api/settings/public'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/messages/contacts?sort=name', '/api/messages/contacts?sort=name'],
      ['/api/messages/conversations', '/api/messages/conversations'],
      ['/api/notifications', '/api/notifications'],
      ['/api/notifications/unread-counts', '/api/notifications/unread-counts'],
      ['/api/dashboard', '/api/dashboard'],
      ['/api/policy/status', '/api/policy/status'],
      ['/api/activity-logs/actions', '/api/activity-logs/actions'],
    ],
    teacher: [
      ['/api/students', '/api/students'],
      ['/api/grades', '/api/grades'],
      ['/api/grades/class-record?…', `/api/grades/class-record?${record}`],
      ['/api/grades/class-summary?…', `/api/grades/class-summary?${summary}`],
      ['/api/attendance?…', `/api/attendance?${q({ grade_level: advised.grade_level, section: advised.name })}`],
      ['/api/excuse-letters', '/api/excuse-letters'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/notifications', '/api/notifications'],
      ['/api/dashboard', '/api/dashboard'],
    ],
    parent: [
      ['/api/grades/student/:id', `/api/grades/student/${studentId}`],
      ['/api/attendance/summary/:id', `/api/attendance/summary/${studentId}`],
      ['/api/excuse-letters/mine', '/api/excuse-letters/mine'],
      ['/api/announcements', '/api/announcements'],
      ['/api/events', '/api/events'],
      ['/api/messages/contacts', '/api/messages/contacts'],
      ['/api/notifications', '/api/notifications'],
      ['/api/dashboard', '/api/dashboard'],
    ],
  };
  for (const role of ['admin', 'teacher', 'parent']) {
    for (const [template, urlPath] of reads[role]) await both('read', role, 'GET', template, urlPath);
  }

  // --- WRITES: the same history on both sides --------------------------------
  console.log('\nWRITES (each to A, then to B; stamps within ±' + TOL_S + ' s are timestamp~)');
  const ida = (r) => createdId(r.a.json);
  const idb = (r) => createdId(r.b.json);
  const pair = (r) => [ida(r), idb(r)];
  const sameId = (r) => ida(r) !== null && ida(r) === idb(r);

  const ann = await both('write', 'admin', 'POST', '/api/announcements (school-wide)', '/api/announcements', { title: 'Golden values announcement', content: 'golden values' });
  keep('announcement', ann);
  if (sameId(ann)) {
    await both('write', 'admin', 'PUT', '/api/announcements/:id', `/api/announcements/${ida(ann)}`, { title: 'Golden values announcement, edited', content: 'golden values, edited' });
    await both('write', 'parent', 'GET', '/api/announcements (after the edit)', '/api/announcements');
    await both('write', 'parent', 'GET', '/api/notifications/unread-counts', '/api/notifications/unread-counts');
    await both('write', 'admin', 'DELETE', '/api/announcements/:id', `/api/announcements/${ida(ann)}`);
  }
  const cls = await both('write', 'teacher', 'POST', '/api/announcements (class)', '/api/announcements', { title: 'Golden values class post', content: 'golden values', target_grade: advised.grade_level, target_section: advised.name });
  keep('announcement', cls);
  if (sameId(cls)) await both('write', 'teacher', 'DELETE', '/api/announcements/:id', `/api/announcements/${ida(cls)}`);
  const memo = await both('write', 'admin', 'POST', '/api/memos', '/api/memos', { title: 'Golden values memo', content: 'golden values' });
  keep('memo', memo);
  if (sameId(memo)) {
    await both('write', 'teacher', 'GET', '/api/memos (after the post)', '/api/memos');
    await both('write', 'admin', 'DELETE', '/api/memos/:id', `/api/memos/${ida(memo)}`);
  }
  const ev = await both('write', 'admin', 'POST', '/api/events', '/api/events', { title: 'Golden values event', description: 'golden values', event_date: '2026-11-20', target_grade: null });
  keep('event', ev);
  if (sameId(ev)) {
    await both('write', 'admin', 'PUT', '/api/events/:id', `/api/events/${ida(ev)}`, { title: 'Golden values event, edited', event_date: '2026-11-27' });
    await both('write', 'parent', 'GET', '/api/events?sort=event_date&order=asc', '/api/events?sort=event_date&order=asc');
    await both('write', 'admin', 'DELETE', '/api/events/:id', `/api/events/${ida(ev)}`);
  }
  const m1 = await both('write', 'teacher', 'POST', '/api/messages (teacher → parent)', '/api/messages', { receiver_id: parentUserId, body: 'Golden values message one' });
  const m2 = await both('write', 'teacher', 'POST', '/api/messages (a second one)', '/api/messages', { receiver_id: parentUserId, body: 'Golden values message two' });
  for (const r of [m1, m2]) {
    made.messages[0].push(ida(r));
    made.messages[1].push(idb(r));
  }
  await both('write', 'parent', 'GET', '/api/messages/conversations', '/api/messages/conversations');
  if (sameId(m1)) await both('write', 'parent', 'PATCH', '/api/messages/:id/read', `/api/messages/${ida(m1)}/read`);
  await both('write', 'parent', 'PATCH', '/api/messages/read-all/:teacherId', `/api/messages/read-all/${teacherId}`);
  await both('write', 'parent', 'GET', '/api/messages/with/:teacherId', `/api/messages/with/${teacherId}`);
  const [letterDay, attendanceDay] = await freeDays(
    sourceDb,
    studentId,
    ['2026-10-20', '2026-10-19', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12', '2026-10-09', '2026-10-08', '2026-10-07'],
    2
  );
  const letter = await both('write', 'parent', 'POST', '/api/excuse-letters', '/api/excuse-letters', { absence_date: letterDay, reason: 'Golden values letter', details: null });
  made.letters[0].push(ida(letter));
  made.letters[1].push(idb(letter));
  if (sameId(letter)) {
    await both('write', 'parent', 'PUT', '/api/excuse-letters/:id', `/api/excuse-letters/${ida(letter)}`, { reason: 'Golden values letter, edited' });
    const review = await both('write', 'teacher', 'PATCH', '/api/excuse-letters/:id/review', `/api/excuse-letters/${ida(letter)}/review`, { status: 'Approved', teacher_remarks: 'golden values' });
    const ra = review.a.json && review.a.json.attendance;
    const rb = review.b.json && review.b.json.attendance;
    if (ra && review.a.json.attendance_from === null) made.attendance[0].push(ra.id);
    if (rb && review.b.json.attendance_from === null) made.attendance[1].push(rb.id);
    await both('write', 'parent', 'GET', '/api/excuse-letters/mine', '/api/excuse-letters/mine');
  }
  const att = await both('write', 'teacher', 'POST', '/api/attendance', '/api/attendance', { student_id: studentId, date: attendanceDay, status: 'Late' });
  if (att.a.status === 201) made.attendance[0].push(ida(att));
  if (att.b.status === 201) made.attendance[1].push(idb(att));
  if (sameId(att)) await both('write', 'teacher', 'PUT', '/api/attendance/:id', `/api/attendance/${ida(att)}`, { status: 'Present' });
  await both('write', 'parent', 'GET', '/api/attendance/summary/:id (after)', `/api/attendance/summary/${studentId}`);
  const phoneBefore = settings.school_phone;
  await both('write', 'admin', 'PUT', '/api/settings/school_phone', '/api/settings/school_phone', { value: '(02) 8000-0000' });
  await both('write', 'none', 'GET', '/api/settings/public (after)', '/api/settings/public');
  await both('write', 'admin', 'PUT', '/api/settings/school_phone (restored)', '/api/settings/school_phone', { value: phoneBefore });
  await both('write', 'parent', 'PATCH', '/api/notifications/read-all', '/api/notifications/read-all', {});
  await both('write', 'parent', 'GET', '/api/notifications/unread-counts (after)', '/api/notifications/unread-counts');
  // The documented int4 difference (05 §0f): MySQL found no row, PostgreSQL's
  // parseId refuses the id before any query.
  await both('write', 'teacher', 'POST', '/api/messages (receiver id past int4)', '/api/messages', { receiver_id: 3000000000, body: 'x' });
  await both('write', 'parent', 'GET', '/api/messages/with/:id (id past int4)', '/api/messages/with/3000000000');

  // --- D-2: the name sorts, measured ------------------------------------------
  console.log('\nD-2 (the name sort): synthetic learners on both sides, the same rows in the same order');
  const LAST = ['Ñuñez', 'Nunez', 'nuñez', 'Abad', 'abad', 'Ábrego', 'Abrego', 'Zuñiga', 'zuniga', 'Ebert', 'Éclair', 'ebert', 'O\'Brien', 'Obando', 'de la Cruz', 'Dela Cruz'];
  const FIRST = 'Gvsortkid';
  const section = sectionRows.find((s) => s.grade_level === 3) || sectionRows[0];
  const lrns = LAST.map(() => `9${crypto.randomInt(0, 1e11).toString().padStart(11, '0')}`);
  const my = await scratch(sourceDb);
  const pg = await client(localConfig());
  let collation = null;
  try {
    collation = (await pg.query('SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()')).rows[0];
    for (let i = 0; i < LAST.length; i += 1) {
      const [r] = await my.query(
        "INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
        [lrns[i], FIRST, LAST[i], section.grade_level, section.name, section.id, adminId]
      );
      made.students[0].push(r.insertId);
      const p = await pg.query(
        "INSERT INTO portal.students (lrn, first_name, last_name, grade_level, section, section_id, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING id",
        [lrns[i], FIRST, LAST[i], section.grade_level, section.name, section.id, adminId]
      );
      made.students[1].push(p.rows[0].id);
    }
  } finally {
    await my.end();
    await pg.end();
  }
  const idsEqual = made.students[0].every((id, i) => id === made.students[1][i]);
  console.log(`synthetic learners: ${LAST.length} on each side, ids ${idsEqual ? 'equal' : 'DIFFER'}; PostgreSQL database collation ${collation.datcollate} / ctype ${collation.datctype}`);
  const label = (side, rows) => rows.filter((r) => made.students[side].includes(r.id)).map((r) => LAST[made.students[side].indexOf(r.id)]);
  const d2 = {};
  for (const order of ['asc', 'desc']) {
    const r = await both('d2', 'admin', 'GET', `/api/students?search=${FIRST}&sort=name&order=${order}`, `/api/students?search=${FIRST}&sort=name&order=${order}&limit=200`);
    const la = label(0, r.a.json.students || []);
    const lb = label(1, r.b.json.students || []);
    d2[order] = { mysql: la, pg: lb, same: la.join('|') === lb.join('|') };
    console.log(`  ${order} MySQL      : ${la.join(' · ')}`);
    console.log(`  ${order} PostgreSQL : ${lb.join(' · ')}`);
    console.log(`  ${order} the same order: ${d2[order].same}`);
  }

  // --- cleanup, by id, both sides ------------------------------------------
  console.log('\nCLEANUP');
  const left = {};
  const my2 = await scratch(sourceDb);
  const pg2 = await client(localConfig());
  try {
    const sides = [
      { name: 'MySQL', side: 0, run: async (sql, params) => (await my2.query(sql, params))[0].affectedRows, count: async (sql, params) => Number((await my2.query(sql, params))[0][0].n) },
      { name: 'PostgreSQL', side: 1, run: async (sql, params) => (await pg2.query(sql.replace(/\?/g, (() => { let n = 0; return () => `$${(n += 1)}`; })()), params)).rowCount, count: async (sql, params) => Number((await pg2.query(sql.replace(/\?/g, (() => { let n = 0; return () => `$${(n += 1)}`; })()), params)).rows[0].n) },
    ];
    await pg2.query('SET search_path TO portal, public');
    for (const s of sides) {
      const msg = made.messages[s.side].filter(Number.isInteger);
      const let_ = made.letters[s.side].filter(Number.isInteger);
      const att_ = made.attendance[s.side].filter(Number.isInteger);
      const stu = made.students[s.side].filter(Number.isInteger);
      const counts = {};
      for (const id of msg) counts.messages = (counts.messages || 0) + (await s.run('DELETE FROM messages WHERE id = ?', [id]));
      for (const id of let_) {
        counts.notifications = (counts.notifications || 0) + (await s.run("DELETE FROM notifications WHERE item_type = 'excuse_letter' AND item_id = ?", [id]));
        counts.letters = (counts.letters || 0) + (await s.run('DELETE FROM excuse_letters WHERE id = ?', [id]));
      }
      for (const id of att_) counts.attendance = (counts.attendance || 0) + (await s.run('DELETE FROM attendance WHERE id = ?', [id]));
      for (const id of stu) counts.students = (counts.students || 0) + (await s.run('DELETE FROM students WHERE id = ?', [id]));
      let remaining = 0;
      for (const id of msg) remaining += await s.count('SELECT COUNT(*) AS n FROM messages WHERE id = ?', [id]);
      for (const id of let_) remaining += await s.count('SELECT COUNT(*) AS n FROM excuse_letters WHERE id = ?', [id]);
      for (const id of att_) remaining += await s.count('SELECT COUNT(*) AS n FROM attendance WHERE id = ?', [id]);
      for (const id of stu) remaining += await s.count('SELECT COUNT(*) AS n FROM students WHERE id = ?', [id]);
      // A post the API did not delete (its ids differed, so no DELETE was sent)
      // goes by id here, its notifications with it.
      for (const [type, id] of made.content[s.side].filter(([, id]) => Number.isInteger(id))) {
        const table = { announcement: 'announcements', memo: 'memos', event: 'events' }[type];
        counts.notifications = (counts.notifications || 0) + (await s.run('DELETE FROM notifications WHERE item_type = ? AND item_id = ?', [type, id]));
        counts.posts = (counts.posts || 0) + (await s.run(`DELETE FROM ${table} WHERE id = ?`, [id]));
        remaining += await s.count('SELECT COUNT(*) AS n FROM notifications WHERE item_type = ? AND item_id = ?', [type, id]);
      }
      remaining += await s.count("SELECT COUNT(*) AS n FROM announcements WHERE title LIKE 'Golden values %'", []);
      remaining += await s.count("SELECT COUNT(*) AS n FROM memos WHERE title LIKE 'Golden values %'", []);
      remaining += await s.count("SELECT COUNT(*) AS n FROM events WHERE title LIKE 'Golden values %'", []);
      left[s.name] = remaining;
      console.log(`  ${s.name}: deleted ${JSON.stringify(counts)}; rows of this run left: ${remaining}`);
    }
  } finally {
    await my2.end();
    await pg2.end();
  }
  const phone = await both('write', 'none', 'GET', '/api/settings/public (final)', '/api/settings/public');
  const phoneBack = phone.a.json.settings.school_phone === phoneBefore && phone.b.json.settings.school_phone === phoneBefore;
  console.log(`  school_phone back as it was on both: ${phoneBack}`);

  const differing = results.filter((r) => !r.same);
  console.log(`\n${results.length} requests compared; ${results.length - differing.length} the same; ${differing.length} differ`);
  for (const r of differing) {
    console.log(`\n${r.phase} ${r.role} ${r.method} ${r.template}: status ${r.status[0]}/${r.status[1]}${r.shape ? `, ${r.shape} shape path(s)` : ''}${r.ids && r.ids[0] !== r.ids[1] ? ', ids differ' : ''}`);
    for (const p of r.paths.slice(0, 20)) console.log(`  ${p}`);
    if (r.paths.length > 20) console.log(`  … and ${r.paths.length - 20} more`);
  }
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = path.join(P.REHEARSAL_DIR, `golden_values_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ a: 'unported (MySQL)', b: 'ported (PostgreSQL)', tolerance_s: TOL_S, collation, d2, left, phoneBack, results }, null, 2));
  console.log(`\nreport (paths, kinds and statuses only): ${out}`);
  process.exitCode = left.MySQL || left.PostgreSQL || !phoneBack ? 1 : 0;
}

main().catch((e) => {
  console.error('golden-values failed:', safeMessage(e));
  process.exit(1);
});
