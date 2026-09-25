// PROOF — pre-Stage-5 #7 (CAL): the client's school calendar, and that it
// mirrors the server's.
//
// Two modules hold the same table on purpose (the server decides, the client
// mirrors — the lrnRule / contactRule pattern), so the first thing this proof
// does is load BOTH and assert they agree on every date the boundary set
// names. The client copy is the ESM import; the server copy is CommonJS,
// loaded through createRequire at run time from the repo's server/ folder,
// which is why this runs from client/ like every other proof.
//
// RUN TWICE, like ssr-dates.jsx: the module builds no Date, so its answers
// must be IDENTICAL under TZ=UTC and TZ=America/New_York — a difference means
// a Date crept in.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-school-calendar.jsx --outDir .ssr-tmp
//   TZ=UTC              node .ssr-tmp/ssr-school-calendar.js
//   TZ=America/New_York node .ssr-tmp/ssr-school-calendar.js   # identical

import { createRequire } from 'node:module';
import path from 'node:path';
import * as client from '../src/format/schoolCalendar.js';

const require = createRequire(import.meta.url);
const server = require(path.resolve(process.cwd(), '..', 'server', 'utils', 'schoolCalendar.js'));

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

const BOUNDARIES = [
  ['2026-06-07', 1],
  ['2026-06-08', 1],
  ['2026-09-15', 1],
  ['2026-09-16', 2],
  ['2026-12-18', 2],
  ['2026-12-19', 2],
  ['2027-01-03', 2],
  ['2027-01-04', 3],
  ['2027-04-08', 3],
  ['2027-04-09', 3],
];
const FAR = [
  ['2026-05-01', 1],
  ['2026-12-25', 2],
  ['2027-08-01', 3],
];
const CLAMPS = [
  [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
  [{ year: 2026, month: 6 }, { year: 2026, month: 6 }],
  [{ year: 2026, month: 12 }, { year: 2026, month: 12 }],
  [{ year: 2027, month: 4 }, { year: 2027, month: 4 }],
  [{ year: 2027, month: 5 }, { year: 2027, month: 4 }],
];

console.log(`\nThe boundary rule, client copy (TZ=${process.env.TZ || 'machine'}):`);
for (const [day, expected] of BOUNDARIES) {
  const got = client.currentTerm(day);
  assert(got === expected, `${day} → Term ${expected}`, `got ${got}`);
}
for (const [day, expected] of FAR) {
  const got = client.currentTerm(day);
  assert(got === expected, `${day} → Term ${expected} (far from a boundary)`, `got ${got}`);
}

console.log('\nThe month clamp, client copy:');
for (const [input, expected] of CLAMPS) {
  const got = client.clampMonthToSchoolYear(input);
  assert(
    got.year === expected.year && got.month === expected.month,
    `${input.year}-${input.month} → ${expected.year}-${expected.month}`,
    `got ${got.year}-${got.month}`
  );
}

console.log('\nThe mirror agrees with the server, which decides:');
assert(client.SCHOOL_YEAR === server.SCHOOL_YEAR, `SCHOOL_YEAR is ${server.SCHOOL_YEAR} in both files`);
assert(
  client.CLASSES_START === server.CLASSES_START && client.CLASSES_END === server.CLASSES_END,
  'CLASSES_START and CLASSES_END match'
);
assert(JSON.stringify(client.TERMS) === JSON.stringify(server.TERMS), 'the three-term table is identical, entry for entry');
assert(
  [...BOUNDARIES, ...FAR].every(([day]) => client.currentTerm(day) === server.currentTerm(day)),
  'currentTerm agrees on every boundary and far date'
);
assert(
  CLAMPS.every(([input]) => {
    const c = client.clampMonthToSchoolYear(input);
    const s = server.clampMonthToSchoolYear(input);
    return c.year === s.year && c.month === s.month;
  }),
  'clampMonthToSchoolYear agrees on every clamp case'
);
assert(
  [1, 2, 3].every((t) => JSON.stringify(client.termDates(t)) === JSON.stringify(server.termDates(t))),
  'termDates agrees for all three terms'
);

console.log('\nNegative controls:');
function throwsTypeError(fn) {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof TypeError;
  }
}
assert(throwsTypeError(() => client.currentTerm(new Date())), 'NEGATIVE CONTROL: a Date argument throws — never coerced to a string');
assert(throwsTypeError(() => client.currentTerm('2026-9-16')), 'NEGATIVE CONTROL: an unpadded date string throws — the shape is exact');
assert(throwsTypeError(() => client.currentTerm()), 'NEGATIVE CONTROL: no "today" default — the caller names the day');
assert(Object.isFrozen(client.TERMS), 'the client table is frozen too');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
