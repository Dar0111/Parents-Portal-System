/**
 * Unit tests for utils/schoolCalendar.js — direct calls, no server, no DB,
 * no HTTP (the test-grade-computation shape). Pre-Stage-5 #7 (CAL).
 *
 * The five boundary pairs both ways, the break, the far ends, the month
 * clamp, the table's own consistency, the seed's academic_year, and the
 * refusals: a Date, a non-date string, nothing at all.
 *
 * Usage: npm run test:school-calendar
 */
const fs = require('fs');
const path = require('path');
const {
  SCHOOL_YEAR,
  CLASSES_START,
  CLASSES_END,
  TERMS,
  currentTerm,
  termDates,
  clampMonthToSchoolYear,
} = require('../utils/schoolCalendar');

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

console.log('\nschoolCalendar unit tests\n');

// --- The five boundary pairs, both sides of each line ---
console.log('Boundaries — the latest term whose start is on or before today:');
const boundaries = [
  ['2026-06-07', 1, 'the day before classes is Term 1'],
  ['2026-06-08', 1, 'the first day of classes is Term 1'],
  ['2026-09-15', 1, "Term 1's last day is Term 1"],
  ['2026-09-16', 2, "Term 2's first day is Term 2 at once"],
  ['2026-12-18', 2, "Term 2's last day is Term 2"],
  ['2026-12-19', 2, 'the first day of the break is STILL Term 2 — an end-based rule would say 3'],
  ['2027-01-03', 2, 'the last day of the break is still Term 2'],
  ['2027-01-04', 3, "Term 3's first day is Term 3"],
  ['2027-04-08', 3, 'the last day of classes is Term 3'],
  ['2027-04-09', 3, 'the day after classes end stays Term 3'],
];
for (const [day, expected, label] of boundaries) {
  const got = currentTerm(day);
  assert(got === expected, `${day} → Term ${expected}: ${label}`, `got ${got}`);
}

console.log('\nFar from any boundary:');
assert(currentTerm('2026-05-01') === 1, 'a month before the year opens is Term 1');
assert(currentTerm('2026-12-25') === 2, 'Christmas, mid-break, is Term 2');
assert(currentTerm('2027-08-01') === 3, 'months after the year closes is still Term 3 (until the next table ships)');

// --- The month clamp ---
console.log('\nclampMonthToSchoolYear — the month a calendar opens on:');
const clamps = [
  [{ year: 2026, month: 5 }, { year: 2026, month: 6 }, 'May 2026 (before classes) opens on June 2026'],
  [{ year: 2026, month: 6 }, { year: 2026, month: 6 }, 'June 2026 (the first month) stays June'],
  [{ year: 2026, month: 12 }, { year: 2026, month: 12 }, 'December 2026 (mid-year) is untouched'],
  [{ year: 2027, month: 4 }, { year: 2027, month: 4 }, 'April 2027 (the last month) stays April'],
  [{ year: 2027, month: 5 }, { year: 2027, month: 4 }, 'May 2027 (after classes) opens on April 2027'],
];
for (const [input, expected, label] of clamps) {
  const got = clampMonthToSchoolYear(input);
  assert(got.year === expected.year && got.month === expected.month, label, `got ${got.year}-${got.month}`);
}
assert(
  clampMonthToSchoolYear({ year: 2025, month: 1 }).year === 2026,
  'a whole year early clamps forward to the school year, not to the same month a year on'
);

// --- The table is consistent with itself ---
console.log("\nThe table's own consistency:");
assert(TERMS.length === 3, 'three terms — DO 009 s. 2026, not four quarters');
assert(
  TERMS.every((t) => t.start < t.end),
  'every term starts before it ends'
);
assert(
  TERMS.every((t, i) => i === 0 || TERMS[i - 1].end < t.start),
  'terms are in order and never overlap'
);
assert(TERMS[0].start === CLASSES_START, 'classes start on the first day of Term 1');
assert(TERMS[TERMS.length - 1].end === CLASSES_END, 'classes end on the last day of Term 3');
assert(Object.isFrozen(TERMS) && TERMS.every(Object.isFrozen), 'the table is frozen — a caller cannot edit the calendar');
assert(termDates(2).start === '2026-09-16' && termDates('2').end === '2026-12-18', 'termDates answers by number or by string');

// --- The seed and the module must name the same school year ---
console.log('\nSCHOOL_YEAR agrees with the seed:');
const seed = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'seed.sql'), 'utf8');
const seeded = seed.match(/\('academic_year',\s*'(\d{4}-\d{4})'\)/);
assert(seeded && seeded[1] === SCHOOL_YEAR, `seed.sql academic_year is ${SCHOOL_YEAR}`, `seed says ${seeded && seeded[1]}`);
assert(!/\('current_term'/.test(seed), 'seed.sql no longer writes a current_term row');
assert(
  SCHOOL_YEAR === `${CLASSES_START.slice(0, 4)}-${CLASSES_END.slice(0, 4)}`,
  'SCHOOL_YEAR spans the calendar years of CLASSES_START and CLASSES_END'
);

// --- Refusals: strings only, never coerced ---
console.log('\nRefusals — a date is a YYYY-MM-DD string, never a Date:');
function throws(fn, pattern) {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof TypeError && pattern.test(err.message);
  }
}
assert(throws(() => currentTerm(new Date('2026-09-16T00:00:00+08:00')), /got a Date/), 'a Date argument throws a TypeError naming it, and is never coerced');
assert(throws(() => currentTerm('16/09/2026'), /YYYY-MM-DD/), 'a date in another format throws');
assert(throws(() => currentTerm(), /YYYY-MM-DD/), 'no argument throws — there is no "today" default inside the module');
assert(throws(() => currentTerm(20260916), /got number/), 'a number throws');
let rangeError = false;
try {
  termDates(4);
} catch (err) {
  rangeError = err instanceof RangeError;
}
assert(rangeError, 'termDates(4) is a RangeError, not undefined');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
