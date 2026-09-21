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

// A suffix unique to this run, so two runs never collide on an LRN. ELEVEN
// digits, because the LRN validator requires exactly twelve and each learner
// prefixes one more.
const lrnSuffix = String(Date.now()).slice(-11).padStart(11, '0');

async function main() {
  console.log(`\nClass record tests against ${BASE}\n`);

  const createdStudentIds = [];
  const createdGradeIds = [];

  async function cleanup() {
    // Grades first: their components cascade away, which is what frees the
    // slots (the slot FK is ON DELETE RESTRICT). Then the learners, then the
    // slots for the class this run used.
    if (createdGradeIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE id IN (?)', [createdGradeIds]));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grades WHERE student_id IN (?)', [createdStudentIds]));
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
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

    const teacherLogin = await login('TCH-001', 'Teacher@2026');
    requireFixture(teacherLogin.status === 200, 'TCH-001 logs in', why(teacherLogin));
    const teacherToken = teacherLogin.data.token;

    const parentLogin = await login('13567454', 'Parent@2026');
    requireFixture(parentLogin.status === 200, "Marwin's parent logs in", why(parentLogin));
    const parentToken = parentLogin.data.token;

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

    const blankName = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, slots: [{ type: 'PT', slot_no: 2, max_score: 10, name: '   ' }] },
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

    // CORA IS THE UNUSED-SLOT ASSERTION, and the numbers are chosen so a
    // zero would be unmistakable. She has WW1 18/20 = 90% and no WW2 at all,
    // so her WW is 18/20 = 90 — identical to Ana's. If the missing WW2 were
    // counted as 0/10 her WW would be 18/30 = 60.00 and her letter would be
    // a D, not an A.
    assert(
      cora.ww_percentage === 90,
      `Cora's WW ignores the slot she has no score in: 18/20 = 90.00, NOT 18/30 = 60.00 (got ${cora.ww_percentage})`
    );
    assert(cora.descriptive_grade === 'A', `Cora still earns an A (got ${cora.descriptive_grade})`);

    // ...and WW3, in use by nobody, changes nothing for anyone.
    assert(
      afterSave.data.slots.find((s) => s.id === ww3.id).in_use === false,
      'the unused slot is still flagged not in use after a save'
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
    // Ana: WW is now (18+9)/(40+10) = 54.00, so her grade must have moved.
    assert(
      anaAfter.ww_percentage === 54,
      `every affected learner was recomputed: Ana's WW is now 27/50 = 54.00 (got ${anaAfter.ww_percentage})`
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
    // A REAL computed value, not an echo: 40/40 + 9/10 = 49/50 = 98.00 WW.
    assert(
      dryAna && dryAna.ww_percentage === 98,
      `a dry run returns REAL computed values: WW would be 49/50 = 98.00 (got ${dryAna?.ww_percentage})`
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
    const afterClear = await request('GET', `/api/grades/class-record?${qs}`, { token: adminToken });
    const benAfterClear = afterClear.data.learners.find((l) => l.student_id === learners[1].id);
    assert(
      benAfterClear.ww_percentage === 50,
      `the cleared slot leaves Ben's WW at 20/40 = 50.00 — not 60.00 (uncleared) and not 40.00 (counted as zero) (got ${benAfterClear.ww_percentage})`
    );
  } finally {
    await cleanup();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error('\nSuite crashed:', error);
  process.exit(1);
});
