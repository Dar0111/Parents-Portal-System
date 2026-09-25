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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
