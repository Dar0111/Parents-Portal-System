import { navForRole } from '../../layout/nav';

// Shell is applied by the layout route in App.jsx, not imported here — every
// page under a role's route tree renders inside it automatically.
//
// This is NOT a feature page and must not become one. It says which sections
// are open and nothing else — no counts, no recent items, no fetch.
//
// The list is DERIVED from nav.js rather than written out, because the
// previous copy ("No modules built yet.") was true when it was written and
// silently became false the moment Announcements shipped. A hardcoded list
// would just move that failure one dispatch later: the next page to land
// flips a `built` flag and forgets this sentence. Deriving it means the flag
// IS the sentence.
//
// `to !== '/parent'` drops Dashboard — unfiltered, this page would list
// itself. `!blocked` is kept even though no parent item is blocked today:
// Attendance was the one blocked item, unblocked 2026-09-09, and a future
// blocked item would be wrong to advertise as open.
//
// The "remaining… as their pages land" sentence is DERIVED, matching Admin and
// Teacher, and this file was the last of the three to get that treatment. It
// rendered unconditionally until 2026-09-18, so from the moment Settings
// landed (2026-09-09) it promised parents more pages were coming when every
// parent page already existed — the same stale-string failure deriving the
// list was meant to prevent, surviving one line below the fix.
export default function ParentDashboard() {
  const items = navForRole('parent').filter((item) => item.to !== '/parent');
  const open = items.filter((item) => item.built && !item.blocked).map((item) => item.label);
  const remaining = items.some((item) => !item.built || item.blocked);

  return (
    <p className="text-sm text-slate-500">
      {open.length ? (
        remaining ? (
          <>
            Open now: {open.join(', ')}. The remaining sidebar items appear in full colour as their
            pages land.
          </>
        ) : (
          <>Open now: {open.join(', ')}.</>
        )
      ) : (
        <>No modules built yet. Sidebar items appear in full colour as their pages land.</>
      )}
    </p>
  );
}
