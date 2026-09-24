// The card contract, proved by RENDERING it.
//
// RUN FROM `client/`, AND `NODE_ENV=development` IS PART OF THE COMMAND:
//
//   NODE_ENV=development npx vite build --ssr scripts/ssr-cards.jsx \
//     --outDir .ssr-tmp && node .ssr-tmp/ssr-cards.js
//
// Without it, section 2 fails all four assertions with zero errors logged —
// and the reason is worth more than the fix. `vite build` is a PRODUCTION
// build, so `import.meta.env.DEV` is replaced by `false` and the DEV guard
// inside `Card` is TREE-SHAKEN OUT of the bundle entirely: `grep "DataTable
// card"` finds nothing. `--mode development` alone does not help. So a
// DEV-only guard is INVISIBLE to a production-mode proof, which is the same
// shape as §5h's other blind spots — the harness has to be told to keep the
// thing it is checking. Measured 2026-09-23.
//
// It lives in `scripts/` because `.oxlintrc.json` gives `env.node` only here
// (§17a).
//
// WHY THIS FILE EXISTS. DV1b-a proved 87 things about the TEXT of fourteen
// files. DV1b-b added five more of the same kind. Between them they asserted
// that a parent's letter card passes `actions` while Pending — which was
// TRUE of the source and FALSE of the screen, because `DataTable`'s `Card`
// renders `actions` only when the card has neither `to` nor `onSelect`. The
// prop was inert for a whole dispatch and the browser check is what found it
// (§17d). A source-text assertion proves authorship. This one proves output.
//
// NOT ONE readFileSync, NOT ONE REGEX OVER SOURCE.
//
// WHAT IT DOES NOT COVER, said plainly: thirteen of the fifteen card
// definitions are inline props on self-fetching pages, so this cannot reach
// their real functions (§14e). For those the DEV guard in `Card` is the
// cover — it fires at runtime on the same mistake — and section 1 below
// proves the guard and the rule it enforces, once, as properties of
// `DataTable` rather than of each page.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import parentLetterCard from '../src/pages/parent/excuseLetters/card.jsx';
import teacherLetterCard from '../src/pages/teacher/excuseLetters/card.jsx';

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

// The card layout and the table are BOTH in the markup — the switch is CSS
// (`sm:hidden` / `hidden sm:block`), so no viewport is needed. `.split` on
// the card container keeps the assertions off the table half.
const CARD_MARK = 'sm:hidden';
const renderCards = (node) => {
  const html = renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
  const i = html.indexOf(CARD_MARK);
  const j = html.indexOf('hidden sm:block');
  return i === -1 ? '' : html.slice(i, j === -1 ? undefined : j);
};

const table = (cardFn, rows) => (
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    rows={rows}
    keyField="id"
    renderCard={cardFn}
  />
);

// Capture console.error so the DEV guard can be asserted rather than trusted.
const errors = [];
const realError = console.error;
console.error = (...args) => errors.push(args.join(' '));
const errorsFrom = (fn) => {
  errors.length = 0;
  fn();
  return errors.slice();
};

console.log('UI-B — the card contract:\n');

// ------------------------------------------------------ 1. the rule itself
console.log('1. `actions` beside a primary action:');

const row = { id: 1 };
const ACTION = <button type="button">Edit</button>;

const withSelect = renderCards(
  table(() => ({ title: 'A', onSelect: () => {}, actions: ACTION }), [row])
);
assert(withSelect.includes('A'), 'the card renders');
assert(!withSelect.includes('Edit'), 'onSelect + actions → the ACTIONS ARE ABSENT', withSelect);
assert(withSelect.includes('<button'), 'and the card itself is the one interactive element');

const withTo = renderCards(table(() => ({ title: 'B', to: '/x', actions: ACTION }), [row]));
assert(!withTo.includes('Edit'), 'to + actions → the actions are absent too', withTo);
assert(withTo.includes('<a '), 'and the card is a real link');

const staticCard = renderCards(table(() => ({ title: 'C', actions: ACTION }), [row]));
assert(staticCard.includes('Edit'), 'NEITHER to nor onSelect → the actions DO render');
assert(!staticCard.includes('fa-chevron-right'), 'and a static card shows no chevron');

// NEGATIVE CONTROL: the static case proves the actions CAN render, so their
// absence above is the rule and not a broken fixture.
assert(
  staticCard.includes('Edit') && !withSelect.includes('Edit'),
  'NEGATIVE CONTROL: same actions, two cards — one renders them, one does not'
);

// ------------------------------------------------------ 2. the DEV guard
console.log('\n2. the DEV guard:');

const onSelectErrors = errorsFrom(() =>
  renderCards(table(() => ({ title: 'A', onSelect: () => {}, actions: ACTION }), [row]))
);
assert(onSelectErrors.length === 1, 'onSelect + actions logs exactly one error', String(onSelectErrors.length));
assert(/actions.*is ignored/.test(onSelectErrors[0] || ''), 'and it says `actions` is ignored');
assert(
  /silently missing/.test(onSelectErrors[0] || ''),
  'and names what will be OBSERVED, not just what is ignored'
);

const toErrors = errorsFrom(() =>
  renderCards(table(() => ({ title: 'B', to: '/x', actions: ACTION }), [row]))
);
assert(toErrors.length === 1, '`to` + actions fires it too — both branches, not just one');

assert(
  errorsFrom(() => renderCards(table(() => ({ title: 'C', actions: ACTION }), [row]))).length === 0,
  'a STATIC card with actions is silent — the legal case does not warn'
);
assert(
  errorsFrom(() => renderCards(table(() => ({ title: 'D', onSelect: () => {} }), [row]))).length === 0,
  'and a card with onSelect and NO actions is silent'
);

// ------------------------------------------------------ 3. the parent card
console.log('\n3. the parent letter card:');

const letters = [
  { id: 11, absence_date: '2026-09-21', reason: 'Fever', status: 'Pending' },
  { id: 12, absence_date: '2026-09-18', reason: 'Clinic', status: 'Declined' },
  { id: 13, absence_date: '2026-09-15', reason: 'Trip', status: 'Approved' },
];
const read = [];
const parentHtml = renderCards(
  table((r) => parentLetterCard(r, { onRead: (x) => read.push(x.id) }), letters)
);

assert((parentHtml.match(/<button/g) || []).length === 3, 'all THREE letters are tappable cards');
assert(
  (parentHtml.match(/fa-chevron-right/g) || []).length === 3,
  'and every one shows a chevron — Declined and Approved included'
);
assert(parentHtml.includes('Absence on 21 September 2026'), 'the card titles the absence date');
assert(parentHtml.includes('Fever') && parentHtml.includes('Clinic'), 'the reason is the subtitle');

// The defect DV1b-a shipped: a Declined letter with no route into the
// reading view. Prove the handler fires for exactly that row.
parentLetterCard(letters[1], { onRead: (x) => read.push(x.id) }).onSelect();
assert(read.includes(12), 'a DECLINED letter opens the READING view — DV1b-a\'s regression');
parentLetterCard(letters[2], { onRead: (x) => read.push(x.id) }).onSelect();
assert(read.includes(13), 'and so does an Approved one');

// P1: Edit is not on the card at all.
assert(!parentHtml.includes('Edit'), 'NO Edit button on any parent card — it lives in the reading view');
assert(
  parentLetterCard(letters[0], { onRead: () => {} }).actions === undefined,
  'and the card does not even pass `actions` any more — the dead prop is gone'
);
assert(
  errorsFrom(() => renderCards(table((r) => parentLetterCard(r, { onRead: () => {} }), letters))).length === 0,
  'so the DEV guard stays silent on the real page'
);

// ------------------------------------------------------ 4. the teacher card
console.log('\n4. the teacher letter card — the gate that STAYS:');

const tLetters = [
  { id: 21, first_name: 'Nino', last_name: 'Alcantara', reason: 'Fever', absence_date: '2026-09-21', grade_level: 1, section: 'Mabait', status: 'Pending' },
  { id: 22, first_name: 'Jea', last_name: 'Bargaso', reason: 'Clinic', absence_date: '2026-09-18', grade_level: 5, section: 'Masigasig', status: 'Approved' },
];
const reviewable = (r) => r.status === 'Pending';
const reviewed = [];
const teacherHtml = renderCards(
  table((r) => teacherLetterCard(r, { canReview: reviewable, onReview: (x) => reviewed.push(x.id) }), tLetters)
);

assert((teacherHtml.match(/<button/g) || []).length === 1, 'exactly ONE of the two is tappable');
assert(
  (teacherHtml.match(/fa-chevron-right/g) || []).length === 1,
  'and only the reviewable one shows a chevron'
);
assert(teacherHtml.includes('Alcantara, Nino'), 'the learner leads the card');
assert(teacherHtml.includes('Grade 1 - Mabait'), 'the class is in meta');

teacherLetterCard(tLetters[0], { canReview: reviewable, onReview: (x) => reviewed.push(x.id) }).onSelect();
assert(reviewed.includes(21), 'the reviewable letter opens the review modal');
assert(
  teacherLetterCard(tLetters[1], { canReview: reviewable, onReview: () => {} }).onSelect === undefined,
  'and a letter this teacher may NOT review has no handler — never a 403 dead end'
);

// NEGATIVE CONTROL: with an always-true gate both become tappable, so the
// single chevron above is the gate working and not an empty fixture.
assert(
  (renderCards(table((r) => teacherLetterCard(r, { canReview: () => true, onReview: () => {} }), tLetters))
    .match(/fa-chevron-right/g) || []).length === 2,
  'NEGATIVE CONTROL: an always-true gate makes BOTH tappable'
);

// §5c — nothing identifying beyond the name on either page's card.
assert(!/\d{7,}/.test(parentHtml) && !/\d{7,}/.test(teacherHtml), 'no LRN-shaped value on any card (§5c)');

console.error = realError;
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
