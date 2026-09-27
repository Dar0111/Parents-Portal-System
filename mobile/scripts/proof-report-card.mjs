// PROOF — the report card's pure half and the grade text (§3, §14a, §5a-v).
// Drives src/screens/parent/reportCard/logic.js and src/format/gradeText.js
// under Node. Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-report-card.mjs
// What it cannot prove: GradeValue / TermValue rendering "— Pending" as
// text, the breakdown never printing initial_grade — the phone.
import { register } from 'node:module';

// Metro resolves `'./scorePair'`; Node's ESM loader needs the `.js`. One
// resolve hook, registered from a data: URL before the dynamic imports below.
const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { gradeText } = await import('../src/format/gradeText.js');
const { formatScorePair, SCORE_PENDING } = await import('../src/format/scorePair.js');
const { finalCell, initialSegment, joinTerms, readingNoteLines, showGeneralAverage, statusLine, termStatuses } = await import('../src/screens/parent/reportCard/logic.js');

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

const numerical = [
  { subject_name: 'English', terms: { 1: { term_grade: 88, grade_id: 1 }, 2: { term_grade: 90, grade_id: 2 } } },
  { subject_name: 'Math', terms: { 1: { term_grade: 85, grade_id: 3 }, 2: null } },
];

console.log('termStatuses / statusLine / initialSegment');
const st = termStatuses(numerical, 'numerical');
assert(st[0].state === 'full' && st[1].state === 'partial' && st[2].state === 'none', 'full / partial / none across the three terms');
assert(statusLine(st).label === 'Term 2 partly recorded (1 of 2)' && statusLine(st).tone === 'neutral', 'the latest term with data is named, partial in neutral');
assert(JSON.stringify(statusLine(st).missing) === '[3]', 'the terms with nothing are listed');
assert(statusLine(termStatuses([], 'numerical')).label === 'No grades recorded yet', 'no data → the no-grades badge');
assert(statusLine(termStatuses([numerical[0]], 'numerical')).tone === 'success', 'a fully recorded latest term is success');
assert(initialSegment(st) === '2', 'the term view opens on the latest term with data');
assert(initialSegment(termStatuses([], 'numerical')) === '1', '…else on Term 1');
assert(joinTerms([3]) === 'Term 3' && joinTerms([2, 3]) === 'Terms 2 and 3' && joinTerms([1, 2, 3]) === 'Terms 1, 2 and 3', 'joinTerms: one, two, three');

console.log('descriptive mode');
const ks1 = [{ subject_name: 'Makabansa', terms: { 1: { descriptive_grade: 'A', grade_id: 9 } } }, { subject_name: 'GMRC', terms: {} }];
assert(termStatuses(ks1, 'descriptive')[0].recorded === 1, 'a letter counts as recorded in descriptive mode');
assert(finalCell({ final_grade: 'A', final_grade_descriptor: { descriptor: 'Advancing' } }, 'descriptive').kind === 'letter', 'the Final cell is a LETTER renderer in descriptive mode');
assert(finalCell({ final_grade: 89 }, 'numerical').kind === 'number' && finalCell({ final_grade: 89 }, 'numerical').value === 89, '…and a number renderer in numerical mode');
assert(showGeneralAverage('descriptive') === false && showGeneralAverage('numerical') === true, 'no General Average row at all in Key Stage 1 (§14c)');

console.log('gradeText (§3)');
assert(gradeText(88.05, 'numerical').text === '88.05' && gradeText('87.5', 'numerical').text === '87.50', 'two decimals by default, strings coerce');
assert(gradeText('87.00', 'numerical', true).text === '87' && gradeText(89.5, 'numerical', true).text === '89.5', 'whole: String(Number(x)) — 87.00 → 87, 89.5 stays 89.5');
assert(gradeText(null, 'numerical').reason.short === 'Pending' && gradeText(null, 'numerical').text === null, 'null in numerical mode is Pending');
assert(gradeText(null, 'descriptive').reason.short === 'N/A', 'null in descriptive mode is N/A');
assert(gradeText('A', 'numerical').reason.short === 'Pending', 'a LETTER through the number path is a null (why TermValue exists, §14a)');
assert(gradeText(0, 'numerical').text === '0.00', 'a real 0 is "0.00", not a null state');

console.log('reading note / score pairs');
assert(readingNoteLines('numerical', { hasTermGrade: false }).length === 4 && readingNoteLines('numerical', { hasTermGrade: true }).length === 5, 'the transmutation sentence appears only once a term grade exists');
assert(readingNoteLines('descriptive', { canOpen: true }).at(-1).startsWith('Tap any grade'), 'the tap sentence is the last line when a cell can open');
assert(formatScorePair(18, 20) === '18/20' && formatScorePair(null, 20) === SCORE_PENDING && formatScorePair(18, null) === null, 'score pairs: full, pending, no denominator');

console.log(`\nproof-report-card: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
