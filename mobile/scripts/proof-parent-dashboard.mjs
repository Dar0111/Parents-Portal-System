// PROOF — the parent dashboard's pure half (MOBILE_CONVENTIONS M12; §15).
// Drives src/screens/parent/dashboard/logic.js under Node. Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-parent-dashboard.mjs
// What it cannot prove: the cards rendering, the hero's colours — the phone.
import { register } from 'node:module';

// Metro resolves `'../format/date'`; Node's ESM loader needs the `.js`. One
// resolve hook, registered from a data: URL before the dynamic import below,
// appends it for a relative, extensionless specifier and nothing else.
const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { childInitials, childName, classLabel, heroGrades, letterTerm, recordedDays, weekStrip } = await import('../src/screens/parent/dashboard/logic.js');

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
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

console.log('recordedDays');
assert(recordedDays({ total: 0 }) === null, 'total 0 → null (no fraction, not 0 of 0)');
assert(recordedDays(null) === null, 'no summary → null');
const rd = recordedDays({ Present: 10, Late: 2, Absent: 3, Excused: 1, total: 16 });
assert(rd.present === 12 && rd.total === 16 && rd.absent === 3 && rd.late === 2, 'Late counts as present: 10 + 2 = 12 of 16; absent and late carried');
assert(recordedDays({ total: '4', Present: '3' }).present === 3, 'string counts (mysql2 DECIMAL) coerce');

console.log('weekStrip — three states');
// 2026-09-25 is a Friday; the seven days ending there are Sat 19 … Fri 25.
const rows = [
  { date: '2026-09-21', status: 'Present' },
  { date: '2026-09-22', status: 'Absent' },
];
const strip = weekStrip(rows, '2026-09-25');
assert(strip.length === 7 && strip[6].date === '2026-09-25', 'seven days ending on the given day');
assert(strip.find((d) => d.date === '2026-09-21').kind === 'recorded' && strip.find((d) => d.date === '2026-09-22').status === 'Absent', 'a recorded day carries its status');
assert(strip.find((d) => d.date === '2026-09-19').kind === 'weekend' && strip.find((d) => d.date === '2026-09-20').kind === 'weekend', 'Saturday and Sunday are "weekend", never "unrecorded"');
assert(strip.find((d) => d.date === '2026-09-23').kind === 'unrecorded' && strip.find((d) => d.date === '2026-09-23').status === null, 'a school day with no row is "unrecorded" with no status');
assert(weekStrip([{ date: '2026-09-19', status: 'Present' }], '2026-09-25').find((d) => d.date === '2026-09-19').kind === 'recorded', 'a RECORDED Saturday is recorded, not weekend (the record wins)');

console.log('letterTerm — Key Stage 1 pills');
const subjects = [
  { subject_name: 'Makabansa', terms: { 2: { descriptive_grade: 'B', descriptor: { descriptor: 'Benchmarking' } } } },
  { subject_name: 'Mathematics', terms: { 2: { descriptive_grade: null } } },
  { subject_name: 'GMRC', terms: {} },
];
const lt = letterTerm(subjects, 2);
assert(lt.term === 2 && lt.pills.length === 1 && lt.pills[0].letter === 'B' && lt.pills[0].descriptor === 'Benchmarking', 'one pill for the one recorded letter, with the server\'s word');
assert(lt.missing === 2, 'missing counts every subject without a letter — a fact, not a progress bar');
assert(letterTerm(subjects, 1) === null, 'no letters in the term → null (the hero says "No letters recorded yet")');
assert(letterTerm(undefined, 2) === null, 'no subjects → null');

console.log('heroGrades — the descriptor is a STRING');
const grades = { descriptive: false, term: 2, complete: false };
const card = { term_averages: { 1: '87.50', 2: null, 3: null }, term_average_descriptors: { 1: { descriptor: 'Benchmarking', remarks: 'Passed' }, 2: null, 3: null } };
const h1 = heroGrades(grades, card, 1);
assert(h1.average === '87.50' && h1.descriptor === 'Benchmarking', 'the current term\'s average and its band word, flattened');
assert(!('remarks' in h1) && h1.descriptor !== card.term_average_descriptors[1], 'never the object, never remarks (§4: Passed is a verdict)');
assert(heroGrades(grades, card, 2).average === null && heroGrades(grades, card, 2).descriptor === null, 'a term with no average has no word');
assert(heroGrades({ descriptive: true }, card, 1).descriptive === true && !('average' in heroGrades({ descriptive: true }, card, 1)), 'Key Stage 1 passes the grades through untouched');
assert(throws(() => heroGrades(grades, { term_average_descriptors: { 1: { descriptor: { descriptor: 'x' } } }, term_averages: {} }, 1)), 'NEGATIVE CONTROL: an object where the string should be is refused (§19f)');

console.log('labels');
assert(classLabel({ grade_level: 6, section: 'Malikhain' }) === 'Grade 6 - Malikhain' && classLabel({}) === null && classLabel({ grade_level: 6 }) === 'Grade 6', 'classLabel: full, none, no section');
assert(childName({ student_first_name: 'Tala', student_last_name: 'Halimbawa' }) === 'Tala Halimbawa' && childName({}) === null, 'childName: a name is not an identifier; empty → null');
assert(childInitials({ student_first_name: 'tala', student_last_name: 'halimbawa' }) === 'TH', 'childInitials upper-cases');

console.log(`\nproof-parent-dashboard: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
