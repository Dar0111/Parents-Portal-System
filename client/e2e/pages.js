// Every URL the smoke run visits, per role.
//
// TAKEN FROM `src/App.jsx` AND `src/layout/nav.js`, not from memory — the
// nav counts in CLAUDE.md were stale when this was written (it said teacher
// had 11 items; it has 12, because CR3 added Class summary and nobody
// updated the line). A list typed from recollection would have inherited
// that.
//
// WHAT IS DELIBERATELY NOT HERE, and each exclusion is a rule:
//
//   messages/:userId   — IT WRITES ON LOAD. Both thread pages call
//                        PATCH /messages/read-all/:otherId when any message
//                        is unread (parent/MessageThreadPage.jsx:83,
//                        teacher/MessageThreadPage.jsx:121). A read-only
//                        smoke run may not visit it. If detail routes are
//                        ever added, THIS ONE STAYS OUT or is declared a
//                        writer.
//   every other :id    — needs fixtures. On the Seeded baseline there is
//                        nothing to open, so a visit would prove only that
//                        an empty state renders.
//   /dev/ui            — the gallery, not a role-facing page.
//   /login, /forgot-password, /change-password — outside Shell, no sidebar,
//                        and the last one is reachable only under a forced
//                        password change.
//
// The notification bell is a READ. `NotificationBell.jsx:136` patches
// `/notifications/:id/read` inside `openRow()` — on a CLICK, not on open —
// so opening the panel writes nothing. The suite does not click it anyway.

export const PAGES = {
  admin: [
    '/admin',
    '/admin/users',
    '/admin/students',
    '/admin/grades',
    '/admin/attendance',
    '/admin/announcements',
    '/admin/settings',
    '/admin/settings/account',
    '/admin/settings/password',
    '/admin/settings/personalization',
    // Visiting is a read: the page LISTS backups and orphaned files. Nothing
    // here is ever clicked — Create, Download, Delete and Restore are all
    // writes, and Restore drops the database.
    '/admin/backups',
  ],

  teacher: [
    '/teacher',
    '/teacher/students',
    '/teacher/attendance',
    '/teacher/attendance-records',
    '/teacher/grades',
    '/teacher/class-summary',
    '/teacher/excuse-letters',
    '/teacher/announcements',
    '/teacher/memos',
    '/teacher/events',
    '/teacher/messages',
    '/teacher/settings',
    '/teacher/settings/password',
    '/teacher/settings/personalization',
  ],

  parent: [
    '/parent',
    '/parent/grades',
    '/parent/attendance',
    '/parent/excuse-letters',
    '/parent/announcements',
    '/parent/memos',
    '/parent/events',
    '/parent/messages',
    '/parent/settings',
    '/parent/settings/password',
    '/parent/settings/personalization',
  ],
};

// How a person is named in a test title and in a report. NEVER a login id —
// a parent's login_id IS their child's LRN (§5c), and a test name ends up in
// logs, terminals and screenshots.
export const WHO = {
  admin: 'admin',
  teacher: "Nino's adviser",
  parent: "Nino's parent",
};

export const WIDTHS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: '390px', viewport: { width: 390, height: 844 } },
];

export const THEMES = ['light', 'dark'];
