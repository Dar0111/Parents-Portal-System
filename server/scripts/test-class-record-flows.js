/**
 * Class-record tests (CR1, 2026-09-22).
 * Prerequisite: npm start (or npm run dev)
 *
 * GET /api/grades/class-record and PUT /api/grades/class-record — the grid
 * behind the DepEd E-Class Record. Its own suite rather than more of
 * test:grades, which is already at 237.
 *
 * IT WRITES TO A THROWAWAY CLASS, not a seeded one. Every learner, grade
 * row, component and slot this file creates is deleted in a `finally` block,
 * and NOTHING here touches Nino's five seeded rows, Marwin's all-Pending
 * demo card, or Jea's pending account. The section it uses is a real one
 * (POST /students validates the name against `sections`), but the learners
 * in it are this run's own.
 *
 * WHAT THE INTERESTING ASSERTIONS ARE, since the rest is shape:
 *   - an UNUSED slot (no highest possible score) is left OUT of the
 *     computation, never counted as zero
 *   - a USED slot with one learner's score missing leaves THAT learner
 *     null, without dragging anyone else down
 *   - changing a slot's HPS rewrites every row's materialised max_score and
 *     recomputes every affected learner
 *   - clearing an HPS that holds scores is refused
 *   - one locked learner fails the WHOLE save, naming them, and writes
 *     nothing
 *   - a dry run returns real computed values and leaves the database
 *     untouched
 *   - the slot/row max_score agreement invariant, which is the guard on the
 *     one denormalisation this design accepts
 *
 * Usage: npm run test:class-record
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// PostgreSQL since Phase 3 (commit 2): the PG_* keys, the API's own role,
// loopback only (test-helpers/db.js). Results keep mysql2's [rows] shape.
const { withDb } = require('./test-helpers/db');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const SCHOOL_YEAR = '2026-2027';

// THE CLIENT'S OWN REQUEST BUILDER, imported and driven from here.
//
// This is the point of the file it lives in. Defect 8 was a request shape
// the grid produced and no test ever did: every suite in this directory
// builds its bodies by hand, so `Number("WW-2")` -> NaN -> null went
// straight past all of them. Loading the real builder and sending ITS output
// to the real API is the only thing that closes that.
//
// buildPayload.js imports neither React nor axios, which is what makes this
// possible at all — Node can require an ESM module, but not one that pulls
// the whole client with it. Keep it that way.
const {
  buildClassRecordPayload,
  slotKey,
} = require('../../client/src/pages/teacher/classRecord/buildPayload.js');
const { pairsFor, countNotificationsFor } = require('./test-helpers/notifications');

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
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


const login = (loginId, password) => request('POST', '/api/auth/login', { body: { login_id: loginId, password } });

// A suffix unique to this run, so two runs never collide on an LRN. ELEVEN
// digits, because the LRN validator requires exactly twelve and each learner
// prefixes one more.
const lrnSuffix = String(Date.now()).slice(-11).padStart(11, '0');

async function main() {
  console.log(`\nClass record tests against ${BASE}\n`);

  const createdStudentIds = [];
  const createdGradeIds = [];

  async function cleanup() {
    // PUT /class-record reaches the same recomputeGrade() fan-out the per-row
    // writes do, so this suite COULD leave notification rows. Measured
    // 2026-09-25 (pre-Stage-5 #3a, red-first, before any helper was wired):
    // ZERO — every learner it saves for is a fixture with no parent account,
    // so the audience is empty. Asserted rather than deleted: a delete over
    // rows that were never there is theatre, and this guard is what turns
    // the measured fact into a maintained one. Grade ids are resolved
    // BEFORE the deletes, because the student-keyed delete below cascades
    // grades no list holds.
    const gradeIds = new Set(createdGradeIds);
    if (createdStudentIds.length) {
      const [rows] = await withDb((conn) => conn.query('SELECT id FROM grades WHERE student_id = ANY(?::int[])', [createdStudentIds]));
      for (const r of rows) gradeIds.add(r.id);
    }
    const notificationPairs = pairsFor('grade', [...gradeIds]);
    // Grades first: their components cascade away, which is what frees the
    // slots (the slot FK is ON DELETE RESTRICT). Then the learners, then the
    // slots for the class this run used.
    if (createdGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id = ANY(?::int[])', [createdGradeIds]));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE student_id = ANY(?::int[])', [createdStudentIds]));
      await withDb((conn) => conn.query('DELETE FROM students WHERE id = ANY(?::int[])', [createdStudentIds]));
    }
    const leftover = await withDb((conn) => countNotificationsFor(conn, notificationPairs));
    assert(
      leftover === 0,
      `no notification row for any of this run's ${notificationPairs.length} grades — the fan-out has no audience here (measured, not assumed)`,
      `got ${leftover}`
    );
    const [res] = await withDb((conn) =>
      conn.query('DELETE FROM assessment_slots WHERE section = ? AND school_year = ?', ['Matipid', SCHOOL_YEAR])
    );
    console.log(`  · cleanup: removed ${res.affectedRows} slot(s) for the throwaway class`);
  }

  try {
    const health = await request('GET', '/api/health');
    requireFixture(health.status === 200, 'the API is reachable');

    const adminLogin = await login('ADMIN001', 'Admin@2026');
    requireFixture(adminLogin.status === 200, 'admin logs in', why(adminLogin));
    const adminToken = adminLogin.data.token;
    await policy.accept(adminToken);

    const teacherLogin = await login('TCH-001', 'Teacher@2026');
    requireFixture(teacherLogin.status === 200, 'TCH-001 logs in', why(teacherLogin));
    const teacherToken = teacherLogin.data.token;
    await policy.accept(teacherToken);

    const parentLogin = await login('13567454', 'Parent@2026');
    requireFixture(parentLogin.status === 200, "Marwin's parent logs in", why(parentLogin));
    const parentToken = parentLogin.data.token;
    await policy.accept(parentToken);

    // The throwaway class: Grade 1 - Matipid. Grade 1 so the DESCRIPTIVE
    // path is exercised by the same grid as everything else — the letter is
    // computed from the same scores since 2026-09-22.
    const subjectsRes = await request('GET', '/api/subjects?grade_level=1&limit=200', { token: adminToken });
    requireFixture(subjectsRes.status === 200 && subjectsRes.data.subjects.length, 'Grade 1 subjects load');
    const subject = subjectsRes.data.subjects.find((s) => s.name === 'Mathematics') || subjectsRes.data.subjects[0];

    const classKey = {
      subject_id: subject.id,
      grade_level: 1,
      section: 'Matipid',
      term: 1,
      school_year: SCHOOL_YEAR,
    };
    const qs = `subject_id=${classKey.subject_id}&grade_level=1&section=Matipid&term=1&school_year=${SCHOOL_YEAR}`;

    // Three learners, so "one learner is missing a score" is distinguishable
    // from "everybody is".
    const learners = [];
    for (const [i, name] of ['Ana', 'Ben', 'Cora'].entries()) {
      const res = await request('POST', '/api/students', {
        token: adminToken,
        body: {
          lrn: `${i + 1}${lrnSuffix}`,
          first_name: name,
          last_name: 'Gridfixture',
          grade_level: 1,
          section: 'Matipid',
        },
      });
      requireFixture(res.status === 201, `learner ${name} enrolled`, why(res));
      createdStudentIds.push(res.data.student.id);
      learners.push({ id: res.data.student.id, name });
    }

    // -----------------------------------------------------------------
    console.log('\nGET /class-record — shape and scope');
    // -----------------------------------------------------------------
    const anon = await request('GET', `/api/grades/class-record?${qs}`);
    assert(anon.status === 401, 'unauthenticated GET is 401');

    const asParent = await request('GET', `/api/grades/class-record?${qs}`, { token: parentToken });
    assert(asParent.status === 403, 'a parent cannot read a class record at all');

    const missingParams = await request('GET', '/api/grades/class-record?grade_level=1', { token: adminToken });
    assert(missingParams.status === 400, 'a request missing subject_id is 400');

    const badTerm = await request('GET', `/api/grades/class-record?${qs.replace('term=1', 'term=5')}`, {
      token: adminToken,
    });
    assert(badTerm.status === 400, 'term 5 is 400');

    const empty = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    assert(empty.status === 200, `admin reads the class record (${why(empty)})`);
    assert(Array.isArray(empty.data.slots) && empty.data.slots.length === 0, 'a class with no slots returns an empty slot list');
    assert(
      empty.data.learners.length === 3 && empty.data.learners.every((l) => l.grade_id === null),
      `all three learners appear with no grade row yet (got ${empty.data.learners.length})`
    );
    assert(empty.data.grading_mode === 'descriptive', `Grade 1 reports descriptive mode (got ${empty.data.grading_mode})`);
    assert(
      empty.data.weights.ww === 30 && empty.data.weights.pt === 50 && empty.data.weights.ex === 20,
      `Grade 1 weights are 30/50/20 (got ${JSON.stringify(empty.data.weights)})`
    );
    assert(empty.data.can_encode === true, 'admin can_encode is true');

    // TCH-001 teaches Grade 6 - Malikhain, not Grade 1 - Matipid: outside
    // view scope entirely, so 404 rather than 403 (anti-enumeration).
    const outOfScope = await request('GET', `/api/grades/class-record?${qs}`, { token: teacherToken });
    assert(outOfScope.status === 404, `a teacher outside view scope gets 404, not 403 (${why(outOfScope)})`);

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — slots');
    // -----------------------------------------------------------------
    const noBody = await request('PUT', '/api/grades/class-record', { token: adminToken, body: { ...classKey } });
    assert(noBody.status === 400, 'a save with neither slots nor entries is 400');

    const decimalHps = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 1, max_score: 20.5 }] },
    });
    assert(
      decimalHps.status === 400 && /whole number/i.test(decimalHps.data?.message || ''),
      `a decimal highest possible score is refused (${why(decimalHps)})`
    );

    const longName = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 1, max_score: 20, name: 'x'.repeat(101) }] },
    });
    assert(longName.status === 400, 'a slot name over 100 characters is 400');

    const createSlots = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        slots: [
          { type: 'WW', slot_no: 1, max_score: 20, name: 'Long quiz' },
          { type: 'WW', slot_no: 2, max_score: 10 },
          // NO max_score: this slot is UNUSED, and the whole point of the
          // next section is that it changes nobody's grade.
          { type: 'WW', slot_no: 3 },
          { type: 'PT', slot_no: 1, max_score: 50 },
        ],
      },
    });
    requireFixture(createSlots.status === 200, 'four slots created', why(createSlots));

    const slots = createSlots.data.slots;
    const ww1 = slots.find((s) => s.type === 'WW' && s.slot_no === 1);
    const ww2 = slots.find((s) => s.type === 'WW' && s.slot_no === 2);
    const ww3 = slots.find((s) => s.type === 'WW' && s.slot_no === 3);
    const pt1 = slots.find((s) => s.type === 'PT' && s.slot_no === 1);

    assert(ww1.display_label === 'Long quiz', `a named slot's display_label is its name (got "${ww1.display_label}")`);
    assert(ww2.display_label === 'Written Work 2', `an unnamed WW slot falls back to its number (got "${ww2.display_label}")`);
    assert(pt1.display_label === 'Performance Task 1', `an unnamed PT slot falls back too (got "${pt1.display_label}")`);
    assert(ww3.max_score === null && ww3.in_use === false, 'a slot with no highest possible score is flagged not in use');
    assert(ww1.in_use === true, 'a slot with a highest possible score is in use');

    // NO max_score, deliberately. This exists to check that a
    // whitespace-only name normalises to NULL, and giving it a maximum
    // would make it a USED column nobody has a score in — which since
    // 2026-09-22 makes every learner's PT Pending and quietly wrecks every
    // arithmetic assertion below. The first version of this test did give
    // it one, and that is exactly what happened.
    const blankName = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'PT', slot_no: 2, name: '   ' }] },
    });
    const pt2 = blankName.data.slots.find((s) => s.type === 'PT' && s.slot_no === 2);
    assert(
      pt2.name === null && pt2.display_label === 'Performance Task 2',
      `a whitespace-only name normalises to NULL, not '' (got ${JSON.stringify(pt2.name)})`
    );

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — scores, and the unused slot');
    // -----------------------------------------------------------------
    const scoreInUnusedSlot = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww3.id, score: 5 }] }],
      },
    });
    assert(
      scoreInUnusedSlot.status === 400 && /highest possible score/i.test(scoreInUnusedSlot.data?.message || ''),
      `a score cannot go in a slot with no HPS (${why(scoreInUnusedSlot)})`
    );

    // Ana and Ben get everything; Cora is missing WW2 on purpose.
    const save = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        entries: [
          {
            student_id: learners[0].id,
            scores: [
              { slot_id: ww1.id, score: 18 },
              { slot_id: ww2.id, score: 9 },
              { slot_id: pt1.id, score: 45 },
            ],
            st1_score: 27, st1_max: 30, st2_score: 27, st2_max: 30, te_score: 36, te_max: 40,
          },
          {
            student_id: learners[1].id,
            scores: [
              { slot_id: ww1.id, score: 20 },
              { slot_id: ww2.id, score: 10 },
              { slot_id: pt1.id, score: 50 },
            ],
            st1_score: 30, st1_max: 30, st2_score: 30, st2_max: 30, te_score: 40, te_max: 40,
          },
          {
            student_id: learners[2].id,
            scores: [
              { slot_id: ww1.id, score: 18 },
              { slot_id: pt1.id, score: 45 },
            ],
            st1_score: 27, st1_max: 30, st2_score: 27, st2_max: 30, te_score: 36, te_max: 40,
          },
        ],
      },
    });
    requireFixture(save.status === 200, 'the class saves', why(save));
    for (const row of save.data.results) createdGradeIds.push(row.grade_id);

    const afterSave = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const byId = new Map(afterSave.data.learners.map((l) => [l.student_id, l]));
    const ana = byId.get(learners[0].id);
    const ben = byId.get(learners[1].id);
    const cora = byId.get(learners[2].id);

    // ANA: WW (18+9)/(20+10) = 90%, PT 45/50 = 90%, Summative all 90% -> 90.
    assert(
      ana.ww_percentage === 90 && ana.pt_percentage === 90 && ana.initial_grade === 90,
      `Ana: WW 90.00, PT 90.00, Initial Grade 90.00 by hand (got ${ana.ww_percentage}/${ana.pt_percentage}/${ana.initial_grade})`
    );
    assert(ana.descriptive_grade === 'A', `Ana's computed letter is A (got ${ana.descriptive_grade})`);
    assert(ana.term_grade === null, 'a descriptive row still carries no term_grade');

    assert(ben.initial_grade === 100 && ben.descriptive_grade === 'A', `Ben scores 100 and an A (got ${ben.initial_grade})`);

    // CORA IS THE MISSING-SCORE ASSERTION, and it was WRONG until
    // 2026-09-22 — it asserted 90.00, the behaviour the defect produced.
    //
    // She has WW1 18/20 and NO WW2, and WW2 is a USED column: the class sat
    // that assessment. So her Written Works are not computable yet —
    // Pending — and so is everything downstream of them.
    //
    // The old behaviour left the missing score out of both the numerator
    // and the denominator and reported 90.00, which RAISES the grade of a
    // learner who missed an assessment above one who sat it and did
    // averagely. Counting it as zero would be the opposite error. Pending
    // is the only honest answer: nobody has marked her yet.
    assert(
      cora.ww_percentage === null,
      `Cora is missing a score in the USED slot WW2, so her WW is Pending — not 90.00, not 60.00 (got ${cora.ww_percentage})`
    );
    assert(
      cora.initial_grade === null && cora.descriptive_grade === null,
      `and everything downstream is Pending too (got IG ${cora.initial_grade}, letter ${cora.descriptive_grade})`
    );
    // Her PT is unaffected — she HAS that score, and the two groups are
    // computed independently.
    assert(cora.pt_percentage === 90, `her PT still computes: 45/50 = 90.00 (got ${cora.pt_percentage})`);

    // ...and WW3, in use by nobody, changes nothing for anyone. THE TWO
    // CASES MUST NOT BE CONFUSED: an UNUSED slot means the assessment never
    // happened, so nobody is missing anything; a USED slot with no score
    // means this learner has not been marked. Ana and Ben both compute
    // fine with WW3 sitting there unused.
    assert(
      afterSave.data.slots.find((s) => s.id === ww3.id).in_use === false,
      'the unused slot is still flagged not in use after a save'
    );
    assert(
      ana.ww_percentage === 90 && ben.ww_percentage === 100,
      'an UNUSED slot makes nobody Pending — only a used one does'
    );

    // THE AGREEMENT INVARIANT: every component row's materialised max_score
    // equals its slot's. This is the guard on the one denormalisation this
    // design accepts, and it is checked rather than asserted in a comment.
    const [drift] = await withDb((conn) =>
      conn.query(
        `SELECT c.id FROM grade_components c
           JOIN assessment_slots s ON s.id = c.slot_id
          WHERE c.max_score <> s.max_score`
      )
    );
    assert(drift.length === 0, `every component's max_score matches its slot's (found ${drift.length} that do not)`);

    // -----------------------------------------------------------------
    console.log('\nTotal / PS / WS all come from the SERVER');
    // -----------------------------------------------------------------
    // The grid prints three columns per group, and none of them may be
    // added up in the client: a Total the client summed could disagree with
    // the PS beside it by a rounding step, which is the hardest kind of
    // wrong number to explain to a teacher looking at two figures that
    // should agree.
    assert(
      ana.ww_total === 27 && ana.ww_total_max === 30,
      `Ana's WW Total is the raw sum: 18 + 9 = 27 out of 20 + 10 = 30 (got ${ana.ww_total}/${ana.ww_total_max})`
    );
    // THE RELATIONSHIP, not just the presence. Total / TotalMax x 100 must
    // equal the PS the server already stored, to the same 2 decimals — if
    // they ever diverge, one of the two is computed from something the
    // other is not.
    for (const learner of [ana, ben, cora]) {
      for (const group of ['ww', 'pt', 'ex']) {
        const total = learner[`${group}_total`];
        const max = learner[`${group}_total_max`];
        const ps = learner[`${group}_percentage`];
        if (total === null || max === null) continue;
        // A PENDING group still has a Total — the raw sum of what HAS been
        // recorded — while its PS is null, because the group is not
        // computable until every used column is marked. That is not a
        // divergence between the two numbers; it is the whole point of the
        // rule, so it is skipped here and asserted directly above.
        if (ps === null) continue;
        const derived = Math.round((total / max) * 100 * 100) / 100;
        assert(
          derived === ps,
          `${learner.name} ${group.toUpperCase()}: Total/TotalMax x 100 equals the stored PS (${total}/${max} -> ${derived}, stored ${ps})`
        );
      }
    }
    // ...and Cora is the case that makes the skip above meaningful rather
    // than a hole: she has a Total and no PS, on purpose.
    assert(
      cora.ww_total === 18 && cora.ww_percentage === null,
      `a Pending group still shows what HAS been recorded: Cora's WW Total is 18 with no PS (got ${cora.ww_total}/${cora.ww_percentage})`
    );
    assert(
      cora.ww_total === 18 && cora.ww_total_max === 20,
      `Cora's Total counts only the slot she HAS a score in: 18/20, not 18/30 (got ${cora.ww_total}/${cora.ww_total_max})`
    );
    assert(
      ana.ex_total === 90 && ana.ex_total_max === 100,
      `The Summative Total is the three parts summed: 27+27+36 = 90 out of 30+30+40 = 100 (got ${ana.ex_total}/${ana.ex_total_max})`
    );
    assert(
      ana.ww_weighted !== null && ana.pt_weighted !== null,
      'WS (the weighted score) is returned too — the third E-Class Record column'
    );

    // -----------------------------------------------------------------
    console.log('\nslots carry BOTH labels');
    // -----------------------------------------------------------------
    const namedSlot = afterSave.data.slots.find((s) => s.id === ww1.id);
    const plainSlot = afterSave.data.slots.find((s) => s.id === ww2.id);
    assert(
      namedSlot.display_label === 'Long quiz' && namedSlot.short_label === 'Long quiz',
      `a NAMED slot is its name in both (got "${namedSlot.display_label}" / "${namedSlot.short_label}")`
    );
    // The grid column sits under a "Written / Oral Works" group header, so
    // repeating the category in every column heading is what made the
    // labels truncate. The parent modal has no such header and needs the
    // full text.
    assert(
      plainSlot.display_label === 'Written Work 2' && plainSlot.short_label === '2',
      `an UNNAMED slot is full text for the parent modal and just its number for the grid (got "${plainSlot.display_label}" / "${plainSlot.short_label}")`
    );

    // -----------------------------------------------------------------
    console.log('\nexam_max — one class-wide value, reaching EVERY learner');
    // -----------------------------------------------------------------
    // A Summative is one paper sat by the whole class, so its maximum is set
    // once in the grid header. The storage stays per learner (ex_st1_max is
    // a column on `grades`), which means the save has to fan the value out —
    // including to a learner who has no score yet and may not even have a
    // grade row.
    const freshStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `4${lrnSuffix}`,
        first_name: 'Dex',
        last_name: 'Gridfixture',
        grade_level: 1,
        section: 'Matipid',
      },
    });
    requireFixture(freshStudent.status === 201, 'a fourth learner with NO grade row at all', why(freshStudent));
    const freshId = freshStudent.data.student.id;
    createdStudentIds.push(freshId);

    const beforeFan = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const freshBefore = beforeFan.data.learners.find((l) => l.student_id === freshId);
    assert(
      freshBefore && freshBefore.grade_id === null && freshBefore.ex_st1_max === null,
      'the new learner starts with no grade row and no Summative maximum'
    );

    const setExamMax = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, exam_max: { st1: 40, st2: 40, te: 60 } },
    });
    assert(setExamMax.status === 200, `exam_max alone is a valid save — no slots, no entries (${why(setExamMax)})`);

    const afterFan = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    for (const row of afterFan.data.learners) {
      if (row.grade_id) createdGradeIds.push(row.grade_id);
    }
    assert(
      afterFan.data.learners.every((l) => l.ex_st1_max === 40 && l.ex_st2_max === 40 && l.ex_te_max === 60),
      `EVERY learner now carries the class maximum (got ${JSON.stringify(afterFan.data.learners.map((l) => l.ex_st1_max))})`
    );
    const freshAfter = afterFan.data.learners.find((l) => l.student_id === freshId);
    assert(
      freshAfter.grade_id !== null,
      'the learner who had NO grade row got one — otherwise their first score would be refused for having no maximum'
    );
    assert(
      afterFan.data.exam_max.st1 === 40 && afterFan.data.exam_max.te === 60,
      `the read returns it as ONE header value (got ${JSON.stringify(afterFan.data.exam_max)})`
    );
    assert(
      afterFan.data.exam_max_mixed.st1 === false,
      'and says the class agrees on it'
    );

    // A learner who disagrees can only come from a row written before the
    // grid, or a direct edit. The header then shows the most common value
    // and SAYS the class disagrees, rather than silently picking one and
    // overwriting the rest on the next save.
    await withDb((conn) =>
      conn.query('UPDATE grades SET ex_st1_max = 99 WHERE student_id = ? AND subject_id = ?', [
        learners[0].id,
        classKey.subject_id,
      ])
    );
    const mixedRead = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    assert(
      mixedRead.data.exam_max_mixed.st1 === true,
      'one learner out of step makes exam_max_mixed true for that part'
    );
    assert(
      mixedRead.data.exam_max.st1 === 40,
      `and the header still shows the value most of the class has (got ${mixedRead.data.exam_max.st1})`
    );
    await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, exam_max: { st1: 40 } },
    });

    // THE DEFECT THE BROWSER CHECK FOUND (2026-09-22). A learner with no
    // stored Summative maximum was refused — "ST1: a score needs a max, and
    // this learner has none stored yet" — while the grid header plainly
    // showed 30/30/40, because that maximum came from ANOTHER learner's row
    // and the client only sent exam_max when the header was edited.
    //
    // The server side of the fix is that a save carrying BOTH the maxima and
    // the scores succeeds in one request, which is what the grid now always
    // sends. Dex has a grade row (the fan-out above created one) but the
    // point holds: the maxima and the scores arrive together.
    const freshWithScores = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        exam_max: { st1: 40, st2: 40, te: 60 },
        entries: [{ student_id: freshId, st1_score: 30, st2_score: 30, te_score: 45 }],
      },
    });
    assert(
      freshWithScores.status === 200,
      `maxima and scores in ONE save succeed for a learner who had neither (${why(freshWithScores)})`
    );
    const freshScored = freshWithScores.data.results.find((r) => Number(r.student_id) === Number(freshId));
    assert(
      freshScored && freshScored.ex_total === 105 && freshScored.ex_total_max === 140,
      `and the Summative computes: 30+30+45 = 105 out of 40+40+60 = 140 (got ${freshScored?.ex_total}/${freshScored?.ex_total_max})`
    );

    // The negative case, so the assertion above is not passing for free: the
    // SAME scores without the maxima, on a learner who has none, is exactly
    // the refusal the browser hit.
    const bareStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `5${lrnSuffix}`,
        first_name: 'Elle',
        last_name: 'Gridfixture',
        grade_level: 1,
        section: 'Matipid',
      },
    });
    requireFixture(bareStudent.status === 201, 'a learner with no grade row at all', why(bareStudent));
    createdStudentIds.push(bareStudent.data.student.id);
    const noMaxSave = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, entries: [{ student_id: bareStudent.data.student.id, st1_score: 30 }] },
    });
    assert(
      noMaxSave.status === 400 && /needs a max/i.test(noMaxSave.data?.message || ''),
      `a Summative score with NO maximum is still refused — which is why the grid must always send it (${why(noMaxSave)})`
    );

    // -----------------------------------------------------------------
    console.log('\nThe HPS row — group_hps, and what an HPS change does to it');
    // -----------------------------------------------------------------
    // The school's E-Class Record prints the highest possible score once per
    // group, above every learner, rather than as a denominator on every
    // line. TOTAL is the sum of the USED slots' maxima; PS is 100.00 by
    // definition; WS is the group's weight. All from the server.
    const hpsRead = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const usedWw = hpsRead.data.slots
      .filter((s) => s.type === 'WW' && s.max_score !== null)
      .reduce((sum, s) => sum + s.max_score, 0);
    assert(
      hpsRead.data.group_hps.ww === usedWw,
      `group_hps.ww is the sum of the USED WW slots (expected ${usedWw}, got ${hpsRead.data.group_hps.ww})`
    );
    // An UNUSED slot contributes nothing — the same rule that keeps it out
    // of a learner's total keeps it out of the class's.
    assert(
      hpsRead.data.slots.some((s) => s.type === 'WW' && s.max_score === null),
      'fixture check: at least one WW slot really is unused'
    );
    assert(
      hpsRead.data.group_hps.ex === 140,
      `the Summative HPS is the three class maxima summed: 40+40+60 = 140 (got ${hpsRead.data.group_hps.ex})`
    );

    // SETTING A PHANTOM SLOT'S HPS MOVES IT. The browser check saw nothing
    // change when a previously-unused column was given a maximum, because
    // the only number that should move is this one — no learner has a score
    // in a brand-new column, so no learner's grade changes.
    const beforeNewSlot = hpsRead.data.group_hps.ww;
    const addSlot = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 5, max_score: 15 }] },
    });
    assert(addSlot.status === 200, `a previously-unused slot can be given a maximum (${why(addSlot)})`);
    const newSlotId = addSlot.data.slots.find((s) => s.type === 'WW' && s.slot_no === 5).id;
    const afterNewSlot = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    assert(
      afterNewSlot.data.group_hps.ww === beforeNewSlot + 15,
      `and the class HPS moves by exactly that: ${beforeNewSlot} -> ${beforeNewSlot + 15} (got ${afterNewSlot.data.group_hps.ww})`
    );
    // ...AND EVERY LEARNER BECOMES PENDING, which is the half this used to
    // get wrong. Giving a column a highest possible score says the class
    // sat that assessment; nobody has been marked in it yet, so nobody's
    // Written Works are computable until they are.
    //
    // This is also why a slot change recomputes the WHOLE class rather than
    // the learners with a score in that slot: the learners who need
    // recomputing are exactly the ones with NO row there, who could never
    // be found by looking for one.
    const anaAfterNewSlot = afterNewSlot.data.learners.find((l) => l.student_id === learners[0].id);
    const anaBeforeNewSlot = hpsRead.data.learners.find((l) => l.student_id === learners[0].id);
    assert(
      anaBeforeNewSlot.ww_percentage !== null,
      `fixture check: Ana's WW was computable before the new column (was ${anaBeforeNewSlot.ww_percentage})`
    );
    assert(
      afterNewSlot.data.learners.every((l) => l.ww_percentage === null),
      `a new used column makes EVERY unscored learner Pending (got ${JSON.stringify(afterNewSlot.data.learners.map((l) => l.ww_percentage))})`
    );
    assert(
      anaAfterNewSlot.ww_total === anaBeforeNewSlot.ww_total,
      `their raw Total is unchanged — only the computability moved (${anaBeforeNewSlot.ww_total} -> ${anaAfterNewSlot.ww_total})`
    );

    // TYPING A SCORE RESOLVES IT, including a real zero. A learner who
    // genuinely scored nothing is recorded as 0 and computes; that is a
    // different statement from "not marked yet", and the grid has to be
    // able to say both.
    const scoreTheNewSlot = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        entries: [
          { student_id: learners[0].id, scores: [{ slot_id: newSlotId, score: 15 }] },
          { student_id: learners[1].id, scores: [{ slot_id: newSlotId, score: 0 }] },
        ],
      },
    });
    assert(scoreTheNewSlot.status === 200, `scores go into the new column (${why(scoreTheNewSlot)})`);
    const resolved = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const anaResolved = resolved.data.learners.find((l) => l.student_id === learners[0].id);
    const benResolved = resolved.data.learners.find((l) => l.student_id === learners[1].id);
    assert(
      anaResolved.ww_percentage !== null,
      `Ana is computable again once marked (got ${anaResolved.ww_percentage})`
    );
    assert(
      benResolved.ww_percentage !== null,
      `and a score of ZERO resolves it too — 0 is a mark, not a blank (got ${benResolved.ww_percentage})`
    );
    const coraStill = resolved.data.learners.find((l) => l.student_id === learners[2].id);
    assert(
      coraStill.ww_percentage === null,
      'while Cora, still unmarked in two columns, stays Pending'
    );

    // A DRY RUN returns the same totals a save would, so the grid can show
    // them live — including after an HPS change.
    const dryAfterHps = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        dry_run: true,
        entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 3 }] }],
      },
    });
    const dryRow = dryAfterHps.data.results.find((r) => Number(r.student_id) === Number(learners[0].id));
    assert(
      dryAfterHps.status === 200 && dryRow && dryRow.ww_total !== null && dryRow.ww_percentage !== null,
      `a dry run returns Total and PS, not just the grade (${why(dryAfterHps)})`
    );

    const decimalExamMax = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, exam_max: { st1: 40.5 } },
    });
    assert(
      decimalExamMax.status === 400 && /whole number/i.test(decimalExamMax.data?.message || ''),
      `a decimal class maximum is refused like any other (${why(decimalExamMax)})`
    );

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — changing and clearing a highest possible score');
    // -----------------------------------------------------------------
    const raiseHps = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 1, max_score: 40, name: 'Long quiz' }] },
    });
    assert(raiseHps.status === 200, `a slot's HPS can be changed (${why(raiseHps)})`);

    const [rowsAfterRaise] = await withDb((conn) =>
      conn.query('SELECT max_score FROM grade_components WHERE slot_id = ?', [ww1.id])
    );
    assert(
      rowsAfterRaise.length === 3 && rowsAfterRaise.every((r) => Number(r.max_score) === 40),
      `changing the HPS rewrote all three learners' stored max_score (got ${JSON.stringify(rowsAfterRaise.map((r) => r.max_score))})`
    );

    const afterRaise = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const anaAfter = afterRaise.data.learners.find((l) => l.student_id === learners[0].id);
    // Ana now holds THREE marks — WW1, WW2 and the WW5 column added and
    // scored earlier in this suite — so raising WW1's maximum to 40 gives
    // (18 + 9 + 15) / (40 + 10 + 15) = 42/65 = 64.62. The figure this line
    // carried before was 27/50 = 54.00, from when WW5 did not exist; it is
    // updated rather than loosened, because a by-hand number is the whole
    // value of the assertion.
    assert(
      anaAfter.ww_percentage === 64.62,
      `every affected learner was recomputed: Ana's WW is now 42/65 = 64.62 (got ${anaAfter.ww_percentage})`
    );
    assert(
      anaAfter.descriptive_grade !== 'A',
      `Ana's letter moved with it (got ${anaAfter.descriptive_grade}, was A)`
    );

    const clearUsed = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 1, max_score: null }] },
    });
    assert(
      clearUsed.status === 409 && /cannot be cleared/i.test(clearUsed.data?.message || ''),
      `clearing an HPS that holds scores is refused (${why(clearUsed)})`
    );
    assert(
      /3 learners have scores/i.test(clearUsed.data?.message || ''),
      `the refusal names how many scores are in the way (got "${clearUsed.data?.message}")`
    );

    // Nothing was changed by the refusal — the transaction rolled back.
    const [stillThere] = await withDb((conn) =>
      conn.query('SELECT max_score FROM assessment_slots WHERE id = ?', [ww1.id])
    );
    assert(Number(stillThere[0].max_score) === 40, 'the refused clear left the slot untouched');

    // An UNUSED slot can be cleared freely — that is how a teacher un-books
    // a column they set up by mistake.
    const clearUnused = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'WW', slot_no: 3, max_score: null }] },
    });
    assert(clearUnused.status === 200, `an unused slot's HPS can be cleared (${why(clearUnused)})`);

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — dry run');
    // -----------------------------------------------------------------
    const beforeDry = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const anaBeforeDry = beforeDry.data.learners.find((l) => l.student_id === learners[0].id);
    // THREE counts, not one. A dry run must leave no trace of any kind:
    // no component rows, no notifications (a parent pinged about a grade
    // that was never saved is worse than no ping), and no activity_logs row
    // (the audit trail is what a reviewer reads to reconstruct who did
    // what, and a rolled-back save did not happen).
    const [componentsBefore] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM grade_components'));
    const [notificationsBefore] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM notifications'));
    const [logsBefore] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM activity_logs'));

    const dry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        dry_run: true,
        entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww1.id, score: 40 }] }],
      },
    });
    assert(dry.status === 200 && dry.data.dry_run === true, `a dry run answers 200 and says so (${why(dry)})`);

    const dryAna = dry.data.results.find((r) => r.student_id === learners[0].id);
    // A REAL computed value, not an echo. Ana's WW1 becomes 40/40 and she
    // keeps WW2 9/10 and WW5 15/15: 64/65 = 98.46.
    assert(
      dryAna && dryAna.ww_percentage === 98.46,
      `a dry run returns REAL computed values: WW would be 64/65 = 98.46 (got ${dryAna?.ww_percentage})`
    );

    const afterDry = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const anaAfterDry = afterDry.data.learners.find((l) => l.student_id === learners[0].id);
    assert(
      anaAfterDry.ww_percentage === anaBeforeDry.ww_percentage &&
        anaAfterDry.initial_grade === anaBeforeDry.initial_grade,
      `a dry run wrote NOTHING: Ana is unchanged at ${anaBeforeDry.ww_percentage} (got ${anaAfterDry.ww_percentage})`
    );
    const [componentsAfter] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM grade_components'));
    assert(
      Number(componentsBefore[0].n) === Number(componentsAfter[0].n),
      `a dry run created no component rows (${componentsBefore[0].n} -> ${componentsAfter[0].n})`
    );
    const [notificationsAfter] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM notifications'));
    assert(
      Number(notificationsBefore[0].n) === Number(notificationsAfter[0].n),
      `a dry run notified nobody (${notificationsBefore[0].n} -> ${notificationsAfter[0].n})`
    );
    const [logsAfter] = await withDb((conn) => conn.query('SELECT COUNT(*) n FROM activity_logs'));
    assert(
      Number(logsBefore[0].n) === Number(logsAfter[0].n),
      `a dry run wrote no activity_logs row (${logsBefore[0].n} -> ${logsAfter[0].n})`
    );

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — a locked learner fails the whole save');
    // -----------------------------------------------------------------
    // A LOCKED LEARNER FREEZES THE CLASS'S HIGHEST POSSIBLE SCORES
    // (fix/grade-locks, 2026-10-13; the owner's Finding 1a). Setting, changing
    // or clearing a column's HPS rewrites the materialised maxima of every row
    // in it and recomputes the class — a locked learner included, until this
    // fix — so a locked grade could move, or fall back to Pending. Now the
    // save is refused while ANY learner of the class has a locked row for this
    // subject and term, naming every one of them; a dry run reports it too,
    // without "Nothing was saved.". Self-contained: it locks and unlocks its
    // own rows, so the section below starts exactly as it did before.
    const hpsBefore = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    requireFixture(hpsBefore.status === 200, 'the class record reads before the HPS cases', why(hpsBefore));
    const learnerRow = (id) => hpsBefore.data.learners.find((l) => l.student_id === id);
    // The API's `name` is "Last, First"; the refusal says "First Last".
    const fullName = (id) => {
      const [last, first] = learnerRow(id).name.split(', ');
      return `${first} ${last}`;
    };
    const anaFull = fullName(learners[0].id);
    const coraFull = fullName(learners[2].id);
    const anaHpsGradeId = learnerRow(learners[0].id).grade_id;
    const coraHpsGradeId = learnerRow(learners[2].id).grade_id;
    requireFixture(anaHpsGradeId && coraHpsGradeId, 'Ana and Cora both have a grade row to lock');
    const coraBeforeHps = learnerRow(learners[2].id);
    const ww1Now = hpsBefore.data.slots.find((s) => s.id === ww1.id);
    const changeWw1 = { type: 'WW', slot_no: 1, max_score: Number(ww1Now.max_score) + 5 };
    const TAIL = 'for this subject and term — ask an admin to unlock before changing a highest possible score.';

    const lockCoraForHps = await request('PATCH', `/api/grades/${coraHpsGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    requireFixture(lockCoraForHps.status === 200, 'Cora is locked for the HPS cases', why(lockCoraForHps));

    const hpsSave = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [changeWw1] },
    });
    assert(hpsSave.status === 409, `changing a used column's HPS while a learner is locked is 409 (got ${hpsSave.status})`);
    assert(
      hpsSave.data?.message === `Nothing was saved. ${coraFull} has a locked grade ${TAIL}`,
      'the refusal names the one locked learner ("has a locked grade") and says to ask an admin to unlock',
      why(hpsSave)
    );

    const hpsDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [changeWw1] },
    });
    assert(hpsDry.status === 409, `a dry run of the same change is 409 too (got ${hpsDry.status})`);
    assert(
      hpsDry.data?.message === `${coraFull} has a locked grade ${TAIL}`,
      'the dry run says the same without "Nothing was saved."',
      why(hpsDry)
    );

    // A NEW column given an HPS is the same move (it makes the locked
    // learner's group Pending), so it is refused as well.
    const newColumn = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'PT', slot_no: 9, max_score: 10 }] },
    });
    assert(
      newColumn.status === 409 && newColumn.data?.message === `Nothing was saved. ${coraFull} has a locked grade ${TAIL}`,
      'giving a new column an HPS while a learner is locked is refused with the same message',
      why(newColumn)
    );

    // NOTHING WAS WRITTEN: the column keeps its HPS, every materialised copy of
    // it is untouched, the refused column does not exist, and Cora's locked
    // grade did not move.
    const [ww1Row] = await withDb((conn) => conn.query('SELECT max_score FROM assessment_slots WHERE id = ?', [ww1.id]));
    assert(Number(ww1Row[0].max_score) === Number(ww1Now.max_score), 'the refused change left WW1 at its HPS');
    const [ww1Copies] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS n FROM grade_components WHERE slot_id = ? AND max_score <> ?', [ww1.id, ww1Now.max_score])
    );
    assert(Number(ww1Copies[0].n) === 0, "no learner's WW1 maximum was rewritten (Cora's included)");
    const [pt9Rows] = await withDb((conn) =>
      conn.query(
        'SELECT COUNT(*) AS n FROM assessment_slots WHERE subject_id = ? AND grade_level = ? AND section = ? AND term = ? AND school_year = ? AND type = ? AND slot_no = ?',
        [classKey.subject_id, classKey.grade_level, classKey.section, classKey.term, classKey.school_year, 'PT', 9]
      )
    );
    assert(Number(pt9Rows[0].n) === 0, 'the refused new column was not created');
    const hpsAfter = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const coraAfterHps = hpsAfter.data.learners.find((l) => l.student_id === learners[2].id);
    assert(
      coraAfterHps.ww_percentage === coraBeforeHps.ww_percentage &&
        coraAfterHps.pt_percentage === coraBeforeHps.pt_percentage &&
        coraAfterHps.initial_grade === coraBeforeHps.initial_grade &&
        coraAfterHps.descriptive_grade === coraBeforeHps.descriptive_grade,
      "Cora's locked grade did not move"
    );

    // WHAT IS NOT REFUSED, each as a dry run so nothing here writes: a rename
    // at the same HPS, an unused column sent back unchanged (null to null is
    // not a change), and a score-only save for an unlocked learner.
    const renameDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        dry_run: true,
        slots: [{ type: 'WW', slot_no: 1, max_score: Number(ww1Now.max_score), name: 'Long test (renamed)' }],
      },
    });
    assert(renameDry.status === 200, `renaming a column at the same HPS is allowed while a learner is locked (got ${renameDry.status})`, why(renameDry));
    const unusedDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [{ type: 'WW', slot_no: 3, max_score: null }] },
    });
    assert(unusedDry.status === 200, `an unused column sent back unchanged is allowed (got ${unusedDry.status})`, why(unusedDry));
    const scoreOnlyDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 8 }] }] },
    });
    assert(scoreOnlyDry.status === 200, `a score for an unlocked learner, no HPS change, is allowed (got ${scoreOnlyDry.status})`, why(scoreOnlyDry));

    // TWO LOCKED: both named, in name order, joined with ", ", and the plural.
    const lockAnaForHps = await request('PATCH', `/api/grades/${anaHpsGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    requireFixture(lockAnaForHps.status === 200, 'Ana is locked as well', why(lockAnaForHps));
    const twoSave = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [changeWw1] },
    });
    assert(
      twoSave.status === 409 && twoSave.data?.message === `Nothing was saved. ${anaFull}, ${coraFull} have locked grades ${TAIL}`,
      'with two locked learners both are named, in name order, with "have locked grades"',
      why(twoSave)
    );
    const twoDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [changeWw1] },
    });
    assert(
      twoDry.status === 409 && twoDry.data?.message === `${anaFull}, ${coraFull} have locked grades ${TAIL}`,
      'the two-learner dry run says the same without "Nothing was saved."',
      why(twoDry)
    );

    const unlockAnaForHps = await request('PATCH', `/api/grades/${anaHpsGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: false },
    });
    const unlockCoraForHps = await request('PATCH', `/api/grades/${coraHpsGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: false },
    });
    requireFixture(
      unlockAnaForHps.status === 200 && unlockCoraForHps.status === 200,
      'Ana and Cora are unlocked again before the section below'
    );

    const coraGradeId = afterDry.data.learners.find((l) => l.student_id === learners[2].id).grade_id;
    const lock = await request('PATCH', `/api/grades/${coraGradeId}/lock`, {
      token: adminToken,
      body: { is_locked: true },
    });
    requireFixture(lock.status === 200, "Cora's grade is locked", why(lock));

    const lockedSave = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        entries: [
          { student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 1 }] },
          { student_id: learners[2].id, scores: [{ slot_id: ww2.id, score: 1 }] },
        ],
      },
    });
    assert(lockedSave.status === 409, `a locked learner makes the save 409 (${why(lockedSave)})`);
    assert(
      /Cora Gridfixture/.test(lockedSave.data?.message || ''),
      `the refusal NAMES the locked learner (got "${lockedSave.data?.message}")`
    );
    assert(
      /Nothing was saved/i.test(lockedSave.data?.message || ''),
      'the refusal says nothing was saved'
    );

    // AND NOTHING WAS: Ana was in the same request and is untouched. This is
    // the assertion that makes "fails the whole save" mean something — a
    // partial save would have written her row and left Cora's alone.
    const afterLocked = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const anaAfterLocked = afterLocked.data.learners.find((l) => l.student_id === learners[0].id);
    assert(
      anaAfterLocked.ww_percentage === anaAfterDry.ww_percentage,
      `the OTHER learner in that request was not written either (got ${anaAfterLocked.ww_percentage}, expected ${anaAfterDry.ww_percentage})`
    );

    await request('PATCH', `/api/grades/${coraGradeId}/lock`, { token: adminToken, body: { is_locked: false } });

    // -----------------------------------------------------------------
    console.log('\nPUT /class-record — scope and validation');
    // -----------------------------------------------------------------
    const teacherSave = await request('PUT', '/api/grades/class-record', {
      token: teacherToken,
      body: { ...classKey, entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 5 }] }] },
    });
    assert(teacherSave.status === 404, `a teacher outside view scope gets 404 on the save too (${why(teacherSave)})`);

    const parentSave = await request('PUT', '/api/grades/class-record', {
      token: parentToken,
      body: { ...classKey, entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 5 }] }] },
    });
    assert(parentSave.status === 403, 'a parent cannot save a class record');

    const foreignLearner = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      // Marwin is Grade 6 - Malikhain, not in this class.
      body: { ...classKey, entries: [{ student_id: 1, scores: [{ slot_id: ww2.id, score: 5 }] }] },
    });
    assert(
      foreignLearner.status === 400 && /not an active learner/i.test(foreignLearner.data?.message || ''),
      `a learner from another class is refused (${why(foreignLearner)})`
    );

    const duplicate = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        entries: [
          { student_id: learners[0].id, scores: [] },
          { student_id: learners[0].id, scores: [] },
        ],
      },
    });
    assert(duplicate.status === 400 && /Duplicate/i.test(duplicate.data?.message || ''), 'a duplicate student_id is 400');

    // -----------------------------------------------------------------
    console.log('\nHow a score names its column — both shapes (defect 8)');
    // -----------------------------------------------------------------
    // THE GRID DOES NOT ADDRESS A CELL BY SLOT ID. Since phantom columns
    // landed it addresses them by type and number, because a column that
    // does not exist yet has no id. The payload builder was still doing
    // Number(field) on "WW-2" — NaN, which JSON serialises as null — so
    // every new score typed into an existing column was refused with "Each
    // score needs a valid slot_id".
    //
    // THESE TESTS DO NOT CLOSE THAT GAP, and saying so is the point: they
    // are hand-built request bodies, exactly like the ones that passed
    // while the grid was broken. What they pin is the SERVER's half of the
    // contract — that both shapes are accepted and mean the same thing.
    // Driving the client's own builder is a separate, declared piece of
    // work; see the dispatch report.
    const shapeA = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        dry_run: true,
        entries: [{ student_id: learners[2].id, scores: [{ slot_id: ww2.id, score: 7 }] }],
      },
    });
    assert(shapeA.status === 200, `a score naming its column by slot_id is accepted (${why(shapeA)})`);

    // THE SAME SCORE, naming the column by type and number instead. Slots
    // are upserted before entries in the one transaction, so the server can
    // resolve it — which is what makes a phantom typeable before its first
    // save.
    const shapeB = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        dry_run: true,
        entries: [{ student_id: learners[2].id, scores: [{ type: 'WW', slot_no: ww2.slot_no, score: 7 }] }],
      },
    });
    assert(shapeB.status === 200, `and by type + slot_no (${why(shapeB)})`);
    const aRow = shapeA.data.results.find((r) => Number(r.student_id) === Number(learners[2].id));
    const bRow = shapeB.data.results.find((r) => Number(r.student_id) === Number(learners[2].id));
    assert(
      aRow && bRow && aRow.ww_total === bRow.ww_total && aRow.ww_percentage === bRow.ww_percentage,
      `the two shapes produce the same numbers (${aRow?.ww_total}/${aRow?.ww_percentage} vs ${bRow?.ww_total}/${bRow?.ww_percentage})`
    );

    // A COLUMN CREATED AND SCORED IN THE SAME SAVE — the case that has no
    // id to send at all, and the reason the second shape exists.
    const createAndScore = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: {
        ...classKey,
        slots: [{ type: 'PT', slot_no: 4, max_score: 20 }],
        entries: [{ student_id: learners[0].id, scores: [{ type: 'PT', slot_no: 4, score: 20 }] }],
      },
    });
    assert(
      createAndScore.status === 200,
      `a column created AND scored in ONE save works — there is no id to send (${why(createAndScore)})`
    );
    const [[scored]] = await withDb((conn) =>
      conn.query(
        `SELECT c.score FROM grade_components c
           JOIN assessment_slots s ON s.id = c.slot_id
           JOIN grades g ON g.id = c.grade_id
          WHERE s.type = 'PT' AND s.slot_no = 4 AND g.student_id = ?`,
        [learners[0].id]
      )
    );
    assert(Number(scored?.score) === 20, `and the score really landed in it (got ${scored?.score})`);

    const badShape = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, entries: [{ student_id: learners[0].id, scores: [{ score: 5 }] }] },
    });
    assert(
      badShape.status === 400 && /slot_id, or a type and slot_no/.test(badShape.data?.message || ''),
      `a score naming no column at all is refused, saying what is missing (${why(badShape)})`
    );

    // -----------------------------------------------------------------
    console.log("\nTHE GRID'S OWN PAYLOAD BUILDER, driven from here");
    // -----------------------------------------------------------------
    // Everything above builds its request by hand. This block does not: it
    // loads the function the browser runs, feeds it grid state, and sends
    // the result to the real API. Defect 8 lived exactly in the space
    // between those two things.
    //
    // A tiny helper so each case reads as "this is what the teacher typed".
    const gridState = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const asGridState = (draft, slotDraft = {}, examMaxDraft = {}) =>
      buildClassRecordPayload({
        server: gridState.data,
        draft,
        slotDraft,
        examMaxDraft,
        key: classKey,
      });

    // A learner with NO grade row yet, so the save has to create one.
    const noRowStudent = await request('POST', '/api/students', {
      token: adminToken,
      body: {
        lrn: `6${lrnSuffix}`,
        first_name: 'Fritz',
        last_name: 'Gridfixture',
        grade_level: 1,
        section: 'Matipid',
      },
    });
    requireFixture(noRowStudent.status === 201, 'a learner with no grade row', why(noRowStudent));
    createdStudentIds.push(noRowStudent.data.student.id);
    const fritzId = noRowStudent.data.student.id;
    const freshState = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const stateWithFritz = (draft, slotDraft = {}, examMaxDraft = {}) =>
      buildClassRecordPayload({
        server: freshState.data,
        draft,
        slotDraft,
        examMaxDraft,
        key: classKey,
      });

    // CASE 1 — a new score in an existing used column, for a learner with no
    // row. This is the exact keystroke that was refused.
    const case1 = stateWithFritz({ [`${fritzId}:${slotKey('WW', ww2.slot_no)}`]: '7' });
    assert(
      case1 && case1.entries[0].scores[0].slot_id === ww2.id,
      `the builder names an existing column by slot_id (got ${JSON.stringify(case1?.entries[0]?.scores[0])})`
    );
    const case1Res = await request('PUT', '/api/grades/class-record', { token: adminToken, body: case1 });
    assert(case1Res.status === 200, `and the API accepts it (${why(case1Res)})`);

    // CASE 2 — a column made used AND scored in the same save. There is no
    // id to send; the builder must name it by type and number.
    // PT 3, INSIDE the fixed frame. The first version of this used PT 5 and
    // the builder correctly dropped it — the frame is Written Works 1-5 and
    // Performance Tasks 1-3, so a column the grid cannot show is a column a
    // teacher cannot have typed into. The test was wrong, not the builder.
    const case2 = stateWithFritz(
      { [`${fritzId}:${slotKey('PT', 3)}`]: '9' },
      { [slotKey('PT', 3)]: { max_score: '10' } }
    );
    assert(
      case2 && case2.entries[0].scores[0].type === 'PT' && case2.entries[0].scores[0].slot_no === 3,
      `a column with no row yet is named by type and number (got ${JSON.stringify(case2?.entries[0]?.scores[0])})`
    );
    const case2Res = await request('PUT', '/api/grades/class-record', { token: adminToken, body: case2 });
    assert(case2Res.status === 200, `and the API creates it and stores the score (${why(case2Res)})`);

    // CASE 3 — exam scores for a learner with NO stored maxima. The builder
    // must attach the header's maxima unasked, or the save is refused for a
    // value that is on screen.
    const case3 = stateWithFritz({
      [`${fritzId}:st1_score`]: '30',
      [`${fritzId}:st2_score`]: '30',
      [`${fritzId}:te_score`]: '45',
    });
    assert(
      case3 && case3.exam_max && case3.exam_max.st1 > 0,
      `exam scores carry the header maxima without the header being touched (got ${JSON.stringify(case3?.exam_max)})`
    );
    const case3Res = await request('PUT', '/api/grades/class-record', { token: adminToken, body: case3 });
    assert(case3Res.status === 200, `and the API accepts them together (${why(case3Res)})`);

    // CASE 4 — the same payload as a DRY RUN writes nothing and still
    // returns computed values, which is what the grid shows live.
    const beforeDryBuilder = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const case4 = stateWithFritz({ [`${fritzId}:${slotKey('WW', ww2.slot_no)}`]: '3' });
    const case4Res = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...case4, dry_run: true },
    });
    assert(case4Res.status === 200 && case4Res.data.dry_run === true, `a dry run of the same body (${why(case4Res)})`);
    assert(
      case4Res.data.group_hps !== undefined,
      'and it carries group_hps, so the header can move with the learners'
    );
    const afterDryBuilder = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const fritzBefore = beforeDryBuilder.data.learners.find((l) => l.student_id === fritzId);
    const fritzAfter = afterDryBuilder.data.learners.find((l) => l.student_id === fritzId);
    assert(
      fritzBefore.ww_total === fritzAfter.ww_total,
      `and wrote nothing (${fritzBefore.ww_total} -> ${fritzAfter.ww_total})`
    );

    // CASE 5 — a dry run whose slot HPS changed reports the NEW class total,
    // not the stored one. The grid's header read 30 while the learners below
    // were already computed against 40.
    const beforeHps = afterDryBuilder.data.group_hps.ww;
    const case5 = stateWithFritz({}, { [slotKey('WW', 4)]: { max_score: '10' } });
    const case5Res = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...case5, dry_run: true },
    });
    assert(
      case5Res.data.group_hps.ww === beforeHps + 10,
      `a dry run's group_hps includes an UNSAVED highest possible score: ${beforeHps} -> ${beforeHps + 10} (got ${case5Res.data.group_hps.ww})`
    );
    const stillStored = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    assert(
      stillStored.data.group_hps.ww === beforeHps,
      `while the stored total is untouched (got ${stillStored.data.group_hps.ww})`
    );

    // Nothing to save builds nothing — which is what keeps Save disabled.
    assert(stateWithFritz({}) === null, 'an untouched grid builds no payload at all');

    const decimalScore = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, entries: [{ student_id: learners[0].id, scores: [{ slot_id: ww2.id, score: 5.5 }] }] },
    });
    assert(
      decimalScore.status === 400 && /whole number/i.test(decimalScore.data?.message || ''),
      `a decimal score is refused on the bulk path too (${why(decimalScore)})`
    );

    const decimalExam = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, entries: [{ student_id: learners[0].id, st1_score: 15.5, st1_max: 20 }] },
    });
    assert(decimalExam.status === 400, 'a decimal Summative score is refused on the bulk path');

    // Clearing a score removes the row rather than storing a zero — the same
    // distinction the unused slot rests on.
    const clearScore = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, entries: [{ student_id: learners[1].id, scores: [{ slot_id: ww2.id, score: null }] }] },
    });
    assert(clearScore.status === 200, `an explicit null clears a score (${why(clearScore)})`);
    const [benRows] = await withDb((conn) =>
      conn.query('SELECT COUNT(*) n FROM grade_components c JOIN grades g ON g.id = c.grade_id WHERE g.student_id = ? AND c.slot_id = ?', [
        learners[1].id,
        ww2.id,
      ])
    );
    assert(Number(benRows[0].n) === 0, 'the cleared score is DELETED, not stored as 0');

    // AND THE CLEARED SLOT IS GONE FROM THE AVERAGE, not counted as zero.
    // Ben's WW1 is 20, and its HPS was raised to 40 earlier in this suite,
    // so his WW is now 20/40 = 50.00. Before the clear it was
    // (20+10)/(40+10) = 30/50 = 60.00; if the cleared WW2 were counted as
    // 0/10 it would be 20/50 = 40.00. Three different numbers, and only one
    // of them is the rule this asserts.
    // CLEARING A SCORE IN A USED COLUMN MAKES THAT LEARNER PENDING, and
    // this assertion used to say 50.00 — the defect's answer. WW2 is still
    // a column the class sat; deleting Ben's mark means he is unmarked in
    // it, which is not the same as the assessment not existing. Un-typing a
    // score and never typing it are the same state, and they must read the
    // same way.
    const afterClear = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const benAfterClear = afterClear.data.learners.find((l) => l.student_id === learners[1].id);
    assert(
      benAfterClear.ww_percentage === null,
      `clearing a score in a USED column makes Ben Pending again — not 50.00, not 40.00 (got ${benAfterClear.ww_percentage})`
    );
    assert(
      benAfterClear.ww_total !== null,
      `while his raw Total still shows what IS recorded (got ${benAfterClear.ww_total})`
    );
  } finally {
    await cleanup();
    await policy.cleanup();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error('\nSuite crashed:', error);
  process.exit(1);
});
