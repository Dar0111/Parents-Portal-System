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
import { ROUTES, isBuilt, isWebOnly, linkToRoute, routeFor } from '../src/navigation/routes.js';

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
  'TeacherDashboard',
  'TeacherStudents',
  'TeacherExcuseLetters',
  'TeacherAnnouncements',
  'TeacherMemos',
  'TeacherEvents',
  'TeacherMessages',
  'TeacherAttendance',
  'TeacherAttendanceRecords',
  'TeacherGrades',
  'TeacherClassSummary',
  'AdminDashboard',
  'AdminUsers',
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
// Branch 3 complete: every teacher item, the second half's four included.
const SECOND_HALF = ['/teacher/attendance', '/teacher/attendance-records', '/teacher/grades', '/teacher/class-summary'];
const teacherBuilt = NAV_BY_ROLE.teacher.filter((i) => isBuilt(i.to));
console.log(`  teacher built: ${teacherBuilt.map((i) => i.label).join(', ')}`);
assert(teacherBuilt.length === NAV_BY_ROLE.teacher.length, `every teacher nav item is built (${teacherBuilt.length} of ${NAV_BY_ROLE.teacher.length})`);
assert(SECOND_HALF.every((p) => routeFor(p) !== null), 'teacher: Attendance, Attendance records, Grades and Class summary route to their screens');
// Branch 4, first half: Dashboard, Users, Settings, About. The second half's
// four are named, so a premature route fails here; Backup & Restore is
// WEB ONLY — never routed, and dropped from the drawer rather than dimmed.
const ADMIN_LATER = ['/admin/students', '/admin/grades', '/admin/attendance', '/admin/announcements'];
const adminVisible = NAV_BY_ROLE.admin.filter((i) => !isWebOnly(i.to));
const adminBuilt = adminVisible.filter((i) => isBuilt(i.to));
console.log(`  admin on the phone: ${adminVisible.map((i) => i.label).join(', ')}`);
assert(adminVisible.length === 8 && adminVisible.every((i) => i.to !== '/admin/backups'), 'admin shows eight items; Backup & Restore is not one of them');
assert(isWebOnly('/admin/backups') && !isBuilt('/admin/backups'), 'Backup & Restore is web-only and has no screen');
assert(adminBuilt.map((i) => i.label).join(',') === 'Dashboard,Users,Settings,About', 'admin first half: Dashboard, Users, Settings and About are built');
assert(ADMIN_LATER.every((p) => !isBuilt(p)), 'admin: Students, Grades, Attendance and Announcements are still unbuilt (dimmed)');

console.log('notification links (role admin)');
assert(linkToRoute('/admin/users', 'admin') === '/admin/users', '/admin/users (parent_pending) → its own screen');
assert(linkToRoute('/admin/backups', 'admin') === '/admin', 'a link to the web-only Backup & Restore opens the admin home');

console.log('notification links (role teacher)');
for (const link of ['/teacher/announcements', '/teacher/memos', '/teacher/events', '/teacher/excuse-letters']) {
  assert(linkToRoute(link, 'teacher') === link, `${link} → its own screen`);
}

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
