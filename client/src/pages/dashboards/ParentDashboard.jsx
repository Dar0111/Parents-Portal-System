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
// itself. `!blocked` drops Attendance, which is `built: false` today but
// carries a reason and would be wrong to advertise even after its flag flips.
export default function ParentDashboard() {
  const open = navForRole('parent')
    .filter((item) => item.built && !item.blocked && item.to !== '/parent')
    .map((item) => item.label);

  return (
    <p className="text-sm text-slate-500">
      {open.length ? (
        <>
          Open now: {open.join(', ')}. The remaining sidebar items appear in full colour as their
          pages land.
        </>
      ) : (
        <>No modules built yet. Sidebar items appear in full colour as their pages land.</>
      )}
    </p>
  );
}
