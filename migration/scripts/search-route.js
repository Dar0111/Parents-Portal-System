#!/usr/bin/env node
// CHECK 2 THROUGH THE ROUTES (Phase B, docs/05 §3b — Josh's eight
// requirements): GET /api/students?search= on the ORIGINAL API (main at
// 5426b70 on the MySQL scratch: scripts/golden-master.js serve-mysql) and on
// the PORTED API (the local PostgreSQL copy: scripts/serve-pg.js), over ONE
// synthetic learner committed to both databases for the run and deleted by
// id afterwards (confirmed from a second connection).
//
//   node scripts/search-route.js --a http://127.0.0.1:5030 --b http://127.0.0.1:5010 \
//        --source-db <name|latest> [--expect-b-broken]
//
// The learner's name carries accents; the terms are an ASCII spelling of the
// full name, the same in capitals, the ASCII surname, the exact accented first
// name, the learner's LRN (generated for the run, never printed) and a
// negative control that must not match. For every term both APIs must agree
// with the expectation, the matching row must BE the synthetic learner (its
// id), and the response's structure — wrapper keys, the page block, the row's
// keys, value types and values — must be the same on both. Assertions are
// scoped to the synthetic learner: other learners in a response are counted,
// never judged. --expect-b-broken: B runs with the fold broken
// (serve-pg.js --break-fold); the run then PASSES only if B misses the
// learner on every ASCII-for-accented term while A still finds it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scratch } = require('../lib/mysql');
const { client } = require('../lib/pg');
const { localConfig } = require('../lib/env');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');
const { seededAccounts, resolveSourceDb, call, shapeOf, diffShapes, LOOPBACK } = require('./golden-master');

const FIRST = 'Ñoñó';
const LAST = 'Ébañez';
const ROW_KEYS = ['created_at', 'first_name', 'grade_level', 'id', 'last_name', 'lrn', 'section', 'status'];
const PAGE_KEYS = ['has_more', 'limit', 'offset', 'total'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function typeOf(v) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

async function main() {
  const A = arg('--a');
  const B = arg('--b');
  if (!LOOPBACK.test(A || '') || !LOOPBACK.test(B || '')) throw new Error('--a and --b must be loopback base URLs.');
  const brokenB = process.argv.includes('--expect-b-broken');
  const sourceDb = await resolveSourceDb(arg('--source-db'));
  const lrn = `9${String(crypto.randomInt(0, 1e11)).padStart(11, '0')}`;
  const terms = [
    { label: 'ASCII full name', term: 'nono ebanez', a: true, b: !brokenB, accentCase: true },
    { label: 'ASCII full name in capitals', term: 'NONO EBANEZ', a: true, b: !brokenB, accentCase: true },
    { label: 'ASCII surname', term: 'ebanez', a: true, b: !brokenB, accentCase: true },
    { label: 'exact accented first name', term: FIRST, a: true, b: true },
    { label: 'the learner LRN (not printed)', term: lrn, a: true, b: true },
    { label: 'negative control', term: 'nona ebanez', a: false, b: false },
  ];

  const my = await scratch(sourceDb);
  const pg = await client(localConfig());
  const ids = { a: null, b: null };
  const report = { mode: brokenB ? 'B with the fold broken' : 'normal', terms: [], failures: 0 };
  let failures = 0;
  const fail = (what) => {
    failures += 1;
    console.log(`  FAIL ${what}`);
  };
  try {
    // --- the synthetic learner, committed to both, in the same section -------
    const [[sec]] = await my.query('SELECT id, grade_level, name FROM sections ORDER BY id LIMIT 1');
    const pgSec = (await pg.query('SELECT id, grade_level, name FROM portal.sections WHERE id = $1', [sec.id])).rows[0];
    if (!pgSec || pgSec.grade_level !== sec.grade_level || pgSec.name !== sec.name) throw new Error('the section differs between the two databases — transfer again first');
    const [[taken]] = await my.query('SELECT COUNT(*) AS n FROM students WHERE lrn = ?', [lrn]);
    const pgTaken = (await pg.query('SELECT COUNT(*)::int AS n FROM portal.students WHERE lrn = $1', [lrn])).rows[0].n;
    if (Number(taken.n) || pgTaken) throw new Error('the generated LRN exists already; run again');
    const [ins] = await my.query(
      "INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
      [lrn, FIRST, LAST, sec.grade_level, sec.name, sec.id]
    );
    ids.a = ins.insertId;
    ids.b = (await pg.query(
      "INSERT INTO portal.students (lrn, first_name, last_name, grade_level, section, section_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id",
      [lrn, FIRST, LAST, sec.grade_level, sec.name, sec.id]
    )).rows[0].id;
    console.log(`synthetic learner committed: MySQL id ${ids.a}, PostgreSQL id ${ids.b} (${report.mode})`);

    // --- the admin on both ---------------------------------------------------
    const admin = seededAccounts().admin;
    const tokens = {};
    for (const [side, base] of [['a', A], ['b', B]]) {
      const login = await call(base, 'POST', '/api/auth/login', { body: { login_id: admin.login, password: admin.password } });
      if (login.status !== 200 || !login.json || !login.json.token) throw new Error(`sign-in on ${side.toUpperCase()} answered ${login.status}`);
      tokens[side] = login.json.token;
      const me = await call(base, 'GET', '/api/auth/me', { token: tokens[side] });
      const u = (me.json && me.json.user) || {};
      if (u.policy_pending || u.contact_pending || Number(u.must_change_password) === 1) throw new Error(`the admin on ${side.toUpperCase()} is held at a first-sign-in step — BLOCKED`);
    }

    // --- every term on both --------------------------------------------------
    for (const t of terms) {
      const urlPath = `/api/students?search=${encodeURIComponent(t.term)}&limit=200`;
      const ra = await call(A, 'GET', urlPath, { token: tokens.a });
      const rb = await call(B, 'GET', urlPath, { token: tokens.b });
      const entry = { label: t.label, expected: { a: t.a, b: t.b }, status: [ra.status, rb.status] };
      console.log(`${t.label}:`);
      for (const [side, r] of [['a', ra], ['b', rb]]) {
        if (r.status !== 200 || !r.json || r.json.success !== true) { fail(`${side.toUpperCase()} answered ${r.status}`); continue; }
        if (JSON.stringify(Object.keys(r.json).sort()) !== JSON.stringify(['page', 'students', 'success'])) fail(`${side.toUpperCase()} wrapper keys`);
        const page = r.json.page || {};
        if (JSON.stringify(Object.keys(page).sort()) !== JSON.stringify(PAGE_KEYS)) fail(`${side.toUpperCase()} page keys`);
        if (!['limit', 'offset', 'total'].every((k) => Number.isInteger(page[k])) || typeof page.has_more !== 'boolean') fail(`${side.toUpperCase()} page types`);
      }
      const rows = { a: ((ra.json && ra.json.students) || []).filter((r) => r.id === ids.a), b: ((rb.json && rb.json.students) || []).filter((r) => r.id === ids.b) };
      entry.found = { a: rows.a.length === 1, b: rows.b.length === 1 };
      entry.other_learners_returned = [((ra.json && ra.json.students) || []).length - rows.a.length, ((rb.json && rb.json.students) || []).length - rows.b.length];
      if (rows.a.length > 1 || rows.b.length > 1) fail('the synthetic learner appears twice');
      if (entry.found.a !== t.a) fail(`A ${t.a ? 'did not find' : 'found'} the synthetic learner`);
      if (entry.found.b !== t.b) fail(`B ${t.b ? 'did not find' : 'found'} the synthetic learner${brokenB && t.accentCase ? ' (the broken fold must miss it)' : ''}`);
      if (rows.a[0] && rows.b[0]) {
        const ka = Object.keys(rows.a[0]).sort();
        const kb = Object.keys(rows.b[0]).sort();
        if (JSON.stringify(ka) !== JSON.stringify(ROW_KEYS) || JSON.stringify(kb) !== JSON.stringify(ROW_KEYS)) fail('the row keys differ from the list contract');
        for (const k of ROW_KEYS) if (typeOf(rows.a[0][k]) !== typeOf(rows.b[0][k])) fail(`the type of ${k} differs`);
        for (const k of ['first_name', 'last_name', 'grade_level', 'section', 'status', 'lrn']) if (rows.a[0][k] !== rows.b[0][k]) fail(`the value of ${k} differs`);
        if (rows.a[0].first_name !== FIRST || rows.b[0].last_name !== LAST) fail('the returned name is not the synthetic learner');
        if (Number.isNaN(Date.parse(rows.a[0].created_at)) || Number.isNaN(Date.parse(rows.b[0].created_at))) fail('created_at is not an instant');
        entry.row_types = Object.fromEntries(ROW_KEYS.map((k) => [k, typeOf(rows.b[0][k])]));
      }
      if (ra.json && rb.json && (!brokenB || !t.accentCase)) {
        const diffs = diffShapes(shapeOf(ra.json), shapeOf(rb.json));
        entry.shape_differences = diffs.length;
        if (diffs.length) fail(`${diffs.length} response path(s) differ in type`);
      }
      console.log(`  A found ${entry.found.a} (expected ${t.a}), B found ${entry.found.b} (expected ${t.b}); other learners returned ${entry.other_learners_returned.join('/')}`);
      report.terms.push(entry);
    }
  } finally {
    // --- the synthetic learner deleted by id, confirmed from new connections --
    if (ids.a) await my.query('DELETE FROM students WHERE id = ?', [ids.a]);
    if (ids.b) await pg.query('DELETE FROM portal.students WHERE id = $1', [ids.b]);
    await my.end();
    await pg.end();
    const v1 = await scratch(sourceDb);
    const v2 = await client(localConfig());
    try {
      const [[m]] = await v1.query('SELECT COUNT(*) AS n FROM students WHERE id = ? OR lrn = ?', [ids.a || 0, lrn]);
      const p = (await v2.query('SELECT COUNT(*)::int AS n FROM portal.students WHERE id = $1 OR lrn = $2', [ids.b || 0, lrn])).rows[0].n;
      report.cleanup_left = [Number(m.n), p];
      console.log(`cleanup: rows left by id or LRN — MySQL ${Number(m.n)}, PostgreSQL ${p}`);
      if (Number(m.n) || p) fail('the synthetic learner was not removed');
    } finally {
      await v1.end();
      await v2.end();
    }
  }
  report.failures = failures;
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = path.join(P.REHEARSAL_DIR, `search_route_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`${failures ? `SEARCH ROUTE: ${failures} failure(s)` : 'SEARCH ROUTE OK'} (${report.mode}) — report: ${out}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error('search-route failed:', safeMessage(e));
  process.exit(1);
});
