// PROOF — grade acknowledgements on the phone (feat/grade-acknowledgement,
// 2026-10-21; the owner's Q1–Q12). Run from mobile/:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-grade-acknowledgement.mjs
//
// What it proves, each source check with a NEGATIVE CONTROL that must fail:
//   - the mirrored words (src/format/acknowledgement.js) DRIVEN: the same
//     exact strings the web proof holds — and the file byte-equal to the
//     web's, as is the mirrored format/gradeLocks.js with its new key;
//   - ReportCardView as SOURCE: `acknowledgements` in REPORT_UNWRAP, the
//     TermConfirmations block between the learner's facts and the term
//     picker, a button only with a handler, the failure under it;
//   - the parent's GradesScreen as SOURCE: the §5e step is a system Alert
//     from `confirmDialog`, the ONE write runs only in its confirm, the card
//     re-read after it, the three props handed down;
//   - the adviser's screens as SOURCE: the learner screen passes no handler;
//     the class summary's Confirmed column keyed on the term sheet, its
//     count line and three cells;
//   - admin Grades as SOURCE: the confirmed lines under the header card and
//     `acknowledgement` handed to the lock sheet, which shows the unlock
//     sentence from `route.params`;
//   - no LRN read or shown by any of them.
// Cannot prove the Alert, a real confirm, the 48dp target or a tap — the
// owner's check on the phone.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIRM_BUTTON,
  CONFIRMED_HEADER,
  TERM_FINAL_BODY,
  adminConfirmedLine,
  confirmDialog,
  confirmedCell,
  confirmedCountLine,
  confirmedLine,
  confirmedReaderLine,
  lockedTerms,
  termFinalTitle,
  unlockClearsSentence,
} from '../src/format/acknowledgement.js';
import { LOCKS_UNWRAP, previewLines } from '../src/format/gradeLocks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(here, '..');
const read = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');
const raw = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8');

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
const noLrn = (s) => !/\blrn\b/i.test(s.replace(/^\s*\/\/.*$/gm, '').replace(/LRN/g, ''));

console.log('\n--- the mirrored words, driven ---');
assert(termFinalTitle(1) === 'Term 1 grades are final.', 'the title');
assert(TERM_FINAL_BODY === 'The school has locked them. Please confirm that you have seen them.', 'the body');
assert(CONFIRM_BUTTON === 'I have seen these grades', 'the button');
assert(
  JSON.stringify(confirmDialog(2)) ===
    JSON.stringify({
      title: 'Confirm Term 2 grades?',
      body: "This tells the adviser and the school that you have seen your child's Term 2 grades. It cannot be undone.",
      cancel: 'Go back',
      confirm: 'Yes, I have seen them',
    }),
  'the §5e dialog'
);
assert(confirmedLine(1, '21 October 2026') === 'You confirmed Term 1 on 21 October 2026.', 'the line after');
assert(confirmedReaderLine(null) === 'The parent has not confirmed yet.' && confirmedReaderLine('21 October 2026') === 'Confirmed by the parent on 21 October 2026.', "the reader's lines");
assert(CONFIRMED_HEADER === 'Confirmed' && confirmedCountLine(3, 25) === '3 of 25 learners', 'the column');
assert(
  confirmedCell({ term_locked: true, acknowledged: { acknowledged_at: 'x' } }, '21 Oct 2026').text === '21 Oct 2026' &&
    confirmedCell({ term_locked: true }, null).text === 'Not yet' &&
    confirmedCell({ term_locked: false }, null).kind === 'none',
  'the three cells'
);
assert(adminConfirmedLine(3, '21 October 2026') === 'Term 3 · Confirmed 21 October 2026', "the admin's line");
assert(
  unlockClearsSentence('21 October 2026') ===
    'The parent confirmed these grades on 21 October 2026. Unlocking clears that confirmation, and the parent is asked again after a relock.',
  'the unlock sentence'
);
assert(JSON.stringify(lockedTerms({ 1: { locked: true }, 3: { locked: true } })) === '[1,3]', 'lockedTerms');
assert(
  LOCKS_UNWRAP.includes('acknowledgements_cleared') &&
    previewLines({ lock: false, scope: { term: 2 }, learners: 2, learners_changed: 1, records_changed: 8, acknowledgements_cleared: 2 })
      .map((l) => l.text)
      .join('|') === 'To unlock: 8 grade records for 1 learner.|Confirmations to clear: 2.',
  "the mirrored gradeLocks.js: the new key and the unlock preview's clear line"
);
for (const file of ['acknowledgement.js', 'gradeLocks.js']) {
  proved(
    `src/format/${file} is byte-equal to the web's`,
    (text) => text === fs.readFileSync(path.join(MOBILE, '..', 'client', 'src', 'format', file), 'utf8'),
    raw(path.join('src', 'format', file)),
    `${raw(path.join('src', 'format', file))}\n`
  );
}

console.log('\n--- ReportCardView, as source ---');
const view = read('src/screens/parent/ReportCardView.jsx');
proved(
  "REPORT_UNWRAP names 'acknowledgements'",
  (s) => /export const REPORT_UNWRAP = \[[\s\S]*?'acknowledgements',[\s\S]*?\];/.test(s),
  view,
  view.replace("'acknowledgements',", '')
);
proved(
  'the block renders between the facts and the term picker, from the shared words, with a button only under a handler',
  (s) => {
    const facts = s.indexOf('Not yet assigned');
    const block = s.indexOf('<TermConfirmations\n');
    const picker = s.indexOf('<Segmented options={SEGMENTS}');
    return (
      facts > -1 &&
      block > facts &&
      picker > block &&
      s.includes("from '../../format/acknowledgement'") &&
      /\} else if \(onConfirmTerm\) \{[\s\S]*?<Button[\s\S]*?onPress=\{\(\) => onConfirmTerm\(term\)\}[\s\S]*?\{CONFIRM_BUTTON\}/.test(s) &&
      /\} else \{\s*body = <Text className="mt-1 text-sm text-fg-muted">\{confirmedReaderLine\(null\)\}<\/Text>;/.test(s)
    );
  },
  view,
  view.replace('onPress={() => onConfirmTerm(term)}', "onPress={() => api.post('/grades/acknowledgements', { term })}"),
  view.replace('<TermConfirmations\n', '<TermConfirmationsX\n')
);
proved(
  'the failure shows under the button (§7c), only when no write is out',
  (s) => /confirmError && confirmingTerm == null \? \([\s\S]*?<ErrorAlert message=\{confirmError\} \/>/.test(s),
  view,
  view.replace('confirmError && confirmingTerm == null', 'false')
);
assert(noLrn(view), 'no LRN in ReportCardView');

console.log("\n--- the parent's Grades screen, as source ---");
const parent = read('src/screens/parent/GradesScreen.jsx');
const askBody = (s) => {
  const at = s.indexOf('function askConfirm(term) {');
  return at < 0 ? '' : s.slice(at, s.indexOf('\n  }\n', at));
};
const confirmBody = (s) => {
  const at = s.indexOf('async function confirmTerm(term) {');
  return at < 0 ? '' : s.slice(at, s.indexOf('\n  }\n', at));
};
proved(
  'the §5e step is a system Alert from confirmDialog, and it writes nothing itself',
  (s) =>
    s.includes("import { confirmDialog } from '../../format/acknowledgement';") &&
    /Alert\.alert\(words\.title, words\.body, \[\s*\{ text: words\.cancel, style: 'cancel' \},\s*\{ text: words\.confirm, onPress: \(\) => confirmTerm\(term\) \},\s*\]\)/.test(askBody(s)) &&
    !askBody(s).includes('api.post('),
  parent,
  parent.replace('{ text: words.confirm, onPress: () => confirmTerm(term) }', '{ text: words.confirm, onPress: () => confirmTermNow(term) }'),
  parent.replace("{ text: words.cancel, style: 'cancel' },\n      ", '')
);
proved(
  "the ONE write is POST /grades/acknowledgements inside confirmTerm, unwrap 'acknowledgement', then the card re-read",
  (s) =>
    (s.match(/api\.post\('\/grades\/acknowledgements'/g) || []).length === 1 &&
    confirmBody(s).includes("await api.post('/grades/acknowledgements', { term }, { unwrap: 'acknowledgement' });") &&
    /await load\(\{ pull: true \}\);/.test(confirmBody(s)) &&
    /setConfirmError\(extractError\(err\)\)/.test(confirmBody(s)),
  parent,
  parent.replace("{ unwrap: 'acknowledgement' }", '{ raw: true }'),
  parent.replace('await load({ pull: true });', '')
);
proved(
  'the three props reach the card',
  (s) => /<ReportCardView[\s\S]*?onConfirmTerm=\{askConfirm\}[\s\S]*?confirmingTerm=\{confirmingTerm\}[\s\S]*?confirmError=\{confirmError\}/.test(s),
  parent,
  parent.replace('onConfirmTerm={askConfirm}', '')
);
assert(noLrn(parent), "no LRN in the parent's Grades screen");

console.log("\n--- the adviser's screens, as source ---");
const learnerScreen = read('src/screens/teacher/ClassSummaryLearnerScreen.jsx');
proved('the learner screen passes no handler — read-only', (s) => !/onConfirmTerm/.test(s) && s.includes('REPORT_UNWRAP'), learnerScreen, `${learnerScreen}onConfirmTerm`);
const summary = read('src/screens/teacher/ClassSummaryScreen.jsx');
proved(
  'the Confirmed column: on the term sheet only, the count line, the three cells from the shared words',
  (s) =>
    s.includes('const showConfirmed = !isFinal;') &&
    s.includes('{confirmedCountLine(confirmed, learners.length)}') &&
    s.includes('{CONFIRMED_HEADER}') &&
    /const cell = confirmedCell\(learner, when\);/.test(s) &&
    /accessibilityLabel=\{cell\.kind === 'none' \? NOT_LOCKED_LABEL : undefined\}/.test(s),
  summary,
  summary.replace('const showConfirmed = !isFinal;', 'const showConfirmed = true;'),
  summary.replace("accessibilityLabel={cell.kind === 'none' ? NOT_LOCKED_LABEL : undefined}", '')
);
assert(noLrn(summary), 'no LRN in the class summary');

console.log('\n--- admin Grades and the lock sheet, as source ---');
const grades = read('src/screens/admin/GradesScreen.jsx');
proved(
  "the confirmed terms' lines under the header card, and `acknowledgement` handed to the lock sheet",
  (s) =>
    s.includes("import { adminConfirmedLine, lockedTerms } from '../../format/acknowledgement';") &&
    /confirmedLines\.map\(\(line\) => \(/.test(s) &&
    /navigation\.navigate\('GradeLock', \{[\s\S]*?acknowledgement: report\?\.acknowledgements\?\.\[term\] \?\? null,/.test(s),
  grades,
  grades.replace('acknowledgement: report?.acknowledgements?.[term] ?? null,', ''),
  grades.replace('confirmedLines.map((line) => (', 'confirmedLines.slice(0, 0).map((line) => (')
);
const lockSheet = read('src/screens/admin/GradeLockScreen.jsx');
proved(
  'the lock sheet reads `acknowledgement` from route.params and shows the unlock sentence only while a confirmation exists',
  (s) =>
    s.includes('const { subjectName, term, mode, entry, acknowledgement = null } = route.params;') &&
    /\{acknowledgement\?\.acknowledged_at \? \(\s*<Text className="text-sm text-fg-body">\{unlockClearsSentence\(timestampDay\(acknowledgement\.acknowledged_at, \{ style: 'long' \}\)\)\}<\/Text>/.test(s),
  lockSheet,
  lockSheet.replace('acknowledgement?.acknowledged_at ? (', 'true ? ('),
  lockSheet.replace("unlockClearsSentence(timestampDay(acknowledgement.acknowledged_at, { style: 'long' }))", "'Unlocking clears the confirmation.'")
);
assert(noLrn(grades) && noLrn(lockSheet), 'no LRN in admin Grades or the lock sheet');

console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
