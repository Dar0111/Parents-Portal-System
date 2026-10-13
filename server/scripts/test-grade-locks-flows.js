/**
 * Bulk grade-lock tests (fix/grade-locks, 2026-10-13; the owner's Finding 1).
 * Prerequisite: npm start (or npm run dev)
 *
 * POST /api/grades/locks — admin only: lock or unlock a whole TERM for the
 * whole school, one grade level or one section, with a dry run that previews
 * the counts. The owner's rules, each asserted below:
 *   - a learner is locked only when EVERY subject of their grade level has a
 *     grade this term; anyone else is skipped WHOLE and listed
 *   - inactive learners are out of scope, for lock and unlock alike
 *   - unlock has no completeness check
 *   - one activity_logs row per applied action that changed something, none
 *     for a dry run or a repeat; no notifications
 *   - never an LRN in any response
 * And Finding 1a through the bulk path: once the bulk lock has locked four
 * learners of a class, a column HPS change in that class is refused naming
 * the first three "and 1 more".
 *
 * IT WRITES TO A THROWAWAY CLASS: six learners of its own, created in a
 * Grade 4 section that has no learners at the start (the run stops if there
 * is none), with grade rows inserted directly. Every learner and grade row it
 * creates is deleted in the `finally`. Grade-level and whole-school calls are
 * DRY RUNS only, asserted as invariants — real data is never locked.
 *
 * SIGN-INS ARE READ AT RUN TIME AND NEVER PRINTED: the admin's from
 * proof-backup-loop.js line 172, as test:privacy does; the teacher's and the
 * parent's from test-class-record-flows.js. Nothing here holds a credential.
 *
 * Usage: npm run test:grade-locks
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { pairsFor, countNotificationsFor } = require('./test-helpers/notifications');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const TERM = 2;
const GRADE = 4;
const LAST = 'Bulklock';
const FIRSTS = ['Ana', 'Ben', 'Cara', 'Dan', 'Eli', 'Fe'];
const TAIL = 'for this subject and term — ask an admin to unlock before changing a highest possible score.';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'parents_portal',
};

// Every sign-in accepts the privacy notice and terms first; this run's rows
// go in the finally (scripts/policyFixture.js).
const policy = require('./policyFixture').createPolicyFixture();

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
    console.log(`  ok    ${label}`);
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
  return `status ${res.status}: ${String(res.data?.message || '(no message)').replace(/\d{6,}/g, '<num>')}`;
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
  if (!m) throw new Error('The admin sign-in is not where proof-backup-loop.js keeps it (line 172).');
  return { loginId: m[1], password: m[2] };
}

// The teacher's and the parent's, read from the line that signs them in for
// test:class-record. Never printed.
function classRecordSignIn(variable) {
  const lines = fs.readFileSync(path.join(__dirname, 'test-class-record-flows.js'), 'utf8').split(/\r?\n/);
  const line = lines.find((l) => l.includes(`const ${variable} = await login(`));
  const m = /login\('([^']+)',\s*'([^']+)'\)/.exec(line || '');
  if (!m) throw new Error(`The ${variable} sign-in is not where test-class-record-flows.js keeps it.`);
  return { loginId: m[1], password: m[2] };
}

function hasKeyDeep(value, key) {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === 'object') {
    return Object.keys(value).some((k) => k === key || hasKeyDeep(value[k], key));
  }
  return false;
}

// Twelve digits per learner: one leading digit plus eleven from the clock,
// so two runs never collide. Never printed.
const lrnSuffix = String(Date.now()).slice(-11).padStart(11, '0');

async function main() {
  console.log(`\nBulk grade locks — ${BASE}\n`);

  const createdStudentIds = [];
  const fixtureLrns = [];
  let slotIdsBefore = null;
  let classSection = null;

  const leaksLrn = (res) => hasKeyDeep(res.data, 'lrn') || fixtureLrns.some((l) => res.text.includes(l));

  async function cleanup() {
    let gradeIds = [];
    if (createdStudentIds.length) {
      const [rows] = await withDb((conn) => conn.query('SELECT id FROM grades WHERE student_id IN (?)', [createdStudentIds]));
      gradeIds = rows.map((r) => r.id);
      await withDb((conn) => conn.query('DELETE FROM grades WHERE student_id IN (?)', [createdStudentIds]));
      await withDb((conn) => conn.query('DELETE FROM students WHERE id IN (?)', [createdStudentIds]));
    }
    // A column this run created would only exist if a refusal below failed;
    // only ids that were not there at the start are removed.
    if (classSection && slotIdsBefore) {
      const [slotRows] = await withDb((conn) =>
        conn.query('SELECT id FROM assessment_slots WHERE grade_level = ? AND section = ? AND term = ?', [GRADE, classSection, TERM])
      );
      const extra = slotRows.map((r) => r.id).filter((id) => !slotIdsBefore.has(id));
      if (extra.length) await withDb((conn) => conn.query('DELETE FROM assessment_slots WHERE id IN (?)', [extra]));
    }
    // Neither a bulk lock nor a direct insert notifies anybody; asserted, not
    // deleted.
    const leftover = await withDb((conn) => countNotificationsFor(conn, pairsFor('grade', gradeIds)));
    assert(leftover === 0, 'no notification rows were written for the fixture grades', `found ${leftover}`);
    console.log(`  cleanup: ${createdStudentIds.length} learners and ${gradeIds.length} grade rows removed`);
  }

  try {
    const health = await request('GET', '/api/health');
    requireFixture(health.status === 200, 'the API answers /api/health');

    const admin = adminSignIn();
    const adminLogin = await login(admin.loginId, admin.password);
    requireFixture(adminLogin.status === 200, 'admin signs in', why(adminLogin));
    const adminToken = adminLogin.data.token;
    await policy.accept(adminToken);

    const teacher = classRecordSignIn('teacherLogin');
    const teacherLogin = await login(teacher.loginId, teacher.password);
    requireFixture(teacherLogin.status === 200, 'a teacher signs in', why(teacherLogin));
    const teacherToken = teacherLogin.data.token;
    await policy.accept(teacherToken);

    const parent = classRecordSignIn('parentLogin');
    const parentLogin = await login(parent.loginId, parent.password);
    requireFixture(parentLogin.status === 200, 'a parent signs in', why(parentLogin));
    const parentToken = parentLogin.data.token;
    await policy.accept(parentToken);

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
        break;
      }
    }
    requireFixture(Boolean(classSection), 'a Grade 4 section with no learners exists for the throwaway class');
    const [slotRowsBefore] = await withDb((conn) =>
      conn.query('SELECT id FROM assessment_slots WHERE grade_level = ? AND section = ? AND term = ?', [GRADE, classSection, TERM])
    );
    slotIdsBefore = new Set(slotRowsBefore.map((r) => r.id));

    const subjectsRes = await request('GET', `/api/subjects?grade_level=${GRADE}&limit=200`, { token: adminToken });
    requireFixture(subjectsRes.status === 200 && subjectsRes.data.subjects.length >= 4, 'Grade 4 has at least four subjects', why(subjectsRes));
    const subjects = subjectsRes.data.subjects;
    const S = subjects.length;

    // Six learners: Ana, Ben, Cara and Dan READY (a grade in every subject),
    // Eli INCOMPLETE (three subjects graded, one empty row, the rest none),
    // Fe READY but INACTIVE — out of scope.
    const learners = [];
    for (const [i, first] of FIRSTS.entries()) {
      const lrn = `${i + 1}${lrnSuffix}`;
      fixtureLrns.push(lrn);
      const res = await request('POST', '/api/students', {
        token: adminToken,
        body: { lrn, first_name: first, last_name: LAST, grade_level: GRADE, section: classSection },
      });
      requireFixture(res.status === 201, `learner ${first} is enrolled`, why(res));
      createdStudentIds.push(res.data.student.id);
      learners.push({ id: res.data.student.id, first });
    }
    const [ana, ben, cara, dan, eli, fe] = learners;
    const inactive = await request('PATCH', `/api/students/${fe.id}/status`, { token: adminToken, body: { status: 'inactive' } });
    requireFixture(inactive.status === 200, 'Fe is made inactive', why(inactive));

    const rows = [];
    for (const l of [ana, ben, cara, dan, fe]) {
      for (const s of subjects) rows.push([l.id, s.id, TERM, SCHOOL_YEAR, 85]);
    }
    for (const s of subjects.slice(0, 3)) rows.push([eli.id, s.id, TERM, SCHOOL_YEAR, 85]);
    rows.push([eli.id, subjects[3].id, TERM, SCHOOL_YEAR, null]);
    await withDb((conn) =>
      conn.query('INSERT INTO grades (student_id, subject_id, term, school_year, term_grade) VALUES ?', [rows])
    );

    const lockedCount = async (ids) => {
      const [[r]] = await withDb((conn) =>
        conn.query('SELECT COUNT(*) AS total, COALESCE(SUM(is_locked), 0) AS locked FROM grades WHERE student_id IN (?) AND term = ?', [ids, TERM])
      );
      return { total: Number(r.total), locked: Number(r.locked) };
    };
    const auditCount = async (action) => {
      const [[r]] = await withDb((conn) => conn.query('SELECT COUNT(*) AS n FROM activity_logs WHERE action = ?', [action]));
      return Number(r.n);
    };
    const sectionBody = (extra) => ({ term: TERM, grade_level: GRADE, section: classSection, ...extra });

    // -----------------------------------------------------------------
    console.log('\n--- who may call it, and what it refuses ---');
    // -----------------------------------------------------------------
    const anon = await request('POST', '/api/grades/locks', { body: sectionBody({ lock: true, dry_run: true }) });
    assert(anon.status === 401, `no token is 401 (got ${anon.status})`);
    const asTeacher = await request('POST', '/api/grades/locks', { token: teacherToken, body: sectionBody({ lock: true, dry_run: true }) });
    assert(
      asTeacher.status === 403 && asTeacher.data?.code !== 'POLICY_ACCEPTANCE_REQUIRED',
      `a teacher is refused by role, 403 (got ${asTeacher.status})`
    );
    const asParent = await request('POST', '/api/grades/locks', { token: parentToken, body: sectionBody({ lock: true, dry_run: true }) });
    assert(
      asParent.status === 403 && asParent.data?.code !== 'POLICY_ACCEPTANCE_REQUIRED',
      `a parent is refused by role, 403 (got ${asParent.status})`
    );

    const refusals = [
      [{ term: TERM }, 'lock must be true or false.', 'no lock'],
      [{ lock: 'yes', term: TERM }, 'lock must be true or false.', 'lock as a string'],
      [{ lock: true }, 'term must be 1, 2, or 3.', 'no term'],
      [{ lock: true, term: 4 }, 'term must be 1, 2, or 3.', 'term 4'],
      [{ lock: true, term: TERM, dry_run: 'true' }, 'dry_run must be true or false.', 'dry_run as a string'],
      [{ lock: true, term: TERM, grade_level: 7 }, 'grade_level must be a whole number from 1 to 6.', 'grade 7'],
      [{ lock: true, term: TERM, section: classSection }, 'A section needs a grade level.', 'a section without a grade'],
      [
        { lock: true, term: TERM, grade_level: GRADE, section: 'No Such Section' },
        `There is no Grade ${GRADE} - No Such Section section for ${SCHOOL_YEAR}.`,
        'a section that does not exist',
      ],
    ];
    for (const [body, message, label] of refusals) {
      const res = await request('POST', '/api/grades/locks', { token: adminToken, body });
      assert(res.status === 400 && res.data?.message === message, `400 for ${label}`, why(res));
    }

    // -----------------------------------------------------------------
    console.log('\n--- a dry run previews and writes nothing ---');
    // -----------------------------------------------------------------
    const lockAuditBefore = await auditCount('bulk_grade_lock');
    const unlockAuditBefore = await auditCount('bulk_grade_unlock');
    const dry = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: true, dry_run: true }) });
    assert(dry.status === 200 && dry.data?.dry_run === true && dry.data?.lock === true, 'the dry run answers 200', why(dry));
    assert(
      dry.data.scope?.school_year === SCHOOL_YEAR &&
        dry.data.scope?.term === TERM &&
        dry.data.scope?.grade_level === GRADE &&
        dry.data.scope?.section === classSection,
      'the scope is echoed: school year, term, grade, section'
    );
    assert(dry.data.learners === 5, `five ACTIVE learners are in scope — Fe is not (got ${dry.data.learners})`);
    assert(dry.data.learners_ready === 4, `four are ready (got ${dry.data.learners_ready})`);
    assert(dry.data.records_changed === 4 * S, `4 × ${S} records would lock (got ${dry.data.records_changed})`);
    assert(dry.data.learners_changed === 4 && dry.data.records_already === 0, 'four learners would change, none already locked');
    assert(
      Array.isArray(dry.data.skipped) &&
        dry.data.skipped.length === 1 &&
        dry.data.skipped[0].student_id === eli.id &&
        dry.data.skipped[0].name === `${LAST}, Eli` &&
        dry.data.skipped[0].grade_level === GRADE &&
        dry.data.skipped[0].section === classSection &&
        dry.data.skipped[0].pending === S - 3 &&
        dry.data.skipped[0].subjects === S,
      'Eli is skipped whole and listed: "Last, First", class, pending of subjects (the empty row counts as pending)'
    );
    assert(!leaksLrn(dry), 'no LRN anywhere in the dry run — no `lrn` key, no fixture LRN');
    const afterDry = await lockedCount(createdStudentIds);
    assert(afterDry.locked === 0, 'the dry run locked nothing');
    assert(
      (await auditCount('bulk_grade_lock')) === lockAuditBefore,
      'the dry run wrote no activity_logs row'
    );

    // Grade level and whole school: DRY RUNS ONLY, invariants only — the live
    // database has real learners, and a run must never lock them.
    const gradeDry = await request('POST', '/api/grades/locks', { token: adminToken, body: { lock: true, term: TERM, grade_level: GRADE, dry_run: true } });
    assert(
      gradeDry.status === 200 &&
        gradeDry.data.learners >= 5 &&
        gradeDry.data.records_changed >= 4 * S &&
        gradeDry.data.skipped.some((r) => r.student_id === eli.id) &&
        !gradeDry.data.skipped.some((r) => r.student_id === ana.id) &&
        gradeDry.data.scope.section === null,
      'the Grade 4 dry run counts the class and lists Eli, not Ana',
      why(gradeDry)
    );
    assert(!leaksLrn(gradeDry), 'no LRN in the Grade 4 dry run');
    const schoolDry = await request('POST', '/api/grades/locks', { token: adminToken, body: { lock: true, term: TERM, dry_run: true } });
    assert(
      schoolDry.status === 200 &&
        schoolDry.data.learners >= 5 &&
        schoolDry.data.scope.grade_level === null &&
        schoolDry.data.skipped.some((r) => r.student_id === eli.id),
      'the whole-school dry run answers and lists Eli',
      why(schoolDry)
    );
    assert(!leaksLrn(schoolDry), 'no LRN in the whole-school dry run');
    assert((await lockedCount(createdStudentIds)).locked === 0, 'neither wider dry run locked anything');

    // -----------------------------------------------------------------
    console.log('\n--- lock a section ---');
    // -----------------------------------------------------------------
    const lock = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: true }) });
    assert(
      lock.status === 200 && lock.data.dry_run === false && lock.data.records_changed === 4 * S && lock.data.learners_changed === 4,
      `the lock locks 4 × ${S} records for four learners`,
      why(lock)
    );
    assert(!leaksLrn(lock), 'no LRN in the lock response');
    assert((await lockedCount([ana.id, ben.id, cara.id, dan.id])).locked === 4 * S, "every one of the four ready learners' rows is locked");
    assert((await lockedCount([eli.id])).locked === 0, "Eli's rows stay unlocked — skipped whole");
    assert((await lockedCount([fe.id])).locked === 0, "Fe's rows stay unlocked — inactive, out of scope");
    assert((await auditCount('bulk_grade_lock')) === lockAuditBefore + 1, 'one activity_logs row for the applied lock');

    const repeat = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: true }) });
    assert(
      repeat.status === 200 && repeat.data.records_changed === 0 && repeat.data.records_already === 4 * S,
      'a repeat changes nothing and reports them as already locked',
      why(repeat)
    );
    assert((await auditCount('bulk_grade_lock')) === lockAuditBefore + 1, 'a repeat that changes nothing writes no activity_logs row');

    // -----------------------------------------------------------------
    console.log('\n--- Finding 1a through the bulk lock: four locked learners ---');
    // -----------------------------------------------------------------
    const classKey = { subject_id: subjects[0].id, grade_level: GRADE, section: classSection, term: TERM, school_year: SCHOOL_YEAR };
    const newHps = { type: 'WW', slot_no: 1, max_score: 10 };
    const hpsSave = await request('PUT', '/api/grades/class-record', { token: adminToken, body: { ...classKey, slots: [newHps] } });
    assert(
      hpsSave.status === 409 &&
        hpsSave.data?.message === `Nothing was saved. Ana ${LAST}, Ben ${LAST}, Cara ${LAST} and 1 more have locked grades ${TAIL}`,
      'four locked learners: the first three are named, "and 1 more", "have locked grades"',
      why(hpsSave)
    );
    assert(!leaksLrn(hpsSave), 'no LRN in the refusal');
    const hpsDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [newHps] },
    });
    assert(
      hpsDry.status === 409 && hpsDry.data?.message === `Ana ${LAST}, Ben ${LAST}, Cara ${LAST} and 1 more have locked grades ${TAIL}`,
      'the dry run says the same without "Nothing was saved."',
      why(hpsDry)
    );
    const [slotRowsNow] = await withDb((conn) =>
      conn.query('SELECT id FROM assessment_slots WHERE grade_level = ? AND section = ? AND term = ?', [GRADE, classSection, TERM])
    );
    assert(slotRowsNow.every((r) => slotIdsBefore.has(r.id)), 'no column was created by the refused saves');

    // -----------------------------------------------------------------
    console.log('\n--- unlock a section: no completeness check, inactive untouched ---');
    // -----------------------------------------------------------------
    const [[eliRow]] = await withDb((conn) =>
      conn.query('SELECT id FROM grades WHERE student_id = ? AND term = ? AND term_grade IS NOT NULL ORDER BY id LIMIT 1', [eli.id, TERM])
    );
    const [[feRow]] = await withDb((conn) =>
      conn.query('SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND term = ? LIMIT 1', [fe.id, subjects[0].id, TERM])
    );
    const lockEli = await request('PATCH', `/api/grades/${eliRow.id}/lock`, { token: adminToken, body: { is_locked: true } });
    const lockFe = await request('PATCH', `/api/grades/${feRow.id}/lock`, { token: adminToken, body: { is_locked: true } });
    requireFixture(lockEli.status === 200 && lockFe.status === 200, "one of Eli's rows and one of Fe's are locked singly");

    const unlockDry = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: false, dry_run: true }) });
    assert(
      unlockDry.status === 200 &&
        unlockDry.data.records_changed === 4 * S + 1 &&
        unlockDry.data.learners_changed === 5 &&
        unlockDry.data.learners_ready === null &&
        Array.isArray(unlockDry.data.skipped) &&
        unlockDry.data.skipped.length === 0,
      `the unlock preview counts 4 × ${S} + 1 records for five learners — Eli's incomplete row included, nobody skipped`,
      why(unlockDry)
    );
    assert((await auditCount('bulk_grade_unlock')) === unlockAuditBefore, 'the unlock dry run wrote no activity_logs row');

    const unlock = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: false }) });
    assert(unlock.status === 200 && unlock.data.records_changed === 4 * S + 1, `the unlock unlocks 4 × ${S} + 1 records`, why(unlock));
    assert(!leaksLrn(unlock), 'no LRN in the unlock response');
    assert((await lockedCount([ana.id, ben.id, cara.id, dan.id, eli.id])).locked === 0, 'every active learner is unlocked');
    assert((await lockedCount([fe.id])).locked === 1, "Fe's single lock stays — inactive learners are out of scope for unlock too");
    assert((await auditCount('bulk_grade_unlock')) === unlockAuditBefore + 1, 'one activity_logs row for the applied unlock');

    const unlockRepeat = await request('POST', '/api/grades/locks', { token: adminToken, body: sectionBody({ lock: false }) });
    assert(unlockRepeat.status === 200 && unlockRepeat.data.records_changed === 0, 'a repeat unlock changes nothing', why(unlockRepeat));
    assert((await auditCount('bulk_grade_unlock')) === unlockAuditBefore + 1, 'and writes no activity_logs row');

    // Fe is inactive, but her row is still a locked row of this class: 1a
    // counts locked learners of ANY status, because a column change would
    // still rewrite her materialised maximum.
    const feBlocks = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [newHps] },
    });
    assert(
      feBlocks.status === 409 && feBlocks.data?.message === `Fe ${LAST} has a locked grade ${TAIL}`,
      "an inactive learner's locked row still freezes the class's HPS, named alone",
      why(feBlocks)
    );
    const unlockFe = await request('PATCH', `/api/grades/${feRow.id}/lock`, { token: adminToken, body: { is_locked: false } });
    requireFixture(unlockFe.status === 200, "Fe's single lock is lifted");

    // With nobody locked, the HPS change from above is no longer refused —
    // proved as a dry run, so the throwaway class gets no column.
    const freeDry = await request('PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...classKey, dry_run: true, slots: [newHps] },
    });
    assert(freeDry.status === 200, `with nobody locked the same HPS change is allowed again (got ${freeDry.status})`, why(freeDry));
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Suite crashed:', err.message);
  process.exit(1);
});
