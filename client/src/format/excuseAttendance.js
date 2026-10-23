// AN EXCUSE LETTER'S DECISION AND THAT DAY'S ATTENDANCE — the words every
// screen shows (feat/excuse-attendance, B8; the owner's decision of 2026-10-22,
// Q1-Q11). MIRRORED byte for byte to mobile/src/format/excuseAttendance.js and
// held equal by `npm run lint:mirrors`.
//
// THE SERVER DECIDES (server/utils/excuseAttendance.js). `decide` below is the
// same eleven-cell table, kept here only so a sentence can say exactly what the
// server will do; `npm run test:excuse-attendance-rule` (server/) runs both
// over every cell and fails on any difference, so the copy cannot drift.
//
//   approve:  not recorded → Excused (new) · Absent → Excused · Excused, Present, Late stay
//   decline:  not recorded → Absent (new) · Absent, Excused, Present, Late stay
//   a day that is not a class day (a weekend, or outside the school year): no write
//
// Every sentence is a claim about behaviour (§5i), so each one is true in
// every case it is shown for — including the one shown when the day's mark
// could not be read. Dates arrive as `YYYY-MM-DD` strings; the weekday and the
// long form come from format/date.js, the only home for date maths (§5a-iv).
import { isWeekend, longDate, weekdayName } from './date.js';
import { CLASSES_END, CLASSES_START } from './schoolCalendar.js';

export const DECISIONS = ['Approved', 'Declined'];

// The parent's sentence, in all four places a parent reads about review: the
// web's Excuse Letters empty state and form note, the phone's list and compose
// screens.
export const PARENT_NOTE =
  'If the adviser approves it, an absent or unrecorded class day is marked Excused; if declined, an unrecorded class day is marked Absent.';

export function isClassDay(date) {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= CLASSES_START &&
    date <= CLASSES_END &&
    !isWeekend(date)
  );
}

export function decide(decision, current, date) {
  if (!DECISIONS.includes(decision)) throw new RangeError(`decision must be one of ${DECISIONS.join(', ')}.`);
  const from = current ?? null;
  if (!isClassDay(date)) return { write: null, to: from, classDay: false };
  const target = decision === 'Approved' ? 'Excused' : 'Absent';
  if (from === null) return { write: 'insert', to: target, classDay: true };
  if (decision === 'Approved' && from === 'Absent') return { write: 'update', to: 'Excused', classDay: true };
  return { write: null, to: from, classDay: true };
}

// "Wednesday, 21 October 2026" — the day named with its weekday (Q9).
export function dayName(date) {
  return `${weekdayName(date)}, ${longDate(date)}`;
}

function notClassDay(date) {
  return `${dayName(date)} is not a class day, so neither decision changes attendance.`;
}

// What one decision does, as a clause: "approving changes it to Excused".
function clause(verb, result, current) {
  if (result.write === 'insert') return `${verb} records it as ${result.to}`;
  if (result.write === 'update') return `${verb} changes it to ${result.to}`;
  return `${verb} leaves it ${current}`;
}

// THE REVIEW'S NOTE, before a decision is chosen. `day` is the page's read of
// that day: { state: 'loading' | 'ready' | 'failed', current } — `current` the
// day's status, or null for no record. A day that is not a class day needs no
// read.
export function reviewNote(date, day) {
  if (!isClassDay(date)) return notClassDay(date);
  if (!day || day.state === 'loading') return `Reading the attendance for ${dayName(date)}…`;
  if (day.state === 'failed') {
    return `The attendance for ${dayName(date)} could not be read. Approving marks an absent or unrecorded class day Excused; declining records an unrecorded class day as Absent; a Present, Late or Excused mark stays.`;
  }
  const current = day.current ?? null;
  const approve = decide('Approved', current, date);
  const decline = decide('Declined', current, date);
  const state = current === null ? `${dayName(date)} has no attendance record yet.` : `${dayName(date)} is marked ${current}.`;
  if (!approve.write && !decline.write) return `${state} Neither decision changes it.`;
  return `${state} ${clause('Approving', approve, current)}; ${clause('declining', decline, current)}.`;
}

// THE CONFIRMATION'S SENTENCE (§5e: it names the decision back), under the
// bold "Approve this letter?" / "Decline this letter?".
export function confirmSentence(decision, date, day) {
  if (!isClassDay(date)) return `${dayName(date)} is not a class day; attendance does not change.`;
  if (!day || day.state !== 'ready') {
    return decision === 'Approved'
      ? `If ${dayName(date)} is absent or not recorded, it is marked Excused; a Present, Late or Excused mark stays.`
      : `If ${dayName(date)} is not recorded, it is marked Absent; a mark it already has stays.`;
  }
  const current = day.current ?? null;
  const result = decide(decision, current, date);
  if (result.write === 'insert') return `${dayName(date)} will be recorded as ${result.to} in attendance.`;
  if (result.write === 'update') return `${dayName(date)} changes from ${current} to ${result.to} in attendance.`;
  return `${dayName(date)} stays ${current} in attendance.`;
}

// The sentence after it. Only what is true for every learner: a decision
// cannot be undone. (A mark it writes is an ordinary row an adviser can
// re-mark — but not for an inactive learner, whom no register lists, so the
// sentence does not promise it.)
export function confirmTail() {
  return 'The decision cannot be changed afterward.';
}

// THE RESULT, built from the server's reply — never from the prediction — so
// it stays exact even if the day changed between the read and the decision.
// `reply` is { excuse_letter, attendance, attendance_from, class_day }.
export function successNote(learnerName, decision, reply) {
  const verb = decision === 'Approved' ? 'approved' : 'declined';
  const base = `Letter from ${learnerName} ${verb}.`;
  const date = reply?.excuse_letter?.absence_date;
  if (!date) return base;
  if (!reply.class_day) return `${base} ${dayName(date)} is not a class day; attendance was not changed.`;
  const to = reply.attendance?.status ?? null;
  const from = reply.attendance_from ?? null;
  if (to === null) return base;
  if (from === null) return `${base} ${dayName(date)} was recorded as ${to}.`;
  if (from === to) return `${base} ${dayName(date)} stays ${to}.`;
  return `${base} ${dayName(date)} is now ${to} (was ${from}).`;
}

// The keys the review's reply carries (§1: the unwrap list names every one).
export const REVIEW_UNWRAP = ['excuse_letter', 'attendance', 'attendance_from', 'class_day'];
