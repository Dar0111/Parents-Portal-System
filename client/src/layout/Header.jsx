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
//
// EXACTLY 4rem TALL (`h-16`), AND THAT IS A CONTRACT (feat/ui-refresh,
// 2026-10-02): the bell's panel on a phone and the new-message toast are
// both positioned at `top-16`, directly under this bar, and the sidebar's
// brand block is the same height so the two hairlines meet. A fixed height
// means the title cannot wrap — it truncates, the one place a title may.
//
// THE TITLE IS THE PAGE'S ONLY <h1>, in the title face. No routed page
// renders another (the smoke run fails a page with two); a page's own
// headings start at <h2>.

import Button from '../components/Button';
import NotificationBell from '../components/NotificationBell';

export default function Header({ title, onOpenMenu, drawerOpen = false }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-edge bg-surface px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {/* 44px square: the one way into the nav on a phone. */}
        <Button
          variant="secondary"
          size="icon"
          icon="fa-bars"
          aria-label="Open menu"
          onClick={onOpenMenu}
          className="md:hidden"
        />
        <h1 className="truncate font-serif text-lg font-bold text-fg sm:text-xl">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell closeWhen={drawerOpen} />
      </div>
    </header>
  );
}
