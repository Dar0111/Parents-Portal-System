// PROOF — feat/skeleton-querykey (2026-10-11), the phone: option 1, the
// `queryKey` rule (MOBILE M11 / M23, KNOWN_ISSUES).
//
// What it drives directly (pure): the MIRRORED hooks/useSkeleton.js
// `nextRowsQuery` / `rowsAreCurrent` through the transitions a list lives
// through — the same key loading again (a pull, a reconnect re-read), a new key
// while loading and before the read starts, this query's rows arriving, a load
// that ends with the SAME array, and "Show more" appending. Each check runs
// the real rule AND a negative control — the rule with one part missing — which
// must fail it.
// What it reads as SOURCE TEXT, said plainly: DataList's wiring — the rows
// another query left are not handed to FlatList (its empty content, the
// skeleton, stands in), an error still shows before the skeleton, and kept rows,
// the footer and "Show more" count only this query's rows.
// React Native does not render under Node, so nothing here is rendered.
//
// WHAT IT CANNOT: a real filter change on the phone, the 300 ms, the sweep —
// the owner's phone check (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-query-key.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextRowsQuery, rowsAreCurrent } from '../src/hooks/useSkeleton.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');
const src = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
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

// ---------------------------------------------------------------------------
// The rule, and the controls: each is the real rule with one part missing.
const REAL = { next: nextRowsQuery, current: rowsAreCurrent };
const BUILD2 = { next: nextRowsQuery, current: () => true };
const REF_ONLY = {
  next: (seen, { rows, loading, queryKey }) => ({
    rows,
    loading,
    rowsKey: seen === null || rows !== seen.rows ? queryKey : seen.rowsKey,
  }),
  current: rowsAreCurrent,
};
const LOAD_IS_NEW = { next: nextRowsQuery, current: (record, key) => !record.loading && rowsAreCurrent(record, key) };
const FROZEN = {
  next: (seen, { rows, loading, queryKey }) => ({ rows, loading, rowsKey: seen === null ? queryKey : seen.rowsKey }),
  current: rowsAreCurrent,
};
const NO_UNDEFINED_PASS = { next: nextRowsQuery, current: (record, key) => key !== undefined && record.rowsKey === key };

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
const K1 = [{ status: 'active' }];
const K2 = [{ status: 'inactive' }];

console.log('The rule — the mirrored hooks/useSkeleton.js');
proved(
  'Q1 no queryKey: every row is current, whatever changes (exactly as before)',
  (rule) => same(run(rule, [{ rows: R1, loading: false }, { rows: R1, loading: true }, { rows: R2, loading: false }]), [true, true, true]),
  REAL,
  NO_UNDEFINED_PASS,
  LOAD_IS_NEW
);
proved(
  'Q2 the SAME key loading again keeps the cards — a pull, a reconnect re-read',
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
  'Q3 a NEW key while loading: the cards on screen are another query’s',
  (rule) => same(run(rule, [{ rows: R1, loading: false, key: K1 }, { rows: R1, loading: true, key: K2 }]), [true, false]),
  REAL,
  BUILD2
);
proved(
  'Q4 a NEW key before the read starts: not current either',
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
  'Q5 this query’s cards arriving (a new array) are current',
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
  'Q7 "Show more" appending under the same key stays current',
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
  (rule) => same(run(rule, [{ rows: R1, loading: false, key: [{ a: 1 }] }, { rows: R1, loading: true, key: [{ a: 1 }] }]), [true, true]),
  REAL,
  { next: nextRowsQuery, current: () => false }
);

// ---------------------------------------------------------------------------
console.log('DataList — source text');
const list = src('components/DataList.jsx');
const listWired = (s) =>
  /const rowsCurrent = useQueryRows\(rows, loading, queryKey\);/.test(s) &&
  /const shown = rowsCurrent \? rows : NO_ROWS;/.test(s) &&
  /data=\{shown\}/.test(s) &&
  !/data=\{rows\}/.test(s) &&
  /queryKey = undefined,/.test(s);
proved(
  'L1 the cards another query left are not handed to FlatList — its empty content, the skeleton, stands in',
  listWired,
  list,
  list.replace('data={shown}', 'data={rows}'),
  list.replace('const shown = rowsCurrent ? rows : NO_ROWS;', 'const shown = rows;')
);
const firstLoad = (s) => /const firstLoad = \(loading \|\| \(!rowsCurrent && !error\)\) && !shown\.length;/.test(s);
proved(
  'L2 the skeleton while not current — but an error still shows first',
  firstLoad,
  list,
  list.replace('(loading || (!rowsCurrent && !error))', '(loading || !rowsCurrent)'),
  list.replace('(loading || (!rowsCurrent && !error))', 'loading')
);
const counts = (s) =>
  /const busy = loading && shown\.length > 0;/.test(s) &&
  /const footerError = shown\.length && error/.test(s) &&
  /shown\.length && hasMore \?/.test(s) &&
  !/rows\.length/.test(s);
proved(
  'L3 kept cards, the footer error and "Show more" count only this query’s cards',
  counts,
  list,
  list.replace('const busy = loading && shown.length > 0;', 'const busy = loading && rows.length > 0;')
);
const order = (s) => {
  const skeleton = s.indexOf('if (firstLoad) emptyContent');
  const error = s.indexOf('else if (error) emptyContent');
  const empty = s.indexOf('else emptyContent = <EmptyState');
  return skeleton > 0 && skeleton < error && error < empty;
};
proved(
  'L4 the empty state is still the last branch — never skipped once this query has answered',
  order,
  list,
  list.replace('else emptyContent = <EmptyState', 'else emptyContent = null; const _x = <EmptyState')
);

console.log(`\nproof-query-key: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
