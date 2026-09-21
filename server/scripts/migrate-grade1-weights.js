// MIGRATION: Grade 1 gets grade_weight_configs rows (2026-09-22).
//
// Follows the convention set by scripts/migrate-notifications.js, the first
// migration this repo had: NEVER DROP ANYTHING, be idempotent and PROVE it,
// announce per object, and mirror into the seed so a clean db:setup produces
// the same shape. The seed half is done in the same dispatch
// (database/seed.sql).
//
// WHY: the school answered on 2026-09-22 that a Grade 1 letter is COMPUTED,
// from WW 30 / PT 50 / Summative 20 banded on the raw weighted score
// (GRADING_SPEC §6a). recomputeGrade reads a weight row for every mode now,
// so Grade 1 needs one per learning area or every Grade 1 score write answers
// 409 "no grade_weight_configs row exists".
//
// This REVERSES the rule the seed used to enforce — that descriptive grades
// get no weight rows at all — and the reversal is the school's, not a
// refactor. See seed.sql's rewritten rationale.
//
// The CHECK on grade_weight_configs requires ww + pt + ex = 100.00, and
// 30 + 50 + 20 satisfies it. `ex_weight` holds the SUMMATIVE weight for
// Grade 1; the column keeps its numerical name because the three ex_* score
// columns on `grades` do too.
//
// Run:  node scripts/migrate-grade1-weights.js
//       node scripts/migrate-grade1-weights.js --print-state
//   or: npm run db:migrate:grade1-weights

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';
const SCHOOL_YEAR = '2026-2027';
const GRADE_LEVEL = 1;
const WW = 30.0;
const PT = 50.0;
const EX = 20.0;

async function grade1Subjects(conn) {
  const [rows] = await conn.query('SELECT id, name FROM subjects WHERE grade_level = ? ORDER BY id', [GRADE_LEVEL]);
  return rows;
}

async function printState(conn) {
  const [rows] = await conn.query(
    `SELECT s.grade_level, COUNT(w.id) AS weight_rows, COUNT(s.id) AS subjects
       FROM subjects s
       LEFT JOIN grade_weight_configs w ON w.subject_id = s.id AND w.school_year = ?
      GROUP BY s.grade_level ORDER BY s.grade_level`,
    [SCHOOL_YEAR]
  );
  console.log('STATE — weight rows per grade level:');
  for (const r of rows) {
    console.log(`  Grade ${r.grade_level}: ${r.weight_rows} of ${r.subjects} subjects`);
  }
  const [g1] = await conn.query(
    `SELECT s.name, w.ww_weight, w.pt_weight, w.ex_weight
       FROM subjects s
       LEFT JOIN grade_weight_configs w ON w.subject_id = s.id AND w.school_year = ?
      WHERE s.grade_level = ? ORDER BY s.id`,
    [SCHOOL_YEAR, GRADE_LEVEL]
  );
  console.log('STATE — Grade 1, per subject:');
  for (const r of g1) {
    const weights = r.ww_weight === null ? 'NO ROW' : `${r.ww_weight}/${r.pt_weight}/${r.ex_weight}`;
    console.log(`  ${r.name.padEnd(22)} ${weights}`);
  }
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

    const subjects = await grade1Subjects(conn);
    if (!subjects.length) {
      console.error(`ABORT — no Grade ${GRADE_LEVEL} subjects exist. This is not the database this expects.`);
      process.exitCode = 1;
      return;
    }

    let created = 0;
    let already = 0;
    for (const subject of subjects) {
      const [existing] = await conn.query(
        'SELECT id, ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE subject_id = ? AND school_year = ? LIMIT 1',
        [subject.id, SCHOOL_YEAR]
      );
      if (existing.length) {
        const row = existing[0];
        const matches =
          Number(row.ww_weight) === WW && Number(row.pt_weight) === PT && Number(row.ex_weight) === EX;
        // A row that exists with DIFFERENT weights is not this migration's to
        // overwrite — that is somebody's deliberate configuration, and
        // silently replacing it is exactly the kind of write a migration must
        // never make. Report and stop.
        if (!matches) {
          console.error(
            `ABORT — ${subject.name} already has a weight row with ${row.ww_weight}/${row.pt_weight}/${row.ex_weight}, ` +
              `not ${WW}/${PT}/${EX}. Refusing to overwrite a configured value; decide by hand.`
          );
          process.exitCode = 1;
          return;
        }
        console.log(`  ${subject.name.padEnd(22)} already present (${WW}/${PT}/${EX})`);
        already += 1;
        continue;
      }

      await conn.query(
        'INSERT INTO grade_weight_configs (subject_id, school_year, ww_weight, pt_weight, ex_weight) VALUES (?, ?, ?, ?, ?)',
        [subject.id, SCHOOL_YEAR, WW, PT, EX]
      );
      console.log(`  ${subject.name.padEnd(22)} created (${WW}/${PT}/${EX})`);
      created += 1;
    }

    console.log(`\nGrade ${GRADE_LEVEL} weight rows: ${created} created, ${already} already present.`);
    console.log('');
    await printState(conn);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
