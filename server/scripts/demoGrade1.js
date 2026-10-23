// D-102 (B7, chore/pre-migration, 2026-10-24) — NINO'S FIVE GRADE 1 LETTERS,
// REPRODUCED BY SCORES. The one source for both writers:
//
//   scripts/setup-db.js                 a fresh `npm run db:setup`, after the seed
//   scripts/migrate-demo-grade1.js      the live database, once (db:migrate:demo-grade1)
//
// so a fresh setup and today's database hold the same rows by construction.
//
// WHY: seed.sql writes Nino's five letters (Mathematics terms 1-3 A/B/C,
// Reading and Literacy terms 1-2 D/E) as bare letters — LEGACY rows with no
// scores and no highest possible score behind them. The admin and the parent
// saw letters while the adviser's class record was empty, and any HPS save on
// those columns would have recomputed the letters to Pending. Here each row
// gets one Written Work and one Performance Task slot (HPS 20) and Summative
// maxima of 20 / 20 / 20, with scores chosen so the NORMAL computation lands
// on the letter the seed already shows.
//
// THE COMPUTATION IS THE SERVER'S OWN PURE FUNCTIONS (utils/gradeComputation.js),
// called with the same inputs, in the same order, as routes/grades.js
// recomputeGrade — the used slots as the required list, the three sub-tests,
// the weights from grade_weight_configs, the band of the raw Initial Grade (no
// transmutation in Key Stage 1). A computed letter that differs from the seed's
// letter is refused, never written. The gate proves the server agrees: a dry
// run of the class record on the same inputs must return what is stored.
//
// STATE PER ROW, never a blind write:
//   legacy   the seeded letter, no component, no summative score, no Initial
//            Grade, unlocked, and no slot on its class column -> applied
//   present  exactly the slots, components and values below -> left alone
//   anything else -> refused, naming the subject and term
// so the migration is idempotent and never overwrites a teacher's real scores.

const gc = require('../utils/gradeComputation');

const SCHOOL_YEAR = '2026-2027';
const LEARNER = Object.freeze({ first_name: 'Nino', last_name: 'Alcantara', grade_level: 1, section: 'Mabait' });
const HPS = 20;
const EXAM_MAX = 20;

// The owner's approved table (B7's plan, P2): one WW and one PT score, then
// ST1 / ST2 / TE, each out of 20. The arithmetic is in the CHANGELOG row.
const ROWS = Object.freeze([
  { subject: 'Mathematics', term: 1, ww: 19, pt: 19, st1: 18, st2: 19, te: 19, letter: 'A' },
  { subject: 'Mathematics', term: 2, ww: 17, pt: 17, st1: 17, st2: 17, te: 17, letter: 'B' },
  { subject: 'Mathematics', term: 3, ww: 16, pt: 15, st1: 16, st2: 16, te: 16, letter: 'C' },
  { subject: 'Reading and Literacy', term: 1, ww: 14, pt: 14, st1: 14, st2: 14, te: 14, letter: 'D' },
  { subject: 'Reading and Literacy', term: 2, ww: 12, pt: 12, st1: 12, st2: 12, te: 12, letter: 'E' },
]);

// The values recomputeGrade would store for one row, from the same pure
// functions in the same order. `slotIds` are the row's two used slots; the
// required-slot check is the class's, exactly as in the route.
function computeRow(row, weights, slotIds) {
  const wwRows = [{ score: row.ww, max_score: HPS, slot_id: slotIds.ww }];
  const ptRows = [{ score: row.pt, max_score: HPS, slot_id: slotIds.pt }];
  const wwPercentage = gc.componentPercentage(wwRows, [slotIds.ww]);
  const ptPercentage = gc.componentPercentage(ptRows, [slotIds.pt]);
  const exPercentage = gc.exPercentage(
    gc.subTestPercentage(row.st1, EXAM_MAX),
    gc.subTestPercentage(row.st2, EXAM_MAX),
    gc.subTestPercentage(row.te, EXAM_MAX)
  );
  const wwWeighted = gc.weighted(wwPercentage, weights.ww_weight);
  const ptWeighted = gc.weighted(ptPercentage, weights.pt_weight);
  const exWeighted = gc.weighted(exPercentage, weights.ex_weight);
  const initialGrade = gc.initialGrade(wwWeighted, ptWeighted, exWeighted);
  return {
    ww_percentage: wwPercentage,
    ww_weighted: wwWeighted,
    pt_percentage: ptPercentage,
    pt_weighted: ptWeighted,
    ex_percentage: exPercentage,
    ex_weighted: exWeighted,
    initial_grade: initialGrade,
    descriptive_grade: gc.bandForScore(initialGrade),
  };
}

// DECIMAL columns come back from mysql2 as strings; compare as numbers.
function same(stored, expected) {
  if (expected === null) return stored === null;
  return stored !== null && Number(stored) === Number(expected);
}

function label(row) {
  return `${row.subject} term ${row.term}`;
}

async function one(conn, sql, params, what) {
  const [rows] = await conn.query(sql, params);
  if (rows.length !== 1) throw new Error(`demoGrade1: expected exactly one ${what}, found ${rows.length}.`);
  return rows[0];
}

// Applies the five rows on `conn` (the caller owns any transaction). Returns
// one entry per row: { subject, term, letter, initial_grade, state } where
// state is 'applied' or 'present'. Throws — writing nothing further — on any
// row in neither state.
async function applyDemoGrade1(conn) {
  const learner = await one(
    conn,
    'SELECT id, grade_level, section FROM students WHERE first_name = ? AND last_name = ? AND grade_level = ? AND section = ?',
    [LEARNER.first_name, LEARNER.last_name, LEARNER.grade_level, LEARNER.section],
    'demo learner'
  );
  const modeRow = await one(
    conn,
    'SELECT mode FROM grading_mode_configs WHERE grade_level = ? AND school_year = ?',
    [LEARNER.grade_level, SCHOOL_YEAR],
    'grading mode for Grade 1'
  );
  if (modeRow.mode !== 'descriptive') throw new Error('demoGrade1: Grade 1 is not descriptive this school year.');

  const results = [];
  for (const row of ROWS) {
    const subject = await one(
      conn,
      'SELECT id FROM subjects WHERE grade_level = ? AND name = ?',
      [LEARNER.grade_level, row.subject],
      `Grade 1 subject ${row.subject}`
    );
    const weights = await one(
      conn,
      'SELECT ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE subject_id = ? AND school_year = ?',
      [subject.id, SCHOOL_YEAR],
      `weights for ${row.subject}`
    );
    const grade = await one(
      conn,
      'SELECT * FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? AND school_year = ?',
      [learner.id, subject.id, row.term, SCHOOL_YEAR],
      `grade row for ${label(row)}`
    );
    const classKey = [subject.id, learner.grade_level, learner.section, row.term, SCHOOL_YEAR];
    const [slots] = await conn.query(
      'SELECT id, type, slot_no, max_score FROM assessment_slots WHERE subject_id = ? AND grade_level = ? AND section = ? AND term = ? AND school_year = ? ORDER BY type, slot_no',
      classKey
    );
    const [components] = await conn.query(
      'SELECT id, type, score, max_score, slot_id FROM grade_components WHERE grade_id = ? ORDER BY type',
      [grade.id]
    );

    const isLegacy =
      grade.descriptive_grade === row.letter &&
      grade.term_grade === null &&
      grade.initial_grade === null &&
      Number(grade.is_locked) === 0 &&
      [grade.ex_st1, grade.ex_st1_max, grade.ex_st2, grade.ex_st2_max, grade.ex_te, grade.ex_te_max].every((v) => v === null) &&
      slots.length === 0 &&
      components.length === 0;

    if (isLegacy) {
      const [wwSlot] = await conn.query(
        "INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score) VALUES (?, ?, ?, ?, ?, 'WW', 1, ?)",
        [...classKey, HPS]
      );
      const [ptSlot] = await conn.query(
        "INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score) VALUES (?, ?, ?, ?, ?, 'PT', 1, ?)",
        [...classKey, HPS]
      );
      const slotIds = { ww: wwSlot.insertId, pt: ptSlot.insertId };
      await conn.query(
        "INSERT INTO grade_components (grade_id, slot_id, type, score, max_score) VALUES (?, ?, 'WW', ?, ?), (?, ?, 'PT', ?, ?)",
        [grade.id, slotIds.ww, row.ww, HPS, grade.id, slotIds.pt, row.pt, HPS]
      );
      const computed = computeRow(row, weights, slotIds);
      if (computed.descriptive_grade !== row.letter) {
        throw new Error(`demoGrade1: ${label(row)} computes ${computed.descriptive_grade}, not the seeded ${row.letter}; nothing written for it.`);
      }
      const [update] = await conn.query(
        `UPDATE grades SET
           ex_st1 = ?, ex_st1_max = ?, ex_st2 = ?, ex_st2_max = ?, ex_te = ?, ex_te_max = ?,
           ww_percentage = ?, ww_weighted = ?, pt_percentage = ?, pt_weighted = ?,
           ex_percentage = ?, ex_weighted = ?,
           initial_grade = ?, term_grade = NULL, descriptive_grade = ?
         WHERE id = ? AND is_locked = 0`,
        [
          row.st1, EXAM_MAX, row.st2, EXAM_MAX, row.te, EXAM_MAX,
          computed.ww_percentage, computed.ww_weighted, computed.pt_percentage, computed.pt_weighted,
          computed.ex_percentage, computed.ex_weighted,
          computed.initial_grade, computed.descriptive_grade,
          grade.id,
        ]
      );
      if (update.affectedRows !== 1) throw new Error(`demoGrade1: ${label(row)} was not updated.`);
      results.push({ subject: row.subject, term: row.term, letter: computed.descriptive_grade, initial_grade: computed.initial_grade, state: 'applied' });
      continue;
    }

    // PRESENT: exactly our two slots, our two components and our values.
    const ww = slots.find((s) => s.type === 'WW');
    const pt = slots.find((s) => s.type === 'PT');
    const ourSlots =
      slots.length === 2 && ww && pt && ww.slot_no === 1 && pt.slot_no === 1 && same(ww.max_score, HPS) && same(pt.max_score, HPS);
    const computed = ourSlots ? computeRow(row, weights, { ww: ww.id, pt: pt.id }) : null;
    const isPresent =
      ourSlots &&
      components.length === 2 &&
      components.some((c) => c.type === 'WW' && c.slot_id === ww.id && same(c.score, row.ww) && same(c.max_score, HPS)) &&
      components.some((c) => c.type === 'PT' && c.slot_id === pt.id && same(c.score, row.pt) && same(c.max_score, HPS)) &&
      same(grade.ex_st1, row.st1) && same(grade.ex_st1_max, EXAM_MAX) &&
      same(grade.ex_st2, row.st2) && same(grade.ex_st2_max, EXAM_MAX) &&
      same(grade.ex_te, row.te) && same(grade.ex_te_max, EXAM_MAX) &&
      grade.term_grade === null &&
      Object.entries(computed).every(([key, value]) => (key === 'descriptive_grade' ? grade[key] === value : same(grade[key], value)));

    if (!isPresent) {
      throw new Error(`demoGrade1: ${label(row)} is neither the seeded legacy row nor the demo row; refusing to touch it.`);
    }
    results.push({ subject: row.subject, term: row.term, letter: grade.descriptive_grade, initial_grade: Number(grade.initial_grade), state: 'present' });
  }
  return results;
}

module.exports = { applyDemoGrade1, computeRow, ROWS, LEARNER, SCHOOL_YEAR, HPS, EXAM_MAX };
