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
// The prop is `handedRows`; `rows` is what the list shows — none while the
// screen's rows are another query's — and everything after it reads `rows`.
const listWired = (s) =>
  /rows: handedRows,/.test(s) &&
  /const rowsCurrent = useQueryRows\(handedRows, loading, queryKey\);/.test(s) &&
  /const rows = rowsCurrent \? handedRows : NO_ROWS;/.test(s) &&
  /data=\{rows\}/.test(s) &&
  (s.match(/handedRows/g) || []).length === 3 &&
  /queryKey = undefined,/.test(s);
proved(
  'L1 the cards another query left are not handed to FlatList — its empty content, the skeleton, stands in',
  listWired,
  list,
  list.replace('data={rows}', 'data={handedRows}'),
  list.replace('const rows = rowsCurrent ? handedRows : NO_ROWS;', 'const rows = handedRows;')
);
const firstLoad = (s) => /const firstLoad = \(loading \|\| \(!rowsCurrent && !error\)\) && !rows\.length;/.test(s);
proved(
  'L2 the skeleton while not current — but an error still shows first',
  firstLoad,
  list,
  list.replace('(loading || (!rowsCurrent && !error))', '(loading || !rowsCurrent)'),
  list.replace('(loading || (!rowsCurrent && !error))', 'loading')
);
const counts = (s) =>
  /const busy = loading && rows\.length > 0;/.test(s) &&
  /const footerError = rows\.length && error/.test(s) &&
  /rows\.length && hasMore \?/.test(s) &&
  !/handedRows\.length/.test(s);
proved(
  'L3 kept cards, the footer error and "Show more" count only this query’s cards',
  counts,
  list,
  list.replace('const busy = loading && rows.length > 0;', 'const busy = loading && handedRows.length > 0;')
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

// ---------------------------------------------------------------------------
// The screens (commit 3): every list whose query can change passes a key, and
// the key is its load's dependency array — so it changes exactly when the load
// runs for another query; a pull and "Show more" keep it.
console.log('The phone screens — source text');
const SCREENS = path.join(SRC, 'screens');
const screens = Object.fromEntries(
  fs
    .readdirSync(SCREENS, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.jsx?$/.test(f) && !f.startsWith('dev/'))
    .map((f) => [f, fs.readFileSync(path.join(SCREENS, f), 'utf8').replace(/\r\n/g, '\n')])
);
const KEYED = [
  'admin/AnnouncementsScreen.jsx',
  'admin/AttendanceScreen.jsx',
  'admin/StudentsScreen.jsx',
  'admin/UsersScreen.jsx',
  'parent/EventsScreen.jsx',
  'teacher/AnnouncementsScreen.jsx',
  'teacher/AttendanceRecordsScreen.jsx',
  'teacher/EventsScreen.jsx',
  'teacher/ExcuseLettersScreen.jsx',
  'teacher/StudentsScreen.jsx',
].sort();
// The lists that load with no query at all: nothing changes, so no key.
const NO_QUERY = [
  'NotificationsScreen.jsx',
  'parent/AnnouncementsScreen.jsx',
  'parent/ExcuseLettersScreen.jsx',
  'parent/MemosScreen.jsx',
  'parent/MessagesScreen.jsx',
  'teacher/MemosScreen.jsx',
  'teacher/MessagesScreen.jsx',
].sort();
const parts = (list) => list.split(',').map((s) => s.trim()).filter(Boolean).sort();
const keysIn = (text) => [...text.matchAll(/queryKey=\{\[([^\]]*)\]\}/g)].map((m) => ({ parts: parts(m[1]), at: m.index }));
// The load's dependencies: `useCallback(async …, [deps])` on its own line.
const loadDeps = (text) => {
  const m = text.match(/const load = useCallback\([\s\S]*?\n\s+\[([^\]]*)\]\n\s+\);/);
  return m ? parts(m[1]) : null;
};
const sameSet = (a, b) => Boolean(a) && Boolean(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const listsIn = (map) => Object.keys(map).filter((f) => /<DataList\b/.test(map[f])).sort();
const keyedIn = (map) => Object.keys(map).filter((f) => /queryKey=/.test(map[f])).sort();
proved(
  'S1 exactly the 10 screens whose query can change pass a queryKey; the other 7 lists pass none',
  (map) => sameSet(keyedIn(map), KEYED) && sameSet(listsIn(map), [...KEYED, ...NO_QUERY].sort()),
  screens,
  { ...screens, 'teacher/MemosScreen.jsx': screens['teacher/MemosScreen.jsx'].replace('<DataList\n      rows={rows}', '<DataList\n      rows={rows}\n      queryKey={[]}') },
  { ...screens, 'admin/UsersScreen.jsx': screens['admin/UsersScreen.jsx'].replace('queryKey={[applied]}', '') }
);
const keysMatchLoads = (map) =>
  KEYED.every((f) => {
    const keys = keysIn(map[f] || '');
    return keys.length === 1 && sameSet(keys[0].parts, loadDeps(map[f]));
  });
proved(
  'S2 every key is its load’s dependency array',
  keysMatchLoads,
  screens,
  { ...screens, 'admin/AttendanceScreen.jsx': screens['admin/AttendanceScreen.jsx'].replace('queryKey={[applied, hasScope]}', 'queryKey={[applied]}') },
  { ...screens, 'parent/EventsScreen.jsx': screens['parent/EventsScreen.jsx'].replace('queryKey={[range]}', 'queryKey={[range, offset]}') }
);
const stableRows = (map) =>
  KEYED.every((f) => {
    const text = map[f] || '';
    const { at } = keysIn(text)[0] || {};
    if (at === undefined) return false;
    const element = text.slice(text.lastIndexOf('<DataList', at), at);
    const name = element.match(/rows=\{(\w+)\}/)?.[1];
    return Boolean(name) && new RegExp(`const \\[${name}, set\\w+\\] = useState\\(`).test(text);
  });
proved(
  'S3 every keyed list is handed a stable rows array — the screen’s state',
  stableRows,
  screens,
  { ...screens, 'teacher/EventsScreen.jsx': screens['teacher/EventsScreen.jsx'].replace('<DataList\n      rows={rows}', '<DataList\n      rows={rows.slice()}') }
);
const AVATARS = [
  'admin/AttendanceScreen.jsx',
  'admin/StudentsScreen.jsx',
  'admin/UsersScreen.jsx',
  'parent/MessagesScreen.jsx',
  'teacher/AttendanceRecordsScreen.jsx',
  'teacher/ExcuseLettersScreen.jsx',
  'teacher/MessagesScreen.jsx',
  'teacher/StudentsScreen.jsx',
];
proved(
  'S4 every avatar list draws the circle in its skeleton — the five added here and F4’s three',
  (map) => sameSet(Object.keys(map).filter((f) => /<DataList\b[\s\S]*?\n\s+skeletonAvatar\n/.test(map[f])).sort(), AVATARS),
  screens,
  { ...screens, 'parent/MessagesScreen.jsx': screens['parent/MessagesScreen.jsx'].replace('\n      skeletonAvatar\n', '\n') }
);

console.log(`\nproof-query-key: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
