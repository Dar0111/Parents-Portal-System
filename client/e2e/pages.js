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

// FIVE ROLES, not three (2026-09-24). Key Stage 1 is its own grading world —
// descriptive letters, no general average, no transmutation — so a sweep that
// only ever saw Nino's Grade 1 card had never rendered a NUMERICAL report
// card, a general average, or a class with more than one learner in it. The
// two added accounts are the Grade 6 pair.
//
// `teacher` and `teacher2` share a page list, as do `parent` and `parent2`:
// the ROUTES are per role, the DATA behind them is what differs, and that is
// exactly what the second account is for.
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
    '/admin/about',
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
    '/teacher/about',
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
    '/parent/about',
  ],
};

// The Grade 6 pair walk the same routes. Assigned rather than retyped, so a
// route added to one is added to both and they cannot drift apart.
PAGES.teacher2 = PAGES.teacher;
PAGES.parent2 = PAGES.parent;

// How a person is named in a test title and in a report. NEVER a login id —
// a parent's login_id IS their child's LRN (§5c), and a test name ends up in
// logs, terminals and screenshots.
//
// BOTH PARENTS ARE NAMED "Ashley Geguiera" in the seed — Marwin's account and
// Jea's — so a real name would be AMBIGUOUS here as well as unsafe. Naming
// them by their child is the label that is both unambiguous and §5c-clean,
// and it is what the reports already use. (Seed names are a BEFORE THE PARENT
// DEMO item in their own right.)
export const WHO = {
  admin: 'admin',
  teacher: "Nino's adviser",
  parent: "Nino's parent",
  teacher2: "Marwin's adviser",
  parent2: "Marwin's parent",
};

export const WIDTHS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: '390px', viewport: { width: 390, height: 844 } },
];

export const THEMES = ['light', 'dark'];
