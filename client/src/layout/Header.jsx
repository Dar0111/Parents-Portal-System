// The page header: the menu button below `md`, the page title, and the
// notification bell. Extracted from Shell on D3 (2026-09-19) so the
// Notifications dispatch had a file of its own to put the bell in; N2 filled
// that slot the same day.
//
// NO USER BLOCK AND NO LOGOUT HERE SINCE feat/ui-polish (2026-09-30): both
// moved to the user card at the bottom of the sidebar and the drawer, so
// there is exactly one Logout on screen. The bell is now the rightmost
// control.
//
// STICKY (D3): `sticky top-0 z-30`. The document is the only scroller; the
// header stays put while <main> scrolls under it. z-30 sits under the mobile
// drawer (z-40) and the Modal backdrop (z-50), so both cover the header.

import NotificationBell from '../components/NotificationBell';

export default function Header({ title, onOpenMenu, drawerOpen = false }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-edge bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenMenu}
          className="rounded-lg border border-edge-strong px-2.5 py-1.5 text-fg-body md:hidden"
        >
          <i className="fa-solid fa-bars" />
        </button>
        <h1 className="truncate text-base font-semibold text-fg">{title}</h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <NotificationBell closeWhen={drawerOpen} />
      </div>
    </header>
  );
}
