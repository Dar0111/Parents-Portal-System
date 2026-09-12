// Single source of truth for per-role sidebar navigation.
//
// Shell.jsx reads this by the logged-in user's role. Three copies of this list
// (one per dashboard) would have to stay in agreement with three copies of the
// route table in App.jsx, so it lives here for the same reason auth/roles.js
// centralizes role -> home path.
//
// `built: false` marks a Stage 4 page that has no route yet. Shell renders
// those dimmed and non-clickable rather than linking into the catch-all
// redirect, so the nav is an honest picture of what exists. Flip the flag to
// true in the same dispatch that adds the page's route — that is the one step
// that must not be forgotten when a page lands.
//
// `blocked: '<reason>'` is a STRONGER statement than `built: false` and the two
// must not be conflated: unbuilt means nobody has written it yet, blocked means
// it CANNOT be designed until an external question is answered. Parent ->
// Attendance was the only blocked item; it is no longer blocked because the
// page shows raw counts, not a rate (the formula is still unanswered — see
// CLAUDE.md). Teacher attendance encoding was never blocked and is now built.
// Shell renders blocked items with the reason as their tooltip; blocked implies
// not built and takes precedence in that rendering.

export const NAV_BY_ROLE = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: 'fa-gauge', built: true },
    { to: '/teacher/students', label: 'Students', icon: 'fa-user-graduate', built: true },
    { to: '/teacher/attendance', label: 'Attendance', icon: 'fa-clipboard-user', built: true },
    { to: '/teacher/attendance-records', label: 'Attendance records', icon: 'fa-clock-rotate-left', built: true },
    { to: '/teacher/grades', label: 'Grades', icon: 'fa-chart-simple', built: true },
    { to: '/teacher/excuse-letters', label: 'Excuse Letters', icon: 'fa-envelope-open-text', built: true },
    { to: '/teacher/announcements', label: 'Announcements', icon: 'fa-bullhorn', built: true },
    { to: '/teacher/memos', label: 'Memos', icon: 'fa-file-lines', built: true },
    { to: '/teacher/events', label: 'Events', icon: 'fa-calendar-days', built: true },
    { to: '/teacher/contributions', label: 'Contributions', icon: 'fa-peso-sign', built: true },
    { to: '/teacher/messages', label: 'Messages', icon: 'fa-comments', built: true },
    { to: '/teacher/settings', label: 'Settings', icon: 'fa-gear', built: true },
  ],
  parent: [
    { to: '/parent', label: 'Dashboard', icon: 'fa-gauge', built: true },
    { to: '/parent/grades', label: 'Grades', icon: 'fa-chart-simple', built: true },
    { to: '/parent/attendance', label: 'Attendance', icon: 'fa-clipboard-user', built: true },
    { to: '/parent/excuse-letters', label: 'Excuse Letters', icon: 'fa-envelope-open-text', built: true },
    { to: '/parent/announcements', label: 'Announcements', icon: 'fa-bullhorn', built: true },
    { to: '/parent/memos', label: 'Memos', icon: 'fa-file-lines', built: true },
    { to: '/parent/events', label: 'Events', icon: 'fa-calendar-days', built: true },
    { to: '/parent/contributions', label: 'Contributions', icon: 'fa-peso-sign', built: true },
    { to: '/parent/messages', label: 'Messages', icon: 'fa-comments', built: true },
    { to: '/parent/settings', label: 'Settings', icon: 'fa-gear', built: true },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'fa-gauge', built: true },
    { to: '/admin/users', label: 'Users', icon: 'fa-users-gear', built: true },
    { to: '/admin/students', label: 'Students', icon: 'fa-user-graduate', built: false },
    { to: '/admin/sections', label: 'Sections', icon: 'fa-layer-group', built: false },
    { to: '/admin/grades', label: 'Grades', icon: 'fa-chart-simple', built: false },
    { to: '/admin/attendance', label: 'Attendance', icon: 'fa-clipboard-user', built: false },
    { to: '/admin/excuse-letters', label: 'Excuse Letters', icon: 'fa-envelope-open-text', built: false },
    { to: '/admin/announcements', label: 'Announcements', icon: 'fa-bullhorn', built: false },
    { to: '/admin/memos', label: 'Memos', icon: 'fa-file-lines', built: false },
    { to: '/admin/events', label: 'Events', icon: 'fa-calendar-days', built: false },
    { to: '/admin/contributions', label: 'Contributions', icon: 'fa-peso-sign', built: false },
    { to: '/admin/messages', label: 'Messages', icon: 'fa-comments', built: false },
    { to: '/admin/settings', label: 'Settings', icon: 'fa-gear', built: false },
    { to: '/admin/backups', label: 'Backup & Restore', icon: 'fa-database', built: false },
  ],
};

export function navForRole(role) {
  return NAV_BY_ROLE[role] || [];
}

// Longest-prefix match, so /teacher/grades/12 still resolves to the Grades
// item rather than falling back to the role's index item. A page whose title
// should not come from the nav at all overrides it with usePageTitle().
export function navTitleForPath(role, pathname) {
  const items = navForRole(role);
  let best = null;
  for (const item of items) {
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best?.label || null;
}
