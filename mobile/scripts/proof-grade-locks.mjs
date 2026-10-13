// PROOF — bulk grade locks on the phone (fix/grade-locks, 2026-10-13; the
// owner's Finding 1). Run from mobile/:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-grade-locks.mjs
//
// What it proves, each source check with a NEGATIVE CONTROL that must fail:
//   - the mirrored words (src/format/gradeLocks.js) DRIVEN: the same exact
//     strings the web proof holds — and the file byte-equal to the web's;
//   - GradeLocksScreen as SOURCE: it posts /grades/locks with the shared
//     unwrap list, previews before it writes, drops a stale preview by
//     ticket, shows the apply button only when there is something to do,
//     returns with popTo (never navigate) carrying the result line, and never
//     names an LRN;
//   - Admin → Grades' header button and the route in AppShell, and the
//     report card's "whose card is on screen" lines still verbatim.
// Cannot prove a real preview, a real lock, the 48dp targets or a tap — the
// owner's check on the emulator.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCK_TERM_LABEL,
  applyLabel,
  locksBody,
  previewLines,
  resultLine,
  scopeHeading,
  skippedRow,
} from '../src/format/gradeLocks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(here, '..');
const read = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}`);
}
function proved(label, holds, real, ...controls) {
  assert(Boolean(holds(real)) && controls.every((c) => !holds(c)), label);
}

console.log('\n--- the mirrored words, driven ---');
const scope = { school_year: '2026-2027', term: 2, grade_level: 6, section: 'Malikhain' };
const marwin = { student_id: 1, name: 'Conde, Marwin', grade_level: 6, section: 'Malikhain', pending: 8, subjects: 8 };
const preview = {
  dry_run: true,
  lock: true,
  scope,
  learners: 2,
  learners_ready: 1,
  learners_changed: 1,
  records_changed: 8,
  records_already: 0,
  skipped: [marwin],
};
assert(LOCK_TERM_LABEL === 'Lock or unlock a term', 'the entry button and title');
assert(scopeHeading(scope) === 'Grade 6 - Malikhain · Term 2 · SY 2026-2027', 'the preview heading');
assert(
  JSON.stringify(previewLines(preview).map((l) => l.text)) ===
    JSON.stringify([
      'Ready: 1 of 2 learners — every subject graded.',
      'To lock: 8 grade records.',
      'Skipped: 1 learner — still Pending in at least one subject:',
    ]),
  'the lock preview lines'
);
assert(skippedRow(marwin) === 'Conde, Marwin · Grade 6 - Malikhain · 8 of 8 subjects still Pending', 'the skipped row');
assert(applyLabel(true, 8) === 'Lock 8 grade records' && applyLabel(false, 1) === 'Unlock 1 grade record', 'the apply button');
assert(
  resultLine({ ...preview, dry_run: false }) === 'Locked 8 grade records for 1 learner — Grade 6 - Malikhain, Term 2. 1 learner skipped.',
  'the result line'
);
assert(
  JSON.stringify(locksBody({ action: 'lock', term: '2', grade: '', section: '' }, true)) ===
    JSON.stringify({ lock: true, term: 2, dry_run: true }),
  'the whole school sends no grade and no section'
);
proved(
  'the phone copy is the web copy, byte for byte',
  (text) => text === fs.readFileSync(path.join(MOBILE, '..', 'client', 'src', 'format', 'gradeLocks.js'), 'utf8'),
  fs.readFileSync(path.join(MOBILE, 'src', 'format', 'gradeLocks.js'), 'utf8'),
  `${fs.readFileSync(path.join(MOBILE, 'src', 'format', 'gradeLocks.js'), 'utf8')}\n`
);

console.log('\n--- GradeLocksScreen, as source ---');
const screen = read('src/screens/admin/GradeLocksScreen.jsx');
proved(
  'it posts /grades/locks with the shared unwrap list, a dry run first',
  (s) =>
    s.includes("api.post('/grades/locks', locksBody(choices, true), { unwrap: LOCKS_UNWRAP })") &&
    s.includes("api.post('/grades/locks', locksBody(choices, false), { unwrap: LOCKS_UNWRAP })"),
  screen,
  screen.replace('locksBody(choices, true)', 'locksBody(choices, false)')
);
const chooseBody = (s) => {
  const at = s.indexOf('function choose(patch) {');
  return at < 0 ? '' : s.slice(at, s.indexOf('\n  }', at));
};
proved(
  'a changed choice takes a ticket and clears the preview; none changes during the write',
  (s) =>
    chooseBody(s).includes("if (busy === 'apply') return;") &&
    chooseBody(s).includes('tickets.take();') &&
    chooseBody(s).includes('setPreview(null);'),
  screen,
  screen.replace(/(function choose\(patch\) \{[\s\S]*?)tickets\.take\(\);/, '$1'),
  screen.replace(/(function choose\(patch\) \{[\s\S]*?)setPreview\(null\);/, '$1')
);
proved(
  'a preview reply applies only while it is the newest',
  (s) => (s.match(/if \(!tickets\.isLatest\(ticket\)\) return;/g) || []).length === 2,
  screen,
  screen.replace('if (!tickets.isLatest(ticket)) return;', '')
);
proved(
  'the apply button only with something to do, naming the count',
  (s) =>
    s.includes('const canApply = Boolean(preview) && preview.records_changed > 0;') &&
    s.includes('{canApply ? (') &&
    s.includes('{applyLabel(lock, preview.records_changed)}'),
  screen,
  screen.replace('{canApply ? (', '{true ? (')
);
proved(
  'it returns with popTo and the result line — never navigate to Main',
  (s) =>
    s.includes("navigation.popTo('Main', { screen: '/admin/grades', params: { notice: resultLine(result) } });") &&
    !s.includes("navigation.navigate('Main'"),
  screen,
  screen.replace("navigation.popTo('Main'", "navigation.navigate('Main'")
);
proved(
  'no LRN is ever read or shown',
  (s) => !/\blrn\b/i.test(s.replace(/^\s*\/\/.*$/gm, '').replace(/LRN/g, '')) && s.includes('{skippedRow(row)}'),
  screen,
  screen.replace('{skippedRow(row)}', '{row.lrn}')
);

console.log('\n--- Admin → Grades and the route ---');
const grades = read('src/screens/admin/GradesScreen.jsx');
proved(
  "the header's button opens the screen",
  (s) =>
    /<SectionHeader\s+title="Report card"\s+actions=\{[\s\S]*?navigation\.navigate\('GradeLocks'\)[\s\S]*?\{LOCK_TERM_LABEL\}[\s\S]*?\/>/.test(s),
  grades,
  grades.replace("navigation.navigate('GradeLocks')", "navigation.navigate('GradeLock')")
);
proved(
  "the report card's \"whose card is on screen\" lines are still verbatim",
  (s) =>
    s.includes('const reportIsPick = Boolean(report && studentId && Number(report.student?.id) === Number(studentId));') &&
    s.includes('const reportWaiting = Boolean(studentId) && !reportError && !reportIsPick;'),
  grades,
  grades.replace('&& !reportIsPick;', ';')
);
const shell = read('src/navigation/AppShell.jsx');
proved(
  'AppShell routes GradeLocks to the screen, as a modal titled for it',
  (s) =>
    s.includes("import AdminGradeLocksScreen from '../screens/admin/GradeLocksScreen';") &&
    s.includes(
      "<Stack.Screen name=\"GradeLocks\" component={AdminGradeLocksScreen} options={{ presentation: 'modal', title: 'Lock or unlock a term' }} />"
    ),
  shell,
  shell.replace('name="GradeLocks"', 'name="GradeLock2"')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
