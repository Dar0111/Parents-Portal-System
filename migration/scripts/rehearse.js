#!/usr/bin/env node
// Workflow rehearsal on the MIGRATED local copy: the server's key statements
// in their PostgreSQL form (the port inventory's rows), run inside ONE
// transaction that is ROLLED BACK, on synthetic rows this script inserts
// itself. Real rows are only read for counts and types; no value from a real
// row is printed. This is the evidence for docs/05_VALIDATION_MATRIX.md rows
// marked "rehearsed (SQL)". It is NOT the HTTP suite run — that needs the
// application port (docs/03_QUERY_PORT_INVENTORY.md).
//
//   node scripts/rehearse.js [--target local]
const fs = require('fs');
const path = require('path');
const { targetConfig } = require('../lib/env');
const { pool } = require('../lib/pg');
const { safeMessage } = require('../lib/safeMessage');
const P = require('../lib/paths');

const report = { cases: {} };
let failures = 0;
function check(name, value, expect) {
  const ok = JSON.stringify(value) === JSON.stringify(expect);
  if (!ok) failures += 1;
  report.cases[name] = { value, expect, ok };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}${ok ? '' : ` (expected ${JSON.stringify(expect)})`}`);
}
function info(name, value) {
  report.cases[name] = { value };
  console.log(`INFO ${name} = ${JSON.stringify(value)}`);
}
async function tryq(c, sql, params) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows, rowCount: r.rowCount }; } catch (e) { return { ok: false, code: e.code }; }
}
// A statement that is EXPECTED to fail, inside the one transaction: its own
// savepoint, rolled back on error so the transaction stays usable. (pg
// refuses "SAVEPOINT x; INSERT … $1" as one parameterised query — 42601.)
async function attempt(c, name, sql, params) {
  await c.query(`SAVEPOINT ${name}`);
  const r = await tryq(c, sql, params);
  await c.query(r.ok ? `RELEASE SAVEPOINT ${name}` : `ROLLBACK TO SAVEPOINT ${name}`);
  return r;
}
const jsonTypes = (row) => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(row))).map(([k, v]) => [k, v === null ? 'null' : typeof v]));

async function main() {
  const target = targetConfig();
  const p = pool(target.pg);
  const c = await p.connect();
  const HASH = '$2a$10$' + 'x'.repeat(53); // bcrypt-shaped, never a real hash
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL TIME ZONE 'UTC'");
    await c.query('SET LOCAL search_path = portal, pg_catalog');

    // --- fixtures (synthetic, rolled back) --------------------------------
    const sec = (await c.query('SELECT id, grade_level, name, school_year FROM sections ORDER BY id LIMIT 1')).rows[0];
    const subj = (await c.query('SELECT id FROM subjects WHERE grade_level = $1 ORDER BY display_order IS NULL, display_order, name LIMIT 1', [sec.grade_level])).rows[0];
    const sy = (await c.query("SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year'")).rows[0].setting_value;
    const admin = (await c.query(`INSERT INTO users (login_id, password, role, status, name, email, email_verified_at)
      VALUES ('ZZ-REHEARSE-ADMIN', $1, 'admin', 'active', 'Rehearsal Admin', 'rehearsal@example.invalid', portal.now_s()) RETURNING id, token_version, must_change_password, created_at`, [HASH])).rows[0];
    const teacher = (await c.query(`INSERT INTO users (login_id, password, role, status, name, must_change_password, created_by)
      VALUES ('ZZ-REHEARSE-TCH', $1, 'teacher', 'active', 'Rehearsal Teacher', 1, $2) RETURNING id`, [HASH, admin.id])).rows[0];
    const student = (await c.query(`INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by)
      VALUES ('ZZREHEARSE01', 'Niño', 'Rehearsal', $1, $2, $3, $4) RETURNING id, created_at, updated_at`, [sec.grade_level, sec.name, sec.id, teacher.id])).rows[0];
    const parent = (await c.query(`INSERT INTO users (login_id, password, role, status, name, student_id, created_by)
      VALUES ('ZZREHEARSE01', $1, 'parent', 'pending', 'Rehearsal Parent', $2, $3) RETURNING id`, [HASH, student.id, teacher.id])).rows[0];
    await c.query('UPDATE sections SET adviser_id = $1 WHERE id = $2', [teacher.id, sec.id]);
    await c.query('INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section, section_id) VALUES ($1, $2, $3, $4, $5)', [teacher.id, subj.id, sec.grade_level, sec.name, sec.id]);

    // 1. sign-in lookup, case-insensitive on login_id (portal.ci)
    const signin = async (id) => (await c.query(`SELECT u.*, s.first_name AS student_first_name, s.last_name AS student_last_name, s.grade_level, s.section
      FROM users u LEFT JOIN students s ON s.id = u.student_id WHERE u.login_id = $1 LIMIT 1`, [id])).rowCount;
    check('signin.exact_login_id_matches', await signin('ZZ-REHEARSE-ADMIN'), 1);
    check('signin.lowercase_login_id_matches', await signin('zz-rehearse-admin'), 1);
    check('signin.trailing_space_login_id_does_not_match_(MySQL_PAD_SPACE_would)', await signin('ZZ-REHEARSE-ADMIN '), 0);
    check('signin.parent_login_is_the_lrn_and_joins_student', (await c.query(`SELECT s.first_name IS NOT NULL AS joined FROM users u LEFT JOIN students s ON s.id = u.student_id WHERE u.login_id = $1`, ['zzrehearse01'])).rows[0].joined, true);

    // 2. middleware read with the policy subquery and the gates' fields
    const docs = ['privacy_notice', 'draft-1', 'terms_of_use', 'draft-1'];
    const me = (await c.query(`SELECT id, login_id, role, status, name, email, contact_number, profile_pic, student_id,
        email_verified_at, contact_verified_at, password_changed_at, token_version, must_change_password,
        (SELECT COUNT(*) FROM policy_acceptances pa WHERE pa.user_id = users.id AND ((pa.document = $1 AND pa.version = $2) OR (pa.document = $3 AND pa.version = $4))) AS policy_accepted
      FROM users WHERE id = $5 LIMIT 1`, [...docs, admin.id])).rows[0];
    check('middleware.policy_accepted_is_number', [typeof me.policy_accepted, me.policy_accepted], ['number', 0]);
    check('middleware.must_change_password_is_0_number', [typeof me.must_change_password, me.must_change_password], ['number', 0]);
    check('middleware.token_version_is_number', typeof me.token_version, 'number');
    check('middleware.email_verified_at_is_Date', me.email_verified_at instanceof Date, true);
    const meJson = jsonTypes(me);
    check('middleware.json_types', [meJson.id, meJson.token_version, meJson.must_change_password, meJson.email_verified_at, meJson.password_changed_at, meJson.student_id], ['number', 'number', 'number', 'string', 'null', 'null']);

    // 3. consent gate: accept twice (ON CONFLICT DO NOTHING), then the count
    const acc1 = await c.query("INSERT INTO policy_acceptances (user_id, document, version, student_id) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, document, version) DO NOTHING", [parent.id, 'privacy_notice', 'draft-1', student.id]);
    const acc2 = await c.query("INSERT INTO policy_acceptances (user_id, document, version, student_id) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, document, version) DO NOTHING", [parent.id, 'privacy_notice', 'draft-1', student.id]);
    check('consent.insert_then_duplicate_rowCounts', [acc1.rowCount, acc2.rowCount], [1, 0]);
    const acceptedAt = (await c.query('SELECT accepted_at FROM policy_acceptances WHERE user_id = $1', [parent.id])).rows[0].accepted_at;
    check('consent.accepted_at_json_is_whole_second_utc', /\.000Z$/.test(acceptedAt.toJSON()), true);

    // 4. contact gate: "confirmed since this sign-in" in whole seconds
    const iat = Math.floor(Date.now() / 1000);
    await c.query('UPDATE users SET contact_number = $1, contact_verified_at = NULL WHERE id = $2', ['09000000000', teacher.id]);
    const upd = await c.query('UPDATE users SET contact_verified_at = portal.now_s() WHERE id = $1 AND contact_number = $2', [teacher.id, '09000000000']);
    check('contact.confirm_rowCount', upd.rowCount, 1);
    const stamp = (await c.query('SELECT contact_verified_at FROM users WHERE id = $1', [teacher.id])).rows[0].contact_verified_at;
    check('contact.confirmed_since_iat_whole_seconds', Math.floor(stamp.getTime() / 1000) >= iat, true);
    const wrongNumber = await c.query('UPDATE users SET contact_verified_at = portal.now_s() WHERE id = $1 AND contact_number = $2', [teacher.id, '09111111111']);
    check('contact.confirm_with_changed_number_rowCount_0', wrongNumber.rowCount, 0);

    // 5. the forced password change: token_version bump, replacement token input
    const first = await c.query(`UPDATE users SET password = $1, password_changed_at = portal.now_ms(), token_version = token_version + 1, must_change_password = 0
      WHERE id = $2 AND must_change_password = 1 RETURNING token_version, password_changed_at`, [HASH, teacher.id]);
    check('password.first_password_bumps_version', [first.rowCount, first.rows[0].token_version], [1, 1]);
    check('password.changed_at_has_millisecond_precision_json', /\.\d{3}Z$/.test(first.rows[0].password_changed_at.toJSON()), true);
    const again = await c.query('UPDATE users SET password = $1, password_changed_at = portal.now_ms(), token_version = token_version + 1, must_change_password = 0 WHERE id = $2 AND must_change_password = 1', [HASH, teacher.id]);
    check('password.second_first_password_is_refused_rowCount_0_(409_PASSWORD_ALREADY_SET)', again.rowCount, 0);
    const v = (await c.query('SELECT token_version FROM users WHERE id = $1', [teacher.id])).rows[0].token_version;
    check('password.old_token_v0_no_longer_equals_version', (0 || 0) !== Number(v || 0), true);

    // 6. auth codes: cooldown, hourly limits, expiry, consume
    await c.query(`INSERT INTO auth_codes (user_id, purpose, code_hash, email_snapshot, contact_snapshot, expires_at, request_ip)
      VALUES ($1, $2, $3, $4, $5, portal.now_s() + make_interval(mins => $6), $7)`, [teacher.id, 'password_reset', HASH, null, '09000000000', 10, '127.0.0.1']);
    const recent = (await c.query("SELECT COUNT(*) AS c FROM auth_codes WHERE user_id = $1 AND purpose = $2 AND created_at > (portal.now_s() - interval '1 hour')", [teacher.id, 'password_reset'])).rows[0].c;
    check('codes.count_recent_is_number_1', [typeof recent, recent], ['number', 1]);
    const age = (await c.query('SELECT floor(extract(epoch from (portal.now_s() - created_at)))::int AS age FROM auth_codes WHERE user_id = $1 AND purpose = $2 ORDER BY id DESC LIMIT 1', [teacher.id, 'password_reset'])).rows[0].age;
    check('codes.cooldown_age_is_integer_seconds', Number.isInteger(age) && age >= 0 && age < 60, true);
    const live = await c.query(`SELECT id, code_hash, attempts, email_snapshot, contact_snapshot FROM auth_codes WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > portal.now_s() ORDER BY id DESC LIMIT 1`, [teacher.id, 'password_reset']);
    check('codes.live_code_found_attempts_is_number', [live.rowCount, typeof live.rows[0].attempts], [1, 'number']);
    const burned = await c.query('UPDATE auth_codes SET consumed_at = portal.now_s() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL', [teacher.id, 'password_reset']);
    check('codes.burn_pending_rowCount', burned.rowCount, 1);

    // 7. sign-in limits
    for (let i = 0; i < 5; i += 1) await c.query('INSERT INTO login_attempts (login_key, ip) VALUES ($1, $2)', ['f'.repeat(64), '127.0.0.1']);
    const perAccount = (await c.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = $1 AND cleared = 0 AND attempted_at > (portal.now_s() - make_interval(mins => $2))', ['f'.repeat(64), 15])).rows[0].n;
    check('throttle.five_failures_counted', perAccount, 5);
    const cleared = await c.query('UPDATE login_attempts SET cleared = 1 WHERE login_key = $1 AND cleared = 0', ['f'.repeat(64)]);
    check('throttle.clear_account_rowCount', cleared.rowCount, 5);
    const stale = (await c.query('SELECT COUNT(*) AS n FROM login_attempts WHERE attempted_at < (portal.now_s() - make_interval(hours => $1))', [24])).rows[0].n;
    const pruned = await c.query('DELETE FROM login_attempts WHERE attempted_at < (portal.now_s() - make_interval(hours => $1))', [24]);
    check('throttle.prune_older_than_a_day_removes_exactly_the_stale_rows_not_the_fresh_five', [pruned.rowCount === stale, (await c.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = $1', ['f'.repeat(64)])).rows[0].n], [true, 5]);

    // 8. attendance bulk upsert, twice, with the trigger
    const upsert = (status) => c.query(`INSERT INTO attendance (student_id, date, status, recorded_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by`, [student.id, '2026-10-19', status, teacher.id]);
    const a1 = await upsert('Present');
    const a2 = await upsert('Present');
    const a3 = await upsert('Late');
    check('attendance.upsert_rowCounts_insert_same_changed', [a1.rowCount, a2.rowCount, a3.rowCount], [1, 1, 1]);
    const att = (await c.query('SELECT * FROM attendance WHERE student_id = $1 AND date = $2', [student.id, '2026-10-19'])).rows[0];
    check('attendance.date_is_string_status_is_text', [att.date, att.status], ['2026-10-19', 'Late']);
    check('attendance.rows_for_ids_with_ANY', (await c.query('SELECT * FROM attendance WHERE date = $1 AND student_id = ANY($2::int[])', ['2026-10-19', [student.id]])).rowCount, 1);
    const bad = await attempt(c, 's1', 'INSERT INTO attendance (student_id, date, status, recorded_by) VALUES ($1, $2, $3, $4)', [student.id, '2026-10-20', 'present', teacher.id]);
    check('attendance.enum_label_case_matters_(route_validates_first)', bad.ok ? 'accepted' : bad.code, '22P02');
    const summary = (await c.query('SELECT a.status, COUNT(*) AS count FROM attendance a JOIN students s ON s.id = a.student_id WHERE a.student_id = $1 GROUP BY a.status', [student.id])).rows;
    check('attendance.summary_count_is_number', [summary.length, typeof summary[0].count], [1, 'number']);

    // 9. excuse letter: submit, adviser review once
    const letter = (await c.query(`INSERT INTO excuse_letters (student_id, parent_id, absence_date, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, status, absence_date, updated_at`, [student.id, parent.id, '2026-10-19', 'Rehearsal reason', null])).rows[0];
    check('excuse.insert_returning_pending_and_date_string', [letter.status, letter.absence_date], ['Pending', '2026-10-19']);
    await c.query('SELECT pg_sleep(1.05)');
    const rev = await c.query('UPDATE excuse_letters SET status = $1, teacher_remarks = $2, reviewed_by = $3 WHERE id = $4 AND status = $5', ['Approved', null, teacher.id, letter.id, 'Pending']);
    const after = (await c.query('SELECT status, updated_at FROM excuse_letters WHERE id = $1', [letter.id])).rows[0];
    check('excuse.review_once_rowCount_and_updated_at_bumped', [rev.rowCount, after.status, after.updated_at.getTime() > letter.updated_at.getTime()], [1, 'Approved', true]);
    const rev2 = await c.query('UPDATE excuse_letters SET status = $1, teacher_remarks = $2, reviewed_by = $3 WHERE id = $4 AND status = $5', ['Declined', null, teacher.id, letter.id, 'Pending']);
    check('excuse.second_review_rowCount_0', rev2.rowCount, 0);
    const adviserOnly = (await c.query('SELECT 1 FROM sections WHERE id = $1 AND adviser_id = $2 LIMIT 1', [sec.id, admin.id])).rowCount;
    check('excuse.non_adviser_scope_check_empty', adviserOnly, 0);

    // 10. notifications fan-out with a duplicate recipient, then delete
    const fan = await c.query(`INSERT INTO notifications (user_id, type, item_type, item_id, title_snapshot, actor_id) VALUES ($1,$2,$3,$4,$5,$6),($7,$8,$9,$10,$11,$12),($13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING`,
      [teacher.id, 'excuse_submitted', 'excuse_letter', letter.id, 'Rehearsal', parent.id, teacher.id, 'excuse_submitted', 'excuse_letter', letter.id, 'Rehearsal', parent.id, admin.id, 'excuse_submitted', 'excuse_letter', letter.id, 'Rehearsal', parent.id]);
    check('notify.fanout_duplicate_recipient_rowCount', fan.rowCount, 2);
    const unread = (await c.query('SELECT n.type, COUNT(*) AS count FROM notifications n WHERE n.user_id = $1 AND n.read_at IS NULL GROUP BY n.type', [teacher.id])).rows;
    check('notify.unread_count_type', [unread.length, typeof unread[0].count, unread[0].count], [1, 'number', 1]);
    const readAll = await c.query('UPDATE notifications SET read_at = portal.now_s() WHERE user_id = $1 AND read_at IS NULL', [teacher.id]);
    check('notify.read_all_updated_rowCount', readAll.rowCount, 1);
    const recipients = (await c.query('DELETE FROM notifications WHERE item_type = $1 AND item_id = $2 RETURNING user_id', ['excuse_letter', letter.id])).rows.map((r) => r.user_id);
    check('notify.delete_item_returns_recipients', new Set(recipients).size, 2);

    // 11. messages: send, window query, unread, contacts
    for (const body of ['one', 'two', 'three']) await c.query('INSERT INTO messages (sender_id, receiver_id, body) VALUES ($1, $2, $3)', [teacher.id, parent.id, body]);
    const conv = (await c.query(`WITH ranked AS (
        SELECT m.*, CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS other_id,
               ROW_NUMBER() OVER (PARTITION BY CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END ORDER BY m.id DESC) AS rn
        FROM messages m WHERE m.sender_id = $1 OR m.receiver_id = $1)
      SELECT r.other_id, r.body, r.created_at, u.name AS other_name,
             (SELECT COUNT(*) FROM messages x WHERE x.sender_id = r.other_id AND x.receiver_id = $1 AND x.read_status = 0) AS unread_count
      FROM ranked r JOIN users u ON u.id = r.other_id WHERE r.rn = 1 ORDER BY r.id DESC LIMIT $2 OFFSET $3`, [parent.id, 50, 0])).rows;
    check('messages.conversation_window_query', [conv.length, conv[0].body, typeof conv[0].unread_count, conv[0].unread_count], [1, 'three', 'number', 3]);
    const marked = await c.query('UPDATE messages SET read_status = 1 WHERE sender_id = $1 AND receiver_id = $2 AND read_status = 0', [teacher.id, parent.id]);
    check('messages.mark_thread_read_count', marked.rowCount, 3);
    const contacts = (await c.query(`SELECT u.id, u.name, u.role, st.student_name, COALESCE(subj.subject_names, adv.adviser_label) AS subject
      FROM users u
      LEFT JOIN (SELECT s.id, concat(s.first_name, ' ', s.last_name) AS student_name FROM students s) st ON st.id = u.student_id
      LEFT JOIN (SELECT ta.teacher_id, string_agg(DISTINCT sub.name, ', ' ORDER BY sub.name) AS subject_names FROM teacher_assignments ta JOIN subjects sub ON sub.id = ta.subject_id GROUP BY ta.teacher_id) subj ON subj.teacher_id = u.id
      LEFT JOIN (SELECT sec.adviser_id, string_agg(concat('Adviser of Grade ', sec.grade_level, ' - ', sec.name), ', ' ORDER BY sec.grade_level, sec.name) AS adviser_label FROM sections sec GROUP BY sec.adviser_id) adv ON adv.adviser_id = u.id
      WHERE u.id = $1 AND u.status = 'active' AND (u.name ILIKE $2 OR st.student_name ILIKE $2)`, [teacher.id, '%rehearsal%'])).rows;
    check('messages.contacts_string_agg_concat_ilike', [contacts.length, typeof contacts[0].subject, contacts[0].subject.length > 0], [1, 'string', true]);

    // 12. students search: lrn exact (ci) or name ILIKE; accent search gap
    // scoped to the synthetic learner: the seeded roster holds a real learner whose ASCII name would match
    const search = async (q) => (await c.query(`SELECT s.id FROM students s WHERE (s.lrn = $1 OR concat(s.first_name, ' ', s.last_name) ILIKE $2) AND s.id = $3`, [q, `%${q}%`, student.id])).rowCount;
    check('students.search_by_lrn_lowercase', await search('zzrehearse01'), 1);
    check('students.search_by_name_case_insensitive', await search('niño rehearsal'), 1);
    check('students.search_accent_stripped_DOES_NOT_match_(MySQL_did)', await search('nino'), 0);
    await c.query('SAVEPOINT s2');
    const ext = await tryq(c, 'CREATE EXTENSION IF NOT EXISTS unaccent');
    const unaccent = ext.ok ? await tryq(c, 'SELECT unaccent(concat(first_name, \' \', last_name)) ILIKE unaccent($1) AS m FROM students WHERE id = $2', ['%nino%', student.id]) : ext;
    info('students.search_with_unaccent_extension', unaccent.ok ? unaccent.rows[0].m : unaccent.code);
    await c.query('ROLLBACK TO SAVEPOINT s2');

    // 13. users list: sort by role as text, LIKE on login_id with an explicit deterministic collation
    const sorted = (await c.query('SELECT role::text AS r FROM users WHERE id = ANY($1::int[]) ORDER BY role::text ASC, id DESC', [[admin.id, teacher.id, parent.id]])).rows.map((r) => r.r);
    check('users.sort_role_as_text_alphabetical', sorted, ['admin', 'parent', 'teacher']);
    const likeNative = await attempt(c, 's3', 'SELECT 1 FROM users WHERE login_id LIKE $1', ['ZZ-REH%']);
    check('users.LIKE_on_portal_ci_column_is_refused_on_pg17', likeNative.ok ? 'accepted' : likeNative.code, '0A000');
    const likeColl = await tryq(c, 'SELECT COUNT(*)::int AS n FROM users WHERE login_id COLLATE "C" ILIKE $1', ['zz-reh%']);
    check('users.ILIKE_with_explicit_C_collation_works_(two_of_three_synthetic_ids_carry_the_hyphen)', likeColl.ok ? likeColl.rows[0].n : likeColl.code, 2);
    const dupAssign = await attempt(c, 's4', 'INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section, section_id) VALUES ($1, $2, $3, $4, $5)', [teacher.id, subj.id, sec.grade_level, sec.name.toUpperCase(), sec.id]);
    check('assignments.duplicate_with_case_variant_section_is_23505_(ER_DUP_ENTRY_to_409)', dupAssign.ok ? 'accepted' : dupAssign.code, '23505');

    // 14. grades: row, components, recompute-shaped update, lock FOR UPDATE, bulk lock
    const grade = (await c.query('INSERT INTO grades (student_id, subject_id, term, school_year) VALUES ($1, $2, $3, $4) RETURNING id, is_locked, term_grade', [student.id, subj.id, 1, sy])).rows[0];
    check('grades.insert_returning_types', [typeof grade.id, grade.is_locked, grade.term_grade], ['number', 0, null]);
    const slot = (await c.query(`INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, name, max_score) VALUES ($1,$2,$3,$4,$5,'WW',1,NULL,$6) RETURNING id, max_score`, [subj.id, sec.grade_level, sec.name, 1, sy, '20'])).rows[0];
    check('grades.slot_max_score_numeric_string', slot.max_score, '20.00');
    await c.query('INSERT INTO grade_components (grade_id, slot_id, type, score, max_score, label) VALUES ($1, $2, $3, $4, $5, $6)', [grade.id, slot.id, 'WW', '17', '20', null]);
    const comps = (await c.query("SELECT score, max_score, slot_id FROM grade_components WHERE grade_id = $1 AND type = 'WW'", [grade.id])).rows;
    check('grades.components_decimal_strings', [comps[0].score, comps[0].max_score, typeof comps[0].slot_id], ['17.00', '20.00', 'number']);
    const pct = Math.round((Number(comps[0].score) / Number(comps[0].max_score)) * 100 * 100) / 100;
    await c.query('UPDATE grades SET ww_percentage = $1, ww_weighted = $2, initial_grade = $3, term_grade = $4 WHERE id = $5', [pct, 17, 85.125, 85, grade.id]);
    const g2 = (await c.query('SELECT ww_percentage, ww_weighted, initial_grade, term_grade, updated_at > created_at AS touched FROM grades WHERE id = $1', [grade.id])).rows[0];
    check('grades.numeric_storage_and_half_up', [g2.ww_percentage, g2.ww_weighted, g2.initial_grade, g2.term_grade], ['85.00', '17.00', '85.13', '85.00']);
    const slotDeleteBlocked = await attempt(c, 's5', 'DELETE FROM assessment_slots WHERE id = $1', [slot.id]);
    check('grades.slot_with_scores_cannot_be_deleted_23503', slotDeleteBlocked.ok ? 'deleted' : slotDeleteBlocked.code, '23503');
    const lockRows = (await c.query(`SELECT g.id, g.student_id, g.subject_id, g.is_locked, (g.term_grade IS NOT NULL OR g.descriptive_grade IS NOT NULL) AS has_value
      FROM grades g JOIN students st ON st.id = g.student_id WHERE g.term = $1 AND g.school_year = $2 AND st.grade_level = $3 AND st.section = $4 FOR UPDATE`, [1, sy, sec.grade_level, sec.name])).rows;
    check('grades.lock_read_has_value_boolean_Number_1', [lockRows.length, Number(lockRows[0].has_value)], [1, 1]);
    const locked = await c.query('UPDATE grades SET is_locked = $1 WHERE id = ANY($2::int[]) AND is_locked <> $1', [1, [grade.id]]);
    const lockedAgain = await c.query('UPDATE grades SET is_locked = $1 WHERE id = ANY($2::int[]) AND is_locked <> $1', [1, [grade.id]]);
    check('grades.bulk_lock_then_repeat_rowCounts', [locked.rowCount, lockedAgain.rowCount], [1, 0]);
    const lockedCount = (await c.query('SELECT COUNT(*) AS total, SUM(is_locked) AS locked FROM grades WHERE school_year = $1 AND term = $2 AND student_id = $3', [sy, 1, student.id])).rows[0];
    check('grades.dashboard_sum_is_locked_number', [typeof lockedCount.total, typeof lockedCount.locked, lockedCount.locked], ['number', 'number', 1]);
    const delLocked = await attempt(c, 's6', 'DELETE FROM grades WHERE id = $1 AND is_locked = 0', [grade.id]);
    check('grades.delete_refused_while_locked_rowCount_0', delLocked.ok ? delLocked.rowCount : delLocked.code, 0);
    const card = (await c.query('SELECT id, name, display_order FROM subjects WHERE grade_level = $1 ORDER BY display_order IS NULL, display_order, name', [sec.grade_level])).rows;
    check('grades.report_card_subject_order_runs', card.length > 0, true);
    const gradeJson = jsonTypes((await c.query('SELECT * FROM grades WHERE id = $1', [grade.id])).rows[0]);
    check('grades.row_json_types', [gradeJson.id, gradeJson.term, gradeJson.term_grade, gradeJson.descriptive_grade, gradeJson.is_locked, gradeJson.created_at], ['number', 'number', 'string', 'null', 'number', 'string']);

    // 15. settings upsert and the allow-listed read with ANY on a portal.ci column
    await c.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value", ['zz_rehearsal_key', 'v1']);
    await c.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value", ['ZZ_REHEARSAL_KEY', 'v2']);
    const setting = (await c.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1::text[])', [['zz_rehearsal_key']])).rows;
    check('settings.upsert_case_variant_updates_same_row_and_ANY_reads_it', [setting.length, setting[0].setting_value], [1, 'v2']);

    // 16. dashboards: boolean sums and counts
    const admins = (await c.query("SELECT COUNT(*) AS n, SUM((email_verified_at IS NULL)::int) AS unverified FROM users WHERE role = 'admin' AND status = 'active'")).rows[0];
    check('dashboard.admin_hazard_types', [typeof admins.n, typeof admins.unverified], ['number', 'number']);
    const banner = (await c.query('SELECT COUNT(*) AS n FROM students WHERE grade_level = $1 AND section = $2 AND status = $3', [sec.grade_level, sec.name.toLowerCase(), 'active'])).rows[0].n;
    check('dashboard.section_roster_count_case_insensitive_section', banner >= 1, true);

    // 17. pagination contract
    const page = (await c.query('SELECT COUNT(*) AS total FROM activity_logs')).rows[0].total;
    const rows = (await c.query('SELECT id FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2', [50, 0])).rows;
    check('pagination.total_integer_and_page_size', [Number.isInteger(page), rows.length], [true, 50]);

    // 18. backups row + the restore bookkeeping statements
    const b = (await c.query('INSERT INTO backups (filename, file_path, file_size, created_by) VALUES ($1, $2, $3, $4) RETURNING id, file_size, created_at', ['zz_rehearsal.sql', 'C:/zz/zz_rehearsal.sql', 2215738, admin.id])).rows[0];
    check('backups.insert_returning_file_size_number', typeof b.file_size, 'number');
    const wiped = (await c.query('SELECT COUNT(*) AS c FROM activity_logs WHERE created_at > $1', [b.created_at])).rows[0].c;
    check('backups.wiped_count_with_Date_param_is_number', typeof wiped, 'number');
    const beforeCut = Math.floor(Date.now() / 1000) - 1;
    await c.query('SELECT pg_sleep(1.05)');
    await c.query('INSERT INTO auth_security_state (id, token_valid_after) VALUES (1, portal.now_s()) ON CONFLICT (id) DO UPDATE SET token_valid_after = EXCLUDED.token_valid_after');
    const cut = (await c.query('SELECT token_valid_after FROM auth_security_state WHERE id = 1')).rows[0].token_valid_after;
    const afterCut = Math.floor(Date.now() / 1000);
    check('restore.cutoff_rejects_old_token_accepts_new', [beforeCut * 1000 < cut.getTime(), afterCut * 1000 < cut.getTime()], [true, false]);
    const second = await attempt(c, 's7', 'INSERT INTO auth_security_state (id, token_valid_after) VALUES (2, portal.now_s())');
    check('restore.second_state_row_impossible_23514', second.ok ? 'accepted' : second.code, '23514');

    // 19. activity log write
    const log = await c.query('INSERT INTO activity_logs (user_id, action, description) VALUES ($1, $2, $3) RETURNING id', [admin.id, 'rehearsal', 'rehearsal row, rolled back']);
    check('activity.insert_returning_id_number', typeof log.rows[0].id, 'number');

    // 20. a scope change removes future authority, never past records
    await c.query('DELETE FROM teacher_assignments WHERE teacher_id = $1', [teacher.id]);
    check('assignments.delete_keeps_grades', (await c.query('SELECT COUNT(*) AS n FROM grades WHERE id = $1', [grade.id])).rows[0].n, 1);

    await c.query('ROLLBACK');
    // after ROLLBACK the SET LOCAL search_path is gone too — qualify the names
    const left = (await c.query("SELECT (SELECT COUNT(*) FROM portal.users WHERE login_id COLLATE \"C\" LIKE 'ZZ%') + (SELECT COUNT(*) FROM portal.students WHERE lrn COLLATE \"C\" LIKE 'ZZREHEARSE%') AS n")).rows[0].n;
    check('rollback.left_no_synthetic_rows', left, 0);
  } catch (error) {
    failures += 1;
    console.error('REHEARSAL FAILED:', safeMessage(error));
    await tryq(c, 'ROLLBACK');
  } finally {
    c.release(true);
    await p.end();
    report.failures = failures;
    fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
    const out = path.join(P.REHEARSAL_DIR, `rehearse_${target.name}_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`${failures === 0 ? 'REHEARSAL OK' : `REHEARSAL: ${failures} check(s) failed`} — report: ${out}`);
  }
}

main().catch((e) => { console.error('rehearse failed:', safeMessage(e)); process.exit(1); });
