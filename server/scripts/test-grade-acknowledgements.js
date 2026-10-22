/**
 * Grade acknowledgement tests (feat/grade-acknowledgement, 2026-10-21; the
 * owner's Q1–Q12).
 * Prerequisite: npm start (or npm run dev)
 *
 * POST /api/grades/acknowledgements — parent only: "I have seen these grades",
 * once per (learner, school year, term), only while the term is FULLY locked
 * (every subject of the learner's grade level locked with a value — the bulk
 * lock's own test). The owner's rules:
 *   - a lock that completes a learner's term asks the parent to confirm —
 *     grades_locked, bell only (Q4); a confirmation tells the ADVISER —
 *     grades_acknowledged, bell only (Q5); nothing for the admin
 *   - an unlock of any row of the term deletes the confirmation and both
 *     notifications (Q2); a relock asks again
 *   - a term that is not fully locked is 409; a repeat is 200 "Already
 *     confirmed on <date>. Nothing changed."; teacher and admin are 403
 *   - the report card carries `acknowledgements` (every term), the class
 *     summary `term_locked` and `acknowledged` per learner, the bulk unlock
 *     `acknowledgements_cleared`
 *   - the parent's grades_locked row SELF-HEALS once the confirmation exists
 *   - never an LRN in any response
 *
 * IT WRITES TO A THROWAWAY CLASS: a Grade 4 section that has no learners at
 * the start (the run stops if there is none), one learner of its own, its own
 * teacher made the section's adviser for the run, and that teacher creates
 * the learner's parent account, which the admin approves. Grade rows are
 * inserted directly. Everything it creates is deleted in the `finally` by id,
 * the section's adviser put back to what it was, and `policy.cleanup()` runs
 * last.
 *
 * SIGN-INS ARE READ AT RUN TIME AND NEVER PRINTED: the admin's from
 * proof-backup-loop.js line 172, as test:privacy does; the teacher's and the
 * parent's passwords are made at run time for the accounts this run creates.
 *
 * Usage: node scripts/test-grade-acknowledgements.js   (no npm alias yet —
 * server/package.json is outside this branch's whitelist)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { pairsFor, deleteNotificationsFor, countNotificationsFor } = require('./test-helpers/notifications');
const { createPolicyFixture, clearForcedChange } = require('./policyFixture');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const TERM = 2;
const GRADE = 4;
const LAST = 'Ackcheck';
const FIRST = 'Ima';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'parents_portal',
};

// Every sign-in accepts the privacy notice and terms first; this run's rows
// go in the finally (scripts/policyFixture.js).
const policy = createPolicyFixture();

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function requireFixture(condition, label, detail = '') {
  if (condition) {
    console.log(`  OK    ${label}`);
    return;
  }
  console.error(`  STOP  fixture: ${label}${detail ? ` — ${detail}` : ''}`);
  process.exit(1);
}

async function request(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
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
  return { status: res.status, data, text };
}

// The status and the server's message only — never a body that could carry
// a learner's details — and any long digit run masked, in case a message
// ever echoes an LRN.
function why(res) {
  return `status ${res.status}: ${String(res.data?.message || '(no message)').replace(/\d{6,}/g, '<digits>')}`;
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

// The admin sign-in, read where the dispatches keep it. Never printed.
function adminSignIn() {
  const line = fs.readFileSync(path.join(__dirname, 'proof-backup-loop.js'), 'utf8').split(/\r?\n/)[171];
  const m = /login_id:\s*'([^']+)',\s*password:\s*'([^']+)'/.exec(line || '');
  if (!m) throw new Error('could not read the admin sign-in from proof-backup-loop.js line 172');
  return { loginId: m[1], password: m[2] };
}

function hasKeyDeep(value, key) {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === 'object') {
    return Object.keys(value).some((k) => k === key || hasKeyDeep(value[k], key));
  }
  return false;
}

// Twelve digits for the learner: one leading digit plus eleven from the
// clock, so two runs never collide. Never printed. The two passwords are made
// from the same clock and never printed either.
const stamp = String(Date.now());
const lrnSuffix = stamp.slice(-11).padStart(11, '0');
const runPassword = `Ack${stamp.slice(-8)}x`;

async function main() {
  console.log(`Grade acknowledgement tests against ${BASE}\n`);

  const createdStudentIds = [];
  const createdUserIds = [];
  // Creating a parent fans out parent_pending to every admin, keyed on the new
  // USER id (item_type user), and deleting the user leaves that row behind —
  // the same list test-auth-flows.js keeps for the same reason.
  const createdParentUserIds = [];
  const fixtureLrns = [];
  let classSection = null;
  let sectionId = null;
  let adviserBefore = null;
  let adviserChanged = false;
  let gradeIds = [];

  const leaksLrn = (res) => hasKeyDeep(res.data, 'lrn') || fixtureLrns.some((l) => res.text.includes(l));

  async function cleanup() {
    // The confirmations and the notifications for this run's grades first
    // (no FK on notifications.item_id), and the admins' parent_pending row for
    // this run's parent, then the grades, the learner, the two
    // accounts, and the section's adviser back to what it was.
    if (gradeIds.length) {
      await withDb((conn) => deleteNotificationsFor(conn, pairsFor('grade', gradeIds)));
    }
    if (createdParentUserIds.length) {
      await withDb((conn) => deleteNotificationsFor(conn, pairsFor('user', createdParentUserIds)));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM grade_acknowledgements WHERE student_id IN (?)', [createdStudentIds]));
      await withDb((conn) => conn.query('DELETE FROM grades WHERE student_id IN (?)', [createdStudentIds]));
    }
    if (createdUserIds.length) {
      await withDb((conn) => conn.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]));
    }
    if (adviserChanged && sectionId) {
      await withDb((conn) => conn.query('UPDATE sections SET adviser_id = ? WHERE id = ?', [adviserBefore, sectionId]));
    }
    if (createdStudentIds.length) {
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
    if (createdUserIds.length) {
      await withDb((conn) => conn.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]));
    }
    const leftover = gradeIds.length
      ? await withDb((conn) => countNotificationsFor(conn, pairsFor('grade', gradeIds)))
      : 0;
    assert(leftover === 0, 'no notification row for the fixture grades is left', `left ${leftover}`);
    console.log(`  cleaned up: ${createdStudentIds.length} learner(s), ${gradeIds.length} grade(s), ${createdUserIds.length} account(s)`);
  }

  try {
    const health = await request('GET', '/api/health');
    requireFixture(health.status === 200, 'the API answers /api/health');

    const admin = adminSignIn();
    const adminLogin = await login(admin.loginId, admin.password);
    requireFixture(adminLogin.status === 200, 'admin signs in', why(adminLogin));
    const adminToken = adminLogin.data.token;
    await policy.accept(adminToken);

    const [[yearRow]] = await withDb((conn) =>
      conn.query("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1")
    );
    const SCHOOL_YEAR = yearRow?.v;
    requireFixture(Boolean(SCHOOL_YEAR), 'academic_year is set');

    // THE THROWAWAY CLASS: a Grade 4 section with no learners at all.
    const sectionsRes = await request('GET', `/api/sections?grade_level=${GRADE}`, { token: adminToken });
    requireFixture(sectionsRes.status === 200, 'the Grade 4 sections load', why(sectionsRes));
    for (const s of sectionsRes.data.sections) {
      if (Number(s.student_count) !== 0) continue;
      const [[n]] = await withDb((conn) =>
        conn.query('SELECT COUNT(*) AS n FROM students WHERE grade_level = ? AND section = ?', [GRADE, s.name])
      );
      if (Number(n.n) === 0) {
        classSection = s.name;
        sectionId = s.id;
        adviserBefore = s.adviser_id ?? null;
        break;
      }
    }
    requireFixture(Boolean(classSection), 'a Grade 4 section with no learners exists for the throwaway class');

    const subjectsRes = await request('GET', `/api/subjects?grade_level=${GRADE}&limit=200`, { token: adminToken });
    requireFixture(subjectsRes.status === 200 && subjectsRes.data.subjects.length >= 2, 'Grade 4 has at least two subjects', why(subjectsRes));
    const subjects = subjectsRes.data.subjects;
    const S = subjects.length;

    // THE ADVISER: a throwaway teacher, made the section's adviser for the run.
    const teacherLoginId = `ACK-T${stamp.slice(-8)}`;
    const teacherRes = await request('POST', '/api/users/teachers', {
      token: adminToken,
      body: { login_id: teacherLoginId, password: runPassword, name: 'Ack Adviser' },
    });
    requireFixture(teacherRes.status === 201, 'the throwaway teacher is created', why(teacherRes));
    const teacherId = teacherRes.data.user.id;
    createdUserIds.push(teacherId);
    await clearForcedChange(teacherId);
    const adviserRes = await request('PATCH', `/api/sections/${sectionId}/adviser`, { token: adminToken, body: { adviser_id: teacherId } });
    requireFixture(adviserRes.status === 200, 'the throwaway teacher advises the throwaway class', why(adviserRes));
    adviserChanged = true;
    const teacherLogin = await login(teacherLoginId, runPassword);
    requireFixture(teacherLogin.status === 200, 'the adviser signs in', why(teacherLogin));
    const teacherToken = teacherLogin.data.token;
    await policy.accept(teacherToken);

    // THE LEARNER, enrolled by the admin; THE PARENT, created by the adviser
    // (LOCKED DECISIONS) and approved by the admin.
    const lrn = `4${lrnSuffix}`;
    fixtureLrns.push(lrn);
    const studentRes = await request('POST', '/api/students', {
      token: adminToken,
      body: { lrn, first_name: FIRST, last_name: LAST, grade_level: GRADE, section: classSection },
    });
    requireFixture(studentRes.status === 201, 'the learner is enrolled', why(studentRes));
    const studentId = studentRes.data.student.id;
    createdStudentIds.push(studentId);

    const parentRes = await request('POST', '/api/users/parents', {
      token: teacherToken,
      body: { lrn, password: runPassword, name: 'Ack Parent' },
    });
    requireFixture(parentRes.status === 201, 'the adviser creates the parent account', why(parentRes));
    const parentId = parentRes.data.user.id;
    createdUserIds.push(parentId);
    createdParentUserIds.push(parentId);
    const approveRes = await request('PUT', `/api/users/parents/${parentId}/approve`, { token: adminToken });
    requireFixture(approveRes.status === 200, 'the admin approves it', why(approveRes));
    await clearForcedChange(parentId);
    const parentLogin = await login(lrn, runPassword);
    requireFixture(parentLogin.status === 200, 'the parent signs in', why(parentLogin));
    const parentToken = parentLogin.data.token;
    await policy.accept(parentToken);

    // A grade in every Grade 4 subject for Term 2, inserted directly — no
    // recompute, so no grade_available row either.
    const rows = subjects.map((s) => [studentId, s.id, TERM, SCHOOL_YEAR, 85]);
    await withDb((conn) =>
      conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES ?', [rows])
    );
    const [gradeRows] = await withDb((conn) =>
      conn.query('SELECT id FROM grades WHERE student_id = ? AND term = ? ORDER BY id', [studentId, TERM])
    );
    gradeIds = gradeRows.map((r) => r.id);
    const itemId = Math.min(...gradeIds);

    const sectionBody = (extra) => ({ term: TERM, grade_level: GRADE, section: classSection, ...extra });
    const ackRows = async () =>
      (await withDb((conn) =>
        conn.query('SELECT id, user_id, acknowledged_at FROM grade_acknowledgements WHERE student_id = ? AND school_year = ? AND term = ?', [
          studentId,
          SCHOOL_YEAR,
          TERM,
        ])
      ))[0];
    const typedRows = async (type) =>
      Number(
        (await withDb((conn) =>
          conn.query("SELECT COUNT(*) AS n FROM notifications WHERE type = ? AND item_type = 'grade' AND item_id = ?", [type, itemId])
        ))[0][0].n
      );
    const auditCount = async (action, userId) => {
      const [[r]] = await withDb((conn) =>
        conn.query('SELECT COUNT(*) AS n FROM activity_logs WHERE action = ? AND user_id = ?', [action, userId])
      );
      return Number(r.n);
    };
    const counts = async (token) => (await request('GET', '/api/notifications/unread-counts', { token })).data.counts;
    const listed = async (token, type) =>
      ((await request('GET', '/api/notifications?limit=200', { token })).data.notifications || []).filter(
        (n) => n.type === type && n.item_id === itemId
      );
    const confirm = (token, body) => request('POST', '/api/grades/acknowledgements', { token, body });

    // -----------------------------------------------------------------
    console.log('\n--- before any lock: nothing to confirm, and who may not ---');
    // -----------------------------------------------------------------
    const anon = await confirm(undefined, { term: TERM });
    assert(anon.status === 401, `no token is 401 (got ${anon.status})`);
    const asTeacher = await confirm(teacherToken, { term: TERM });
    assert(asTeacher.status === 403 && asTeacher.data?.code !== 'POLICY_ACCEPTANCE_REQUIRED', `the adviser is 403 — the role refusal (got ${asTeacher.status})`);
    const asAdmin = await confirm(adminToken, { term: TERM });
    assert(asAdmin.status === 403 && asAdmin.data?.code !== 'POLICY_ACCEPTANCE_REQUIRED', `the admin is 403 (got ${asAdmin.status})`);
    for (const [body, message, label] of [
      [{}, 'term must be 1, 2, or 3.', 'no term'],
      [{ term: 4 }, 'term must be 1, 2, or 3.', 'term 4'],
      [{ term: TERM, school_year: '2026-2028' }, 'school_year must match YYYY-YYYY with consecutive years (e.g. 2026-2027).', 'a bad school year'],
    ]) {
      const res = await confirm(parentToken, body);
      assert(res.status === 400 && res.data?.message === message, `400: ${label}`, why(res));
    }
    const early = await confirm(parentToken, { term: TERM });
    assert(
      early.status === 409 && early.data?.message === `Term ${TERM} is not locked yet — there is nothing to confirm.`,
      'an unlocked term is 409 naming the term',
      why(early)
    );
    assert((await ackRows()).length === 0, 'nothing was written');

    const card0 = await request('GET', `/api/grades/student/${studentId}`, { token: parentToken });
    assert(
      card0.status === 200 &&
        card0.data.acknowledgements &&
        ['1', '2', '3'].every((t) => Object.hasOwn(card0.data.acknowledgements, t)) &&
        card0.data.acknowledgements[TERM].locked === false &&
        card0.data.acknowledgements[TERM].acknowledged_at === null &&
        card0.data.acknowledgements[TERM].by_name === null,
      'the report card carries all three terms, this one unlocked and unconfirmed',
      why(card0)
    );
    assert(!leaksLrn(card0), 'no LRN on the report card');

    // -----------------------------------------------------------------
    console.log('\n--- the bulk lock completes the term: the parent is asked ---');
    // -----------------------------------------------------------------
    const parentBefore = await counts(parentToken);
    const lock = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: true }) });
    assert(
      lock.status === 200 && lock.data.records_changed === S && lock.data.learners_changed === 1 && lock.data.acknowledgements_cleared === 0,
      `the lock locks ${S} records for one learner and clears no confirmation`,
      why(lock)
    );
    assert((await typedRows('grades_locked')) === 1, "one grades_locked row for the learner's parent, keyed on the term's lowest grade id");
    const lockedListed = await listed(parentToken, 'grades_locked');
    assert(
      lockedListed.length === 1 &&
        lockedListed[0].title === `Term ${TERM} grades are final` &&
        lockedListed[0].body === `Please confirm you have seen your child's Term ${TERM} grades.` &&
        lockedListed[0].link === '/parent/grades' &&
        lockedListed[0].read_at === null,
      'the parent sees it: the title, the ask, the link to Grades',
      JSON.stringify(lockedListed.map((n) => n.title))
    );
    const parentAsked = await counts(parentToken);
    assert(
      parentAsked.total === parentBefore.total + 1 && parentAsked.grades === parentBefore.grades + 1,
      'the bell counts it under grades (never badged)'
    );
    const adminCounts = await counts(adminToken);
    assert((await listed(adminToken, 'grades_locked')).length === 0 && typeof adminCounts.total === 'number', 'the admin is told nothing');
    const teacherSeesLock = await listed(teacherToken, 'grades_locked');
    assert(teacherSeesLock.length === 0, 'the adviser is not asked to confirm');

    // A VISIT'S SECTION CLEAR never touches the ask (fix/f3-badges): no grade
    // type is in any section — Grades is never badged, and the ask is a call
    // to act that clears only on the confirmation.
    for (const section of ['announcements', 'memos', 'events', 'excuse_letters']) {
      await request('PATCH', '/api/notifications/read-all', { token: parentToken, body: { section } });
    }
    const askKept = await listed(parentToken, 'grades_locked');
    assert(askKept.length === 1 && askKept[0].read_at === null, "no section clear marks the parent's grades_locked ask read");

    const card1 = await request('GET', `/api/grades/student/${studentId}`, { token: parentToken });
    assert(
      card1.data.acknowledgements[TERM].locked === true && card1.data.acknowledgements[TERM].acknowledged_at === null,
      'the report card says the term is locked and not yet confirmed'
    );
    const summary1 = await request('GET', `/api/grades/class-summary?grade_level=${GRADE}&section=${encodeURIComponent(classSection)}&term=${TERM}`, {
      token: teacherToken,
    });
    const row1 = summary1.data?.learners?.find((l) => l.student_id === studentId);
    assert(
      summary1.status === 200 && row1 && row1.term_locked === true && row1.acknowledged === null,
      "the adviser's summary row: term_locked true, acknowledged null",
      why(summary1)
    );
    assert(!leaksLrn(summary1), 'no LRN on the summary');
    const finalSheet = await request('GET', `/api/grades/class-summary?grade_level=${GRADE}&section=${encodeURIComponent(classSection)}&term=final`, {
      token: teacherToken,
    });
    const rowF = finalSheet.data?.learners?.find((l) => l.student_id === studentId);
    assert(finalSheet.status === 200 && rowF && rowF.term_locked === null && rowF.acknowledged === null, 'the Final sheet carries null for both');

    // -----------------------------------------------------------------
    console.log('\n--- the parent confirms ---');
    // -----------------------------------------------------------------
    const auditBefore = await auditCount('acknowledge_grades', parentId);
    const teacherBefore = await counts(teacherToken);
    const ok = await confirm(parentToken, { term: TERM });
    assert(
      ok.status === 201 &&
        ok.data?.message === `Term ${TERM} grades confirmed.` &&
        ok.data.acknowledgement?.term === TERM &&
        ok.data.acknowledgement?.school_year === SCHOOL_YEAR &&
        Boolean(ok.data.acknowledgement?.acknowledged_at) &&
        ok.data.acknowledgement?.by_name === 'Ack Parent',
      'the first confirmation is 201 with the row',
      why(ok)
    );
    assert(!leaksLrn(ok), 'no LRN in the reply');
    const rowsAfter = await ackRows();
    assert(rowsAfter.length === 1 && rowsAfter[0].user_id === parentId, 'one grade_acknowledgements row, by the parent');
    assert((await auditCount('acknowledge_grades', parentId)) === auditBefore + 1, 'one acknowledge_grades activity row on the parent');

    assert((await typedRows('grades_acknowledged')) === 1, "one grades_acknowledged row for the adviser");
    const ackListed = await listed(teacherToken, 'grades_acknowledged');
    assert(
      ackListed.length === 1 &&
        ackListed[0].title === 'Grades confirmed' &&
        ackListed[0].body === `${FIRST} ${LAST}'s parent has seen the Term ${TERM} grades.` &&
        ackListed[0].link === `/teacher/class-summary?term=${TERM}`,
      "the adviser sees it: the learner by name, the term, the link to the class summary",
      JSON.stringify(ackListed.map((n) => n.body))
    );
    const teacherAfter = await counts(teacherToken);
    assert(teacherAfter.total === teacherBefore.total + 1 && teacherAfter.grades === teacherBefore.grades + 1, "the adviser's bell counts it under grades");
    assert((await listed(adminToken, 'grades_acknowledged')).length === 0, 'the admin is told nothing (Q5)');

    // Nor the adviser's confirmed row (fix/f3-badges): bell-only (§33).
    for (const section of ['announcements', 'memos', 'events', 'excuse_letters']) {
      await request('PATCH', '/api/notifications/read-all', { token: teacherToken, body: { section } });
    }
    const confirmedKept = await listed(teacherToken, 'grades_acknowledged');
    assert(confirmedKept.length === 1 && confirmedKept[0].read_at === null, "no section clear marks the adviser's grades_acknowledged row read");

    // The parent's ask self-heals: the row stays, unread, and stops counting.
    const parentAfter = await counts(parentToken);
    assert(parentAfter.grades === parentBefore.grades && parentAfter.total === parentBefore.total, "the parent's grades_locked row stops counting once confirmed");
    assert((await listed(parentToken, 'grades_locked')).length === 0, 'and is no longer listed');
    const [[kept]] = await withDb((conn) =>
      conn.query("SELECT read_at FROM notifications WHERE type = 'grades_locked' AND item_type = 'grade' AND item_id = ? AND user_id = ?", [itemId, parentId])
    );
    assert(kept && kept.read_at === null, 'the row still exists and was not marked read');

    const card2 = await request('GET', `/api/grades/student/${studentId}`, { token: parentToken });
    assert(
      card2.data.acknowledgements[TERM].locked === true &&
        Boolean(card2.data.acknowledgements[TERM].acknowledged_at) &&
        card2.data.acknowledgements[TERM].by_name === 'Ack Parent',
      'the report card carries the confirmation and the name'
    );
    const cardAsTeacher = await request('GET', `/api/grades/student/${studentId}`, { token: teacherToken });
    assert(cardAsTeacher.status === 200 && Boolean(cardAsTeacher.data.acknowledgements?.[TERM]?.acknowledged_at), "the adviser's drill-through carries it too");
    const summary2 = await request('GET', `/api/grades/class-summary?grade_level=${GRADE}&section=${encodeURIComponent(classSection)}&term=${TERM}`, {
      token: teacherToken,
    });
    const row2 = summary2.data?.learners?.find((l) => l.student_id === studentId);
    assert(row2 && row2.term_locked === true && Boolean(row2.acknowledged?.acknowledged_at) && row2.acknowledged.by_name === 'Ack Parent', "the summary row carries the confirmation");

    const repeat = await confirm(parentToken, { term: TERM });
    assert(
      repeat.status === 200 && /^Already confirmed on .+\. Nothing changed\.$/.test(String(repeat.data?.message)) && Boolean(repeat.data?.acknowledgement?.acknowledged_at),
      'a repeat is 200 "Already confirmed on <date>. Nothing changed."',
      why(repeat)
    );
    assert((await ackRows()).length === 1 && (await auditCount('acknowledge_grades', parentId)) === auditBefore + 1, 'a repeat writes nothing');
    const otherTerm = await confirm(parentToken, { term: 1 });
    assert(otherTerm.status === 409, 'another, unlocked term is still 409', why(otherTerm));

    // -----------------------------------------------------------------
    console.log('\n--- the bulk unlock clears it; a relock asks again ---');
    // -----------------------------------------------------------------
    const clearedBefore = await auditCount('grade_acknowledgement_cleared', adminLogin.data.user.id);
    const unlockDry = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: false, dry_run: true }) });
    assert(
      unlockDry.status === 200 && unlockDry.data.acknowledgements_cleared === 1 && unlockDry.data.records_changed === S,
      'the unlock preview counts the one confirmation it would clear',
      why(unlockDry)
    );
    assert((await ackRows()).length === 1, 'the preview cleared nothing');
    const unlock = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: false }) });
    assert(unlock.status === 200 && unlock.data.acknowledgements_cleared === 1 && unlock.data.records_changed === S, 'the unlock clears it and says so', why(unlock));
    assert((await ackRows()).length === 0, 'the grade_acknowledgements row is gone');
    assert((await typedRows('grades_locked')) === 0 && (await typedRows('grades_acknowledged')) === 0, 'both typed notifications are gone');
    assert((await auditCount('grade_acknowledgement_cleared', adminLogin.data.user.id)) === clearedBefore + 1, 'one grade_acknowledgement_cleared row on the admin');
    const card3 = await request('GET', `/api/grades/student/${studentId}`, { token: parentToken });
    assert(card3.data.acknowledgements[TERM].locked === false && card3.data.acknowledgements[TERM].acknowledged_at === null, 'the report card is back to unlocked and unconfirmed');

    const relock = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: true }) });
    assert(relock.status === 200 && relock.data.records_changed === S, 'the relock locks the term again', why(relock));
    assert((await typedRows('grades_locked')) === 1 && (await listed(parentToken, 'grades_locked')).length === 1, 'the parent is asked again — a new row, listed');
    const again = await confirm(parentToken, { term: TERM });
    assert(again.status === 201, 'and confirms again', why(again));
    assert((await typedRows('grades_acknowledged')) === 1, "the adviser's row is back");

    // -----------------------------------------------------------------
    console.log('\n--- the single lock: one row unlocked clears, relocked asks ---');
    // -----------------------------------------------------------------
    const oneRow = gradeIds[gradeIds.length - 1];
    const singleUnlock = await request('PATCH', `/api/grades/${oneRow}/lock`, { token: adminToken, body: { is_locked: false } });
    assert(singleUnlock.status === 200, 'one row is unlocked singly', why(singleUnlock));
    assert((await ackRows()).length === 0, 'the confirmation is cleared — the term is no longer final');
    assert((await typedRows('grades_locked')) === 0 && (await typedRows('grades_acknowledged')) === 0, 'both notifications are gone again');
    assert((await auditCount('grade_acknowledgement_cleared', adminLogin.data.user.id)) === clearedBefore + 2, 'logged on the admin');
    const card4 = await request('GET', `/api/grades/student/${studentId}`, { token: parentToken });
    assert(card4.data.acknowledgements[TERM].locked === false, 'the report card says the term is not fully locked');
    const parentNow = await counts(parentToken);

    const singleLock = await request('PATCH', `/api/grades/${oneRow}/lock`, { token: adminToken, body: { is_locked: true } });
    assert(singleLock.status === 200, 'the row is locked again singly', why(singleLock));
    assert((await typedRows('grades_locked')) === 1, 'the term is complete again, so the parent is asked');
    const parentAgain = await counts(parentToken);
    assert(parentAgain.grades === parentNow.grades + 1, "the parent's bell counts the new ask");
    const sameAgain = await request('PATCH', `/api/grades/${gradeIds[0]}/lock`, { token: adminToken, body: { is_locked: true } });
    assert(sameAgain.status === 200 && (await typedRows('grades_locked')) === 1, 'locking an already-locked row of the term asks no second time');

    const third = await confirm(parentToken, { term: TERM });
    assert(third.status === 201, 'the parent confirms a third time', why(third));

    // The adviser's visibility is live: once the teacher no longer advises
    // the section, the row is not listed (the read-time re-check).
    const adviserOff = await request('PATCH', `/api/sections/${sectionId}/adviser`, { token: adminToken, body: { adviser_id: adviserBefore } });
    requireFixture(adviserOff.status === 200, "the section's adviser is put back", why(adviserOff));
    adviserChanged = false;
    assert((await listed(teacherToken, 'grades_acknowledged')).length === 0, 'a teacher who no longer advises the section stops seeing the confirmation');
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Suite crashed:', err.message);
  process.exit(1);
});
