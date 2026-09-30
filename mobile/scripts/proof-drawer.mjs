// PROOF — the grouped drawer (feat/nav-drawer-groups, MOBILE_CONVENTIONS M19).
// Drives the verbatim navGroups.js copy, nav.js, routes.js and the drawer's
// pure rules in drawerFold.js under Node. What it proves: every phone item is
// placed exactly once, in the web's groups and order; admin's System group
// is gone on the phone with Backup & Restore; the fold state parses safely,
// toggles per role, and never folds the active group; a parent's card never
// carries the login id. What it cannot: how the drawer looks or that a tap
// folds — that is the phone (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-drawer.mjs
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

console.log(`\nproof-drawer: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
