#!/usr/bin/env node
// P4 PART B — CONCURRENCY (D-261, the plan's matrix rows C1, C2, C3 and P1).
// On this run's disposable database only, after a fresh db:setup. Starts its
// own API on 5010. Every fixture is run-made (accounts, learners, grades);
// the database is checked on the observer's own connection, never through the
// API. Interleavings are STAGED with a lock held on a separate "fault"
// connection, so the order is the test's and not the scheduler's.
//
//   C1  two acknowledgements of one fully locked term at once. Documented:
//       201 the first time, 200 on a repeat. grades.js:2249-2252 takes FOR
//       UPDATE on a row that does not exist yet, which locks nothing under
//       READ COMMITTED, so both reach the INSERT; the second meets
//       uq_grade_ack_term. Staged: the notifications table held EXCLUSIVE, so
//       the first waits after its INSERT and the second waits on its key.
//       Then a burst of 10 with nothing held.
//  C2  ten identical assignment creates at once: one 201, the rest 409
//       (assignments.js:247-254 maps 23505), exactly one row.
//  C3  a highest-possible-score change against the bulk lock. The save's
//       locked-learner check (grades.js:1505-1513) is a plain read; the lock
//       takes the grade rows FOR UPDATE (:2432-2438) and no slot row. Staged:
//       assessment_slots held EXCLUSIVE, so the save passes its check and
//       waits at its first slot write (:1556) while the lock commits. The rule
//       (API_REFERENCE, the class record): with a learner locked the HPS must
//       not change. Control: the same change sent after the lock is 409.
//  P1  the pool exhausted behind a held row lock (KNOWN_ISSUES: a row-lock
//       wait has no limit outside three paths): health must answer 503 within
//       the 10 s connect timeout + 5 s, and everything must recover on release.
const h = require('../lib/p4b');

h.assertIsolation();
const BASE = process.env.API_BASE;
const TIMEOUT_MS = 10000; // config/db.js connectionTimeoutMillis
const GRACE_MS = 5000; // the owner's answer 9

async function main() {
  const checks = h.makeChecks('concurrency');
  const obs = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  const fault = await h.superClient(process.env.PG_DATABASE, 'p4b-fault');
  const report = { measured: {} };
  let api = null;
  try {
    const year = await h.schoolYear(obs);
    // ---- fixtures -----------------------------------------------------------
    const admin = await h.makeAccount(obs, { role: 'admin', name: 'P4B Admin' });
    const adviser = await h.makeAccount(obs, { role: 'teacher', name: 'P4B Adviser' });
    const subjectTeacher = await h.makeAccount(obs, { role: 'teacher', name: 'P4B Subject Teacher' });
    const g5 = await h.emptySection(obs, 5, year);
    await obs.query('UPDATE portal.sections SET adviser_id = $1 WHERE id = $2', [adviser.id, g5.sectionId]);
    const learner = await h.makeLearner(obs, { ...g5, last: 'Ack' });
    const parent = await h.makeAccount(obs, { role: 'parent', name: 'P4B Parent', studentId: learner.id, login: learner.lrn });
    const g5Subjects = await h.subjectIds(obs, 5);
    await h.gradeAll(obs, { studentId: learner.id, subjects: g5Subjects, term: 1, year, locked: 1 });

    const g4 = await h.emptySection(obs, 4, year);
    const g4Subjects = await h.subjectIds(obs, 4);
    const g4Learners = [];
    for (let i = 0; i < 3; i += 1) g4Learners.push(await h.makeLearner(obs, { ...g4, last: `Race${i}` }));
    for (const l of g4Learners) await h.gradeAll(obs, { studentId: l.id, subjects: g4Subjects, term: 1, year, locked: 0 });
    const { rows: slotRows } = await obs.query(
      `INSERT INTO portal.assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
       VALUES ($1, 4, $2, 1, $3, 'WW', 1, 20) RETURNING id`,
      [g4Subjects[0], g4.section, year]
    );
    const slotId = slotRows[0].id;
    // one learner holds a score in that column, so C3 can see whether a locked
    // learner's own stored maximum is rewritten too
    const { rows: g0 } = await obs.query(
      'SELECT id FROM portal.grades WHERE student_id = $1 AND subject_id = $2 AND term = 1',
      [g4Learners[0].id, g4Subjects[0]]
    );
    const { rows: compRows } = await obs.query(
      `INSERT INTO portal.grade_components (grade_id, slot_id, type, score, max_score) VALUES ($1, $2, 'WW', 18, 20) RETURNING id`,
      [g0[0].id, slotId]
    );
    const componentId = compRows[0].id;
    h.say(`fixtures: Grade 5 class (${g5Subjects.length} subjects locked for one learner), Grade 4 class of ${g4Learners.length} (${g4Subjects.length} subjects), one WW slot at 20`);

    api = h.spawnApi({ port: 5010 });
    const ready = await api.ready;
    checks.check('the API on 5010 started', ready.ok, api.tail.slice(-5));
    const adminToken = await h.signIn(BASE, admin);
    const parentToken = await h.signIn(BASE, parent);
    const before = await h.observe(obs, 'before');

    // ---- C2 -------------------------------------------------------------------
    h.say('\nC2 ten identical assignment creates at once');
    const body = { teacher_id: subjectTeacher.id, subject_id: g5Subjects[0], section: g5.section };
    const c2 = await Promise.all(Array.from({ length: 10 }, () => h.call(BASE, 'POST', '/api/assignments', { token: adminToken, body })));
    const c2Status = c2.map((r) => r.status).sort();
    const { rows: c2Rows } = await obs.query(
      'SELECT count(*)::int AS n FROM portal.teacher_assignments WHERE teacher_id = $1 AND subject_id = $2 AND section = $3',
      [subjectTeacher.id, g5Subjects[0], g5.section]
    );
    checks.check('C2 exactly one assignment row (read on the observer connection)', c2Rows[0].n === 1, c2Rows[0].n);
    checks.expect('C2 one 201 and nine 409, no 500', c2Status.filter((s) => s === 201).length === 1 && c2Status.filter((s) => s === 409).length === 9, c2Status.join(','));
    report.measured.c2 = c2Status;

    // ---- C1 staged --------------------------------------------------------------
    h.say('\nC1 two acknowledgements of one term at once (staged)');
    await fault.query('BEGIN');
    await fault.query('LOCK TABLE portal.notifications IN EXCLUSIVE MODE');
    const pA = h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } });
    await h.sleep(200);
    const pB = h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } });
    const staged = await h.waitFor(async () => (await h.waitingOnLock(obs)) >= 2, { timeoutMs: 10000 });
    checks.check('C1 both requests reached the database and wait (the interleaving is staged)', staged.ok, `${staged.ms} ms`);
    await fault.query('ROLLBACK');
    const [rA, rB] = await Promise.all([pA, pB]);
    const c1Status = [rA.status, rB.status].sort();
    const { rows: c1Rows } = await obs.query(
      'SELECT count(*)::int AS n FROM portal.grade_acknowledgements WHERE student_id = $1 AND school_year = $2 AND term = 1',
      [learner.id, year]
    );
    checks.check('C1 exactly one acknowledgement row', c1Rows[0].n === 1, c1Rows[0].n);
    checks.expect(
      'C1 the replies are 201 and 200 ("Already confirmed"), never 500',
      c1Status[0] === 200 && c1Status[1] === 201,
      `replies ${c1Status.join(' + ')}`,
      'LOW'
    );
    report.measured.c1Staged = c1Status;

    // ---- C1 burst ---------------------------------------------------------------
    h.say('\nC1 a burst of ten, nothing held');
    await obs.query('DELETE FROM portal.grade_acknowledgements WHERE student_id = $1', [learner.id]);
    await obs.query("DELETE FROM portal.notifications WHERE type = 'grades_acknowledged' AND user_id = $1", [adviser.id]);
    const burst = await Promise.all(Array.from({ length: 10 }, () => h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } })));
    const burstStatus = burst.map((r) => r.status);
    const histogram = burstStatus.reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
    const { rows: c1bRows } = await obs.query(
      'SELECT count(*)::int AS n FROM portal.grade_acknowledgements WHERE student_id = $1 AND term = 1',
      [learner.id]
    );
    checks.check('C1 burst: exactly one acknowledgement row', c1bRows[0].n === 1, c1bRows[0].n);
    checks.expect('C1 burst: one 201, the rest 200, no 500', histogram[201] === 1 && histogram[200] === 9, JSON.stringify(histogram), 'LOW');
    report.measured.c1Burst = histogram;

    // ---- C3 -----------------------------------------------------------------------
    h.say('\nC3 a highest-possible-score change against the bulk lock (staged)');
    const key = { subject_id: g4Subjects[0], grade_level: 4, section: g4.section, term: 1, school_year: year };
    const lockedBefore = await obs.query(
      `SELECT g.id, g.term_grade::text AS v FROM portal.grades g JOIN portal.students s ON s.id = g.student_id
        WHERE s.grade_level = 4 AND s.section = $1 AND g.term = 1 ORDER BY g.id`,
      [g4.section]
    );
    await fault.query('BEGIN');
    await fault.query('LOCK TABLE portal.assessment_slots IN EXCLUSIVE MODE');
    const pPut = h.call(BASE, 'PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...key, slots: [{ type: 'WW', slot_no: 1, max_score: 25 }] },
    });
    const putWaits = await h.waitFor(async () => (await h.waitingOnLock(obs)) >= 1, { timeoutMs: 10000 });
    checks.check('C3 the save passed its check and waits at its first slot write', putWaits.ok, `${putWaits.ms} ms`);
    const lockReply = await h.call(BASE, 'POST', '/api/grades/locks', {
      token: adminToken,
      body: { lock: true, term: 1, grade_level: 4, section: g4.section },
    });
    checks.check('C3 the bulk lock committed while the save waited', lockReply.status === 200 && lockReply.data && lockReply.data.learners_changed === 3, `${lockReply.status} ${lockReply.data ? lockReply.data.learners_changed : ''}`);
    await fault.query('ROLLBACK');
    const putReply = await pPut;
    const { rows: slotAfter } = await obs.query('SELECT max_score::text AS m FROM portal.assessment_slots WHERE id = $1', [slotId]);
    const lockedAfter = await obs.query(
      `SELECT g.id, g.term_grade::text AS v, g.is_locked FROM portal.grades g JOIN portal.students s ON s.id = g.student_id
        WHERE s.grade_level = 4 AND s.section = $1 AND g.term = 1 ORDER BY g.id`,
      [g4.section]
    );
    const allLocked = lockedAfter.rows.every((r) => r.is_locked === 1);
    const valuesKept = lockedAfter.rows.every((r, i) => lockedBefore.rows[i] && r.v === lockedBefore.rows[i].v);
    checks.check('C3 every grade row of the class is locked after the lock', allLocked);
    checks.check('C3 no locked grade VALUE changed (the recompute backstop: is_locked = 0 rows only)', valuesKept);
    checks.expect(
      'C3 with the class locked, the HPS did not change (the save was refused, or its change did not land)',
      putReply.status === 409 || slotAfter[0].m === '20.00',
      `save ${putReply.status}, slot max now ${slotAfter[0].m} (was 20.00), lock ${lockReply.status}`,
      'MEDIUM'
    );
    const { rows: compAfter } = await obs.query('SELECT score::text AS s, max_score::text AS m FROM portal.grade_components WHERE id = $1', [componentId]);
    checks.expect(
      'C3 a locked learner\'s stored score row keeps its maximum',
      compAfter[0] && compAfter[0].m === '20.00',
      `score ${compAfter[0] ? compAfter[0].s : '-'} of max ${compAfter[0] ? compAfter[0].m : '-'} (was 18.00 of 20.00)`,
      'MEDIUM'
    );
    report.measured.c3 = { save: putReply.status, slotMax: slotAfter[0].m, lock: lockReply.status, valuesKept, componentMax: compAfter[0] ? compAfter[0].m : null };
    // control: the same kind of change sent AFTER the lock, serialized
    const ctl = await h.call(BASE, 'PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...key, slots: [{ type: 'WW', slot_no: 1, max_score: 30 }] },
    });
    checks.check('C3 control: serialized after the lock, an HPS change is refused 409', ctl.status === 409, ctl.status);

    // ---- P1 -------------------------------------------------------------------------
    h.say('\nP1 the pool exhausted behind a held row lock');
    const { rows: keyRows } = await obs.query("SELECT 1 FROM portal.system_settings WHERE setting_key = 'school_phone'");
    checks.check('P1 the school_phone setting row exists', keyRows.length === 1);
    await fault.query('BEGIN');
    await fault.query("SELECT 1 FROM portal.system_settings WHERE setting_key = 'school_phone' FOR UPDATE");
    const writes = Array.from({ length: 12 }, () =>
      h.call(BASE, 'PUT', '/api/settings/school_phone', { token: adminToken, body: { value: '0288881234' } })
    );
    const tenWait = await h.waitFor(async () => (await h.waitingOnLock(obs)) >= 10, { timeoutMs: 15000 });
    checks.check('P1 ten writes hold the ten pool connections, waiting on the row', tenWait.ok, `${tenWait.ms} ms`);
    const health = await h.call(BASE, 'GET', '/api/health');
    checks.expect(`P1 health answers 503 within ${TIMEOUT_MS + GRACE_MS} ms while the pool is exhausted`, health.status === 503 && health.ms <= TIMEOUT_MS + GRACE_MS, `${health.status} in ${health.ms} ms`, 'MEDIUM');
    report.measured.p1Health = { status: health.status, ms: health.ms };
    const releasedAt = Date.now();
    await fault.query('ROLLBACK');
    const results = await Promise.all(writes);
    const hist = results.map((r) => r.status).reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
    h.say(`  info  P1 the twelve writes: ${JSON.stringify(hist)}`);
    const back = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 200, { timeoutMs: TIMEOUT_MS + GRACE_MS });
    checks.check(`P1 health is 200 again within ${TIMEOUT_MS + GRACE_MS} ms of the release`, back.ok, `${Date.now() - releasedAt} ms`);
    checks.check('P1 the ten waiting writes completed 200 after the release', (hist[200] || 0) >= 10, JSON.stringify(hist));
    checks.note('P1 the two that found no free connection (a route\'s own catch answers; only the auth middleware maps an outage to 503)', JSON.stringify(hist));
    report.measured.p1 = { writes: hist, recoveryMs: Date.now() - releasedAt };

    // ---- after ----------------------------------------------------------------------
    await h.sleep(500);
    const after = await h.observe(obs, 'after');
    checks.check('the API process stayed up throughout', api.alive());
    checks.check('no session left idle in a transaction, no prepared transaction', after.sessions.idleInTx === 0 && after.sessions.prepared === 0, after.sessions);
    checks.check('the API holds at most its pool of 10 connections', (after.sessions.byApp['parents-portal-api'] || 0) <= 10, after.sessions.byApp);
    checks.check('every sequence ahead of its highest id, none moved backwards', h.sequenceViolations(after, before).length === 0, h.sequenceViolations(after, before));
    report.unexpectedTables = h.unexpectedChanges(before, after, [
      'teacher_assignments',
      'grade_acknowledgements',
      'notifications',
      'grades',
      'assessment_slots',
      'grade_components',
      'system_settings',
      'activity_logs',
      'login_attempts',
    ]);
    checks.check('no table changed but the ones these writes touch', report.unexpectedTables.length === 0, report.unexpectedTables);
  } finally {
    await fault.query('ROLLBACK').catch(() => {});
    if (api) await h.killApi(api);
    await fault.end().catch(() => {});
    await obs.end().catch(() => {});
  }
  const s = checks.summary();
  report.summary = { passed: s.passed, failed: s.failed, findings: s.findings };
  h.say(`report: ${h.writeReport('concurrency', report)}`);
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`concurrency error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
