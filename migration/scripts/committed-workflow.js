#!/usr/bin/env node
// THE COMMITTED WORKFLOW (Phase 3, commit 7 — the brief's section 4).
// rehearse.js proves the statements inside ONE transaction that is rolled
// back, so it never shows a write surviving COMMIT. This does: synthetic rows
// are written and COMMITTED on one connection, VERIFIED from a second, then
// DELETED BY ID and verified gone from the second again.
//
//   node scripts/committed-workflow.js
//
// What the second connection checks: nothing is visible before the writer's
// COMMIT and everything after it; every row reads back by its id with the
// API's types (DATE as the 'YYYY-MM-DD' string, numeric as a string,
// timestamptz as a Date, the 0/1 flags as numbers); the joins between them
// resolve; and after the deletes no id remains and no sequence moved back,
// so a deleted id is never handed out again.
//
// The disposable LOCAL target only (lib/env.js isDisposableLocal). Synthetic
// values only, never printed; real rows are read for one section, one
// subject and the school year. Prints counts and booleans. The report goes to
// <DATA_DIR>/rehearsal/committed_<stamp>.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { targetConfig, isDisposableLocal } = require('../lib/env');
const { client: connect } = require('../lib/pg');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');

const report = { checks: {} };
let failures = 0;
function check(name, ok) {
  if (!ok) failures += 1;
  report.checks[name] = ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

async function main() {
  const target = targetConfig(['node', 'x', '--target', 'local']);
  if (!isDisposableLocal(target)) throw new Error('The committed workflow runs on the disposable local cluster only.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const tag = crypto.randomBytes(4).toString('hex');
  const HASH = `$2b$10$${'c'.repeat(53)}`; // bcrypt-shaped, never a real hash
  const w = await connect(target.pg);
  const v = await connect(target.pg);
  const made = {};
  try {
    for (const c of [w, v]) await c.query('SET search_path TO portal, pg_catalog');
    const one = async (c, sql, params) => (await c.query(sql, params)).rows[0];
    const label = async (type) => (await one(w, `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'portal' AND t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [type])).l;

    const sec = await one(w, 'SELECT id, grade_level, name FROM sections ORDER BY id LIMIT 1');
    const subj = await one(w, 'SELECT id FROM subjects WHERE grade_level = $1 ORDER BY id LIMIT 1', [sec.grade_level]);
    const sy = (await one(w, "SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year'")).setting_value;
    const lrn = String(100000000000 + crypto.randomInt(1e9)).slice(0, 12);

    // --- the commit boundary: invisible before COMMIT, visible after -----
    await w.query('BEGIN');
    const probe = await one(w, "INSERT INTO events (title, event_date, posted_by) SELECT $1, '2027-01-01', id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1 RETURNING id", [`committed workflow ${tag}`]);
    const before = Number((await one(v, 'SELECT count(*)::bigint AS n FROM events WHERE id = $1', [probe.id])).n);
    await w.query('COMMIT');
    const after = Number((await one(v, 'SELECT count(*)::bigint AS n FROM events WHERE id = $1', [probe.id])).n);
    made.events = [probe.id];
    check('commit_boundary.invisible_to_a_second_connection_before_COMMIT', before === 0);
    check('commit_boundary.visible_to_it_after_COMMIT', after === 1);

    // --- the workflow, each step its own committed transaction ----------
    const tx = async (fn) => {
      await w.query('BEGIN');
      try {
        const r = await fn();
        await w.query('COMMIT');
        return r;
      } catch (e) {
        await w.query('ROLLBACK').catch(() => {});
        throw e;
      }
    };
    const teacher = await tx(() => one(w, "INSERT INTO users (login_id, password, role, status, name) VALUES ($1, $2, 'teacher', 'active', 'Committed Workflow Teacher') RETURNING id", [`zzcwt${tag}`, HASH]));
    const student = await tx(() => one(w, 'INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [lrn, 'Committed', 'Workflow', sec.grade_level, sec.name, sec.id, teacher.id]));
    const parent = await tx(() => one(w, "INSERT INTO users (login_id, password, role, status, name, student_id, created_by) VALUES ($1, $2, 'parent', 'active', 'Committed Workflow Parent', $3, $4) RETURNING id", [`zzcwp${tag}`, HASH, student.id, teacher.id]));
    made.users = [teacher.id, parent.id];
    made.students = [student.id];
    const assignment = await tx(() => one(w, 'INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section, section_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [teacher.id, subj.id, sec.grade_level, sec.name, sec.id]));
    made.teacher_assignments = [assignment.id];
    const attendance = await tx(() => one(w, "INSERT INTO attendance (student_id, date, status, recorded_by) VALUES ($1, '2026-12-31', 'Present', $2) RETURNING id", [student.id, teacher.id]));
    made.attendance = [attendance.id];
    const letter = await tx(() => one(w, "INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason) VALUES ($1, $2, '2026-12-30', 'committed workflow') RETURNING id", [student.id, parent.id]));
    made.excuse_letters = [letter.id];
    const event = await tx(() => one(w, "INSERT INTO events (title, event_date, posted_by) VALUES ($1, '2026-12-31', $2) RETURNING id", [`committed workflow ${tag}`, teacher.id]));
    made.events.push(event.id);
    const grade = await tx(() => one(w, 'INSERT INTO grades (student_id, subject_id, term, school_year) VALUES ($1, $2, 1, $3) RETURNING id', [student.id, subj.id, sy]));
    made.grades = [grade.id];
    const slot = await tx(() => one(w, "INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score) VALUES ($1, $2, $3, 1, $4, 'WW', 99, 20) RETURNING id", [subj.id, sec.grade_level, sec.name, sy]));
    made.assessment_slots = [slot.id];
    const component = await tx(() => one(w, "INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, date_recorded) VALUES ($1, $2, 'WW', 15, 20, '2027-01-04') RETURNING id", [grade.id, slot.id]));
    made.grade_components = [component.id];
    const notification = await tx(async () => one(w, 'INSERT INTO notifications (user_id, type, item_type, item_id, actor_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [parent.id, await label('notification_type'), await label('notification_item_type'), grade.id, teacher.id]));
    made.notifications = [notification.id];
    const message = await tx(() => one(w, "INSERT INTO messages (sender_id, receiver_id, body) VALUES ($1, $2, 'committed workflow') RETURNING id", [teacher.id, parent.id]));
    made.messages = [message.id];
    const acceptance = await tx(async () => one(w, "INSERT INTO policy_acceptances (user_id, document, version, student_id) VALUES ($1, $2, 'committed-workflow', $3) RETURNING id", [parent.id, await label('policy_document'), student.id]));
    made.policy_acceptances = [acceptance.id];
    const tables = Object.keys(made);
    const rows = tables.reduce((n, t) => n + made[t].length, 0);
    report.committed = { tables: tables.length, rows };
    console.log(`committed: ${rows} synthetic rows in ${tables.length} tables, one transaction each`);

    // --- verified from the second connection ----------------------------
    let visible = 0;
    for (const t of tables) visible += Number((await one(v, `SELECT count(*)::bigint AS n FROM ${t} WHERE id = ANY($1::int[])`, [made[t]])).n);
    check('second_connection.every_committed_row_is_visible_by_id', visible === rows);
    const a = await one(v, 'SELECT date, status, created_at FROM attendance WHERE id = $1', [attendance.id]);
    const ev = await one(v, 'SELECT event_date FROM events WHERE id = $1', [event.id]);
    const ex = await one(v, 'SELECT absence_date, status FROM excuse_letters WHERE id = $1', [letter.id]);
    const gc = await one(v, 'SELECT date_recorded, score, max_score FROM grade_components WHERE id = $1', [component.id]);
    const g = await one(v, 'SELECT is_locked, ww_percentage FROM grades WHERE id = $1', [grade.id]);
    const m = await one(v, 'SELECT read_status FROM messages WHERE id = $1', [message.id]);
    check('second_connection.dates_read_back_as_the_stored_strings', a.date === '2026-12-31' && ev.event_date === '2026-12-31' && ex.absence_date === '2026-12-30' && gc.date_recorded === '2027-01-04');
    check('second_connection.numeric_as_string_flags_as_numbers_timestamps_as_dates', gc.score === '15.00' && gc.max_score === '20.00' && g.is_locked === 0 && m.read_status === 0 && a.created_at instanceof Date && g.ww_percentage === null);
    check('second_connection.enum_values_read_as_text', a.status === 'Present' && ex.status === 'Pending');
    const joined = await one(
      v,
      `SELECT count(*)::int AS n FROM grade_components c JOIN grades gr ON gr.id = c.grade_id JOIN students s ON s.id = gr.student_id
         JOIN users p ON p.student_id = s.id AND p.role = 'parent' JOIN assessment_slots sl ON sl.id = c.slot_id WHERE c.id = $1`,
      [component.id]
    );
    check('second_connection.the_joins_between_the_committed_rows_resolve', joined.n === 1);
    const maxMade = Math.max(...Object.values(made).flat());
    const nextOf = async (t) => Number((await one(v, `SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS n FROM ${(await one(v, 'SELECT pg_get_serial_sequence($1, $2) AS s', [`portal.${t}`, 'id'])).s}`)).n);
    const seqBefore = {};
    for (const t of tables) seqBefore[t] = await nextOf(t);
    check('second_connection.every_sequence_is_past_its_new_ids', tables.every((t) => seqBefore[t] > Math.max(...made[t])) && maxMade > 0);

    // --- deleted by id, children first ------------------------------------
    const order = ['grade_components', 'assessment_slots', 'notifications', 'messages', 'policy_acceptances', 'grades', 'attendance', 'excuse_letters', 'teacher_assignments', 'events'];
    await tx(async () => {
      for (const t of order) for (const id of made[t]) await w.query(`DELETE FROM ${t} WHERE id = $1`, [id]);
      await w.query('DELETE FROM users WHERE id = $1', [parent.id]);
      await w.query('DELETE FROM students WHERE id = $1', [student.id]);
      await w.query('DELETE FROM users WHERE id = $1', [teacher.id]);
    });
    let left = 0;
    for (const t of tables) left += Number((await one(v, `SELECT count(*)::bigint AS n FROM ${t} WHERE id = ANY($1::int[])`, [made[t]])).n);
    check('deleted_by_id.no_row_remains_seen_from_the_second_connection', left === 0);
    const seqAfter = {};
    for (const t of tables) seqAfter[t] = await nextOf(t);
    check('deleted_by_id.no_sequence_moved_back_so_no_id_is_reused', tables.every((t) => seqAfter[t] === seqBefore[t]));
    report.deleted = rows;
  } finally {
    // A run that stopped half way still removes what it committed, by id.
    if (report.deleted === undefined) {
      const order = ['grade_components', 'assessment_slots', 'notifications', 'messages', 'policy_acceptances', 'grades', 'attendance', 'excuse_letters', 'teacher_assignments', 'events', 'users', 'students'];
      await w.query('ROLLBACK').catch(() => {});
      for (const t of order) {
        const ids = t === 'users' ? (made.users || []).slice().reverse() : made[t] || [];
        for (const id of ids) await w.query(`DELETE FROM ${t} WHERE id = $1`, [id]).catch(() => {});
      }
      if (made.users && made.users[0]) await w.query('DELETE FROM users WHERE id = $1', [made.users[0]]).catch(() => {});
      console.log('the run stopped early; what it committed was deleted by id');
    }
    await w.end();
    await v.end();
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const reportPath = path.join(P.REHEARSAL_DIR, `committed_${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, failures }, null, 2));
    console.log(`report: ${reportPath}`);
  }
  console.log(failures === 0 ? `COMMITTED WORKFLOW OK: ${Object.keys(report.checks).length} checks` : `COMMITTED WORKFLOW: ${failures} check(s) failed`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error('committed-workflow failed:', safeMessage(e));
  process.exit(1);
});
