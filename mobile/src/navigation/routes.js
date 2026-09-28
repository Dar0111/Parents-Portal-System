// THE ROUTE MAP — pure, no React Native imports, so scripts/proof-routes.mjs
// can drive it under Node (Stage 5 branch 2, 2026-09-27; MOBILE_CONVENTIONS M9).
//
// Two web-shaped strings arrive on the phone and both are PATHS: the `to` of
// every item in navigation/nav.js (a verbatim copy of the web's) and the
// `link` of every notification row (server/routes/notifications.js builds
// `/${role}/announcements` and friends). A drawer route is therefore NAMED
// BY ITS PATH, and this map says which screen each path opens. A path with
// no entry is UNBUILT on the phone — the drawer renders it dimmed (§6's
// unbuilt state, reintroduced here as CLAUDE.md predicted) and a notification
// pointing at it opens the role's home instead. Nothing here throws on an
// unknown path: a bad link is a dimmed row or the home, never a crash.
//
// The screen NAME is resolved to a component in navigation/AppShell.jsx,
// which is the one file that imports screens. Adding a screen is two lines:
// its path here, its component there — and proof-routes catches a path that
// names a screen AppShell does not know.

// WEB-ONLY PATHS (Darryl, fixed decision: Backup & Restore is web only). The
// verbatim `nav.js` still lists the item — it is a mirror of the web's and
// must stay byte-equal — so the phone HIDES it: the drawer drops a web-only
// item entirely rather than dimming it (a dimmed row would claim the page is
// coming), and a link to it falls back to the role's home. Branch 4.
export const WEB_ONLY = Object.freeze(['/admin/backups']);

export function isWebOnly(path) {
  return WEB_ONLY.includes(path);
}

// path -> screen name. Settings and About are the same screens for every
// role, so all three prefixes route; each role's other pages arrive on its
// own branch and are added here in that branch's commit.
export const ROUTES = Object.freeze({
  '/parent': 'ParentDashboard',
  '/parent/grades': 'ParentGrades',
  '/parent/attendance': 'ParentAttendance',
  '/parent/excuse-letters': 'ParentExcuseLetters',
  '/parent/announcements': 'ParentAnnouncements',
  '/parent/memos': 'ParentMemos',
  '/parent/events': 'ParentEvents',
  '/parent/messages': 'ParentMessages',
  '/parent/settings': 'Settings',
  '/parent/about': 'About',

  // Branch 3: every teacher item.
  '/teacher': 'TeacherDashboard',
  '/teacher/students': 'TeacherStudents',
  '/teacher/attendance': 'TeacherAttendance',
  '/teacher/attendance-records': 'TeacherAttendanceRecords',
  '/teacher/grades': 'TeacherGrades',
  '/teacher/class-summary': 'TeacherClassSummary',
  '/teacher/excuse-letters': 'TeacherExcuseLetters',
  '/teacher/announcements': 'TeacherAnnouncements',
  '/teacher/memos': 'TeacherMemos',
  '/teacher/events': 'TeacherEvents',
  '/teacher/messages': 'TeacherMessages',
  '/teacher/settings': 'Settings',
  '/teacher/about': 'About',

  // Branch 4: every admin item but Backup & Restore, which never arrives
  // (WEB_ONLY above).
  '/admin': 'AdminDashboard',
  '/admin/users': 'AdminUsers',
  '/admin/students': 'AdminStudents',
  '/admin/grades': 'AdminGrades',
  '/admin/attendance': 'AdminAttendance',
  '/admin/announcements': 'AdminAnnouncements',
  '/admin/settings': 'Settings',
  '/admin/about': 'About',
});

// The screen name for a path, or null when the phone has no screen for it.
export function routeFor(path) {
  return ROUTES[path] || null;
}

export function isBuilt(path) {
  return routeFor(path) !== null;
}

// Where a notification's `link` (or any web path) should navigate: the path
// itself when it is a built drawer route, else the role's home path. The
// return value is always a drawer route NAME, so a caller can pass it
// straight to navigation.navigate().
//
// THE LINK MUST BE THIS ROLE'S OWN (branch 3, found by proof-routes): once
// teacher paths were built, "is it built" alone would hand a parent a
// `/teacher/...` name their drawer does not register, and navigate() would
// fail. The server never emits another role's link; this makes that a
// guarantee on the phone rather than an assumption.
export function linkToRoute(link, role) {
  const home = `/${role}`;
  if (typeof link !== 'string' || !(link === home || link.startsWith(`${home}/`))) return home;
  return isBuilt(link) ? link : home;
}
