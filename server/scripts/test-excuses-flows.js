/**
 * Excuse Letters API tests — full CRUD (submit, list, view, edit) plus
 * PATCH /:id/review (approve/decline). Review is adviser-only (not any
 * assigned teacher) and never touches the attendance table — see
 * CLAUDE.md's BLOCKED / RESOLVED section.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every excuse letter this script creates for the seeded
 * parent (Marwin) is tracked and deleted explicitly; the fixture
 * student/parent/teacher it creates fresh are deleted too (deleting a
 * fixture teacher cascades its teacher_assignments row via
 * fk_assignments_teacher; deleting the fixture student/parent cascades
 * any of their own excuse letters via fk_excuse_student/fk_excuse_parent,
 * but everything is covered explicitly either way) — passes on repeat
 * runs with no db:setup.
 *
 * Usage: npm run test:excuses
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { hashPassword } = require('../utils/password');
const { pairsFor, deleteNotificationsFor, countNotificationsFor } = require('./test-helpers/notifications');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Parent sign-ins accept the privacy notice and terms first; this run's rows
// go in the finally. A teacher this run creates skips the first-sign-in
// password change (scripts/policyFixture.js, feat/privacy).
const { createPolicyFixture, clearForcedChange } = require('./policyFixture');
const policy = createPolicyFixture();

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
    body: body ? JSON.stringify(body) : undefined,
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

// Local wall-clock dates — same reasoning as the other suites' date
// helpers post-dateStrings fix: no toISOString(), no UTC.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function tomorrow() {
  return daysAgo(-1);
}

async function run() {
  console.log(`\nParents Portal — Excuse Letters API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Malikhain, and is that
  // section's adviser — both facts matter here: teacher_assignments for
  // read-scope, sections.adviser_id for review authority.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  const teacherId = teacherLogin.data?.user?.id;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Malikhain, adviser)');

  // TCH-002 advises Grade 5 - Masigasig and holds ZERO teacher_assignments
  // rows. It is the only fixture that can tell this file's two authorities
  // apart: anything it can see, it sees ONLY as an adviser. Before the
  // 2026-09-06 widening it could not see the excuse-letter queue at all, even
  // though it is the ONLY account permitted to review letters for that
  // section. Do not give it assignment rows for convenience — that deletes the
  // one account capable of failing these checks.
  const adviserLogin = await login('TCH-002', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  const adviserId = adviserLogin.data?.user?.id;
  assert(
    adviserLogin.status === 200 && adviserToken,
    'Adviser-only teacher login (TCH-002, Grade 5 - Masigasig, no assignments)'
  );

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  const parentId = parentLogin.data?.user?.id;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Malikhain)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  const marwinId = meParent.data?.user?.student_id;
  assert(Number.isInteger(marwinId), "Resolve Marwin's student_id via /me");

  const mysql = require('mysql2/promise');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  };
  async function withDb(fn) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  const runId = String(Date.now()).slice(-8);
  const createdExcuseLetterIds = []; // letters on Marwin's (seeded, permanent) account
  const createdLrns = [];
  const createdLoginIds = [];

  async function cleanup() {
    // Submitting a letter notifies the adviser and reviewing it notifies the
    // parent, both keyed on the letter's id, and nothing cascades those rows
    // away (pre-Stage-5 #3a). The two user/student deletes below cascade
    // letters this list may not hold, so their ids are resolved BEFORE any
    // delete runs.
    const letterIds = new Set(createdExcuseLetterIds);
    if (createdLrns.length) {
      const [rows] = await withDb((conn) =>
        conn.query('SELECT id FROM excuse_letters WHERE student_id IN (SELECT id FROM students WHERE lrn IN (?))', [
          createdLrns,
        ])
      );
      for (const r of rows) letterIds.add(r.id);
    }
    const notificationPairs = pairsFor('excuse_letter', [...letterIds]);
    if (createdExcuseLetterIds.length) {
      await withDb((conn) => conn.query('DELETE FROM excuse_letters WHERE id IN (?)', [createdExcuseLetterIds]));
    }
    if (createdLoginIds.length) {
      // Cascades (fk_excuse_parent) any letters tied to the fixture parent.
      await withDb((conn) => conn.query('DELETE FROM users WHERE login_id IN (?)', [createdLoginIds]));
    }
    if (createdLrns.length) {
      // Cascades (fk_excuse_student) any letters tied to the fixture student.
      await withDb((conn) => conn.query('DELETE FROM students WHERE lrn IN (?)', [createdLrns]));
    }
    await withDb(async (conn) => {
      const deleted = await deleteNotificationsFor(conn, notificationPairs);
      const leftover = await countNotificationsFor(conn, notificationPairs);
      assert(
        leftover === 0,
        `every notification row THIS RUN fanned out is gone (${deleted} deleted over ${notificationPairs.length} letters)`,
        `got ${leftover}`
      );
    });
  }

  try {
    // --- Fixture: a student + approved parent outside TCH-001's
    // assignment (Grade 3 - Aguinaldo, not TCH-001's Grade 6 - Malikhain) —
    // doubles as "the out-of-scope student" for teacher-scoping checks
    // and "a different parent" for cross-parent isolation checks.
    // 12 digits (the LRN rule since 2026-09-18); inserted by SQL, so the rule
    // does not run here — the fixture just looks like a real LRN.
    const outsideLrn = `3${String(Date.now()).slice(-11)}`;
    createdLrns.push(outsideLrn);
    await withDb((conn) =>
      conn.query(
        `INSERT INTO students (lrn, first_name, last_name, grade_level, section, status, created_by)
         VALUES (?, 'Outside', 'Scope', 3, 'Aguinaldo', 'active', 2)`,
        [outsideLrn]
      )
    );

    // The parent is inserted by SQL, already active, with a real hash: since
    // 2026-09-18 POST /api/users/parents refuses a teacher who is neither
    // assigned to nor advising the student's section (403 — asserted in
    // test:auth), and TCH-001 is exactly that for Grade 3 - Aguinaldo. The
    // suite logs in as this parent later, so the hash must be usable.
    const outsideLoginId = outsideLrn;
    createdLoginIds.push(outsideLoginId);
    const [[outsideStudentRow]] = await withDb((conn) =>
      conn.query('SELECT id FROM students WHERE lrn = ? LIMIT 1', [outsideLrn])
    );
    const outsideHash = await hashPassword('Parent@2026');
    await withDb((conn) =>
      conn.query(
        `INSERT INTO users (login_id, password, role, status, name, student_id, created_by)
         VALUES (?, ?, 'parent', 'active', 'Outside Guardian', ?, 2)`,
        [outsideLoginId, outsideHash, outsideStudentRow?.id]
      )
    );
    const outsideParentLogin = await login(outsideLoginId, 'Parent@2026');
    const outsideParentToken = outsideParentLogin.data?.token;
    await policy.accept(outsideParentToken);
    assert(
      Boolean(outsideStudentRow?.id) && outsideParentLogin.status === 200,
      'Fixture: an active parent/student outside TCH-001\'s scope, inserted by SQL, can log in'
    );

    // --- Submit ---
    console.log('\nSubmit:');

    const absenceDate = daysAgo(1);
    const submit = await request('POST', '/api/excuse-letters', {
      token: parentToken,
      body: { absence_date: absenceDate, reason: 'Fever', details: 'Saw a doctor, prescribed rest.' },
    });
    assert(submit.status === 201 && submit.data?.excuse_letter?.status === 'Pending', 'Parent submits, gets 201, status is Pending');
    const letterId = submit.data?.excuse_letter?.id;
    if (letterId) createdExcuseLetterIds.push(letterId);

    assert(
      submit.data?.excuse_letter?.student_id === marwinId,
      "student_id is req.user.student_id, never trusted from elsewhere"
    );

    // The actual regression this guards: absence_date posted as
    // 'YYYY-MM-DD' must come back identical, not shifted a calendar day —
    // the pool's dateStrings: ['DATE'] is what makes this true; same shape
    // as the attendance/events/students round-trip checks.
    assert(
      submit.data?.excuse_letter?.absence_date === absenceDate,
      `absence_date round-trips exactly as sent (sent ${absenceDate}, got ${submit.data?.excuse_letter?.absence_date})`
    );

    // Unlinked parent: student_id NULL. Cannot be produced by
    // POST /users/parents (that path always sets student_id from the LRN).
    // INSERT, not UPDATE on a seeded parent — a killed run must not leave
    // a live account with a nulled student_id. login_id is dashed and
    // not all-numeric so the pre-delete cannot collide with a real LRN.
    const UNLINKED_LOGIN_ID = 'TEST-UNLINKED-1';
    const UNLINKED_PASSWORD = 'UnlinkedExc-T1x';
    const UNLINKED_MESSAGE =
      'This account is not linked to a student record yet. The school office must link it before excuse letters can be submitted.';
    let unlinkedParentId = null;
    await withDb(async (conn) => {
      await conn.query('DELETE FROM users WHERE login_id = ?', [UNLINKED_LOGIN_ID]);
      const hashed = await hashPassword(UNLINKED_PASSWORD);
      const [inserted] = await conn.query(
        `INSERT INTO users (login_id, password, role, status, name, student_id)
         VALUES (?, ?, 'parent', 'active', 'Unlinked Throwaway', NULL)`,
        [UNLINKED_LOGIN_ID, hashed]
      );
      unlinkedParentId = inserted.insertId;
    });
    createdLoginIds.push(UNLINKED_LOGIN_ID);

    const unlinkedLogin = await login(UNLINKED_LOGIN_ID, UNLINKED_PASSWORD);
    const unlinkedToken = unlinkedLogin.data?.token;
    await policy.accept(unlinkedToken);
    assert(
      unlinkedLogin.status === 200 && unlinkedToken && Number.isInteger(unlinkedParentId),
      'Fixture: throwaway unlinked parent (TEST-UNLINKED-1, student_id NULL) logs in'
    );

    const unlinkedPost = await request('POST', '/api/excuse-letters', {
      token: unlinkedToken,
      body: { absence_date: absenceDate, reason: 'Fever', details: 'Should never be inserted.' },
    });
    assert(
      unlinkedPost.status === 409 &&
        unlinkedPost.data?.success === false &&
        unlinkedPost.data?.message === UNLINKED_MESSAGE,
      'Unlinked parent POST with a valid body returns 409 naming the school office',
      `status ${unlinkedPost.status}, body ${JSON.stringify(unlinkedPost.data)}`
    );

    const leftoverLetters = await withDb(async (conn) => {
      const [rows] = await conn.query('SELECT id FROM excuse_letters WHERE parent_id = ?', [unlinkedParentId]);
      return rows;
    });
    assert(
      leftoverLetters.length === 0,
      'Unlinked POST inserts no excuse_letters row for the throwaway parent_id'
    );

    const spoofedFields = await request('POST', '/api/excuse-letters', {
      token: parentToken,
      body: {
        absence_date: daysAgo(2),
        reason: 'Spoofed field test',
        status: 'Approved',
        teacher_remarks: 'Should not appear',
        reviewed_by: 999999999,
        parent_id: 999999999,
        student_id: 999999999,
      },
    });
    assert(spoofedFields.status === 201, 'Submission with extra forbidden fields in the body still succeeds');
    if (spoofedFields.data?.excuse_letter?.id) createdExcuseLetterIds.push(spoofedFields.data.excuse_letter.id);
    assert(
      spoofedFields.data?.excuse_letter?.status === 'Pending' &&
        spoofedFields.data?.excuse_letter?.parent_id === parentId &&
        spoofedFields.data?.excuse_letter?.student_id === marwinId &&
        spoofedFields.data?.excuse_letter?.reviewed_by === null,
      'status/parent_id/student_id/reviewed_by from the body are ignored, not applied'
    );

    const missingFields = await request('POST', '/api/excuse-letters', {
      token: parentToken,
      body: { reason: 'No date' },
    });
    assert(missingFields.status === 400, 'Missing absence_date rejected');

    const emptyReason = await request('POST', '/api/excuse-letters', {
      token: parentToken,
      body: { absence_date: daysAgo(1), reason: '   ' },
    });
    assert(emptyReason.status === 400, 'Whitespace-only reason rejected');

    const futureAbsence = await request('POST', '/api/excuse-letters', {
      token: parentToken,
      body: { absence_date: tomorrow(), reason: 'Future absence' },
    });
    assert(futureAbsence.status === 400, 'Future absence_date rejected');

    const teacherCannotSubmit = await request('POST', '/api/excuse-letters', {
      token: teacherToken,
      body: { absence_date: daysAgo(1), reason: 'Teacher trying to submit' },
    });
    assert(teacherCannotSubmit.status === 403, 'Teacher cannot submit an excuse letter');

    const unauthSubmit = await request('POST', '/api/excuse-letters', {
      body: { absence_date: daysAgo(1), reason: 'No token' },
    });
    assert(unauthSubmit.status === 401, 'Unauthenticated submit returns 401');

    // --- Read: /mine ---
    console.log('\n/mine:');

    const mine = await request('GET', '/api/excuse-letters/mine', { token: parentToken });
    const mineIds = (mine.data?.excuse_letters || []).map((l) => l.id);
    assert(
      mine.status === 200 && mineIds.includes(letterId) && mineIds.includes(spoofedFields.data.excuse_letter.id),
      "Parent sees only their own letters on /mine"
    );

    const outsideSubmit = await request('POST', '/api/excuse-letters', {
      token: outsideParentToken,
      body: { absence_date: daysAgo(1), reason: 'Outside parent submission' },
    });
    assert(outsideSubmit.status === 201, "Fixture: outside parent's own letter, for the cross-parent read check");
    const outsideLetterId = outsideSubmit.data?.excuse_letter?.id;

    assert(!mineIds.includes(outsideLetterId), "Parent's /mine does not include another parent's letter");

    const teacherMine = await request('GET', '/api/excuse-letters/mine', { token: teacherToken });
    assert(teacherMine.status === 403, 'Teacher cannot use /mine (parent-only)');

    // --- Read: GET /:id, scoped ---
    console.log('\nGET /:id (scoping):');

    const parentReadsOwn = await request('GET', `/api/excuse-letters/${letterId}`, { token: parentToken });
    assert(parentReadsOwn.status === 200 && parentReadsOwn.data?.excuse_letter?.id === letterId, 'Parent reads own letter');

    const parentReadsOther = await request('GET', `/api/excuse-letters/${outsideLetterId}`, { token: parentToken });
    assert(parentReadsOther.status === 404, "Parent reading another parent's letter returns 404");

    const teacherReadsInScope = await request('GET', `/api/excuse-letters/${letterId}`, { token: teacherToken });
    assert(teacherReadsInScope.status === 200, 'Teacher reads a letter for their assigned student');

    const teacherReadsOutOfScope = await request('GET', `/api/excuse-letters/${outsideLetterId}`, {
      token: teacherToken,
    });
    assert(teacherReadsOutOfScope.status === 404, 'Teacher reading an out-of-scope letter returns 404');

    const adminReadsAny = await request('GET', `/api/excuse-letters/${outsideLetterId}`, { token: adminToken });
    assert(adminReadsAny.status === 200, 'Admin reads any letter');

    const badId = await request('GET', '/api/excuse-letters/abc', { token: adminToken });
    assert(badId.status === 400, 'GET /api/excuse-letters/abc returns 400, not 500');

    const unauthGet = await request('GET', `/api/excuse-letters/${letterId}`);
    assert(unauthGet.status === 401, 'Unauthenticated GET /:id returns 401');

    // --- Read: GET / (teacher/admin list, scoped) ---
    console.log('\nGET / (teacher/admin list):');

    const teacherList = await request('GET', '/api/excuse-letters', { token: teacherToken });
    const teacherListIds = (teacherList.data?.excuse_letters || []).map((l) => l.id);
    assert(
      teacherList.status === 200 && teacherListIds.includes(letterId) && !teacherListIds.includes(outsideLetterId),
      'Teacher list includes their assigned student, excludes the out-of-scope one'
    );

    const adminList = await request('GET', '/api/excuse-letters', { token: adminToken });
    const adminListIds = (adminList.data?.excuse_letters || []).map((l) => l.id);
    assert(
      adminList.status === 200 && adminListIds.includes(letterId) && adminListIds.includes(outsideLetterId),
      'Admin list includes every letter'
    );

    const parentCannotList = await request('GET', '/api/excuse-letters', { token: parentToken });
    assert(parentCannotList.status === 403, 'Parent cannot use the teacher/admin list endpoint');

    const filteredByStudent = await request('GET', `/api/excuse-letters?student_id=${marwinId}`, {
      token: adminToken,
    });
    const filteredIds = (filteredByStudent.data?.excuse_letters || []).map((l) => l.id);
    assert(
      filteredByStudent.status === 200 && filteredIds.includes(letterId) && !filteredIds.includes(outsideLetterId),
      '?student_id filter scopes the list correctly'
    );

    const badStatusFilter = await request('GET', '/api/excuse-letters?status=Whatever', { token: adminToken });
    assert(badStatusFilter.status === 400, 'Invalid ?status= value rejected');

    // --- Edit ---
    console.log('\nEdit:');

    const badPutId = await request('PUT', '/api/excuse-letters/abc', { token: parentToken, body: { reason: 'x' } });
    assert(badPutId.status === 400, 'PUT /api/excuse-letters/abc returns 400, not 500');

    const editAnothers = await request('PUT', `/api/excuse-letters/${outsideLetterId}`, {
      token: parentToken,
      body: { reason: 'Hijacked' },
    });
    assert(editAnothers.status === 404, "PUT on someone else's letter returns 404 (read-scope fails first)");

    const detailsOnlyEdit = await request('PUT', `/api/excuse-letters/${letterId}`, {
      token: parentToken,
      body: { details: 'Updated: also had a cough.' },
    });
    assert(detailsOnlyEdit.status === 200, 'PUT while Pending succeeds');
    assert(
      detailsOnlyEdit.data?.excuse_letter?.absence_date === absenceDate &&
        detailsOnlyEdit.data?.excuse_letter?.reason === 'Fever',
      "PUT with only 'details' does not blank absence_date or reason"
    );
    assert(
      detailsOnlyEdit.data?.excuse_letter?.details === 'Updated: also had a cough.',
      'The field actually sent (details) is applied'
    );

    const spoofedEdit = await request('PUT', `/api/excuse-letters/${letterId}`, {
      token: parentToken,
      body: { reason: 'Legit edit', status: 'Approved', teacher_remarks: 'Nope', reviewed_by: 999999999 },
    });
    assert(
      spoofedEdit.status === 200 &&
        spoofedEdit.data?.excuse_letter?.status === 'Pending' &&
        spoofedEdit.data?.excuse_letter?.reviewed_by === null,
      'PUT ignores status/teacher_remarks/reviewed_by in the body — status stays Pending'
    );

    // Move this letter out of Pending directly (approve/decline isn't
    // built) so the "already reviewed" guard can be tested honestly, not
    // just asserted against a state the API has no way to reach yet.
    await withDb((conn) => conn.query("UPDATE excuse_letters SET status = 'Approved' WHERE id = ?", [letterId]));

    const editReviewed = await request('PUT', `/api/excuse-letters/${letterId}`, {
      token: parentToken,
      body: { reason: 'Too late' },
    });
    assert(
      editReviewed.status === 403 &&
        /already been reviewed/i.test(editReviewed.data?.message || ''),
      'PUT on a non-Pending letter returns 403 naming the reason'
    );

    const teacherCannotEdit = await request('PUT', `/api/excuse-letters/${spoofedFields.data.excuse_letter.id}`, {
      token: teacherToken,
      body: { reason: 'Teacher trying to edit' },
    });
    assert(teacherCannotEdit.status === 403, 'Teacher cannot use the parent-only edit endpoint');

    const unauthPut = await request('PUT', `/api/excuse-letters/${spoofedFields.data.excuse_letter.id}`, {
      body: { reason: 'No token' },
    });
    assert(unauthPut.status === 401, 'Unauthenticated PUT returns 401');

    // --- Review (PATCH /:id/review) ---
    console.log('\nReview:');

    // Fixture: a teacher assigned to Marwin's section (Malikhain) via
    // teacher_assignments — so they CAN read the letter (GET /:id -> 200)
    // — but who is NOT that section's adviser (TCH-001 is). This is the
    // one case read-scope and review-scope actually disagree on.
    const [subjectRows] = await withDb((conn) => conn.query('SELECT id FROM subjects WHERE grade_level = 6 LIMIT 1'));
    const grade6SubjectId = subjectRows[0]?.id;
    const reviewerLoginId = `TCH-REV-${runId}`;
    const createNonAdviserTeacher = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: reviewerLoginId, password: 'Teacher@2026', name: 'Non-Adviser Fixture Teacher' },
    });
    const nonAdviserTeacherId = createNonAdviserTeacher.data?.user?.id;
    if (nonAdviserTeacherId) await clearForcedChange(nonAdviserTeacherId);
    createdLoginIds.push(reviewerLoginId); // fk_assignments_teacher ON DELETE CASCADE removes the assignment row too
    await withDb((conn) =>
      conn.query(
        'INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section) VALUES (?, ?, 6, ?)',
        [nonAdviserTeacherId, grade6SubjectId, 'Malikhain']
      )
    );
    const nonAdviserTeacherLogin = await login(reviewerLoginId, 'Teacher@2026');
    const nonAdviserTeacherToken = nonAdviserTeacherLogin.data?.token;
    assert(
      createNonAdviserTeacher.status === 201 && nonAdviserTeacherLogin.status === 200,
      'Fixture: a non-adviser teacher assigned to Malikhain (can read, cannot review)'
    );

    async function submitFor(reason) {
      const res = await request('POST', '/api/excuse-letters', {
        token: parentToken,
        body: { absence_date: daysAgo(1), reason },
      });
      if (res.data?.excuse_letter?.id) createdExcuseLetterIds.push(res.data.excuse_letter.id);
      return res.data?.excuse_letter?.id;
    }

    const letterForApproval = await submitFor('Review: approval');
    const letterForDeclineRemarks = await submitFor('Review: decline with remarks');
    const letterForDeclineNoRemarks = await submitFor('Review: decline without remarks');
    const letterForNonAdviserAttempt = await submitFor('Review: non-adviser attempt');

    const badReviewId = await request('PATCH', '/api/excuse-letters/abc/review', {
      token: teacherToken,
      body: { status: 'Approved' },
    });
    assert(badReviewId.status === 400, 'PATCH /api/excuse-letters/abc/review returns 400, not 500');

    const pendingAsStatus = await request('PATCH', `/api/excuse-letters/${letterForApproval}/review`, {
      token: teacherToken,
      body: { status: 'Pending' },
    });
    assert(pendingAsStatus.status === 400, "status: 'Pending' in the body is rejected");

    const invalidStatus = await request('PATCH', `/api/excuse-letters/${letterForApproval}/review`, {
      token: teacherToken,
      body: { status: 'Whatever' },
    });
    assert(invalidStatus.status === 400, 'Invalid status string is rejected');

    const nonAdviserAttempt = await request('PATCH', `/api/excuse-letters/${letterForNonAdviserAttempt}/review`, {
      token: nonAdviserTeacherToken,
      body: { status: 'Approved' },
    });
    assert(
      nonAdviserAttempt.status === 403 &&
        /adviser of this student's section/i.test(nonAdviserAttempt.data?.message || ''),
      'A teacher who can read the letter but is not the adviser gets 403 naming the reason (not 404)'
    );

    const parentAttemptsReview = await request('PATCH', `/api/excuse-letters/${letterForNonAdviserAttempt}/review`, {
      token: parentToken,
      body: { status: 'Approved' },
    });
    assert(parentAttemptsReview.status === 403, 'Parent cannot use the review endpoint');

    // --- Adviser-only teacher: sees, and can review, their own section ---
    // The point of the 2026-09-06 widening. Read scope in this file is now
    // teacher_assignments OR sections.adviser_id; review authority is still
    // adviser-only and did not move. Before the widening TCH-002 got 404 on
    // every one of these — it was locked out of the queue it alone may act on.
    console.log('\nAdviser-only teacher (TCH-002, Grade 5 - Masigasig):');

    // Jea Mae (seeded, Grade 5 - Masigasig) is in TCH-002's advisory section
    // and in NO teacher's assignment rows. Her seeded parent account (1234567)
    // is deliberately left at status 'pending' — test:auth depends on that row
    // being pending, and a crashed run corrupted it once before — so the letter
    // is inserted directly rather than submitted through the parent API.
    const jeaRow = await withDb((conn) =>
      conn.query("SELECT id FROM students WHERE lrn = '1234567' LIMIT 1")
    );
    const jeaStudentId = jeaRow?.[0]?.[0]?.id;
    const jeaParentRow = await withDb((conn) =>
      conn.query("SELECT id FROM users WHERE login_id = '1234567' LIMIT 1")
    );
    const jeaParentId = jeaParentRow?.[0]?.[0]?.id;

    const insertedJeaLetter = await withDb((conn) =>
      conn.query(
        `INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason, status)
         VALUES (?, ?, ?, 'Adviser-scope fixture', 'Pending')`,
        [jeaStudentId, jeaParentId, daysAgo(3)]
      )
    );
    const jeaLetterId = insertedJeaLetter?.[0]?.insertId;
    if (jeaLetterId) createdExcuseLetterIds.push(jeaLetterId);
    assert(Number.isInteger(jeaLetterId), 'Fixture: letter for the adviser-only section (Grade 5 - Masigasig)');

    const adviserList = await request('GET', '/api/excuse-letters', { token: adviserToken });
    const adviserListIds = (adviserList.data?.excuse_letters || []).map((l) => l.id);
    assert(adviserList.status === 200, 'Adviser-only teacher can list excuse letters');
    assert(
      adviserListIds.includes(jeaLetterId),
      'Adviser-only teacher list INCLUDES a letter from their advisory section'
    );
    // The other half: widening must not become "sees everything".
    assert(
      !adviserListIds.includes(outsideLetterId),
      'Adviser-only teacher list still EXCLUDES a letter they neither teach nor advise'
    );

    const adviserReadsOwn = await request('GET', `/api/excuse-letters/${jeaLetterId}`, { token: adviserToken });
    assert(adviserReadsOwn.status === 200, 'Adviser-only teacher reads a letter from their advisory section');

    const adviserReadsOutside = await request('GET', `/api/excuse-letters/${outsideLetterId}`, {
      token: adviserToken,
    });
    assert(adviserReadsOutside.status === 404, 'Adviser-only teacher reading an out-of-scope letter returns 404');

    // Attendance is record-only across ANY approval, whoever approves —
    // "excuse lang yung bata pero absent pa rin" (the school's own words).
    const attendanceBeforeAdviser = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM attendance WHERE student_id = ?', [jeaStudentId])
    );

    const adviserReviews = await request('PATCH', `/api/excuse-letters/${jeaLetterId}/review`, {
      token: adviserToken,
      body: { status: 'Approved', teacher_remarks: 'Confirmed with the parent.' },
    });
    assert(
      adviserReviews.status === 200 && adviserReviews.data?.excuse_letter?.status === 'Approved',
      'Adviser-only teacher CAN review a letter from their advisory section (was 404 before the widening)'
    );
    assert(
      adviserReviews.data?.excuse_letter?.reviewed_by === adviserId,
      'reviewed_by records the adviser who actually reviewed it'
    );

    const attendanceAfterAdviser = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM attendance WHERE student_id = ?', [jeaStudentId])
    );
    assert(
      attendanceBeforeAdviser?.[0]?.[0]?.c === attendanceAfterAdviser?.[0]?.[0]?.c,
      'Approval by the adviser leaves the attendance table untouched'
    );

    const adviserReviewsOutside = await request('PATCH', `/api/excuse-letters/${outsideLetterId}/review`, {
      token: adviserToken,
      body: { status: 'Approved' },
    });
    assert(
      adviserReviewsOutside.status === 404,
      'Adviser-only teacher reviewing an out-of-scope letter returns 404 (outside read scope entirely)'
    );

    // Attendance must be completely untouched by an approval — the whole
    // point of this module. Snapshot before, compare after.
    const attendanceBefore = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM attendance WHERE student_id = ?', [marwinId])
    );
    const attendanceCountBefore = attendanceBefore[0][0].c;

    const adviserApproves = await request('PATCH', `/api/excuse-letters/${letterForApproval}/review`, {
      token: teacherToken,
      body: { status: 'Approved' },
    });
    assert(
      adviserApproves.status === 200 &&
        adviserApproves.data?.excuse_letter?.status === 'Approved' &&
        adviserApproves.data?.excuse_letter?.reviewed_by === teacherId,
      'Adviser approves a Pending letter — status Approved, reviewed_by set to the adviser'
    );

    const attendanceAfter = await withDb((conn) =>
      conn.query('SELECT COUNT(*) AS c FROM attendance WHERE student_id = ?', [marwinId])
    );
    assert(
      attendanceAfter[0][0].c === attendanceCountBefore,
      `Attendance row count for the student is unchanged by the approval (before ${attendanceCountBefore}, after ${attendanceAfter[0][0].c})`
    );

    const parentEditsAfterReview = await request('PUT', `/api/excuse-letters/${letterForApproval}`, {
      token: parentToken,
      body: { reason: 'Trying to edit after approval' },
    });
    assert(
      parentEditsAfterReview.status === 403 &&
        /already been reviewed/i.test(parentEditsAfterReview.data?.message || ''),
      'Parent PUT after a real PATCH-driven approval is still blocked — the interlock holds'
    );

    const reReview = await request('PATCH', `/api/excuse-letters/${letterForApproval}/review`, {
      token: teacherToken,
      body: { status: 'Declined' },
    });
    assert(
      reReview.status === 403 && /already been reviewed/i.test(reReview.data?.message || ''),
      'Reviewing an already-reviewed letter returns 403 naming the reason'
    );

    const adviserDeclinesWithRemarks = await request(
      'PATCH',
      `/api/excuse-letters/${letterForDeclineRemarks}/review`,
      {
        token: teacherToken,
        body: { status: 'Declined', teacher_remarks: 'No supporting document attached.' },
      }
    );
    assert(
      adviserDeclinesWithRemarks.status === 200 &&
        adviserDeclinesWithRemarks.data?.excuse_letter?.status === 'Declined' &&
        adviserDeclinesWithRemarks.data?.excuse_letter?.teacher_remarks === 'No supporting document attached.',
      'Adviser declines with remarks — remarks stored'
    );

    const adviserDeclinesNoRemarks = await request(
      'PATCH',
      `/api/excuse-letters/${letterForDeclineNoRemarks}/review`,
      {
        token: teacherToken,
        body: { status: 'Declined' },
      }
    );
    assert(
      adviserDeclinesNoRemarks.status === 200 &&
        adviserDeclinesNoRemarks.data?.excuse_letter?.status === 'Declined' &&
        adviserDeclinesNoRemarks.data?.excuse_letter?.teacher_remarks === null,
      'Adviser declines without remarks — teacher_remarks stays null, not required'
    );

    // The earlier non-adviser 403 attempt left this letter untouched
    // (still Pending) — confirm the real adviser can still act on it.
    const adviserApprovesAfterFailedAttempt = await request(
      'PATCH',
      `/api/excuse-letters/${letterForNonAdviserAttempt}/review`,
      { token: teacherToken, body: { status: 'Approved' } }
    );
    assert(
      adviserApprovesAfterFailedAttempt.status === 200 &&
        adviserApprovesAfterFailedAttempt.data?.excuse_letter?.status === 'Approved',
      "A prior unauthorized 403 attempt did not change the letter's state — the real adviser can still review it"
    );

    // outsideLetterId's student has section_id NULL (VARCHAR 'Aguinaldo'
    // never matched a real seeded section) and no teacher is assigned to
    // it at all in this suite — no teacher could reach it even to read it
    // (see teacherReadsOutOfScope, above). Admin is unscoped regardless.
    const adminReviewsAny = await request('PATCH', `/api/excuse-letters/${outsideLetterId}/review`, {
      token: adminToken,
      body: { status: 'Approved', teacher_remarks: 'Reviewed by admin — no teacher has read access to this one.' },
    });
    assert(
      adminReviewsAny.status === 200 && adminReviewsAny.data?.excuse_letter?.status === 'Approved',
      'Admin reviews any letter, including one no teacher could even read'
    );

    const unauthReview = await request('PATCH', `/api/excuse-letters/${letterForDeclineRemarks}/review`, {
      body: { status: 'Approved' },
    });
    assert(unauthReview.status === 401, 'Unauthenticated PATCH /:id/review returns 401');
    // --- Pagination contract (2026-09-19, utils/pagination.js): every list
    // carries page { limit, offset, total, has_more }; limit default 50, max
    // 200; sort against an allow-list. Invariants only — never an exact count
    // on a table the application also writes to.
    console.log('\nPagination:');
    const qs = (path, q) => `${path}${path.includes('?') ? '&' : '?'}${q}`;
    const ordered = (rows, field) =>
      rows.every((row, i) => {
        if (i === 0) return true;
        const a = rows[i - 1][field];
        const b = row[field];
        if (a === null || a === undefined || b === null || b === undefined) return true;
        return typeof a === 'number' && typeof b === 'number'
          ? a >= b
          : String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) >= 0;
      });
    async function checkPage(path, token, key, { sort, field, idField = 'id' }) {
      const first = await request('GET', path, { token });
      const rows = first.data?.[key] || [];
      const page = first.data?.page;
      assert(
        first.status === 200 && page && page.limit === 50 && page.offset === 0 && Number.isInteger(page.total),
        `${path}: page { limit 50, offset 0, total } by default`
      );
      assert(
        rows.length <= 50 && page?.has_more === (page?.total > 50) && (page?.has_more || rows.length === page?.total),
        `${path}: rows <= limit, has_more = total > limit, a last page holds the rest`
      );
      const one = await request('GET', qs(path, 'limit=1'), { token });
      assert(
        one.status === 200 &&
          (one.data?.[key] || []).length === Math.min(1, page?.total ?? 0) &&
          one.data?.page?.has_more === (page?.total > 1),
        `${path}: limit=1 returns one row and has_more when more exist`
      );
      if ((page?.total ?? 0) >= 2) {
        const second = await request('GET', qs(path, 'limit=1&offset=1'), { token });
        assert(
          second.status === 200 && second.data?.[key]?.[0]?.[idField] !== one.data?.[key]?.[0]?.[idField],
          `${path}: offset=1 returns a different row than offset=0`
        );
      }
      const bad = await Promise.all(
        ['limit=0', 'limit=201', 'offset=-1', 'sort=nope', `sort=${sort}&order=sideways`, 'order=desc'].map((q) =>
          request('GET', qs(path, q), { token })
        )
      );
      assert(bad.every((r) => r.status === 400), `${path}: limit 0/201, offset -1, unknown sort, bad order, order without sort are 400`);
      assert(new RegExp(`sort must be one of: .*\\b${sort}\\b`).test(bad[3].data?.message || ''), `${path}: the sort 400 names the allowed keys`);
      const sorted = await request('GET', qs(path, `sort=${sort}&order=desc`), { token });
      assert(sorted.status === 200 && ordered(sorted.data?.[key] || [], field), `${path}: sort=${sort}&order=desc is ordered on the page`);
    }

    await checkPage('/api/excuse-letters', adminToken, 'excuse_letters', { sort: 'absence_date', field: 'absence_date' });
    await checkPage('/api/excuse-letters', teacherToken, 'excuse_letters', { sort: 'student', field: 'last_name' });
    await checkPage('/api/excuse-letters/mine', parentToken, 'excuse_letters', { sort: 'absence_date', field: 'absence_date' });

    // C4: a filter narrows total to the filtered set.
    const pendingPage = await request('GET', '/api/excuse-letters?status=Pending&limit=200', { token: adminToken });
    assert(
      pendingPage.status === 200 &&
        (pendingPage.data?.excuse_letters || []).every((l) => l.status === 'Pending') &&
        (pendingPage.data?.page?.has_more || pendingPage.data?.page?.total === pendingPage.data?.excuse_letters?.length),
      'GET /excuse-letters?status=Pending: every row matches and total is the filtered count'
    );
  } finally {
    await policy.cleanup();
    await cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
