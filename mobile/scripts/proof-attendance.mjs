// PROOF — Parent → Attendance's pure half (DV2; §5a-iv). Drives
// src/screens/parent/attendance/logic.js under Node. Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-attendance.mjs
// What it cannot prove: the grid's layout, the day detail — the phone.
import { register } from 'node:module';

// Metro resolves `'../../../format/date'`; Node's ESM loader needs the `.js`.
// One resolve hook, registered from a data: URL before the dynamic import.
const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { alsoRecorded, dayLabel, letterByDate, monthsCovered, recordedDays, yearRows, yearTotals } = await import('../src/screens/parent/attendance/logic.js');

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

console.log('recordedDays');
assert(recordedDays({ Present: 3, Late: 1, Absent: 2, Excused: 1, total: 7 }).present === 4, 'Late counts as present: 3 + 1');
assert(recordedDays({ total: 0 }) === null && recordedDays(undefined) === null, 'nothing recorded → null, never 0 of 0');

console.log('monthsCovered / yearRows / yearTotals');
const rows = [
  { date: '2026-06-10', status: 'Present' },
  { date: '2026-06-11', status: 'Late' },
  { date: '2026-08-03', status: 'Absent' },
  { date: '2026-08-04', status: 'Excused' },
];
const months = monthsCovered(rows);
assert(months.length === 3 && months[1].month === 7, 'June to August, INCLUDING the empty July');
assert(monthsCovered([]).length === 0, 'no rows → no months');
const yr = yearRows(rows);
assert(yr[0].recorded === 2 && yr[0].present === 2 && yr[0].absent === 0, 'June: Late counted as present');
assert(yr[1].recorded === undefined, 'July carries no bucket (renders as a dash)');
assert(yr[2].recorded === 2 && yr[2].absent === 2, 'August: Excused counted as absent');
const totals = yearTotals(yr);
assert(totals.recorded === 4 && totals.present === 2 && totals.absent === 2, 'totals sum the buckets and skip the empty month');

console.log('letterByDate — the latest letter per date wins');
const letters = [
  { id: 1, absence_date: '2026-08-03', status: 'Declined', created_at: '2026-08-04T01:00:00.000Z' },
  { id: 2, absence_date: '2026-08-03', status: 'Pending', created_at: '2026-08-05T01:00:00.000Z' },
];
assert(letterByDate(letters).get('2026-08-03').id === 2, 'the later created_at wins');
assert(letterByDate(undefined).size === 0, 'no letters → empty map');

console.log('alsoRecorded — weekend rows outside the Mon–Fri grid');
const sept = [
  { date: '2026-09-14', status: 'Present' },
  { date: '2026-09-19', status: 'Present' }, // a Saturday
  { date: '2026-09-20', status: 'Absent' }, // a Sunday
  { date: '2026-10-03', status: 'Present' }, // next month's Saturday — not this month
];
const extra = alsoRecorded(sept, 2026, 9);
assert(extra.length === 2 && extra[0].date === '2026-09-19' && extra[1].date === '2026-09-20', 'the two September weekend rows, sorted, and only this month\'s');
assert(alsoRecorded(sept, 2026, 8).length === 0, 'a month with no weekend rows has none');

console.log('dayLabel');
const cell = { date: '2026-09-14' };
assert(dayLabel(cell, null, null) === 'Monday 14 September 2026: not recorded', 'not recorded reads as not recorded, never as absent');
assert(dayLabel(cell, { status: 'Absent' }, null) === 'Monday 14 September 2026: Absent', 'a record reads its status');
assert(dayLabel(cell, { status: 'Absent' }, { status: 'Approved' }) === 'Monday 14 September 2026: Absent, excuse letter approved', 'a letter is spoken too');

console.log(`\nproof-attendance: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
