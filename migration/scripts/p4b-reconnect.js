#!/usr/bin/env node
// P4 PART B — DATABASE DISCONNECTION AND RECONNECTION (D-261, the plan's rows
// N1–N8). On this run's disposable database only, after a fresh db:setup.
// The API (server/server.js, 5010) reaches the cluster THROUGH A RELAY this
// process owns (lib/p4b.js makeRelay), so the database can disappear and
// come back while the API keeps running. Results read on the observer's own
// connection, which goes to the cluster directly, never through the relay.
//
//   N1  up: health 200, a sign-in, /auth/me, a write, a socket handshake
//   N2  the relay CUT (every connection reset, new ones refused): health 503,
//       /auth/me with a valid token 503 (never 401), a write 503 and absent, a
//       new socket handshake refused; the API process stays up
//   N3  a cut while a write is INSIDE its transaction (staged behind a lock on
//       assessment_slots): nothing of it lands, no session is left behind
//   N4  the relay back: health 200 within the connect timeout + 5 s WITHOUT a
//       restart, the same token works, writes land, the handshake is accepted
//   N7  an ordinary write whose COMMIT reaches the server but whose reply is
//       lost (the excuse review): the reply the client sees, and whether the
//       row committed. Only the restore asks the server what became of a
//       COMMIT (routes/backups.js pg_xact_status); this measures the rest.
//   N8  (--real-restart) the real cluster stopped (pg-local.js stop) and
//       started again by the OPERATOR in another terminal while this waits:
//       the API answers 503 while it is down and recovers on its own.
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../lib/p4b');

h.assertIsolation();
const BASE = process.env.API_BASE;
const TIMEOUT_MS = 10000;
const GRACE_MS = 5000;
const REAL_RESTART = process.argv.includes('--real-restart');

function socketTry(token) {
  const { io } = h.serverModule('node_modules', 'socket.io-client');
  return new Promise((resolve) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
    const done = (result) => {
      s.close();
      resolve(result);
    };
    s.once('connect', () => done({ connected: true }));
    s.once('connect_error', (error) => done({ connected: false, message: String(error && error.message) }));
  });
}

async function setting(obs) {
  const { rows } = await obs.query("SELECT setting_value AS v FROM portal.system_settings WHERE setting_key = 'school_phone'");
  return rows[0] ? rows[0].v : null;
}

async function main() {
  const checks = h.makeChecks(REAL_RESTART ? 'reconnect-real-restart' : 'reconnect');
  const obs = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  let fault = await h.superClient(process.env.PG_DATABASE, 'p4b-fault');
  const relay = h.makeRelay();
  const report = { measured: {} };
  let api = null;
  try {
    const relayPort = await relay.listen();
    const year = await h.schoolYear(obs);
    const admin = await h.makeAccount(obs, { role: 'admin', name: 'P4B Admin' });
    const adviser = await h.makeAccount(obs, { role: 'teacher', name: 'P4B Adviser' });
    const g5 = await h.emptySection(obs, 5, year);
    await obs.query('UPDATE portal.sections SET adviser_id = $1 WHERE id = $2', [adviser.id, g5.sectionId]);
    const learner = await h.makeLearner(obs, { ...g5, last: 'Reconnect' });
    const parent = await h.makeAccount(obs, { role: 'parent', name: 'P4B Parent', studentId: learner.id, login: learner.lrn });
    const { rows: letter } = await obs.query(
      `INSERT INTO portal.excuse_letters (student_id, parent_id, absence_date, reason, status)
       VALUES ($1, $2, $3, 'P4B fixture letter', 'Pending') RETURNING id`,
      [learner.id, parent.id, h.firstClassDay()]
    );
    const g4 = await h.emptySection(obs, 4, year);
    const g4Learner = await h.makeLearner(obs, { ...g4, last: 'Cut' });
    const g4Subjects = await h.subjectIds(obs, 4);
    await h.gradeAll(obs, { studentId: g4Learner.id, subjects: g4Subjects, term: 1, year });
    const { rows: slot } = await obs.query(
      `INSERT INTO portal.assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
       VALUES ($1, 4, $2, 1, $3, 'WW', 1, 20) RETURNING id`,
      [g4Subjects[0], g4.section, year]
    );

    api = h.spawnApi({ port: 5010, pgPort: relayPort });
    checks.check('the API on 5010 started, reaching the cluster through the relay', (await api.ready).ok, api.tail.slice(-5));
    const pid = api.pid;

    // ---- N1 -------------------------------------------------------------------
    h.say('\nN1 up');
    checks.check('N1 health 200', (await h.call(BASE, 'GET', '/api/health')).status === 200);
    const token = await h.signIn(BASE, admin);
    const adviserToken = await h.signIn(BASE, adviser);
    checks.check('N1 /auth/me 200', (await h.call(BASE, 'GET', '/api/auth/me', { token })).status === 200);
    const w1 = await h.call(BASE, 'PUT', '/api/settings/school_phone', { token, body: { value: '0281110001' } });
    checks.check('N1 a write lands', w1.status === 200 && (await setting(obs)) === '0281110001', w1.status);
    const s1 = await socketTry(token);
    checks.check('N1 a socket handshake is accepted', s1.connected, s1);

    // ---- N2 -------------------------------------------------------------------
    h.say('\nN2 the database cut off');
    const cutAt = Date.now();
    relay.cut();
    const down = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 503, { timeoutMs: TIMEOUT_MS + GRACE_MS });
    checks.check(`N2 health answers 503 within ${TIMEOUT_MS + GRACE_MS} ms`, down.ok, `${Date.now() - cutAt} ms`);
    report.measured.toFirst503Ms = Date.now() - cutAt;
    const me2 = await h.call(BASE, 'GET', '/api/auth/me', { token });
    checks.check('N2 /auth/me with a valid token answers 503, never 401', me2.status === 503, me2.status);
    const w2 = await h.call(BASE, 'PUT', '/api/settings/school_phone', { token, body: { value: '0281110002' } });
    checks.check('N2 a write answers 503 and nothing lands (read on the cluster directly)', w2.status === 503 && (await setting(obs)) === '0281110001', `${w2.status}`);
    const s2 = await socketTry(token);
    checks.check('N2 a new socket handshake is refused while the database is gone', !s2.connected, s2);
    checks.check('N2 the API process is still up', api.alive() && api.pid === pid);

    // ---- N4 (first return) ---------------------------------------------------------
    h.say('\nN4 the database back');
    const backAt = Date.now();
    relay.pass();
    const up = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 200, { timeoutMs: TIMEOUT_MS + GRACE_MS });
    report.measured.recoveryMs = Date.now() - backAt;
    checks.check(`N4 health 200 again within ${TIMEOUT_MS + GRACE_MS} ms, no restart`, up.ok && api.pid === pid, `${report.measured.recoveryMs} ms`);
    checks.check('N4 the token from before the cut still works', (await h.call(BASE, 'GET', '/api/auth/me', { token })).status === 200);
    const w4 = await h.call(BASE, 'PUT', '/api/settings/school_phone', { token, body: { value: '0281110004' } });
    checks.check('N4 a write lands', w4.status === 200 && (await setting(obs)) === '0281110004', w4.status);
    const s4 = await socketTry(token);
    checks.check('N4 a socket handshake is accepted again', s4.connected, s4);

    // ---- N3 -------------------------------------------------------------------------
    h.say('\nN3 a cut while a write is inside its transaction');
    const before3 = await h.observe(obs, 'N3-before');
    await fault.query('BEGIN');
    await fault.query('LOCK TABLE portal.assessment_slots IN EXCLUSIVE MODE');
    const inFlight = h.call(BASE, 'PUT', '/api/grades/class-record', {
      token,
      body: { subject_id: g4Subjects[0], grade_level: 4, section: g4.section, term: 1, school_year: year, slots: [{ type: 'WW', slot_no: 1, max_score: 24 }] },
    });
    const waits = await h.waitFor(async () => (await h.waitingOnLock(obs)) >= 1, { timeoutMs: 10000 });
    checks.check('N3 the save is inside its transaction, waiting', waits.ok);
    relay.cut();
    const r3 = await inFlight;
    await fault.query('ROLLBACK');
    const drained = await h.waitFor(async () => {
      const { rows } = await obs.query(
        "SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND application_name = 'parents-portal-api'"
      );
      return rows[0].n === 0;
    }, { timeoutMs: 30000, intervalMs: 250 });
    const after3 = await h.observe(obs, 'N3-after');
    const { rows: slotNow } = await obs.query('SELECT max_score::text AS m FROM portal.assessment_slots WHERE id = $1', [slot[0].id]);
    checks.check('N3 the client gets an error reply, not a hang', r3.status >= 500, r3.status);
    checks.check('N3 the server ends the cut sessions on its own', drained.ok, `${drained.ms} ms`);
    checks.check('N3 nothing of the save landed (every table as it was; the slot still 20)', h.unexpectedChanges(before3, after3, ['activity_logs', 'login_attempts']).length === 0 && slotNow[0].m === '20.00', slotNow[0].m);
    checks.check('N3 no session idle in a transaction', after3.sessions.idleInTx === 0, after3.sessions);
    checks.check('N3 the API process is still up', api.alive() && api.pid === pid);
    h.say(`  info  N3 the client saw ${r3.status}`);
    relay.pass();
    const up3 = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 200, { timeoutMs: TIMEOUT_MS + GRACE_MS });
    checks.check('N3 health 200 again after the relay returns', up3.ok, `${up3.ms} ms`);

    // ---- N7 -------------------------------------------------------------------------
    h.say('\nN7 a COMMIT that reaches the server, its reply lost');
    relay.armCommitDrop();
    const r7 = await h.call(BASE, 'PATCH', `/api/excuse-letters/${letter[0].id}/review`, { token: adviserToken, body: { status: 'Approved' } });
    await h.sleep(800);
    const { rows: l7 } = await obs.query('SELECT status FROM portal.excuse_letters WHERE id = $1', [letter[0].id]);
    const { rows: a7 } = await obs.query('SELECT status FROM portal.attendance WHERE student_id = $1', [learner.id]);
    checks.check('N7 the relay dropped exactly one COMMIT reply', relay.stats.commitRepliesDropped === 1, relay.stats);
    h.say(`  info  N7 the client saw ${r7.status}${r7.data && r7.data.message ? ` "${r7.data.message}"` : ''}; the letter is ${l7[0].status}; the day is ${a7[0] ? a7[0].status : 'unrecorded'}`);
    checks.expect(
      'N7 a reply that says the write failed means it did not land',
      !(r7.status >= 500 && l7[0].status === 'Approved'),
      `reply ${r7.status}, letter ${l7[0].status}`,
      'LOW'
    );
    const retry = await h.call(BASE, 'PATCH', `/api/excuse-letters/${letter[0].id}/review`, { token: adviserToken, body: { status: 'Approved' } });
    h.say(`  info  N7 a retry of the same review answers ${retry.status} (the review is guarded, so a retry cannot double-write)`);
    checks.check('N7 health 200 afterwards, the API still up', (await h.call(BASE, 'GET', '/api/health')).status === 200 && api.alive() && api.pid === pid);
    report.measured.n7 = { reply: r7.status, letter: l7[0].status, attendance: a7[0] ? a7[0].status : null, retry: retry.status };

    // ---- N8 -------------------------------------------------------------------------
    if (REAL_RESTART) {
      h.say('\nN8 the real cluster stopped and started again');
      await fault.end().catch(() => {});
      await obs.end().catch(() => {});
      const stop = spawnSync(process.execPath, [path.join(__dirname, 'pg-local.js'), 'stop'], { env: process.env, encoding: 'utf8', timeout: 60000 });
      checks.check('N8 pg-local.js stop exits 0', stop.status === 0, stop.status);
      const closed = await h.waitFor(async () => (await h.probePort(h.LOCAL_PG.port)) === 'closed', { timeoutMs: 30000 });
      checks.check('N8 54329 is closed', closed.ok);
      const stoppedAt = Date.now();
      const down8 = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 503, { timeoutMs: TIMEOUT_MS + GRACE_MS });
      checks.check(`N8 health answers 503 within ${TIMEOUT_MS + GRACE_MS} ms of the stop`, down8.ok, `${Date.now() - stoppedAt} ms`);
      const me8 = await h.call(BASE, 'GET', '/api/auth/me', { token });
      checks.check('N8 /auth/me answers 503 while the cluster is down, never 401', me8.status === 503, me8.status);
      checks.check('N8 the API process survived the shutdown of every connection', api.alive() && api.pid === pid);
      h.say('N8 WAITING FOR THE CLUSTER: start it again now (p4b-run.js pg serve-fg); waiting up to 10 minutes');
      const reopened = await h.waitFor(async () => (await h.probePort(h.LOCAL_PG.port)) === 'open', { timeoutMs: 10 * 60 * 1000, intervalMs: 500 });
      checks.check('N8 the cluster is back', reopened.ok);
      const openedAt = Date.now();
      const up8 = await h.waitFor(async () => (await h.call(BASE, 'GET', '/api/health')).status === 200, { timeoutMs: TIMEOUT_MS + GRACE_MS });
      report.measured.realRestartRecoveryMs = Date.now() - openedAt;
      checks.check(`N8 health 200 within ${TIMEOUT_MS + GRACE_MS} ms of the cluster accepting connections, no API restart`, up8.ok && api.pid === pid, `${report.measured.realRestartRecoveryMs} ms`);
      checks.check('N8 the token from before the restart still works', (await h.call(BASE, 'GET', '/api/auth/me', { token })).status === 200);
      const obs8 = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
      try {
        const w8 = await h.call(BASE, 'PUT', '/api/settings/school_phone', { token, body: { value: '0281110008' } });
        checks.check('N8 a write lands after the restart', w8.status === 200 && (await setting(obs8)) === '0281110008', w8.status);
        const end = await h.observe(obs8, 'N8-end');
        checks.check('N8 no session idle in a transaction, every sequence ahead of its highest id', end.sessions.idleInTx === 0 && h.sequenceViolations(end).length === 0, end.sessions);
      } finally {
        await obs8.end().catch(() => {});
      }
      const s8 = await socketTry(token);
      checks.check('N8 a socket handshake is accepted after the restart', s8.connected, s8);
    } else {
      const end = await h.observe(obs, 'end');
      checks.check('no session idle in a transaction, every sequence ahead of its highest id', end.sessions.idleInTx === 0 && h.sequenceViolations(end).length === 0, end.sessions);
    }
    checks.check('the API process stayed up throughout (one PID)', api.alive() && api.pid === pid);
  } finally {
    await fault.query('ROLLBACK').catch(() => {});
    if (api) await h.killApi(api);
    await relay.close().catch(() => {});
    await fault.end().catch(() => {});
    await obs.end().catch(() => {});
  }
  const s = checks.summary();
  report.summary = { passed: s.passed, failed: s.failed, findings: s.findings };
  report.relay = relay.stats;
  h.say(`report: ${h.writeReport(REAL_RESTART ? 'reconnect-real-restart' : 'reconnect', report)}`);
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`reconnect error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
