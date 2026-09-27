// PROOF — the route map (Stage 5 branch 2, MOBILE_CONVENTIONS M9). Drives
// src/navigation/routes.js and the verbatim nav.js copy under Node. What it
// proves: every nav path resolves to a known screen name or to "unbuilt",
// never throws; every notification link shape the server emits for a parent
// resolves to a drawer path; an unbuilt link falls back to the role's home.
// What it cannot: that AppShell has a component for each name — that is
// the phone (a missing one renders the row dimmed, by construction).
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-routes.mjs
import { NAV_BY_ROLE } from '../src/navigation/nav.js';
import { ROUTES, isBuilt, linkToRoute, routeFor } from '../src/navigation/routes.js';

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

const KNOWN_SCREENS = new Set([
  'RoleHome',
  'Settings',
  'About',
  'ParentDashboard',
  'ParentGrades',
  'ParentAttendance',
  'ParentExcuseLetters',
  'ParentAnnouncements',
  'ParentMemos',
  'ParentEvents',
  'ParentMessages',
]);

console.log('nav paths');
const allItems = Object.entries(NAV_BY_ROLE).flatMap(([role, items]) => items.map((i) => ({ role, ...i })));
assert(
  allItems.every((i) => routeFor(i.to) === null || KNOWN_SCREENS.has(routeFor(i.to))),
  `every nav path (${allItems.length}) resolves to a known screen or to unbuilt, never something else`
);
assert(Object.values(ROUTES).every((name) => KNOWN_SCREENS.has(name)), 'every routed name is a screen AppShell knows');
for (const role of ['parent', 'teacher', 'admin']) {
  assert(isBuilt(`/${role}`) && isBuilt(`/${role}/settings`) && isBuilt(`/${role}/about`), `${role}: home, Settings and About are built`);
}
const parentBuilt = NAV_BY_ROLE.parent.filter((i) => isBuilt(i.to)).map((i) => i.label);
console.log(`  parent built: ${parentBuilt.join(', ')}`);
assert(parentBuilt.length === NAV_BY_ROLE.parent.length, `every parent nav item is built (${parentBuilt.length} of ${NAV_BY_ROLE.parent.length})`);
assert(
  NAV_BY_ROLE.teacher.filter((i) => isBuilt(i.to)).length === 3 && NAV_BY_ROLE.admin.filter((i) => isBuilt(i.to)).length === 3,
  'teacher and admin have exactly home, Settings and About built — their pages are their own branches'
);

console.log('notification links (server/routes/notifications.js shapes, role parent)');
for (const link of ['/parent/announcements', '/parent/memos', '/parent/events', '/parent/excuse-letters', '/parent/grades']) {
  const route = linkToRoute(link, 'parent');
  assert(route === (isBuilt(link) ? link : '/parent'), `${link} → ${route} (${isBuilt(link) ? 'its own screen' : 'home until built'})`);
}
assert(linkToRoute('/parent', 'parent') === '/parent', 'the fallback link opens the home');
assert(linkToRoute('/teacher/excuse-letters', 'parent') === '/parent', "another role's link opens this role's home, not that role's screen");
assert(linkToRoute(undefined, 'parent') === '/parent' && linkToRoute('nonsense', 'parent') === '/parent', 'a missing or malformed link never throws');

console.log(`\nproof-routes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
