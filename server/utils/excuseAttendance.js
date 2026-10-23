// AN EXCUSE LETTER'S DECISION SETS THAT DAY'S ATTENDANCE (feat/excuse-attendance,
// B8; the owner's decision of 2026-10-22 and answers Q1-Q11). It replaces the
// school's earlier "excuse lang yung bata pero absent pa rin" rule, under which a
// review never touched `attendance` — that was the owner's call to change, and
// Chapter 5 must say so (the manuscript delta list).
//
// THE RULE, ELEVEN CELLS. THIS FILE DECIDES; client/src/format/excuseAttendance.js
// holds the same table for the words a screen shows, and
// `npm run test:excuse-attendance-rule` runs both over every cell and fails on
// any difference.
//
//   the day before   | Approve              | Decline
//   -----------------+----------------------+---------------------
//   not recorded     | Excused (a new row)  | Absent (a new row)   Q3
//   Absent           | -> Excused           | stays Absent
//   Excused          | stays Excused        | stays Excused        Q2
//   Present          | stays Present        | stays Present        Q1
//   Late             | stays Late           | stays Late           Q1
//   NOT A CLASS DAY  | no write             | no write             Q9
//   (a weekend, the break between terms, or outside the school year)
//
// A decision never turns a day the adviser recorded as there (Present, Late)
// into an absence, and the result does not depend on the order two letters for
// one day are reviewed in. A day that already holds the result is not written
// at all — no `recorded_by` change, no `updated_at` bump.
//
// A CLASS DAY (Q9, as the owner narrowed it on 2026-10-23) is a weekday inside
// one of the three terms, per the school calendar module (TERMS, each term's
// start..end). A weekend, the break between two terms (in SY 2026-2027,
// 2026-12-19 → 2027-01-03), or a date outside the school year gets no
// attendance write under either decision. The calendar itself still blocks
// nothing: an adviser may record any day, weekends included (OPEN QUESTIONS,
// make-up classes) — this rule only keeps an excuse decision from creating
// one. The weekday comes from the date STRING's parts through Date.UTC, never
// from parsing the string, so no timezone can move it; a term's bounds are
// compared as strings.
const { TERMS } = require('./schoolCalendar');

const DECISIONS = ['Approved', 'Declined'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isWeekend(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function inTerm(date) {
  return TERMS.some((term) => term.start <= date && date <= term.end);
}

function isClassDay(date) {
  return typeof date === 'string' && DATE_ONLY.test(date) && inTerm(date) && !isWeekend(date);
}

// What a decision does to one day: `write` is 'insert', 'update' or null; `to`
// is the day's status afterwards (null only for a day that stays unrecorded).
function decide(decision, current, date) {
  if (!DECISIONS.includes(decision)) throw new RangeError(`decision must be one of ${DECISIONS.join(', ')}.`);
  const from = current ?? null;
  if (!isClassDay(date)) return { write: null, to: from, classDay: false };
  const target = decision === 'Approved' ? 'Excused' : 'Absent';
  if (from === null) return { write: 'insert', to: target, classDay: true };
  if (decision === 'Approved' && from === 'Absent') return { write: 'update', to: 'Excused', classDay: true };
  return { write: null, to: from, classDay: true };
}

// THE ONE PLACE A LOST RACE IS RECOGNISED. Two letters for the same unrecorded
// day reviewed at the same moment — or an adviser's register saved at that
// moment — can meet on the day's row: the second INSERT hits the unique key, or
// InnoDB picks a deadlock victim between two gap locks (which can also join
// reviews of NEIGHBOURING days in the same index gap). Either way that
// transaction rolls back whole, so the letter stays Pending and the reviewer is
// told to try again. MySQL's codes and PostgreSQL's (unique violation,
// deadlock, serialization failure) are both listed, so the move to Postgres
// changes nothing here.
const CONFLICT_CODES = new Set(['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', '23505', '40P01', '40001']);

function isWriteConflict(error) {
  return Boolean(error) && CONFLICT_CODES.has(String(error.code));
}

// Worded to be true for every conflict above, not only a race on this one day.
const RETRY_MESSAGE = 'Another change arrived at the same moment, so this decision was not saved. Please try again.';

// The review and the day's attendance in ONE transaction, on a connection of
// its own. The letter's UPDATE carries `status = 'Pending'`, so of two reviews
// of the same letter only one can win (the other is told it was already
// reviewed), and it holds the letter's row lock — so the learner and the date
// are read from the letter INSIDE the transaction, never from the handler's
// earlier read, which a parent's edit could have moved. The day's row is read
// FOR UPDATE before the rule decides, and read back before COMMIT, so the
// reply is the row this transaction left. Plain INSERT / UPDATE by id — no
// MySQL-only upsert.
async function reviewWithAttendance(pool, { letterId, status, remarks, reviewerId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [letter] = await conn.query(
      "UPDATE excuse_letters SET status = ?, teacher_remarks = ?, reviewed_by = ? WHERE id = ? AND status = 'Pending'",
      [status, remarks, reviewerId, letterId]
    );
    if (letter.affectedRows !== 1) {
      await conn.rollback();
      return { outcome: 'already_reviewed' };
    }
    const [letterRows] = await conn.query('SELECT student_id, absence_date FROM excuse_letters WHERE id = ? FOR UPDATE', [letterId]);
    const { student_id: studentId, absence_date: absenceDate } = letterRows[0];
    const [rows] = await conn.query('SELECT id, status FROM attendance WHERE student_id = ? AND date = ? FOR UPDATE', [
      studentId,
      absenceDate,
    ]);
    const existing = rows[0] || null;
    const from = existing ? existing.status : null;
    const result = decide(status, from, absenceDate);
    if (result.write === 'insert') {
      await conn.query('INSERT INTO attendance (student_id, date, status, recorded_by) VALUES (?, ?, ?, ?)', [
        studentId,
        absenceDate,
        result.to,
        reviewerId,
      ]);
    } else if (result.write === 'update') {
      await conn.query('UPDATE attendance SET status = ?, recorded_by = ? WHERE id = ?', [result.to, reviewerId, existing.id]);
    }
    const [after] = await conn.query('SELECT * FROM attendance WHERE student_id = ? AND date = ? LIMIT 1', [studentId, absenceDate]);
    await conn.commit();
    return {
      outcome: 'reviewed',
      studentId,
      absenceDate,
      from,
      to: result.to,
      write: result.write,
      classDay: result.classDay,
      row: after[0] || null,
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // ignore — the connection is released below either way
    }
    if (isWriteConflict(error)) return { outcome: 'conflict' };
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { DECISIONS, isClassDay, decide, isWriteConflict, RETRY_MESSAGE, reviewWithAttendance };
