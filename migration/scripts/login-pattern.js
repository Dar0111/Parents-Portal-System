#!/usr/bin/env node
// CHECK 3's EVIDENCE (Phase B, docs/05 §3b) — the login-id pattern count. The
// three synthetic login ids and the pattern are read IN MEMORY from
// scripts/rehearse.js (the values the check itself uses) and are never
// printed; only labels and booleans are. Every comparison is a SELECT on
// literals, so nothing is written on either engine:
//   MySQL      `? LIKE ?` under users.login_id's own collation (the original
//              route's `login_id LIKE ?`)
//   PG check   `?::text COLLATE "C" ILIKE ?` (rehearse.js's count)
//   PG route   `?::text COLLATE "und-x-icu" ILIKE ?` (routes/users.js)
// plus the copied users matching the pattern, counted on both engines.
//   node scripts/login-pattern.js --target local --source-db <parents_portal_migsrc_*>
const fs = require('fs');
const path = require('path');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client } = require('../lib/pg');
const { scratch } = require('../lib/mysql');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

// string literals with their line (raw bodies, escapes resolved), from a script
function literals(src) {
  const out = [];
  let i = 0; let line = 1; const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j === -1 ? n : j + 2; for (let k = i; k < j; k += 1) if (src[k] === '\n') line += 1; i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; const startLine = line; let j = i + 1; let body = '';
      while (j < n && src[j] !== q) { if (src[j] === '\\') { body += src[j + 1] || ''; j += 2; continue; } if (src[j] === '\n') line += 1; body += src[j]; j += 1; }
      out.push({ line: startLine, body }); i = j + 1; continue;
    }
    i += 1;
  }
  return out;
}

function fixtures() {
  const src = fs.readFileSync(path.join(__dirname, 'rehearse.js'), 'utf8');
  const lits = literals(src);
  const lineOf = (anchor) => {
    const k = src.indexOf(anchor);
    if (k === -1 || src.indexOf(anchor, k + 1) !== -1) throw new Error('rehearse.js anchor not found exactly once');
    return src.slice(0, k).split('\n').length;
  };
  const on = (line, k) => lits.filter((l) => l.line === line)[k].body;
  const firstValue = (sql) => /VALUES \('([^']*)'/.exec(sql)[1];
  // each INSERT's template literal starts on its own line
  const ids = {
    admin: firstValue(on(lineOf('const admin = (await c.query(`'), 0)),
    teacher: firstValue(on(lineOf('const teacher = (await c.query(`'), 0)),
    parent: firstValue(on(lineOf('const parent = (await c.query(`'), 0)),
  };
  const pattern = on(lineOf('const likeColl = await tryqKeep(c,'), 1);
  return { ids, pattern };
}

async function main() {
  const target = targetConfig();
  if (!isDisposableLocal(target)) throw new Error('login-pattern runs on the disposable local target only (--target local).');
  const sourceDb = arg('--source-db');
  if (!/^parents_portal_migsrc_[0-9_]+$/.test(sourceDb || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch.');
  const { ids, pattern } = fixtures();
  const my = await scratch(sourceDb);
  const pg = await client(target.pg);
  const rows = [];
  let failures = 0;
  try {
    const [[col]] = await my.query("SELECT COLLATION_NAME AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_id'");
    const coll = col.k;
    if (!/^[a-z0-9_]+$/.test(coll)) throw new Error('unexpected collation name');
    const m = async (value, pat) => Number((await my.query(`SELECT (? COLLATE ${coll}) LIKE ? AS r`, [value, pat]))[0][0].r) === 1;
    const c = async (value, pat) => (await pg.query('SELECT $1::text COLLATE "C" ILIKE $2 AS r', [value, pat])).rows[0].r;
    const u = async (value, pat) => (await pg.query('SELECT $1::text COLLATE "und-x-icu" ILIKE $2 AS r', [value, pat])).rows[0].r;
    const cLike = async (value, pat) => (await pg.query('SELECT $1::text COLLATE "C" LIKE $2 AS r', [value, pat])).rows[0].r;
    const row = async (label, value, pat, expect) => {
      const r = { label, mysql: await m(value, pat), pg_check: await c(value, pat), pg_route: await u(value, pat), expect };
      r.ok = r.mysql === expect && r.pg_check === expect && r.pg_route === expect;
      if (!r.ok) failures += 1;
      rows.push(r);
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${label}: MySQL ${r.mysql}, PG check ${r.pg_check}, PG route ${r.pg_route} (expected ${expect})`);
    };

    // the pattern itself (facts, not its text)
    const facts = {
      ends_with_percent: pattern.endsWith('%'),
      starts_with_percent: pattern.startsWith('%'),
      holds_a_hyphen: pattern.includes('-'),
      holds_underscore_or_backslash: /[_\\]/.test(pattern),
      lowercase_only: pattern === pattern.toLowerCase(),
    };
    console.log(`the pattern: ${JSON.stringify(facts)}`);
    const id = (role) => ids[role];
    console.log(`the fixtures: hyphen in admin ${id('admin').includes('-')}, teacher ${id('teacher').includes('-')}, parent ${id('parent').includes('-')}; admin and teacher uppercase-only ${id('admin') === id('admin').toUpperCase() && id('teacher') === id('teacher').toUpperCase()}`);

    // 1. the three fixtures against the pattern as the check binds it
    await row('admin id matches the pattern', id('admin'), pattern, true);
    await row('teacher id matches the pattern', id('teacher'), pattern, true);
    await row('parent id (no hyphen) does not match', id('parent'), pattern, false);
    // 2. case: the same pattern in capitals matches the same ids on every form
    await row('admin id matches the pattern in capitals', id('admin'), pattern.toUpperCase(), true);
    await row('parent id does not match the pattern in capitals', id('parent'), pattern.toUpperCase(), false);
    const caseSensitive = { admin: await cLike(id('admin'), pattern), teacher: await cLike(id('teacher'), pattern) };
    console.log(`case-SENSITIVE control (PG COLLATE "C" LIKE, not ILIKE): admin ${caseSensitive.admin}, teacher ${caseSensitive.teacher} — expected false, false`);
    if (caseSensitive.admin || caseSensitive.teacher) failures += 1;
    // 3. wildcards: _ is one character, % any run, on every form
    await row('the hyphen replaced by _ still matches the admin id', id('admin'), pattern.replace('-', '_'), true);
    await row('the hyphen replaced by _ still does not match the parent id', id('parent'), pattern.replace('-', '_'), false);
    await row('a leading % keeps the admin match', id('admin'), `%${pattern}`, true);
    await row('_ needs exactly one character', 'ab', 'a_b', false);
    await row('% matches an empty run', 'ab', 'a%b', true);
    // 4. escaping: a backslash makes _ and % literal, on every form
    await row('\\_ matches a literal underscore', 'ab_cd', 'ab\\_cd', true);
    await row('\\_ refuses another character', 'abxcd', 'ab\\_cd', false);
    await row('\\% matches a literal percent', 'ab%cd', 'ab\\%cd', true);
    await row('\\% refuses another character', 'abxcd', 'ab\\%cd', false);
    // 5. collation: accents (login ids are ASCII; recorded, not relied on)
    const accent = { mysql: await m('é1', 'e%'), pg_check: await c('é1', 'e%'), pg_route: await u('é1', 'e%') };
    console.log(`accent (é against e%), recorded: MySQL ${accent.mysql}, PG check ${accent.pg_check}, PG route ${accent.pg_route} — login ids are ASCII, so the count does not depend on it`);
    // 6. the copied users that match the pattern, on both engines
    const [[mr]] = await my.query('SELECT COUNT(*) AS n FROM users WHERE login_id LIKE ?', [pattern]);
    const pc = (await pg.query('SELECT COUNT(*)::int AS n FROM portal.users WHERE login_id COLLATE "C" ILIKE $1', [pattern])).rows[0].n;
    const pu = (await pg.query('SELECT COUNT(*)::int AS n FROM portal.users WHERE login_id COLLATE "und-x-icu" ILIKE $1', [pattern])).rows[0].n;
    console.log(`copied users matching the pattern: MySQL ${Number(mr.n)}, PG check ${pc}, PG route ${pu} (expected 0 on all three, so the check's count is the fixtures' 2)`);
    if (Number(mr.n) || pc || pu) failures += 1;
    const report = { facts, rows, caseSensitive, accent, copied_matches: [Number(mr.n), pc, pu], failures };
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const out = path.join(P.REHEARSAL_DIR, `login_pattern_${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`${failures ? `LOGIN PATTERN: ${failures} failure(s)` : 'LOGIN PATTERN OK'} — report: ${out}`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    await my.end();
    await pg.end();
  }
}

main().catch((e) => {
  console.error('login-pattern failed:', safeMessage(e));
  process.exit(1);
});
