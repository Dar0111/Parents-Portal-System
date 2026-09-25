// MIGRATION: subjects gains display_order (CR3a, 2026-09-22).
//
// Built on the convention recorded in scripts/migrate-notifications.js, the
// first migration this repo had. The rules it set and this one follows:
//
//   - NEVER DROP ANYTHING. This adds one nullable column and UPDATEs it. It
//     never deletes a subject row: every one of `grades`, `grade_components`,
//     `grade_weight_configs`, `teacher_assignments` and `assessment_slots`
//     carries subject_id with ON DELETE CASCADE, so a DELETE here would take
//     real grades with it. Nothing in this script deletes.
//   - BE IDEMPOTENT, and PROVE it. A second run reports "already present" for
//     the column and "already correct" for every value, changes zero rows,
//     and prints the same state block.
//   - ANNOUNCE what it did, per object.
//   - MIRROR into database/schema.sql and database/seed.sql so a clean
//     db:setup produces the same shape and the same values. Done in the same
//     dispatch.
//
// WHY: `subjects` had exactly three columns — id, name, grade_level — and no
// ordering column, so every subject list came back alphabetical and the one
// real printed order this repo held lived in a CLIENT constant
// (ReportCard.jsx's PRINTED_ORDER). That constant is deleted in this same
// dispatch, because:
//
//   1. Expo cannot import it. A second report card would need a second copy,
//      and two copies of an order that must agree is the failure this project
//      has already had with table counts.
//   2. The class record's Subject dropdown could not use it — importing a
//      parent-document constant into a teacher screen would give that
//      document two masters — so that screen sorted A-Z and said so.
//   3. The adviser class summary (CR3) puts the subjects across the TOP as
//      columns, read against the paper form. Alphabetical columns there are
//      not a cosmetic problem.
//
// ORDER BY display_order IS NULL, display_order, name — the null-last idiom,
// so a grade level with no recorded order keeps the alphabetical fallback
// instead of sorting to the front. MySQL sorts NULL first by default and
// `display_order IS NULL` evaluates to 0/1, which is why that leading term is
// there rather than a COALESCE to some large sentinel.
//
// ---------------------------------------------------------------------------
// WHERE THE NUMBERS COME FROM, AND WHICH ARE CONFIRMED
// ---------------------------------------------------------------------------
// GRADES 4, 5 AND 6 — the Key Stage 2 SF9's eight printed rows, transcribed in
// docs/GRADING_SPEC.md §6c. ONE order for all three grade levels: that is
// Darryl's decision of 2026-09-22, recorded as "per the KS2 SF9; confirm at
// the next school visit". It is not three independently observed orders.
//
// GRADE 1 IS PROVISIONAL and is carried over EXACTLY as the client constant
// had it, deliberately: this migration must not change what Nino's card looks
// like. The sequence is the Grade 1 CLASS PROGRAM — a timetable, not a report
// card — used because an observed school artifact beats alphabetical-by-
// accident. The school has never given a printed order for Key Stage 1.
// See CLAUDE.md → OPEN QUESTIONS.
//
// GRADES 2 AND 3 — CONFIRMED by the school on 2026-09-23 and added to this map
// on 2026-09-26 (pre-Stage-5 #5a). They stayed NULL from CR3a until then
// because no printed order was known and inventing one would have been worse
// than the alphabetical fallback; the same run of this script that set the
// others sets these on a live database ("set" once, "already correct"
// after), which is exactly what "changing an order is an UPDATE to this
// table, not a code change" was for.
//
// Run:  node scripts/migrate-subject-display-order.js
//       node scripts/migrate-subject-display-order.js --print-state
//       npm run db:migrate:subject-display-order

require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'parents_portal';

// grade_level -> [names in printed order]. A grade level absent from this map
// is left NULL on purpose; see the header.
const PRINTED_ORDER = {
  1: ['Makabansa', 'Mathematics', 'GMRC', 'Reading and Literacy', 'Language'],
  2: ['Makabansa', 'Mathematics', 'GMRC', 'English', 'Filipino'],
  3: ['English', 'Mathematics', 'Science', 'Filipino', 'Makabansa', 'GMRC'],
  4: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
  5: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
  6: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
};

async function columnExists(conn) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'subjects' AND column_name = 'display_order'
      LIMIT 1`,
    [DB_NAME]
  );
  return rows.length > 0;
}

async function readSubjects(conn) {
  const [rows] = await conn.query(
    `SELECT id, name, grade_level, display_order
       FROM subjects
      ORDER BY grade_level, display_order IS NULL, display_order, name`
  );
  return rows;
}

async function printState(conn) {
  const rows = await readSubjects(conn);
  console.log('STATE — subjects, in the order the API will now return them:');
  let grade = null;
  for (const s of rows) {
    if (s.grade_level !== grade) {
      grade = s.grade_level;
      const known = PRINTED_ORDER[grade] ? 'printed order' : 'alphabetical fallback (no order recorded)';
      console.log(`  Grade ${grade} — ${known}`);
    }
    const order = s.display_order === null ? '   -' : String(s.display_order).padStart(4);
    console.log(`   ${order}  #${String(s.id).padEnd(3)} ${s.name}`);
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
    // ---- object 1: the column ----
    if (await columnExists(conn)) {
      console.log('subjects.display_order : already present');
    } else {
      await conn.query('ALTER TABLE subjects ADD COLUMN display_order TINYINT UNSIGNED DEFAULT NULL AFTER grade_level');
      console.log('subjects.display_order : created');
    }

    if (stateOnly) {
      console.log('');
      await printState(conn);
      return;
    }

    // ---- object 2: the values ----
    const before = await readSubjects(conn);
    let set = 0;
    let alreadyCorrect = 0;
    let leftNull = 0;
    const conflicts = [];
    const unlisted = [];

    for (const subject of before) {
      const printed = PRINTED_ORDER[subject.grade_level];
      if (!printed) {
        leftNull += 1;
        continue;
      }
      const index = printed.indexOf(subject.name);
      if (index === -1) {
        // A learning area the recorded order does not name. It keeps NULL and
        // therefore sorts after the named ones, alphabetically — appended,
        // never dropped, exactly as the client constant behaved. Reported so
        // a curriculum change is visible rather than silent.
        unlisted.push(`Grade ${subject.grade_level} "${subject.name}" (#${subject.id})`);
        leftNull += 1;
        continue;
      }
      const target = index + 1;
      if (subject.display_order === target) {
        alreadyCorrect += 1;
        continue;
      }
      if (subject.display_order !== null) {
        // Someone set a different value by hand. Do not overwrite a decision
        // this script cannot see the reason for — same rule as
        // migrate-grade1-weights.js, which aborts rather than overwrite.
        conflicts.push(
          `Grade ${subject.grade_level} "${subject.name}" (#${subject.id}) holds ${subject.display_order}, expected ${target}`
        );
        continue;
      }
      await conn.query('UPDATE subjects SET display_order = ? WHERE id = ?', [target, subject.id]);
      set += 1;
    }

    if (conflicts.length) {
      console.error('');
      console.error('ABORT — display_order values already set and DIFFERENT from the recorded order:');
      for (const line of conflicts) console.error(`  ${line}`);
      console.error('');
      console.error('Nothing was overwritten. Decide by hand which order is right; if the school has');
      console.error('given a new one, update PRINTED_ORDER in this file and in database/seed.sql together.');
      process.exitCode = 1;
      return;
    }

    console.log(`subjects.display_order values : ${set} set, ${alreadyCorrect} already correct, ${leftNull} left NULL`);
    if (unlisted.length) {
      console.log('  not named by any recorded order (kept NULL, sorts last alphabetically):');
      for (const line of unlisted) console.log(`    ${line}`);
    }
    console.log('  Every grade level has a recorded order since 2026-09-26 (Grades 2 and 3 confirmed by the school 2026-09-23).');

    // ---- the proof: every recorded grade level is a complete 1..N run ----
    const after = await readSubjects(conn);
    let ok = true;
    for (const grade of Object.keys(PRINTED_ORDER).map(Number)) {
      const rows = after.filter((s) => s.grade_level === grade && s.display_order !== null);
      const orders = rows.map((s) => s.display_order).sort((a, b) => a - b);
      const expected = orders.map((_, i) => i + 1);
      const contiguous = orders.length > 0 && orders.every((v, i) => v === expected[i]);
      const names = rows.map((s) => s.name);
      const matchesPrinted = names.every((n, i) => n === PRINTED_ORDER[grade][i]);
      console.log(
        `  Grade ${grade}: ${orders.length} ordered, ${contiguous ? '1..' + orders.length : 'NOT CONTIGUOUS'}` +
          `, ${matchesPrinted ? 'matches the recorded order' : 'DOES NOT MATCH — INVESTIGATE'}`
      );
      if (!contiguous || !matchesPrinted) ok = false;
    }
    if (!ok) process.exitCode = 1;

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
