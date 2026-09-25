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
const { pairsFor, deleteNotificationsFor, countNotificationsFor } = require('./test-helpers/notifications');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function yearsFromNow(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// posted_by is an ownership credential (PUT/DELETE compare it to req.user.id).
// posted_by_name is display-only. Both must land on every returned row.
// Expected id/name come from POST /auth/login, not from the content JOIN.
function assertPoster(row, user, label) {
  assert(
    row != null && row.posted_by === user.id && row.posted_by_name === user.name,
    label,
    `posted_by=${row?.posted_by} posted_by_name=${JSON.stringify(row?.posted_by_name)} (expected ${user.id} / ${JSON.stringify(user.name)})`
  );
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
  const adminUser = adminLogin.data?.user;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  // TCH-001 (seeded) is assigned Grade 6 - Mabini only.
  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  const teacherUser = teacherLogin.data?.user;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login (Grade 6 - Mabini)');

  // TCH-002 advises Grade 5 - Masigasig and holds ZERO teacher_assignments rows.
  // It is the only fixture that can distinguish "assigned" from "adviser" —
  // TCH-001 satisfies both, so no test written against it can tell them apart.
  const adviserLogin = await login('TCH-002', 'Teacher@2026');
  const adviserToken = adviserLogin.data?.token;
  assert(
    adviserLogin.status === 200 && adviserToken,
    'Adviser-only teacher login (TCH-002, Grade 5 - Masigasig, no assignments)'
  );

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login (Marwin, Grade 6 - Mabini)');

  const meParent = await request('GET', '/api/auth/me', { token: parentToken });
  assert(
    meParent.data?.user?.grade_level === 6 && meParent.data?.user?.section === 'Malikhain',
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
  // Every event id this run ever created, never spliced — the notification
  // pairs are built from this, because an event deleted through the API
  // leaves the cleanup list but not the notifications table.
  const notifiedEventIds = [];

  async function cleanup() {
    // Every post this run made fanned out to its audience, and those
    // notifications rows have no FK to follow the post away (pre-Stage-5
    // #3a). Pairs first, from the same id lists, then the posts.
    // Events come from `notifiedEventIds`, not `createdEventIds`: the run
    // deletes one event through the API and splices it out of the cleanup
    // list, but the DELETE route does not touch notifications, so a pair list
    // built from the spliced array missed that event's rows — measured on the
    // first run of this helper (1 row left, to the Grade 5 adviser).
    const notificationPairs = [
      ...pairsFor('announcement', createdAnnouncementIds),
      ...pairsFor('memo', createdMemoIds),
      ...pairsFor('event', notifiedEventIds),
    ];
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
      const deleted = await deleteNotificationsFor(conn, notificationPairs);
      const leftover = await countNotificationsFor(conn, notificationPairs);
      assert(
        leftover === 0,
        `every notification row THIS RUN fanned out is gone (${deleted} deleted over ${notificationPairs.length} items)`,
        `got ${leftover}`
      );
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
      body: { title: 'Grade 6 Malikhain notice', content: 'For Marwin\'s class.', target_grade: 6, target_section: 'Malikhain' },
    });
    assert(adminG6Mabini.status === 201, "Admin posts to Marwin's grade/section");
    if (adminG6Mabini.data?.announcement?.id) createdAnnouncementIds.push(adminG6Mabini.data.announcement.id);

    const adminG5Rizal = await request('POST', '/api/announcements', {
      token: adminToken,
      body: { title: 'Grade 5 Masigasig notice', content: "For Jea's class, not Marwin's.", target_grade: 5, target_section: 'Masigasig' },
    });
    assert(adminG5Rizal.status === 201, "Admin posts to a different grade/section (Jea's class)");
    if (adminG5Rizal.data?.announcement?.id) createdAnnouncementIds.push(adminG5Rizal.data.announcement.id);

    const teacherOwnClass = await request('POST', '/api/announcements', {
      token: teacherToken,
      body: { title: 'From the teacher', content: 'Posted by TCH-001.', target_grade: 6, target_section: 'Malikhain' },
    });
    assert(teacherOwnClass.status === 201, 'Teacher posts within their own assignment');
    assertPoster(
      teacherOwnClass.data?.announcement,
      teacherUser,
      'POST announcement carries posted_by id and posted_by_name'
    );

    // --- Adviser-only teacher: the Class Board case ---
    // A section-scoped announcement is how the Class Board is delivered (see
    // CLAUDE.md). An adviser who cannot post to their own advisory section
    // cannot deliver it, which is why this widening moves a WRITE gate — the
    // students.js fix deliberately did not, because nothing there required it.
    const adviserOwnSection = await request('POST', '/api/announcements', {
      token: adviserToken,
      body: {
        title: 'Adviser posts to own section',
        content: 'Class Board case.',
        target_grade: 5,
        target_section: 'Masigasig',
      },
    });
    if (adviserOwnSection.data?.announcement?.id) {
      createdAnnouncementIds.push(adviserOwnSection.data.announcement.id);
    }
    assert(
      adviserOwnSection.status === 201,
      'Adviser-only teacher CAN post to their own advisory section (was 403 before the widening)'
    );

    // ...and nothing wider. All three of these stayed 403.
    const adviserOtherSection = await request('POST', '/api/announcements', {
      token: adviserToken,
      body: { title: 'nope', content: 'x', target_grade: 6, target_section: 'Malikhain' },
    });
    assert(
      adviserOtherSection.status === 403,
      'Adviser-only teacher still cannot post to a section they neither teach nor advise'
    );

    const adviserSchoolWide = await request('POST', '/api/announcements', {
      token: adviserToken,
      body: { title: 'nope', content: 'x' },
    });
    assert(adviserSchoolWide.status === 403, 'Adviser-only teacher still cannot post school-wide');

    const adviserWholeGrade = await request('POST', '/api/announcements', {
      token: adviserToken,
      body: { title: 'nope', content: 'x', target_grade: 5 },
    });
    assert(
      adviserWholeGrade.status === 403,
      'Adviser-only teacher still cannot post whole-grade, only their own section'
    );

    const adviserList = await request('GET', '/api/announcements', { token: adviserToken });
    const adviserListIds = (adviserList.data?.announcements || []).map((a) => a.id);
    assert(
      adviserListIds.includes(adviserOwnSection.data?.announcement?.id),
      'Adviser-only teacher can read back the announcement they posted to their own section'
    );
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
      teacherWrongSection.status === 403 && /not connected to Grade 6 - Bonifacio/.test(teacherWrongSection.data?.message || ''),
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
    const parentTeacherPost = (parentList.data?.announcements || []).find(
      (a) => a.id === teacherOwnClass.data.announcement.id
    );
    assertPoster(
      parentTeacherPost,
      teacherUser,
      'GET announcements list row carries posted_by id and posted_by_name'
    );

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
    assertPoster(
      adminEditsTeacherPost.data?.announcement,
      teacherUser,
      'PUT announcement keeps posted_by id and posted_by_name (admin edit does not rewrite the poster)'
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
    assertPoster(adminCreatesMemo.data?.memo, adminUser, 'POST memo carries posted_by id and posted_by_name');

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
    const parentMemo = (parentReadsMemo.data?.memos || []).find((m) => m.id === memoId);
    assertPoster(parentMemo, adminUser, 'GET memos list row carries posted_by id and posted_by_name');

    const adminEditsMemo = await request('PUT', `/api/memos/${memoId}`, {
      token: adminToken,
      body: { title: 'No classes Friday (updated)' },
    });
    assert(adminEditsMemo.status === 200, 'Admin edits a memo');
    assertPoster(adminEditsMemo.data?.memo, adminUser, 'PUT memo keeps posted_by id and posted_by_name');

    // --- Events: write scoping, date bounds ---
    console.log('\nEvents — write scoping and dates:');

    const ownGradeEventDate = daysAgo(1); // cached once — reused below, so the
    // round-trip assertion can never flake against a fresh daysAgo(1) call
    // straddling a UTC day boundary mid-test.
    const teacherEventOwnGrade = await request('POST', '/api/events', {
      token: teacherToken,
      body: { title: 'Grade 6 field trip', event_date: ownGradeEventDate, target_grade: 6 },
    });
    assert(teacherEventOwnGrade.status === 201, 'Teacher posts event within their assigned grade');
    if (teacherEventOwnGrade.data?.event?.id) {
      createdEventIds.push(teacherEventOwnGrade.data.event.id);
      notifiedEventIds.push(teacherEventOwnGrade.data.event.id);
    }
    assertPoster(
      teacherEventOwnGrade.data?.event,
      teacherUser,
      'POST event carries posted_by id and posted_by_name'
    );
    assert(
      teacherEventOwnGrade.data?.event?.event_date === ownGradeEventDate,
      `event_date round-trips exactly as sent (sent ${ownGradeEventDate}, got ${teacherEventOwnGrade.data?.event?.event_date})`
    );

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
      teacherEventWrongGrade.status === 403 && /not connected to Grade 3/.test(teacherEventWrongGrade.data?.message || ''),
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
    if (eventPastAllowed.data?.event?.id) {
      createdEventIds.push(eventPastAllowed.data.event.id);
      notifiedEventIds.push(eventPastAllowed.data.event.id);
    }

    const adminEventSchoolWide = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'School-wide assembly', event_date: daysAgo(1) },
    });
    assert(adminEventSchoolWide.status === 201, 'Admin posts school-wide event');
    if (adminEventSchoolWide.data?.event?.id) {
      createdEventIds.push(adminEventSchoolWide.data.event.id);
      notifiedEventIds.push(adminEventSchoolWide.data.event.id);
    }

    const adminEventG5 = await request('POST', '/api/events', {
      token: adminToken,
      body: { title: 'Grade 5 event', event_date: daysAgo(1), target_grade: 5 },
    });
    assert(adminEventG5.status === 201, 'Admin posts event for a grade the teacher does not teach');
    if (adminEventG5.data?.event?.id) {
      createdEventIds.push(adminEventG5.data.event.id);
      notifiedEventIds.push(adminEventG5.data.event.id);
    }

    // --- Events: read scoping ---
    console.log('\nEvents — read scoping:');

    const parentEvents = await request('GET', '/api/events', { token: parentToken });
    const parentEventIds = (parentEvents.data?.events || []).map((e) => e.id);
    assert(parentEventIds.includes(teacherEventOwnGrade.data.event.id), "Parent sees event targeting Marwin's grade");
    assert(parentEventIds.includes(adminEventSchoolWide.data.event.id), 'Parent sees school-wide event');
    assert(!parentEventIds.includes(adminEventG5.data.event.id), "Parent does not see Grade 5 event");
    const parentTeacherEvent = (parentEvents.data?.events || []).find(
      (e) => e.id === teacherEventOwnGrade.data.event.id
    );
    assertPoster(
      parentTeacherEvent,
      teacherUser,
      'GET events list row carries posted_by id and posted_by_name'
    );

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
    assertPoster(
      authorEventEdit.data?.event,
      teacherUser,
      'PUT event keeps posted_by id and posted_by_name'
    );
    // The actual regression this guards: PUT omits event_date entirely, so
    // the handler falls back to the existing row's value. Before the fix,
    // that fallback (toDateString(existing.event_date)) re-serialized a JS
    // Date via toISOString(), silently shifting the date back a day at
    // UTC+8 on every edit that didn't resend it — a teacher renaming an
    // event would unknowingly move it. Asserts the date survives an edit
    // untouched, not just that the edit "succeeded".
    assert(
      authorEventEdit.data?.event?.event_date === ownGradeEventDate,
      `event_date is unchanged after a PUT that omits it (still ${ownGradeEventDate}, got ${authorEventEdit.data?.event?.event_date})`
    );

    const adminDeletesEvent = await request('DELETE', `/api/events/${adminEventG5.data.event.id}`, {
      token: adminToken,
    });
    assert(adminDeletesEvent.status === 200, 'Admin deletes an event');
    // Deleted directly via the API — remove from the cleanup list so we don't
    // try to delete it again (harmless no-op either way, but keep it accurate).
    // Its NOTIFICATION rows are not removed by that DELETE (no FK), so the id
    // stays in `notifiedEventIds` — this splice is exactly how one event's
    // rows escaped the first run of the shared cleanup (#3a, 2026-09-25).
    const idx = createdEventIds.indexOf(adminEventG5.data.event.id);
    if (idx !== -1) createdEventIds.splice(idx, 1);
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

    await checkPage('/api/announcements', adminToken, 'announcements', { sort: 'created_at', field: 'created_at' });
    await checkPage('/api/announcements', parentToken, 'announcements', { sort: 'title', field: 'title' });
    await checkPage('/api/memos', parentToken, 'memos', { sort: 'created_at', field: 'created_at' });
    await checkPage('/api/events', teacherToken, 'events', { sort: 'event_date', field: 'event_date' });
    await checkPage('/api/events', parentToken, 'events', { sort: 'title', field: 'title' });
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
