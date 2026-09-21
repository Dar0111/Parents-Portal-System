// MIGRATION: Grade 1's "Reading" becomes "Reading and Literacy" (2026-09-22).
//
// Built on the convention recorded in scripts/migrate-notifications.js, the
// first migration this repo had. The rules it set and this one follows:
//
//   - NEVER DROP ANYTHING. Here that matters more than usual: the obvious
//     way to "fix a wrong subject name" is DELETE the row and INSERT the
//     right one, and THAT WOULD DESTROY GRADES. `grade_components`,
//     `grade_weight_configs`, `teacher_assignments` and `grades` all carry
//     subject_id with ON DELETE CASCADE (schema.sql), so deleting the
//     Reading row would silently take Nino's two seeded Reading letters with
//     it — the only descriptive fixture in the system. This script does one
//     UPDATE of one column and nothing else.
//   - BE IDEMPOTENT, and PROVE it. A second run reports "already renamed",
//     changes zero rows, and prints the same state block.
//   - ANNOUNCE what it did, per object.
//   - MIRROR into database/seed.sql so a clean db:setup produces the same
//     name. (There is no schema.sql change — `subjects.name` is data, not
//     shape.) Done in the same dispatch.
//
// WHY: the school's own records name the Grade 1 learning area "Reading and
// Literacy". The seed shipped it as "Reading", which is the only naming
// mismatch in all 40 subjects across Grades 1-6.
//
// The client's printed order (client/src/pages/parent/ReportCard.jsx,
// PRINTED_ORDER[1]) matches on the NAME, so it is updated in the same
// dispatch. If these two ever disagree the subject silently falls to the end
// of the card instead of its printed position — visible, not fatal.
//
// Run:  node scripts/migrate-reading-and-literacy.js
//       node scripts/migrate-reading-and-literacy.js --print-state
//
// No npm alias: package.json was outside this dispatch's whitelist. Add
// "db:migrate:reading-and-literacy" next time that file is open.

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';
const GRADE_LEVEL = 1;
const OLD_NAME = 'Reading';
const NEW_NAME = 'Reading and Literacy';

// The seeded descriptive fixture that must survive this migration untouched:
// Nino Alcantara's Reading letters, D (term 1) and E (term 2).
const FIXTURE_LRN = '1090001';

async function readSubject(conn, name) {
  const [rows] = await conn.query('SELECT id, name, grade_level FROM subjects WHERE grade_level = ? AND name = ? LIMIT 1', [
    GRADE_LEVEL,
    name,
  ]);
  return rows[0] || null;
}

// Every row that hangs off this subject id, so "nothing was lost" is a
// printed comparison rather than an assurance.
async function readDependents(conn, subjectId) {
  if (!subjectId) return { grades: [], components: 0, weights: 0, assignments: 0 };
  const [grades] = await conn.query(
    `SELECT g.id, g.term, g.descriptive_grade, g.term_grade
       FROM grades g JOIN students s ON s.id = g.student_id
      WHERE g.subject_id = ? AND s.lrn = ?
      ORDER BY g.id`,
    [subjectId, FIXTURE_LRN]
  );
  const [[components]] = await conn.query(
    'SELECT COUNT(*) AS n FROM grade_components c JOIN grades g ON g.id = c.grade_id WHERE g.subject_id = ?',
    [subjectId]
  );
  const [[weights]] = await conn.query('SELECT COUNT(*) AS n FROM grade_weight_configs WHERE subject_id = ?', [subjectId]);
  const [[assignments]] = await conn.query('SELECT COUNT(*) AS n FROM teacher_assignments WHERE subject_id = ?', [subjectId]);
  return { grades, components: components.n, weights: weights.n, assignments: assignments.n };
}

function describe(label, subject, dependents) {
  console.log(`  ${label}`);
  console.log(`    subject      : ${subject ? `#${subject.id} "${subject.name}" (Grade ${subject.grade_level})` : 'NOT FOUND'}`);
  console.log(`    Nino's rows  : ${dependents.grades.length} — ${dependents.grades.map((g) => `#${g.id} T${g.term} ${g.descriptive_grade}`).join(' | ') || '(none)'}`);
  console.log(`    components   : ${dependents.components}`);
  console.log(`    weight rows  : ${dependents.weights}  (Grade 1 is descriptive — 0 is correct)`);
  console.log(`    assignments  : ${dependents.assignments}`);
}

async function printState(conn) {
  const [subjects] = await conn.query('SELECT id, name FROM subjects WHERE grade_level = ? ORDER BY id', [GRADE_LEVEL]);
  console.log('STATE — Grade 1 subjects, by id:');
  for (const s of subjects) console.log(`  #${s.id}  ${s.name}`);
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

    const already = await readSubject(conn, NEW_NAME);
    const target = await readSubject(conn, OLD_NAME);

    // uq_subject_grade is (name, grade_level), so both names existing at once
    // would make the UPDATE fail on a duplicate key. Refuse loudly instead of
    // letting MySQL's error be the explanation.
    if (already && target) {
      console.error(
        `ABORT — Grade 1 has BOTH "${OLD_NAME}" (#${target.id}) and "${NEW_NAME}" (#${already.id}). ` +
          'Renaming would collide with uq_subject_grade. This needs a by-hand decision about which row the ' +
          'grades belong to; do not guess.'
      );
      process.exitCode = 1;
      return;
    }

    if (already) {
      const dependents = await readDependents(conn, already.id);
      console.log(`subjects."${OLD_NAME}" -> "${NEW_NAME}": already renamed`);
      describe('unchanged:', already, dependents);
      console.log('');
      await printState(conn);
      return;
    }

    if (!target) {
      console.error(`ABORT — Grade 1 has neither "${OLD_NAME}" nor "${NEW_NAME}". Nothing to rename; the seed is not what this expects.`);
      process.exitCode = 1;
      return;
    }

    const before = await readDependents(conn, target.id);
    describe('BEFORE:', target, before);

    const [result] = await conn.query('UPDATE subjects SET name = ? WHERE id = ? AND grade_level = ? AND name = ?', [
      NEW_NAME,
      target.id,
      GRADE_LEVEL,
      OLD_NAME,
    ]);
    if (result.affectedRows !== 1) {
      console.error(`ABORT — expected to update exactly 1 subject row, updated ${result.affectedRows}.`);
      process.exitCode = 1;
      return;
    }

    const renamed = await readSubject(conn, NEW_NAME);
    const after = await readDependents(conn, renamed.id);
    describe('AFTER:', renamed, after);

    // The point of the whole script: the id did not move, so nothing that
    // references it moved either.
    const sameId = renamed.id === target.id;
    const sameGrades =
      before.grades.length === after.grades.length &&
      before.grades.every((g, i) => g.id === after.grades[i].id && g.descriptive_grade === after.grades[i].descriptive_grade);
    console.log('');
    console.log(`subjects."${OLD_NAME}" -> "${NEW_NAME}": renamed (subject #${renamed.id})`);
    console.log(`  subject id unchanged            : ${sameId ? 'yes' : 'NO — INVESTIGATE'}`);
    console.log(`  Nino's Reading rows and letters : ${sameGrades ? 'identical before and after' : 'CHANGED — INVESTIGATE'}`);
    if (!sameId || !sameGrades) process.exitCode = 1;

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
