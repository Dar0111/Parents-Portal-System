// The page header: title, the signed-in user, Logout, and the hamburger below
// the sm breakpoint. Extracted from Shell on D3 (2026-09-19) so the
// Notifications dispatch has a file of its own to put the bell in — there is
// NO bell slot here yet, deliberately.
//
// STICKY (D3): `sticky top-0 z-30`. The document is the only scroller; the
// header stays put while <main> scrolls under it. z-30 sits under the mobile
// drawer (z-40) and the Modal backdrop (z-50), so both cover the header.

const ROLE_LABEL = {
  admin: 'Admin',
  teacher: 'Teacher',
  parent: 'Parent',
};

export default function Header({ title, user, onOpenMenu, onLogout }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-edge bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenMenu}
          className="rounded-lg border border-edge-strong px-2.5 py-1.5 text-fg-body sm:hidden"
        >
          <i className="fa-solid fa-bars" />
        </button>
        <h1 className="truncate text-base font-semibold text-fg">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden text-right text-sm sm:block">
          <div className="font-medium text-fg">{user?.name || user?.login_id}</div>
          <div className="text-xs text-fg-muted">{ROLE_LABEL[user?.role] || user?.role}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
        >
          <i className="fa-solid fa-right-from-bracket" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
