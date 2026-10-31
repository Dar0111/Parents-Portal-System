// MODULE 12 (2026-10-31) — THE DEMO LOAD. Runs as portal_migrate, the owner
// (config/db.js settings('migrate')), straight to the tables: no notification,
// no socket emit, and one activity_logs row for the whole load.
//
//   npm run demo:load                 a dry run: BEGIN READ ONLY, the
//                                     preconditions and the counts, nothing
//                                     written, by the database's own refusal
//   npm run demo:load -- --apply      ONE transaction; any error rolls it back
//
// A non-loopback host also needs PORTAL_DEMO_HOSTED=production-demo-load in
// that one command (demoData.js assertTarget). The four DEMO_* values are read
// from the terminal's environment and dropped from it at once; they are never
// written to a file (docs/DEMO_DATA.md).
//
// THIS SCRIPT PRINTS COUNTS. Never a name, an LRN, a login id, an email or a
// password, and never a driver error's detail: a unique violation quotes the
// key, and here the key is an LRN. reportFailure() below is the only error path.
//
// All the deciding is demoData.js planLoad(); this file reads and writes.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client } = require('pg');
const db = require('../config/db');
const { hashPassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRule');
const { validateEmail } = require('../utils/emailRule');
const { safeMessage } = require('../../migration/lib/safeMessage');
const demo = require('./demoData');
const { SCHOOL_YEAR } = require('../utils/schoolCalendar');

const { Refusal } = demo;

const COUNT_TABLES = Object.freeze([
  'users',
  'students',
  'teacher_assignments',
  'assessment_slots',
  'grades',
  'grade_components',
  'attendance',
  'system_settings',
  'activity_logs',
  'messages',
  'notifications',
  'policy_acceptances',
]);

// 1,000 rows a statement: far under the two-minute statement_timeout last
// measured on staging, and one failure still rolls the whole load back.
const BATCH = 1000;

let step = 'start';

function atStep(name) {
  step = name;
}

// The one way out for an error. A Refusal is our own sentence; anything else
// is its code, its constraint and a masked first line, and never `.detail`.
function reportFailure(error) {
  if (error instanceof Refusal) {
    console.error(`REFUSED: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const constraint = error && error.constraint ? ` ${error.constraint}` : '';
  console.error(`FAILED at ${step}: ${(error && error.code) || 'no code'}${constraint} — ${safeMessage(error)}`);
  process.exitCode = 1;
}

function ownerSettings(apply) {
  const settings = { ...db.settings('migrate'), application_name: 'parents-portal-demo' };
  demo.assertTarget({ host: settings.host, apply, flag: process.env[demo.HOSTED_FLAG] });
  if (!settings.password) throw new Refusal('PG_MIGRATE_PASSWORD is not set.');
  return settings;
}

// A one-off client, with the 'error' listener config/db.js says it needs, and
// the same `?` adapter every route uses.
async function connectOwner(settings) {
  const client = db.guardClient(new Client(settings), 'the demo script was running');
  await client.connect();
  return { client, conn: { query: (sql, params) => client.query(db.toPg(sql, params)) } };
}

async function begin(conn, apply) {
  await conn.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  await conn.query('SET LOCAL search_path TO portal, pg_catalog');
  await conn.query("SET LOCAL lock_timeout = '15s'");
}

async function tableCounts(conn) {
  const counts = {};
  for (const table of COUNT_TABLES) {
    const { rows } = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
    counts[table] = Number(rows[0].n);
  }
  return counts;
}

function printCounts(title, before, after) {
  console.log(title);
  for (const table of COUNT_TABLES) {
    const left = String(before[table]).padStart(7);
    console.log(after ? `  ${table.padEnd(22)}${left} -> ${after[table]}` : `  ${table.padEnd(22)}${left}`);
  }
}

// Validated before anything else; a refusal names the variable, never a value.
function readSecrets() {
  const secrets = {};
  const problems = [];
  for (const [slot, key] of Object.entries(demo.SECRET_KEYS)) {
    const value = process.env[key];
    if (!value) {
      problems.push(`${key} is not set.`);
    } else if (slot === 'email') {
      const email = validateEmail(value);
      if (email.error) problems.push(`${key} does not look like an address.`);
      else secrets.email = email.value;
    } else if (validateNewPassword(value)) {
      problems.push(`${key} does not meet the password rule.`);
    } else {
      secrets[slot] = value;
    }
  }
  if (problems.length) throw new Refusal(problems.join(' '));
  for (const key of Object.values(demo.SECRET_KEYS)) delete process.env[key];
  return secrets;
}

async function readFacts(conn) {
  const rowsOf = async (sql, params) => (await conn.query(sql, params)).rows;
  const countOf = async (sql, params) => Number((await rowsOf(sql, params))[0].n);
  const logins = [demo.ADMIN_LOGIN, ...demo.SEEDED_TEACHERS];
  const days = demo.attendanceDays();

  const setting = await rowsOf("SELECT setting_value FROM system_settings WHERE setting_key = 'academic_year' LIMIT 1");
  return {
    academicYear: setting[0] ? setting[0].setting_value : null,
    markers: {
      manifest: await countOf('SELECT COUNT(*) AS n FROM system_settings WHERE setting_key = ?', [demo.MANIFEST_KEY]),
      students: await countOf('SELECT COUNT(*) AS n FROM students WHERE lrn COLLATE "und-x-icu" LIKE ?', [`${demo.LRN_PREFIX}%`]),
      users: await countOf('SELECT COUNT(*) AS n FROM users WHERE login_id COLLATE "und-x-icu" LIKE ? OR login_id COLLATE "und-x-icu" LIKE ?', [
        `${demo.LRN_PREFIX}%`,
        `${demo.TEACHER_PREFIX}%`,
      ]),
    },
    accounts: await rowsOf(
      `SELECT id, login_id, role::text AS role, status::text AS status, email, email_verified_at,
              contact_number, contact_verified_at, must_change_password
         FROM users WHERE login_id = ANY(?::text[])`,
      [logins]
    ),
    sections: await rowsOf('SELECT id, name, grade_level, adviser_id FROM sections WHERE school_year = ?', [SCHOOL_YEAR]),
    subjects: await rowsOf('SELECT id, name, grade_level FROM subjects'),
    weights: await rowsOf('SELECT subject_id, ww_weight, pt_weight, ex_weight FROM grade_weight_configs WHERE school_year = ?', [SCHOOL_YEAR]),
    modes: await rowsOf('SELECT grade_level, mode::text AS mode FROM grading_mode_configs WHERE school_year = ?', [SCHOOL_YEAR]),
    transmutation: await rowsOf('SELECT ig_min, ig_max, transmuted_grade FROM transmutation_table WHERE school_year = ?', [SCHOOL_YEAR]),
    learners: await rowsOf("SELECT id, grade_level, section, first_name, last_name FROM students WHERE status = 'active'"),
    guardians: await rowsOf("SELECT id, name, student_id FROM users WHERE role = 'parent'"),
    assignments: await rowsOf('SELECT id, teacher_id, subject_id, grade_level, section FROM teacher_assignments'),
    slots: await rowsOf(
      `SELECT id, subject_id, grade_level, section, term, type::text AS type, slot_no, max_score
         FROM assessment_slots
        WHERE school_year = ? AND term = ANY(?::int[]) AND max_score IS NOT NULL`,
      [SCHOOL_YEAR, [...demo.TERMS_LOADED]]
    ),
    grades: await rowsOf(
      `SELECT g.id, g.student_id, g.subject_id, g.term, g.is_locked,
              g.ex_st1, g.ex_st1_max, g.ex_st2, g.ex_st2_max, g.ex_te, g.ex_te_max,
              g.term_grade, g.descriptive_grade::text AS descriptive_grade,
              (SELECT COUNT(*) FROM grade_components c WHERE c.grade_id = g.id) AS components
         FROM grades g
        WHERE g.school_year = ? AND g.term = ANY(?::int[])`,
      [SCHOOL_YEAR, [...demo.TERMS_LOADED]]
    ),
    attendance: await rowsOf('SELECT student_id, date FROM attendance WHERE date = ANY(?::date[])', [days]),
  };
}

async function inBatches(rows, write) {
  const out = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(...(await write(rows.slice(i, i + BATCH))));
  return out;
}

function expectCount(name, got, wanted) {
  if (got !== wanted) throw new Error(`${name}: wrote ${got}, planned ${wanted}`);
}

async function writeLoad(conn, plan, facts, secrets, before) {
  const accountByLogin = new Map(facts.accounts.map((row) => [row.login_id, row.id]));
  const adminId = accountByLogin.get(demo.ADMIN_LOGIN);

  atStep('hashing the passwords');
  const hashes = {
    teacher: await hashPassword(secrets.teacher),
    parent: await hashPassword(secrets.parent),
    confirmed: await hashPassword(secrets.confirmed),
  };

  // ---- teachers ----
  atStep('teachers');
  const confirmedTeacher = (row) => demo.CONFIRMED_NEW_TEACHERS.includes(row.login_id);
  const { rows: teachers } = await conn.query(
    `INSERT INTO users (login_id, password, role, status, name, email, email_verified_at, must_change_password, created_by)
     SELECT t.login_id, t.password, 'teacher'::portal.user_role, 'active'::portal.user_status, t.name,
            CASE WHEN t.confirmed THEN ?::text END, CASE WHEN t.confirmed THEN portal.now_s() END,
            CASE WHEN t.confirmed THEN 0 ELSE 1 END, ?::int
       FROM unnest(?::text[], ?::text[], ?::text[], ?::boolean[]) AS t(login_id, password, name, confirmed)
     RETURNING id, login_id`,
    [
      secrets.email,
      adminId,
      plan.teachers.map((row) => row.login_id),
      plan.teachers.map((row) => (confirmedTeacher(row) ? hashes.confirmed : hashes.teacher)),
      plan.teachers.map((row) => row.name),
      plan.teachers.map(confirmedTeacher),
    ]
  );
  expectCount('teachers', teachers.length, plan.teachers.length);
  const teacherId = new Map(accountByLogin);
  for (const row of teachers) teacherId.set(row.login_id, row.id);

  // ---- advisers: the 20 sections that were NULL ----
  atStep('advisers');
  const advisers = await conn.query(
    `UPDATE sections s SET adviser_id = u.adviser_id
       FROM unnest(?::int[], ?::int[]) AS u(section_id, adviser_id)
      WHERE s.id = u.section_id AND s.adviser_id IS NULL`,
    [plan.adviserUpdates.map((row) => row.section_id), plan.adviserUpdates.map((row) => teacherId.get(row.adviser))]
  );
  expectCount('advisers', advisers.rowCount, plan.adviserUpdates.length);

  // ---- assignments ----
  atStep('assignments');
  const assignments = await inBatches(plan.newAssignments, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO teacher_assignments (teacher_id, subject_id, grade_level, section, section_id)
       SELECT * FROM unnest(?::int[], ?::int[], ?::smallint[], ?::text[], ?::int[])
       RETURNING id, teacher_id`,
      [
        batch.map((row) => teacherId.get(row.teacher)),
        batch.map((row) => row.subject_id),
        batch.map((row) => row.grade),
        batch.map((row) => row.section),
        batch.map((row) => row.section_id),
      ]
    );
    return rows;
  });
  expectCount('assignments', assignments.length, plan.newAssignments.length);

  // ---- learners, then their parents (users.student_id needs the learner) ----
  atStep('learners');
  const sectionId = new Map(facts.sections.map((row) => [demo.sectionKey(row.grade_level, row.name), row.id]));
  const adviserOf = new Map(demo.SECTIONS.map((section) => [demo.sectionKey(section.grade, section.name), section.adviser]));
  const students = await inBatches(plan.learners, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO students (lrn, first_name, last_name, grade_level, section, section_id, created_by)
       SELECT * FROM unnest(?::text[], ?::text[], ?::text[], ?::smallint[], ?::text[], ?::int[], ?::int[])
       RETURNING id, lrn`,
      [
        batch.map((row) => row.lrn),
        batch.map((row) => row.first_name),
        batch.map((row) => row.last_name),
        batch.map((row) => row.grade),
        batch.map((row) => row.section),
        batch.map((row) => sectionId.get(demo.sectionKey(row.grade, row.section))),
        batch.map((row) => teacherId.get(adviserOf.get(demo.sectionKey(row.grade, row.section)))),
      ]
    );
    return rows;
  });
  expectCount('learners', students.length, plan.learners.length);
  const studentId = new Map(students.map((row) => [row.lrn, row.id]));

  atStep('parents');
  const parents = await inBatches(plan.learners, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO users (login_id, password, role, status, name, email, email_verified_at, must_change_password,
                          student_id, created_by, approved_by)
       SELECT p.login_id, p.password, 'parent'::portal.user_role, 'active'::portal.user_status, p.name,
              CASE WHEN p.confirmed THEN ?::text END, CASE WHEN p.confirmed THEN portal.now_s() END,
              CASE WHEN p.confirmed THEN 0 ELSE 1 END, p.student_id, p.created_by, ?::int
         FROM unnest(?::text[], ?::text[], ?::text[], ?::boolean[], ?::int[], ?::int[])
              AS p(login_id, password, name, confirmed, student_id, created_by)
       RETURNING id`,
      [
        secrets.email,
        adminId,
        batch.map((row) => row.lrn),
        batch.map((row) => (row.confirmed ? hashes.confirmed : hashes.parent)),
        batch.map((row) => row.guardian),
        batch.map((row) => row.confirmed),
        batch.map((row) => studentId.get(row.lrn)),
        batch.map((row) => teacherId.get(adviserOf.get(demo.sectionKey(row.grade, row.section)))),
      ]
    );
    return rows;
  });
  expectCount('parents', parents.length, plan.learners.length);

  // ---- team names on kept rows; names only (the owner's Q3) ----
  atStep('renames');
  for (const row of plan.renamedLearners) {
    await conn.query('UPDATE students SET first_name = ?, last_name = ? WHERE id = ?', [row.after.first_name, row.after.last_name, row.id]);
  }
  for (const row of plan.renamedGuardians) {
    await conn.query('UPDATE users SET name = ? WHERE id = ?', [row.after, row.id]);
  }

  // ---- existing accounts with no confirmed contact; two columns, no others ----
  atStep('contacts');
  for (const row of plan.contacts) {
    await conn.query('UPDATE users SET email = ?, email_verified_at = portal.now_s() WHERE id = ?', [secrets.email, row.id]);
  }

  // ---- slots ----
  // ON CONFLICT: a class whose grid was saved with a blank column holds a slot
  // row with no HPS, which readFacts leaves out as unused. Filling that shell
  // is the only write a row like that can take, and it is a used column now.
  atStep('slots');
  const slots = await inBatches(plan.newSlots, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
       SELECT s.subject_id, s.grade_level, s.section, s.term, ?::text, s.type, s.slot_no, s.max_score
         FROM unnest(?::int[], ?::smallint[], ?::text[], ?::smallint[], ?::portal.component_type[], ?::smallint[], ?::numeric[])
              AS s(subject_id, grade_level, section, term, type, slot_no, max_score)
       ON CONFLICT ON CONSTRAINT uq_slot DO UPDATE SET max_score = EXCLUDED.max_score
         WHERE assessment_slots.max_score IS NULL
       RETURNING id, subject_id, grade_level, section, term, type::text AS type, slot_no`,
      [
        SCHOOL_YEAR,
        batch.map((row) => row.subject_id),
        batch.map((row) => row.grade),
        batch.map((row) => row.section),
        batch.map((row) => row.term),
        batch.map((row) => row.type),
        batch.map((row) => row.slot_no),
        batch.map((row) => row.max_score),
      ]
    );
    return rows;
  });
  expectCount('slots', slots.length, plan.newSlots.length);
  const slotKey = (subject, grade, section, term, type, no) => `${subject}|${grade}|${section}|${term}|${type}|${no}`;
  const slotId = new Map(slots.map((row) => [slotKey(row.subject_id, row.grade_level, row.section, row.term, row.type, row.slot_no), row.id]));

  // ---- grades ----
  atStep('grades');
  const exam = (row, field) => (row.exam ? row.exam[field] : null);
  const learnerIdOf = (row) => (row.lrn ? studentId.get(row.lrn) : row.student_id);
  const gradeRows = await inBatches(plan.gradeRows, async (batch) => {
    const computed = (field) => batch.map((row) => row.computed[field]);
    const { rows } = await conn.query(
      `INSERT INTO grades (student_id, subject_id, term, school_year,
                           ww_percentage, ww_weighted, pt_percentage, pt_weighted,
                           ex_st1, ex_st1_max, ex_st2, ex_st2_max, ex_te, ex_te_max,
                           ex_percentage, ex_weighted, initial_grade, term_grade, descriptive_grade)
       SELECT g.student_id, g.subject_id, g.term, ?::text,
              g.ww_percentage, g.ww_weighted, g.pt_percentage, g.pt_weighted,
              g.ex_st1, g.ex_st1_max, g.ex_st2, g.ex_st2_max, g.ex_te, g.ex_te_max,
              g.ex_percentage, g.ex_weighted, g.initial_grade, g.term_grade, g.descriptive_grade
         FROM unnest(?::int[], ?::int[], ?::smallint[],
                     ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[],
                     ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[],
                     ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[], ?::portal.descriptive_grade[])
              AS g(student_id, subject_id, term,
                   ww_percentage, ww_weighted, pt_percentage, pt_weighted,
                   ex_st1, ex_st1_max, ex_st2, ex_st2_max, ex_te, ex_te_max,
                   ex_percentage, ex_weighted, initial_grade, term_grade, descriptive_grade)
       RETURNING id, student_id, subject_id, term`,
      [
        SCHOOL_YEAR,
        batch.map(learnerIdOf),
        batch.map((row) => row.subject_id),
        batch.map((row) => row.term),
        computed('ww_percentage'),
        computed('ww_weighted'),
        computed('pt_percentage'),
        computed('pt_weighted'),
        batch.map((row) => exam(row, 'st1')),
        batch.map((row) => exam(row, 'st1_max')),
        batch.map((row) => exam(row, 'st2')),
        batch.map((row) => exam(row, 'st2_max')),
        batch.map((row) => exam(row, 'te')),
        batch.map((row) => exam(row, 'te_max')),
        computed('ex_percentage'),
        computed('ex_weighted'),
        computed('initial_grade'),
        computed('term_grade'),
        computed('descriptive_grade'),
      ]
    );
    return rows;
  });
  expectCount('grades', gradeRows.length, plan.gradeRows.length);
  const gradeId = new Map(gradeRows.map((row) => [`${row.student_id}|${row.subject_id}|${row.term}`, row.id]));

  // ---- components: slot-backed, so `label` stays NULL as the class record leaves it ----
  atStep('components');
  const componentRows = plan.gradeRows.flatMap((row) =>
    row.scored.map((slot) => ({
      grade_id: gradeId.get(`${learnerIdOf(row)}|${row.subject_id}|${row.term}`),
      slot_id: slot.id || slotId.get(slotKey(row.subject_id, row.grade, row.section, row.term, slot.type, slot.slot_no)),
      type: slot.type,
      score: slot.score,
      max_score: slot.max_score,
    }))
  );
  const components = await inBatches(componentRows, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO grade_components (grade_id, slot_id, type, score, max_score)
       SELECT * FROM unnest(?::int[], ?::int[], ?::portal.component_type[], ?::numeric[], ?::numeric[])
       RETURNING id`,
      [
        batch.map((row) => row.grade_id),
        batch.map((row) => row.slot_id),
        batch.map((row) => row.type),
        batch.map((row) => row.score),
        batch.map((row) => row.max_score),
      ]
    );
    return rows;
  });
  expectCount('components', components.length, plan.counts.grade_components);

  // ---- attendance: a day already recorded wins ----
  atStep('attendance');
  const attendance = await inBatches(plan.attendanceRows, async (batch) => {
    const { rows } = await conn.query(
      `INSERT INTO attendance (student_id, date, status, recorded_by)
       SELECT * FROM unnest(?::int[], ?::date[], ?::portal.attendance_status[], ?::int[])
       ON CONFLICT (student_id, date) DO NOTHING
       RETURNING id, student_id`,
      [
        batch.map(learnerIdOf),
        batch.map((row) => row.date),
        batch.map((row) => row.status),
        batch.map((row) => teacherId.get(row.adviser)),
      ]
    );
    return rows;
  });

  // ---- the manifest, then the one activity row ----
  // What the identity marker cannot reach: slots, kept teachers' new rows, kept
  // learners' new rows, and the values to put back.
  atStep('manifest');
  const kept = new Set(facts.learners.map((row) => row.id));
  const keptTeachers = new Set(facts.accounts.map((row) => row.id));
  const manifest = {
    version: 1,
    as_of: demo.AS_OF,
    loaded_at: new Date().toISOString(),
    before,
    advisers: plan.adviserBefore,
    contacts: plan.contacts.map((row) => ({ ...row, email_set: secrets.email })),
    learners: plan.renamedLearners.map((row) => ({ id: row.id, ...row.before })),
    guardians: plan.renamedGuardians.map((row) => ({ id: row.id, name: row.before })),
    added: {
      assignments: assignments.filter((row) => keptTeachers.has(row.teacher_id)).map((row) => row.id),
      slots: slots.map((row) => row.id),
      grades: gradeRows.filter((row) => kept.has(row.student_id)).map((row) => row.id),
      attendance: attendance.filter((row) => kept.has(row.student_id)).map((row) => row.id),
    },
  };
  await conn.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [demo.MANIFEST_KEY, JSON.stringify(manifest)]);
  await conn.query('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [
    adminId,
    'demo_data_load',
    `Demo data loaded: ${plan.teachers.length} teachers, ${plan.learners.length} learners and parents, ${gradeRows.length} grades, ${attendance.length} attendance rows.`,
  ]);
  return attendance.length;
}

// Only when production differs from the seed: the value `npm run demo:logins`
// needs so the list matches the seats that were really written.
function keptArgument(keptBySection) {
  const same =
    Object.keys(keptBySection).length === Object.keys(demo.SEEDED_KEPT).length &&
    Object.entries(demo.SEEDED_KEPT).every(([key, count]) => keptBySection[key] === count);
  if (same) return null;
  return Object.entries(keptBySection)
    .map(([key, count]) => `${key.replace('|', ':')}=${count}`)
    .join(',');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const settings = ownerSettings(apply);
  const secrets = readSecrets();
  console.log('The four DEMO_ values: set and valid.');

  atStep('connecting');
  const { client, conn } = await connectOwner(settings);
  try {
    await begin(conn, apply);
    console.log(apply ? 'BEGIN: one transaction, rollback on any error.' : 'BEGIN READ ONLY: a dry run, nothing can be written.');

    atStep('reading');
    const before = await tableCounts(conn);
    const facts = await readFacts(conn);
    atStep('planning');
    const plan = demo.planLoad(facts);
    if (plan.refusals.length) throw new Refusal(`\n  ${plan.refusals.join('\n  ')}`);

    console.log('Preconditions: all passed.');
    console.log(`Advisers to set: ${plan.adviserCount}. Class-terms keeping their own columns: ${plan.reusedClassTerms}.`);
    console.log(`Attendance days: ${plan.days[0]} to ${plan.days[plan.days.length - 1]}, ${plan.days.length} class days.`);
    console.log(
      `Pre-confirmed existing accounts: ${demo.CONFIRMED_EXISTING.length}; already confirmed ${plan.alreadyConfirmed}, to confirm ${plan.contacts.length}.`
    );
    console.log(`Names to replace: ${plan.renamedLearners.length} learners, ${plan.renamedGuardians.length} guardians.`);
    console.log('Rows to add:');
    for (const [table, count] of Object.entries(plan.counts)) console.log(`  ${table.padEnd(22)}${String(count).padStart(7)}`);

    if (!apply) {
      await conn.query('ROLLBACK');
      printCounts('Table counts now:', before);
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    const started = Date.now();
    const attendanceWritten = await writeLoad(conn, plan, facts, secrets, before);
    atStep('commit');
    await conn.query('COMMIT');
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    atStep('counting');
    await conn.query('SET search_path TO portal, pg_catalog');
    const after = await tableCounts(conn);
    printCounts('Table counts, before -> after:', before, after);
    if (attendanceWritten !== plan.attendanceRows.length) {
      console.log(`Attendance days already recorded and kept: ${plan.attendanceRows.length - attendanceWritten}.`);
    }
    const kept = keptArgument(plan.keptBySection);
    if (kept) console.log(`Kept learners differ from the seed. Make the login list with: npm run demo:logins -- --kept=${kept}`);
    console.log(`Load committed in ${seconds} seconds.`);
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

module.exports = { COUNT_TABLES, atStep, reportFailure, ownerSettings, connectOwner, begin, tableCounts, printCounts };
