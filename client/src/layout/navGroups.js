// How the web sidebar GROUPS each role's nav (feat/ui-polish, 2026-09-30).
//
// A SEPARATE FILE ON PURPOSE: layout/nav.js is copied byte for byte to
// mobile/src/navigation/nav.js and `lint:mirrors` proves the two equal, so a
// `group` field there would drag the phone into a web change. The phone's
// drawer is not grouped (decision Q8). nav.js stays the single source of
// WHICH items exist and in what order; this file only says where each one
// sits, keyed by path suffix — the same identity Shell's badges use.
//
//   top     Dashboard, above every group
//   bottom  Settings and About, pinned under the groups, above the user card
//   a label everything else, in nav.js order within its group

const GROUPS_BY_ROLE = {
  admin: [
    { label: 'Manage', paths: ['/users', '/students', '/grades', '/attendance'] },
    { label: 'Communicate', paths: ['/announcements'] },
    { label: 'System', paths: ['/backups'] },
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
