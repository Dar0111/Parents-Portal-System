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
// `built: false` means UNWRITTEN, never REFUSED. A page the project has
// decided against does not belong here at all: dimmed forever, it advertises
// something nobody is coming back for. That is why admin lost Sections,
// Excuse Letters, Memos, Events and Messages on 2026-09-18 (Darryl) rather
// than keeping them dimmed — see CLAUDE.md -> ADMIN SCOPE AUDIT -> SCOPE
// DECISION (2026-09-18), which supersedes one line of the 2026-09-13 decision.
// Memos went with them because Admin -> Announcements is the only place a memo
// can ever be written, and that page says so itself.
//
// NO ROLE CURRENTLY HAS A `built: false` ITEM, and that is not the same as the
// state being retired: Stage 5 and any future page will reintroduce it, Shell
// still renders it, and /dev/ui still demonstrates it. Do not delete the
// branch because nothing in production exercises it today.
//
// `blocked: '<reason>'` is a STRONGER statement than `built: false` and the two
// must not be conflated: unbuilt means nobody has written it yet, blocked means
// it CANNOT be designed until an external question is answered. Parent ->
// Attendance was the only blocked item. It was unblocked 2026-09-09 by showing
// raw counts only; the school answered the rate question 2026-09-13 (Late =
// present, Excused = absent), so the page now also shows "Present on recorded
// days" (see CLAUDE.md). Teacher attendance encoding was never blocked and is
// now built.
// Shell renders blocked items with the reason as their tooltip; blocked implies
// not built and takes precedence in that rendering.

export const NAV_BY_ROLE = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: 'fa-gauge', built: true },
    { to: '/teacher/students', label: 'Students', icon: 'fa-user-graduate', built: true },
    { to: '/teacher/attendance', label: 'Attendance', icon: 'fa-clipboard-user', built: true },
    { to: '/teacher/attendance-records', label: 'Attendance records', icon: 'fa-clock-rotate-left', built: true },
    { to: '/teacher/grades', label: 'Grades', icon: 'fa-chart-simple', built: true },
    // BUILT FOR EVERY TEACHER, not only advisers (CR3). This file has three
    // states — built, blocked, unbuilt (§6) — and none of them means "exists
    // but not for you"; inventing a fourth for one page would be a real
    // convention change. A teacher who advises no section gets a page that
    // explains itself, which is better than a dimmed row with a tooltip.
    { to: '/teacher/class-summary', label: 'Class summary', icon: 'fa-table-list', built: true },
    { to: '/teacher/excuse-letters', label: 'Excuse Letters', icon: 'fa-envelope-open-text', built: true },
    { to: '/teacher/announcements', label: 'Announcements', icon: 'fa-bullhorn', built: true },
    { to: '/teacher/memos', label: 'Memos', icon: 'fa-file-lines', built: true },
    { to: '/teacher/events', label: 'Events', icon: 'fa-calendar-days', built: true },
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
    { to: '/parent/messages', label: 'Messages', icon: 'fa-comments', built: true },
    { to: '/parent/settings', label: 'Settings', icon: 'fa-gear', built: true },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'fa-gauge', built: true },
    { to: '/admin/users', label: 'Users', icon: 'fa-users-gear', built: true },
    { to: '/admin/students', label: 'Students', icon: 'fa-user-graduate', built: true },
    { to: '/admin/grades', label: 'Grades', icon: 'fa-chart-simple', built: true },
    { to: '/admin/attendance', label: 'Attendance', icon: 'fa-clipboard-user', built: true },
    { to: '/admin/announcements', label: 'Announcements', icon: 'fa-bullhorn', built: true },
    { to: '/admin/settings', label: 'Settings', icon: 'fa-gear', built: true },
    { to: '/admin/backups', label: 'Backup & Restore', icon: 'fa-database', built: true },
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
