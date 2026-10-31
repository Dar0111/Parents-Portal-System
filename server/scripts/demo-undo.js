// MODULE 12 (2026-10-31) — TAKING THE DEMO DATA BACK OUT, before a pilot with
// real records. Same owner connection, same guard as scripts/demo-load.js.
//
//   npm run demo:undo                 a preview: BEGIN READ ONLY, counts only
//   npm run demo:undo -- --apply      ONE transaction
//
// THE MARKER HAS THREE PARTS, and no id in here was typed by a person: the LRN
// prefix (learners and their parents), the DEMO-TCH- prefix (teachers), and the
// manifest row the load wrote, which holds the ids that have no identity of
// their own — the slots, the kept teachers' and kept learners' added rows — and
// the values to put back. No manifest, no undo.
//
// ORDER MATTERS, because of the RESTRICT foreign keys: a demo teacher's post
// (posted_by) and a slot still holding a component (slot_id) would each stop
// the transaction. Everything else goes by cascade once the accounts do.
//
// Sequences are never set back. A later row simply takes the next id.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../config/db');
const demo = require('./demoData');
const { COUNT_TABLES, atStep, reportFailure, ownerSettings, connectOwner, begin, tableCounts, printCounts } = require('./demo-load');

const { Refusal } = demo;

const POSTS = Object.freeze([
  ['announcements', 'announcement'],
  ['memos', 'memo'],
  ['events', 'event'],
]);

async function idsOf(conn, sql, params) {
  return (await conn.query(sql, params)).rows.map((row) => row.id);
}

async function readTargets(conn) {
  const { rows } = await conn.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [demo.MANIFEST_KEY]);
  if (!rows.length) throw new Refusal('There is no manifest: the demo data is not loaded, or it was already undone.');
  return {
    manifest: JSON.parse(rows[0].setting_value),
    students: await idsOf(conn, 'SELECT id FROM students WHERE lrn COLLATE "und-x-icu" LIKE ?', [`${demo.LRN_PREFIX}%`]),
    parents: await idsOf(conn, `SELECT id FROM users WHERE role = 'parent' AND login_id COLLATE "und-x-icu" LIKE ?`, [`${demo.LRN_PREFIX}%`]),
    teachers: await idsOf(conn, `SELECT id FROM users WHERE role = 'teacher' AND login_id COLLATE "und-x-icu" LIKE ?`, [`${demo.TEACHER_PREFIX}%`]),
  };
}

async function writeUndo(conn, { manifest, students, parents, teachers }) {
  const { added } = manifest;

  // ---- posts by demo teachers, with their notifications ----
  atStep('posts');
  for (const [table, itemType] of POSTS) {
    await conn.query(
      `DELETE FROM notifications
        WHERE item_type = ?::portal.notification_item_type
          AND item_id IN (SELECT id FROM ${table} WHERE posted_by = ANY(?::int[]))`,
      [itemType, teachers]
    );
    await conn.query(`DELETE FROM ${table} WHERE posted_by = ANY(?::int[])`, [teachers]);
  }

  // ---- notifications whose item is about to go; item_id has no foreign key ----
  atStep('notifications');
  await conn.query(
    `DELETE FROM notifications
      WHERE item_type = 'excuse_letter'
        AND item_id IN (SELECT id FROM excuse_letters WHERE student_id = ANY(?::int[]))`,
    [students]
  );
  await conn.query(
    `DELETE FROM notifications
      WHERE item_type = 'grade'
        AND item_id IN (SELECT id FROM grades WHERE student_id = ANY(?::int[]) OR id = ANY(?::int[]))`,
    [students, added.grades]
  );
  await conn.query(`DELETE FROM notifications WHERE item_type = 'user' AND item_id = ANY(?::int[])`, [parents]);

  // ---- kept learners' added rows, then anything still on a demo slot ----
  atStep('kept learners');
  await conn.query('DELETE FROM grades WHERE id = ANY(?::int[])', [added.grades]);
  await conn.query('DELETE FROM attendance WHERE id = ANY(?::int[])', [added.attendance]);
  await conn.query('DELETE FROM grade_components WHERE slot_id = ANY(?::int[])', [added.slots]);

  // ---- accounts and learners ----
  atStep('parents and learners');
  await conn.query('DELETE FROM users WHERE id = ANY(?::int[])', [parents]);
  await conn.query('DELETE FROM students WHERE id = ANY(?::int[])', [students]);

  atStep('slots and assignments');
  await conn.query('DELETE FROM assessment_slots WHERE id = ANY(?::int[])', [added.slots]);
  await conn.query('DELETE FROM teacher_assignments WHERE id = ANY(?::int[])', [added.assignments]);

  // attendance.recorded_by is RESTRICT: a mark a demo adviser made on a kept
  // learner during a demo is the last thing holding the account.
  atStep('teachers');
  await conn.query('DELETE FROM attendance WHERE recorded_by = ANY(?::int[])', [teachers]);
  await conn.query('DELETE FROM users WHERE id = ANY(?::int[])', [teachers]);

  // ---- what the load changed on rows that stay ----
  atStep('putting values back');
  await conn.query(
    `UPDATE sections s SET adviser_id = u.adviser_id
       FROM unnest(?::int[], ?::int[]) AS u(section_id, adviser_id)
      WHERE s.id = u.section_id`,
    [manifest.advisers.map((row) => row.section_id), manifest.advisers.map((row) => row.adviser_id)]
  );
  for (const row of manifest.contacts) {
    // Only while it still holds what the load set: someone may have changed it.
    await conn.query('UPDATE users SET email = ?, email_verified_at = ?::timestamptz WHERE id = ? AND email = ?', [
      row.email_before,
      row.verified_before,
      row.id,
      row.email_set,
    ]);
  }
  for (const row of manifest.learners) {
    await conn.query('UPDATE students SET first_name = ?, last_name = ? WHERE id = ?', [row.first_name, row.last_name, row.id]);
  }
  for (const row of manifest.guardians) {
    await conn.query('UPDATE users SET name = ? WHERE id = ?', [row.name, row.id]);
  }

  atStep('manifest');
  await conn.query('DELETE FROM system_settings WHERE setting_key = ?', [demo.MANIFEST_KEY]);
  const { rows } = await conn.query('SELECT id FROM users WHERE login_id = ? LIMIT 1', [demo.ADMIN_LOGIN]);
  await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
    rows[0] ? rows[0].id : null,
    'demo_data_undo',
    `Demo data removed: ${teachers.length} teachers, ${students.length} learners, ${parents.length} parents.`,
  ]);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const settings = ownerSettings(apply);

  atStep('connecting');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN: one transaction, rollback on any error.' : 'BEGIN READ ONLY: a preview, nothing can be written.');

    atStep('reading');
    const before = await tableCounts(conn);
    const targets = await readTargets(conn);
    console.log(`Marked: ${targets.teachers.length} teachers, ${targets.students.length} learners, ${targets.parents.length} parents.`);
    console.log(
      `From the manifest: ${targets.manifest.added.slots.length} slots, ${targets.manifest.added.assignments.length} assignments on kept teachers, ` +
        `${targets.manifest.added.grades.length} grades and ${targets.manifest.added.attendance.length} attendance rows on kept learners.`
    );
    console.log(
      `To put back: ${targets.manifest.advisers.length} advisers, ${targets.manifest.contacts.length} contacts, ` +
        `${targets.manifest.learners.length + targets.manifest.guardians.length} names.`
    );

    if (!apply) {
      await conn.query('ROLLBACK');
      printCounts('Table counts now:', before);
      console.log('Preview complete. Nothing was written.');
      return;
    }

    await writeUndo(conn, targets);
    atStep('commit');
    await conn.query('COMMIT');

    atStep('counting');
    await conn.query('SET search_path TO portal, pg_catalog');
    const after = await tableCounts(conn);
    printCounts('Table counts, before -> after:', before, after);
    // activity_logs is left out: the load and this undo each add their own row,
    // and an audit trail is not rewound.
    const beforeLoad = targets.manifest.before;
    const differ = COUNT_TABLES.filter((table) => table !== 'activity_logs' && after[table] !== beforeLoad[table]);
    console.log(differ.length ? `Different from before the load: ${differ.join(', ')}.` : 'Every count equals the count before the load.');
    console.log('Undo committed.');
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

if (require.main === module) {
  main()
    .catch(reportFailure)
    .finally(() => db.end());
}
