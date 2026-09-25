// Item 5 proof — the filter cue.
//
// RUN FROM `client/`:
//   npx vite build --ssr scripts/ssr-item5.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-item5.js
//
// WHAT THIS CANNOT PROVE, said before the assertions rather than after:
//
//   1. THE CHANGE EVENT. `renderToStaticMarkup` has no events, so nothing
//      here shows that the note APPEARS when a reader changes a select — only
//      that it is in the markup when `dirty` is true. That is the browser
//      check, the same limit §18h records for print.
//   2. THE 390px LAYOUT. No layout, no widths, so `filterFieldClass` doing
//      its job is also the browser check.
//
// THE HOOK IS DEFERRED. `useStagedFilters` was considered and left out: it is
// a state refactor across five pages, and shipping it beside a visual change
// would mean a failed browser check could not say which half caused it. Each
// page assembles its draft object ONCE into a `const` that both `isDirty` and
// the submit handler read — the safety the hook would have given, without the
// refactor. `filterState.js` carries the same note.
import { renderToStaticMarkup } from 'react-dom/server';
import FilterActions from '../src/components/FilterActions.jsx';
import { canResetFilters, isDirty } from '../src/components/filterState.js';

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

console.log('Item 5 — the filter cue:\n');

// --------------------------------------------- 1. isDirty
console.log('1. isDirty, driven directly:');

assert(!isDirty({ a: '1' }, { a: '1' }), 'identical values are clean');
assert(isDirty({ a: '1' }, { a: '2' }), 'a changed value is dirty');

// KEY ORDER MUST NOT MATTER. This is why it is not JSON.stringify: the nine
// pages assemble their drafts in whatever order each was written in, and
// `{status, from, to}` means the same as `{from, to, status}`.
assert(
  !isDirty({ status: 'Pending', from: '', to: '' }, { to: '', status: 'Pending', from: '' }),
  'SAME VALUES IN A DIFFERENT KEY ORDER ARE CLEAN — the reason this is not JSON.stringify'
);
assert(
  JSON.stringify({ a: 1, b: 2 }) !== JSON.stringify({ b: 2, a: 1 }),
  'NEGATIVE CONTROL: stringify really would have called those two different'
);

// A MISSING KEY compares against the other side's value rather than being
// skipped — the union, not one side's keys.
assert(isDirty({}, { status: 'Pending' }), 'a key missing from the draft is still compared');
assert(!isDirty({}, { status: '' }), 'and an absent key equals an empty one');

// SEARCH IS TRIMMED ON BOTH SIDES, because commit trims. Without this a
// trailing space claims there are changes to apply and then applies nothing.
assert(!isDirty({ search: 'nino ' }, { search: 'nino' }), 'a trailing space in search is NOT a change');
assert(!isDirty({ search: '  ' }, { search: '' }), 'nor is whitespace-only against empty');
assert(isDirty({ search: 'nino' }, { search: 'jea' }), 'but a real search change is');
// Only `search` is trimmed — a value that legitimately has spaces is not.
assert(
  isDirty({ section: 'Mabait ' }, { section: 'Mabait' }),
  'NEGATIVE CONTROL: the trim is search-only, not a blanket trim'
);

// TYPE COERCION: a grade level is 6 from one source and '6' from a <select>.
assert(!isDirty({ grade_level: 6 }, { grade_level: '6' }), 'a number and its string are the same filter');
assert(!isDirty({ x: null }, { x: '' }), 'null and empty are the same filter');
assert(!isDirty({ x: undefined }, { x: '' }), 'and so are undefined and empty');

// THE FOUR DEPENDENT Grade→Section TRANSITIONS. Changing Grade blanks Section
// in the draft, and the third case is the one worth pinning: returning to the
// same grade stays DIRTY, because the section really was cleared and the
// result would differ.
// LOWERCASE ON PURPOSE. Named `G`, oxlint read a capitalised arrow function
// as a React component and raised `react(only-export-components)` on this
// file — a warning about Fast Refresh, in a Node proof that never refreshes.
// Moving the baseline 43 → 44 for a naming heuristic is not a trade worth
// making.
const gs = (grade, section) => ({ grade, section });
assert(isDirty(gs('6', ''), gs('', '')), 'picking a grade is dirty');
assert(isDirty(gs('5', ''), gs('6', 'Malikhain')), 'changing grade (section blanked) is dirty');
assert(
  isDirty(gs('6', ''), gs('6', 'Malikhain')),
  'BACK TO THE SAME GRADE IS STILL DIRTY — the section was cleared and the list would change'
);
assert(!isDirty(gs('6', ''), gs('6', '')), 'but returning to the applied state is clean');

// `admin/StudentsPage` defaults status to the STRING 'all', not ''.
const DEFAULTS = { status: 'all', grade_level: '', section: '', search: '' };
assert(!isDirty(DEFAULTS, DEFAULTS), "a non-empty default ('all') is clean at rest");
assert(!canResetFilters(DEFAULTS, DEFAULTS), 'and Reset is not offered at rest');
assert(
  canResetFilters({ ...DEFAULTS, status: 'active' }, DEFAULTS),
  'changing away from that default DOES offer Reset'
);
assert(
  Boolean(DEFAULTS.status) === true,
  'NEGATIVE CONTROL: a truthiness test would have called that default filtered'
);

// --------------------------------------------- 2. FilterActions
console.log('\n2. FilterActions, rendered:');

const clean = renderToStaticMarkup(<FilterActions dirty={false} canReset={false} onReset={() => {}} />);
const dirtyHtml = renderToStaticMarkup(<FilterActions dirty canReset={false} onReset={() => {}} />);

assert(!clean.includes('Changes not applied'), 'CLEAN: no note in the markup at all');
assert(
  !clean.includes('role="status"'),
  'and no empty live region left behind claiming a state that is not true'
);
assert(dirtyHtml.includes('Changes not applied'), 'DIRTY: the note is present');
assert(dirtyHtml.includes('role="status"'), 'with role="status" — not alert; nothing has failed');
assert(
  dirtyHtml.includes('aria-hidden="true"'),
  'and the ● is aria-hidden — the sentence carries the meaning, not the glyph'
);

// The quiet/filled swap. Clean reuses the Reset class exactly, so the two are
// a matched pair by construction.
assert(clean.includes('border-edge-strong'), 'CLEAN: Apply is the outline style');
assert(!clean.includes('bg-primary'), 'and is not filled');
assert(dirtyHtml.includes('bg-primary'), 'DIRTY: Apply is filled');
assert(
  !dirtyHtml.includes('type="submit" class="rounded-lg border border-edge-strong'),
  'and is no longer the outline style'
);

// STILL ENABLED WHEN CLEAN. Disabling would give no reason, and re-applying
// an unchanged filter is a legitimate refetch.
assert(!clean.includes('disabled'), 'CLEAN: Apply is never disabled');
assert(!dirtyHtml.includes('disabled'), 'DIRTY: nor then');

// Reset appears only when canReset, and carries the page's own word.
assert(!clean.includes('>Reset<'), 'Reset is absent when canReset is false');
const withReset = renderToStaticMarkup(<FilterActions dirty={false} canReset onReset={() => {}} />);
assert(withReset.includes('>Reset<'), 'and present when it is true');
assert(
  renderToStaticMarkup(
    <FilterActions dirty={false} canReset onReset={() => {}} resetLabel="Clear" />
  ).includes('>Clear<'),
  "a page's own label is used — teacher/StudentsPage says Clear, not Reset"
);
assert(
  withReset.includes('type="button"'),
  'Reset is type=button — inside a form, a bare button would submit it'
);

// NEGATIVE CONTROL: the same component really does render both, so "no note"
// above is the prop working rather than an empty render.
assert(
  clean.includes('Apply') && dirtyHtml.includes('Apply') && clean !== dirtyHtml,
  'NEGATIVE CONTROL: one component, two genuinely different outputs'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
