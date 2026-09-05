/**
 * Grading seed verification — NOT a test suite (no server needed, no HTTP
 * calls). This is the one place a single hand-transcription typo in the
 * 41-row transmutation table, or in a weight/mode seed row, would otherwise
 * go undetected until a real grade computation silently produced the wrong
 * number. Every check below is loud on failure: it prints the actual values
 * involved, not just PASS/FAIL.
 *
 * Prerequisite: npm run db:setup
 * Usage: node scripts/verify-grading-seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

const SCHOOL_YEAR = '2026-2027';

let passed = 0;
let failed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL — ${label}${detail ? ` (${detail})` : ''}`);
  }
}

// DECIMAL(5,2) columns come back from mysql2 as strings. Comparing floats
// directly risks drift (0.1 + 0.2 !== 0.3); comparing as integer cents is
// exact for values that are already fixed to 2 decimal places.
function toCents(decimalString) {
  return Math.round(Number(decimalString) * 100);
}

async function run() {
  console.log(`\nParents Portal — Grading Seed Verification (${SCHOOL_YEAR})\n`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  });

  try {
    // --- Subjects (Stage G1b) ---
    console.log('Subjects:');

    const EXPECTED_SUBJECT_COUNTS = { 1: 5, 2: 5, 3: 6, 4: 8, 5: 8, 6: 8 };

    const [subjectCountRows] = await conn.query(
      'SELECT grade_level, COUNT(*) AS c FROM subjects GROUP BY grade_level ORDER BY grade_level'
    );
    const subjectCountsByGrade = {};
    for (const row of subjectCountRows) {
      subjectCountsByGrade[row.grade_level] = row.c;
    }

    const totalSubjects = subjectCountRows.reduce((sum, row) => sum + row.c, 0);
    check(totalSubjects === 40, 'Exactly 40 subjects total', `found ${totalSubjects}`);

    for (const gradeLevel of Object.keys(EXPECTED_SUBJECT_COUNTS).map(Number)) {
      const expected = EXPECTED_SUBJECT_COUNTS[gradeLevel];
      const actual = subjectCountsByGrade[gradeLevel] || 0;
      check(actual === expected, `Grade ${gradeLevel} has ${expected} subjects`, `found ${actual}`);
    }

    // --- Transmutation table ---
    console.log('\nTransmutation table:');

    const [rows] = await conn.query(
      'SELECT ig_min, ig_max, transmuted_grade FROM transmutation_table WHERE school_year = ? ORDER BY ig_min ASC',
      [SCHOOL_YEAR]
    );

    check(rows.length === 41, `Exactly 41 rows seeded for ${SCHOOL_YEAR}`, `found ${rows.length}`);

    if (rows.length > 0) {
      check(
        toCents(rows[0].ig_min) === 0,
        'Range starts at 0.00',
        `ig_min of the lowest row is ${rows[0].ig_min}`
      );
      check(
        toCents(rows[rows.length - 1].ig_max) === 10000,
        'Range ends at 100.00',
        `ig_max of the highest row is ${rows[rows.length - 1].ig_max}`
      );

      // No gaps, no overlaps: walking the ranges in ascending order, each
      // row's ig_min must be exactly the previous row's ig_max + 0.01.
      let contiguous = true;
      for (let i = 1; i < rows.length; i += 1) {
        const expectedMinCents = toCents(rows[i - 1].ig_max) + 1;
        const actualMinCents = toCents(rows[i].ig_min);
        if (actualMinCents !== expectedMinCents) {
          contiguous = false;
          console.error(
            `    Gap/overlap between row ${i - 1} (ig_max=${rows[i - 1].ig_max}) and row ${i} (ig_min=${rows[i].ig_min})`
          );
        }
      }
      check(contiguous, 'No gaps or overlaps across all 41 ranges (0.01 precision)');
    }

    // Exact boundary values, via the real lookup query the application will
    // use — not just reading the raw seed rows back.
    async function lookupTransmutedGrade(ig) {
      const [result] = await conn.query(
        'SELECT transmuted_grade FROM transmutation_table WHERE school_year = ? AND ig_min <= ? AND ig_max >= ? LIMIT 1',
        [SCHOOL_YEAR, ig, ig]
      );
      return result[0]?.transmuted_grade ?? null;
    }

    const at70 = await lookupTransmutedGrade(70.0);
    check(at70 === 75, 'IG 70.00 -> TG 75 (the floor of the passing band)', `got ${at70}`);

    const at6999 = await lookupTransmutedGrade(69.99);
    check(at6999 === 74, 'IG 69.99 -> TG 74 (just below the passing floor)', `got ${at6999}`);

    // --- Grade weight configs ---
    console.log('\nGrade weight configs:');

    const [weightRows] = await conn.query(
      `SELECT gwc.id, gwc.subject_id, gwc.ww_weight, gwc.pt_weight, gwc.ex_weight,
              s.name AS subject_name, s.grade_level
       FROM grade_weight_configs gwc
       JOIN subjects s ON s.id = gwc.subject_id
       WHERE gwc.school_year = ?`,
      [SCHOOL_YEAR]
    );

    check(weightRows.length === 35, 'Exactly 35 weight rows seeded', `found ${weightRows.length}`);

    const badWeightRows = weightRows.filter(
      (r) => toCents(r.ww_weight) + toCents(r.pt_weight) + toCents(r.ex_weight) !== 10000
    );
    check(
      badWeightRows.length === 0,
      'Every grade_weight_configs row sums to exactly 100.00',
      badWeightRows.length ? `subject_id(s) ${badWeightRows.map((r) => r.subject_id).join(', ')} do not` : ''
    );

    // Zero weight rows for any subject at a descriptive-mode grade level —
    // the durable exclusion (JOIN against grading_mode_configs in seed.sql,
    // not a hardcoded grade_level comparison) proven from the OUTPUT side,
    // not just by re-reading the seed SQL's own intent.
    const [modeByGrade] = await conn.query(
      'SELECT grade_level, mode FROM grading_mode_configs WHERE school_year = ?',
      [SCHOOL_YEAR]
    );
    const descriptiveGrades = new Set(modeByGrade.filter((r) => r.mode === 'descriptive').map((r) => r.grade_level));
    const weightRowsOnDescriptiveGrades = weightRows.filter((r) => descriptiveGrades.has(r.grade_level));
    check(
      weightRowsOnDescriptiveGrades.length === 0,
      'Zero weight rows exist for any subject at a descriptive-mode grade level',
      weightRowsOnDescriptiveGrades.length
        ? `found rows for grade(s) ${[...new Set(weightRowsOnDescriptiveGrades.map((r) => r.grade_level))].join(', ')}`
        : ''
    );

    // MAPEH/EPP carry 20/60/20; every other subject carries 20/50/30.
    const wrongBucketRows = weightRows.filter((r) => {
      const isSpecial = r.subject_name === 'MAPEH' || r.subject_name === 'EPP';
      const expectedPt = isSpecial ? 6000 : 5000;
      const expectedEx = isSpecial ? 2000 : 3000;
      return toCents(r.ww_weight) !== 2000 || toCents(r.pt_weight) !== expectedPt || toCents(r.ex_weight) !== expectedEx;
    });
    check(
      wrongBucketRows.length === 0,
      'MAPEH/EPP carry 20/60/20 and every other subject carries 20/50/30',
      wrongBucketRows.length
        ? `subject(s) ${wrongBucketRows.map((r) => `${r.subject_name} (G${r.grade_level})`).join(', ')} do not`
        : ''
    );

    // --- Grading mode configs ---
    console.log('\nGrading mode configs:');

    const [modeRows] = await conn.query(
      'SELECT grade_level, mode FROM grading_mode_configs WHERE school_year = ? ORDER BY grade_level',
      [SCHOOL_YEAR]
    );

    check(modeRows.length === 6, `Exactly 6 rows seeded for ${SCHOOL_YEAR}`, `found ${modeRows.length}`);

    const grade1Mode = modeRows.find((r) => r.grade_level === 1)?.mode;
    check(grade1Mode === 'descriptive', 'Grade 1 is descriptive', `got ${grade1Mode}`);

    const numericalGrades = modeRows.filter((r) => r.grade_level >= 2 && r.grade_level <= 6);
    const allNumerical = numericalGrades.length === 5 && numericalGrades.every((r) => r.mode === 'numerical');
    check(allNumerical, 'Grades 2-6 are all numerical');
  } finally {
    await conn.end();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
