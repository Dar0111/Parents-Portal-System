/**
 * Announcements / Memos / Events API tests — audience scoping, teacher write
 * restrictions with named-reason 403s, memo admin-only writes, event date
 * bounds, author-or-admin edit/delete.
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 *
 * Idempotent: every row this script creates is tracked and deleted in a
 * finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:content
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;

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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function yearsFromNow(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

async function run() {
  console.log(`\nParents Portal — Announcements/Memos/Events API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Mabini only.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Mabini)');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  assert(
    meParent.data?.user?.grade_level === 6 && meParent.data?.user?.section === 'Mabini',
    "Marwin's grade/section resolved via /me"
  );

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

  const createdAnnouncementIds = [];
  const createdMemoIds = [];
  const createdEventIds = [];

  async function cleanup() {
    await withDb(async (conn) => {
      if (createdAnnouncementIds.length) {
        await conn.query('DELETE FROM announcements WHERE id IN (?)', [createdAnnouncementIds]);
      }
      if (createdMemoIds.length) {
        await conn.query('DELETE FROM memos WHERE id IN (?)', [createdMemoIds]);
      }
      if (createdEventIds.length) {
        await conn.query('DELETE FROM events WHERE id IN (?)', [createdEventIds]);
      }
    });
  }

  try {
    // --- Announcements: write scoping ---
    console.log('\nAnnouncements — write scoping:');

    const adminSchoolWide = await request('POST', '/api/announcements', {
      token: adminToken,
      body: { title: 'School-wide notice', content: 'Everyone sees this.' },
    });
    assert(adminSchoolWide.status === 201, 'Admin posts school-wide announcement (NULL target)');
    if (adminSchoolWide.data?.announcement?.id) createdAnnouncementIds.push(adminSchoolWide.data.announcement.id);

    const adminG6Mabini = await request('POST', '/api/announcements', {
      token: adminToken,
      body: { title: 'Grade 6 Mabini notice', content: 'For Marwin\'s class.', target_grade: 6, target_section: 'Mabini' },
    });
    assert(adminG6Mabini.status === 201, "Admin posts to Marwin's grade/section");
    if (adminG6Mabini.data?.announcement?.id) createdAnnouncementIds.push(adminG6Mabini.data.announcement.id);

    const adminG5Rizal = await request('POST', '/api/announcements', {
      token: adminToken,
      body: { title: 'Grade 5 Rizal notice', content: "For Jea's class, not Marwin's.", target_grade: 5, target_section: 'Rizal' },
    });
    assert(adminG5Rizal.status === 201, "Admin posts to a different grade/section (Jea's class)");
    if (adminG5Rizal.data?.announcement?.id) createdAnnouncementIds.push(adminG5Rizal.data.announcement.id);

    const teacherOwnClass = await request('POST', '/api/announcements', {
      token: teacherToken,
      body: { title: 'From the teacher', content: 'Posted by TCH-001.', target_grade: 6, target_section: 'Mabini' },
    });
    assert(teacherOwnClass.status === 201, 'Teacher posts within their own assignment');
    if (teacherOwnClass.data?.announcement?.id) createdAnnouncementIds.push(teacherOwnClass.data.announcement.id);
    const teacherAnnouncementId = teacherOwnClass.data?.announcement?.id;

    const teacherSchoolWide = await request('POST', '/api/announcements', {
      token: teacherToken,
      body: { title: 'Attempted school-wide', content: 'Should be rejected.' },
    });
    assert(
      teacherSchoolWide.status === 403 &&
        /school-wide/i.test(teacherSchoolWide.data?.message || '') &&
        /admin-only/i.test(teacherSchoolWide.data?.message || ''),
      'Teacher posting with target_grade NULL gets 403 naming the reason (school-wide, admin-only)'
    );

    const teacherWholeGrade = await request('POST', '/api/announcements', {
      token: teacherToken,
      body: { title: 'Attempted whole-grade', content: 'Should be rejected.', target_grade: 6 },
    });
    assert(
      teacherWholeGrade.status === 403 && /admin-only/i.test(teacherWholeGrade.data?.message || ''),
      'Teacher posting target_grade with no target_section gets 403 naming the reason'
    );

    const teacherWrongSection = await request('POST', '/api/announcements', {
      token: teacherToken,
      body: { title: 'Attempted wrong section', content: 'Should be rejected.', target_grade: 6, target_section: 'Bonifacio' },
    });
    assert(
      teacherWrongSection.status === 403 && /not assigned to Grade 6 - Bonifacio/.test(teacherWrongSection.data?.message || ''),
      'Teacher posting outside their assignment gets 403 naming the grade/section'
    );

    const sectionWithoutGrade = await request('POST', '/api/announcements', {
      token: adminToken,
      body: { title: 'Bad combo', content: 'Section with no grade.', target_section: 'Mabini' },
    });
    assert(sectionWithoutGrade.status === 400, 'target_section without target_grade rejected');

    // --- Announcements: read scoping ---
    console.log('\nAnnouncements — read scoping:');

    const parentList = await request('GET', '/api/announcements', { token: parentToken });
    const parentIds = (parentList.data?.announcements || []).map((a) => a.id);
    assert(parentList.status === 200, 'Parent can list announcements');
    assert(parentIds.includes(adminSchoolWide.data.announcement.id), 'Parent sees school-wide announcement');
    assert(parentIds.includes(adminG6Mabini.data.announcement.id), "Parent sees announcement targeting Marwin's class");
    assert(!parentIds.includes(adminG5Rizal.data.announcement.id), "Parent does not see Jea's class announcement");

    const teacherList = await request('GET', '/api/announcements', { token: teacherToken });
    const teacherIds = (teacherList.data?.announcements || []).map((a) => a.id);
    assert(teacherIds.includes(adminSchoolWide.data.announcement.id), 'Teacher sees school-wide announcement');
    assert(teacherIds.includes(adminG6Mabini.data.announcement.id), 'Teacher sees announcement targeting own assignment');
    assert(!teacherIds.includes(adminG5Rizal.data.announcement.id), 'Teacher does not see out-of-scope announcement');

    const adminList = await request('GET', '/api/announcements', { token: adminToken });
    const adminIds = (adminList.data?.announcements || []).map((a) => a.id);
    assert(adminIds.includes(adminG5Rizal.data.announcement.id), 'Admin sees every announcement');

    // --- Announcements: edit/delete (author or admin) ---
    console.log('\nAnnouncements — edit/delete:');

    const nonNumericId = await request('PUT', '/api/announcements/abc', { token: adminToken, body: { title: 'x' } });
    assert(nonNumericId.status === 400, 'PUT /api/announcements/abc returns 400, not 500');

    const nonAuthorEdit = await request('PUT', `/api/announcements/${adminSchoolWide.data.announcement.id}`, {
      token: teacherToken,
      body: { title: 'Hijacked' },
    });
    assert(nonAuthorEdit.status === 403, 'Non-author teacher cannot edit another announcement');

    const adminEditsTeacherPost = await request('PUT', `/api/announcements/${teacherAnnouncementId}`, {
      token: adminToken,
      body: { title: 'Edited by admin' },
    });
    assert(
      adminEditsTeacherPost.status === 200 && adminEditsTeacherPost.data?.announcement?.title === 'Edited by admin',
      "Admin can edit a teacher's announcement"
    );

    const nonAuthorDelete = await request('DELETE', `/api/announcements/${adminG6Mabini.data.announcement.id}`, {
      token: teacherToken,
    });
    assert(nonAuthorDelete.status === 403, 'Non-author teacher cannot delete another announcement');

    // --- Memos: admin-only writes, everyone reads ---
    console.log('\nMemos:');

    const teacherCreatesMemo = await request('POST', '/api/memos', {
      token: teacherToken,
      body: { title: 'Teacher memo attempt', content: 'Should be rejected.' },
    });
    assert(teacherCreatesMemo.status === 403, 'Teacher cannot create a memo');

    const adminCreatesMemo = await request('POST', '/api/memos', {
      token: adminToken,
      body: { title: 'No classes Friday', content: 'School-wide notice, no targeting possible.' },
    });
    assert(adminCreatesMemo.status === 201, 'Admin creates a memo');
    const memoId = adminCreatesMemo.data?.memo?.id;
    if (memoId) createdMemoIds.push(memoId);

    const teacherEditsMemo = await request('PUT', `/api/memos/${memoId}`, {
      token: teacherToken,
      body: { title: 'Hijacked' },
    });
    assert(teacherEditsMemo.status === 403, 'Teacher cannot edit a memo');

    const teacherDeletesMemo = await request('DELETE', `/api/memos/${memoId}`, { token: teacherToken });
    assert(teacherDeletesMemo.status === 403, 'Teacher cannot delete a memo');

    const parentReadsMemo = await request('GET', '/api/memos', { token: parentToken });
    const memoIds = (parentReadsMemo.data?.memos || []).map((m) => m.id);
    assert(parentReadsMemo.status === 200 && memoIds.includes(memoId), 'Parent can read memos');

    const adminEditsMemo = await request('PUT', `/api/memos/${memoId}`, {
      token: adminToken,
      body: { title: 'No classes Friday (updated)' },
    });
    assert(adminEditsMemo.status === 200, 'Admin edits a memo');

    // --- Events: write scoping, date bounds ---
    console.log('\nEvents — write scoping and dates:');

    const teacherEventOwnGrade = await request('POST', '/api/events', {
      token: teacherToken,
      body: { title: 'Grade 6 field trip', event_date: daysAgo(1), target_grade: 6 },
    });
    assert(teacherEventOwnGrade.status === 201, 'Teacher posts event within their assigned grade');
    if (teacherEventOwnGrade.data?.event?.id) createdEventIds.push(teacherEventOwnGrade.data.event.id);

    const teacherEventSchoolWide = await request('POST', '/api/events', {
      token: teacherToken,
      body: { title: 'Attempted school-wide event', event_date: daysAgo(1) },
    });
    assert(
      teacherEventSchoolWide.status === 403 &&
        /school-wide/i.test(teacherEventSchoolWide.data?.message || '') &&
        /admin-only/i.test(teacherEventSchoolWide.data?.message || ''),
      'Teacher posting event with target_grade NULL gets 403 naming the reason'
    );

    const teacherEventWrongGrade = await request('POST', '/api/events', {
      token: teacherToken,
      body: { title: 'Attempted grade 3 event', event_date: daysAgo(1), target_grade: 3 },
    });
    assert(
      teacherEventWrongGrade.status === 403 && /not assigned to Grade 3/.test(teacherEventWrongGrade.data?.message || ''),
      'Teacher posting event outside their assigned grade gets 403 naming the grade'
    );

    const eventTooFarAhead = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'Far future event', event_date: yearsFromNow(2), target_grade: 6 },
    });
    assert(eventTooFarAhead.status === 400, 'Event more than one year in the future rejected');

    const eventPastAllowed = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'Past event', event_date: daysAgo(30), target_grade: 6 },
    });
    assert(eventPastAllowed.status === 201, 'Past event date allowed (recorded after the fact)');
    if (eventPastAllowed.data?.event?.id) createdEventIds.push(eventPastAllowed.data.event.id);

    const adminEventSchoolWide = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'School-wide assembly', event_date: daysAgo(1) },
    });
    assert(adminEventSchoolWide.status === 201, 'Admin posts school-wide event');
    if (adminEventSchoolWide.data?.event?.id) createdEventIds.push(adminEventSchoolWide.data.event.id);

    const adminEventG5 = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'Grade 5 event', event_date: daysAgo(1), target_grade: 5 },
    });
    assert(adminEventG5.status === 201, 'Admin posts event for a grade the teacher does not teach');
    if (adminEventG5.data?.event?.id) createdEventIds.push(adminEventG5.data.event.id);

    // --- Events: read scoping ---
    console.log('\nEvents — read scoping:');

    const parentEvents = await request('GET', '/api/events', { token: parentToken });
    const parentEventIds = (parentEvents.data?.events || []).map((e) => e.id);
    assert(parentEventIds.includes(teacherEventOwnGrade.data.event.id), "Parent sees event targeting Marwin's grade");
    assert(parentEventIds.includes(adminEventSchoolWide.data.event.id), 'Parent sees school-wide event');
    assert(!parentEventIds.includes(adminEventG5.data.event.id), "Parent does not see Grade 5 event");

    const teacherEvents = await request('GET', '/api/events', { token: teacherToken });
    const teacherEventIds = (teacherEvents.data?.events || []).map((e) => e.id);
    assert(!teacherEventIds.includes(adminEventG5.data.event.id), 'Teacher does not see event outside their grade');

    // --- Events: edit/delete ---
    console.log('\nEvents — edit/delete:');

    const nonAuthorEventEdit = await request('PUT', `/api/events/${adminEventSchoolWide.data.event.id}`, {
      token: teacherToken,
      body: { title: 'Hijacked' },
    });
    assert(nonAuthorEventEdit.status === 403, 'Non-author teacher cannot edit another event');

    const authorEventEdit = await request('PUT', `/api/events/${teacherEventOwnGrade.data.event.id}`, {
      token: teacherToken,
      body: { title: 'Grade 6 field trip (rescheduled)' },
    });
    assert(authorEventEdit.status === 200, 'Author edits their own event');

    const adminDeletesEvent = await request('DELETE', `/api/events/${adminEventG5.data.event.id}`, {
      token: adminToken,
    });
    assert(adminDeletesEvent.status === 200, 'Admin deletes an event');
    // Deleted directly via the API — remove from the cleanup list so we don't
    // try to delete it again (harmless no-op either way, but keep it accurate).
    const idx = createdEventIds.indexOf(adminEventG5.data.event.id);
    if (idx !== -1) createdEventIds.splice(idx, 1);
  } finally {
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
