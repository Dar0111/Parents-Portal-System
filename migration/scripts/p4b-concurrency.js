#!/usr/bin/env node
// P4 PART B — CONCURRENCY (D-261, the plan's matrix rows C1, C2, C3 and P1;
// D-267 turns C1 and C3 from findings into specifications and adds C3sf, C3mf,
// C3r, C3s, C3m, C3d and the C3x burst). On this run's disposable database
// only, after a fresh db:setup. Starts its own API on 5010. Every fixture is
// run-made (accounts, learners, grades); the database is checked on the
// observer's own connection, never through the API. Interleavings are STAGED
// with a lock held on a separate "fault" connection, so the order is the
// test's and not the scheduler's — and every staged order is PROVED before the
// release: pg_blocking_pids shows the first request waiting on the fault
// session and the second on the first (D-267 addition 3). An unproven order is
// a FAIL.
//
//   C1  two acknowledgements of one fully locked term at once (staged: the
//       notifications table held, so the first waits after its INSERT and the
//       second waits on its key), then a burst of ten. SPEC: 201 the first
//       time, 200 "Already confirmed" for the other, never 500, exactly one
//       row, and every 200 carries the one row's acknowledgement (its
//       acknowledged_at: the body has no id field). F-2 (D-267) made this a spec.
//  C2  ten identical assignment creates at once: one 201, the rest 409
//       (assignments.js maps 23505), exactly one row.
//  C3  the class record (PUT /class-record) against the bulk lock (POST
//       /locks), in BOTH orders, for all three save paths (F-1, D-267). The
//       rule (API_REFERENCE, the class record): with a learner locked, the
//       highest possible scores, the scores and the Summative maxima of that
//       learner do not change. Each class: three learners, every subject
//       graded, the first subject S with complete inputs (one WW and one PT
//       column at 20 with a score each, the three Summative parts), so a
//       recompute stays computable and the lock can still take the learners.
//       SAVE FIRST — the lock must wait for the save, then lock what it saved:
//         C3    an HPS change (WW 20 -> 25); assessment_slots held, so the
//               save waits at its first slot write
//         C3sf  a score (18 -> 19); grade_components held, so the save waits
//               at its first score write
//         C3mf  the Summative maxima; the class's last S row held FOR UPDATE,
//               so the save waits inside its own lock on the class's rows
//       LOCK FIRST — the lock holds every row and waits at its grades_locked
//       insert (notifications held; the learners have parents); the save must
//       then find the class locked:
//         C3r   an HPS change: 409, nothing changed
//         C3s   a score: 409 ("Nothing was saved"), nothing changed
//         C3m   the Summative maxima: the locked learners skipped (200),
//               nothing of theirs changed
//       Every C3 case also checks that the lock is the LAST WRITER of every
//       row it locked (one xmin: nothing wrote a locked row after the lock).
//  C3d  the deadlock the bulk lock's join could make (D-267 addition 1): a
//       newcomer whose other subjects were graded first (lower ids) and who
//       has no S row; the save (HPS change + the newcomer's first S score,
//       which inserts their S row and so takes FOR KEY SHARE on their students
//       row) parked holding the class's rows; the lock waiting on it. SPEC:
//       save 200, then lock 200, no 40P01 in the API's log.
//  C3x  a burst: ROUNDS rounds of the save (C3d's body) and the bulk lock fired
//       together, the class put back between rounds. Every round: no 5xx, no
//       40P01, and either the save first (200, then the lock holds the saved
//       values and is the last writer) or the lock first (save 409, every
//       locked value unchanged). A locked value never changes after the lock's
//       reply.
//  P1  the pool exhausted behind a held row lock (KNOWN_ISSUES: a row-lock
//       wait has no limit outside three paths): health must answer 503 within
//       the 10 s connect timeout + 5 s, and everything must recover on release.
//
//   node scripts/p4b-concurrency.js [--only C1,C2,C3,C3d,C3x,P1] [--rounds N]
//                                   [--mutant <serve-pg.js mutant>]
// --mutant starts the API through serve-pg.js with one route changed in memory
// (the negative control): no-class-row-lock must FAIL the C3 cases (and C3x),
// bulk-lock-without-of must FAIL C3d, no-ack-on-conflict must FAIL C1.
const h = require('../lib/p4b');

h.assertIsolation();
const BASE = process.env.API_BASE;
const TIMEOUT_MS = 10000; // config/db.js connectionTimeoutMillis
const GRACE_MS = 5000; // the owner's answer 9
const DEADLOCK = /40P01|deadlock detected/i;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}
const MUTANT = argValue('--mutant');
const ONLY = argValue('--only') ? new Set(argValue('--only').split(',')) : null;
const ROUNDS = Number(argValue('--rounds')) || 10;
const runs = (name) => !ONLY || ONLY.has(name);

// A promise whose settling can be read without awaiting it.
function track(promise) {
  const t = { done: false, value: null };
  t.promise = promise.then((value) => {
    t.done = true;
    t.value = value;
    return value;
  });
  return t;
}

const status = (r) => (r ? r.status : 'none');

// ---------------------------------------------------------------------------
// fixtures for the C3 family
// ---------------------------------------------------------------------------
async function nextClass(obs, year) {
  for (const grade of [4, 3, 6, 2]) {
    try {
      return await h.emptySection(obs, grade, year);
    } catch {
      // none left at this grade level
    }
  }
  throw new Error('no empty numerical section left');
}

async function makeClass(obs, year, { learners = 3, parents = false, newcomer = false } = {}) {
  const cls = await nextClass(obs, year);
  const subjects = await h.subjectIds(obs, cls.gradeLevel);
  const out = { ...cls, subjects, S: subjects[0], learners: [], newcomer: null, sRows: [] };
  if (newcomer) {
    // graded FIRST, so every one of their rows has a lower id than the others'
    const t = await h.makeLearner(obs, { ...cls, last: 'Newcomer' });
    await h.gradeAll(obs, { studentId: t.id, subjects: subjects.slice(1), term: 1, year });
    out.newcomer = t;
  }
  for (let i = 0; i < learners; i += 1) {
    const l = await h.makeLearner(obs, { ...cls, last: `Race${i}` });
    await h.gradeAll(obs, { studentId: l.id, subjects, term: 1, year });
    if (parents) await h.makeAccount(obs, { role: 'parent', name: `P4B Parent ${i}`, studentId: l.id, login: l.lrn });
    out.learners.push(l);
  }
  const slot = async (type) =>
    (
      await obs.query(
        `INSERT INTO portal.assessment_slots (subject_id, grade_level, section, term, school_year, type, slot_no, max_score)
         VALUES ($1, $2, $3, 1, $4, $5, 1, 20) RETURNING id`,
        [out.S, cls.gradeLevel, cls.section, year, type]
      )
    ).rows[0].id;
  out.ww = await slot('WW');
  out.pt = await slot('PT');
  for (const l of out.learners) {
    const { rows } = await obs.query('SELECT id FROM portal.grades WHERE student_id = $1 AND subject_id = $2 AND term = 1', [l.id, out.S]);
    out.sRows.push(rows[0].id);
  }
  await fillInputs(obs, out);
  return out;
}

// The S inputs as the fixture made them: scores 18 (WW) and 17 (PT) of 20, the
// Summative parts 25/30, 26/30, 35/40.
async function fillInputs(obs, cls) {
  for (const gid of cls.sRows) {
    await obs.query(
      `INSERT INTO portal.grade_components (grade_id, slot_id, type, score, max_score) VALUES ($1, $2, 'WW', 18, 20), ($1, $3, 'PT', 17, 20)`,
      [gid, cls.ww, cls.pt]
    );
    await obs.query(
      'UPDATE portal.grades SET ex_st1 = 25, ex_st1_max = 30, ex_st2 = 26, ex_st2_max = 30, ex_te = 35, ex_te_max = 40 WHERE id = $1',
      [gid]
    );
  }
}

// Put a C3x class back between rounds: every row unlocked, the columns at 20,
// the newcomer's S row gone, the S rows' inputs and values as the fixture made
// them. On the observer connection, in one transaction.
async function resetClass(obs, cls) {
  await obs.query('BEGIN');
  try {
    await obs.query(
      `UPDATE portal.grades g SET is_locked = 0 FROM portal.students s
        WHERE s.id = g.student_id AND s.grade_level = $1 AND s.section = $2 AND g.term = 1 AND g.is_locked = 1`,
      [cls.gradeLevel, cls.section]
    );
    if (cls.newcomer) {
      await obs.query('DELETE FROM portal.grades WHERE student_id = $1 AND subject_id = $2 AND term = 1', [cls.newcomer.id, cls.S]);
    }
    await obs.query('DELETE FROM portal.grade_components WHERE slot_id = ANY($1::int[])', [[cls.ww, cls.pt]]);
    await obs.query('UPDATE portal.assessment_slots SET max_score = 20 WHERE id = ANY($1::int[])', [[cls.ww, cls.pt]]);
    await obs.query(
      `UPDATE portal.grades SET initial_grade = 85, term_grade = 85, ww_percentage = NULL, ww_weighted = NULL,
              pt_percentage = NULL, pt_weighted = NULL, ex_percentage = NULL, ex_weighted = NULL
        WHERE id = ANY($1::int[])`,
      [cls.sRows]
    );
    await fillInputs(obs, cls);
    await obs.query('COMMIT');
  } catch (error) {
    await obs.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

// The class as the database holds it: every term-1 grade row (its values, its
// lock, its last writer), the two columns and their scores. Values only as
// text, compared, never printed.
async function classState(obs, cls) {
  const { rows: grades } = await obs.query(
    `SELECT g.id, g.subject_id, g.student_id, g.is_locked, g.xmin::text AS xmin,
            g.term_grade::text AS tg, g.initial_grade::text AS ig, g.ww_percentage::text AS ww,
            g.pt_percentage::text AS pt, g.ex_percentage::text AS ex,
            g.ex_st1_max::text AS m1, g.ex_st2_max::text AS m2, g.ex_te_max::text AS m3
       FROM portal.grades g JOIN portal.students s ON s.id = g.student_id
      WHERE s.grade_level = $1 AND s.section = $2 AND g.term = 1
      ORDER BY g.id`,
    [cls.gradeLevel, cls.section]
  );
  const { rows: comps } = await obs.query(
    'SELECT id, grade_id, slot_id, score::text AS s, max_score::text AS m FROM portal.grade_components WHERE slot_id = ANY($1::int[]) ORDER BY id',
    [[cls.ww, cls.pt]]
  );
  const { rows: slots } = await obs.query(
    'SELECT id, max_score::text AS m FROM portal.assessment_slots WHERE id = ANY($1::int[]) ORDER BY id',
    [[cls.ww, cls.pt]]
  );
  return { grades, comps, slots };
}

const VALUE_KEYS = ['tg', 'ig', 'ww', 'pt', 'ex', 'm1', 'm2', 'm3'];
const sameRow = (a, b) => Boolean(a && b) && VALUE_KEYS.every((k) => a[k] === b[k]);

// Every locked row's values and its scores exactly as `before` had them.
function lockedUnchanged(before, after) {
  const byId = new Map(before.grades.map((g) => [g.id, g]));
  const lockedIds = new Set(after.grades.filter((g) => g.is_locked === 1).map((g) => g.id));
  const rowsKept = after.grades.filter((g) => lockedIds.has(g.id)).every((g) => sameRow(g, byId.get(g.id)));
  const compBefore = new Map(before.comps.map((c) => [c.id, c]));
  const compsKept = after.comps
    .filter((c) => lockedIds.has(c.grade_id))
    .every((c) => compBefore.has(c.id) && compBefore.get(c.id).s === c.s && compBefore.get(c.id).m === c.m);
  const slotsKept = after.slots.every((s, i) => before.slots[i] && before.slots[i].m === s.m);
  return { ok: rowsKept && compsKept && slotsKept, rowsKept, compsKept, slotsKept, locked: lockedIds.size };
}

// The lock is the last writer of every row it locked: they all carry the xmin
// of the rows the save never writes (the other subjects').
function lockIsLastWriter(after, cls) {
  const locked = after.grades.filter((g) => g.is_locked === 1);
  const untouched = locked.filter((g) => g.subject_id !== cls.S);
  if (!locked.length || !untouched.length) return { ok: false, locked: locked.length, stray: null };
  const lockXid = untouched[0].xmin;
  const stray = locked.filter((g) => g.xmin !== lockXid).length;
  return { ok: stray === 0, locked: locked.length, stray };
}

// The save's reply against the database: every locked row it computed holds
// exactly the term grade the save reported.
function holdsSavedValues(after, saveReply) {
  const results = (saveReply && saveReply.data && Array.isArray(saveReply.data.results) && saveReply.data.results) || [];
  const byId = new Map(after.grades.map((g) => [g.id, g]));
  const relevant = results.filter((r) => byId.has(r.grade_id) && byId.get(r.grade_id).is_locked === 1);
  const ok =
    relevant.length > 0 &&
    relevant.every((r) => {
      const g = byId.get(r.grade_id);
      return g.tg === null ? r.term_grade === null : r.term_grade !== null && Number(g.tg) === Number(r.term_grade);
    });
  return { ok, rows: relevant.length };
}

async function main() {
  const checks = h.makeChecks(MUTANT ? `concurrency (mutant ${MUTANT})` : 'concurrency');
  const obs = await h.superClient(process.env.PG_DATABASE, 'p4b-observer');
  const fault = await h.superClient(process.env.PG_DATABASE, 'p4b-fault');
  const report = { mutant: MUTANT || null, only: ONLY ? [...ONLY] : null, measured: {} };
  let api = null;
  try {
    const year = await h.schoolYear(obs);
    const { rows: fp } = await fault.query('SELECT pg_catalog.pg_backend_pid() AS pid');
    const faultPid = Number(fp[0].pid);
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

    const classes = {};
    if (runs('C3')) {
      for (const name of ['C3', 'C3sf', 'C3mf']) classes[name] = await makeClass(obs, year);
      for (const name of ['C3r', 'C3s', 'C3m']) classes[name] = await makeClass(obs, year, { parents: true });
    }
    if (runs('C3d')) classes.C3d = await makeClass(obs, year, { newcomer: true });
    if (runs('C3x')) classes.C3x = await makeClass(obs, year, { newcomer: true });
    h.say(`fixtures: Grade 5 class for C1 (${g5Subjects.length} subjects locked for one learner); ${Object.keys(classes).length} C3 classes of 3 learners${runs('C3d') || runs('C3x') ? ' (+1 newcomer in C3d / C3x)' : ''}`);

    api = h.spawnApi({ port: 5010, mutant: MUTANT });
    const ready = await api.ready;
    checks.check('the API on 5010 started', ready.ok, api.tail.slice(-5));
    if (MUTANT) h.say(`  info  MUTANT ${MUTANT}: ${api.tail.find((l) => /NEGATIVE CONTROL/.test(l)) || 'no NEGATIVE CONTROL line'}`);
    const adminToken = await h.signIn(BASE, admin);
    const parentToken = await h.signIn(BASE, parent);
    const before = await h.observe(obs, 'before');

    // ---- C2 -------------------------------------------------------------------
    if (runs('C2')) {
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
    }

    // ---- C1 -------------------------------------------------------------------
    if (runs('C1')) {
      const ackRow = async () => {
        const { rows } = await obs.query(
          'SELECT acknowledged_at FROM portal.grade_acknowledgements WHERE student_id = $1 AND school_year = $2 AND term = 1',
          [learner.id, year]
        );
        return rows;
      };
      const carriesRow = (reply, rowAt) =>
        Boolean(reply && reply.data && reply.data.acknowledgement && reply.data.acknowledgement.acknowledged_at) &&
        new Date(reply.data.acknowledgement.acknowledged_at).getTime() === new Date(rowAt).getTime();

      h.say('\nC1 two acknowledgements of one term at once (staged)');
      await fault.query('BEGIN');
      await fault.query('LOCK TABLE portal.notifications IN EXCLUSIVE MODE');
      const pA = track(h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } }));
      const aWait = await h.waitBlockedBy(obs, faultPid, { timeoutMs: 10000 });
      checks.check('C1 the first waits on the held notifications table (pg_blocking_pids)', aWait.ok, `${aWait.ms} ms`);
      const pB = track(h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } }));
      const bWait = aWait.ok ? await h.waitBlockedBy(obs, aWait.pid, { exclude: [faultPid], timeoutMs: 10000 }) : { ok: false, ms: 0 };
      checks.check('C1 the second waits on the first (its key) — the order is proved', bWait.ok && !pB.done, `${bWait.ms} ms`);
      await fault.query('ROLLBACK');
      const [rA, rB] = await Promise.all([pA.promise, pB.promise]);
      const rows1 = await ackRow();
      checks.check('C1 exactly one acknowledgement row', rows1.length === 1, rows1.length);
      checks.check('C1 the replies are 201 (the first) and 200 "Already confirmed" (the second), never 500', rA.status === 201 && rB.status === 200, `${rA.status} + ${rB.status}`);
      checks.check(
        "C1 the second's 200 carries the one row's acknowledgement, the first's own",
        rows1.length === 1 && carriesRow(rB, rows1[0].acknowledged_at) && carriesRow(rA, rows1[0].acknowledged_at)
      );
      report.measured.c1Staged = [rA.status, rB.status];

      h.say('\nC1 a burst of ten, nothing held');
      await obs.query('DELETE FROM portal.grade_acknowledgements WHERE student_id = $1', [learner.id]);
      await obs.query("DELETE FROM portal.notifications WHERE type = 'grades_acknowledged' AND user_id = $1", [adviser.id]);
      const burst = await Promise.all(Array.from({ length: 10 }, () => h.call(BASE, 'POST', '/api/grades/acknowledgements', { token: parentToken, body: { term: 1 } })));
      const histogram = burst.map((r) => r.status).reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
      const rows2 = await ackRow();
      checks.check('C1 burst: exactly one acknowledgement row', rows2.length === 1, rows2.length);
      checks.check('C1 burst: one 201, nine 200, no 500', histogram[201] === 1 && histogram[200] === 9, JSON.stringify(histogram));
      checks.check(
        'C1 burst: every 2xx carries the one row\'s acknowledgement',
        rows2.length === 1 && burst.filter((r) => r.status === 200 || r.status === 201).every((r) => carriesRow(r, rows2[0].acknowledged_at))
      );
      report.measured.c1Burst = histogram;
    }

    // ---- the C3 family ------------------------------------------------------------
    const keyOf = (cls) => ({ subject_id: cls.S, grade_level: cls.gradeLevel, section: cls.section, term: 1, school_year: year });
    const sendSave = (cls, payload) =>
      track(h.call(BASE, 'PUT', '/api/grades/class-record', { token: adminToken, body: { ...keyOf(cls), ...payload } }));
    const sendLock = (cls) =>
      track(h.call(BASE, 'POST', '/api/grades/locks', { token: adminToken, body: { lock: true, term: 1, grade_level: cls.gradeLevel, section: cls.section } }));
    const PAYLOAD = {
      hps: () => ({ slots: [{ type: 'WW', slot_no: 1, max_score: 25 }] }),
      score: (cls) => ({ entries: [{ student_id: cls.learners[0].id, scores: [{ slot_id: cls.ww, score: 19 }] }] }),
      summative: () => ({ exam_max: { st1: 40, st2: 40, te: 50 } }),
      newcomer: (cls) => ({
        slots: [{ type: 'WW', slot_no: 1, max_score: 25 }],
        entries: [{ student_id: cls.newcomer.id, scores: [{ slot_id: cls.ww, score: 15 }] }],
      }),
    };
    const HOLD = {
      slots: (f) => f.query('LOCK TABLE portal.assessment_slots IN EXCLUSIVE MODE'),
      components: (f) => f.query('LOCK TABLE portal.grade_components IN EXCLUSIVE MODE'),
      lastSRow: (f, cls) => f.query('SELECT 1 FROM portal.grades WHERE id = $1 FOR UPDATE', [cls.sRows[cls.sRows.length - 1]]),
      notifications: (f) => f.query('LOCK TABLE portal.notifications IN EXCLUSIVE MODE'),
    };

    // One staged interleaving, its order proved before the release.
    async function staged(name, { cls, first, hold, payload, what }) {
      h.say(`\n${name} ${what}`);
      const second = first === 'save' ? 'lock' : 'save';
      const pre = await classState(obs, cls);
      const deadlocksBefore = api.count(DEADLOCK);
      await fault.query('BEGIN');
      await HOLD[hold](fault, cls);
      const a = first === 'save' ? sendSave(cls, PAYLOAD[payload](cls)) : sendLock(cls);
      const aWait = await h.waitBlockedBy(obs, faultPid, { timeoutMs: 10000 });
      checks.check(`${name} the ${first} waits on the held ${hold} (pg_blocking_pids)`, aWait.ok && !a.done, `${aWait.ms} ms${a.done ? `, already answered ${status(a.value)}` : ''}`);
      const b = first === 'save' ? sendLock(cls) : sendSave(cls, PAYLOAD[payload](cls));
      const bWait = aWait.ok ? await h.waitBlockedBy(obs, aWait.pid, { exclude: [faultPid], timeoutMs: 5000 }) : { ok: false, ms: 0 };
      const proved = bWait.ok && !b.done && !a.done;
      checks.check(`${name} the ${second} waits on the ${first} (pg_blocking_pids) — the order is proved`, proved, `${bWait.ms} ms${b.done ? `, the ${second} already answered ${status(b.value)}` : ''}`);
      await fault.query('ROLLBACK');
      const [ra, rb] = await Promise.all([a.promise, b.promise]);
      const save = first === 'save' ? ra : rb;
      const lock = first === 'save' ? rb : ra;
      const after = await classState(obs, cls);
      const deadlocks = api.count(DEADLOCK) - deadlocksBefore;
      return { pre, after, save, lock, deadlocks, proved };
    }

    const lockedAll = (r, cls) => r.lock.status === 200 && r.lock.data && r.lock.data.learners_changed === cls.learners.length;

    if (runs('C3')) {
      // SAVE FIRST
      for (const [name, payload, hold, what] of [
        ['C3', 'hps', 'slots', 'an HPS change, the save first (assessment_slots held)'],
        ['C3sf', 'score', 'components', 'a score, the save first (grade_components held)'],
        ['C3mf', 'summative', 'lastSRow', 'the Summative maxima, the save first (the last S row held)'],
      ]) {
        const cls = classes[name];
        const r = await staged(name, { cls, first: 'save', hold, payload, what });
        const writer = lockIsLastWriter(r.after, cls);
        const held = holdsSavedValues(r.after, r.save);
        checks.check(`${name} the save answers 200 and the lock 200 with every learner (${cls.learners.length})`, r.save.status === 200 && lockedAll(r, cls), `save ${status(r.save)}, lock ${status(r.lock)} ${r.lock.data ? r.lock.data.learners_changed : ''}`);
        checks.check(`${name} the lock holds the values the save reported`, held.ok, held);
        checks.check(`${name} the lock is the last writer of every row it locked`, writer.ok, writer);
        if (payload === 'hps') {
          const wwSlot = r.after.slots.find((s) => s.id === cls.ww);
          const wwComps = r.after.comps.filter((c) => c.slot_id === cls.ww && wwSlot && c.m === wwSlot.m);
          checks.check(`${name} the column and every score row in it agree (HPS 25, saved before the lock)`, wwSlot && wwSlot.m === '25.00' && wwComps.length === cls.learners.length, wwSlot ? wwSlot.m : null);
          const ctl = await h.call(BASE, 'PUT', '/api/grades/class-record', { token: adminToken, body: { ...keyOf(cls), slots: [{ type: 'WW', slot_no: 1, max_score: 30 }] } });
          checks.check(`${name} control: serialized after the lock, an HPS change is refused 409`, ctl.status === 409, ctl.status);
        }
        report.measured[name] = { save: status(r.save), lock: status(r.lock), proved: r.proved, held: held.ok, lastWriter: writer.ok };
      }
      // LOCK FIRST
      for (const [name, payload, saveStatus, what] of [
        ['C3r', 'hps', 409, 'an HPS change against a lock in progress'],
        ['C3s', 'score', 409, 'a score against a lock in progress'],
        ['C3m', 'summative', 200, 'the Summative maxima against a lock in progress'],
      ]) {
        const cls = classes[name];
        const r = await staged(name, { cls, first: 'lock', hold: 'notifications', payload, what });
        const kept = lockedUnchanged(r.pre, r.after);
        const writer = lockIsLastWriter(r.after, cls);
        checks.check(`${name} the lock answers 200 with every learner (${cls.learners.length})`, lockedAll(r, cls), `lock ${status(r.lock)} ${r.lock.data ? r.lock.data.learners_changed : ''}`);
        checks.check(
          `${name} the save answers ${saveStatus}${saveStatus === 200 ? ' (the locked learners skipped)' : ' (the class is locked)'}`,
          r.save.status === saveStatus,
          `save ${status(r.save)}`
        );
        checks.check(`${name} no locked value, score or column changed`, kept.ok, kept);
        checks.check(`${name} the lock is the last writer of every row it locked`, writer.ok, writer);
        report.measured[name] = { save: status(r.save), lock: status(r.lock), proved: r.proved, kept: kept.ok, lastWriter: writer.ok };
      }
    }

    if (runs('C3d')) {
      const cls = classes.C3d;
      const r = await staged('C3d', {
        cls,
        first: 'save',
        hold: 'slots',
        payload: 'newcomer',
        what: "the newcomer's first S score (a new grades row, FOR KEY SHARE on their students row), the save first",
      });
      checks.check('C3d the save answers 200, then the lock 200', r.save.status === 200 && r.lock.status === 200, `save ${status(r.save)}, lock ${status(r.lock)}`);
      checks.check("C3d no 40P01 (deadlock) in the API's log", r.deadlocks === 0, r.deadlocks);
      const { rows: newRow } = await obs.query('SELECT count(*)::int AS n FROM portal.grades WHERE student_id = $1 AND subject_id = $2 AND term = 1', [cls.newcomer.id, cls.S]);
      checks.check("C3d the newcomer's S row exists (the save's insert landed)", newRow[0].n === 1, newRow[0].n);
      const writer = lockIsLastWriter(r.after, cls);
      checks.check('C3d the lock is the last writer of every row it locked', writer.ok, writer);
      report.measured.C3d = { save: status(r.save), lock: status(r.lock), proved: r.proved, deadlocks: r.deadlocks };
    }

    if (runs('C3x')) {
      const cls = classes.C3x;
      h.say(`\nC3x ${ROUNDS} rounds of the save and the bulk lock fired together`);
      const rounds = [];
      for (let i = 0; i < ROUNDS; i += 1) {
        if (i > 0) await resetClass(obs, cls);
        const pre = await classState(obs, cls);
        const deadlocksBefore = api.count(DEADLOCK);
        const jitter = (i % 5) * 4;
        const lockFirst = i % 2 === 1;
        const fire = (fn) => fn();
        let save;
        let lock;
        if (lockFirst) {
          lock = fire(() => sendLock(cls));
          if (jitter) await h.sleep(jitter);
          save = fire(() => sendSave(cls, PAYLOAD.newcomer(cls)));
        } else {
          save = fire(() => sendSave(cls, PAYLOAD.newcomer(cls)));
          if (jitter) await h.sleep(jitter);
          lock = fire(() => sendLock(cls));
        }
        const atLockReply = lock.promise.then(() => classState(obs, cls));
        const [rs, rl] = await Promise.all([save.promise, lock.promise]);
        const snap = await atLockReply;
        const after = await classState(obs, cls);
        const deadlocks = api.count(DEADLOCK) - deadlocksBefore;
        const writer = lockIsLastWriter(after, cls);
        let verdict;
        if (rs.status === 200) {
          verdict = rl.status === 200 && holdsSavedValues(after, rs).ok && writer.ok ? 'save first' : 'FAIL';
        } else if (rs.status === 409) {
          verdict = rl.status === 200 && lockedUnchanged(pre, after).ok && writer.ok ? 'lock first' : 'FAIL';
        } else {
          verdict = 'FAIL';
        }
        const stable = lockedUnchanged(snap, after).ok;
        const ok = verdict !== 'FAIL' && rs.status < 500 && rl.status < 500 && deadlocks === 0 && stable;
        rounds.push({ round: i + 1, sent: lockFirst ? 'lock first' : 'save first', save: rs.status, lock: rl.status, verdict, deadlocks, stable, ok });
        h.say(`  info  C3x round ${i + 1} (sent ${lockFirst ? 'lock' : 'save'} first, +${jitter} ms): save ${rs.status}, lock ${rl.status} — ${verdict}${deadlocks ? `, ${deadlocks} deadlock line(s)` : ''}${stable ? '' : ', a locked value moved after the lock replied'}`);
      }
      checks.check(`C3x every round: no 5xx, no 40P01, one of the two serial orders, no locked value moved after the lock`, rounds.every((r) => r.ok), rounds.filter((r) => !r.ok).map((r) => r.round));
      report.measured.C3x = rounds;
    }

    // ---- P1 -------------------------------------------------------------------------
    if (runs('P1')) {
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
    }

    // ---- after ----------------------------------------------------------------------
    await h.sleep(500);
    const after = await h.observe(obs, 'after');
    checks.check('the API process stayed up throughout', api.alive());
    checks.check('no session left idle in a transaction, no prepared transaction', after.sessions.idleInTx === 0 && after.sessions.prepared === 0, after.sessions);
    checks.check('the API holds at most its pool of 10 connections', (after.sessions.byApp['parents-portal-api'] || 0) <= 10, after.sessions.byApp);
    checks.check('every sequence ahead of its highest id, none moved backwards', h.sequenceViolations(after, before).length === 0, h.sequenceViolations(after, before));
    report.deadlockLines = api.count(DEADLOCK);
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
  report.summary = { passed: s.passed, failed: s.failed, findings: s.findings, failedLabels: s.results.filter((r) => r.ok === false && !r.spec).map((r) => r.label) };
  h.say(`report: ${h.writeReport(MUTANT ? `concurrency-mutant-${MUTANT}` : 'concurrency', report)}`);
  process.exitCode = s.failed ? 1 : 0;
}

main().catch((error) => {
  h.say(`concurrency error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
