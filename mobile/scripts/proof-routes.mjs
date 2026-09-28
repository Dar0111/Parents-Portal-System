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
  'AdminStudents',
  'AdminGrades',
  'AdminAttendance',
  'AdminAnnouncements',
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
// Branch 4 complete: all eight visible admin items built (at its checkpoint
// the second half's four were asserted unbuilt). Backup & Restore is WEB
// ONLY — never routed, and dropped from the drawer rather than dimmed.
const SECOND_HALF_ADMIN = ['/admin/students', '/admin/grades', '/admin/attendance', '/admin/announcements'];
const adminVisible = NAV_BY_ROLE.admin.filter((i) => !isWebOnly(i.to));
const adminBuilt = adminVisible.filter((i) => isBuilt(i.to));
console.log(`  admin on the phone: ${adminVisible.map((i) => i.label).join(', ')}`);
assert(adminVisible.length === 8 && adminVisible.every((i) => i.to !== '/admin/backups'), 'admin shows eight items; Backup & Restore is not one of them');
assert(isWebOnly('/admin/backups') && !isBuilt('/admin/backups'), 'Backup & Restore is web-only and has no screen');
assert(adminBuilt.length === adminVisible.length, `every visible admin item is built (${adminBuilt.length} of ${adminVisible.length})`);
assert(SECOND_HALF_ADMIN.every((p) => isBuilt(p)), 'admin: Students, Grades, Attendance and Announcements route to their screens');

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

// STACK RETURNS (fix/mobile-popto, M16). React Navigation 7's StackRouter
// goes back to an existing route only when it is the current one or `pop`
// is set, so a modal returning with navigate('Main', …) PUSHES a second
// drawer. These drive the phone's own router: the first documents the
// library behaviour (red if an upgrade changes it), the next two are the
// fix, and the scans hold every screen to it.
console.log('stack returns (the real @react-navigation/routers StackRouter)');
const { CommonActions, StackActions, StackRouter } = await import('@react-navigation/routers');
const fs = await import('node:fs');
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');
const stack = StackRouter({});
function stackOf(names) {
  return {
    stale: false,
    type: 'stack',
    key: 'stack-root',
    index: names.length - 1,
    routeNames: [...new Set(names)],
    preloadedRoutes: [],
    routes: names.map((name, i) => ({ key: `${name}-${i}`, name })),
  };
}
function apply(state, action) {
  return stack.getStateForAction(state, action, { routeNames: state.routeNames, routeParamList: {}, routeGetIdList: {} });
}
const modal = stackOf(['Main', 'GradeLock']);
const pushed = apply(modal, CommonActions.navigate('Main', { screen: '/admin/grades', params: { notice: 'x' } }));
assert(pushed.routes.filter((r) => r.name === 'Main').length === 2, "navigate('Main', …) from a modal pushes a SECOND drawer (the library behaviour the fix exists for)");
const back = apply(modal, StackActions.popTo('Main', { screen: '/admin/grades', params: { notice: 'x' } }));
assert(back.routes.length === 1 && back.routes[0].key === 'Main-0', "popTo('Main', …) leaves one drawer, the original key");
const login = apply(stackOf(['Login', 'ForgotPassword']), StackActions.popTo('Login'));
assert(login.routes.length === 1 && login.routes[0].key === 'Login-0', "popTo('Login') from Forgot password leaves one Login, the original key");

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(path.join(dir, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const hits = (needle) => sourceFiles(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes(needle)).map((f) => path.relative(SRC, f));
const mainHits = hits("navigate('Main'");
const loginHits = hits("navigate('Login'");
assert(mainHits.length === 0, `0 navigate('Main' calls in mobile/src${mainHits.length ? ` — found in ${mainHits.join(', ')}` : ''}`);
assert(loginHits.length === 0, `0 navigate('Login' calls in mobile/src${loginHits.length ? ` — found in ${loginHits.join(', ')}` : ''}`);

// A `screenLayout` is CALLED as a plain function inside the navigator's
// render (useDescriptors), so a hook in it joins the navigator's hook list
// and the list changes length on every push / pop (B1, 2026-09-29). Every
// site must name a module-level function, and that function calls no hook.
const layoutSites = sourceFiles(SRC).flatMap((f) => {
  const text = fs.readFileSync(f, 'utf8');
  const all = text.match(/screenLayout=\{/g) || [];
  const named = [...text.matchAll(/screenLayout=\{(\w+)\}/g)].map((m) => m[1]);
  return all.map((_, i) => {
    const name = named[i];
    const body = name ? (text.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{\\r?\\n([\\s\\S]*?)\\r?\\n\\}`)) || [])[1] : undefined;
    return { file: path.relative(SRC, f), name, body };
  });
});
const badLayouts = layoutSites.filter((s) => !s.name || s.body === undefined || /\buse[A-Z]\w*\(/.test(s.body));
assert(layoutSites.length >= 3 && badLayouts.length === 0,
  `every screenLayout (${layoutSites.length}) names a module-level function that calls no hook${badLayouts.length ? ` — ${badLayouts.map((s) => `${s.file}: ${s.name || 'inline'}`).join(', ')}` : ''}`);

// Every drawer dashboard shows what other screens write, and `popTo` returns
// to the same, still-mounted instance — so each re-fetches on focus (M14,
// P1, 2026-09-29), and parent and teacher skip the first focus, which is the
// mount useCard has already fetched.
const dashboards = ['parent', 'teacher', 'admin'].map((role) => {
  const text = fs.readFileSync(path.join(SRC, 'screens', role, 'DashboardScreen.jsx'), 'utf8');
  return { role, focus: /useFocusEffect\(/.test(text), skipsFirst: /firstFocus\.current/.test(text) };
});
const notRefetching = dashboards.filter((x) => !x.focus || (x.role !== 'admin' && !x.skipsFirst)).map((x) => x.role);
assert(notRefetching.length === 0, `parent, teacher and admin dashboards re-fetch on focus; parent and teacher skip the mount's focus${notRefetching.length ? ` — not: ${notRefetching.join(', ')}` : ''}`);

console.log(`\nproof-routes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
