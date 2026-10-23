// MIGRATION — D-102's demo data (B7, chore/pre-migration, 2026-10-24): Nino's
// five seeded Grade 1 letters reproduced by scores and highest possible scores.
// Modelled on scripts/migrate-notifications.js, THE MIGRATION TEMPLATE
// (CLAUDE.md → File rules that bite): never drops, idempotent and PROVED so
// (--print-state), announces applied / already present per row. No schema
// change, so nothing to mirror into database/schema.sql; a fresh
// `npm run db:setup` writes the same rows through the same module
// (scripts/demoGrade1.js).
//
// ONE TRANSACTION, GUARDED (the owner's C5): it may only add one Written Work
// and one Performance Task slot and their two components per applied row, and
// update that row's own summative and computed columns. Before COMMIT it checks
// that `grades` and `notifications` kept their counts and that
// `assessment_slots` and `grade_components` grew by exactly two per applied
// row — on the live database, 0 -> 10 each. Anything else rolls back, prints
// why, and exits 1. It writes no activity_logs row (C5: no other row changes).
//
// Run from server/ (the worktree has no .env of its own — point --env-file at
// the main tree's):
//   node --env-file=<main>\server\.env scripts/migrate-demo-grade1.js
//   node --env-file=<main>\server\.env scripts/migrate-demo-grade1.js --print-state
//
// A live-DB write: GET /api/health must answer and POST /api/backups must
// return 201 first (CLAUDE.md → working agreement).

require('dotenv').config();
const mysql = require('mysql2/promise');
const { applyDemoGrade1, ROWS, LEARNER, SCHOOL_YEAR } = require('./demoGrade1');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

async function counts(conn) {
  const out = {};
  for (const table of ['grades', 'notifications', 'assessment_slots', 'grade_components']) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    out[table] = Number(n);
  }
  return out;
}

// The idempotency evidence: the five rows as they stand. Two runs after an
// apply must print the same thing.
async function printState(conn) {
  const [rows] = await conn.query(
    `SELECT sub.name AS subject, g.term, g.descriptive_grade, g.initial_grade,
            g.ex_st1, g.ex_st2, g.ex_te,
            (SELECT COUNT(*) FROM grade_components gc WHERE gc.grade_id = g.id) AS components
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       JOIN students s ON s.id = g.student_id
      WHERE s.first_name = ? AND s.last_name = ? AND s.grade_level = ? AND s.section = ? AND g.school_year = ?
      ORDER BY sub.display_order, g.term`,
    [LEARNER.first_name, LEARNER.last_name, LEARNER.grade_level, LEARNER.section, SCHOOL_YEAR]
  );
  const [[{ slots }]] = await conn.query(
    'SELECT COUNT(*) AS slots FROM assessment_slots WHERE grade_level = ? AND section = ? AND school_year = ?',
    [LEARNER.grade_level, LEARNER.section, SCHOOL_YEAR]
  );
  console.log(`demo learner's ${SCHOOL_YEAR} rows:`);
  for (const r of rows) {
    const scores = r.ex_st1 === null ? 'no summative scores' : `summative ${Number(r.ex_st1)} / ${Number(r.ex_st2)} / ${Number(r.ex_te)}`;
    const ig = r.initial_grade === null ? 'no Initial Grade' : `Initial Grade ${Number(r.initial_grade).toFixed(2)}`;
    console.log(`  ${r.subject} term ${r.term}: ${r.descriptive_grade ?? 'no letter'} | ${ig} | ${scores} | components ${r.components}`);
  }
  console.log(`  slots on Grade ${LEARNER.grade_level} - ${LEARNER.section}: ${slots}`);
  const c = await counts(conn);
  console.log(`table counts: grades ${c.grades}, notifications ${c.notifications}, assessment_slots ${c.assessment_slots}, grade_components ${c.grade_components}`);
}

async function main() {
  const stateOnly = process.argv.includes('--print-state');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
  });

  try {
    if (stateOnly) {
      await printState(conn);
      return;
    }

    await conn.beginTransaction();
    try {
      const before = await counts(conn);
      const results = await applyDemoGrade1(conn);
      const after = await counts(conn);
      const applied = results.filter((r) => r.state === 'applied').length;

      const problems = [];
      if (after.grades !== before.grades) problems.push(`grades ${before.grades} -> ${after.grades}`);
      if (after.notifications !== before.notifications) problems.push(`notifications ${before.notifications} -> ${after.notifications}`);
      if (after.assessment_slots !== before.assessment_slots + 2 * applied) {
        problems.push(`assessment_slots ${before.assessment_slots} -> ${after.assessment_slots}, expected +${2 * applied}`);
      }
      if (after.grade_components !== before.grade_components + 2 * applied) {
        problems.push(`grade_components ${before.grade_components} -> ${after.grade_components}, expected +${2 * applied}`);
      }
      if (results.length !== ROWS.length) problems.push(`${results.length} rows handled, expected ${ROWS.length}`);
      if (problems.length) throw new Error(`guard failed: ${problems.join('; ')}`);

      await conn.commit();
      for (const r of results) {
        const verb = r.state === 'applied' ? 'applied' : 'already present';
        console.log(`${r.subject} term ${r.term}: ${verb} — ${r.letter}, Initial Grade ${Number(r.initial_grade).toFixed(2)}`);
      }
      console.log(
        `committed: assessment_slots ${before.assessment_slots} -> ${after.assessment_slots}, grade_components ${before.grade_components} -> ${after.grade_components}, grades ${after.grades}, notifications ${after.notifications}`
      );
    } catch (error) {
      await conn.rollback();
      console.log('ROLLED BACK — nothing was written.');
      throw error;
    }

    console.log('');
    await printState(conn);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('migrate-demo-grade1 failed:', error.message);
  process.exitCode = 1;
});
