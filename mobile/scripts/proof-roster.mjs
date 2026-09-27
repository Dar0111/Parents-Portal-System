// PROOF — the attendance roster (Stage 5 branch 3). Drives the verbatim
// `teacher/attendance/roster.js` under Node: the three row states, the
// saved-mark rule, the no-overwrite fill, counts only. What it cannot: that
// the four buttons render and respond — that is the phone (M7).
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-roster.mjs
import { markRestPresent, pickStatus, ROW_STATE_LABEL, rosterCounts, rowState, STATUS_ORDER, unsavedCount } from '../src/screens/teacher/attendance/roster.js';

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

const roster = [{ id: 1 }, { id: 37 }];
const recorded = new Map([[1, 'Present']]);

console.log('order and labels');
assert(STATUS_ORDER.join(',') === 'Present,Late,Absent,Excused', 'the school reading order, Present first');
assert(ROW_STATE_LABEL.changed === 'Changed · not saved', 'the changed row names that nothing is saved');

console.log('rowState — three states, stored vs typed (§5b)');
assert(rowState(1, { 1: 'Present' }, recorded) === 'recorded', 'typed equals stored → recorded');
assert(rowState(1, { 1: 'Late' }, recorded) === 'changed', 'typed differs from stored → changed');
assert(rowState(37, {}, recorded) === 'unmarked', 'nothing typed, nothing stored → unmarked');

console.log('pickStatus — a saved mark is never cleared');
assert(pickStatus({ 37: 'Late' }, recorded, 37, 'Late')[37] === '', 'tapping the selected button on an UNSAVED mark clears it');
const same = { 1: 'Present' };
assert(pickStatus(same, recorded, 1, 'Present') === same, 'tapping it on a RECORDED mark is a no-op (same object), never a clear');
assert(pickStatus({ 1: 'Present' }, recorded, 1, 'Absent')[1] === 'Absent', 'a different button always replaces');

console.log('markRestPresent — never overwrites');
const filled = markRestPresent(roster, { 1: 'Absent' });
assert(filled[1] === 'Absent' && filled[37] === 'Present', 'the marked absence stays; only the unmarked row fills');

console.log('counts, never a rate');
const counts = rosterCounts(roster, { 1: 'Late', 37: '' });
assert(counts.total === 2 && counts.marked === 1 && counts.Late === 1 && !('rate' in counts), '1 of 2 marked, Late counted, no rate key');
assert(unsavedCount(roster, { 1: 'Present', 37: 'Absent' }, recorded) === 1, 'unsaved counts only rows that differ from the database');

console.log(`\nproof-roster: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
