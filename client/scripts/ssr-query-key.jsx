// PROOF — feat/skeleton-querykey (2026-10-11): option 1, the `queryKey` rule
// (FRONTEND §5a-vii, KNOWN_ISSUES), and the cards-only avatar circle.
//
// What it drives directly (pure): hooks/useSkeleton.js `nextRowsQuery` /
// `rowsAreCurrent` (mirrored to the phone) through the transitions a list
// lives through — the same key loading again, a new key while loading and
// before the read starts, this query's rows arriving, a load that ends with
// the SAME array (an empty result after an empty result, a cached array), and
// "Show more" appending. Each check runs the real rule AND a negative control —
// a rule with one part missing — which must fail it.
// What it renders: DataTable on its first render with and without a key (the
// same markup), and the skeleton's avatar circles — `skeletonAvatar="cards"`
// on the card placeholders only, `true` on both.
// What it reads as SOURCE TEXT, said plainly: DataTable's wiring (the rows
// another query left are never kept or shown; the error before the skeleton,
// the empty state after it) and the hook's (no key → no state; keys compared
// as JSON).
//
// WHAT IT CANNOT: a real filter change in a browser, the 300 ms, the sweep —
// renderToStaticMarkup renders once and runs no effect; that is the owner's
// check (TESTING).
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-query-key.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-query-key.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { nextRowsQuery, rowsAreCurrent } from '../src/hooks/useSkeleton';
import DataTable from '../src/components/DataTable';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
// One check: the predicate holds on the real input and FAILS on every control.
function proved(label, holds, real, ...controls) {
  const onReal = Boolean(holds(real));
  const caught = controls.map((c) => !holds(c));
  assert(
    onReal && caught.every(Boolean),
    label,
    `real ${onReal ? 'holds' : 'DOES NOT HOLD'}; controls ${caught.map((c) => (c ? 'fail' : 'DO NOT FAIL')).join(', ')}`
  );
}
const src = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// The rule, and the controls: each is the real rule with one part missing.
const REAL = { next: nextRowsQuery, current: rowsAreCurrent };
// Build 2: whatever is on screen is current.
const BUILD2 = { next: nextRowsQuery, current: () => true };
// Rows belong to a key only when a NEW array arrives — a load that ends with
// the same array is never counted.
const REF_ONLY = {
  next: (seen, { rows, loading, queryKey }) => ({
    rows,
    loading,
    rowsKey: seen === null || rows !== seen.rows ? queryKey : seen.rowsKey,
  }),
  current: rowsAreCurrent,
};
// Every load start is a new query: nothing is kept while loading.
const LOAD_IS_NEW = { next: nextRowsQuery, current: (record, key) => !record.loading && rowsAreCurrent(record, key) };
// The key is taken once, on the first render, and never again.
const FROZEN = {
  next: (seen, { rows, loading, queryKey }) => ({ rows, loading, rowsKey: seen === null ? queryKey : seen.rowsKey }),
  current: rowsAreCurrent,
};
// A key compared by identity, not by value.
const NO_UNDEFINED_PASS = { next: nextRowsQuery, current: (record, key) => key !== undefined && record.rowsKey === key };

// Drive a rule through renders: each step is { rows, loading, key } (key: any
// JSON value, or undefined); returns `current` after each step.
function run(rule, steps) {
  let seen = null;
  return steps.map(({ rows, loading, key }) => {
    const queryKey = key === undefined ? undefined : JSON.stringify(key);
    seen = rule.next(seen, { rows, loading, queryKey });
    return rule.current(seen, queryKey);
  });
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const R1 = [{ id: 1 }];
const R2 = [{ id: 2 }];
const EMPTY = [];
const K1 = [{ grade: '6' }, 0, null];
const K2 = [{ grade: '5' }, 0, null];

console.log('The rule — which query the rows on screen belong to (hooks/useSkeleton.js)');
proved(
  'Q1 no queryKey: every row is current, whatever changes (exactly as before)',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false },
        { rows: R1, loading: true },
        { rows: R2, loading: false },
      ]),
      [true, true, true]
    ),
  REAL,
  NO_UNDEFINED_PASS,
  LOAD_IS_NEW
);
proved(
  'Q2 the SAME key loading again keeps the rows — a socket re-read, a pull, a Retry',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: true, key: K1 },
        { rows: R2, loading: false, key: K1 },
      ]),
      [true, true, true]
    ),
  REAL,
  LOAD_IS_NEW
);
proved(
  'Q3 a NEW key while loading: the rows on screen are another query’s',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: true, key: K2 },
      ]),
      [true, false]
    ),
  REAL,
  BUILD2
);
proved(
  'Q4 a NEW key before the read starts (loading not yet true): not current either',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: false, key: K2 },
        { rows: R1, loading: true, key: K2 },
      ]),
      [true, false, false]
    ),
  REAL,
  BUILD2
);
proved(
  'Q5 this query’s rows arriving (a new array) are current',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: true, key: K2 },
        { rows: R2, loading: false, key: K2 },
      ]),
      [true, false, true]
    ),
  REAL,
  FROZEN
);
proved(
  'Q6 the SAME array: a load that ends under the new key with the same reference (an empty result after an empty result, a cached array) is current — the skeleton does not stay on',
  (rule) =>
    same(
      run(rule, [
        { rows: EMPTY, loading: false, key: K1 },
        { rows: EMPTY, loading: false, key: K2 },
        { rows: EMPTY, loading: true, key: K2 },
        { rows: EMPTY, loading: false, key: K2 },
      ]),
      [true, false, false, true]
    ) &&
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: true, key: K2 },
        { rows: R1, loading: false, key: K2 },
      ]),
      [true, false, true]
    ),
  REAL,
  REF_ONLY,
  BUILD2
);
proved(
  'Q7 "Show more" appending under the same key stays current (a new, longer array)',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: K1 },
        { rows: R1, loading: true, key: K1 },
        { rows: [...R1, ...R2], loading: false, key: K1 },
      ]),
      [true, true, true]
    ),
  REAL,
  LOAD_IS_NEW
);
proved(
  'Q8 an equal key is the same key — compared as JSON, not by identity',
  (rule) =>
    same(
      run(rule, [
        { rows: R1, loading: false, key: [{ grade: '6' }, 0] },
        { rows: R1, loading: true, key: [{ grade: '6' }, 0] },
      ]),
      [true, true]
    ),
  REAL,
  { next: nextRowsQuery, current: () => false }
);

// ---------------------------------------------------------------------------
console.log('DataTable — rendered (its first render; no effect runs)');
const COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'name', header: 'Student' },
];
const ROWS = [{ id: 1, date: '2026-10-01', name: 'Ana Reyes' }];
const table = (props) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <DataTable columns={COLUMNS} {...props} />
    </MemoryRouter>
  );
proved(
  'D1 a key changes nothing on the first render: kept rows are the same markup, aria-busy and inert',
  ([withKey, withoutKey]) => withKey === withoutKey && withKey.includes('aria-busy="true"') && withKey.includes('inert'),
  [table({ rows: ROWS, loading: true, queryKey: ['a', 0] }), table({ rows: ROWS, loading: true })],
  [table({ rows: [], loading: true, queryKey: ['a', 0] }), table({ rows: ROWS, loading: true })]
);
const card = (r) => ({ title: r.name, avatar: r.name });
const CIRCLE = /rounded-full bg-edge h-\[2\.375rem\] w-\[2\.375rem\]/g;
const circles = (m) => {
  const cardsPart = m.slice(m.indexOf('<div class="sm:hidden">'), m.indexOf('<table'));
  const tablePart = m.slice(m.indexOf('<table'));
  return [(cardsPart.match(CIRCLE) || []).length, (tablePart.match(CIRCLE) || []).length];
};
const skeletonWith = (skeletonAvatar) => table({ rows: [], loading: true, renderCard: card, skeletonAvatar });
proved(
  'D2 skeletonAvatar="cards": a circle on each of the three card placeholders, none in the table',
  (m) => same(circles(m), [3, 0]),
  skeletonWith('cards'),
  skeletonWith(true),
  skeletonWith(false)
);
proved(
  'D3 skeletonAvatar={true} keeps F4: three on the cards and five in the first column',
  (m) => same(circles(m), [3, 5]),
  skeletonWith(true),
  skeletonWith('cards')
);

// ---------------------------------------------------------------------------
console.log('The wiring — source text');
const dt = src('src/components/DataTable.jsx');
const dtWired = (s) =>
  /const rowsCurrent = useQueryRows\(rows, loading, queryKey\);/.test(s) &&
  /const kept = loading && rowsCurrent && sortedRows\.length > 0;/.test(s) &&
  /const waiting = \(loading && !kept\) \|\| pageIsStale \|\| !rowsCurrent;/.test(s) &&
  /queryKey = undefined,/.test(s);
proved(
  'W1 DataTable: the rows another query left are never kept (`kept` needs them current) and never shown (`waiting` while not current)',
  dtWired,
  dt,
  dt.replace(' || !rowsCurrent;', ';'),
  dt.replace('loading && rowsCurrent && sortedRows', 'loading && sortedRows')
);
const order = (s) => {
  const err = s.indexOf('  if (error) {');
  const wait = s.indexOf('  if (waiting) {');
  const empty = s.indexOf('  if (!sortedRows.length) {');
  return err > 0 && err < wait && wait < empty;
};
proved(
  'W2 DataTable: the error branch before the skeleton, the empty state after it (never skipped once this query has answered)',
  order,
  dt,
  dt.replace('  if (error) {', '  if (false) {')
);
const hook = src('src/hooks/useSkeleton.js');
const hookWired = (s) =>
  /const key = queryKey === undefined \? undefined : JSON\.stringify\(queryKey\);/.test(s) &&
  /const \[seen, setSeen\] = useState\(null\);\n\s+if \(key === undefined\) return true;/.test(s);
proved(
  'W3 the hook: no key → it returns before it could set state; a key is compared as its JSON',
  hookWired,
  hook,
  hook.replace('  if (key === undefined) return true;\n', ''),
  hook.replace('JSON.stringify(queryKey)', 'queryKey')
);
proved(
  'W4 build 2’s clock is untouched: nothing before 300 ms, no minimum, off when loading ends',
  (s) =>
    /export const SKELETON_DELAY_MS = 300;/.test(s) &&
    /if \(!loading\) return 'off';\n\s+return elapsedMs >= delayMs \? 'skeleton' : 'wait';/.test(s),
  hook,
  hook.replace('SKELETON_DELAY_MS = 300', 'SKELETON_DELAY_MS = 0')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
