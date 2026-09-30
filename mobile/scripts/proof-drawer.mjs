// PROOF — the grouped drawer (feat/nav-drawer-groups, MOBILE_CONVENTIONS M19).
// Drives the verbatim navGroups.js copy, nav.js, routes.js and the drawer's
// pure rules in drawerFold.js under Node. What it proves: every phone item is
// placed exactly once, in the web's groups and order; admin's System group
// is gone on the phone with Backup & Restore; the fold state parses safely,
// toggles per role, and never folds the active group; a parent's card never
// carries the login id. What it cannot: how the drawer looks or that a tap
// folds — that is the phone (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-drawer.mjs
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_BY_ROLE } from '../src/navigation/nav.js';
import { groupNav } from '../src/navigation/navGroups.js';
import { isWebOnly } from '../src/navigation/routes.js';
import {
  NAV_GROUPS_KEY,
  activeGroupLabel,
  foldedFor,
  isGroupOpen,
  parseFolded,
  toggleFolded,
  userCardLines,
} from '../src/navigation/drawerFold.js';

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paths = (list) => list.map((item) => item.to);

// Every item in exactly one place, nothing extra. Also run against a broken
// grouping below — the negative control.
function placedOnce(result, items) {
  const placed = [...result.top, ...result.groups.flatMap((g) => g.items), ...result.bottom].map((i) => i.to);
  return placed.length === items.length && same([...placed].sort(), paths(items).sort());
}

const phoneItems = (role) => NAV_BY_ROLE[role].filter((item) => !isWebOnly(item.to));

// The web sidebar's groups, written out (CLAUDE.md §9, the web's layout).
const EXPECTED = {
  parent: {
    top: ['/parent'],
    groups: [
      ['My child', ['/parent/grades', '/parent/attendance', '/parent/excuse-letters']],
      ['School', ['/parent/announcements', '/parent/memos', '/parent/events', '/parent/messages']],
    ],
    bottom: ['/parent/settings', '/parent/about'],
  },
  teacher: {
    top: ['/teacher'],
    groups: [
      ['My class', ['/teacher/students', '/teacher/attendance', '/teacher/attendance-records', '/teacher/grades', '/teacher/class-summary']],
      ['Communicate', ['/teacher/excuse-letters', '/teacher/announcements', '/teacher/memos', '/teacher/events', '/teacher/messages']],
    ],
    bottom: ['/teacher/settings', '/teacher/about'],
  },
  admin: {
    top: ['/admin'],
    groups: [
      ['Manage', ['/admin/users', '/admin/students', '/admin/grades', '/admin/attendance']],
      ['Communicate', ['/admin/announcements']],
    ],
    bottom: ['/admin/settings', '/admin/about'],
  },
};

console.log('groups, per role, on the phone');
for (const role of ['parent', 'teacher', 'admin']) {
  const items = phoneItems(role);
  const result = groupNav(role, items);
  const want = EXPECTED[role];
  assert(placedOnce(result, items), `${role}: every phone item placed exactly once (${items.length})`);
  assert(same(paths(result.top), want.top), `${role}: Dashboard alone on top`);
  assert(same(paths(result.bottom), want.bottom), `${role}: Settings then About in the bottom group`);
  assert(
    same(result.groups.map((g) => [g.label, paths(g.items)]), want.groups),
    `${role}: groups, labels and order equal the web's (${want.groups.map((g) => g[0]).join(' / ')})`
  );
  assert(result.groups.every((g) => g.label), `${role}: no unlabelled group`);
}

console.log('admin: Backup & Restore is web only');
const adminPhone = groupNav('admin', phoneItems('admin'));
assert(!adminPhone.groups.some((g) => g.label === 'System'), 'phone: the System group is absent');
assert(
  ![...adminPhone.top, ...adminPhone.groups.flatMap((g) => g.items), ...adminPhone.bottom].some((i) => i.to === '/admin/backups'),
  'phone: /admin/backups is in no group'
);
const adminWeb = groupNav('admin', NAV_BY_ROLE.admin);
assert(
  adminWeb.groups.some((g) => g.label === 'System' && same(paths(g.items), ['/admin/backups'])),
  'control: the same file, given the web list, still has System → Backup & Restore'
);

console.log('an item navGroups.js does not name');
const extra = [...phoneItems('teacher'), { to: '/teacher/new-page', label: 'New', icon: 'fa-gear', built: true }];
const withExtra = groupNav('teacher', extra);
const rest = withExtra.groups[withExtra.groups.length - 1];
assert(rest.label === null && same(paths(rest.items), ['/teacher/new-page']), 'lands in an unlabelled group at the end');
assert(placedOnce(withExtra, extra), 'and is still placed exactly once');
assert(isGroupOpen(rest.label, ['Communicate', 'My class'], null), 'the unlabelled group is never folded');
const dropped = { ...withExtra, groups: withExtra.groups.filter((g) => g.label) };
assert(!placedOnce(dropped, extra), 'NEGATIVE CONTROL: a grouping that drops it is caught by the placed-once check');

console.log('the fold state (pp.navGroups)');
assert(NAV_GROUPS_KEY === 'pp.navGroups', 'the storage key is pp.navGroups');
assert(same(parseFolded('not json'), {}), 'unparseable → {} (every group open)');
assert(same(parseFolded('["Communicate"]'), {}), 'an array → {}');
assert(same(parseFolded('null'), {}), 'null → {}');
assert(
  same(parseFolded('{"teacher":["Communicate",3],"parent":"School"}'), { teacher: ['Communicate'] }),
  'keeps string labels in arrays only'
);
let stored = {};
stored = toggleFolded(stored, 'teacher', 'Communicate');
assert(same(foldedFor(stored, 'teacher'), ['Communicate']), 'toggle folds');
stored = toggleFolded(stored, 'parent', 'School');
assert(same(foldedFor(stored, 'teacher'), ['Communicate']), 'per role: folding a parent group leaves the teacher’s alone');
stored = toggleFolded(stored, 'teacher', 'Communicate');
assert(same(foldedFor(stored, 'teacher'), []) && same(foldedFor(stored, 'parent'), ['School']), 'toggle again unfolds');
assert(same(foldedFor({}, 'admin'), []), 'a role with nothing stored has nothing folded');

console.log('the active group is always open, and never written back');
const teacher = groupNav('teacher', phoneItems('teacher'));
assert(activeGroupLabel(teacher.groups, '/teacher/messages') === 'Communicate', 'Messages → Communicate');
assert(activeGroupLabel(teacher.groups, '/teacher') === null, 'the Dashboard is in no group');
assert(activeGroupLabel(teacher.groups, '/teacher/settings') === null, 'Settings is in no group');
assert(isGroupOpen('Communicate', ['Communicate'], 'Communicate'), 'folded AND active → open');
assert(!isGroupOpen('Communicate', ['Communicate'], 'My class'), 'folded, elsewhere → folded');
assert(isGroupOpen('My class', ['Communicate'], 'Communicate'), 'not folded → open');
const before = JSON.stringify(stored);
isGroupOpen('School', foldedFor(stored, 'parent'), 'School');
assert(JSON.stringify(stored) === before, 'deciding "open" leaves the stored state untouched');

console.log('the user card');
const FAKE_LRN = '100000000009'; // not a real learner's; shaped like one
const parentLines = userCardLines({ role: 'parent', name: 'A Parent', login_id: FAKE_LRN });
assert(parentLines.detail === 'Parent', 'parent: the second line is the role alone');
const carries = (lines, id) => lines.name.includes(id) || lines.detail.includes(id);
assert(!carries(parentLines, FAKE_LRN), 'parent: the login id is on neither line');
const nameless = userCardLines({ role: 'parent', name: '', login_id: FAKE_LRN });
assert(nameless.name === '' && !carries(nameless, FAKE_LRN), 'parent with no name: no name, never the login id');
assert(
  carries({ name: FAKE_LRN, detail: 'Parent' }, FAKE_LRN),
  'NEGATIVE CONTROL: a card that fell back to the login id is caught by the same check'
);
assert(userCardLines({ role: 'teacher', name: 'T', login_id: 'TCH-XYZ' }).detail === 'Teacher · TCH-XYZ', 'teacher: role · login id, as on the web');
assert(userCardLines({ role: 'admin', name: 'A', login_id: 'ADM-XYZ' }).detail === 'Admin · ADM-XYZ', 'admin: role · login id');
assert(userCardLines({ role: 'teacher', name: '', login_id: 'TCH-XYZ' }).name === 'TCH-XYZ', 'staff with no name: the login id');

// ---------------------------------------------------------------------------
// THE CARD ON A REAL /auth/me USER (fix round, 2026-09-30). The phone stores
// `api.get('/auth/me', { unwrap: 'user' })` (auth/AuthContext.jsx): the users
// row minus every password key, plus student_first_name, student_last_name,
// grade_level, section and must_change_password — 22 keys, captured from the
// running API for all three roles (keys and types only). Values are made up:
// the parent's login id is shaped like an LRN and is nobody's.
console.log('the card, fed the /auth/me user the phone stores');
const ME_KEYS = [
  'id', 'login_id', 'token_version', 'role', 'status', 'name', 'email', 'email_verified_at',
  'contact_number', 'contact_verified_at', 'profile_pic', 'student_id', 'created_by', 'approved_by',
  'rejection_reason', 'created_at', 'updated_at', 'student_first_name', 'student_last_name',
  'grade_level', 'section', 'must_change_password',
];
function meUser(fields) {
  const base = {
    id: 1, login_id: '', token_version: 0, role: '', status: 'active', name: '', email: 'x@example.com',
    email_verified_at: null, contact_number: '09000000000', contact_verified_at: null, profile_pic: null,
    student_id: null, created_by: 1, approved_by: null, rejection_reason: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    student_first_name: null, student_last_name: null, grade_level: null, section: null,
    must_change_password: 0,
  };
  return { ...base, ...fields };
}
const PARENT_LOGIN = '100000000009';
const ME = {
  parent: meUser({ id: 8, login_id: PARENT_LOGIN, role: 'parent', name: 'Ligaya Halimbawa', student_id: 1037, student_first_name: 'Tala', student_last_name: 'Halimbawa', grade_level: 6, section: 'Malikhain' }),
  teacher: meUser({ id: 2, login_id: 'TCH-001', role: 'teacher', name: 'Maria Santos' }),
  admin: meUser({ id: 1, login_id: 'ADMIN001', role: 'admin', name: 'Principal Admin', created_by: null }),
};
for (const role of ['parent', 'teacher', 'admin']) {
  assert(same(Object.keys(ME[role]), ME_KEYS), `${role}: the fixture carries the real /auth/me keys (22), in the server's order`);
}
const EXPECT_LINES = {
  parent: { name: 'Ligaya Halimbawa', detail: 'Parent' },
  teacher: { name: 'Maria Santos', detail: 'Teacher · TCH-001' },
  admin: { name: 'Principal Admin', detail: 'Admin · ADMIN001' },
};
for (const role of ['parent', 'teacher', 'admin']) {
  const lines = userCardLines(ME[role]);
  assert(same(lines, EXPECT_LINES[role]), `${role}: "${EXPECT_LINES[role].name}" / "${EXPECT_LINES[role].detail}"`);
}
assert(!carries(userCardLines(ME.parent), PARENT_LOGIN), 'parent: the login id on neither line');
const namelessParent = userCardLines({ ...ME.parent, name: '' });
assert(namelessParent.name === '' && namelessParent.detail === 'Parent' && !carries(namelessParent, PARENT_LOGIN), 'parent with no name: no name, "Parent", never the LRN');

// ---------------------------------------------------------------------------
// THE CARD'S LAYOUT REACHES THE PHONE (fix round, 2026-09-30). 6980e06 gave
// the card's Pressable its width through a style FUNCTION —
// `({ pressed }) => ({ flex: 1, minWidth: 0, ... })` — and NativeWind's
// css-interop, which wraps every Pressable (runtime/components.js:
// `cssInterop(Pressable, { className: 'style' })`), merges a non-array style
// as `{ ...declaration }`: a function spreads to `{}`. The Pressable shrank
// to its content, the name column (`flex-1 min-w-0`) got no width, and only
// the fixed-size avatar and the Logout icon showed.
//
// So this runs the REAL interop from node_modules: `react-native` is a stub
// holding only the names the interop touches, and React gets a minimal hook
// dispatcher, because interop() is a hook body (useContext, useState,
// useReducer, useMemo, useEffect). The card's `style` expression is read out
// of DrawerContent.jsx, evaluated, rendered through the interop, and must
// arrive with flex: 1.
console.log('the card Pressable\'s width survives NativeWind\'s interop');
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function loadInterop() {
  const mk = (name) => {
    const f = function () {};
    f.displayName = name;
    return f;
  };
  const known = {
    Platform: { OS: 'android', select: (o) => (o.android !== undefined ? o.android : o.default) },
    Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove() {} }), setColorScheme() {} },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    AccessibilityInfo: { addEventListener: () => ({ remove() {} }), isReduceMotionEnabled: async () => false },
    Dimensions: { get: () => ({ width: 390, height: 800, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove() {} }) },
    PixelRatio: { get: () => 2, getFontScale: () => 1, roundToNearestPixel: (x) => x },
    StyleSheet: { create: (s) => s, flatten: (s) => s, hairlineWidth: 1, absoluteFill: {} },
    PlatformColor: (...a) => ({ platformColor: a }),
    I18nManager: { isRTL: false },
  };
  const made = new Map();
  const rn = new Proxy(known, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key !== 'string') return undefined;
      if (!made.has(key)) made.set(key, mk(key));
      return made.get(key);
    },
  });
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return request === 'react-native' ? 'rn-stub' : resolve.call(this, request, ...rest);
  };
  Module._cache['rn-stub'] = { id: 'rn-stub', filename: 'rn-stub', loaded: true, exports: rn };
  const React = require('react');
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
    useContext: (ctx) => ctx._currentValue,
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useReducer: (reducer, arg, init) => [init ? init(arg) : arg, () => {}],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (v) => ({ current: v }),
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useSyncExternalStore: (_s, get) => get(),
    useDebugValue: () => {},
    useId: () => ':r0:',
  };
  const api = require('react-native-css-interop/dist/runtime/native/api.js');
  api.cssInterop(rn.Pressable, { className: 'style' });
  const Wrapped = api.interopComponents.get(rn.Pressable);
  return (props) => (typeof Wrapped === 'function' ? Wrapped(props, null) : Wrapped.render(props, null)).props.style;
}
const renderPressableStyle = loadInterop();
// What React Native's Pressable would apply: a function called unpressed.
const applied = (style) => {
  const v = typeof style === 'function' ? style({ pressed: false }) : style;
  return Array.isArray(v) ? Object.assign({}, ...v.map(applied)) : v || {};
};
assert(applied(renderPressableStyle({ style: { flex: 1, minWidth: 0 } })).flex === 1, 'control: an OBJECT style reaches the element intact');
assert(
  applied(renderPressableStyle({ style: ({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 }) })).flex === undefined,
  'the hazard itself: a style FUNCTION on a Pressable arrives as {} (why the card lost its width)'
);

// Every `<Pressable …>` opening tag in a source, braces balanced.
function pressableTags(src) {
  const tags = [];
  let i = src.indexOf('<Pressable');
  while (i !== -1) {
    let depth = 0;
    let j = i + '<Pressable'.length;
    for (; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') depth -= 1;
      else if (src[j] === '>' && depth === 0) break;
    }
    tags.push(src.slice(i, j + 1));
    i = src.indexOf('<Pressable', j);
  }
  return tags;
}
function attrExpr(tag, name) {
  const at = tag.indexOf(`${name}={`);
  if (at === -1) return null;
  let depth = 0;
  for (let j = at + name.length + 1; j < tag.length; j += 1) {
    if (tag[j] === '{') depth += 1;
    else if (tag[j] === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(at + name.length + 2, j).trim();
    }
  }
  return null;
}
// The card's width, from the source text as the phone would get it: the
// style expression evaluated (a module-level name resolved from the file),
// rendered through the real interop, then applied.
function cardWidthStyle(src) {
  const card = pressableTags(src).find((tag) => tag.includes('onPress={openAccount}'));
  if (!card) return { found: false };
  const expr = attrExpr(card, 'style');
  if (!expr) return { found: true, style: {} };
  const named = /^[A-Za-z_$][\w$]*$/.test(expr) ? src.match(new RegExp(`const ${expr} = ([^;]+);`)) : null;
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${named ? named[1] : expr});`)();
  return { found: true, style: applied(renderPressableStyle({ style: value })) };
}
function styleFunctionTags(src) {
  return pressableTags(src).filter((tag) => {
    const expr = attrExpr(tag, 'style');
    if (!expr) return false;
    if (/=>/.test(expr) || /^function\b/.test(expr)) return true;
    return /^[A-Za-z_$][\w$]*$/.test(expr) && new RegExp(`const ${expr} = (\\([^)]*\\)|[\\w$]+) =>`).test(src);
  });
}

const drawerSrc = fs.readFileSync(path.join(here, '..', 'src', 'navigation', 'DrawerContent.jsx'), 'utf8');
const card = cardWidthStyle(drawerSrc);
assert(card.found, 'DrawerContent: the card is the Pressable whose onPress is openAccount');
assert(card.style && card.style.flex === 1 && card.style.minWidth === 0, 'DrawerContent: the card Pressable arrives with flex: 1 and minWidth: 0 (the name column has width)');
assert(styleFunctionTags(drawerSrc).length === 0, 'DrawerContent: no Pressable takes a style FUNCTION (the interop drops it)');

// NEGATIVE CONTROL — 6980e06's card, verbatim. The same two checks must go red.
const BUGGY_CARD = `
        <Pressable
          onPress={openAccount}
          accessibilityRole="button"
          accessibilityLabel={\`\${name ? \`\${name}, \` : ''}Account information\`}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.7 : 1 })}
        >`;
const buggy = cardWidthStyle(BUGGY_CARD);
assert(buggy.found && buggy.style.flex === undefined, 'NEGATIVE CONTROL: 6980e06\'s card arrives with no flex — caught');
assert(styleFunctionTags(BUGGY_CARD).length === 1, 'NEGATIVE CONTROL: 6980e06\'s style function is flagged');

console.log(`\nproof-drawer: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
