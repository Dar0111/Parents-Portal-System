/**
 * Class-summary tests (CR3, 2026-09-22).
 * Prerequisite: npm start (or npm run dev)
 *
 * GET /api/grades/class-summary — the adviser's Summary of Grades: one
 * learner per row, every subject across the row, the General Average at the
 * end. Read-only; nothing in this endpoint writes.
 *
 * THE CENTRAL CASE IS TCH-002, and it is why CR3 needed a server change at
 * all. That account advises Grade 5 - Masigasig and holds ZERO
 * teacher_assignments rows. Until 2026-09-22 `teacherCanViewGrade` was
 * assignments-only, so the adviser of a section could not read one grade in
 * it — not a report card, not the class record — while being the one person
 * the school expects to compile that section's summary. Two assertions here
 * are the whole point of the dispatch: TCH-002 gets 200 on the summary, AND
 * 200 on a learner's report card.
 *
 * IT WRITES TO THROWAWAY LEARNERS, never to seeded ones. Nino's five seeded
 * rows, Marwin's all-Pending demo card and Jea's pending account are never
 * touched. Jea IS read — she is a real Masigasig learner and shows up in the
 * summary with empty cells, which is a case worth having rather than one to
 * work around — so every count assertion here is an INVARIANT against the
 * payload, never a literal row count.
 *
 * NO PARENT ACCOUNTS are created for the throwaway learners. The summary
 * never reads one, and creating them would put pending rows in `users` that
 * the seeded baseline does not have.
 *
 * Usage: npm run test:class-summary
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const SCHOOL_YEAR = '2026-2027';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'parents_portal',
};

// Parent sign-ins accept the privacy notice and terms first; this run's rows
// go in the finally (scripts/policyFixture.js, feat/privacy).
const policy = require('./policyFixture').createPolicyFixture();

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function requireFixture(condition, label, detail = '') {
  if (condition) {
    console.log(`  · fixture: ${label}`);
    return;
  }
  console.error(`\nFIXTURE FAILED — run stopped: ${label}${detail ? ` — ${detail}` : ''}\n`);
  process.exit(1);
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function why(res) {
  return `got ${res.status}: ${res.data?.message || JSON.stringify(res.data)}`;
}

async function withDb(fn) {
  const conn = await mysql.createConnection(dbConfig);
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

const login = (loginId, password) => request('POST', '/api/auth/login', { body: { login_id: loginId, password } });

const summary = (token, { grade_level, section, term, school_year }) => {
  const q = new URLSearchParams({ grade_level: String(grade_level), section, term: String(term) });
  if (school_year) q.set('school_year', school_year);
  return request('GET', `/api/grades/class-summary?${q}`, { token });
};

// Eleven digits, so each learner can prefix one more and still be twelve.
const lrnSuffix = String(Date.now()).slice(-11).padStart(11, '0');

async function main() {
  console.log(`\nClass summary tests against ${BASE}\n`);

  const createdStudentIds = [];
  const createdAssignmentIds = [];

  // A WATERMARK, not a list of this run's own student ids — and the
  // difference is a bug this suite actually shipped once.
  //
  // `PUT /api/grades/class-record` creates a SHELL grade row for every learner
  // in the class who has none, because the grid must work on a class nobody
  // has encoded yet. So encoding for ONE throwaway learner created eight rows
  // for JEA too — a seeded learner this suite must never write. Deleting only
  // `createdStudentIds`' grades left those behind, and the Seeded baseline
  // went from 5 grade rows to 13.
  //
  // Everything created after this id, for a learner in the class this run
  // touched, is this run's. Nino's five and anything predating the run are
  // below the watermark and cannot be reached by it.
  const gradeWatermark = await withDb(async (conn) => {
    const [[row]] = await conn.query('SELECT COALESCE(MAX(id), 0) AS id FROM grades');
    return row.id;
  });

  async function cleanup() {
    // Grades first, by watermark + class, so shell rows created for SEEDED
    // learners in the same section are removed too.
    const [gradeRes] = await withDb((conn) =>
      conn.query(
        `DELETE g FROM grades g
           JOIN students s ON s.id = g.student_id
          WHERE g.id > ? AND s.grade_level = 5 AND s.section = 'Masigasig'`,
        [gradeWatermark]
      )
    );
    if (gradeRes.affectedRows) {
      console.log(`  · cleanup: ${gradeRes.affectedRows} grade row(s) created by this run, including shells for seeded learners`);
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE student_id IN (?)', [createdStudentIds]));
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
    if (createdAssignmentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM teacher_assignments WHERE id IN (?)', [createdAssignmentIds]));
    }
    // Slots this run's class-record saves created. Safe because the grades
    // that referenced them are gone above (the slot FK is ON DELETE RESTRICT,
    // so a row still pointing at one would refuse this).
    await withDb((conn) =>
      conn.query(
        "DELETE FROM assessment_slots WHERE grade_level = 5 AND section = 'Masigasig' AND school_year = ?",
        [SCHOOL_YEAR]
      )
    );
    console.log('  · cleanup: throwaway learners, assignments and slots removed');
  }

  try {
    // ---- fixtures ----
    const adminLogin = await login('ADMIN001', 'Admin@2026');
    requireFixture(adminLogin.status === 200, 'admin logged in', why(adminLogin));
    const adminToken = adminLogin.data.token;

    const t2Login = await login('TCH-002', 'Teacher@2026');
    requireFixture(t2Login.status === 200, 'TCH-002 (adviser of Masigasig, zero assignments) logged in', why(t2Login));
    const t2Token = t2Login.data.token;

    const t1Login = await login('TCH-001', 'Teacher@2026');
    requireFixture(t1Login.status === 200, 'TCH-001 logged in', why(t1Login));
    const t1Token = t1Login.data.token;

    const t3Login = await login('TCH-003', 'Teacher@2026');
    requireFixture(t3Login.status === 200, 'TCH-003 (adviser of Grade 1 - Mabait) logged in', why(t3Login));
    const t3Token = t3Login.data.token;

    const parentLogin = await login('13567454', 'Parent@2026');
    requireFixture(parentLogin.status === 200, "a parent logged in", why(parentLogin));
    const parentToken = parentLogin.data.token;
    await policy.accept(parentToken);

    // TCH-002 really does hold zero assignments — asserted, not assumed,
    // because the whole point of this suite evaporates if the seed changes.
    const t2Assignments = await request('GET', '/api/assignments', { token: t2Token });
    requireFixture(
      t2Assignments.status === 200 && (t2Assignments.data?.assignments || []).length === 0,
      'TCH-002 holds zero teacher_assignments rows',
      `got ${t2Assignments.data?.assignments?.length}`
    );

    // Three throwaway learners in Masigasig. No parent accounts.
    const learners = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await request('POST', '/api/students', {
        token: adminToken,
        body: {
          lrn: `${i}${lrnSuffix}`,
          first_name: `Summary${i}`,
          last_name: `Throwaway${i}`,
          grade_level: 5,
          section: 'Masigasig',
        },
      });
      requireFixture(res.status === 201, `throwaway learner ${i} created`, why(res));
      createdStudentIds.push(res.data.student.id);
      learners.push(res.data.student);
    }

    const [g5Subjects] = await withDb((conn) =>
      conn.query(
        'SELECT id, name, display_order FROM subjects WHERE grade_level = 5 ORDER BY display_order IS NULL, display_order, name'
      )
    );
    requireFixture(g5Subjects.length === 8, 'Grade 5 has 8 subjects', `got ${g5Subjects.length}`);

    // ---- validation ----
    console.log('\nValidation:');

    const noGrade = await request('GET', '/api/grades/class-summary?section=Masigasig&term=1', { token: t2Token });
    assert(noGrade.status === 400, 'missing grade_level is 400', why(noGrade));

    const noSection = await request('GET', '/api/grades/class-summary?grade_level=5&term=1', { token: t2Token });
    assert(noSection.status === 400, 'missing section is 400', why(noSection));

    const badTerm = await summary(t2Token, { grade_level: 5, section: 'Masigasig', term: 4 });
    assert(badTerm.status === 400, 'term=4 is 400', why(badTerm));

    const badYear = await summary(t2Token, {
      grade_level: 5,
      section: 'Masigasig',
      term: 1,
      school_year: '2026-2028',
    });
    assert(badYear.status === 400, 'a non-consecutive school_year is 400', why(badYear));

    const badLevel = await summary(t2Token, { grade_level: 9, section: 'Masigasig', term: 1 });
    assert(badLevel.status === 400, 'grade_level=9 is 400', why(badLevel));

    // ---- scope ----
    console.log('\nScope:');

    const adviserView = await summary(t2Token, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(
      adviserView.status === 200,
      'THE POINT OF CR3: TCH-002 advises Masigasig with zero assignments and gets 200',
      why(adviserView)
    );

    // ...and the same widening reaches the report card, which is the other
    // half of what was broken: the drill-through from this summary.
    const adviserCard = await request('GET', `/api/grades/student/${learners[0].id}`, { token: t2Token });
    assert(
      adviserCard.status === 200,
      "THE OTHER HALF: TCH-002 can read a Masigasig learner's report card (was 404 before CR3)",
      why(adviserCard)
    );

    // A teacher IN view scope but not the adviser. TCH-001 advises Malikhain,
    // so an assignment in Masigasig is created to make this case exist at all
    // — no seeded teacher is assigned to a class they do not advise.
    const assignRes = await request('POST', '/api/assignments', {
      token: adminToken,
      body: { teacher_id: 2, subject_id: g5Subjects[0].id, grade_level: 5, section: 'Masigasig' },
    });
    requireFixture(assignRes.status === 201, 'TCH-001 assigned one Masigasig subject', why(assignRes));
    createdAssignmentIds.push(assignRes.data.assignment.id);

    const inScopeNotAdviser = await summary(t1Token, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(
      inScopeNotAdviser.status === 403,
      'a teacher in view scope but not the adviser gets 403, not 404',
      why(inScopeNotAdviser)
    );
    assert(
      inScopeNotAdviser.data?.message === 'Only the adviser of Grade 5 - Masigasig can open the class summary.',
      'the 403 names the reason and the class',
      `got "${inScopeNotAdviser.data?.message}"`
    );

    const outOfScope = await summary(t3Token, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(outOfScope.status === 404, 'a teacher outside view scope entirely gets 404', why(outOfScope));

    const missingClass = await summary(t2Token, { grade_level: 5, section: 'NoSuchSection', term: 1 });
    assert(
      missingClass.status === 404,
      'a nonexistent class is the SAME 404 — probing cannot tell it from "not yours"',
      why(missingClass)
    );

    const adminView = await summary(adminToken, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(adminView.status === 200, 'admin gets 200, unscoped', why(adminView));

    const parentView = await summary(parentToken, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(parentView.status === 403, 'a parent is refused by authorize()', why(parentView));

    // ---- payload shape ----
    console.log('\nPayload:');

    const body = adviserView.data;
    assert(body?.section?.name === 'Masigasig' && body?.section?.grade_level === 5, 'section identifies the class');
    assert(typeof body?.section?.adviser_name === 'string' && body.section.adviser_name.length > 0,
      "the adviser's name is on the payload", `got ${body?.section?.adviser_name}`);
    assert(body?.grading_mode === 'numerical', 'Grade 5 is numerical', `got ${body?.grading_mode}`);
    assert(body?.school_year === SCHOOL_YEAR, `school_year defaults to ${SCHOOL_YEAR}`, `got ${body?.school_year}`);
    assert(body?.show_final === false, 'show_final is false for a term view');
    assert(body?.show_general_average === true, 'show_general_average is true for a numerical class');
    assert(body?.page === undefined, 'NO pagination — a Summary of Grades is a document, not a list');

    const names = (body?.subjects || []).map((s) => s.name);
    assert(
      names.join(' > ') === 'English > Mathematics > Filipino > Araling Panlipunan > GMRC > Science > MAPEH > EPP',
      "subjects are the COLUMNS and follow the school's printed order (CR3a)",
      names.join(' > ')
    );

    const rowFor = (payload, id) => (payload?.learners || []).find((l) => l.student_id === id);
    const mine = rowFor(body, learners[0].id);
    assert(!!mine, 'a throwaway learner appears in the summary');
    assert(
      Array.isArray(mine?.cells) && mine.cells.length === body.subjects.length,
      'every learner has exactly one cell per subject',
      `${mine?.cells?.length} cells vs ${body?.subjects?.length} subjects`
    );
    assert(
      mine.cells.every((c) => c.value === null),
      'a learner with no grade rows is null in every cell — NEVER 0'
    );
    assert(
      mine.cells.every((c) => c.grade_id === null && c.is_locked === null),
      'and carries no grade_id or lock state for a row that does not exist'
    );
    assert(
      'general_average' in mine && mine.general_average === null,
      'general_average is present and null while subjects are missing'
    );

    // Jea is a seeded Masigasig learner with no grades. She is READ, never
    // written, and her presence is why nothing here asserts a row count.
    assert(
      (body.learners || []).length >= createdStudentIds.length,
      'the summary lists at least this run\'s learners — an invariant, not a count',
      `got ${body.learners?.length}`
    );
    assert(
      (body.completeness || []).every((c) => c.total === body.learners.length),
      "every subject's completeness total is the class size"
    );
    assert(
      (body.completeness || []).every((c) => c.recorded >= 0 && c.recorded <= c.total),
      'recorded is between 0 and total for every subject — counted, never concluded'
    );

    // ---- real grades, through the real write path ----
    console.log('\nWith grades encoded:');

    // Encode one full term for learner 0 across ALL eight subjects, as admin
    // (TCH-002 advises but may not ENCODE — that is asserted in test:grades).
    // All eight are needed because a general average is null until every
    // subject is recorded.
    // SCORES VARY PER SUBJECT ON PURPOSE. A first version gave all eight the
    // same scores, so the eight Term Grades were identical and their mean was
    // a whole number — which made the "at most two decimals" assertion below
    // pass trivially without ever exercising the decimal path. Varying them
    // produces a genuinely fractional General Average, which is the figure
    // GRADING_SPEC §4a says keeps two decimals over ALREADY-ROUNDED finals.
    for (const [index, subject] of g5Subjects.entries()) {
      const ww = 20 - (index % 4); // 20, 19, 18, 17, 20, 19, 18, 17
      const put = await request('PUT', '/api/grades/class-record', {
        token: adminToken,
        body: {
          subject_id: subject.id,
          grade_level: 5,
          section: 'Masigasig',
          term: 1,
          school_year: SCHOOL_YEAR,
          slots: [
            { type: 'WW', slot_no: 1, name: 'Quiz', max_score: 20 },
            { type: 'PT', slot_no: 1, name: 'Task', max_score: 20 },
          ],
          exam_max: { st1: 20, st2: 20, te: 20 },
          entries: [
            {
              student_id: learners[0].id,
              scores: [
                { type: 'WW', slot_no: 1, score: ww },
                { type: 'PT', slot_no: 1, score: 18 },
              ],
              // FLAT on the entry, not nested under `exam` — a first version
              // of this fixture wrapped them and the PUT answered 200 having
              // written no exam scores at all, so every Initial Grade came
              // back null and five assertions failed against correct code.
              // That is the hazard the class-record suite avoids by importing
              // the client's real payload builder; this suite hand-builds and
              // therefore has to get the shape right itself.
              st1_score: 18,
              st2_score: 18,
              te_score: 18,
            },
          ],
        },
      });
      requireFixture(put.status === 200, `term 1 encoded for ${subject.name}`, why(put));
    }

    const encoded = await summary(t2Token, { grade_level: 5, section: 'Masigasig', term: 1 });
    assert(encoded.status === 200, 'the adviser reads the summary again', why(encoded));
    const encodedRow = rowFor(encoded.data, learners[0].id);
    assert(
      encodedRow.cells.every((c) => typeof c.value === 'number'),
      'every subject now carries a number for that learner',
      JSON.stringify(encodedRow.cells.map((c) => c.value))
    );
    assert(
      encodedRow.cells.every((c) => Number.isInteger(c.value)),
      'a Term Grade is a WHOLE number (GRADING_SPEC §4a)',
      JSON.stringify(encodedRow.cells.map((c) => c.value))
    );
    assert(
      encodedRow.cells.every((c) => typeof c.grade_id === 'number' && c.is_locked === false),
      'each cell carries its grade_id and lock state'
    );

    // The general average, recomputed here from the cells the API returned —
    // so this asserts the SERVER's arithmetic rather than restating it.
    const values = encodedRow.cells.map((c) => c.value);
    const expectedGa = Math.round((values.reduce((a, b) => a + b, 0) / values.length + Number.EPSILON) * 100) / 100;
    assert(
      encodedRow.general_average === expectedGa,
      `general_average is the mean of the eight Term Grades to 2 decimals (expected ${expectedGa})`,
      `got ${encodedRow.general_average}`
    );
    assert(
      Number.isFinite(encodedRow.general_average) &&
        Math.round(encodedRow.general_average * 100) === Math.round(encodedRow.general_average * 100),
      'and carries at most two decimals'
    );
    // The assertion that actually bites: the eight Term Grades must NOT all be
    // equal, or the mean is a whole number and the decimal contract above is
    // never tested. This guards the fixture, not the endpoint.
    assert(
      new Set(values).size > 1,
      'the fixture produced DIFFERENT Term Grades across subjects — otherwise the two-decimal case is untested',
      JSON.stringify(values)
    );
    assert(
      !Number.isInteger(encodedRow.general_average),
      'and the resulting General Average is genuinely fractional',
      `got ${encodedRow.general_average}`
    );

    const untouched = rowFor(encoded.data, learners[1].id);
    assert(
      untouched.cells.every((c) => c.value === null) && untouched.general_average === null,
      'a learner nobody encoded stays null everywhere — one learner\'s grades do not leak onto another'
    );

    // A SEEDED learner in the same class. Encoding for one learner gives every
    // OTHER learner a shell grade row (the class-record PUT creates one for
    // anyone who has none), so this asserts the thing that matters: a shell is
    // a row, not a grade, and the summary must still show it as Pending.
    // Those shells are also why this suite's cleanup uses a watermark rather
    // than its own student ids — see the note on `gradeWatermark`.
    const seededInClass = (encoded.data.learners || []).find((l) => !createdStudentIds.includes(l.student_id));
    assert(!!seededInClass, 'a seeded learner shares this class, so the shell-row case is real here');
    assert(
      seededInClass.cells.every((c) => c.value === null),
      'a SHELL row created as a side effect of encoding someone else still reads Pending — a row is not a grade',
      JSON.stringify(seededInClass?.cells?.map((c) => c.value))
    );

    const comp = (encoded.data.completeness || []).find((c) => c.subject_id === g5Subjects[0].id);
    assert(comp && comp.recorded >= 1, 'completeness counts the newly recorded learner', JSON.stringify(comp));
    assert(
      comp && comp.recorded < comp.total,
      'and still reports the rest as pending — a fraction, never a verdict',
      JSON.stringify(comp)
    );

    // ---- term = final ----
    console.log('\nterm=final:');

    const finalView = await summary(t2Token, { grade_level: 5, section: 'Masigasig', term: 'final' });
    assert(finalView.status === 200, 'the adviser can read the final view', why(finalView));
    assert(finalView.data?.show_final === true, 'show_final is true');
    assert(finalView.data?.term === 'final', "term echoes back as 'final'");
    const finalRow = rowFor(finalView.data, learners[0].id);
    assert(
      finalRow.cells.every((c) => c.value === null),
      'a Final Grade is null with only ONE term recorded — never a running average',
      JSON.stringify(finalRow.cells.map((c) => c.value))
    );
    assert(finalRow.general_average === null, 'and the final General Average is null with it');
    assert(
      finalRow.cells.every((c) => c.grade_id === null && c.is_locked === null),
      'a final cell carries no grade_id — it is computed, not a row'
    );

    // ---- Grade 1: descriptive, and NO general average anywhere ----
    console.log('\nGrade 1 (descriptive):');

    const g1 = await summary(t3Token, { grade_level: 1, section: 'Mabait', term: 1 });
    assert(g1.status === 200, 'TCH-003 advises Grade 1 - Mabait and gets 200', why(g1));
    assert(g1.data?.grading_mode === 'descriptive', 'Grade 1 is descriptive', `got ${g1.data?.grading_mode}`);
    assert(g1.data?.show_general_average === false, 'show_general_average is false for Key Stage 1');
    assert(
      (g1.data?.learners || []).every((l) => !('general_average' in l)),
      'the general_average key is ABSENT on a Grade 1 row, not null — the school computes no such figure (§6a)'
    );

    const g1Names = (g1.data?.subjects || []).map((s) => s.name);
    assert(
      g1Names.join(' > ') === 'Makabansa > Mathematics > GMRC > Reading and Literacy > Language',
      "Grade 1 columns follow the provisional printed order",
      g1Names.join(' > ')
    );

    const nino = (g1.data?.learners || []).find((l) => l.first_name === 'Nino');
    requireFixture(!!nino, 'the seeded Grade 1 learner is in the summary');
    const mathCol = g1.data.subjects.findIndex((s) => s.name === 'Mathematics');
    assert(
      nino.cells[mathCol]?.value === 'A',
      "Nino's seeded Mathematics letter reads through the summary unchanged",
      `got ${nino.cells[mathCol]?.value}`
    );
    const gmrcCol = g1.data.subjects.findIndex((s) => s.name === 'GMRC');
    assert(
      nino.cells[gmrcCol]?.value === null,
      'a Grade 1 subject with no row is null, not an empty letter',
      `got ${nino.cells[gmrcCol]?.value}`
    );

    const g1Term2 = await summary(t3Token, { grade_level: 1, section: 'Mabait', term: 2 });
    const nino2 = (g1Term2.data?.learners || []).find((l) => l.first_name === 'Nino');
    assert(nino2?.cells[mathCol]?.value === 'B', "term 2 reads Nino's B", `got ${nino2?.cells[mathCol]?.value}`);

    const g1Final = await summary(t3Token, { grade_level: 1, section: 'Mabait', term: 'final' });
    assert(g1Final.status === 200, 'Grade 1 final view is 200', why(g1Final));
    const ninoFinal = (g1Final.data?.learners || []).find((l) => l.first_name === 'Nino');
    assert(
      ninoFinal?.cells[mathCol]?.value === null,
      'THE LEGACY CASE: all three terms are lettered, yet the Final letter is null — those letters were typed, not computed, so there are no Initial Grades to average',
      `got ${ninoFinal?.cells[mathCol]?.value}`
    );
    assert(
      (g1Final.data?.learners || []).every((l) => !('general_average' in l)),
      'still no general_average key on the Grade 1 final view'
    );
  } finally {
    await policy.cleanup();
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  return failed;
}

main()
  .then((failures) => process.exit(failures > 0 ? 1 : 0))
  .catch((error) => {
    console.error('\nSuite error:', error);
    process.exit(1);
  });
