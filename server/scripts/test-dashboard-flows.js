/**
 * GET /api/dashboard tests (DB1).
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * ALMOST read-only. The endpoint under test has no write path, so nothing
 * here exercises one — but the seed gives Marwin no grade rows at all, which
 * means the single most important thing this dispatch added (amendment A1's
 * per-term average, and the gate that withholds it until every subject is
 * recorded) would never run. So ONE fixture is built by direct DB insert:
 * a full term of numerical grades for Marwin, asserted against, then deleted
 * by id in a `finally` block. Nothing else is written, Nino's five
 * descriptive rows and Jea's pending account are never touched, and the
 * database returns to the Seeded baseline.
 *
 * That makes every assertion a claim about SHARED, SEEDED data, so per the
 * working agreement none of them asserts an exact total that the application
 * also writes to. Counts are checked as INVARIANTS (the dashboard's number
 * equals the number the list endpoint it links to reports, whatever that
 * number is today), which stays true after a demo, a browser check, or
 * another suite's fixtures.
 *
 * The two accounts that break a naive implementation are covered on purpose:
 *   TCH-002        adviser of a section, ZERO teacher_assignments rows
 *   Nino's parent  Grade 1, descriptive mode, no numerical grade anywhere
 *
 * Usage: npm run test:dashboard
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/db');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

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

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function login(loginId, password) {
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

// A fixture failure must STOP the run rather than be recorded as one more
// failed assertion — every later check would fail for the same reason and
// bury the cause. Same shape as test-grades-flows.js's requireFixture().
function requireFixture(condition, label) {
  if (condition) {
    console.log(`  · fixture: ${label}`);
    return;
  }
  console.error(`\n  ✗ FIXTURE FAILED: ${label}\n`);
  process.exit(1);
}

// Every grade row this run inserts, by id. Deleted in the `finally` below,
// whatever happens — including a throw partway through the assertions.
const createdGradeIds = [];

async function cleanup() {
  if (!createdGradeIds.length) return;
  const [res] = await pool.query('DELETE FROM grades WHERE id IN (?)', [createdGradeIds]);
  console.log(`  · cleanup: deleted ${res.affectedRows} fixture grade row(s)`);
  const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM grades WHERE id IN (?)', [createdGradeIds]);
  if (Number(left.n) !== 0) {
    console.error(`  ✗ CLEANUP INCOMPLETE — ${left.n} fixture row(s) still present`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log(`\nParents Portal — Dashboard API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  // --- authentication -------------------------------------------------
  console.log('\nAuthentication');
  const anon = await request('GET', '/api/dashboard');
  assert(anon.status === 401, 'No token is 401', `got ${anon.status}`);

  const badToken = await request('GET', '/api/dashboard', { token: 'not-a-jwt' });
  assert(badToken.status === 401, 'Garbage token is 401', `got ${badToken.status}`);

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  requireFixture(adminLogin.status === 200, 'ADMIN001 can log in');
  const adminToken = adminLogin.data.token;
  await policy.accept(adminToken);

  const tch001 = await login('TCH-001', 'Teacher@2026');
  requireFixture(tch001.status === 200, 'TCH-001 can log in');
  const tch001Token = tch001.data.token;
  await policy.accept(tch001Token);

  const tch002 = await login('TCH-002', 'Teacher@2026');
  requireFixture(tch002.status === 200, 'TCH-002 (adviser, no assignments) can log in');
  const tch002Token = tch002.data.token;
  await policy.accept(tch002Token);

  const tch003 = await login('TCH-003', 'Teacher@2026');
  requireFixture(tch003.status === 200, 'TCH-003 (Grade 1, all five subjects) can log in');
  const tch003Token = tch003.data.token;
  await policy.accept(tch003Token);

  const marwinParent = await login('13567454', 'Parent@2026');
  requireFixture(marwinParent.status === 200, "Marwin's parent can log in");
  const marwinToken = marwinParent.data.token;
  await policy.accept(marwinToken);

  const ninoParent = await login('1090001', 'Parent@2026');
  requireFixture(ninoParent.status === 200, "Nino's parent (Grade 1, descriptive) can log in");
  const ninoToken = ninoParent.data.token;
  await policy.accept(ninoToken);

  // --- shape ----------------------------------------------------------
  console.log('\nShape and role branching');
  const asAdmin = await request('GET', '/api/dashboard', { token: adminToken });
  assert(asAdmin.status === 200, 'Admin gets 200', `got ${asAdmin.status}`);
  assert(asAdmin.data?.dashboard?.role === 'admin', 'Admin payload says role admin');

  const asTeacher = await request('GET', '/api/dashboard', { token: tch001Token });
  assert(asTeacher.status === 200, 'Teacher gets 200', `got ${asTeacher.status}`);
  assert(asTeacher.data?.dashboard?.role === 'teacher', 'Teacher payload says role teacher');

  const asParent = await request('GET', '/api/dashboard', { token: marwinToken });
  assert(asParent.status === 200, 'Parent gets 200', `got ${asParent.status}`);
  assert(asParent.data?.dashboard?.role === 'parent', 'Parent payload says role parent');

  assert(
    asAdmin.data.dashboard.school_year && /^\d{4}-\d{4}$/.test(asAdmin.data.dashboard.school_year),
    'school_year is a YYYY-YYYY string'
  );
  assert(Number.isInteger(asAdmin.data.dashboard.term), 'term is a NUMBER, not the settings string');

  // A role must not receive another role's payload keys.
  assert(asParent.data.dashboard.totals === undefined, 'Parent payload has no admin totals');
  assert(asParent.data.dashboard.classes === undefined, 'Parent payload has no teacher classes');
  assert(asTeacher.data.dashboard.totals === undefined, 'Teacher payload has no admin totals');
  assert(asTeacher.data.dashboard.grades === undefined, 'Teacher payload has no parent grades');
  assert(asAdmin.data.dashboard.classes === undefined, 'Admin payload has no teacher classes');
  assert(asAdmin.data.dashboard.grades === undefined, 'Admin payload has no parent grades');

  // --- teacher ---------------------------------------------------------
  console.log('\nTeacher — class-encoding progress');
  const t1 = asTeacher.data.dashboard;
  const assignments = await request('GET', '/api/assignments?limit=200', { token: tch001Token });
  requireFixture(assignments.status === 200, 'GET /api/assignments works for TCH-001');

  assert(
    t1.classes_total === assignments.data.assignments.length,
    'classes_total equals the row count GET /api/assignments returns for this teacher',
    `dashboard ${t1.classes_total}, assignments ${assignments.data.assignments.length}`
  );
  assert(Array.isArray(t1.classes) && t1.classes.length === t1.classes_total, 'classes array length matches classes_total');
  assert(
    t1.classes.every((c) => c.subject_name && c.grade_level && c.section),
    'Every class row names its subject, grade and section'
  );
  assert(
    t1.classes.every((c) => Number.isInteger(c.students) && Number.isInteger(c.recorded)),
    'students and recorded are integers'
  );
  assert(
    t1.classes.every((c) => c.recorded <= c.students),
    'recorded never exceeds the roster — a stale grade row for a moved student must not count'
  );
  assert(
    t1.classes.every((c) => c.complete === (c.students > 0 && c.recorded === c.students)),
    'complete is students > 0 AND recorded === students, per row'
  );
  assert(
    t1.classes_complete === t1.classes.filter((c) => c.complete).length,
    'classes_complete counts exactly the rows flagged complete'
  );
  assert(
    t1.classes_complete <= t1.classes_total,
    'classes_complete never exceeds classes_total'
  );

  // The scope claim, tested from the other side: a teacher's dashboard must
  // not contain a class that belongs to someone else.
  const assignmentIds = new Set(assignments.data.assignments.map((a) => a.id));
  assert(
    t1.classes.every((c) => assignmentIds.has(c.assignment_id)),
    'Every class on the dashboard is one of THIS teacher\'s own assignment rows'
  );

  console.log('\nTeacher — TCH-002, adviser with zero assignments');
  const t2 = (await request('GET', '/api/dashboard', { token: tch002Token })).data.dashboard;
  assert(t2.role === 'teacher', 'TCH-002 gets a teacher payload, not an error');
  assert(Array.isArray(t2.classes) && t2.classes.length === 0, 'TCH-002 has an EMPTY classes array');
  assert(t2.classes_total === 0, 'TCH-002 classes_total is 0');
  assert(t2.classes_complete === 0, 'TCH-002 classes_complete is 0, not NaN');

  console.log('\nTeacher — TCH-003, Grade 1 descriptive classes');
  const t3 = (await request('GET', '/api/dashboard', { token: tch003Token })).data.dashboard;
  assert(t3.classes_total > 0, 'TCH-003 has classes', `got ${t3.classes_total}`);
  assert(
    t3.classes.every((c) => c.grade_level === 1),
    'Every TCH-003 class is Grade 1'
  );
  // Nino's seeded card is descriptive: letters in descriptive_grade, NULL in
  // term_grade. Counting only term_grade would report 0 recorded here, which
  // is the whole reason the query tests both columns.
  assert(
    t3.classes.some((c) => c.recorded > 0),
    'A descriptive class counts a LETTER as recorded (term_grade is NULL on those rows)'
  );

  // --- admin -----------------------------------------------------------
  console.log('\nAdmin — totals match the lists they link to');
  const a1 = asAdmin.data.dashboard;

  const studentsList = await request('GET', '/api/students?status=all&limit=1', { token: adminToken });
  requireFixture(studentsList.status === 200, 'GET /api/students works for admin');
  assert(
    a1.totals.students === studentsList.data.page.total,
    'students equals GET /api/students?status=all page.total',
    `dashboard ${a1.totals.students}, list ${studentsList.data.page.total}`
  );

  const teacherList = await request('GET', '/api/users?role=teacher&limit=1', { token: adminToken });
  assert(
    a1.totals.teachers === teacherList.data.page.total,
    'teachers equals GET /api/users?role=teacher page.total',
    `dashboard ${a1.totals.teachers}, list ${teacherList.data.page.total}`
  );

  const parentList = await request('GET', '/api/users?role=parent&status=active&limit=1', { token: adminToken });
  assert(
    a1.totals.active_parents === parentList.data.page.total,
    'active_parents equals GET /api/users?role=parent&status=active page.total',
    `dashboard ${a1.totals.active_parents}, list ${parentList.data.page.total}`
  );

  const pendingList = await request('GET', '/api/users/parents/pending?limit=1', { token: adminToken });
  assert(
    a1.pending_parents === pendingList.data.page.total,
    'pending_parents equals GET /api/users/parents/pending page.total',
    `dashboard ${a1.pending_parents}, list ${pendingList.data.page.total}`
  );
  assert(a1.pending_parents >= 1, "The seed's pending parent is counted (Jea's account)");

  console.log('\nAdmin — lock count and hazard flag');
  assert(a1.grade_locks.term === a1.term, 'grade_locks.term is the current term');
  assert(Number.isInteger(a1.grade_locks.total), 'grade_locks.total is an integer');
  assert(Number.isInteger(a1.grade_locks.locked), 'grade_locks.locked is an integer, not null from SUM()');
  assert(a1.grade_locks.locked <= a1.grade_locks.total, 'locked never exceeds total');

  assert(typeof a1.hazard.single_unverified_admin === 'boolean', 'hazard flag is a boolean');
  // The seed ships exactly one admin and never verifies its email, so on a
  // clean database this is true. Asserted as an implication rather than a
  // literal, so verifying that email (or adding a second admin) during a
  // demo does not fail the suite.
  const adminCount = (await request('GET', '/api/users?role=admin&status=active&limit=1', { token: adminToken })).data
    .page.total;
  const me = await request('GET', '/api/auth/me', { token: adminToken });
  const soleUnverified = adminCount === 1 && !me.data.user.email_verified_at;
  assert(
    a1.hazard.single_unverified_admin === soleUnverified,
    'hazard is true exactly when there is ONE active admin and their email is unverified',
    `flag ${a1.hazard.single_unverified_admin}, computed ${soleUnverified}`
  );

  // --- parent, numerical ------------------------------------------------
  console.log("\nParent — Marwin (Grade 6, numerical)");
  const p1 = asParent.data.dashboard;
  assert(p1.grades !== null, 'A linked parent gets a grades object');
  assert(p1.grades.descriptive === false, 'Grade 6 is not descriptive');
  assert(p1.grades.subjects_total > 0, 'subjects_total is the curriculum size for the grade level');

  const card = await request('GET', `/api/grades/student/${p1.student_id}`, { token: marwinToken });
  requireFixture(card.status === 200, 'The report card is readable for the same learner');
  assert(
    p1.grades.subjects_total === card.data.subjects.length,
    'subjects_total equals the report card\'s subject count',
    `dashboard ${p1.grades.subjects_total}, card ${card.data.subjects.length}`
  );

  // Recompute the three A1 numbers from the report card and require the
  // dashboard to agree. This is the point of computing them server-side: one
  // implementation, provably the same figures.
  const latestTerm = [3, 2, 1].find((t) =>
    card.data.subjects.some((s) => s.terms[t] && s.terms[t].term_grade !== null)
  );
  assert(
    (p1.grades.term ?? null) === (latestTerm ?? null),
    'term is the LATEST term that has any grade',
    `dashboard ${p1.grades.term}, card ${latestTerm}`
  );

  if (latestTerm) {
    const values = card.data.subjects
      .map((s) => s.terms[latestTerm])
      .filter((t) => t && t.term_grade !== null)
      .map((t) => Number(t.term_grade));
    assert(p1.grades.subjects_recorded === values.length, 'subjects_recorded counts subjects with a term grade');
    const shouldBeComplete = values.length === card.data.subjects.length;
    assert(p1.grades.complete === shouldBeComplete, 'complete means every subject has that term recorded');
    if (!shouldBeComplete) {
      assert(p1.grades.general_average === null, 'An INCOMPLETE term returns a null average, never a partial one');
    }
  } else {
    assert(p1.grades.term === null, 'No grades at all: term is null');
    assert(p1.grades.subjects_recorded === 0, 'No grades at all: subjects_recorded is 0');
    assert(p1.grades.complete === false, 'No grades at all: complete is false');
    assert(p1.grades.general_average === null, 'No grades at all: average is null');
  }

  assert(
    p1.grades.general_average === null || p1.grades.complete === true,
    'An average is NEVER returned unless the term is complete'
  );

  // --- parent, descriptive ----------------------------------------------
  console.log("\nParent — Nino (Grade 1, descriptive)");
  const p2 = (await request('GET', '/api/dashboard', { token: ninoToken })).data.dashboard;
  assert(p2.grades !== null, "Nino's parent gets a grades object");
  assert(p2.grades.descriptive === true, 'Grade 1 reports descriptive: true');
  assert(p2.grades.general_average === null, 'Descriptive NEVER returns a number');
  assert(p2.grades.term === null, 'Descriptive returns no term — there is no progress to show');
  assert(p2.grades.subjects_recorded === null, 'Descriptive returns no recorded count');
  assert(p2.grades.subjects_total > 0, 'Descriptive still reports the curriculum size');

  // Nino HAS five descriptive grade rows, so this is a real check that the
  // letters were not mistaken for numbers anywhere in the branch.
  const ninoCard = await request('GET', `/api/grades/student/${p2.student_id}`, { token: ninoToken });
  requireFixture(ninoCard.status === 200, "Nino's report card is readable");
  requireFixture(ninoCard.data.grading_mode === 'descriptive', 'Nino is in descriptive mode');
  assert(
    ninoCard.data.subjects.some((s) => s.terms[1] && s.terms[1].descriptive_grade),
    'Fixture check: Nino really does have descriptive letters recorded'
  );

  // NO NUMBER REACHES A GRADE 1 PARENT — the whole payload, not one field.
  // Since 2026-09-22 a Grade 1 row carries a real `initial_grade`: the letter
  // is computed from scores, so the number exists in the database for the
  // first time. Key Stage 1 does not report numbers to parents, so the
  // temptation this creates — averaging those numbers into a General
  // Average, or leaking the raw weighted score onto a card — is new, and
  // this is the assertion that catches either one.
  //
  // It scans the SERIALIZED payload rather than named fields, because a
  // field added later would not be in a list written today. Since B7 (D-102,
  // 2026-10-24) Nino's rows hold real scores and Initial Grades
  // (scripts/demoGrade1.js), so the computed case is real here too: no key
  // AND no spelling of any of the five Initial Grades reaches the payload.
  const g1Payload = JSON.stringify(p2);
  assert(!/initial_grade/.test(g1Payload), 'No initial_grade key anywhere in a Grade 1 parent dashboard payload');
  assert(
    !['94.70', '94.7', '85.00', '77.50', '77.5', '70.00', '60.00'].some((s) => g1Payload.includes(s)),
    "None of the computed Grade 1 card's Initial Grades appears in the parent dashboard payload, in any decimal spelling"
  );
  assert(
    p2.grades.general_average === null && p2.grades.term === null && p2.grades.subjects_recorded === null,
    'Every numeric grade field on a Grade 1 parent dashboard is null — there is no General Average in Key Stage 1'
  );

  // --- parent scope -----------------------------------------------------
  console.log('\nParent — scope');
  assert(p1.student_id !== p2.student_id, 'The two parents resolve to different learners');
  const meMarwin = await request('GET', '/api/auth/me', { token: marwinToken });
  assert(
    p1.student_id === meMarwin.data.user.student_id,
    'student_id comes from users.student_id, never from a query or body'
  );
  // The endpoint takes no parameters at all, so there is nothing to tamper
  // with — asserted rather than assumed, because a future filter would be
  // the obvious place to reintroduce one.
  const tampered = await request('GET', `/api/dashboard?student_id=${p2.student_id}`, { token: marwinToken });
  assert(
    tampered.data.dashboard.student_id === p1.student_id,
    'A student_id query param is IGNORED — the parent still gets their own learner'
  );

  // --- parent, A1: a COMPLETE term ------------------------------------
  // The seed gives Marwin no grades, so everything above proved only the
  // empty branch. This inserts one full term across every Grade 6 subject,
  // by direct DB write: reaching a real term_grade through the API would
  // mean encoding WW, PT and three exam sub-scores per subject, which tests
  // the write path this endpoint does not have.
  console.log('\nParent - a COMPLETE term (fixture)');
  const grade6Subjects = await request('GET', '/api/subjects?grade_level=6', { token: adminToken });
  requireFixture(grade6Subjects.status === 200, 'GET /api/subjects?grade_level=6 works');
  const subjectIds = grade6Subjects.data.subjects.map((s) => s.id);
  requireFixture(subjectIds.length > 1, 'Grade 6 has more than one subject');

  const [[existing]] = await pool.query(
    'SELECT COUNT(*) AS n FROM grades WHERE student_id = ? AND term = 1 AND school_year = ?',
    [p1.student_id, p1.school_year]
  );
  requireFixture(
    Number(existing.n) === 0,
    'Marwin has no term-1 rows to start with (the fixture would otherwise collide)'
  );

  // Deliberately NOT all the same value: an average equal to every input
  // would pass even if the mean were computed wrong. These give a real
  // fractional part, so the rounding is exercised rather than assumed.
  const marks = subjectIds.map((_, i) => 80 + (i % 7) + 0.5);
  for (let i = 0; i < subjectIds.length; i += 1) {
    const [res] = await pool.query(
      'INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, 1, ?, ?)',
      [p1.student_id, subjectIds[i], p1.school_year, marks[i]]
    );
    createdGradeIds.push(res.insertId);
  }
  console.log(`  · fixture: inserted ${createdGradeIds.length} term-1 grade rows for Marwin`);

  const full = (await request('GET', '/api/dashboard', { token: marwinToken })).data.dashboard;
  assert(full.grades.term === 1, 'term is 1 once term 1 is the only term with grades', `got ${full.grades.term}`);
  assert(
    full.grades.subjects_recorded === subjectIds.length,
    'subjects_recorded counts every subject just recorded',
    `got ${full.grades.subjects_recorded} of ${subjectIds.length}`
  );
  assert(full.grades.complete === true, 'complete is true when every subject has that term');

  const expected = Math.round((marks.reduce((x, y) => x + y, 0) / marks.length) * 100) / 100;
  assert(
    Number(full.grades.general_average) === expected,
    'general_average is the mean of the term grades, rounded as the report card rounds',
    `got ${full.grades.general_average}, expected ${expected}`
  );

  // The gate itself: remove ONE subject and the number must disappear
  // entirely rather than become a partial average.
  const dropped = createdGradeIds.pop();
  await pool.query('DELETE FROM grades WHERE id = ?', [dropped]);
  const partial = (await request('GET', '/api/dashboard', { token: marwinToken })).data.dashboard;
  assert(partial.grades.complete === false, 'Removing one subject makes the term incomplete');
  assert(
    partial.grades.general_average === null,
    'An incomplete term returns NULL, never a partial average',
    `got ${partial.grades.general_average}`
  );
  assert(
    partial.grades.subjects_recorded === subjectIds.length - 1,
    'subjects_recorded drops by exactly one'
  );

  // The latest-term rule, proved rather than assumed: one term-2 row must
  // move the card forward even though term 1 has far more recorded.
  const [t2res] = await pool.query(
    'INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES (?, ?, 2, ?, ?)',
    [p1.student_id, subjectIds[0], p1.school_year, 91.0]
  );
  createdGradeIds.push(t2res.insertId);
  const laterTerm = (await request('GET', '/api/dashboard', { token: marwinToken })).data.dashboard;
  assert(laterTerm.grades.term === 2, 'One term-2 grade moves the card to term 2', `got ${laterTerm.grades.term}`);
  assert(laterTerm.grades.subjects_recorded === 1, 'The count is term 2s, not term 1s');
  assert(laterTerm.grades.complete === false, 'Term 2 with one subject is not complete');
  assert(laterTerm.grades.general_average === null, 'And therefore has no average');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  return failed;
}

async function main() {
  let failures = 1;
  try {
    failures = await run();
  } catch (error) {
    console.error('\nTest run failed:', error);
  } finally {
    // Runs even on a throw. A process.exit() inside run() would skip it,
    // which is why run() returns a count instead of exiting.
    await cleanup();
    await policy.cleanup();
  }
  process.exit(failures || process.exitCode ? 1 : 0);
}

main();
