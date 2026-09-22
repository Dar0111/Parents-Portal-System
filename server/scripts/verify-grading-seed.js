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

    // --- display_order: the school's printed order (CR3a, 2026-09-22) ---
    //
    // Asserted here rather than in an HTTP suite because it is a SEED fact:
    // the order is transcribed from the school's SF9 and from the Grade 1
    // class program, and a wrong value is a wrong document, not a wrong
    // query. The HTTP suites assert that the API RETURNS this order; this
    // asserts the order itself is what the school gave.
    //
    // Grades 2 and 3 are asserted NULL, not "not asserted". NULL is the
    // honest value for a grade level whose printed order nobody has recorded,
    // and a future dispatch that guesses one should fail here first.
    console.log('\nSubject display_order:');

    const EXPECTED_ORDER = {
      1: ['Makabansa', 'Mathematics', 'GMRC', 'Reading and Literacy', 'Language'],
      4: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
      5: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
      6: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
    };

    const [orderRows] = await conn.query(
      `SELECT name, grade_level, display_order FROM subjects
        ORDER BY grade_level, display_order IS NULL, display_order, name`
    );

    for (const gradeLevel of [1, 4, 5, 6]) {
      const expectedNames = EXPECTED_ORDER[gradeLevel];
      const actualNames = orderRows.filter((r) => r.grade_level === gradeLevel).map((r) => r.name);
      check(
        actualNames.length === expectedNames.length && actualNames.every((n, i) => n === expectedNames[i]),
        `Grade ${gradeLevel} prints in the school's order`,
        `got ${actualNames.join(' > ')}`
      );
      const values = orderRows
        .filter((r) => r.grade_level === gradeLevel)
        .map((r) => r.display_order);
      check(
        values.every((v, i) => v === i + 1),
        `Grade ${gradeLevel} display_order is a contiguous 1..${expectedNames.length}`,
        `got ${values.join(', ')}`
      );
    }

    for (const gradeLevel of [2, 3]) {
      const values = orderRows.filter((r) => r.grade_level === gradeLevel).map((r) => r.display_order);
      check(
        values.length > 0 && values.every((v) => v === null),
        `Grade ${gradeLevel} display_order is NULL — no printed order is known, and guessing one is worse`,
        `got ${values.join(', ')}`
      );
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

    // 40, not 35 (2026-09-22): Grade 1's five learning areas now carry weight
    // rows too. One per subject at every grade level, which is the rule since
    // the school confirmed a Grade 1 letter is computed (GRADING_SPEC §6a).
    check(weightRows.length === 40, 'Exactly 40 weight rows seeded — one per subject, every grade level', `found ${weightRows.length}`);

    const badWeightRows = weightRows.filter(
      (r) => toCents(r.ww_weight) + toCents(r.pt_weight) + toCents(r.ex_weight) !== 10000
    );
    check(
      badWeightRows.length === 0,
      'Every grade_weight_configs row sums to exactly 100.00',
      badWeightRows.length ? `subject_id(s) ${badWeightRows.map((r) => r.subject_id).join(', ')} do not` : ''
    );

    // INVERTED 2026-09-22. This check used to assert the OPPOSITE — that a
    // descriptive-mode grade level has ZERO weight rows — and it was not a
    // stale number but a statement of a principle the school has since
    // reversed: a Grade 1 letter is COMPUTED from weights (GRADING_SPEC §6a),
    // so recomputeGrade reads a weight row for every mode. The rule now is
    // that EVERY subject has one, and grading_mode_configs decides only how
    // it is used. Still proven from the OUTPUT side rather than by re-reading
    // the seed's intent, which is why this check exists at all.
    const [allSubjects] = await conn.query('SELECT id, name, grade_level FROM subjects');
    const weightedSubjectIds = new Set(weightRows.map((r) => r.subject_id));
    const subjectsWithoutWeights = allSubjects.filter((s) => !weightedSubjectIds.has(s.id));
    check(
      subjectsWithoutWeights.length === 0,
      'Every subject at every grade level has a weight row — descriptive levels included',
      subjectsWithoutWeights.length
        ? `missing for ${subjectsWithoutWeights.map((s) => `${s.name} (G${s.grade_level})`).join(', ')}`
        : ''
    );

    // Grade 1 is 30/50/20 (ex_weight holds the SUMMATIVE weight there).
    const grade1Wrong = weightRows.filter(
      (r) =>
        r.grade_level === 1 &&
        (toCents(r.ww_weight) !== 3000 || toCents(r.pt_weight) !== 5000 || toCents(r.ex_weight) !== 2000)
    );
    check(
      grade1Wrong.length === 0,
      'Grade 1 carries exactly 30/50/20 on every learning area',
      grade1Wrong.length ? `subject(s) ${grade1Wrong.map((r) => r.subject_name).join(', ')} do not` : ''
    );

    // Grades 2-6: MAPEH/EPP carry 20/60/20; every other subject 20/50/30.
    const wrongBucketRows = weightRows.filter((r) => {
      if (r.grade_level === 1) return false;
      const isSpecial = r.subject_name === 'MAPEH' || r.subject_name === 'EPP';
      const expectedPt = isSpecial ? 6000 : 5000;
      const expectedEx = isSpecial ? 2000 : 3000;
      return toCents(r.ww_weight) !== 2000 || toCents(r.pt_weight) !== expectedPt || toCents(r.ex_weight) !== expectedEx;
    });
    check(
      wrongBucketRows.length === 0,
      'Grades 2-6: MAPEH/EPP carry 20/60/20 and every other subject carries 20/50/30',
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

    // --- Grade 1 descriptive fixture (persistent seed, not per-test) ---
    console.log('\nGrade 1 descriptive fixture:');

    const [g1Students] = await conn.query(
      "SELECT id, lrn, first_name, last_name, grade_level, section FROM students WHERE grade_level = 1"
    );
    check(g1Students.length === 1, 'Exactly one Grade 1 student is seeded', `found ${g1Students.length}`);

    const g1 = g1Students[0];
    check(g1?.lrn === '1090001' && g1?.section === 'Mabait', 'That student is LRN 1090001 in section Mabait', g1 ? `${g1.lrn} / ${g1.section}` : 'no row');

    const [mabait] = await conn.query(
      "SELECT id, adviser_id FROM sections WHERE grade_level = 1 AND name = 'Mabait' AND school_year = ? LIMIT 1",
      [SCHOOL_YEAR]
    );
    check(mabait[0]?.adviser_id != null, 'Grade 1 - Mabait has a non-NULL adviser_id');

    const [adviser] = await conn.query('SELECT id, login_id FROM users WHERE id = ? LIMIT 1', [mabait[0]?.adviser_id]);
    check(adviser[0]?.login_id === 'TCH-003', 'That adviser is TCH-003, not TCH-002', adviser[0]?.login_id || 'none');

    const [g1Subjects] = await conn.query("SELECT id, name FROM subjects WHERE grade_level = 1 ORDER BY name");
    check(g1Subjects.length === 5, 'Grade 1 still has 5 subjects', `found ${g1Subjects.length}`);

    const [g1Assignments] = await conn.query(
      `SELECT subject_id FROM teacher_assignments
       WHERE teacher_id = ? AND grade_level = 1 AND section = 'Mabait'`,
      [adviser[0]?.id]
    );
    const assignedSubjectIds = new Set(g1Assignments.map((r) => r.subject_id));
    const allFiveAssigned = g1Subjects.every((s) => assignedSubjectIds.has(s.id)) && g1Assignments.length === 5;
    check(allFiveAssigned, 'TCH-003 is assigned all five Grade 1 subjects in Mabait', `assignments=${g1Assignments.length}`);

    const [g1Parent] = await conn.query(
      "SELECT id, status, role, student_id FROM users WHERE login_id = '1090001' LIMIT 1"
    );
    check(
      g1Parent[0]?.role === 'parent' && g1Parent[0]?.status === 'active' && g1Parent[0]?.student_id === g1?.id,
      'An active parent account is linked to the Grade 1 student'
    );

    const [g1Grades] = await conn.query(
      `SELECT g.id, g.term, g.descriptive_grade, g.term_grade, g.initial_grade, s.name AS subject_name
       FROM grades g
       JOIN subjects s ON s.id = g.subject_id
       WHERE g.student_id = ? AND g.school_year = ?`,
      [g1?.id, SCHOOL_YEAR]
    );
    check(g1Grades.length === 5, 'Exactly 5 grade rows for the Grade 1 student (partial card)', `found ${g1Grades.length}`);

    const allLetters = g1Grades.every(
      (r) => r.descriptive_grade != null && r.term_grade == null && r.initial_grade == null
    );
    check(
      allLetters,
      'Every seeded Grade 1 grade row stores a letter and leaves numerical columns NULL — not a computed result',
      g1Grades.map((r) => `${r.subject_name} T${r.term}=${r.descriptive_grade}/${r.term_grade}`).join(', ')
    );

    function lettersFor(name) {
      return g1Grades
        .filter((r) => r.subject_name === name)
        .sort((a, b) => a.term - b.term)
        .map((r) => `${r.term}:${r.descriptive_grade}`);
    }
    check(
      lettersFor('Mathematics').join(',') === '1:A,2:B,3:C',
      'Mathematics has all three terms lettered (A/B/C)',
      lettersFor('Mathematics').join(',')
    );
    check(
      lettersFor('Reading and Literacy').join(',') === '1:D,2:E',
      'Reading and Literacy has terms 1-2 lettered and term 3 blank (Pending)',
      lettersFor('Reading and Literacy').join(',')
    );
    const untouched = ['GMRC', 'Language', 'Makabansa'].every((name) => lettersFor(name).length === 0);
    check(untouched, 'GMRC, Language, and Makabansa have zero grade rows (Pending)');

    const gradeIds = g1Grades.map((r) => r.id);
    if (gradeIds.length) {
      const [components] = await conn.query('SELECT COUNT(*) AS c FROM grade_components WHERE grade_id IN (?)', [
        gradeIds,
      ]);
      check(components[0].c === 0, 'Zero grade_components on the descriptive fixture — no WW/PT path');
    } else {
      check(false, 'Zero grade_components on the descriptive fixture — no WW/PT path', 'no grade rows to check');
    }
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
