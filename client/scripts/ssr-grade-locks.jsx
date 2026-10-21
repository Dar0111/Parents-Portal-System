// PROOF — bulk grade locks on the web (fix/grade-locks, 2026-10-13; the
// owner's Finding 1). Run from client/:
//   npx vite build --ssr scripts/ssr-grade-locks.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-grade-locks.js
//
// What it proves, each check with a NEGATIVE CONTROL that must fail:
//   - the shared words (format/gradeLocks.js) EXACTLY as the plan approved
//     them: scope labels, the preview's lines in every state, the skipped
//     row, the apply button, the result line, the request body;
//   - the unwrap list names only keys the server's handler sends;
//   - the preview RENDERED from the server's response shape, with a skipped
//     row that carries an LRN-shaped field: no LRN reaches the markup;
//   - the dialog RENDERED as it opens: the four controls, Preview, and no
//     apply button before a preview;
//   - Admin → Grades' wiring, read as SOURCE: the header button, the result
//     line under it, the dialog mounted with the page's sections — and the
//     three texts other proofs read (:247, :539, :570) still verbatim.
// Cannot prove a real preview, a real lock or the dialog's focus — the
// owner's device check.

import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOCK_TERM_LABEL,
  LOCKS_UNWRAP,
  applyLabel,
  introFor,
  locksBody,
  previewLines,
  resultLine,
  scopeHeading,
  scopeLabel,
  skippedRow,
} from '../src/format/gradeLocks.js';
import GradeLocksModal, { GradeLocksPreview } from '../src/pages/admin/GradeLocksModal.jsx';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
// A check that holds on the real input and FAILS on every control.
function proved(label, check, good, ...controls) {
  const ok = check(good);
  const bad = controls.filter((c) => check(c));
  assert(ok && bad.length === 0, label, ok ? `${bad.length} control(s) also passed` : 'fails on the real input');
}

const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8').replace(/\r\n/g, '\n');

// The server's response shape (routes/grades.js, POST /api/grades/locks).
const scope = { school_year: '2026-2027', term: 2, grade_level: 6, section: 'Malikhain' };
const marwin = { student_id: 1, name: 'Conde, Marwin', grade_level: 6, section: 'Malikhain', pending: 8, subjects: 8 };
const lockPreview = {
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
const texts = (result) => previewLines(result).map((l) => l.text);

console.log('\n--- the words, exactly ---');
assert(scopeLabel(scope) === 'Grade 6 - Malikhain', 'scope: a section');
assert(scopeLabel({ ...scope, section: null }) === 'Grade 6', 'scope: a grade');
assert(scopeLabel({ ...scope, grade_level: null, section: null }) === 'the whole school', 'scope: the whole school');
assert(scopeHeading(scope) === 'Grade 6 - Malikhain · Term 2 · SY 2026-2027', 'heading: a section');
assert(
  scopeHeading({ ...scope, grade_level: null, section: null }) === 'Whole school · Term 2 · SY 2026-2027',
  'heading: the whole school'
);
assert(
  introFor(true) ===
    'Locks every grade for each learner who has a grade in every subject this term. A learner with any subject still Pending is skipped and listed — nothing of theirs is locked.' &&
    introFor(false) === 'Unlocks every locked grade for this term and scope, complete or not.',
  'the intro says what each action does'
);
assert(
  JSON.stringify(texts(lockPreview)) ===
    JSON.stringify([
      'Ready: 1 of 2 learners — every subject graded.',
      'To lock: 8 grade records.',
      'Skipped: 1 learner — still Pending in at least one subject:',
    ]),
  'lock preview: ready, to lock, skipped — in that order',
  JSON.stringify(texts(lockPreview))
);
assert(
  JSON.stringify(texts({ ...lockPreview, records_changed: 0, records_already: 8, learners_changed: 0 })) ===
    JSON.stringify([
      'Ready: 1 of 2 learners — every subject graded.',
      'Already locked: 8 grade records.',
      "Nothing to lock — every ready learner's Term 2 grades are already locked.",
      'Skipped: 1 learner — still Pending in at least one subject:',
    ]),
  'lock preview, all already locked: the already line and its nothing-to-lock line'
);
assert(
  texts({ ...lockPreview, learners_ready: 0, records_changed: 0, learners_changed: 0 }).includes(
    'Nothing to lock — no learner here has every subject graded for Term 2 yet.'
  ),
  'lock preview, nobody ready: its own nothing-to-lock line'
);
assert(
  JSON.stringify(texts({ ...lockPreview, scope: { ...scope, grade_level: 4, section: 'Mabini' }, learners: 0 })) ===
    JSON.stringify(['There are no active learners in Grade 4 - Mabini.']),
  'no active learners: one line, nothing else'
);
assert(
  texts({ ...lockPreview, learners: 1, records_changed: 1 })[0] === 'Ready: 1 of 1 learner — every subject graded.' &&
    texts({ ...lockPreview, learners: 1, records_changed: 1 })[1] === 'To lock: 1 grade record.',
  'singulars: "1 learner", "1 grade record"'
);
const unlockPreview = { ...lockPreview, lock: false, learners_ready: null, records_already: 0, skipped: [] };
assert(
  JSON.stringify(texts(unlockPreview)) === JSON.stringify(['To unlock: 8 grade records for 1 learner.']),
  'unlock preview: one line'
);
assert(
  JSON.stringify(texts({ ...unlockPreview, records_changed: 0, learners_changed: 0 })) ===
    JSON.stringify(['Nothing to unlock — no Term 2 grade is locked in Grade 6 - Malikhain.']),
  'unlock preview, nothing locked'
);
// feat/grade-acknowledgement: an unlock that clears parent confirmations says
// so after the count; a lock never does (the server sends 0 for a lock).
assert(
  JSON.stringify(texts({ ...unlockPreview, acknowledgements_cleared: 2 })) ===
    JSON.stringify(['To unlock: 8 grade records for 1 learner.', 'Confirmations to clear: 2.']) &&
    JSON.stringify(texts({ ...unlockPreview, acknowledgements_cleared: 0 })) ===
      JSON.stringify(['To unlock: 8 grade records for 1 learner.']) &&
    !texts({ ...lockPreview, acknowledgements_cleared: 2 }).some((t) => t.startsWith('Confirmations')),
  'unlock preview with confirmations: the clear line after the count, none at 0, never on a lock'
);
assert(skippedRow(marwin) === 'Conde, Marwin · Grade 6 - Malikhain · 8 of 8 subjects still Pending', 'the skipped row');
assert(
  applyLabel(true, 8) === 'Lock 8 grade records' && applyLabel(true, 1) === 'Lock 1 grade record' && applyLabel(false, 8) === 'Unlock 8 grade records',
  'the apply button names the count'
);
const applied = { ...lockPreview, dry_run: false };
assert(
  resultLine(applied) === 'Locked 8 grade records for 1 learner — Grade 6 - Malikhain, Term 2. 1 learner skipped.' &&
    resultLine({ ...applied, skipped: [] }) === 'Locked 8 grade records for 1 learner — Grade 6 - Malikhain, Term 2.' &&
    resultLine({ ...unlockPreview, dry_run: false }) === 'Unlocked 8 grade records for 1 learner — Grade 6 - Malikhain, Term 2.' &&
    resultLine({ ...applied, records_changed: 0 }) === 'No grade record changed — the grades changed since the preview. Preview again.',
  'the result line: lock (with and without skipped), unlock, and nothing changed'
);
assert(LOCK_TERM_LABEL === 'Lock or unlock a term', 'the entry button and title');

console.log('\n--- the request body ---');
proved(
  'whole school sends no grade and no section',
  (b) => JSON.stringify(b) === JSON.stringify({ lock: true, term: 2, dry_run: true }),
  locksBody({ action: 'lock', term: '2', grade: '', section: 'Malikhain' }, true),
  locksBody({ action: 'lock', term: '2', grade: '6', section: '' }, true),
  locksBody({ action: 'unlock', term: '2', grade: '', section: '' }, true)
);
proved(
  'a section is sent with its grade, both as the server reads them',
  (b) => b.grade_level === 6 && b.section === 'Malikhain' && b.term === 2 && b.lock === false && b.dry_run === false,
  locksBody({ action: 'unlock', term: '2', grade: '6', section: 'Malikhain' }, false),
  locksBody({ action: 'lock', term: '2', grade: '6', section: 'Malikhain' }, false),
  locksBody({ action: 'unlock', term: '2', grade: '6', section: '' }, false)
);

console.log('\n--- the unwrap list and the server agree ---');
const server = read('../server/routes/grades.js');
const handler = server.slice(server.indexOf("router.post('/locks'"), server.indexOf('// GET /api/grades/:id'));
const sent = handler.slice(handler.lastIndexOf('return res.json({'));
const sends = (text) => (key) => new RegExp(`\\b${key}\\b[,:]`).test(text);
proved(
  'every key the screens unwrap is one the handler sends',
  (text) => LOCKS_UNWRAP.every(sends(text)),
  sent,
  sent.replace('records_already', 'records_kept'),
  sent.replace('learners_ready', 'learners_complete')
);

console.log('\n--- the preview, rendered ---');
const LRN = '123456789012';
const withLrn = { ...lockPreview, skipped: [{ ...marwin, lrn: LRN }] };
const previewMarkup = renderToStaticMarkup(<GradeLocksPreview result={withLrn} />);
assert(
  previewMarkup.includes('Grade 6 - Malikhain · Term 2 · SY 2026-2027') &&
    previewMarkup.includes('To lock: 8 grade records.') &&
    previewMarkup.includes('Conde, Marwin · Grade 6 - Malikhain · 8 of 8 subjects still Pending'),
  'the preview shows its heading, lines and the skipped row'
);
const hasLrn = (markup) => /\d{12}/.test(markup);
proved(
  'no LRN reaches the markup, even when the row carries one',
  (markup) => !hasLrn(markup),
  previewMarkup,
  renderToStaticMarkup(<p>{withLrn.skipped[0].lrn}</p>)
);
const unlockMarkup = renderToStaticMarkup(<GradeLocksPreview result={{ ...unlockPreview, skipped: [marwin] }} />);
assert(!unlockMarkup.includes('Conde, Marwin'), 'an unlock preview lists nobody');

console.log('\n--- the dialog as it opens ---');
const sections = [
  { id: 1, grade_level: 6, name: 'Malikhain' },
  { id: 2, grade_level: 5, name: 'Masigasig' },
];
const modal = renderToStaticMarkup(<GradeLocksModal open onClose={() => {}} sections={sections} onApplied={() => {}} />);
assert(modal.includes('Lock or unlock a term'), 'the dialog is titled "Lock or unlock a term"');
assert(
  ['Action', 'Lock grades', 'Unlock grades', 'Term 1', 'Term 2', 'Term 3', 'Grade', 'Whole school', 'Grade 6', 'Section', 'Pick a grade first'].every((t) =>
    modal.includes(t)
  ),
  'the four controls with their choices; the section waits for a grade'
);
assert(modal.includes(introFor(true).slice(0, 60)), 'it opens on Lock, with the lock intro');
proved(
  'Preview is there and no apply button until a preview says there is something to do',
  (m) => m.includes('>Preview<') && !/(Lock|Unlock) \d+ grade record/.test(m),
  modal,
  modal.replace('>Preview<', '>Look<'),
  `${modal}<button>Lock 8 grade records</button>`
);
const closed = renderToStaticMarkup(<GradeLocksModal open={false} onClose={() => {}} sections={sections} />);
assert(closed === '', 'closed, it renders nothing');

console.log('\n--- the dialog, as source ---');
const modalSrc = read('src/pages/admin/GradeLocksModal.jsx');
// choose()'s own body only — up to its closing brace, never a later function's.
const chooseBody = (s) => {
  const at = s.indexOf('function choose(patch) {');
  return at < 0 ? '' : s.slice(at, s.indexOf('\n  }', at));
};
proved(
  'changing a control clears the preview, so the button never acts on another scope',
  (s) => chooseBody(s).includes('setPreview(null);'),
  modalSrc,
  modalSrc.replace(/(function choose\(patch\) \{[\s\S]*?)setPreview\(null\);/, '$1')
);
proved(
  'the apply button shows only with a preview that changes something, and names the count',
  (s) =>
    s.includes('const canApply = Boolean(preview) && preview.records_changed > 0;') &&
    s.includes('{canApply ? (') &&
    s.includes('{applyLabel(lock, preview.records_changed)}'),
  modalSrc,
  modalSrc.replace('preview.records_changed > 0;', 'preview.records_changed >= 0;'),
  modalSrc.replace('{canApply ? (', '{true ? (')
);
proved(
  'the controls are locked while a request is out',
  (s) => (s.match(/disabled=\{Boolean\(busy\)/g) || []).length === 4,
  modalSrc,
  modalSrc.replace('disabled={Boolean(busy)}', 'disabled={false}')
);

console.log('\n--- Admin → Grades, as source ---');
const page = read('src/pages/admin/GradesPage.jsx');
proved(
  'the header carries the button, the result line sits under it, and the dialog gets the page\'s sections',
  (s) =>
    s.includes("import GradeLocksModal from './GradeLocksModal';") &&
    /<SectionHeader\s+title="Report card"\s+actions=\{[\s\S]*?\{LOCK_TERM_LABEL\}[\s\S]*?\/>\s*\{\/\*[\s\S]*?\*\/\}\s*<FormStatus status=\{status\.bulk\} \/>/.test(s) &&
    /<GradeLocksModal\s+open=\{locksOpen\}[\s\S]*?sections=\{sections\}[\s\S]*?onApplied=/.test(s),
  page,
  page.replace('<FormStatus status={status.bulk} />', ''),
  page.replace('sections={sections}', 'sections={[]}'),
  page.replace('{LOCK_TERM_LABEL}', 'Lock')
);
proved(
  'the three texts other proofs read are still verbatim (:247, :539, :570)',
  (s) =>
    s.includes('if (!reportIsPick || !selectedEntry?.grade_id) return;') &&
    s.includes("{reportIsPick && report && subjects.length && mode !== 'descriptive' ? (") &&
    s.includes('{reportIsPick && selectedEntry?.grade_id ? ('),
  page,
  page.replace('if (!reportIsPick || !selectedEntry?.grade_id) return;', 'if (!selectedEntry?.grade_id) return;')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
