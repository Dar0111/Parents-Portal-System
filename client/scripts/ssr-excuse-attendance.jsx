// PROOF — an excuse letter's decision and that day's attendance, on the web
// (feat/excuse-attendance, B8; the owner's decision of 2026-10-22, Q1–Q11).
// Run from client/:
//   npx vite build --ssr scripts/ssr-excuse-attendance.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-excuse-attendance.js
//
// What it proves, each check with a NEGATIVE CONTROL that must fail:
//   - the shared words (format/excuseAttendance.js) for EVERY state of the
//     day — not a class day (a weekend, a day outside the school year), being
//     read, unreadable, and each of the five marks — and each sentence agrees
//     with the rule it describes (§5i): what the confirmation says happens is
//     what `decide` does;
//   - the review's two notes RENDERED (AttendanceNote, ConfirmNote) in every
//     state;
//   - the note after a save built from the SERVER'S reply, never the
//     prediction — the reply shaped differently from the prediction wins;
//   - the parent's sentence, the owner's words, in both parent places;
//   - the teacher page's wiring as SOURCE: the day read only for a class day,
//     dropped when stale, re-read after a failed save; Continue waits for the
//     read; the reply's keys in the unwrap list; the old "does not change the
//     attendance record" line gone from every screen;
//   - the server as SOURCE: one transaction, the 409 for a lost race.
// The rule's eleven cells and the server-client parity are
// `npm run test:excuse-attendance-rule` (server/). Cannot prove a real review,
// the 409 under a real race, or what a screen shows after it — the suite and
// the owner's device check (docs/EXCUSE_ATTENDANCE_DEVICE_CHECK.md).

import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  PARENT_NOTE,
  REVIEW_UNWRAP,
  confirmSentence,
  confirmTail,
  dayName,
  decide,
  isClassDay,
  reviewNote,
  successNote,
} from '../src/format/excuseAttendance';
import { AttendanceNote, ConfirmNote } from '../src/pages/teacher/excuseLetters/attendanceNote';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const ROOT = path.resolve(process.cwd());
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = (el) => renderToStaticMarkup(el).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const WED = '2026-10-21'; // a class day
const SAT = '2026-10-24'; // a weekend
const BEFORE = '2026-06-05'; // a weekday before the school year
const ready = (current) => ({ state: 'ready', current });

console.log('\nThe words, every state of the day');
assert(dayName(WED) === 'Wednesday, 21 October 2026', 'the day is named with its weekday: "Wednesday, 21 October 2026"', dayName(WED));
assert(dayName(SAT) === 'Saturday, 24 October 2026', '…and a weekend day too (Q9)');
assert(
  reviewNote(SAT, null) === 'Saturday, 24 October 2026 is not a class day, so neither decision changes attendance.',
  'a weekend: not a class day, so neither decision changes attendance — no read needed'
);
assert(
  reviewNote(BEFORE, null) === 'Friday, 5 June 2026 is not a class day, so neither decision changes attendance.',
  'a weekday before the school year: the same sentence, its weekday named'
);
assert(reviewNote(WED, { state: 'loading', current: null }) === 'Reading the attendance for Wednesday, 21 October 2026…', 'while the day is read: "Reading the attendance for …"');
assert(
  reviewNote(WED, { state: 'failed', current: null }) ===
    'The attendance for Wednesday, 21 October 2026 could not be read. Approving marks an absent or unrecorded class day Excused; declining records an unrecorded class day as Absent; a Present, Late or Excused mark stays.',
  'an unreadable day: the rule itself, true whatever the day holds'
);
const NOTES = {
  null: 'Wednesday, 21 October 2026 has no attendance record yet. Approving records it as Excused; declining records it as Absent.',
  Absent: 'Wednesday, 21 October 2026 is marked Absent. Approving changes it to Excused; declining leaves it Absent.',
  Excused: 'Wednesday, 21 October 2026 is marked Excused. Neither decision changes it.',
  Present: 'Wednesday, 21 October 2026 is marked Present. Neither decision changes it.',
  Late: 'Wednesday, 21 October 2026 is marked Late. Neither decision changes it.',
};
for (const [key, want] of Object.entries(NOTES)) {
  const current = key === 'null' ? null : key;
  assert(reviewNote(WED, ready(current)) === want, `the note over ${current ?? 'no record'}: "${want}"`, reviewNote(WED, ready(current)));
}

console.log('\nThe confirmation names the decision back with its effect (§5e), and says what decide() does (§5i)');
const CONFIRMS = [
  ['Approved', null, 'Wednesday, 21 October 2026 will be recorded as Excused in attendance.'],
  ['Approved', 'Absent', 'Wednesday, 21 October 2026 changes from Absent to Excused in attendance.'],
  ['Approved', 'Excused', 'Wednesday, 21 October 2026 stays Excused in attendance.'],
  ['Approved', 'Present', 'Wednesday, 21 October 2026 stays Present in attendance.'],
  ['Approved', 'Late', 'Wednesday, 21 October 2026 stays Late in attendance.'],
  ['Declined', null, 'Wednesday, 21 October 2026 will be recorded as Absent in attendance.'],
  ['Declined', 'Absent', 'Wednesday, 21 October 2026 stays Absent in attendance.'],
  ['Declined', 'Excused', 'Wednesday, 21 October 2026 stays Excused in attendance.'],
  ['Declined', 'Present', 'Wednesday, 21 October 2026 stays Present in attendance.'],
  ['Declined', 'Late', 'Wednesday, 21 October 2026 stays Late in attendance.'],
];
for (const [decision, current, want] of CONFIRMS) {
  const got = confirmSentence(decision, WED, ready(current));
  const result = decide(decision, current, WED);
  const saysWrite = /will be recorded as|changes from/.test(got);
  assert(
    got === want && saysWrite === Boolean(result.write) && got.includes(result.to),
    `${decision} over ${current ?? 'no record'}: "${want}" — and decide() agrees (${result.write ?? 'no write'}, ${result.to})`,
    got
  );
}
assert(
  confirmSentence('Approved', SAT, null) === 'Saturday, 24 October 2026 is not a class day; attendance does not change.' &&
    confirmSentence('Declined', BEFORE, null) === 'Friday, 5 June 2026 is not a class day; attendance does not change.',
  'not a class day: attendance does not change, under either decision'
);
assert(
  confirmSentence('Approved', WED, { state: 'failed' }) ===
    'If Wednesday, 21 October 2026 is absent or not recorded, it is marked Excused; a Present, Late or Excused mark stays.' &&
    confirmSentence('Declined', WED, { state: 'failed' }) ===
      'If Wednesday, 21 October 2026 is not recorded, it is marked Absent; a mark it already has stays.',
  'an unreadable day: the conditional sentence, true either way'
);
const TAIL = 'The decision cannot be changed afterward.';
const promisesCorrection = (text) => /corrected on Attendance/.test(text);
assert(
  [
    confirmTail('Approved', WED, ready(null)),
    confirmTail('Approved', WED, ready('Absent')),
    confirmTail('Declined', SAT, null),
    confirmTail('Declined', WED, { state: 'failed' }),
  ].every((tail) => tail === TAIL && !promisesCorrection(tail)),
  'the tail is one sentence, true for every learner — it promises no correction (an inactive learner has no register to correct it in)'
);
assert(
  promisesCorrection('The decision cannot be changed afterward; the attendance mark can still be corrected on Attendance.'),
  'NEGATIVE CONTROL: the check finds a promise of correction where it is'
);

console.log('\nThe review notes RENDERED');
const satNote = html(<AttendanceNote date={SAT} day={null} />);
assert(satNote.includes('Saturday, 24 October 2026 is not a class day') && satNote.includes('data-attendance-note'), 'AttendanceNote renders the not-a-class-day sentence');
const absentNote = html(<AttendanceNote date={WED} day={ready('Absent')} />);
assert(absentNote.includes(NOTES.Absent) && absentNote.includes('bg-info-soft'), 'AttendanceNote renders the Absent day in the info box');
const confirm = html(<ConfirmNote decision="Approved" date={WED} day={ready(null)} />);
assert(
  confirm.includes('<strong>Approve this letter?</strong>') &&
    confirm.includes('will be recorded as Excused in attendance.') &&
    confirm.includes(TAIL) &&
    !promisesCorrection(confirm) &&
    confirm.includes('bg-warning-soft'),
  'ConfirmNote renders the bold question, the effect and the tail'
);
const declineConfirm = html(<ConfirmNote decision="Declined" date={WED} day={ready('Present')} />);
assert(
  declineConfirm.includes('<strong>Decline this letter?</strong>') && declineConfirm.includes('stays Present in attendance.') && declineConfirm.includes(TAIL),
  'a decline over Present: the question, "stays Present", the tail'
);
assert(!html(<AttendanceNote date={WED} day={ready('Absent')} />).includes('does not change the attendance record'), 'the old line is not in the rendered note');

console.log("\nThe note after a save is the SERVER'S answer");
const letter = (date) => ({ absence_date: date, status: 'Approved' });
assert(
  successNote('Conde, Marwin', 'Approved', { excuse_letter: letter(WED), attendance: { status: 'Excused' }, attendance_from: null, class_day: true }) ===
    'Letter from Conde, Marwin approved. Wednesday, 21 October 2026 was recorded as Excused.',
  'a new row: "… was recorded as Excused."'
);
assert(
  successNote('Conde, Marwin', 'Approved', { excuse_letter: letter(WED), attendance: { status: 'Excused' }, attendance_from: 'Absent', class_day: true }) ===
    'Letter from Conde, Marwin approved. Wednesday, 21 October 2026 is now Excused (was Absent).',
  'a change: "… is now Excused (was Absent)."'
);
assert(
  successNote('Conde, Marwin', 'Declined', { excuse_letter: letter(WED), attendance: { status: 'Present' }, attendance_from: 'Present', class_day: true }) ===
    'Letter from Conde, Marwin declined. Wednesday, 21 October 2026 stays Present.',
  'no change: "… stays Present."'
);
assert(
  successNote('Conde, Marwin', 'Approved', { excuse_letter: letter(SAT), attendance: null, attendance_from: null, class_day: false }) ===
    'Letter from Conde, Marwin approved. Saturday, 24 October 2026 is not a class day; attendance was not changed.',
  'not a class day: "… attendance was not changed."'
);
const predicted = decide('Approved', null, WED);
const fromReply = successNote('Conde, Marwin', 'Approved', { excuse_letter: letter(WED), attendance: { status: 'Present' }, attendance_from: 'Present', class_day: true });
assert(
  predicted.write === 'insert' && fromReply.endsWith('stays Present.'),
  'NEGATIVE CONTROL: where the day moved under the review, the note follows the reply ("stays Present"), not the prediction (an insert)'
);
assert(
  JSON.stringify(REVIEW_UNWRAP) === JSON.stringify(['excuse_letter', 'attendance', 'attendance_from', 'class_day']),
  "the unwrap list names the reply's four keys (§1)"
);
assert(isClassDay(WED) && !isClassDay(SAT) && !isClassDay(BEFORE), 'the module knows a class day from a weekend and a day before the school year');

console.log("\nThe parent's sentence");
assert(
  PARENT_NOTE ===
    'If the adviser approves it, an absent or unrecorded class day is marked Excused; if declined, an unrecorded class day is marked Absent.',
  "PARENT_NOTE is the owner's sentence, word for word"
);
const parentPage = read('src/pages/parent/ExcuseLettersPage.jsx');
assert(
  parentPage.includes('message: `Use Submit letter when your child is absent. ${PARENT_NOTE}`') && parentPage.includes('<span className="min-w-0">{PARENT_NOTE}</span>'),
  'the parent page shows it in both places: the empty state and the form note'
);

console.log("\nThe teacher page's wiring (source)");
const teacherPage = read('src/pages/teacher/ExcuseLettersPage.jsx');
const fn = (name) => {
  const start = teacherPage.indexOf(`function ${name}(`);
  return start < 0 ? '' : teacherPage.slice(start, teacherPage.indexOf('\n  }\n', start));
};
const readDayFn = fn('readDay');
assert(
  readDayFn.includes('if (!isClassDay(letter.absence_date))') &&
    readDayFn.includes('setDay(null)') &&
    readDayFn.includes('/attendance/student/${letter.student_id}') &&
    readDayFn.includes('params: { from: letter.absence_date, to: letter.absence_date }'),
  'the day is read only for a class day, one day of that learner'
);
assert(readDayFn.includes('if (dayTicket.current !== ticket) return;') && readDayFn.includes("setDay({ state: 'failed', current: null })"), 'a stale answer is dropped; a failure becomes the "could not be read" state');
assert(fn('openReview').includes('readDay(letter)') && fn('submitReview').includes('readDay(reviewing)'), 'it is read when the review opens and again after a failed save (after a 409 the day may have moved)');
assert(
  fn('submitReview').includes('{ unwrap: REVIEW_UNWRAP }') && fn('submitReview').includes('successNote(`${reviewing.last_name}, ${reviewing.first_name}`, decision, reply)'),
  "the save reads the reply's keys and builds its note from the reply"
);
assert(teacherPage.includes("disabled={!decision || day?.state === 'loading'}"), 'Continue waits for the read');
assert(
  teacherPage.includes('<AttendanceNote date={reviewing.absence_date} day={day} />') &&
    teacherPage.includes('<ConfirmNote decision={decision} date={reviewing.absence_date} day={day} />'),
  'the review shows both notes'
);
const oldLine = /does not change the attendance\s+record/;
const screens = [
  'src/pages/teacher/ExcuseLettersPage.jsx',
  'src/pages/parent/ExcuseLettersPage.jsx',
  'src/pages/teacher/excuseLetters/attendanceNote.jsx',
  'src/format/excuseAttendance.js',
];
const stale = screens.filter((file) => oldLine.test(read(file)));
assert(stale.length === 0, 'the old "does not change the attendance record" line is gone from every screen', stale.join(', '));
assert(oldLine.test('Approving records the reason. It does not change the attendance record for that day.'), 'NEGATIVE CONTROL: the check finds the old line where it is');

console.log('\nThe server (source)');
const route = read('../server/routes/excuses.js');
const util = read('../server/utils/excuseAttendance.js');
assert(
  route.includes('const result = await reviewWithAttendance(pool, {') &&
    route.includes("if (result.outcome === 'conflict') {") &&
    route.includes('return res.status(409).json({ success: false, message: RETRY_MESSAGE });') &&
    route.includes('attendance_from: result.from,') &&
    route.includes('class_day: result.classDay,'),
  'the review runs in one transaction, answers 409 for a lost race, and replies with the day'
);
assert(
  util.includes('await conn.beginTransaction();') &&
    util.includes("WHERE id = ? AND status = 'Pending'") &&
    util.includes('FOR UPDATE') &&
    !/ON DUPLICATE KEY/.test(util) &&
    util.includes("'40P01'"),
  'the util: one transaction, the Pending re-check, the day read FOR UPDATE, no MySQL-only upsert, PostgreSQL codes listed'
);
assert(!/must NEVER touch the\s+attendance/i.test(route), 'the route no longer claims a review never touches attendance');
assert(/must NEVER touch the\s+attendance/i.test('It must NEVER touch the attendance table'), 'NEGATIVE CONTROL: that claim would be found');

console.log(`\nssr-excuse-attendance: ${passed}/${passed + failed}${failed ? ` — ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
