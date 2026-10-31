// How the web sidebar AND the phone's drawer GROUP each role's nav
// (feat/ui-polish, 2026-09-30; the phone since feat/nav-drawer-groups, the
// same day).
//
// A MIRROR: copied byte for byte to mobile/src/navigation/navGroups.js, and
// `lint:mirrors` proves the two equal — edit it here, then copy it. It stays
// a separate file from layout/nav.js, the single source of WHICH items exist
// and in what order; this file only says where each one sits, keyed by path
// suffix — the same identity the badges use. On the phone, Backup & Restore
// and the Activity log are web only, so admin's System group is empty there
// and is dropped below.
//
//   top     Dashboard, above every group
//   bottom  Settings and About, pinned under the groups, above the user card
//   a label everything else, in nav.js order within its group

const GROUPS_BY_ROLE = {
  admin: [
    { label: 'Manage', paths: ['/users', '/students', '/grades', '/attendance', '/assignments'] },
    { label: 'Communicate', paths: ['/announcements', '/messages'] },
    { label: 'System', paths: ['/backups', '/activity-log'] },
  ],
  teacher: [
    { label: 'My class', paths: ['/students', '/attendance', '/attendance-records', '/grades', '/class-summary'] },
    { label: 'Communicate', paths: ['/excuse-letters', '/announcements', '/memos', '/events', '/messages'] },
  ],
  parent: [
    { label: 'My child', paths: ['/grades', '/attendance', '/excuse-letters'] },
    { label: 'School', paths: ['/announcements', '/memos', '/events', '/messages'] },
  ],
};

const BOTTOM_PATHS = ['/settings', '/about'];

// The path after the role prefix: '/teacher/attendance-records' → '/attendance-records',
// '/teacher' → ''. Exact, so '/attendance' never swallows '/attendance-records'.
function suffixOf(to) {
  const i = to.indexOf('/', 1);
  return i === -1 ? '' : to.slice(i);
}

// Returns { top, groups: [{ label, items }], bottom } for the role's nav
// items. An item no group names still shows, under an unlabelled group at
// the end — a new page must never vanish from the sidebar because this file
// was not updated with it.
export function groupNav(role, items) {
  const groups = (GROUPS_BY_ROLE[role] || []).map((g) => ({ label: g.label, items: [] }));
  const top = [];
  const bottom = [];
  const rest = [];
  for (const item of items) {
    const suffix = suffixOf(item.to);
    if (suffix === '') {
      top.push(item);
      continue;
    }
    if (BOTTOM_PATHS.includes(suffix)) {
      bottom.push(item);
      continue;
    }
    const gi = (GROUPS_BY_ROLE[role] || []).findIndex((g) => g.paths.includes(suffix));
    if (gi === -1) rest.push(item);
    else groups[gi].items.push(item);
  }
  const filled = groups.filter((g) => g.items.length);
  if (rest.length) filled.push({ label: null, items: rest });
  return { top, groups: filled, bottom };
}
