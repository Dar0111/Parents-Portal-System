/**
 * Notifications API tests — fan-out audiences, the read-time visibility
 * re-check, per-item read state, and the text rules.
 * Prerequisite: npm run db:migrate:notifications && npm start (or npm run dev)
 *
 * Idempotent: every row this script creates is tracked and deleted in a
 * finally block, so it passes on repeat runs with no db:setup.
 *
 * WHAT THIS SUITE MUST NEVER TOUCH, and does not:
 *   - Nino's five descriptive grade rows (ids 1-5). The descriptive test
 *     creates its OWN Grade 1 student and grade row and deletes both.
 *   - Jea's pending parent account (user 4). The parent_pending test creates
 *     its own pending parent, and asserts the admin queue CONTAINS its row
 *     rather than asserting a count — additional real rows must still pass.
 *
 * Uses requireFixture() (borrowed from test-grades-flows.js) rather than the
 * record-only assert() the other suites share: a fan-out test whose fixture
 * silently failed would report "nobody was notified" as a pass.
 *
 * Usage: npm run test:notifications
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

let passed = 0;
let failed = 0;

class FixtureFailure extends Error {}

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
  assert(condition, label, detail);
  if (!condition) throw new FixtureFailure(`${label}${detail ? ` — ${detail}` : ''}`);
}

function why(res) {
  return `got ${res.status}${res.data?.message ? `: ${res.data.message}` : ''}`;
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
  const res = await request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
  return res;
}

// Every list read in this suite goes through here so no assertion can
// accidentally be made against a single page.
async function notificationsOf(token) {
  const res = await request('GET', '/api/notifications?limit=200', { token });
  return res.status === 200 ? res.data.notifications : [];
}

async function countsOf(token) {
  const res = await request('GET', '/api/notifications/unread-counts', { token });
  return res.status === 200 ? res.data.counts : null;
}

// Excuse letters refuse a future absence_date, so the fixture date is
// computed rather than hard-coded — a literal would start failing the day
// it went past.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ABSENCE_DATE = daysAgo(3);

function has(rows, type, itemId) {
  return rows.some((r) => r.type === type && Number(r.item_id) === Number(itemId));
}

function find(rows, type, itemId) {
  return rows.find((r) => r.type === type && Number(r.item_id) === Number(itemId));
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'parents_portal',
};

// Notifications carry no FK on item_id (it is polymorphic), so deleting an
// item leaves its rows behind — invisible to every reader thanks to the
// read-time re-check, but still rows. Cleanup therefore removes them by the
// exact (item_type, item_id) pairs THIS RUN created. Never a blanket
// DELETE FROM notifications: that would throw away real rows belonging to
// anyone using the system. The rule was written here first; since
// pre-Stage-5 #3a the implementation is shared with every suite that fans
// out, in test-helpers/notifications.js, so there is one copy of it.
const { deleteNotificationsFor } = require('./test-helpers/notifications');

// SLOT FIXTURES (CR1, 2026-09-22). Every component write needs a slot_id
// now. This suite is not testing slots — it is testing the grade_available
// fan-out — so it makes one directly, keyed off the grade's own class so the
// API's same-class check passes. Auto-numbered per (grade, type), because
// one slot holds at most one score per learner and this suite writes two WW
// rows to the same grade.
const createdSlotIds = [];
const slotCounters = new Map();

async function makeSlot(gradeId, type, maxScore) {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await conn.query(
      `SELECT g.subject_id, g.term, g.school_year, s.grade_level, s.section
         FROM grades g JOIN students s ON s.id = g.student_id
        WHERE g.id = ? LIMIT 1`,
      [gradeId]
    );
    const g = rows[0];
    if (!g) throw new Error(`makeSlot: grade #${gradeId} not found`);

    const counterKey = `${gradeId}-${type}`;
    const slotNo = (slotCounters.get(counterKey) || 0) + 1;
    slotCounters.set(counterKey, slotNo);

    const [result] = await conn.query(
      `INSERT INTO assessment_slots
         (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE max_score = VALUES(max_score), id = LAST_INSERT_ID(id)`,
      [g.subject_id, g.grade_level, g.section, g.term, g.school_year, type, slotNo, maxScore]
    );
    createdSlotIds.push(result.insertId);
    return result.insertId;
  } finally {
    await conn.end();
  }
}

async function deleteSlots() {
  if (!createdSlotIds.length) return;
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(dbConfig);
  try {
    await conn.query('DELETE FROM assessment_slots WHERE id IN (?)', [createdSlotIds]);
  } finally {
    await conn.end();
  }
}

async function dbCount(table, where = '', params = []) {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM ${table} ${where}`, params);
    return Number(rows[0].c);
  } finally {
    await conn.end();
  }
}

async function main() {
  console.log(`\nNotifications API tests against ${BASE}\n`);

  const created = {
    announcements: [],
    memos: [],
    events: [],
    excuseLetters: [],
    users: [],
    students: [],
    grades: [],
    components: [],
  };
  // (item_type, item_id) pairs whose notification rows this run must remove.
  const notificationItems = [];

  let admin;
  let tch1;
  let tch3;
  let parentMarwin;
  let parentNino;

  try {
    // -----------------------------------------------------------------------
    console.log('Fixtures — logins');
    // -----------------------------------------------------------------------
    const adminRes = await login('ADMIN001', 'Admin@2026');
    requireFixture(adminRes.status === 200, 'admin logs in', why(adminRes));
    admin = { token: adminRes.data.token, ...adminRes.data.user };

    const t1 = await login('TCH-001', 'Teacher@2026');
    requireFixture(t1.status === 200, 'TCH-001 logs in (Grade 6 Malikhain adviser + subjects)', why(t1));
    tch1 = { token: t1.data.token, ...t1.data.user };

    const t3 = await login('TCH-003', 'Teacher@2026');
    requireFixture(t3.status === 200, 'TCH-003 logs in (Grade 1 Mabait adviser)', why(t3));
    tch3 = { token: t3.data.token, ...t3.data.user };

    const pm = await login('13567454', 'Parent@2026');
    requireFixture(pm.status === 200, "Marwin's parent account logs in (Grade 6 Malikhain)", why(pm));
    parentMarwin = { token: pm.data.token, ...pm.data.user };

    const pn = await login('1090001', 'Parent@2026');
    requireFixture(pn.status === 200, "Nino's parent account logs in (Grade 1 Mabait)", why(pn));
    parentNino = { token: pn.data.token, ...pn.data.user };

    // -----------------------------------------------------------------------
    console.log('\nSchool-wide announcement — audience and Amendment A1');
    // -----------------------------------------------------------------------
    const annRes = await request('POST', '/api/announcements', {
      token: admin.token,
      body: { title: 'NOTIF TEST school-wide', content: 'Everyone sees this.' },
    });
    requireFixture(annRes.status === 201, 'admin posts a school-wide announcement', why(annRes));
    const annId = annRes.data.announcement.id;
    created.announcements.push(annId);
    notificationItems.push(['announcement', annId]);

    assert(has(await notificationsOf(parentMarwin.token), 'announcement', annId), 'school-wide reaches a Grade 6 parent');
    assert(has(await notificationsOf(parentNino.token), 'announcement', annId), 'school-wide reaches a Grade 1 parent');
    assert(has(await notificationsOf(tch1.token), 'announcement', annId), 'school-wide reaches a teacher');
    assert(
      !has(await notificationsOf(admin.token), 'announcement', annId),
      'A1: the admin who POSTED it is NOT notified about their own announcement'
    );

    const annRow = find(await notificationsOf(parentMarwin.token), 'announcement', annId);
    assert(annRow?.title === 'New announcement', 'announcement title reads "New announcement"');
    assert(
      annRow?.body === `${admin.name} posted "NOTIF TEST school-wide".`,
      'announcement body names the poster and the live title',
      JSON.stringify(annRow?.body)
    );
    assert(annRow?.link === '/parent/announcements', 'announcement link points at the parent Announcements page');
    assert(annRow?.read_at === null, 'a new notification is unread');

    // -----------------------------------------------------------------------
    console.log('\nSection announcement — only the connected section and teachers');
    // -----------------------------------------------------------------------
    const secRes = await request('POST', '/api/announcements', {
      token: tch1.token,
      body: {
        title: 'NOTIF TEST Malikhain only',
        content: 'Grade 6 - Malikhain parents only.',
        target_grade: 6,
        target_section: 'Malikhain',
      },
    });
    requireFixture(secRes.status === 201, 'TCH-001 posts to Grade 6 - Malikhain', why(secRes));
    const secId = secRes.data.announcement.id;
    created.announcements.push(secId);
    notificationItems.push(['announcement', secId]);

    assert(has(await notificationsOf(parentMarwin.token), 'announcement', secId), 'the Grade 6 - Malikhain parent is notified');
    assert(
      !has(await notificationsOf(parentNino.token), 'announcement', secId),
      'a Grade 1 parent is NOT notified about a Grade 6 - Malikhain post'
    );
    assert(
      !has(await notificationsOf(tch3.token), 'announcement', secId),
      'a teacher with no connection to Grade 6 - Malikhain is NOT notified'
    );
    assert(has(await notificationsOf(admin.token), 'announcement', secId), 'admin sees every announcement (unscoped list)');
    assert(!has(await notificationsOf(tch1.token), 'announcement', secId), 'A1: the teacher who posted it is not notified');

    // -----------------------------------------------------------------------
    console.log('\nMemo — school-wide by schema, so school-wide here');
    // -----------------------------------------------------------------------
    const memoRes = await request('POST', '/api/memos', {
      token: admin.token,
      body: { title: 'NOTIF TEST memo', content: 'Every role sees every memo.' },
    });
    requireFixture(memoRes.status === 201, 'admin posts a memo', why(memoRes));
    const memoId = memoRes.data.memo.id;
    created.memos.push(memoId);
    notificationItems.push(['memo', memoId]);

    assert(has(await notificationsOf(parentNino.token), 'memo', memoId), 'a Grade 1 parent is notified about a memo');
    assert(has(await notificationsOf(tch3.token), 'memo', memoId), 'an unconnected teacher is notified about a memo');
    assert(!has(await notificationsOf(admin.token), 'memo', memoId), 'A1: the admin who posted the memo is not notified');

    // -----------------------------------------------------------------------
    console.log('\nEvent — targeted by grade, and NOT sent to admin (no page)');
    // -----------------------------------------------------------------------
    const evRes = await request('POST', '/api/events', {
      token: tch1.token,
      body: { title: 'NOTIF TEST event', event_date: '2026-12-01', target_grade: 6 },
    });
    requireFixture(evRes.status === 201, 'TCH-001 posts a Grade 6 event', why(evRes));
    const evId = evRes.data.event.id;
    created.events.push(evId);
    notificationItems.push(['event', evId]);

    assert(has(await notificationsOf(parentMarwin.token), 'event', evId), 'the Grade 6 parent is notified about a Grade 6 event');
    assert(!has(await notificationsOf(parentNino.token), 'event', evId), 'a Grade 1 parent is not notified about a Grade 6 event');
    assert(
      !has(await notificationsOf(admin.token), 'event', evId),
      'admin is NOT notified about events — admin has no Events page (nav trimmed 2026-09-18)'
    );
    // NOT a vacuous A1 case, unlike the grade ones: TCH-001 is assigned to
    // Grade 6, so the event audience genuinely contains the poster and only
    // the actor filter keeps them out.
    assert(!has(await notificationsOf(tch1.token), 'event', evId), 'A1: the teacher who posted the event is not notified');

    // -----------------------------------------------------------------------
    console.log('\nExcuse letter — submitted goes to the ADVISER alone');
    // -----------------------------------------------------------------------
    const letterRes = await request('POST', '/api/excuse-letters', {
      token: parentMarwin.token,
      body: { absence_date: ABSENCE_DATE, reason: 'NOTIF TEST fever' },
    });
    requireFixture(letterRes.status === 201, "Marwin's parent submits an excuse letter", why(letterRes));
    const letterId = letterRes.data.excuse_letter.id;
    created.excuseLetters.push(letterId);
    notificationItems.push(['excuse_letter', letterId]);

    assert(
      has(await notificationsOf(tch1.token), 'excuse_submitted', letterId),
      'the adviser of the student’s section is notified'
    );
    assert(
      !has(await notificationsOf(tch3.token), 'excuse_submitted', letterId),
      'a teacher who is not that section’s adviser is not notified'
    );
    assert(
      !has(await notificationsOf(parentMarwin.token), 'excuse_submitted', letterId),
      'A1: the parent who submitted it is not notified'
    );
    assert(
      !has(await notificationsOf(admin.token), 'excuse_submitted', letterId),
      'admin is not notified about a submitted letter (review is adviser-only)'
    );

    const subRow = find(await notificationsOf(tch1.token), 'excuse_submitted', letterId);
    assert(subRow?.body?.includes(ABSENCE_DATE), 'submitted text names the absence date', JSON.stringify(subRow?.body));
    assert(!/\d{12}/.test(subRow?.body || ''), 'submitted text contains no 12-digit LRN');

    // -----------------------------------------------------------------------
    console.log('\nExcuse letter — reviewed goes back to the parent, as its own type');
    // -----------------------------------------------------------------------
    const reviewRes = await request('PATCH', `/api/excuse-letters/${letterId}/review`, {
      token: tch1.token,
      body: { status: 'Approved', teacher_remarks: 'NOTIF TEST ok' },
    });
    requireFixture(reviewRes.status === 200, 'the adviser approves the letter', why(reviewRes));

    const revRow = find(await notificationsOf(parentMarwin.token), 'excuse_reviewed', letterId);
    assert(revRow != null, 'the parent is notified that the letter was reviewed');
    assert(revRow?.title === 'Excuse letter approved', 'approved title says approved', JSON.stringify(revRow?.title));
    assert(
      revRow?.body === `Your excuse letter for ${ABSENCE_DATE} was approved.`,
      'approved body is the exact approved wording',
      JSON.stringify(revRow?.body)
    );
    assert(
      !(revRow?.body || '').includes('NOTIF TEST ok'),
      'the teacher’s remarks are NOT inlined in the notification'
    );
    assert(
      !has(await notificationsOf(tch1.token), 'excuse_reviewed', letterId),
      'A1: the teacher who reviewed it is not notified'
    );
    assert(
      has(await notificationsOf(tch1.token), 'excuse_submitted', letterId),
      'both events coexist on one letter id — distinct types, same item'
    );

    // -----------------------------------------------------------------------
    console.log('\nPending parent — admin only, and self-healing on approval');
    // -----------------------------------------------------------------------
    const stuRes = await request('POST', '/api/students', {
      token: tch1.token,
      body: {
        lrn: '990000000101',
        first_name: 'Notif',
        last_name: 'Fixture',
        grade_level: 6,
        section: 'Malikhain',
      },
    });
    requireFixture(stuRes.status === 201, 'TCH-001 enrolls a throwaway Grade 6 student', why(stuRes));
    const stuId = stuRes.data.student.id;
    created.students.push(stuId);

    const newParentRes = await request('POST', '/api/users/parents', {
      token: tch1.token,
      body: { lrn: '990000000101', password: 'Parent@2026', name: 'Notif Fixture Guardian' },
    });
    requireFixture(newParentRes.status === 201, 'TCH-001 creates the pending parent account', why(newParentRes));
    const newParentId = newParentRes.data.user.id;
    created.users.push(newParentId);
    notificationItems.push(['user', newParentId]);

    assert(has(await notificationsOf(admin.token), 'parent_pending', newParentId), 'admin is notified of a pending parent');
    assert(
      !has(await notificationsOf(tch1.token), 'parent_pending', newParentId),
      'A1: the teacher who created it is not notified'
    );

    const pendRow = find(await notificationsOf(admin.token), 'parent_pending', newParentId);
    assert(
      pendRow?.body === 'A new parent account for Notif Fixture is waiting for approval.',
      'pending-parent text names the STUDENT, never the login id',
      JSON.stringify(pendRow?.body)
    );
    assert(!(pendRow?.body || '').includes('990000000101'), 'pending-parent text contains no LRN');
    assert(pendRow?.link === '/admin/users', 'pending-parent link points at Admin → Users');

    const approveRes = await request('PUT', `/api/users/parents/${newParentId}/approve`, { token: admin.token });
    requireFixture(approveRes.status === 200, 'admin approves the pending parent', why(approveRes));
    assert(
      !has(await notificationsOf(admin.token), 'parent_pending', newParentId),
      'the pending-parent notification retires itself once the account is approved (nothing deleted it)'
    );

    // -----------------------------------------------------------------------
    console.log('\nGrade available — numerical, at the NULL → non-NULL transition, once');
    // -----------------------------------------------------------------------
    const subjRes = await request('GET', '/api/subjects?grade_level=6&limit=200', { token: admin.token });
    requireFixture(subjRes.status === 200 && subjRes.data.subjects.length > 0, 'Grade 6 subjects load', why(subjRes));
    const subject = subjRes.data.subjects[0];

    // school_year is required and validated as YYYY-YYYY with consecutive
    // years; it is read from settings rather than hard-coded so the suite does
    // not start failing when the school year rolls over.
    const settingsRes = await request('GET', '/api/settings', { token: admin.token });
    requireFixture(settingsRes.status === 200, 'settings load for the academic year', why(settingsRes));
    const schoolYear = settingsRes.data.settings.academic_year;

    const gradeRes = await request('POST', '/api/grades', {
      token: admin.token,
      body: { student_id: stuId, subject_id: subject.id, term: 1, school_year: schoolYear },
    });
    requireFixture(gradeRes.status === 201, 'admin creates a grade shell row for the throwaway student', why(gradeRes));
    const gradeId = gradeRes.data.grade.id;
    created.grades.push(gradeId);
    notificationItems.push(['grade', gradeId]);

    const newParentLogin = await login('990000000101', 'Parent@2026');
    requireFixture(newParentLogin.status === 200, 'the approved fixture parent logs in', why(newParentLogin));
    const fixtureParent = { token: newParentLogin.data.token, ...newParentLogin.data.user };

    const ww = await request('POST', `/api/grades/${gradeId}/components`, {
      token: admin.token,
      body: { type: 'WW', score: 40, max_score: 50, label: 'NOTIF TEST ww', slot_id: await makeSlot(gradeId, 'WW', 50) },
    });
    requireFixture(ww.status === 201, 'a WW component is recorded', why(ww));
    created.components.push(ww.data.component.id);
    assert(
      !has(await notificationsOf(fixtureParent.token), 'grade_available', gradeId),
      'a component alone does NOT notify — the term grade is still Pending'
    );

    const pt = await request('POST', `/api/grades/${gradeId}/components`, {
      token: admin.token,
      body: { type: 'PT', score: 45, max_score: 50, label: 'NOTIF TEST pt', slot_id: await makeSlot(gradeId, 'PT', 50) },
    });
    requireFixture(pt.status === 201, 'a PT component is recorded', why(pt));
    created.components.push(pt.data.component.id);

    const exam = await request('PATCH', `/api/grades/${gradeId}/exam`, {
      token: admin.token,
      // The body field names are st1_score/st1_max etc. (routes/grades.js:1122)
      // — NOT the ex_* column names the row comes back with.
      body: { st1_score: 20, st1_max: 25, st2_score: 20, st2_max: 25, te_score: 40, te_max: 50 },
    });
    requireFixture(exam.status === 200, 'the exam sub-scores complete the grade', why(exam));
    requireFixture(exam.data.grade.term_grade !== null, 'term_grade is now computable', 'still null');

    const gradeRows = await notificationsOf(fixtureParent.token);
    assert(has(gradeRows, 'grade_available', gradeId), 'the parent is notified when the term grade becomes computable');
    const gradeRow = find(gradeRows, 'grade_available', gradeId);
    assert(gradeRow?.title === 'A grade is ready to view', 'grade title says a grade is ready');
    assert(
      gradeRow?.body === `${subject.name} — Term 1 is now on the report card.`,
      'grade body names the subject and term',
      JSON.stringify(gradeRow?.body)
    );
    assert(
      !/\d/.test((gradeRow?.body || '').replace(/Term \d/, '')),
      'grade body contains no score, letter or average',
      JSON.stringify(gradeRow?.body)
    );
    assert(
      !has(await notificationsOf(admin.token), 'grade_available', gradeId),
      'A1: the admin who encoded it is not notified'
    );

    const ww2 = await request('POST', `/api/grades/${gradeId}/components`, {
      token: admin.token,
      body: { type: 'WW', score: 30, max_score: 50, label: 'NOTIF TEST ww2', slot_id: await makeSlot(gradeId, 'WW', 50) },
    });
    requireFixture(ww2.status === 201, 'a second WW component is recorded', why(ww2));
    created.components.push(ww2.data.component.id);
    const afterSecond = (await notificationsOf(fixtureParent.token)).filter(
      (r) => r.type === 'grade_available' && Number(r.item_id) === Number(gradeId)
    );
    assert(afterSecond.length === 1, 'still exactly ONE grade notification after a later recompute', `got ${afterSecond.length}`);

    // -----------------------------------------------------------------------
    console.log('\nGrade available — DESCRIPTIVE (Grade 1), the SAME hook');
    // -----------------------------------------------------------------------
    // This used to be "the second hook". It is not one any more (2026-09-22).
    //
    // A Grade 1 letter is computed now (GRADING_SPEC §6a), so it is written by
    // the same four score endpoints Grades 2-6 use and PATCH /:id/descriptive
    // is retired. That means there is exactly ONE fan-out site — the
    // transition inside recomputeGrade — and this block exists to prove the
    // mode-aware version of it still fires for a descriptive row, where the
    // value that goes null -> non-null is descriptive_grade and term_grade
    // stays null forever. A transition test written against term_grade only
    // would silently stop covering Grade 1 parents, which in the seed is
    // Nino's parent account.
    //
    // This creates its OWN Grade 1 student rather than writing anything near
    // Nino's five rows (ids 1-5).
    const g1StuRes = await request('POST', '/api/students', {
      token: tch3.token,
      body: {
        lrn: '990000000102',
        first_name: 'NotifG1',
        last_name: 'Fixture',
        grade_level: 1,
        section: 'Mabait',
      },
    });
    requireFixture(g1StuRes.status === 201, 'TCH-003 enrolls a throwaway Grade 1 student', why(g1StuRes));
    const g1StuId = g1StuRes.data.student.id;
    created.students.push(g1StuId);

    const g1ParentRes = await request('POST', '/api/users/parents', {
      token: tch3.token,
      body: { lrn: '990000000102', password: 'Parent@2026', name: 'NotifG1 Guardian' },
    });
    requireFixture(g1ParentRes.status === 201, 'TCH-003 creates the Grade 1 parent account', why(g1ParentRes));
    const g1ParentId = g1ParentRes.data.user.id;
    created.users.push(g1ParentId);
    notificationItems.push(['user', g1ParentId]);

    const g1Approve = await request('PUT', `/api/users/parents/${g1ParentId}/approve`, { token: admin.token });
    requireFixture(g1Approve.status === 200, 'admin approves the Grade 1 parent', why(g1Approve));

    const g1Login = await login('990000000102', 'Parent@2026');
    requireFixture(g1Login.status === 200, 'the Grade 1 parent logs in', why(g1Login));
    const g1Parent = { token: g1Login.data.token, ...g1Login.data.user };

    const g1SubjRes = await request('GET', '/api/subjects?grade_level=1&limit=200', { token: admin.token });
    requireFixture(g1SubjRes.status === 200 && g1SubjRes.data.subjects.length > 0, 'Grade 1 subjects load', why(g1SubjRes));
    const g1Subject = g1SubjRes.data.subjects[0];

    const g1GradeRes = await request('POST', '/api/grades', {
      token: admin.token,
      body: { student_id: g1StuId, subject_id: g1Subject.id, term: 1, school_year: schoolYear },
    });
    requireFixture(g1GradeRes.status === 201, 'admin creates a descriptive grade shell row', why(g1GradeRes));
    const g1GradeId = g1GradeRes.data.grade.id;
    created.grades.push(g1GradeId);
    notificationItems.push(['grade', g1GradeId]);

    assert(
      !has(await notificationsOf(g1Parent.token), 'grade_available', g1GradeId),
      'an empty descriptive row does not notify'
    );

    // Two of the three inputs. Still no letter, so still no notification —
    // the hook fires on the LETTER appearing, not on a score being written.
    const g1Ww = await request('POST', `/api/grades/${g1GradeId}/components`, {
      token: admin.token,
      body: { type: 'WW', score: 92, max_score: 100, label: 'Quiz 1', slot_id: await makeSlot(g1GradeId, 'WW', 100) },
    });
    requireFixture(g1Ww.status === 201, 'admin records a WW score on the Grade 1 row', why(g1Ww));
    const g1Pt = await request('POST', `/api/grades/${g1GradeId}/components`, {
      token: admin.token,
      body: {
        type: 'PT',
        score: 92,
        max_score: 100,
        label: 'Performance Task 1',
        slot_id: await makeSlot(g1GradeId, 'PT', 100),
      },
    });
    requireFixture(g1Pt.status === 201, 'admin records a PT score on the Grade 1 row', why(g1Pt));
    assert(
      !has(await notificationsOf(g1Parent.token), 'grade_available', g1GradeId),
      'a partly-scored descriptive row does not notify — there is no letter yet'
    );

    // The third input completes it, the letter appears, and THAT is the
    // transition the parent hears about.
    const descRes = await request('PATCH', `/api/grades/${g1GradeId}/exam`, {
      token: admin.token,
      body: { st1_score: 92, st1_max: 100, st2_score: 92, st2_max: 100, te_score: 92, te_max: 100 },
    });
    requireFixture(descRes.status === 200, 'admin completes the Summative, computing the letter', why(descRes));
    requireFixture(
      descRes.data?.grade?.descriptive_grade === 'A' && descRes.data?.grade?.term_grade === null,
      'the completed row holds a letter and no term_grade',
      JSON.stringify({ d: descRes.data?.grade?.descriptive_grade, t: descRes.data?.grade?.term_grade })
    );

    const g1Rows = await notificationsOf(g1Parent.token);
    assert(has(g1Rows, 'grade_available', g1GradeId), 'the Grade 1 parent IS notified when the letter is recorded');
    const g1Row = find(g1Rows, 'grade_available', g1GradeId);
    assert(
      g1Row?.body === `${g1Subject.name} — Term 1 is now on the report card.`,
      'descriptive text is the same wording as numerical — the parent is not told which mode it is',
      JSON.stringify(g1Row?.body)
    );
    assert(!/\bA\b(?![a-z])/.test((g1Row?.body || '').replace(g1Subject.name, '')), 'the LETTER never appears in the text');
    assert(
      !has(await notificationsOf(admin.token), 'grade_available', g1GradeId),
      'A1: the admin who recorded the letter is not notified'
    );

    // Re-encoding moves the letter A -> B. The row already had a letter, so
    // there is no null -> non-null transition and no second notification:
    // a correction is not news, and a parent who is pinged twice for one
    // grade learns to ignore the bell.
    //
    // Only the SUMMATIVE is corrected, and it has to go well below the band
    // to move the letter, because WW and PT still hold 92: the new Initial
    // Grade is 0.3(92) + 0.5(92) + 0.2(50) = 27.6 + 46 + 10 = 83.6, a B.
    // Correcting it to 85 would have left the total at 90.6 and the letter at
    // A — which is exactly what the first attempt at this assertion did, and
    // it would have passed the "no second notification" check while proving
    // nothing about a changed letter.
    const descAgain = await request('PATCH', `/api/grades/${g1GradeId}/exam`, {
      token: admin.token,
      body: { st1_score: 50, st1_max: 100, st2_score: 50, st2_max: 100, te_score: 50, te_max: 100 },
    });
    requireFixture(descAgain.status === 200, 'the scores are corrected', why(descAgain));
    requireFixture(
      descAgain.data?.grade?.descriptive_grade === 'B',
      'the correction really did change the letter to B',
      JSON.stringify(descAgain.data?.grade?.descriptive_grade)
    );
    const g1After = (await notificationsOf(g1Parent.token)).filter(
      (r) => r.type === 'grade_available' && Number(r.item_id) === Number(g1GradeId)
    );
    assert(g1After.length === 1, 'correcting the letter does not notify a second time', `got ${g1After.length}`);

    // -----------------------------------------------------------------------
    console.log('\nGrade available — the CLASS RECORD bulk save (CR1)');
    // -----------------------------------------------------------------------
    // The one fan-out site is inside recomputeGrade, so a forty-learner save
    // must produce one notification per learner whose grade FIRST becomes
    // available — no more, no fewer, and none at all for a learner still
    // incomplete. The bulk endpoint passes ONE shared pending array through
    // every recompute and emits after commit; these assertions are what make
    // that claim checkable rather than a comment.
    //
    // A SECOND throwaway learner, so "multi-learner" is literally true. The
    // first (above) already has a letter and a notification, which makes it
    // the natural subject of the "already available" case.
    const g2StuRes = await request('POST', '/api/students', {
      token: tch3.token,
      body: { lrn: '990000000103', first_name: 'NotifG2', last_name: 'Fixture', grade_level: 1, section: 'Mabait' },
    });
    requireFixture(g2StuRes.status === 201, 'a second throwaway Grade 1 learner', why(g2StuRes));
    const g2StuId = g2StuRes.data.student.id;
    created.students.push(g2StuId);

    const g2ParentRes = await request('POST', '/api/users/parents', {
      token: tch3.token,
      body: { lrn: '990000000103', password: 'Parent@2026', name: 'NotifG2 Guardian' },
    });
    requireFixture(g2ParentRes.status === 201, 'its parent account', why(g2ParentRes));
    const g2ParentId = g2ParentRes.data.user.id;
    created.users.push(g2ParentId);
    notificationItems.push(['user', g2ParentId]);
    requireFixture(
      (await request('PUT', `/api/users/parents/${g2ParentId}/approve`, { token: admin.token })).status === 200,
      'the second parent is approved'
    );
    const g2Login = await login('990000000103', 'Parent@2026');
    requireFixture(g2Login.status === 200, 'the second parent logs in', why(g2Login));
    const g2Parent = { token: g2Login.data.token, ...g2Login.data.user };

    const classKey = {
      subject_id: g1Subject.id,
      grade_level: 1,
      section: 'Mabait',
      term: 1,
      school_year: schoolYear,
    };
    const slotRes = await request('PUT', '/api/grades/class-record', {
      token: admin.token,
      body: {
        ...classKey,
        // THE SLOTS LEARNER 1 ALREADY USES, not new ones. Since 2026-09-22
        // a used column with no score makes that learner Pending, so
        // inventing columns 9 here would leave learner 1 unmarked in them
        // and learner 2 unmarked in learner 1's — and neither would ever
        // become available, which is exactly what this block is testing.
        // makeSlot numbered those 1; the upsert reuses them.
        slots: [
          { type: 'WW', slot_no: 1, max_score: 100 },
          { type: 'PT', slot_no: 1, max_score: 100 },
        ],
      },
    });
    requireFixture(slotRes.status === 200, 'two slots for the bulk save', why(slotRes));
    const bulkWw = slotRes.data.slots.find((s) => s.type === 'WW' && s.slot_no === 1);
    const bulkPt = slotRes.data.slots.find((s) => s.type === 'PT' && s.slot_no === 1);
    createdSlotIds.push(bulkWw.id, bulkPt.id);

    // ONE save touching BOTH learners. Learner 1 already has a letter, so
    // its grade cannot become available again; learner 2 gets WW and PT but
    // no Summative, so its grade cannot become available yet.
    const partial = await request('PUT', '/api/grades/class-record', {
      token: admin.token,
      body: {
        ...classKey,
        entries: [
          { student_id: g1StuId, scores: [{ slot_id: bulkWw.id, score: 70 }] },
          {
            student_id: g2StuId,
            scores: [
              { slot_id: bulkWw.id, score: 80 },
              { slot_id: bulkPt.id, score: 80 },
            ],
          },
        ],
      },
    });
    requireFixture(partial.status === 200, 'the multi-learner save succeeds', why(partial));
    for (const row of partial.data.results) {
      if (!created.grades.includes(row.grade_id)) created.grades.push(row.grade_id);
      notificationItems.push(['grade', row.grade_id]);
    }

    const g2GradeId = partial.data.results.find((r) => Number(r.student_id) === Number(g2StuId)).grade_id;

    assert(
      !has(await notificationsOf(g2Parent.token), 'grade_available', g2GradeId),
      'a learner left INCOMPLETE by a bulk save is not notified'
    );
    const g1AfterBulk = (await notificationsOf(g1Parent.token)).filter(
      (r) => r.type === 'grade_available' && Number(r.item_id) === Number(g1GradeId)
    );
    assert(
      g1AfterBulk.length === 1,
      'a learner whose grade was ALREADY available is not notified again by a bulk save',
      `got ${g1AfterBulk.length}`
    );

    // Now complete learner 2 in a save that ALSO touches learner 1 again.
    const complete = await request('PUT', '/api/grades/class-record', {
      token: admin.token,
      body: {
        ...classKey,
        entries: [
          { student_id: g1StuId, scores: [{ slot_id: bulkWw.id, score: 60 }] },
          { student_id: g2StuId, st1_score: 80, st1_max: 100, st2_score: 80, st2_max: 100, te_score: 80, te_max: 100 },
        ],
      },
    });
    requireFixture(complete.status === 200, 'the completing save succeeds', why(complete));

    const g2Rows = (await notificationsOf(g2Parent.token)).filter(
      (r) => r.type === 'grade_available' && Number(r.item_id) === Number(g2GradeId)
    );
    assert(
      g2Rows.length === 1,
      'the learner completed by a bulk save is notified EXACTLY once',
      `got ${g2Rows.length}`
    );
    const g1Final = (await notificationsOf(g1Parent.token)).filter(
      (r) => r.type === 'grade_available' && Number(r.item_id) === Number(g1GradeId)
    );
    assert(
      g1Final.length === 1,
      'and the other learner in that same save still has exactly one',
      `got ${g1Final.length}`
    );
    assert(
      !has(await notificationsOf(admin.token), 'grade_available', g2GradeId),
      'the admin who saved the class record is not notified about it'
    );

    // -----------------------------------------------------------------------
    console.log('\nRead state — per item, own rows only');
    // -----------------------------------------------------------------------
    const beforeCounts = await countsOf(parentMarwin.token);
    requireFixture(beforeCounts != null, 'unread counts load for a parent');
    assert(beforeCounts.total > 0, 'the parent has unread notifications');
    assert(beforeCounts.announcements >= 2, 'announcements are counted under their nav section');
    assert(beforeCounts.grades === 0, "this parent's grades count is 0 (their own child has no new grade here)");

    const targetRow = find(await notificationsOf(parentMarwin.token), 'announcement', annId);
    const markRes = await request('PATCH', `/api/notifications/${targetRow.id}/read`, { token: parentMarwin.token });
    assert(markRes.status === 200, 'a parent marks their own notification read', why(markRes));
    assert(markRes.data.notification.read_at !== null, 'the marked notification comes back with read_at set');

    const afterCounts = await countsOf(parentMarwin.token);
    assert(afterCounts.total === beforeCounts.total - 1, 'the unread total drops by exactly one');
    assert(
      has(await notificationsOf(parentMarwin.token), 'announcement', annId),
      'a read notification is still listed — read is a dot, not a delete'
    );

    const repeat = await request('PATCH', `/api/notifications/${targetRow.id}/read`, { token: parentMarwin.token });
    assert(repeat.status === 200, 'marking an already-read notification again is absorbed, not an error', why(repeat));

    const foreign = await request('PATCH', `/api/notifications/${targetRow.id}/read`, { token: parentNino.token });
    assert(foreign.status === 404, "another user's notification is 404, not 403", why(foreign));

    const unreadOnly = await request('GET', '/api/notifications?unread_only=true&limit=200', { token: parentMarwin.token });
    assert(unreadOnly.status === 200, 'unread_only=true is accepted', why(unreadOnly));
    assert(
      unreadOnly.data.notifications.every((r) => r.read_at === null),
      'unread_only returns only unread rows'
    );
    assert(
      unreadOnly.data.page.total === afterCounts.total,
      'unread_only page.total matches the unread count (C4: total counts the filtered set)',
      `page.total=${unreadOnly.data.page.total} counts.total=${afterCounts.total}`
    );

    // -----------------------------------------------------------------------
    console.log('\nPagination and validation');
    // -----------------------------------------------------------------------
    const paged = await request('GET', '/api/notifications?limit=1&offset=0', { token: parentMarwin.token });
    assert(paged.status === 200 && paged.data.notifications.length === 1, 'limit=1 returns one row', why(paged));
    assert(paged.data.page.has_more === true, 'has_more is true when more rows exist');
    assert(
      (await request('GET', '/api/notifications?limit=0', { token: parentMarwin.token })).status === 400,
      'limit=0 is 400'
    );
    assert(
      (await request('GET', '/api/notifications?limit=201', { token: parentMarwin.token })).status === 400,
      'limit above the 200 max is 400'
    );
    assert(
      (await request('GET', '/api/notifications?sort=nonsense', { token: parentMarwin.token })).status === 400,
      'an unknown sort key is 400'
    );
    assert(
      (await request('GET', '/api/notifications?unread_only=maybe', { token: parentMarwin.token })).status === 400,
      'unread_only outside true/false is 400'
    );
    assert(
      (await request('GET', '/api/notifications', {})).status === 401,
      'an unauthenticated list is 401'
    );
    assert(
      (await request('PATCH', '/api/notifications/abc/read', { token: parentMarwin.token })).status === 400,
      'a non-numeric id is 400'
    );

    // -----------------------------------------------------------------------
    console.log('\nRead-time visibility re-check — a deleted item disappears');
    // -----------------------------------------------------------------------
    const delRes = await request('DELETE', `/api/announcements/${secId}`, { token: tch1.token });
    requireFixture(delRes.status === 200, 'the section announcement is deleted', why(delRes));
    created.announcements = created.announcements.filter((id) => id !== secId);
    assert(
      !has(await notificationsOf(parentMarwin.token), 'announcement', secId),
      'its notification stops being listed the moment the announcement is gone'
    );
    const stillThere = await dbCount('notifications', 'WHERE item_type = ? AND item_id = ?', ['announcement', secId]);
    assert(
      stillThere > 0,
      'the row is still in the table — nothing deleted it; the read-time re-check filtered it out',
      `rows=${stillThere}`
    );

    // -----------------------------------------------------------------------
    console.log('\nMark all as read');
    // -----------------------------------------------------------------------
    const allRes = await request('PATCH', '/api/notifications/read-all', { token: parentNino.token });
    assert(allRes.status === 200, 'mark-all succeeds', why(allRes));
    assert(allRes.data.updated >= 1, 'mark-all reports how many rows it updated');
    const zeroed = await countsOf(parentNino.token);
    assert(zeroed.total === 0, 'the unread total is 0 after mark-all', `got ${zeroed.total}`);
    const allAgain = await request('PATCH', '/api/notifications/read-all', { token: parentNino.token });
    assert(allAgain.status === 200 && allAgain.data.updated === 0, 'a second mark-all updates nothing and is not an error');
  } catch (error) {
    if (error instanceof FixtureFailure) {
      console.error(`\nFIXTURE FAILED — run stopped: ${error.message}`);
    } else {
      console.error('\nUNEXPECTED ERROR:', error);
      failed += 1;
    }
  } finally {
    // -------------------------------------------------------------------
    console.log('\nCleanup');
    // -------------------------------------------------------------------
    const adminToken = admin?.token;

    // EVERY cleanup request is individually guarded. request() does not throw
    // on a non-2xx, but it DOES throw if fetch itself fails — a restarting API
    // server, a dropped connection — and an unguarded loop then abandons every
    // later loop: one run of this suite aborted mid-test and left two
    // announcements and a memo behind for exactly that reason, which then made
    // the NEXT run's baseline assertions fail. Cleanup must be the one part of
    // a test that keeps going after something breaks.
    const tryDelete = async (path) => {
      try {
        await request('DELETE', path, { token: adminToken });
      } catch (e) {
        console.error(`  ! cleanup DELETE ${path} threw: ${e.message}`);
      }
    };

    try {
      for (const id of created.components) {
        await tryDelete(`/api/grades/${created.grades[0]}/components/${id}`);
      }
      for (const id of created.grades) {
        await tryDelete(`/api/grades/${id}`);
      }
      // Slots AFTER the grades: the FK is ON DELETE RESTRICT, so a slot
      // still holding a component cannot be dropped. Deleting the grades
      // cascades their components away, which is what frees the slots.
      await deleteSlots();
      for (const id of created.events) {
        await tryDelete(`/api/events/${id}`);
      }
      for (const id of created.memos) {
        await tryDelete(`/api/memos/${id}`);
      }
      for (const id of created.announcements) {
        await tryDelete(`/api/announcements/${id}`);
      }

      // Excuse letters, the throwaway student, the throwaway parent and the
      // notification rows have no DELETE endpoint (deliberately — none of
      // those is a thing the UI may remove), so they go by direct SQL, the
      // same way test-sections resets its adviser fixtures.
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection(dbConfig);
      try {
        for (const id of created.excuseLetters) {
          await conn.query('DELETE FROM excuse_letters WHERE id = ?', [id]);
        }
        for (const id of created.users) {
          await conn.query('DELETE FROM users WHERE id = ?', [id]);
        }
        for (const id of created.students) {
          await conn.query('DELETE FROM students WHERE id = ?', [id]);
        }
      } finally {
        await conn.end();
      }

      {
        const conn = await mysql.createConnection(dbConfig);
        try {
          await deleteNotificationsFor(conn, notificationItems);
        } finally {
          await conn.end();
        }
      }

      // Baseline check — the Seeded baseline, asserted, not assumed.
      //
      // NOTIFICATIONS IS CHECKED AS AN INVARIANT OVER THIS RUN'S OWN ROWS, not
      // as an exact table count, and the difference matters. `notifications` is
      // a table the application writes to constantly, and — because item_id
      // carries no FK — the OTHER suites now leave orphan rows behind: each of
      // them posts announcements, submits letters, creates parents and encodes
      // grades, deletes those items in its own cleanup, and has no idea this
      // table exists. Asserting `COUNT(*) = 0` here would make this suite fail
      // whenever another one ran first, which is the "never assert an exact row
      // count on a shared table" rule in CLAUDE.md, and a suite that fails
      // because someone used the feature is not testing the feature.
      let leftover = 0;
      for (const [itemType, itemId] of notificationItems) {
        leftover += await dbCount('notifications', 'WHERE item_type = ? AND item_id = ?', [itemType, itemId]);
      }
      assert(leftover === 0, 'every notification row THIS RUN created is gone', `got ${leftover}`);
      const notifTotal = await dbCount('notifications');
      console.log(`  i notifications table holds ${notifTotal} row(s) not created by this run`);
      const users = await dbCount('users');
      assert(users === 7, 'users is back to 7', `got ${users}`);
      const students = await dbCount('students');
      assert(students === 3, 'students is back to 3', `got ${students}`);
      const grades = await dbCount('grades');
      assert(grades === 5, "grades is back to 5 — Nino's five rows untouched", `got ${grades}`);
      const jea = await dbCount('users', "WHERE login_id = '1234567' AND status = 'pending'");
      assert(jea === 1, "Jea's parent account is still pending and untouched", `got ${jea}`);
      for (const table of ['announcements', 'memos', 'events', 'excuse_letters']) {
        const n = await dbCount(table);
        assert(n === 0, `${table} is back to 0`, `got ${n}`);
      }
    } catch (cleanupError) {
      console.error('CLEANUP ERROR:', cleanupError.message);
      failed += 1;
    }

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  }
}

main();
