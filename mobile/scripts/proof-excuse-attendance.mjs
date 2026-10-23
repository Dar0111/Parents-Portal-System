// PROOF — an excuse letter's decision and that day's attendance on the phone
// (feat/excuse-attendance, B8; the owner's decision of 2026-10-22, Q1–Q11).
// Run from mobile/:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-excuse-attendance.mjs
//
// What it proves, each source check with a NEGATIVE CONTROL that must fail:
//   - the mirrored words (src/format/excuseAttendance.js) DRIVEN: the same
//     sentences the web proof holds, for a class day, a weekend, a weekday in
//     the December break (not a class day: a class day is a weekday inside
//     one of the three terms, the owner's answer of 2026-10-23) and an
//     unreadable day — and the file byte-equal to the web's;
//   - the review screen as SOURCE: the day read only for a class day, from
//     the first render (no state set in the effect), a stale answer dropped,
//     read again after a failed save; the note and the confirmation from the
//     module; Continue waiting for the read; the note after the save from the
//     reply's keys;
//   - the parent's two screens: PARENT_NOTE in the list's empty state and the
//     compose note, the old line gone;
//   - the teacher's register re-reading on FOCUS only, never on the mount's
//     focus, and only while nothing is unsaved, no save in flight and no pull
//     (Q7);
//   - the parent's Attendance re-reading on focus, quietly — no skeleton, no
//     pull indicator (Q8).
// Cannot prove a focus, a real review or the 409 — the suite and the owner's
// check on the phone (docs/EXCUSE_ATTENDANCE_DEVICE_CHECK.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PARENT_NOTE,
  REVIEW_UNWRAP,
  confirmSentence,
  confirmTail,
  decide,
  reviewNote,
  successNote,
} from '../src/format/excuseAttendance.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(here, '..');
const read = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8');

let passed = 0;
let failed = 0;
function check(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  NO  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const WED = '2026-10-21';
const SAT = '2026-10-24';

console.log('the mirrored words, driven');
check(
  reviewNote(WED, { state: 'ready', current: 'Absent' }) ===
    'Wednesday, 21 October 2026 is marked Absent. Approving changes it to Excused; declining leaves it Absent.',
  'an Absent day: approving changes it to Excused, declining leaves it'
);
check(
  reviewNote(SAT, null) === 'Saturday, 24 October 2026 is not a class day, so neither decision changes attendance.',
  'a weekend: not a class day, its weekday named (Q9)'
);
check(
  reviewNote('2026-12-23', null) === 'Wednesday, 23 December 2026 is not a class day, so neither decision changes attendance.' &&
    decide('Approved', 'Absent', '2026-12-23').write === null &&
    decide('Approved', 'Absent', '2026-12-18').write === 'update',
  'a weekday in the December break: not a class day, nothing written; Term 2\'s last day still is one'
);
check(
  confirmSentence('Declined', WED, { state: 'ready', current: null }) === 'Wednesday, 21 October 2026 will be recorded as Absent in attendance.',
  'a decline over no record: "will be recorded as Absent"'
);
check(
  confirmSentence('Approved', WED, { state: 'failed' }) ===
    'If Wednesday, 21 October 2026 is absent or not recorded, it is marked Excused; a Present, Late or Excused mark stays.',
  'an unreadable day: the conditional sentence'
);
check(
  [confirmTail('Approved', WED, { state: 'ready', current: 'Late' }), confirmTail('Declined', WED, { state: 'ready', current: null }), confirmTail('Approved', SAT, null)].every(
    (tail) => tail === 'The decision cannot be changed afterward.'
  ),
  'the tail is one sentence for every decision — no promise of a correction (an inactive learner has no register)'
);
check(
  successNote('Alcantara, Nino', 'Approved', {
    excuse_letter: { absence_date: WED },
    attendance: { status: 'Excused' },
    attendance_from: 'Absent',
    class_day: true,
  }) === 'Letter from Alcantara, Nino approved. Wednesday, 21 October 2026 is now Excused (was Absent).',
  "the note after a save, from the server's reply"
);
check(decide('Declined', 'Excused', WED).write === null, 'a decline over Excused writes nothing (Q2)');
check(
  PARENT_NOTE ===
    'If the adviser approves it, an absent or unrecorded class day is marked Excused; if declined, an unrecorded class day is marked Absent.',
  "PARENT_NOTE is the owner's sentence"
);
const mirror = read('src/format/excuseAttendance.js').replace(/\r\n/g, '\n');
const web = fs.readFileSync(path.join(MOBILE, '..', 'client', 'src', 'format', 'excuseAttendance.js'), 'utf8').replace(/\r\n/g, '\n');
check(mirror === web, "the phone's module is byte-equal to the web's");

console.log('the review screen (source)');
const review = read('src/screens/teacher/ExcuseLetterReviewScreen.jsx');
check(
  review.includes("useState(() => (isClassDay(date) ? { state: 'loading', current: null } : null))") &&
    review.includes('if (isClassDay(date)) fetchDay();'),
  'the day is read only for a class day, loading from the first render (no state set in the effect)'
);
check(
  review.includes('/attendance/student/${letter.student_id}') &&
    review.includes('params: { from: date, to: date }') &&
    review.includes('if (dayTicket.current !== ticket) return;'),
  "one day of that learner, a stale answer dropped"
);
check(review.includes('<Text className="min-w-0 flex-1 text-sm text-info-strong">{reviewNote(date, day)}</Text>'), 'the note is the module\'s');
check(review.includes('{confirmSentence(decision, date, day)} {confirmTail(decision, date, day)}'), 'the confirmation names the decision back with its effect');
check(review.includes("disabled={!decision || day?.state === 'loading'}"), 'Continue waits for the read');
check(
  review.includes('{ unwrap: REVIEW_UNWRAP }') && review.includes('successNote(`${letter.last_name}, ${letter.first_name}`, decision, reply)'),
  "the save reads the reply's keys and builds the note from the reply"
);
check(JSON.stringify(REVIEW_UNWRAP) === JSON.stringify(['excuse_letter', 'attendance', 'attendance_from', 'class_day']), 'the unwrap list names the four keys');
const catchBlock = review.slice(review.indexOf('} catch (err) {'), review.indexOf('} finally {'));
check(catchBlock.includes('fetchDay();'), 'a failed save reads the day again (after a 409 the day may have moved)');
const oldLine = /does not change the attendance\s+record/;
check(!oldLine.test(review), 'the old line is gone from the review screen');
check(oldLine.test('Approving records the reason. It does not change the attendance record for that day.'), 'NEGATIVE CONTROL: the check finds the old line where it is');

console.log("the parent's screens (source)");
const list = read('src/screens/parent/ExcuseLettersScreen.jsx');
const compose = read('src/screens/parent/ExcuseLetterComposeScreen.jsx');
check(list.includes('message: `Use Submit letter when your child is absent. ${PARENT_NOTE}`'), "the list's empty state carries PARENT_NOTE");
check(compose.includes('<Text className="min-w-0 flex-1 text-sm text-info-strong">{PARENT_NOTE}</Text>'), "the compose screen's note is PARENT_NOTE");
check(!oldLine.test(list) && !oldLine.test(compose), 'the old line is gone from both');

console.log("the teacher's register: a focus re-read while nothing is unsaved (Q7)");
const register = read('src/screens/teacher/AttendanceScreen.jsx');
const focusStart = register.indexOf('const firstFocus = useRef(true);');
const focusBlock = register.slice(focusStart, register.indexOf('const pick = useCallback', focusStart));
check(focusStart > 0 && focusBlock.includes('if (firstFocus.current) {') && focusBlock.includes('firstFocus.current = false;'), "the mount's focus is skipped (the effect has already read it)");
const guard = 'if (latest.unsaved !== 0 || latest.saving || latest.refreshing) return undefined;';
const guarded = (block) => block.includes(guard) && block.indexOf(guard) < block.indexOf('latest.loadRoster()');
check(guarded(focusBlock), 'it re-reads only while nothing is unsaved, no save is in flight and no pull is under way — the guard BEFORE the read');
check(!guarded(focusBlock.replace(guard, '')), 'NEGATIVE CONTROL: the same block with the guard removed fails the check');
const newestOnly = (block) =>
  block.includes('focusRead.current += 1;') &&
  block.includes('const mine = focusRead.current;') &&
  block.includes('setFocusReading(true);') &&
  block.includes('if (focusRead.current === mine) setFocusReading(false);') &&
  !block.includes('.finally(() => setFocusReading(false))');
check(newestOnly(focusBlock), 'while the read is in flight `focusReading` is set, and only the NEWEST focus read clears it — an older one answering late cannot unblock the register');
check(
  !newestOnly(focusBlock.replace('if (focusRead.current === mine) setFocusReading(false);', 'setFocusReading(false);').replace('.finally(() => {', '.finally(() => setFocusReading(false)); (() => {')),
  'NEGATIVE CONTROL: the first version (every read clears the flag) fails the check'
);
check(
  register.includes("pointerEvents={refreshing || saving || focusReading ? 'none' : 'auto'}") &&
    register.includes('disabled={saving || refreshing || focusReading || entries.length === 0}'),
  'and the register takes no touches and Save waits meanwhile, as for a pull'
);
check(focusBlock.includes('useCallback(() => {') && focusBlock.includes('}, [])'), 'the callback is stable — a focus re-reads, a section or date change does not (the effect owns those)');
check(focusBlock.includes('focusState.current = { unsaved, saving, refreshing, loadRoster };'), 'the latest values reach it through a ref');

console.log("the parent's Attendance: a quiet focus re-read (Q8)");
const parent = read('src/screens/parent/AttendanceScreen.jsx');
check(parent.includes("else if (!quiet) setLoading(true);"), 'a quiet read shows no skeleton');
const pStart = parent.indexOf('const firstFocus = useRef(true);');
const pBlock = parent.slice(pStart, parent.indexOf('const fraction', pStart));
check(
  pStart > 0 && pBlock.includes('if (firstFocus.current) {') && pBlock.includes('setYearTick((n) => n + 1);') && pBlock.includes('}, [])'),
  'every focus after the mount re-reads the month and the history, from a stable callback'
);
const quietOnlyOverAnAnswer = (block) =>
  block.includes('failedRead.current = error != null;') && block.includes('latestLoad.current({ quiet: !failedRead.current });');
check(
  quietOnlyOverAnAnswer(pBlock),
  'quietly while an answer is on screen; after a failed read it shows the skeleton — never "Nothing recorded" over an empty month while the read is out'
);
check(
  !quietOnlyOverAnAnswer(pBlock.replace('latestLoad.current({ quiet: !failedRead.current });', 'latestLoad.current({ quiet: true });')),
  'NEGATIVE CONTROL: the first version (always quiet) fails the check'
);
check(!pBlock.includes('pull: true'), 'it is not a pull — no pull indicator');

console.log(`\nproof-excuse-attendance: ${passed}/${passed + failed}${failed ? ` — ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
