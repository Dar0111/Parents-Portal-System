#!/usr/bin/env node
// P4 PART B — TRANSACTION ROLLBACK (D-261, the plan's rows T1, F4 and S3). On
// this run's disposable database only, after a fresh db:setup; starts its own
// API on 5010; run-made fixtures; every result read on the observer's own
// connection.
//
//   T1  a failure INJECTED part-way through four real multi-statement writes:
//       a test trigger (AFTER ROW, created for the case on this database only,
//       dropped in finally and asserted gone, as sequence-rollback.js did)
//       raises inside the route's transaction —
//         a  the class-record save: a slot rename, then a score insert that fails
//         b  the excuse review: the letter's update, then the attendance write that fails
//         c  the acknowledgement: its insert, then the adviser's notification that fails
//         d  the bulk lock: the grade-row update that fails on the class's last row
//       Each must answer an error and leave EVERY table as it was (content
//       hashes, not just counts). Control: the same request without the
//       trigger succeeds and changes exactly the tables it should.
//   F4  the API process KILLED while a class-record save waits inside its
//       transaction (staged behind a lock on assessment_slots): nothing lands;
//       a restarted API saves the same change.
//   S3  ids burned by the failed inserts are never handed out again.
const h = require('../lib/p4b');

h.assertIsolation();
const BASE = process.env.API_BASE;
const NOISE = ['activity_logs', 'login_attempts'];

const FN = 'portal.p4b_inject_failure';
const TRIGGER = 'p4b_inject_failure';

async function plant(c, table, events, onId = null) {
  await c.query(
    `CREATE OR REPLACE FUNCTION ${FN}() RETURNS trigger LANGUAGE plpgsql AS $f$
     BEGIN
       IF TG_ARGV[0] = 'any' OR NEW.id::text = TG_ARGV[0] THEN
         RAISE EXCEPTION 'p4b injected failure on %', TG_TABLE_NAME USING ERRCODE = 'P0001';
       END IF;
       RETURN NEW;
     END $f$`
  );
  await c.query(
    `CREATE TRIGGER ${TRIGGER} AFTER ${events} ON portal.${h.quoteIdent(table)}
       FOR EACH ROW EXECUTE FUNCTION ${FN}('${onId === null ? 'any' : String(Number(onId))}')`
  );
}

async function unplant(c, table) {
  await c.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON portal.${h.quoteIdent(table)}`);
  await c.query(`DROP FUNCTION IF EXISTS ${FN}()`);
  const { rows: t } = await c.query('SELECT count(*)::int AS n FROM pg_catalog.pg_trigger WHERE tgname = $1', [TRIGGER]);
  const { rows: f } = await c.query(
    `SELECT count(*)::int AS n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'portal' AND p.proname = 'p4b_inject_failure'`
  );
  return t[0].n === 0 && f[0].n === 0;
}

async function main() {
  const checks = h.makeChecks('rollback');
  const obs = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  const fault = await h.superClient(process.env.PG_DATABASE, 'p4b-fault');
  const report = { cases: {} };
  let api = null;
  const planted = new Set();
  try {
    const year = await h.schoolYear(obs);
    const admin = await h.makeAccount(obs, { role: 'admin', name: 'P4B Admin' });
    const adviser = await h.makeAccount(obs, { role: 'teacher', name: 'P4B Adviser' });
    const g5 = await h.emptySection(obs, 5, year);
    await obs.query('UPDATE portal.sections SET adviser_id = $1 WHERE id = $2', [adviser.id, g5.sectionId]);
    const learner = await h.makeLearner(obs, { ...g5, last: 'Rollback' });
    const parent = await h.makeAccount(obs, { role: 'parent', name: 'P4B Parent', studentId: learner.id, login: learner.lrn });
    await h.gradeAll(obs, { studentId: learner.id, subjects: await h.subjectIds(obs, 5), term: 1, year, locked: 1 });
    const day = h.firstClassDay();
    const { rows: letterRows } = await obs.query(
      `INSERT INTO portal.excuse_letters (student_id, parent_id, absence_date, reason, status)
       VALUES ($1, $2, $3, 'P4B fixture letter', 'Pending') RETURNING id`,
      [learner.id, parent.id, day]
    );
    const letterId = letterRows[0].id;

    const g4Subjects = await h.subjectIds(obs, 4);
    const classes = [];
    for (let k = 0; k < 3; k += 1) {
      const sec = await h.emptySection(obs, 4, year); // the previous one now holds learners
      const learners = [];
      for (let i = 0; i < 2; i += 1) learners.push(await h.makeLearner(obs, { ...sec, last: `Tx${k}${i}` }));
      const gradeIds = [];
      for (const l of learners) gradeIds.push(...(await h.gradeAll(obs, { studentId: l.id, subjects: g4Subjects, term: 1, year, locked: 0 })));
      const { rows } = await obs.query(
        `INSERT INTO portal.assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
         VALUES ($1, 4, $2, 1, $3, 'WW', 1, 20) RETURNING id`,
        [g4Subjects[0], sec.section, year]
      );
      classes.push({ ...sec, learners, gradeIds, slotId: rows[0].id });
    }
    const keyOf = (cls) => ({ subject_id: g4Subjects[0], grade_level: 4, section: cls.section, term: 1, school_year: year });
    h.say(`fixtures: a Grade 5 learner with a locked term, a Pending letter on a class day, three Grade 4 classes of 2`);

    api = h.spawnApi({ port: 5010 });
    checks.check('the API on 5010 started', (await api.ready).ok, api.tail.slice(-5));
    const adminToken = await h.signIn(BASE, admin);
    const adviserToken = await h.signIn(BASE, adviser);
    const parentToken = await h.signIn(BASE, parent);
    const baseline = await h.observe(obs, 'baseline');

    const cases = [
      {
        id: 'T1a',
        label: 'the class-record save (a slot rename, then a score insert that fails)',
        table: 'grade_components',
        events: 'INSERT',
        request: () =>
          h.call(BASE, 'PUT', '/api/grades/class-record', {
            token: adminToken,
            body: {
              ...keyOf(classes[0]),
              slots: [{ type: 'WW', slot_no: 1, name: 'P4B renamed', max_score: 20 }],
              entries: [{ student_id: classes[0].learners[0].id, scores: [{ slot_id: classes[0].slotId, score: 15 }] }],
            },
          }),
        controlChanges: ['assessment_slots', 'grade_components', 'grades'],
      },
      {
        id: 'T1b',
        label: 'the excuse review (the letter, then the attendance write that fails)',
        table: 'attendance',
        events: 'INSERT OR UPDATE',
        request: () => h.call(BASE, 'PATCH', `/api/excuse-letters/${letterId}/review`, { token: adviserToken, body: { status: 'Approved' } }),
        controlChanges: ['excuse_letters', 'attendance'],
      },
      {
        id: 'T1c',
        label: 'the acknowledgement (its insert, then the notification that fails)',
        table: 'notifications',
        events: 'INSERT',
        request: () => h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } }),
        controlChanges: ['grade_acknowledgements'],
        sequence: 'grade_acknowledgements',
      },
      {
        id: 'T1d',
        label: 'the bulk lock (the update fails on the class\'s last grade row)',
        table: 'grades',
        events: 'UPDATE',
        onId: () => Math.max(...classes[1].gradeIds),
        request: () => h.call(BASE, 'POST', '/api/grades/locks', { token: adminToken, body: { lock: true, term: 1, grade_level: 4, section: classes[1].section } }),
        controlChanges: ['grades'],
      },
    ];

    for (const tc of cases) {
      h.say(`\n${tc.id} ${tc.label}`);
      const before = await h.observe(obs, `${tc.id}-before`);
      await plant(fault, tc.table, tc.events, tc.onId ? tc.onId() : null);
      planted.add(tc.table);
      const r = await tc.request();
      await h.sleep(300);
      const failedAt = await h.observe(obs, `${tc.id}-failed`);
      const unexpected = h.unexpectedChanges(before, failedAt, NOISE);
      checks.check(`${tc.id} the injected failure answers an error (no 2xx)`, r.status >= 400, r.status);
      checks.check(`${tc.id} every table is as it was (content hashes)`, unexpected.length === 0, unexpected);
      checks.check(`${tc.id} no session left idle in a transaction`, failedAt.sessions.idleInTx === 0, failedAt.sessions);
      const gone = await unplant(fault, tc.table);
      planted.delete(tc.table);
      checks.check(`${tc.id} the test trigger is gone`, gone);
      const rc = await tc.request();
      await h.sleep(300);
      const done = await h.observe(obs, `${tc.id}-control`);
      const changed = h.changedTables(failedAt, done).filter((t) => !NOISE.includes(t));
      const missing = tc.controlChanges.filter((t) => !changed.includes(t));
      checks.check(`${tc.id} control: without the trigger the same request succeeds`, rc.status >= 200 && rc.status < 300, rc.status);
      checks.check(`${tc.id} control: it changes the tables it should (${tc.controlChanges.join(', ')})`, missing.length === 0, { changed, missing });
      if (tc.sequence) {
        // S3: the failed insert burned an id; the successful one is past it
        const burnedNext = h.nextValue(failedAt, tc.sequence);
        const { rows } = await obs.query(`SELECT max(id)::bigint AS m FROM portal.${tc.sequence}`);
        checks.check(
          `S3 ${tc.sequence}: the id the failed insert burned is never handed out (the new row's id >= ${burnedNext})`,
          Number(rows[0].m) >= burnedNext && burnedNext > h.nextValue(before, tc.sequence),
          { before: h.nextValue(before, tc.sequence), afterFailure: burnedNext, newRow: Number(rows[0].m) }
        );
      }
      report.cases[tc.id] = { failure: r.status, control: rc.status, unexpected, changed };
    }

    // ---- F4 -----------------------------------------------------------------
    h.say('\nF4 the API killed while a class-record save waits inside its transaction');
    const f4 = classes[2];
    const beforeKill = await h.observe(obs, 'F4-before');
    await fault.query('BEGIN');
    await fault.query('LOCK TABLE portal.assessment_slots IN EXCLUSIVE MODE');
    const pending = h.call(BASE, 'PUT', '/api/grades/class-record', {
      token: adminToken,
      body: { ...keyOf(f4), slots: [{ type: 'WW', slot_no: 1, max_score: 22 }] },
    });
    const waits = await h.waitFor(async () => (await h.waitingOnLock(obs)) >= 1, { timeoutMs: 10000 });
    checks.check('F4 the save is inside its transaction, waiting', waits.ok);
    await h.killApi(api);
    const killed = await pending;
    checks.check('F4 the API process is gone and 5010 closed', !api.alive() && (await h.probePort(5010)) === 'closed');
    await fault.query('ROLLBACK');
    const drained = await h.waitFor(async () => {
      const { rows } = await obs.query(
        "SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND application_name = 'parents-portal-api'"
      );
      return rows[0].n === 0;
    }, { timeoutMs: 30000, intervalMs: 250 });
    checks.check('F4 the dead API\'s sessions end on their own once the lock is released', drained.ok, `${drained.ms} ms`);
    const afterKill = await h.observe(obs, 'F4-after');
    const unexpected = h.unexpectedChanges(beforeKill, afterKill, NOISE);
    checks.check('F4 nothing of the save landed (every table as it was)', unexpected.length === 0, unexpected);
    const { rows: slotNow } = await obs.query('SELECT max_score::text AS m FROM portal.assessment_slots WHERE id = $1', [f4.slotId]);
    checks.check('F4 the slot still holds 20', slotNow[0].m === '20.00', slotNow[0].m);
    h.say(`  info  F4 the client saw: ${killed.status === 0 ? `no reply (${killed.error})` : killed.status}`);
    api = h.spawnApi({ port: 5010 });
    checks.check('F4 a restarted API comes up', (await api.ready).ok, api.tail.slice(-5));
    const adminToken2 = await h.signIn(BASE, admin);
    const again = await h.call(BASE, 'PUT', '/api/grades/class-record', {
      token: adminToken2,
      body: { ...keyOf(f4), slots: [{ type: 'WW', slot_no: 1, max_score: 22 }] },
    });
    const { rows: slotThen } = await obs.query('SELECT max_score::text AS m FROM portal.assessment_slots WHERE id = $1', [f4.slotId]);
    checks.check('F4 control: the restarted API saves the same change', again.status === 200 && slotThen[0].m === '22.00', `${again.status} ${slotThen[0].m}`);
    report.cases.F4 = { clientSaw: killed.status, drainedMs: drained.ms, unexpected };

    const end = await h.observe(obs, 'end');
    checks.check('every sequence ahead of its highest id, none moved backwards', h.sequenceViolations(end, baseline).length === 0, h.sequenceViolations(end, baseline));
    checks.check('no session left idle in a transaction, no prepared transaction', end.sessions.idleInTx === 0 && end.sessions.prepared === 0, end.sessions);
  } finally {
    await fault.query('ROLLBACK').catch(() => {});
    for (const t of planted) await unplant(fault, t).catch(() => {});
    if (api) await h.killApi(api);
    const { rows } = await obs.query('SELECT count(*)::int AS n FROM pg_catalog.pg_trigger WHERE tgname = $1', [TRIGGER]).catch(() => ({ rows: [{ n: -1 }] }));
    h.say(`cleanup: test triggers left: ${rows[0].n}`);
    await fault.end().catch(() => {});
    await obs.end().catch(() => {});
  }
  const s = checks.summary();
  report.summary = { passed: s.passed, failed: s.failed, findings: s.findings };
  h.say(`report: ${h.writeReport('rollback', report)}`);
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`rollback error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
