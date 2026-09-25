// UI-D-1 proof — the NON-PRINT half, and that limit is the first thing to say.
//
// RUN FROM `client/`:
//   npx vite build --ssr scripts/ssr-ui-d.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-ui-d.js
//
// WHAT THIS FILE CANNOT PROVE, STATED PLAINLY: **the printed layout.**
// `@media print` does not apply to a `renderToStaticMarkup` render, there is
// no page box, no `@page`, no orientation and no paper width — so nothing
// here says the class summary fits a landscape sheet, that the scroller stops
// clipping, or that the report card comes out as its table. §5h already says
// a build and a lint prove the code compiles rather than that the page
// renders; print is the case where even an SSR render cannot stand in.
// **The print layout is proved ON PAPER, by Darryl, and by nothing else.**
//
// What IS provable, and is asserted below:
//   1. `GradeValue` emits no colour of its own any more, and a caller's class
//      still wins.
//   2. The base text colour reached the BUILT stylesheet.
//   3. The `print:` rules reached the BUILT stylesheet — the `h-9.5` lesson
//      (§5a-vi): a variant that generates no CSS fails silently, so the file
//      is grepped rather than the source trusted.
//   4. The print theme switch resolves and RESTORES correctly for light, dark
//      and system, driven through the real functions.
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import GradeValue from '../src/format/grade.jsx';
import { cueState, listLabels, scrollStep } from '../src/components/scrollCueState.js';
import { ChildHero } from '../src/pages/dashboards/ParentDashboard.jsx';
import {
  THEME_KEY,
  applyTheme,
  beginPrintTheme,
  endPrintTheme,
  readTheme,
} from '../src/pages/settings/theme.js';

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

console.log('UI-D-1 — the non-print half (print layout is proved on paper):\n');

// --------------------------------------------- 1. GradeValue inherits
console.log('1. GradeValue sets no colour of its own:');

const plain = renderToStaticMarkup(<GradeValue value="87.50" mode="numerical" />);
assert(plain.includes('87.50'), 'it still renders the number');
assert(
  !plain.includes('text-fg'),
  'and emits NO text-fg — the value inherits from whatever contains it',
  plain
);
assert(
  !/class="[^"]*\btext-/.test(plain),
  'and no text-* colour utility of any kind',
  plain
);
assert(plain.includes('tabular-nums'), 'the non-colour classes are untouched');

const overridden = renderToStaticMarkup(
  <GradeValue value="87.50" mode="numerical" className="text-primary-fg" />
);
assert(
  overridden.includes('text-primary-fg'),
  "a caller's colour still reaches the element — the parent hero depends on this"
);
assert(
  !overridden.includes('text-fg"') && !overridden.includes('text-fg '),
  'and it is the ONLY colour on the element, so there is no order dependence left'
);

// The NULL branch is deliberately unchanged: "— Pending" is muted because it
// is a statement about absence, not because of where it sits.
const pending = renderToStaticMarkup(<GradeValue value={null} mode="numerical" />);
assert(
  pending.includes('text-fg-muted'),
  'the NULL branch keeps text-fg-muted — unchanged on purpose'
);
assert(pending.includes('Pending'), 'and still says Pending');

// NEGATIVE CONTROL: the markup really can carry a text colour, so assertion
// 2 is not passing because nothing ever emits one.
assert(
  renderToStaticMarkup(<GradeValue value="1.00" mode="numerical" className="text-fg" />).includes(
    'text-fg'
  ),
  'NEGATIVE CONTROL: a text colour DOES appear when one is passed'
);

// --------------------------------------------- 2/3. the BUILT stylesheet
console.log('\n2. the built stylesheet (grepped, not assumed):');

const distDir = path.resolve('dist/assets');
const cssFile = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).find((f) => f.endsWith('.css'))
  : null;

if (!cssFile) {
  assert(false, 'dist/assets holds a built stylesheet — run `npm run build` FIRST', distDir);
} else {
  const css = fs.readFileSync(path.join(distDir, cssFile), 'utf8');

  // The base text colour. Tailwind may reorder or minify, so match the
  // declaration rather than a whole rule.
  assert(
    /body\{[^}]*color:var\(--color-fg\)/.test(css) || /body\s*\{[^}]*color:\s*var\(--color-fg\)/.test(css),
    'body carries color: var(--color-fg) — the base colour every inheriting element now gets',
    cssFile
  );

  // The print block itself.
  assert(css.includes('@media print'), 'an @media print block was emitted at all');

  // THE h-9.5 LESSON (§5a-vi): a Tailwind variant that generates no CSS
  // fails silently. `print:hidden` is used on five elements across three
  // pages; if the variant produced nothing, every one of them would print.
  assert(
    /@media print\{[\s\S]*?display:none/.test(css),
    'the print: variant really generates CSS — print:hidden is not inert'
  );

  // The hooks the pages reference by name. A class that exists in the JSX and
  // not in the stylesheet is the same silent failure one level out.
  for (const hook of ['print-sheet-scroller', 'print-sheet-table', 'print-doc-table', 'print-doc-cards', 'print-only']) {
    assert(css.includes(hook), `the stylesheet defines .${hook}`);
  }

  // The chrome selectors, by landmark.
  assert(/@media print\{[\s\S]*?aside/.test(css), 'the print block addresses <aside>');
  assert(/@media print\{[\s\S]*?header/.test(css), 'and <header>');

  // NEGATIVE CONTROL for the grep itself: a class nobody defined must NOT be
  // found, or every assertion above would pass on any file.
  assert(
    !css.includes('print-sheet-nonexistent'),
    'NEGATIVE CONTROL: a class that was never written is absent'
  );
}

// --------------------------------------------- 4. the print theme switch
console.log('\n3. the print theme switch restores the STORED choice:');

// A minimal DOM and storage, enough for applyTheme/readTheme. `system` is the
// case that matters: restoring must re-READ the preference, not replay
// whichever side it had resolved to when the dialog opened.
const attrs = new Map();
let prefersDark = false;
globalThis.document = {
  documentElement: { setAttribute: (k, v) => attrs.set(k, v), style: {} },
};
globalThis.window = {
  localStorage: {
    store: new Map(),
    getItem(k) {
      return this.store.has(k) ? this.store.get(k) : null;
    },
    setItem(k, v) {
      this.store.set(k, v);
    },
    removeItem(k) {
      this.store.delete(k);
    },
  },
  matchMedia: (q) => ({ matches: q.includes('dark') ? prefersDark : false }),
};

const themeNow = () => attrs.get('data-theme');

// LIGHT — the no-op case, asserted so a regression cannot hide in it.
window.localStorage.removeItem(THEME_KEY);
applyTheme(readTheme());
assert(themeNow() === 'light', 'a light user starts light');
beginPrintTheme();
assert(themeNow() === 'light', 'and printing leaves them light');
endPrintTheme();
assert(themeNow() === 'light', 'and they are still light afterwards');

// DARK — the case the whole mechanism exists for.
window.localStorage.setItem(THEME_KEY, 'dark');
applyTheme(readTheme());
assert(themeNow() === 'dark', 'a dark user starts dark');
beginPrintTheme();
assert(
  themeNow() === 'light',
  'PRINTING SWITCHES THEM TO LIGHT — otherwise near-white text lands on unprinted white paper',
  themeNow()
);
endPrintTheme();
assert(themeNow() === 'dark', 'and dark is restored the moment the print ends');
assert(
  window.localStorage.getItem(THEME_KEY) === 'dark',
  'and the stored preference was never written to — printing is not a setting change'
);

// SYSTEM — restoring must re-resolve, not replay.
window.localStorage.setItem(THEME_KEY, 'system');
prefersDark = true;
applyTheme(readTheme());
assert(themeNow() === 'dark', 'a System user on a dark OS starts dark');
beginPrintTheme();
assert(themeNow() === 'light', 'printing switches them to light');
endPrintTheme();
assert(themeNow() === 'dark', 'and System resolves back to dark');
assert(
  window.localStorage.getItem(THEME_KEY) === 'system',
  'still stored as SYSTEM, not flattened to the side it happened to be on'
);

// The proof that it re-READS rather than remembers: flip the OS DURING the
// print. A mechanism that stashed "it was dark" would restore dark; one that
// re-resolves gives light, which is what System now means.
window.localStorage.setItem(THEME_KEY, 'system');
prefersDark = true;
applyTheme(readTheme());
beginPrintTheme();
prefersDark = false;
endPrintTheme();
assert(
  themeNow() === 'light',
  'RESTORE RE-RESOLVES: the OS flipped mid-print and System followed it',
  themeNow()
);

// --------------------------------------------- 4. ScrollCue's arithmetic
console.log('\n4. ScrollCue state (UI-D-2), driven directly:');

// An SSR render cannot reach any of this — `renderToStaticMarkup` has no
// layout, so scrollWidth, clientWidth and every cell geometry are zero and
// the component renders with none of its logic exercised (§14e). Hence a
// module with no JSX that a proof can call.

// NOT OVERFLOWING: the table fits, so every cue must stand down. A cue on a
// table with nothing to scroll is worse than no cue.
const fits = cueState({ scrollLeft: 0, clientWidth: 900, scrollWidth: 900, cells: [] });
assert(!fits.overflowing, 'a table that fits does not overflow');
assert(fits.atEnd, 'and counts as at-end, so the fade and button never render');
assert(!fits.scrolled, 'and nothing is scrolled, so the pinned column casts no shadow');

// The 1px tolerance: sub-pixel layout can report a scrollWidth a fraction
// over on a table that exactly fits.
assert(
  !cueState({ scrollLeft: 0, clientWidth: 900, scrollWidth: 900.6, cells: [] }).overflowing,
  'a sub-pixel overhang is NOT an overflow — the tolerance is deliberate'
);
assert(
  cueState({ scrollLeft: 0, clientWidth: 900, scrollWidth: 950, cells: [] }).overflowing,
  'a real overhang is'
);

// THE CLASS SUMMARY SHAPE — leaf cells, counted. 390px viewport, ten columns.
const summaryCells = [220, 300, 380, 460, 540, 620, 700, 780, 860, 940].map((right) => ({ right }));
const atStart = cueState({ scrollLeft: 0, clientWidth: 390, scrollWidth: 940, cells: summaryCells });
assert(atStart.overflowing, 'the summary overflows at 390px');
assert(!atStart.scrolled, 'no shadow before the reader moves');
assert(!atStart.atEnd, 'and it is not at the end');
assert(
  atStart.hiddenCount === 7,
  'seven columns are not fully visible at the start',
  String(atStart.hiddenCount)
);

// A HALF-VISIBLE COLUMN COUNTS AS HIDDEN, which is the common case here: the
// layout deliberately leaves the next column cut off rather than fitting it.
assert(
  cueState({ scrollLeft: 0, clientWidth: 385, scrollWidth: 940, cells: summaryCells }).hiddenCount === 7,
  'a column whose right edge is past the viewport is hidden even if it STARTS on screen'
);

const midway = cueState({ scrollLeft: 300, clientWidth: 390, scrollWidth: 940, cells: summaryCells });
assert(midway.scrolled, 'once scrolled, the pinned column gets its shadow');
assert(midway.hiddenCount === 4, 'and fewer columns remain hidden', String(midway.hiddenCount));

const ended = cueState({ scrollLeft: 550, clientWidth: 390, scrollWidth: 940, cells: summaryCells });
assert(ended.atEnd, 'at the end, atEnd is true');
assert(ended.hiddenCount === 0, 'and nothing is reported hidden, so the hint becomes "End of table"');
assert(ended.scrolled, 'but it is still scrolled, so the shadow STAYS at the end');

// THE CLASS RECORD SHAPE — group cells, named. Same function, labels passed.
const groupCells = [
  { right: 240, label: 'Written / Oral Works' },
  { right: 520, label: 'Performance Tasks' },
  { right: 760, label: 'Summative' },
  { right: 900, label: 'Grade' },
];
const recStart = cueState({ scrollLeft: 0, clientWidth: 390, scrollWidth: 900, cells: groupCells });
assert(
  recStart.hiddenLabels.join('|') === 'Performance Tasks|Summative|Grade',
  'the record names its hidden GROUPS rather than counting columns',
  recStart.hiddenLabels.join('|')
);
assert(
  listLabels(recStart.hiddenLabels) === 'Performance Tasks, Summative and Grade',
  'and they read as a sentence, with the final conjunction'
);

// A PARTLY VISIBLE GROUP is still hidden — a group half on screen is a group
// the teacher has not read. Written/Oral Works ends at 240; a 200px viewport
// cuts it, and it must be named.
const recCut = cueState({ scrollLeft: 0, clientWidth: 200, scrollWidth: 900, cells: groupCells });
assert(
  recCut.hiddenLabels[0] === 'Written / Oral Works',
  'a group cut in half is named, not treated as seen',
  recCut.hiddenLabels.join('|')
);

// ONE hidden group reads without a comma.
const recOne = cueState({ scrollLeft: 600, clientWidth: 290, scrollWidth: 900, cells: groupCells });
assert(recOne.hiddenLabels.length === 1 && listLabels(recOne.hiddenLabels) === 'Grade', 'one group: "Grade"');
assert(listLabels([]) === '', 'no groups is an empty string, never "and"');
assert(listLabels(['A', 'B']) === 'A and B', 'two groups take the conjunction alone');

// The step is most of a screenful, never all of it: a full-width jump leaves
// nothing in common between the two views.
assert(scrollStep(390) === 312, 'one tap moves 80% of the visible width', String(scrollStep(390)));
assert(scrollStep(0) >= 1, 'and never zero, which would be a dead button');

// --------------------------------------------- 5. the parent hero
console.log('\n5. ChildHero (UI-D-3):');

// THE FIXTURE BELOW IS THE LESSON, so it is stated before the assertions.
// This proof first shipped passing 71/71 with `descriptor: 'Outstanding'` — a
// STRING I invented — while the API returns an OBJECT, `{ descriptor,
// filipino }` (`gradeComputation.js`'s Table 8). Passing that object into JSX
// crashed the parent dashboard to a BLANK PAGE, because React refuses an
// object as a child and nothing above it is an error boundary. Build, oxlint
// and this proof were all green; the browser sweep caught it.
//
// A proof is only as honest as its fixture. `descriptorFixture` mirrors the
// server's real shape, and the assertions below check both that the English
// word is rendered and that the raw Filipino one never leaks — which is what
// would happen again if someone rendered the object's other key by mistake.
const descriptorFixture = (english, filipino) => ({ descriptor: english, filipino });

const heroUser = {
  name: 'A Parent',
  student_first_name: 'Nino',
  student_last_name: 'Alcantara',
  grade_level: 1,
  section: 'Mabait',
};
const heroSection = { loading: false, data: { adviser_name: 'Lito Bautista' } };
const noLetter = { data: null };

const ks1 = renderToStaticMarkup(
  <ChildHero
    linked
    user={heroUser}
    section={heroSection}
    grades={{ descriptive: true }}
    term={1}
    letterTerm={{
      term: 1,
      missing: 3,
      pills: [
        { name: 'Mathematics', letter: 'A', descriptor: 'Outstanding' },
        { name: 'Reading and Literacy', letter: 'D', descriptor: 'Fairly Satisfactory' },
      ],
    }}
    monthDays={{ present: 8, total: 10 }}
    letter={noLetter}
  />
);

// THE DEFECT THIS FIXES: the panel read "A  D" with no subject beside either
// letter, because the name was bound as a hover-only `title`.
assert(ks1.includes('Mathematics') && ks1.includes('Reading and Literacy'), 'KS1 names each subject beside its letter');
assert(ks1.includes('Outstanding') && ks1.includes('Fairly Satisfactory'), 'and carries the descriptor, already in the payload');

// THE CONTRACT, asserted because breaking it blanked the page. `ChildHero`
// takes the descriptor as a STRING; the page flattens the API's
// `{ descriptor, filipino }` before it gets here, the same way
// `TermValue.jsx:31` and `parent/GradesPage.jsx:290` do. Handing the object
// straight through must FAIL, and fail here rather than in a browser.
let threwOnObject = false;
try {
  renderToStaticMarkup(
    <ChildHero
      linked
      user={heroUser}
      section={heroSection}
      grades={{ descriptive: true }}
      term={1}
      letterTerm={{
        term: 1,
        missing: 0,
        pills: [{ name: 'Mathematics', letter: 'A', descriptor: descriptorFixture('Advancing', 'Namumukod-tangi') }],
      }}
      monthDays={null}
      letter={noLetter}
    />
  );
} catch {
  threwOnObject = true;
}
assert(
  threwOnObject,
  'NEGATIVE CONTROL: the raw {descriptor, filipino} OBJECT is refused — this is the blank-page defect, caught here now'
);
assert(
  !/title="Mathematics"/.test(ks1),
  'NO title-only tooltip — it does not exist on touch, which is what a parent reads this on'
);
assert(
  ks1.includes('3 more subjects not yet recorded for Term 1'),
  'and says what is NOT recorded, so two letters of five cannot look complete'
);
assert(!ks1.includes('General average'), 'Key Stage 1 shows no general average (GRADING_SPEC §6a)');

// THE PANEL TOKEN. `primary` is a BUTTON fill whose dark value is a light
// indigo, which made this full-width panel the brightest thing on a dark
// screen. `brand-panel` is the token that is a solid brand field in BOTH.
assert(ks1.includes('bg-brand-panel'), 'the panel uses bg-brand-panel');
assert(!ks1.includes('bg-primary'), 'NEGATIVE CONTROL: bg-primary is gone from the hero');
assert(ks1.includes('NA'), "the avatar shows the learner's initials");

// NUMERICAL, and the term is the SETTINGS term.
const g6 = renderToStaticMarkup(
  <ChildHero
    linked
    user={{ ...heroUser, student_first_name: 'Marwin', student_last_name: 'Conde', grade_level: 6, section: 'Malikhain' }}
    section={heroSection}
    grades={{ descriptive: false, average: 88.05, subjects_recorded: 8, subjects_total: 8 }}
    term={1}
    letterTerm={null}
    monthDays={{ present: 9, total: 10 }}
    letter={noLetter}
  />
);
assert(g6.includes('88.05'), 'the average renders with two decimals (GRADING_SPEC §4a)');
assert(g6.includes('Term 1'), 'captioned with the term it belongs to');
assert(
  !/text-fg["\s]/.test(g6),
  'and GradeValue emits no colour — it inherits the panel foreground rather than winning by stylesheet order',
  g6.slice(0, 120)
);

// A PARTIAL TERM SHOWS NO NUMBER (§12) — never a running average.
const partial = renderToStaticMarkup(
  <ChildHero
    linked
    user={heroUser}
    section={heroSection}
    grades={{ descriptive: false, average: null, subjects_recorded: 3, subjects_total: 8 }}
    term={2}
    letterTerm={null}
    monthDays={null}
    letter={noLetter}
  />
);
assert(partial.includes('3 of 8 recorded'), 'a partial term says how far along it is');
assert(!partial.includes('88.05') && !/>\s*0\.00\s*</.test(partial), 'and shows NO figure — never a partial average, never 0.00');
assert(partial.includes('Term 2'), 'and names the term from settings, not from whichever term has data');

// Unlinked: one sentence, no figures at all.
const unlinked = renderToStaticMarkup(
  <ChildHero linked={false} user={null} section={{ loading: false, data: null }} grades={null} term={1} letterTerm={null} monthDays={null} letter={noLetter} />
);
assert(unlinked.includes('not linked to a learner yet'), 'an unlinked account is told so');
assert(!unlinked.includes('Present this month'), 'and gets no empty figures beside it');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
