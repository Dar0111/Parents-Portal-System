// DV1b-b render proof. Kept, like DV1b-a's.
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-dv1b-b.jsx --outDir
// .ssr-tmp && node .ssr-tmp/ssr-dv1b-b.js`. It reads page source through
// `process.cwd()`, so the working directory is part of its contract, and it
// lives in `scripts/` because `.oxlintrc.json` gives `env.node` only here.
//
// §14e: what must be proved is reachable by props or by import. The roster's
// BEHAVIOUR — the clear rule, the no-overwrite fill, the counts — lives in
// `attendance/roster.js` precisely so this file can drive it directly;
// renderToStaticMarkup cannot click a button, so none of it could be asserted
// through a render.
//
// THE FIVE LETTER-CARD ASSERTIONS THAT USED TO SIT AT THE END ARE GONE
// (UI-B, 2026-09-23). They read this repo's SOURCE with a regex and passed
// while the defect they were written to catch was live: they proved that an
// `actions` prop had been WRITTEN, and `DataTable` never rendered it (§17d).
// `scripts/ssr-cards.jsx` now asserts all five by RENDERING the real card
// through the real `Card`. Keeping both would have left a weaker check beside
// a stronger one on the same claim, and relabelling would have kept a check
// that proves authorship. 35 → 30, and this file has no `readFileSync` left.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  ROW_STATE_LABEL,
  STATUS_ORDER,
  markRestPresent,
  pickStatus,
  rosterCounts,
  rowState,
  unsavedCount,
} from '../src/pages/teacher/attendance/roster.js';
import { RosterCards, StatusButtons } from '../src/pages/teacher/AttendancePage.jsx';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

const roster = [
  { id: 1, first_name: 'Marwin', last_name: 'Conde', lrn: '136893000001' },
  { id: 2, first_name: 'Ana', last_name: 'Reyes', lrn: '136893000002' },
  { id: 3, first_name: 'Ben', last_name: 'Santos', lrn: '136893000003' },
];
// Marwin is RECORDED as Present; Ana has an unsaved Late; Ben is unmarked.
const recorded = new Map([[1, 'Present']]);
const marks = { 1: 'Present', 2: 'Late', 3: '' };

console.log('DV1b-b — the encode roster, and the letter card that can be read:\n');

// ---------------- row state ----------------
assert(rowState(1, marks, recorded) === 'recorded', 'a stored mark that matches reads Recorded');
assert(rowState(2, marks, recorded) === 'changed', 'an unsaved mark reads Changed · not saved');
assert(rowState(3, marks, recorded) === 'unmarked', 'no mark reads Not marked yet');
assert(
  rowState(1, { ...marks, 1: 'Absent' }, recorded) === 'changed',
  'changing a RECORDED mark reads Changed, not Recorded'
);
assert(ROW_STATE_LABEL.changed === 'Changed · not saved', 'the changed label is the mockup wording');

// ---------------- the clear rule ----------------
const clearedUnsaved = pickStatus(marks, recorded, 2, 'Late');
assert(clearedUnsaved[2] === '', 'tapping the selected button CLEARS an unsaved mark');

const clearedSaved = pickStatus(marks, recorded, 1, 'Present');
assert(clearedSaved[1] === 'Present', 'tapping the selected button does NOT clear a RECORDED mark');
assert(clearedSaved === marks, 'and it is a no-op — the same object, so nothing re-renders');

const changedSaved = pickStatus(marks, recorded, 1, 'Absent');
assert(changedSaved[1] === 'Absent', 'a recorded mark can still be CHANGED to another status');

// NEGATIVE CONTROL — a recorded mark cleared must fail.
assert(
  !(pickStatus(marks, recorded, 1, 'Present')[1] === ''),
  'NEGATIVE CONTROL: clearing a recorded mark is refused',
  'a recorded mark was cleared'
);
// ...and the control bites: with nothing recorded, the same tap DOES clear.
assert(
  pickStatus(marks, new Map(), 1, 'Present')[1] === '',
  'NEGATIVE CONTROL: with nothing stored, that same tap DOES clear — so the rule is real'
);

// ---------------- mark the rest ----------------
const filled = markRestPresent(roster, marks);
assert(filled[3] === 'Present', 'Mark the rest fills an UNMARKED row');
assert(filled[2] === 'Late', 'and NEVER overwrites a row already marked');
assert(filled[1] === 'Present', 'and leaves a recorded row as it is');
assert(markRestPresent(roster, filled)[2] === 'Late', 'running it twice changes nothing more');

// ---------------- counts, and the disabled state ----------------
const c = rosterCounts(roster, marks);
assert(c.total === 3 && c.marked === 2, 'counts: 2 of 3 marked', JSON.stringify(c));
assert(c.Present === 1 && c.Late === 1 && c.Absent === 0 && c.Excused === 0, 'per-status counts');
const cFull = rosterCounts(roster, filled);
assert(cFull.marked === cFull.total, 'once every row is marked, marked === total — the disabled case');
assert(!/%|rate/i.test(JSON.stringify(c)), 'counts only — no percentage and no "rate" anywhere');

assert(unsavedCount(roster, marks, recorded) === 1, 'one unsaved change (Ana)');
assert(unsavedCount(roster, { 1: 'Present', 2: '', 3: '' }, recorded) === 0, 'and none when the draft matches storage');

// ---------------- the phone card ----------------
const cards = render(<RosterCards roster={roster} marks={marks} recorded={recorded} onPick={() => {}} />);
assert(cards.includes('Conde, Marwin'), 'the card shows the learner name');
assert(cards.includes('Recorded') && cards.includes('Not marked yet') && cards.includes('Changed'),
  'all three row states appear across the list');

// §5c — the LRN is half a credential and is NOT on the phone card.
assert(!cards.includes('136893000001'), 'NO LRN on the phone card (§5c)', 'an LRN reached the card');
assert(!/\d{12}/.test(cards), 'and no 12-digit value at all');

// aria-pressed, one true per row.
assert((cards.match(/aria-pressed="true"/g) || []).length === 2,
  'exactly two buttons are pressed — Marwin and Ana, not Ben',
  String((cards.match(/aria-pressed="true"/g) || []).length));
assert((cards.match(/aria-pressed="false"/g) || []).length === 10,
  'and the other ten are not pressed');
assert(STATUS_ORDER.every((s) => cards.includes(`>${s}</button>`)), 'all four statuses are FULL WORDS, not initials');

// Selected state is never colour alone: fill + 2px border + bold.
const one = render(<StatusButtons student={roster[0]} marks={marks} onPick={() => {}} />);
assert(/border-2/.test(one) && /font-bold/.test(one),
  'the selected button carries a 2px border AND bold — never colour alone');
assert(/h-11/.test(one), 'buttons are h-11 (44px), the touch-target floor');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
