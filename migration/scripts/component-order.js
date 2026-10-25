#!/usr/bin/env node
// REVIEW FINDING grades-1 (P3-C-R2 Phase F) — the order of a grade's
// components in GET /api/grades/:id, on both engines over the SAME rows.
//
// The ORIGINAL statement (server/routes/grades.js at 5426b70, read from git)
// runs on the MySQL scratch; the PORTED statement (this tree's
// server/routes/grades.js, numbered by config/db.js's toPg) on the local
// PostgreSQL copy, which the transfer made from that scratch — so the grade
// and every existing component carry the same ids on both. Inside ONE
// transaction per engine, ROLLED BACK, three LEGACY components (no slot) are
// added to one grade that already has slotted ones: one with no date, two
// dated. MySQL puts NULLs first ascending, so the legacy rows lead the card;
// PostgreSQL puts them last unless the statement says NULLS FIRST.
//
// The two orders must be identical. A separate connection then confirms the
// fixture rows are gone. Rows print as descriptors only (legacy:<n> or
// slot:<type>:<slot_no>:#<id>).
//   node scripts/component-order.js --target local --source-db <parents_portal_migsrc_*> [--control no-nulls-first]
// --control removes NULLS FIRST from the PORTED statement in memory — a
// negative control: the run must then FAIL.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client } = require('../lib/pg');
const { scratch } = require('../lib/mysql');
const { safeMessage } = require('../lib/safeMessage');

const ROOT = path.join(__dirname, '..', '..');
const ORIGINAL_REV = '5426b70';
// Three legacy rows: [fixture number, type, date_recorded].
const LEGACY = [
  [1, 'PT', '2026-09-01'],
  [2, 'WW', null],
  [3, 'WW', '2026-08-01'],
];
const PICK = `SELECT g.id FROM grades g
  WHERE EXISTS (SELECT 1 FROM grade_components c WHERE c.grade_id = g.id AND c.slot_id IS NOT NULL)
  ORDER BY g.id LIMIT 1`;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function only(re, text, what) {
  const all = [...text.matchAll(new RegExp(re.source, 'g'))];
  if (all.length !== 1) throw new Error(`${what}: expected exactly one match, found ${all.length}`);
  return all[0][1];
}

const STATEMENT = /`(SELECT c\.\*, s\.name AS slot_name, s\.slot_no, s\.type AS slot_type\s+FROM grade_components c\s+LEFT JOIN assessment_slots s ON s\.id = c\.slot_id\s+WHERE c\.grade_id = \?\s+ORDER BY [^`]+)`/;

function statements() {
  const original = execFileSync('git', ['-C', ROOT, 'show', `${ORIGINAL_REV}:server/routes/grades.js`], { encoding: 'utf8' });
  const ported = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'grades.js'), 'utf8');
  return { mysql: only(STATEMENT, original, 'the original components read'), pg: only(STATEMENT, ported, 'the ported components read') };
}

function describe(rows, fixtureIds) {
  return rows.map((r) => (fixtureIds[r.id] ? `legacy:${fixtureIds[r.id]}` : r.slot_id == null ? `legacy:#${r.id}` : `slot:${r.slot_type}:${r.slot_no}:#${r.id}`));
}

async function onMysql(db, sql) {
  const c = await scratch(db);
  const out = {};
  try {
    await c.query('START TRANSACTION');
    const [[g]] = await c.query(PICK);
    out.grade = g.id;
    const fixtureIds = {};
    for (const [n, type, date] of LEGACY) {
      const [r] = await c.query(
        'INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, label, date_recorded) VALUES (?, NULL, ?, 1, 10, ?, ?)',
        [g.id, type, `order probe ${n}`, date]
      );
      fixtureIds[r.insertId] = n;
    }
    const [rows] = await c.query(sql, [g.id]);
    out.order = describe(rows, fixtureIds);
    await c.query('ROLLBACK');
  } finally {
    await c.end();
  }
  const v = await scratch(db);
  try {
    const [[left]] = await v.query("SELECT COUNT(*) AS n FROM grade_components WHERE label LIKE 'order probe %'");
    out.left_after_rollback = Number(left.n);
  } finally {
    await v.end();
  }
  return out;
}

async function onPg(cfg, sqlText) {
  const { toPg } = require('../../server/config/db');
  const c = await client(cfg);
  const out = {};
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL search_path = portal, public');
    const g = (await c.query(PICK)).rows[0];
    out.grade = g.id;
    const fixtureIds = {};
    for (const [n, type, date] of LEGACY) {
      const r = await c.query(
        'INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, label, date_recorded) VALUES ($1, NULL, $2, 1, 10, $3, $4) RETURNING id',
        [g.id, type, `order probe ${n}`, date]
      );
      fixtureIds[r.rows[0].id] = n;
    }
    const q = toPg(sqlText, [g.id]);
    const rows = (await c.query(q.text, q.values)).rows;
    out.order = describe(rows, fixtureIds);
    await c.query('ROLLBACK');
  } finally {
    await c.end();
  }
  const v = await client(cfg);
  try {
    out.left_after_rollback = (await v.query("SELECT COUNT(*)::int AS n FROM portal.grade_components WHERE label LIKE 'order probe %'")).rows[0].n;
  } finally {
    await v.end();
  }
  return out;
}

async function main() {
  const target = targetConfig();
  if (!isDisposableLocal(target)) throw new Error('component-order runs on the disposable local target only (--target local).');
  const sourceDb = arg('--source-db');
  if (!/^parents_portal_migsrc_[0-9_]+$/.test(sourceDb || '')) throw new Error('--source-db must name a parents_portal_migsrc_* scratch.');
  const s = statements();
  const control = arg('--control');
  if (control === 'no-nulls-first') {
    s.pg = s.pg.replace(/ NULLS FIRST/g, '');
    console.log('NEGATIVE CONTROL no-nulls-first: the ported statement without NULLS FIRST — this run must FAIL');
  } else if (control) {
    throw new Error('--control must be no-nulls-first.');
  }
  const my = await onMysql(sourceDb, s.mysql);
  const pg = await onPg(target.pg, s.pg);
  const problems = [];
  if (my.grade !== pg.grade) problems.push('the two engines picked different grades');
  if (my.left_after_rollback !== 0 || pg.left_after_rollback !== 0) problems.push('fixture rows survived a rollback');
  const legacyFirst = (order) => {
    const k = order.findIndex((d) => d.startsWith('slot:'));
    return k === -1 || order.slice(k).every((d) => d.startsWith('slot:'));
  };
  if (!legacyFirst(my.order)) problems.push('on MySQL the legacy rows do not lead (the expectation itself is wrong)');
  const agree = JSON.stringify(my.order) === JSON.stringify(pg.order);
  if (!agree) problems.push('MySQL and PostgreSQL order the components differently');
  console.log(`grade #${my.grade} on MySQL, #${pg.grade} on PostgreSQL`);
  console.log(`MySQL      : ${my.order.join(' > ')}`);
  console.log(`PostgreSQL : ${pg.order.join(' > ')}`);
  console.log(`legacy rows lead on MySQL: ${legacyFirst(my.order)}; on PostgreSQL: ${legacyFirst(pg.order)}; the orders agree: ${agree}`);
  console.log(`fixture rows left after rollback: MySQL ${my.left_after_rollback}, PostgreSQL ${pg.left_after_rollback}`);
  console.log(problems.length ? `COMPONENT ORDER: ${problems.join('; ')}` : 'COMPONENT ORDER OK');
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
  console.error('component-order failed:', safeMessage(e));
  process.exit(1);
});
