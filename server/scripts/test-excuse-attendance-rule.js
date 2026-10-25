/**
 * Unit test for utils/excuseAttendance.js — an excuse letter's decision and
 * that day's attendance (feat/excuse-attendance, B8; the owner's Q1-Q11).
 * Direct calls, no server, no HTTP, NO DATABASE: the transaction runs on a
 * scripted stub pool.
 *
 * What it proves, each part with a NEGATIVE CONTROL that must fail:
 *   - the RULE: all eleven cells (two decisions x five states of the day, and
 *     a day that is not a class day), and the class-day boundaries — the
 *     school year's first and last day, the day before and after, Saturday,
 *     Sunday, and since the owner's answer of 2026-10-23 (a class day is a
 *     weekday inside one of the three terms) the December break between Term
 *     2 and Term 3: its weekdays are not class days, the two terms' edges are;
 *   - THE PARITY PROOF: the server's decide() and isClassDay() against the
 *     client's format/excuseAttendance.js (which the phone mirrors byte for
 *     byte) over every decision x state x date, failing on any difference —
 *     so the words a screen shows cannot drift from what the server does;
 *   - THE TRANSACTION: an insert, an update, a no-op and a non-class day each
 *     commit with exactly the right statements; a letter no longer Pending
 *     rolls back and writes no attendance; a lost race on the day's row — a
 *     duplicate key or a deadlock, MySQL's codes and PostgreSQL's — rolls
 *     back and is 'conflict'; any other error rolls back and is thrown; the
 *     connection is released every time.
 *
 * Usage: npm run test:excuse-attendance-rule
 */
const path = require('path');
const { pathToFileURL } = require('url');
const rule = require('../utils/excuseAttendance');
const { CLASSES_START, CLASSES_END } = require('../utils/schoolCalendar');

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const STATES = [null, 'Absent', 'Excused', 'Present', 'Late'];
const CLASS_DAY = '2026-10-21'; // a Wednesday inside the school year

// The table the owner approved, written out cell by cell.
const EXPECTED = [
  ['Approved', null, { write: 'insert', to: 'Excused', classDay: true }],
  ['Approved', 'Absent', { write: 'update', to: 'Excused', classDay: true }],
  ['Approved', 'Excused', { write: null, to: 'Excused', classDay: true }],
  ['Approved', 'Present', { write: null, to: 'Present', classDay: true }],
  ['Approved', 'Late', { write: null, to: 'Late', classDay: true }],
  ['Declined', null, { write: 'insert', to: 'Absent', classDay: true }],
  ['Declined', 'Absent', { write: null, to: 'Absent', classDay: true }],
  ['Declined', 'Excused', { write: null, to: 'Excused', classDay: true }],
  ['Declined', 'Present', { write: null, to: 'Present', classDay: true }],
  ['Declined', 'Late', { write: null, to: 'Late', classDay: true }],
];

function dayBefore(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}
function dayAfter(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

// Dates that cover every branch of isClassDay: inside, both ends, outside,
// both weekend days, the December break and the terms' edges around it (a
// weekday in the break is NOT a class day — the owner's answer of 2026-10-23),
// the seam between Term 1 and Term 2, and a malformed string.
const BREAK_DAYS = ['2026-12-21', '2026-12-23', '2027-01-01']; // Monday, Wednesday, Friday in the break

// The definition this replaced (B8 as first built): a weekday anywhere inside
// CLASSES_START..CLASSES_END, the break included. The controls below use it.
function weekend(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}
function schoolYearClassDay(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= CLASSES_START && date <= CLASSES_END && !weekend(date);
}

const DATES = [
  CLASS_DAY,
  CLASSES_START,
  CLASSES_END,
  dayBefore(CLASSES_START),
  dayAfter(CLASSES_END),
  '2026-10-24', // Saturday
  '2026-10-25', // Sunday
  ...BREAK_DAYS,
  '2026-12-18', // Friday, Term 2's last day
  '2027-01-04', // Monday, Term 3's first day
  '2026-09-15', // Tuesday, Term 1's last day
  '2026-09-16', // Wednesday, Term 2's first day
  '2026-06-05', // the Friday before classes start
  'not-a-date',
];

async function main() {
  console.log('\nExcuse decisions and attendance — the rule, the parity, the transaction\n');

  console.log('The rule (eleven cells)');
  for (const [decision, current, want] of EXPECTED) {
    const got = rule.decide(decision, current, CLASS_DAY);
    assert(JSON.stringify(got) === JSON.stringify(want), `${decision} over ${current ?? 'no record'} → ${want.write ?? 'no write'}, ${want.to}`, JSON.stringify(got));
  }
  for (const decision of rule.DECISIONS) {
    for (const current of STATES) {
      const got = rule.decide(decision, current, '2026-10-24');
      assert(
        got.write === null && got.to === current && got.classDay === false,
        `the eleventh cell: ${decision} over ${current ?? 'no record'} on a Saturday writes nothing`,
        JSON.stringify(got)
      );
    }
  }
  let threw = false;
  try {
    rule.decide('Pending', null, CLASS_DAY);
  } catch {
    threw = true;
  }
  assert(threw, 'a decision other than Approved / Declined throws');

  for (const date of BREAK_DAYS) {
    const writes = [];
    for (const decision of rule.DECISIONS) {
      for (const current of STATES) {
        const got = rule.decide(decision, current, date);
        if (got.write !== null || got.to !== current || got.classDay !== false) writes.push(`${decision}/${current}`);
      }
    }
    assert(writes.length === 0, `the eleventh cell on a weekday in the December break (${date}): neither decision writes, over any mark`, writes.join(', '));
  }

  console.log('\nClass days (Q9, the owner\'s answer of 2026-10-23: a weekday inside one of the three terms)');
  assert(rule.isClassDay(CLASS_DAY), 'a Wednesday in Term 2 is a class day');
  assert(rule.isClassDay(CLASSES_START) && rule.isClassDay(CLASSES_END), "the school year's first and last day are class days");
  assert(!rule.isClassDay(dayBefore(CLASSES_START)) && !rule.isClassDay(dayAfter(CLASSES_END)), 'the day before and the day after the school year are not');
  assert(!rule.isClassDay('2026-06-05'), 'a WEEKDAY before the school year (Friday, 5 June) is not — the lower bound itself, not the weekend rule');
  assert(!rule.isClassDay('2026-10-24') && !rule.isClassDay('2026-10-25'), 'Saturday and Sunday are not');
  assert(
    BREAK_DAYS.every((date) => !rule.isClassDay(date)),
    "a weekday in the December break is NOT (Monday 21 and Wednesday 23 December, New Year's Day) — between two terms, though inside the school year"
  );
  assert(rule.isClassDay('2026-12-18') && rule.isClassDay('2027-01-04'), "the break's edges are: Term 2's last day (Friday, 18 December) and Term 3's first (Monday, 4 January)");
  assert(rule.isClassDay('2026-09-15') && rule.isClassDay('2026-09-16'), "Term 1's last day and Term 2's first are both class days — no gap between those two terms");
  assert(
    BREAK_DAYS.every((date) => schoolYearClassDay(date) && !rule.isClassDay(date)),
    'NEGATIVE CONTROL: the definition this replaced (a weekday inside CLASSES_START..CLASSES_END) calls the break a class day; the rule does not'
  );
  assert(!rule.isClassDay('not-a-date') && !rule.isClassDay(null), 'a malformed date is not');
  assert(rule.isClassDay('2026-10-24') === false && rule.isClassDay('2026-10-23') === true, 'NEGATIVE CONTROL: Friday and Saturday differ — the weekday is computed, not assumed');

  console.log('\nThe parity proof: the server against the client module');
  const clientPath = path.join(__dirname, '..', '..', 'client', 'src', 'format', 'excuseAttendance.js');
  const client = await import(pathToFileURL(clientPath).href);
  function differences(serverRule, clientRule) {
    const out = [];
    for (const date of DATES) {
      if (serverRule.isClassDay(date) !== clientRule.isClassDay(date)) out.push(`isClassDay(${date})`);
      for (const decision of rule.DECISIONS) {
        for (const current of STATES) {
          const a = JSON.stringify(serverRule.decide(decision, current, date));
          const b = JSON.stringify(clientRule.decide(decision, current, date));
          if (a !== b) out.push(`${decision}/${current}/${date}`);
        }
      }
    }
    return out;
  }
  const diff = differences(rule, client);
  assert(diff.length === 0, `server and client agree on all ${DATES.length * rule.DECISIONS.length * STATES.length} decision × state × date cases and ${DATES.length} class-day cases`, diff.join(', '));
  const drifted = {
    isClassDay: client.isClassDay,
    decide: (decision, current, date) =>
      decision === 'Declined' && current === 'Excused' && client.isClassDay(date)
        ? { write: 'update', to: 'Absent', classDay: true }
        : client.decide(decision, current, date),
  };
  assert(differences(rule, drifted).length > 0, 'NEGATIVE CONTROL: a client that turned a declined Excused day Absent is caught');
  const driftedDay = { isClassDay: (date) => client.isClassDay(date) || date === '2026-10-24', decide: client.decide };
  assert(differences(rule, driftedDay).length > 0, 'NEGATIVE CONTROL: a client that called a Saturday a class day is caught');
  // The client as it stood before the owner's answer of 2026-10-23: the same
  // table, on the school-year definition of a class day.
  const driftedBreak = {
    isClassDay: schoolYearClassDay,
    decide: (decision, current, date) =>
      schoolYearClassDay(date) ? client.decide(decision, current, CLASS_DAY) : { write: null, to: current ?? null, classDay: false },
  };
  const breakDiff = differences(rule, driftedBreak);
  assert(
    breakDiff.length > 0 && breakDiff.every((d) => BREAK_DAYS.some((date) => d.includes(date))),
    'NEGATIVE CONTROL: a client that still called the December break a class day (the school-year definition) is caught — on the break days and nowhere else',
    breakDiff.join(', ')
  );
  assert(
    client.PARENT_NOTE ===
      'If the adviser approves it, an absent or unrecorded class day is marked Excused; if declined, an unrecorded class day is marked Absent.',
    "the parent's sentence is the owner's, word for word"
  );

  console.log('\nThe transaction (a scripted stub pool)');
  // The pg-shaped stub (Phase 3): config/db.js's connect(), a result of
  // { rows, rowCount }. A script entry is the rows a read returns, or
  // { rowCount } for a write. The transaction's SET LOCAL is logged on its own
  // (`settings`), so the statement lists below are the module's statements as
  // they always were; every stub's log is kept for the check at the end.
  const stubLogs = [];
  function stubPool(script) {
    const log = { queries: [], settings: [], began: 0, committed: 0, rolledBack: 0, released: 0 };
    stubLogs.push(log);
    const conn = {
      beginTransaction: async () => {
        log.began += 1;
      },
      commit: async () => {
        log.committed += 1;
      },
      rollback: async () => {
        log.rolledBack += 1;
      },
      release: () => {
        log.released += 1;
      },
      query: async (sql, params) => {
        if (/^SET LOCAL\b/.test(sql)) {
          log.settings.push({ sql, first: log.began === 1 && log.queries.length === 0 });
          return { rows: [], rowCount: 0 };
        }
        log.queries.push(sql.split(/\s+/).slice(0, 2).join(' '));
        const next = script.shift();
        if (next instanceof Error) throw next;
        return Array.isArray(next) ? { rows: next, rowCount: next.length } : { rows: [], rowCount: next.rowCount };
      },
    };
    return { pool: { connect: async () => conn }, log };
  }
  const args = (status = 'Approved') => ({ letterId: 1, status, remarks: null, reviewerId: 3 });
  // The letter as it stands inside the transaction: learner #2 on `date`.
  const letterOn = (date) => [{ student_id: 2, absence_date: date }];
  const coded = (code) => Object.assign(new Error(code), { code });

  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), [], { rowCount: 1 }, [{ id: 7, status: 'Excused' }]]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(
      r.outcome === 'reviewed' && r.write === 'insert' && r.to === 'Excused' && r.from === null && r.classDay === true && r.row?.id === 7,
      'an approval over no record: reviewed, inserts Excused, the row read back before COMMIT',
      JSON.stringify(r)
    );
    assert(
      JSON.stringify(log.queries) ===
        JSON.stringify(['UPDATE excuse_letters', 'SELECT student_id,', 'SELECT id,', 'INSERT INTO', 'SELECT *']) &&
        log.committed === 1 &&
        log.rolledBack === 0 &&
        log.released === 1,
      '…the letter, the letter read back FOR UPDATE, the day read FOR UPDATE, the insert, the row read, one COMMIT, released',
      JSON.stringify(log)
    );
    assert(r.studentId === 2 && r.absenceDate === CLASS_DAY, "the learner and the date are the letter's as it stands inside the transaction");
  }
  {
    // The handler's earlier read said one date; the letter, read inside the
    // transaction, says another (a parent's edit landed in between): the day
    // written is the letter's.
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn('2026-10-22'), [], { rowCount: 1 }, [{ id: 8, status: 'Excused' }]]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.absenceDate === '2026-10-22' && log.queries[3] === 'INSERT INTO', 'NEGATIVE CONTROL: a date that moved under the review is the one written — the letter and its day cannot part');
  }
  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), [{ id: 9, status: 'Absent' }], { rowCount: 1 }, [{ id: 9, status: 'Excused' }]]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.write === 'update' && r.from === 'Absent' && r.to === 'Excused' && log.queries[3] === 'UPDATE attendance' && log.committed === 1, 'an approval over Absent updates the row by id and commits');
  }
  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), [{ id: 9, status: 'Present' }], [{ id: 9, status: 'Present' }]]);
    const r = await rule.reviewWithAttendance(pool, args('Declined'));
    assert(r.write === null && r.to === 'Present' && log.queries.length === 4 && log.committed === 1, 'a decline over Present writes no attendance and commits the letter');
  }
  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn('2026-10-24'), [], []]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.write === null && r.classDay === false && r.row === null && log.queries.length === 4 && log.committed === 1, 'an approval on a Saturday writes no attendance');
  }
  {
    // A weekday in the December break holding an Absent mark — on a class day
    // the approval would update it to Excused; here the letter commits alone.
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn('2026-12-23'), [{ id: 11, status: 'Absent' }], [{ id: 11, status: 'Absent' }]]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(
      r.write === null && r.classDay === false && r.from === 'Absent' && r.to === 'Absent' && !log.queries.includes('UPDATE attendance') && log.queries.length === 4 && log.committed === 1,
      'an approval on a weekday in the December break leaves its Absent mark and commits the letter alone'
    );
  }
  {
    const { pool, log } = stubPool([{ rowCount: 0 }]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.outcome === 'already_reviewed' && log.queries.length === 1 && log.rolledBack === 1 && log.committed === 0 && log.released === 1, 'a letter no longer Pending: rolled back, no attendance read, released');
  }
  for (const code of ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', '23505', '40P01']) {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), [], coded(code)]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.outcome === 'conflict' && log.committed === 0 && log.rolledBack === 1 && log.released === 1, `a ${code} on the day's insert: rolled back whole, 'conflict', released`, JSON.stringify(r));
  }
  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), coded('ER_LOCK_DEADLOCK')]);
    const r = await rule.reviewWithAttendance(pool, args());
    assert(r.outcome === 'conflict' && log.rolledBack === 1, "a deadlock on the day's read is a conflict too");
  }
  {
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), [], coded('ER_BAD_FIELD_ERROR')]);
    let error = null;
    try {
      await rule.reviewWithAttendance(pool, args());
    } catch (err) {
      error = err;
    }
    assert(
      error && error.code === 'ER_BAD_FIELD_ERROR' && log.rolledBack === 1 && log.committed === 0 && log.released === 1,
      'NEGATIVE CONTROL: any other error is NOT a conflict — rolled back, released and thrown (a 500)'
    );
  }
  assert(rule.isWriteConflict(coded('40001')) && rule.isWriteConflict(coded('ER_LOCK_WAIT_TIMEOUT')), 'a serialization failure and a lock wait timeout are conflicts');
  assert(!rule.isWriteConflict(null) && !rule.isWriteConflict(new Error('plain')), 'nothing else is');
  {
    // A lock wait past lock_timeout is PostgreSQL's 55P03 — MySQL's
    // ER_LOCK_WAIT_TIMEOUT — and is a lost race like the others (Phase 3).
    const { pool, log } = stubPool([{ rowCount: 1 }, letterOn(CLASS_DAY), coded('55P03')]);
    let r = null;
    let thrown = null;
    try {
      r = await rule.reviewWithAttendance(pool, args());
    } catch (err) {
      thrown = err;
    }
    assert(
      !thrown && r.outcome === 'conflict' && log.committed === 0 && log.rolledBack === 1 && log.released === 1,
      'a lock wait past lock_timeout (55P03) rolls back and is conflict',
      thrown ? `thrown: ${thrown.code}` : JSON.stringify(r)
    );
  }
  // Every review transaction sets lock_timeout to MySQL's own wait
  // (innodb_lock_wait_timeout, 50 s), once, as its first statement; PostgreSQL's
  // default is to wait forever.
  const began = stubLogs.filter((l) => l.began === 1);
  assert(
    began.length === stubLogs.length &&
      began.every((l) => l.settings.length === 1 && l.settings[0].first && l.settings[0].sql === "SET LOCAL lock_timeout = '50s'"),
    'every review transaction sets lock_timeout to 50s as its first statement',
    JSON.stringify(stubLogs.map((l) => l.settings))
  );
  assert(
    rule.RETRY_MESSAGE === 'Another change arrived at the same moment, so this decision was not saved. Please try again.',
    'the 409 says the decision was not saved and to try again — true for every conflict, not only one on this day'
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err && err.message);
  process.exit(1);
});
