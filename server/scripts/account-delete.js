// D-312 — DELETE ONE PARENT ACCOUNT AND ITS LEARNER, BY ID (the owner's PLAN
// APPROVED, 2026-11-07). docs/ACCOUNT_DELETE.md has the scope, the run sheet and
// the rollback.
//
//   npm run account:delete -- --user=<id> --student=<id>
//       a dry run: BEGIN READ ONLY. The pair, every reference count and a
//       paste-ready --expect=… line. Nothing is written.
//   npm run account:delete -- --user=<id> --student=<id> --expect=<line> --apply
//       ONE transaction. A difference from --expect, a refusal or a failed
//       check after the deletes rolls the whole run back.
//
// A non-loopback host also needs PORTAL_ACCOUNT_DELETE=production-account-delete
// in that one command. PORTAL_DEMO_HOSTED and PORTAL_ACTIVITY_RESET do not
// unlock it. Runs as portal_migrate (config/db.js settings('migrate')), the
// role that may delete, like the other one-off scripts.
//
// REFUSED BEFORE ANYTHING IS WRITTEN, in the dry run and the apply alike:
//   - either id is the protected browser-check family (learner 1037, parent 647);
//   - the user or the learner does not exist;
//   - the user is not a parent, or its student_id is not --student;
//   - the learner has any other linked account;
//   - either one carries a demo marker (the LRN prefix, the demo teacher
//     prefix): that is demo:undo's job, not this script's;
//   - any grade of the learner is locked;
//   - anything that blocks a delete (RESTRICT) points at the user;
//   - on --apply, any count differs from --expect.
//
// THE APPLY, in one transaction (SET LOCAL lock_timeout '15s', demo-load.js):
//   1. lock both rows (FOR UPDATE) and count again with the dry run's own query
//      text; any difference from --expect rolls back;
//   2. delete the notifications about the pair: by item (the user, its excuse
//      letters, the learner's grades), then by user_id — item_id has no foreign
//      key, so these would otherwise be orphaned;
//   3. delete the user (its acceptances and its letters cascade);
//   4. delete the learner (grades, components, attendance and acknowledgements
//      cascade);
//   5. insert ONE activity row, as the admin, code account_deleted_by_id, ids
//      and counts only — BEFORE the checks, so its +1 is checked (approved
//      change 4);
//   6. count again: every reference 0, every table changed by exactly its
//      expected count, activity_logs by +1; anything else rolls back;
//   7. COMMIT.
//
// ACTIVITY ROWS ABOUT THE ACCOUNT ARE KEPT. Their user_id is cleared by the
// foreign key (SET NULL), which the Activity log shows as "Deleted account".
//
// THIS SCRIPT PRINTS IDS, COUNTS, DATES, GRADE LEVELS AND SECTIONS. Never a name,
// a login id, an LRN, an email or a phone, and never activity_logs.description:
// the one statement that names that column is the INSERT. The demo markers are
// tested in SQL that returns booleans, so no LRN or login id is read into this
// process (LIKE takes COLLATE "und-x-icu": portal.ci is nondeterministic, and
// PostgreSQL refuses LIKE on it — as demo-undo.js does). reportFailure()
// (demo-load.js) is the only error path.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const demo = require('./demoData');
const { parseId } = require('../utils/validateId');
const { atStep, reportFailure, connectOwner, begin } = require('./demo-load');

const { Refusal } = demo;

// The same shape as demo.HOSTED_FLAG, and deliberately not the same key.
const HOSTED_FLAG = 'PORTAL_ACCOUNT_DELETE';
const HOSTED_VALUE = 'production-account-delete';

// Production's browser-check family (CLAUDE.md → Seeded baseline: the fixture
// learner and her parent), by id. This script never deletes them.
const PROTECTED_STUDENTS = Object.freeze([1037]);
const PROTECTED_USERS = Object.freeze([647]);

const ACTION = 'account_deleted_by_id';

// Rows that go with the pair, then rows that stay with the link cleared
// (SET NULL). The dry run prints both; --expect repeats every one, zeros
// included, in this order.
const DELETES = Object.freeze([
  'grades',
  'grade_components',
  'attendance',
  'excuse_letters',
  'grade_acknowledgements',
  'policy_acceptances',
  'notifications',
  'messages',
  'auth_codes',
  'teacher_assignments',
]);
const DETACHES = Object.freeze([
  'detached_users',
  'detached_students',
  'detached_sections',
  'detached_excuse_letters',
  'detached_activity_logs',
  'detached_notifications',
  'detached_grade_acknowledgements',
  'detached_policy_acceptances',
]);
const EXPECT_KEYS = Object.freeze([...DELETES, ...DETACHES]);

const ID_SHAPE = /^[1-9]\d{0,9}$/;
const EXPECT_PART = /^([a-z_]+):(0|[1-9]\d{0,6})$/;

// ---------------------------------------------------------------------------
// arguments and the guard (pure, so the proof calls them with values)
// ---------------------------------------------------------------------------

function idFrom(value, flag) {
  const id = ID_SHAPE.test(String(value || '')) ? parseId(value) : null;
  if (id === null) throw new Refusal(`${flag} must be a whole number from 1 to 2147483647.`);
  return id;
}

function refuseProtected(userId, studentId) {
  if (PROTECTED_USERS.includes(userId) || PROTECTED_STUDENTS.includes(studentId)) {
    throw new Refusal('That is the protected browser-check family (learner 1037, parent 647). It is never deleted.');
  }
}

function parseExpect(text) {
  const parts = String(text || '').split(',');
  const out = {};
  for (const part of parts) {
    const match = EXPECT_PART.exec(part);
    if (!match) throw new Refusal('--expect is not the line the dry run printed (key:count, comma-separated).');
    const [, key, count] = match;
    if (!EXPECT_KEYS.includes(key)) throw new Refusal(`--expect names a key this script does not count: ${key}.`);
    if (key in out) throw new Refusal(`--expect names ${key} twice.`);
    out[key] = Number(count);
  }
  const missing = EXPECT_KEYS.filter((key) => !(key in out));
  if (missing.length) throw new Refusal(`--expect is missing ${missing.join(', ')}.`);
  return Object.fromEntries(EXPECT_KEYS.map((key) => [key, out[key]]));
}

function formatExpect(refs) {
  return EXPECT_KEYS.map((key) => `${key}:${refs[key]}`).join(',');
}

// An unknown argument is refused WITHOUT being echoed: a mistyped value could be
// an LRN.
function parseArgs(argv) {
  const seen = { user: null, student: null, expect: null, apply: false };
  const once = (key, value) => {
    if (seen[key] !== null) throw new Refusal(`--${key} is given twice.`);
    seen[key] = value;
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      if (seen.apply) throw new Refusal('--apply is given twice.');
      seen.apply = true;
    } else if (arg.startsWith('--user=')) once('user', arg.slice('--user='.length));
    else if (arg.startsWith('--student=')) once('student', arg.slice('--student='.length));
    else if (arg.startsWith('--expect=')) once('expect', arg.slice('--expect='.length));
    else throw new Refusal('Unknown argument. Use --user=<id> --student=<id>, then add --expect=<line> --apply.');
  }
  const user = idFrom(seen.user, '--user');
  const student = idFrom(seen.student, '--student');
  if (seen.expect !== null && !seen.apply) throw new Refusal('--expect is only for --apply. Run the dry run first, without either.');
  if (seen.apply && seen.expect === null) throw new Refusal('--apply needs the --expect=… line the dry run printed.');
  refuseProtected(user, student);
  return { user, student, apply: seen.apply, expect: seen.apply ? parseExpect(seen.expect) : null };
}

// Reading is allowed anywhere; a dry run is a READ ONLY transaction. Deleting on
// anything but a loopback host needs the exact flag, in that command alone.
function assertTarget({ host, apply, flag }) {
  if (!apply || demo.LOOPBACK.has(host)) return;
  if (flag !== HOSTED_VALUE) {
    throw new Refusal(`Deleting on a hosted database needs ${HOSTED_FLAG}=${HOSTED_VALUE} in this one command.`);
  }
}

function ownerSettings(apply) {
  const settings = { ...db.settings('migrate'), application_name: 'account-delete' };
  assertTarget({ host: settings.host, apply, flag: process.env[HOSTED_FLAG] });
  if (!settings.password) throw new Refusal('PG_MIGRATE_PASSWORD is not set.');
  return settings;
}

// ---------------------------------------------------------------------------
// reading: one text for the dry run, the apply and the checks after
// ---------------------------------------------------------------------------

async function tableNames(conn) {
  const { rows } = await conn.query(
    `SELECT c.relname AS name FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'portal' AND c.relkind = 'r'
      ORDER BY c.relname`
  );
  return rows.map((row) => row.name).filter((name) => /^[a-z_]+$/.test(name));
}

async function tableCounts(conn, tables) {
  const counts = {};
  for (const table of tables) {
    const { rows } = await conn.query(`SELECT COUNT(*)::bigint AS n FROM portal.${table}`);
    counts[table] = Number(rows[0].n);
  }
  return counts;
}

async function countOf(conn, sql, params) {
  const { rows } = await conn.query(sql, params);
  return Number(rows[0].n);
}

async function idsOf(conn, sql, params) {
  const { rows } = await conn.query(sql, params);
  return rows.map((row) => Number(row.id));
}

async function readFacts(conn, userId, studentId) {
  const { rows: users } = await conn.query(
    `SELECT u.id, u.role, u.status, u.student_id,
            to_char(u.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS created_on,
            (u.login_id COLLATE "und-x-icu" LIKE ? OR u.login_id COLLATE "und-x-icu" LIKE ?) AS demo_marker
       FROM users u WHERE u.id = ?`,
    [`${demo.LRN_PREFIX}%`, `${demo.TEACHER_PREFIX}%`, userId]
  );
  const { rows: students } = await conn.query(
    `SELECT s.id, s.grade_level, s.section, s.status, (s.lrn COLLATE "und-x-icu" LIKE ?) AS demo_marker
       FROM students s WHERE s.id = ?`,
    [`${demo.LRN_PREFIX}%`, studentId]
  );
  const { rows: restrict } = await conn.query(
    `SELECT (SELECT COUNT(*) FROM attendance WHERE recorded_by = ?)::int AS attendance_recorded_by,
            (SELECT COUNT(*) FROM announcements WHERE posted_by = ?)::int AS announcements_posted_by,
            (SELECT COUNT(*) FROM memos WHERE posted_by = ?)::int AS memos_posted_by,
            (SELECT COUNT(*) FROM events WHERE posted_by = ?)::int AS events_posted_by,
            (SELECT COUNT(*) FROM backups WHERE created_by = ?)::int AS backups_created_by`,
    [userId, userId, userId, userId, userId]
  );
  return {
    user: users[0] || null,
    student: students[0] || null,
    linked: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM users WHERE student_id = ?', [studentId]),
    lockedGrades: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM grades WHERE student_id = ? AND is_locked = 1', [studentId]),
    restrict: restrict[0],
  };
}

function refusalsFor(facts, userId, studentId) {
  const out = [];
  const { user, student } = facts;
  if (!user) out.push(`user ${userId} does not exist`);
  if (!student) out.push(`learner ${studentId} does not exist`);
  if (user && user.role !== 'parent') out.push(`user ${userId} is a ${user.role} account, not a parent`);
  if (user && student && Number(user.student_id) !== Number(student.id)) out.push(`user ${userId} is not linked to learner ${studentId}`);
  if (student && facts.linked !== 1) out.push(`learner ${studentId} has ${facts.linked} linked accounts; exactly 1 is allowed`);
  if ((user && user.demo_marker) || (student && student.demo_marker)) out.push('a demo marker is on the pair (that is demo:undo, not this script)');
  if (facts.lockedGrades > 0) out.push(`${facts.lockedGrades} of the learner's grades are locked`);
  const blocking = Object.entries(facts.restrict).filter(([, n]) => Number(n) > 0);
  if (blocking.length) out.push(`rows that block a delete point at the user: ${blocking.map(([key, n]) => `${key} ${n}`).join(', ')}`);
  return out;
}

// The notifications about the pair: addressed to the user, or about the user
// (a parent approval), its letters or the learner's grades.
const ABOUT_THE_PAIR = `(user_id = ? OR (item_type = 'user' AND item_id = ?)
   OR (item_type = 'excuse_letter' AND item_id = ANY(?::int[]))
   OR (item_type = 'grade' AND item_id = ANY(?::int[])))`;

async function readReferences(conn, userId, studentId) {
  const gradeIds = await idsOf(conn, 'SELECT id FROM grades WHERE student_id = ? ORDER BY id', [studentId]);
  const letterIds = await idsOf(conn, 'SELECT id FROM excuse_letters WHERE student_id = ? OR parent_id = ? ORDER BY id', [studentId, userId]);
  const attendanceIds = await idsOf(conn, 'SELECT id FROM attendance WHERE student_id = ? ORDER BY id', [studentId]);
  const about = [userId, userId, letterIds, gradeIds];
  const refs = {
    grades: gradeIds.length,
    grade_components: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM grade_components WHERE grade_id = ANY(?::int[])', [gradeIds]),
    attendance: attendanceIds.length,
    excuse_letters: letterIds.length,
    grade_acknowledgements: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM grade_acknowledgements WHERE student_id = ?', [studentId]),
    policy_acceptances: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM policy_acceptances WHERE user_id = ?', [userId]),
    notifications: await countOf(conn, `SELECT COUNT(*)::int AS n FROM notifications WHERE ${ABOUT_THE_PAIR}`, about),
    messages: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]),
    auth_codes: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM auth_codes WHERE user_id = ?', [userId]),
    teacher_assignments: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM teacher_assignments WHERE teacher_id = ?', [userId]),
    detached_users: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM users WHERE id <> ? AND (created_by = ? OR approved_by = ?)', [userId, userId, userId]),
    detached_students: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM students WHERE id <> ? AND created_by = ?', [studentId, userId]),
    detached_sections: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM sections WHERE adviser_id = ?', [userId]),
    detached_excuse_letters: await countOf(
      conn,
      'SELECT COUNT(*)::int AS n FROM excuse_letters WHERE reviewed_by = ? AND student_id <> ? AND parent_id <> ?',
      [userId, studentId, userId]
    ),
    detached_activity_logs: await countOf(conn, 'SELECT COUNT(*)::int AS n FROM activity_logs WHERE user_id = ?', [userId]),
    detached_notifications: await countOf(conn, `SELECT COUNT(*)::int AS n FROM notifications WHERE actor_id = ? AND NOT ${ABOUT_THE_PAIR}`, [
      userId,
      ...about,
    ]),
    detached_grade_acknowledgements: await countOf(
      conn,
      'SELECT COUNT(*)::int AS n FROM grade_acknowledgements WHERE user_id = ? AND student_id <> ?',
      [userId, studentId]
    ),
    detached_policy_acceptances: await countOf(
      conn,
      'SELECT COUNT(*)::int AS n FROM policy_acceptances WHERE student_id = ? AND user_id <> ?',
      [studentId, userId]
    ),
  };
  return { userId, studentId, refs, gradeIds, letterIds, attendanceIds };
}

// How many of the learner's grades and attendance days the demo load's manifest
// lists as `added` (demo:undo will find that many fewer). Counts only; the
// manifest's other entries are never read out.
async function manifestOverlap(conn, plan) {
  const { rows } = await conn.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [demo.MANIFEST_KEY]);
  if (!rows.length) return null;
  let added = {};
  try {
    added = JSON.parse(rows[0].setting_value).added || {};
  } catch {
    return null;
  }
  const inList = (list, ids) => {
    const set = new Set((Array.isArray(list) ? list : []).map(Number));
    return ids.filter((id) => set.has(id)).length;
  };
  return { grades: inList(added.grades, plan.gradeIds), attendance: inList(added.attendance, plan.attendanceIds) };
}

function expectedChanges(refs) {
  return {
    users: -1,
    students: -1,
    grades: -refs.grades,
    grade_components: -refs.grade_components,
    attendance: -refs.attendance,
    excuse_letters: -refs.excuse_letters,
    grade_acknowledgements: -refs.grade_acknowledgements,
    policy_acceptances: -refs.policy_acceptances,
    notifications: -refs.notifications,
    messages: -refs.messages,
    auth_codes: -refs.auth_codes,
    teacher_assignments: -refs.teacher_assignments,
    activity_logs: 1,
  };
}

// ---------------------------------------------------------------------------
// printing: ids, counts, dates, grade levels and sections
// ---------------------------------------------------------------------------

function printFacts(facts, userId, studentId) {
  const { user, student } = facts;
  console.log(
    user
      ? `The account: user ${user.id}, ${user.role}, ${user.status}, created ${user.created_on}, demo marker ${user.demo_marker ? 'YES' : 'no'}.`
      : `The account: user ${userId} not found.`
  );
  console.log(
    student
      ? `The learner: ${student.id}, Grade ${student.grade_level} – ${student.section}, ${student.status}, linked accounts ${facts.linked}, demo marker ${student.demo_marker ? 'YES' : 'no'}, locked grades ${facts.lockedGrades}.`
      : `The learner: ${studentId} not found.`
  );
  const blocking = Object.entries(facts.restrict).map(([key, n]) => `${key} ${n}`);
  console.log(`Rows that block a delete (RESTRICT): ${blocking.join(', ')}.`);
}

function printReferences(refs) {
  console.log('Deleted with the pair:');
  for (const key of DELETES) console.log(`  ${key.padEnd(34)}${String(refs[key]).padStart(7)}`);
  console.log('Kept, their link cleared (SET NULL):');
  for (const key of DETACHES) console.log(`  ${key.padEnd(34)}${String(refs[key]).padStart(7)}`);
}

function printCounts(tables, before, after) {
  console.log('Table counts, before → after:');
  for (const table of tables) {
    const change = after[table] - before[table];
    const mark = change === 0 ? '' : `  (${change > 0 ? '+' : ''}${change})`;
    console.log(`  ${table.padEnd(26)}${String(before[table]).padStart(7)} → ${after[table]}${mark}`);
  }
}

// ---------------------------------------------------------------------------
// the apply
// ---------------------------------------------------------------------------

function checkExpect(refs, expect) {
  const differ = EXPECT_KEYS.filter((key) => refs[key] !== expect[key]);
  if (differ.length) {
    throw new Refusal(
      `Rolled back, nothing written: the counts now differ from --expect: ${differ
        .map((key) => `${key} ${refs[key]} (expected ${expect[key]})`)
        .join(', ')}.`
    );
  }
}

async function deleteNotifications(conn, plan) {
  atStep('delete the notifications about the pair');
  const byItem = await conn.query(
    `DELETE FROM notifications
      WHERE (item_type = 'user' AND item_id = ?)
         OR (item_type = 'excuse_letter' AND item_id = ANY(?::int[]))
         OR (item_type = 'grade' AND item_id = ANY(?::int[]))`,
    [plan.userId, plan.letterIds, plan.gradeIds]
  );
  const byUser = await conn.query('DELETE FROM notifications WHERE user_id = ?', [plan.userId]);
  return { byItem: byItem.rowCount, byUser: byUser.rowCount };
}

async function deletePair(conn, plan) {
  atStep('delete the account');
  const user = await conn.query("DELETE FROM users WHERE id = ? AND role = 'parent' AND student_id = ?", [plan.userId, plan.studentId]);
  if (user.rowCount !== 1) throw new Refusal(`Rolled back, nothing written: deleting user ${plan.userId} touched ${user.rowCount} rows, not 1.`);
  atStep('delete the learner');
  const student = await conn.query('DELETE FROM students WHERE id = ?', [plan.studentId]);
  if (student.rowCount !== 1) throw new Refusal(`Rolled back, nothing written: deleting learner ${plan.studentId} touched ${student.rowCount} rows, not 1.`);
}

async function insertActivity(conn, plan) {
  atStep('the activity row');
  const { rows } = await conn.query("SELECT id FROM users WHERE login_id = ? AND role = 'admin'", [demo.ADMIN_LOGIN]);
  const r = plan.refs;
  await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
    rows[0] ? rows[0].id : null,
    ACTION,
    `Deleted parent account ${plan.userId} and learner ${plan.studentId} by id (D-312): grades ${r.grades}, grade components ${r.grade_components}, attendance ${r.attendance}, excuse letters ${r.excuse_letters}, notifications ${r.notifications}, policy acceptances ${r.policy_acceptances}.`,
  ]);
}

async function verifyAfter(conn, plan, tables, countsBefore, gone) {
  atStep('the checks after the deletes');
  const problems = [];
  if (gone.byItem + gone.byUser !== plan.refs.notifications) {
    problems.push(`notifications deleted ${gone.byItem + gone.byUser}, counted ${plan.refs.notifications}`);
  }
  // With the dry run's ids, not today's: the rows are gone, and an orphan would
  // still carry the old item_id.
  const orphans = await countOf(conn, `SELECT COUNT(*)::int AS n FROM notifications WHERE ${ABOUT_THE_PAIR}`, [
    plan.userId,
    plan.userId,
    plan.letterIds,
    plan.gradeIds,
  ]);
  if (orphans !== 0) problems.push(`notifications about the pair left: ${orphans}`);
  const left = (await readReferences(conn, plan.userId, plan.studentId)).refs;
  const nonzero = EXPECT_KEYS.filter((key) => left[key] !== 0);
  if (nonzero.length) problems.push(`references left: ${nonzero.map((key) => `${key} ${left[key]}`).join(', ')}`);
  const stillThere =
    (await countOf(conn, 'SELECT COUNT(*)::int AS n FROM users WHERE id = ?', [plan.userId])) +
    (await countOf(conn, 'SELECT COUNT(*)::int AS n FROM students WHERE id = ?', [plan.studentId]));
  if (stillThere !== 0) problems.push('the account or the learner is still there');
  const countsAfter = await tableCounts(conn, tables);
  const want = expectedChanges(plan.refs);
  for (const table of tables) {
    const change = countsAfter[table] - countsBefore[table];
    const expected = want[table] || 0;
    if (change !== expected) problems.push(`${table} changed by ${change}, expected ${expected}`);
  }
  if (problems.length) throw new Refusal(`Rolled back, nothing written: ${problems.join('; ')}.`);
  return countsAfter;
}

async function main() {
  const { user, student, apply, expect } = parseArgs(process.argv.slice(2));
  const settings = ownerSettings(apply);
  console.log(`Target: ${demo.LOOPBACK.has(settings.host) ? 'the loopback database' : 'a HOSTED database'}.`);
  console.log(`User ${user}, learner ${student}.`);

  atStep('connect');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN (one transaction)' : 'BEGIN READ ONLY');

    if (apply) {
      atStep('lock the pair');
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user]);
      await conn.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [student]);
    }

    atStep('read');
    const tables = await tableNames(conn);
    const countsBefore = await tableCounts(conn, tables);
    const facts = await readFacts(conn, user, student);
    printFacts(facts, user, student);
    const refusals = refusalsFor(facts, user, student);
    if (refusals.length) throw new Refusal(`Refused, nothing written: ${refusals.join('; ')}.`);

    const plan = await readReferences(conn, user, student);
    printReferences(plan.refs);
    const overlap = await manifestOverlap(conn, plan);
    console.log(
      overlap
        ? `In the demo manifest's added rows: grades ${overlap.grades} of ${plan.refs.grades}, attendance ${overlap.attendance} of ${plan.refs.attendance}.`
        : 'No demo manifest on this database.'
    );

    if (!apply) {
      console.log(`The apply line: --expect=${formatExpect(plan.refs)}`);
      await conn.query('ROLLBACK');
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    checkExpect(plan.refs, expect);
    const gone = await deleteNotifications(conn, plan);
    await deletePair(conn, plan);
    await insertActivity(conn, plan);
    const countsAfter = await verifyAfter(conn, plan, tables, countsBefore, gone);

    atStep('commit');
    await conn.query('COMMIT');
    printCounts(tables, countsBefore, countsAfter);
    console.log(`Notifications deleted: ${gone.byItem} by item, ${gone.byUser} by user.`);
    console.log('Committed.');
  } catch (error) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      // the connection is closed below either way, and that rolls back too
    }
    throw error;
  } finally {
    await client.end();
  }
}

function run() {
  return main()
    .catch(reportFailure)
    .finally(() => db.end());
}

if (require.main === module) run();

// The gate's negative controls compile a changed copy of this file in memory.
module.exports = {
  HOSTED_FLAG,
  HOSTED_VALUE,
  PROTECTED_STUDENTS,
  PROTECTED_USERS,
  ACTION,
  DELETES,
  DETACHES,
  EXPECT_KEYS,
  assertTarget,
  parseArgs,
  parseExpect,
  formatExpect,
  refuseProtected,
  refusalsFor,
  expectedChanges,
  run,
};
