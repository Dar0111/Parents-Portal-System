import { navForRole } from '../../layout/nav';

// Shell is applied by the layout route in App.jsx, not imported here — every
// page under a role's route tree renders inside it automatically.
//
// This is NOT a feature page and must not become one. It says which sections
// are open and nothing else — no counts, no recent items, no fetch.
//
// Derived from nav.js the same way TeacherDashboard and ParentDashboard
// are. "No modules built yet." was true when Stage 2 shipped and would
// silently become false the moment Users landed if the sentence stayed
// hardcoded.
//
// `to !== '/admin'` drops Dashboard — unfiltered, this page would list
// itself. The remaining-pages sentence is itself derived: once every
// non-dashboard item is built, claiming remaining pages would be the
// same stale-string failure this rewrite exists to prevent.
export default function AdminDashboard() {
  const items = navForRole('admin').filter((item) => item.to !== '/admin');
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
