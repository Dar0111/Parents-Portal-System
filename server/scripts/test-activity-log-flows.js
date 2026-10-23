/**
 * The Activity log (feat/activity-log, B2): GET /api/activity-logs,
 * /api/activity-logs/actions and /api/activity-logs/export.
 * Prerequisite: a running API (npm start, or API_BASE for another port).
 *
 * WHAT IT PROVES
 *   - admin only: no token 401, a teacher and a parent 403 "Access denied."
 *     on all three (each through the privacy steps first, so the refusal is
 *     the role's, not a gate's)
 *   - an entry is exactly seven fields; the description — and the sentinel
 *     this run writes into it — never reaches the JSON or the CSV
 *   - the filters (role, deleted accounts, one action, a group, Other), and
 *     every row on today's real data obeys them (`.every`)
 *   - a MANILA day: a row at 00:30 Manila is that day's, 23:59:59 the day
 *     before is not, midnight belongs to the next
 *   - paging totals, the 400s, the export's BOM, CRLF, header, order, Manila
 *     times and formula guard, its file name and the exposed header, and the
 *     row a download writes
 *   - the map: every code a route or util writes has its words
 *     (utils/activityActions.js), and the map holds nothing else but the
 *     removed codes and the setup script's `seed`
 *
 * WHAT IT WRITES, AND WHAT IT LEAVES
 *   - one temporary teacher, created through the API (its name starts with
 *     "=" so the CSV guard has something to guard), deleted at the end
 *   - FOUR FABRICATED activity_logs rows, inserted by SQL with explicit Manila
 *     offsets in a window no real row can hold (May and June 2026, before the
 *     repository existed — B2's survey found 0 rows before 2026-08-27). They
 *     record nothing that happened, so they are deleted BY ID at the end — the
 *     one exception to "activity rows are kept" (the owner's Q9.3).
 *   - every row the API itself writes (the sign-ins, the teacher's creation,
 *     the download) stays, as activity_logs rows always do
 *   - the privacy fixture's acceptances and contacts, undone by its cleanup
 *   Every other table ends where it began (the owner's C5): the cleanup
 *   counts users, notifications, auth_codes, login_attempts and
 *   policy_acceptances rows above the run's start marks and fails on any.
 *
 * NO CREDENTIAL IN THIS FILE. The seeded admin, teacher and parent are read at
 * run time from scripts/setup-db.js (the one place they live) and never
 * printed. Assertions are on the run's own rows or `.every()` invariants —
 * no exact count on a shared table; the fabricated window is exact because
 * only this run can put a row in it.
 *
 * Usage: npm run test:activity-log
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');
const { createPolicyFixture } = require('./policyFixture');
const { ACTION_GROUPS, actionInfo, groupCodes, knownCodes } = require('../utils/activityActions');
const { guardCell, csvField, buildCsv, BOM } = require('../utils/csv');
const { isRealDate, manilaDayStart, manilaDayEnd, manilaParts, manilaToday } = require('../utils/manilaTime');

// 127.0.0.1, not localhost: Node's fetch on Windows tries IPv6 ::1 first
// (docs/TESTING.md). API_BASE wins.
const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const policy = createPolicyFixture();

const ENTRY_KEYS = ['action', 'action_group', 'action_label', 'actor_name', 'actor_role', 'created_at', 'id'];
const RETIRED = ['create_contribution', 'update_contribution', 'delete_contribution', 'update_contribution_record', 'record_descriptive_grade'];
const SCRIPT_ONLY = ['seed'];
const UNKNOWN_CODE = 'zz_suite_unknown_code';
const SENTINEL = `suite-sentinel-${crypto.randomBytes(8).toString('hex')}`;
const CSV_HEADER = '"Entry","Date","Time (Philippine time)","Account","Role","Group","Action","Action code"';

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function requireFixture(condition, label) {
  if (condition) {
    console.log(`  fixture ok: ${label}`);
    return;
  }
  throw new Error(`FIXTURE FAILED: ${label}`);
}

async function request(method, urlPath, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString('utf8');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text, buffer, headers: res.headers };
}

const get = (urlPath, token, headers) => request('GET', urlPath, { token, headers });
const qs = (params) => `?${new URLSearchParams(params).toString()}`;

// The seeded accounts, from setup-db.js — never a literal here, never printed.
function seededAccounts() {
  const src = fs.readFileSync(path.join(__dirname, 'setup-db.js'), 'utf8');
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

async function signIn(account, label) {
  requireFixture(account && account.login && account.password, `${label} read from setup-db.js`);
  const res = await request('POST', '/api/auth/login', { body: { login_id: account.login, password: account.password } });
  requireFixture(res.status === 200 && res.data?.token, `${label} signs in`);
  await policy.accept(res.data.token);
  return res.data.token;
}

// Every code a route or util writes, read from the source: the second
// argument of each logActivity(...) call, which is a code or a choice of two.
function codesWrittenByCode() {
  const found = new Set();
  for (const dir of ['routes', 'utils']) {
    const full = path.join(__dirname, '..', dir);
    for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(full, file), 'utf8');
      for (const m of src.matchAll(/logActivity\(\s*([^,]+?),\s*([^,]+?),/g)) {
        for (const lit of m[2].matchAll(/'([a-z_]+)'/g)) found.add(lit[1]);
      }
    }
  }
  return found;
}

const made = { teacherId: null, logIds: [], marks: null };
const MARKED = ['users', 'notifications', 'auth_codes', 'login_attempts', 'policy_acceptances'];

async function takeMarks() {
  const marks = {};
  for (const table of MARKED) {
    const [[row]] = await pool.query(`SELECT COALESCE(MAX(id), 0) AS hi FROM ${table}`);
    marks[table] = Number(row.hi);
  }
  return marks;
}

function pureChecks() {
  console.log('\n-- the map, the CSV writer, Manila days (no server) --');
  const written = codesWrittenByCode();
  const known = new Set(knownCodes());
  const missing = [...written].filter((c) => !known.has(c));
  assert(written.size >= 70, `the source scan finds the writers' codes (${written.size})`);
  assert(missing.length === 0, 'every code a route or util writes has its words', `missing: ${missing.join(', ')}`);
  const extra = [...known].filter((c) => !written.has(c) && !RETIRED.includes(c) && !SCRIPT_ONLY.includes(c));
  assert(extra.length === 0, 'the map holds nothing else but the removed codes and seed', `extra: ${extra.join(', ')}`);
  assert(written.has('excuse_attendance') && written.has('export_activity_log'), 'excuse_attendance and export_activity_log are written');
  const labels = ACTION_GROUPS.flatMap((g) => g.actions.map((a) => a.label));
  assert(new Set(labels).size === labels.length && labels.every((l) => l.trim().length > 3), 'every label is its own and not empty');
  assert(RETIRED.every((c) => actionInfo(c).label.endsWith('(removed)')), 'every removed code reads "(removed)"');
  assert(new Set(ACTION_GROUPS.map((g) => g.key)).size === ACTION_GROUPS.length, 'group keys are unique');
  const u = actionInfo(UNKNOWN_CODE);
  assert(u.label === UNKNOWN_CODE && u.group === 'other', 'an unknown code is its own label, in Other');
  assert(groupCodes('attendance').includes('excuse_attendance') && groupCodes('nope') === null, 'groupCodes');

  for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
    assert(guardCell(`${lead}1+1`) === `'${lead}1+1`, `the formula guard on a leading ${JSON.stringify(lead)}`);
  }
  assert(guardCell('Plain name') === 'Plain name' && guardCell(null) === '' && guardCell(42) === '42', 'plain cells pass unguarded');
  assert(csvField('a"b') === '"a""b"' && csvField('a,b') === '"a,b"', 'RFC 4180: quotes doubled, every field quoted');
  assert(csvField('one\r\ntwo') === '"one\r\ntwo"', 'a CR/LF inside a field stays inside its quotes');
  const sample = buildCsv(['A', 'B'], [['1', '=x']]);
  assert(sample.startsWith(BOM) && sample === `${BOM}"A","B"\r\n"1","'=x"\r\n`, 'buildCsv: BOM, CRLF after every record');

  assert(isRealDate('2026-02-28') && !isRealDate('2026-02-30') && !isRealDate('2026-2-28') && !isRealDate(undefined), 'isRealDate');
  assert(manilaDayStart('2026-06-01').toISOString() === '2026-05-31T16:00:00.000Z', 'a Manila day starts at 16:00 UTC the day before');
  assert(manilaDayEnd('2026-06-01').toISOString() === '2026-06-01T16:00:00.000Z', 'and ends at the next day start');
  const half = manilaParts(new Date('2026-05-31T16:30:00Z'));
  assert(half.date === '2026-06-01' && half.time === '00:30:00', '00:30 Manila is that day, as the CSV prints it');
  const late = manilaParts(new Date('2026-05-31T15:59:59Z'));
  assert(late.date === '2026-05-31' && late.time === '23:59:59', '23:59:59 Manila is the day before');
  assert(manilaToday(new Date('2026-10-23T16:30:00Z')) === '2026-10-24', "manilaToday follows Manila, not UTC");
}

async function run() {
  pureChecks();

  console.log('\n-- the server --');
  const health = await get('/api/health');
  requireFixture(health.status === 200 && health.data?.success, 'health');
  made.marks = await takeMarks();
  const runStart = new Date(Date.now() - 1000);

  for (const p of ['/api/activity-logs', '/api/activity-logs/actions', '/api/activity-logs/export']) {
    const anon = await get(p);
    assert(anon.status === 401, `no token → 401 on ${p}`, `got ${anon.status}`);
  }

  const seeded = seededAccounts();
  const adminToken = await signIn(seeded.admin, 'the seeded admin');
  const teacherToken = await signIn(seeded.teacher, 'a seeded teacher');
  const parentToken = await signIn(seeded.parent, 'a seeded parent');
  for (const [who, token] of [['a teacher', teacherToken], ['a parent', parentToken]]) {
    for (const p of ['/api/activity-logs', '/api/activity-logs/actions', '/api/activity-logs/export']) {
      const res = await get(p, token);
      assert(res.status === 403 && res.data?.message === 'Access denied.', `${who} → 403 "Access denied." on ${p}`, `got ${res.status} ${res.data?.message}`);
    }
  }

  // The temporary teacher — the fabricated rows' account, its name the guard's test.
  const teacherName = `=SUM(1,2) Activity Suite ${crypto.randomBytes(2).toString('hex')}`;
  const created = await request('POST', '/api/users/teachers', {
    token: adminToken,
    body: {
      login_id: `TEST-AL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      password: `Al${crypto.randomBytes(9).toString('hex')}7`,
      name: teacherName,
    },
  });
  requireFixture(created.status === 201 && created.data?.user?.id, 'the temporary teacher is created');
  made.teacherId = created.data.user.id;

  // The fabricated window: A 00:30 on 1 June, B 23:59:59 on 31 May (no account),
  // C 23:59:59 on 1 June, D midnight that begins 2 June. Explicit offsets, so the
  // instants do not depend on the session's zone.
  const FIX = [
    { key: 'A', user: made.teacherId, action: 'excuse_attendance', at: '2026-06-01 00:30:00+08:00' },
    { key: 'B', user: null, action: UNKNOWN_CODE, at: '2026-05-31 23:59:59+08:00' },
    { key: 'C', user: made.teacherId, action: 'login', at: '2026-06-01 23:59:59+08:00' },
    { key: 'D', user: made.teacherId, action: 'login', at: '2026-06-02 00:00:00+08:00' },
  ];
  const ids = {};
  for (const f of FIX) {
    const [result] = await pool.query(
      'INSERT INTO activity_logs (user_id, action, description, created_at) VALUES (?, ?, ?, ?)',
      [f.user, f.action, SENTINEL, f.at]
    );
    ids[f.key] = result.insertId;
    made.logIds.push(result.insertId);
  }
  requireFixture(made.logIds.length === 4, 'four fabricated rows in the window');

  const list = (params) => get(`/api/activity-logs${qs(params)}`, adminToken);
  const idsOf = (res) => (res.data?.entries || []).map((e) => e.id);

  console.log('\n-- the window: Manila days, the fields, the filters --');
  const june1 = await list({ from: '2026-06-01', to: '2026-06-01' });
  assert(june1.status === 200, 'admin reads one day', `got ${june1.status}`);
  assert(JSON.stringify(idsOf(june1)) === JSON.stringify([ids.C, ids.A]), "1 June holds 23:59:59 then 00:30, newest first, and nothing else");
  assert(june1.data?.page?.total === 2, 'its total is 2');
  assert(june1.data?.entries?.every((e) => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(ENTRY_KEYS)), 'every entry is exactly the seven fields');
  assert(!june1.text.includes(SENTINEL) && !june1.text.includes('"description"'), 'no description, no sentinel in the JSON');
  const a = june1.data.entries.find((e) => e.id === ids.A) || {};
  assert(a.actor_name === teacherName && a.actor_role === 'teacher', "an entry names its account and the account's role");
  assert(a.action === 'excuse_attendance' && a.action_label === 'Attendance set by an excuse decision' && a.action_group === 'attendance', "the server's label and group");
  assert(new Date(a.created_at).toISOString() === '2026-05-31T16:30:00.000Z', 'created_at is the instant');
  assert(june1.data?.export_limit?.max === 50000 && june1.data?.export_limit?.message === null, 'export_limit under the cap carries no refusal');

  const may31 = await list({ from: '2026-05-31', to: '2026-05-31' });
  assert(JSON.stringify(idsOf(may31)) === JSON.stringify([ids.B]), '23:59:59 on 31 May belongs to 31 May');
  const b = may31.data?.entries?.[0] || {};
  assert(b.actor_name === null && b.actor_role === null, 'no account: name and role null');
  assert(b.action_label === UNKNOWN_CODE && b.action_group === 'other', 'an unknown code lists, its own label, in Other');
  const june2 = await list({ from: '2026-06-02', to: '2026-06-02' });
  assert(JSON.stringify(idsOf(june2)) === JSON.stringify([ids.D]), 'midnight belongs to the day it begins');

  const page1 = await list({ from: '2026-06-01', to: '2026-06-01', limit: '1' });
  assert(JSON.stringify(idsOf(page1)) === JSON.stringify([ids.C]) && page1.data?.page?.total === 2 && page1.data?.page?.has_more === true, 'paging: page 1 of 2');
  const page2 = await list({ from: '2026-06-01', to: '2026-06-01', limit: '1', offset: '1' });
  assert(JSON.stringify(idsOf(page2)) === JSON.stringify([ids.A]) && page2.data?.page?.has_more === false, 'paging: page 2 of 2');
  const page3 = await list({ from: '2026-06-01', to: '2026-06-01', limit: '1', offset: '2' });
  assert(idsOf(page3).length === 0 && page3.data?.page?.total === 2, 'paging: past the end is empty, the total kept');

  const span = { from: '2026-05-31', to: '2026-06-02' };
  const cases = [
    [{ role: 'teacher' }, [ids.D, ids.C, ids.A], 'role=teacher'],
    [{ role: 'deleted' }, [ids.B], 'role=deleted (no account)'],
    [{ role: 'admin' }, [], 'role=admin'],
    [{ action: 'excuse_attendance' }, [ids.A], 'action=excuse_attendance'],
    [{ group: 'attendance' }, [ids.A], 'group=attendance'],
    [{ group: 'other' }, [ids.B], 'group=other'],
    [{ action: 'login' }, [ids.D, ids.C], 'action=login'],
    [{ action: 'login', role: 'teacher' }, [ids.D, ids.C], 'two filters together'],
  ];
  for (const [extra, expected, label] of cases) {
    const res = await list({ ...span, ...extra });
    assert(JSON.stringify(idsOf(res)) === JSON.stringify(expected), `the window, ${label}`, `got ${idsOf(res).join(',')}`);
  }

  console.log("\n-- today's real rows: invariants --");
  const today = manilaToday();
  const week = { from: manilaParts(new Date(manilaDayStart(today).getTime() - 6 * 86400000)).date, to: today };
  const recent = await list({ ...week, limit: '200' });
  const entries = recent.data?.entries || [];
  assert(recent.status === 200 && entries.length > 0, 'the last 7 days hold rows (this run signed in)');
  assert(entries.every((e) => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(ENTRY_KEYS)), 'every real entry is exactly the seven fields');
  assert(!recent.text.includes('"description"') && !recent.text.includes('"user_id"') && !recent.text.includes('"login_id"'), 'no description, user_id or login_id key');
  assert(
    entries.every((e, i) => i === 0 || new Date(entries[i - 1].created_at) > new Date(e.created_at) || (+new Date(entries[i - 1].created_at) === +new Date(e.created_at) && entries[i - 1].id > e.id)),
    'newest first: created_at, then id'
  );
  for (const [extra, test, label] of [
    [{ role: 'teacher' }, (e) => e.actor_role === 'teacher', 'role=teacher → every row a teacher account'],
    [{ role: 'admin' }, (e) => e.actor_role === 'admin', 'role=admin → every row the admin'],
    [{ role: 'deleted' }, (e) => e.actor_name === null && e.actor_role === null, 'role=deleted → every row without an account'],
    [{ group: 'account' }, (e) => e.action_group === 'account', 'group=account → every row in its group'],
  ]) {
    const res = await list({ ...week, limit: '200', ...extra });
    assert(res.status === 200 && (res.data?.entries || []).every(test), label);
  }
  const excuse = await list({ action: 'excuse_attendance', limit: '200' });
  assert(excuse.status === 200 && excuse.data.entries.every((e) => e.action === 'excuse_attendance' && e.action_group === 'attendance'), 'action=excuse_attendance, all dates → every row that action');

  console.log('\n-- refusals --');
  for (const [params, label] of [
    [{ from: '2026-02-30' }, 'a day that does not exist'],
    [{ from: '2026-10-24', to: '2026-10-23' }, 'from after to'],
    [{ to: '23/10/2026' }, 'a date in another shape'],
    [{ role: 'student' }, 'an unknown role'],
    [{ action: 'DROP TABLE' }, 'an action that is not a code'],
    [{ action: 'login', group: 'grades' }, 'action and group together'],
    [{ group: 'nope' }, 'an unknown group'],
    [{ limit: '0' }, 'limit 0'],
    [{ limit: '201' }, 'limit 201'],
    [{ offset: '-1' }, 'a negative offset'],
    [{ sort: 'created_at' }, 'sort'],
    [{ order: 'asc' }, 'order'],
  ]) {
    const res = await list(params);
    assert(res.status === 400 && typeof res.data?.message === 'string', `400: ${label}`, `got ${res.status}`);
  }
  const exportLimit = await get(`/api/activity-logs/export${qs({ ...span, limit: '5' })}`, adminToken);
  assert(exportLimit.status === 400, '400: the export takes no limit');

  console.log('\n-- the filter options --');
  const actions = await get('/api/activity-logs/actions', adminToken);
  const groups = actions.data?.groups || [];
  assert(actions.status === 200 && groups.length >= 11, 'the catalogue answers');
  const listed = new Set(groups.flatMap((g) => (g.actions || []).map((x) => x.code)));
  assert(knownCodes().every((c) => listed.has(c)), 'every mapped code is an option');
  assert(groups.find((g) => g.key === 'attendance')?.actions?.some((x) => x.code === 'excuse_attendance'), 'excuse_attendance under Attendance');
  assert(groups.find((g) => g.key === 'other')?.actions?.some((x) => x.code === UNKNOWN_CODE && x.label === UNKNOWN_CODE), "a code the map does not know is offered under Other");

  console.log('\n-- the download --');
  const origin = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const csv = await get(`/api/activity-logs/export${qs(span)}`, adminToken, origin ? { Origin: origin } : undefined);
  assert(csv.status === 200, 'the export answers', `got ${csv.status}`);
  assert(/^text\/csv; charset=utf-8$/i.test(csv.headers.get('content-type') || ''), 'text/csv; charset=utf-8');
  assert(csv.headers.get('content-disposition') === 'attachment; filename="activity-log_2026-05-31_to_2026-06-02.csv"', 'the file name names the range');
  if (origin) {
    assert(/content-disposition/i.test(csv.headers.get('access-control-expose-headers') || ''), 'CORS exposes Content-Disposition to the web');
  } else {
    console.log('  skip CORS_ORIGIN is not set, so the exposed header is not checked');
  }
  assert(csv.buffer[0] === 0xef && csv.buffer[1] === 0xbb && csv.buffer[2] === 0xbf, 'UTF-8 BOM first');
  const body = csv.text.replace(/^﻿/, '');
  assert(!/(^|[^\r])\n/.test(body) && body.endsWith('\r\n'), 'CRLF between records, none bare');
  const lines = body.split('\r\n').filter(Boolean);
  assert(lines[0] === CSV_HEADER, 'the header row');
  const cells = (line) => line.slice(1, -1).split('","').map((c) => c.replace(/""/g, '"'));
  const data = lines.slice(1).map(cells);
  assert(JSON.stringify(data.map((r) => Number(r[0]))) === JSON.stringify([ids.D, ids.C, ids.A, ids.B]), 'exactly the window, newest first');
  const rowA = data.find((r) => Number(r[0]) === ids.A) || [];
  assert(rowA[1] === '2026-06-01' && rowA[2] === '00:30:00', 'Manila date and time');
  assert(rowA[3] === `'${teacherName}`, 'the formula guard on a name that starts with "="');
  assert(rowA[4] === 'Teacher' && rowA[5] === 'Attendance' && rowA[6] === 'Attendance set by an excuse decision' && rowA[7] === 'excuse_attendance', 'role, group, label and code');
  const rowB = data.find((r) => Number(r[0]) === ids.B) || [];
  assert(rowB[3] === 'Deleted account' && rowB[4] === '' && rowB[5] === 'Other' && rowB[6] === UNKNOWN_CODE, 'a row without an account');
  assert(!csv.text.includes(SENTINEL), 'no description, no sentinel in the CSV');

  const mine = await list({ action: 'export_activity_log', role: 'admin', from: today, to: today });
  assert(mine.data?.entries?.some((e) => new Date(e.created_at) >= runStart), 'the download wrote its own export_activity_log row');

  console.log(`\n${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  return failed;
}

async function cleanup() {
  if (made.logIds.length) {
    const [res] = await pool.query(`DELETE FROM activity_logs WHERE id IN (${made.logIds.map(() => '?').join(', ')})`, made.logIds);
    console.log(`cleanup: the ${res.affectedRows} fabricated activity_logs row(s) deleted by id`);
    const [[left]] = await pool.query(`SELECT COUNT(*) AS n FROM activity_logs WHERE id IN (${made.logIds.map(() => '?').join(', ')})`, made.logIds);
    if (Number(left.n) !== 0) {
      console.error(`cleanup FAILED: ${left.n} fabricated row(s) remain`);
      process.exitCode = 1;
    }
  }
  if (made.teacherId) {
    // Its rows in tables that cascade or set null go with it; none of its own
    // were written (it never signed in).
    await pool.query('DELETE FROM notifications WHERE user_id = ?', [made.teacherId]);
    const [res] = await pool.query("DELETE FROM users WHERE id = ? AND role = 'teacher'", [made.teacherId]);
    console.log(`cleanup: the temporary teacher deleted (${res.affectedRows})`);
  }
}

async function verifyBaseline() {
  if (!made.marks) return;
  const above = [];
  for (const table of MARKED) {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE id > ?`, [made.marks[table]]);
    if (Number(row.n) !== 0) above.push(`${table} ${row.n}`);
  }
  if (above.length) {
    console.error(`cleanup FAILED: rows above the run's start marks: ${above.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`cleanup: ${MARKED.join(', ')} hold no row above the run's start marks`);
  }
}

async function main() {
  let failures = 1;
  try {
    failures = await run();
  } catch (error) {
    console.error('Run stopped:', error.message);
  } finally {
    await cleanup();
    await policy.cleanup();
    await verifyBaseline();
    await pool.end?.();
  }
  process.exit(failures || process.exitCode ? 1 : 0);
}

main();
