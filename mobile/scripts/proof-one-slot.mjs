// PROOF — the one-slot request (Stage 5 branch 3, MOBILE_CONVENTIONS M13).
// Drives the VERBATIM `classRecord/buildPayload.js` with the drafts the slot
// screen can produce — one column's HPS and name, its scores, a Summative
// part — and asserts the exact PUT body. The shape is the web's by
// construction; this proves the phone's one-slot drafts produce it. What it
// cannot: the server's answer — that is the phone check and test:class-record.
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-one-slot.mjs
import { buildClassRecordPayload, buildSlotFrame, parseCell, slotKey } from '../src/screens/teacher/classRecord/buildPayload.js';

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

const key = { subject_id: 7, grade_level: 6, section: 'Malikhain', term: 2, school_year: '2026-2027' };
const TALA = 1037;
const MARWIN = 1;
// An empty class: no slots, two learners with no scores (the check's state).
const empty = {
  slots: [],
  exam_max: { st1: null, st2: null, te: null },
  learners: [
    { student_id: MARWIN, is_locked: false, scores: {} },
    { student_id: TALA, is_locked: false, scores: {} },
  ],
};
const build = (server, drafts) => buildClassRecordPayload({ server, draft: {}, slotDraft: {}, examMaxDraft: {}, key, ...drafts });

console.log('the frame');
assert(buildSlotFrame([]).length === 8 && slotKey('WW', 1) === 'WW-1', 'eight phantom columns (WW1–5, PT1–3) on an empty class');

console.log('HPS only — the dry run the Set HPS field sends');
const hpsOnly = build(empty, { slotDraft: { 'WW-1': { max_score: '20' } } });
assert(hpsOnly && hpsOnly.slots.length === 1 && hpsOnly.slots[0].type === 'WW' && hpsOnly.slots[0].slot_no === 1 && hpsOnly.slots[0].max_score === 20, 'one slot, addressed by type + number, max 20');
assert(hpsOnly.entries.length === 0 && !('exam_max' in hpsOnly) && hpsOnly.term === 2 && hpsOnly.section === 'Malikhain', 'no entries, no exam_max; the class key rides along');

console.log('a score into a column created in the same save');
const newCol = build(empty, { slotDraft: { 'WW-1': { max_score: '20' } }, draft: { [`${TALA}:WW-1`]: '22' } });
assert(newCol.entries.length === 1 && newCol.entries[0].student_id === TALA, 'only the learner typed into gets an entry — Marwin gets none (correction a)');
assert(JSON.stringify(newCol.entries[0].scores) === JSON.stringify([{ type: 'WW', slot_no: 1, score: 22 }]), 'a phantom column is addressed by type + slot_no; 22 over 20 is sent as typed (a bonus, never clamped)');

console.log('an existing column');
const withSlot = { ...empty, slots: [{ id: 91, type: 'WW', slot_no: 1, name: null, display_label: 'Written Work 1', max_score: 20, in_use: true }], learners: [{ student_id: MARWIN, is_locked: false, scores: {} }, { student_id: TALA, is_locked: false, scores: { 91: 18 } }] };
assert(JSON.stringify(build(withSlot, { draft: { [`${TALA}:WW-1`]: '19' } }).entries[0].scores) === JSON.stringify([{ slot_id: 91, score: 19 }]), 'a real column is addressed by slot_id');
assert(build(withSlot, { draft: { [`${TALA}:WW-1`]: '18' } }) === null, 'typed back to the stored score → nothing to save (null)');
assert(build(withSlot, { draft: { [`${TALA}:WW-1`]: '' } }).entries[0].scores[0].score === null, 'a cleared cell is an explicit null');
assert(build(withSlot, { slotDraft: { 'WW-1': { name: 'Quiz 1' } } }).slots[0].name === 'Quiz 1', 'a rename alone is a slot change');

console.log('refused before a request is spent');
assert(parseCell('2.5').error === 'Whole numbers only' && parseCell('-1').error && parseCell('x').error, 'decimals, negatives and text are marked');
assert(build(empty, { slotDraft: { 'WW-1': { max_score: '20' } }, draft: { [`${TALA}:WW-1`]: '2.5' } }).entries.length === 0, 'an invalid keystroke is never sent');
const locked = { ...withSlot, learners: [{ student_id: TALA, is_locked: true, scores: { 91: 18 } }] };
assert(build(locked, { draft: { [`${TALA}:WW-1`]: '19' } }) === null, 'a locked learner is skipped');

console.log('a Summative part');
const exam = build(empty, { examMaxDraft: { st1: '30' }, draft: { [`${TALA}:st1_score`]: '25' } });
assert(exam.entries[0].st1_score === 25 && exam.exam_max.st1 === 30 && Object.keys(exam.exam_max).length === 1, 'the part\'s score and its class-wide maximum travel together');

console.log(`\nproof-one-slot: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
