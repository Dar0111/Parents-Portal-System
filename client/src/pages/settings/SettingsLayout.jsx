import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';
import { cardClass } from '../../components/buttonClass';
import Reveal from '../../motion/Reveal';
import { settingsTabsForRole } from './tabs';

// Settings, all three roles — "Option A" (Darryl, 2026-09-18): a left column
// of section tabs (a card, ~232px) and the active section's panel to its
// right (a card, max ~680px). One layout, shared sections; only the tab list
// and the Account information content differ by role.
//
// TABS ARE SUB-ROUTES, not in-page state: /<role>/settings (index),
// /<role>/settings/password, /<role>/settings/personalization, and for admin
// /<role>/settings/account with School settings as the index. A deep link
// opens the right tab, the back button returns to the previous tab, a refresh
// keeps it, and Expo's nested navigator maps 1:1 onto the same names. Segments
// are fixed words — never an LRN (§5c). Shell already handles this depth:
// navTitleForPath matches `startsWith(item.to + '/')` so the header stays
// "Settings", and the sidebar NavLink has `end` false at depth three.
//
// DO NOT add tabs for Notifications (comes with the notifications dispatch)
// or Security & policy (waits for a Data Privacy Notice, which does not
// exist) — and do not show them disabled. A dimmed tab advertises a page that
// was decided against (§6's reasoning for the admin nav).
//
// Narrow screens: below `lg` the tab card stacks ABOVE the panel as a
// full-width list — same NavLinks, no second component.
//
// THE ENTRANCE IS THE TAB LIST'S, ONCE (feat/ui-refresh): `Reveal` IS the
// <nav>, so arriving on Settings plays it and moving between tabs does not.
// IT MUST NOT WRAP <Outlet />, and the sections under it carry none of their
// own: Change password and Account information each render a Modal, Modal
// renders INLINE (no portal), and an entrance puts a transform on its element
// while it runs — which makes that element the containing block of the
// dialog's fixed backdrop. Every other page keeps its dialogs beside its
// Reveal for the same reason; here the dialogs live inside the panel, so the
// panel is the part that stays still.

export default function SettingsLayout() {
  usePageTitle('Settings');
  const { user } = useAuth();
  const tabs = settingsTabsForRole(user?.role);

  // `lg:`, NOT `md:` (feat/ui-refresh, 2026-10-02) — UI-C2's own rule, measured
  // again. The nav is a fixed 14.5rem and cannot give width back. UI-C2 moved
  // the row from `sm:` to `md:` because at 640px the panel beside it got about
  // 350px and Personalization squeezed to one or two words a line. Shell's
  // sidebar now appears at that same `md`, always 16rem wide, so the sum at a
  // 768px window became
  //
  //     768 - 256 sidebar - 48 padding = 464 of Settings
  //     464 - 232 nav - 16 gap         = a 216px panel
  //
  // — the same squeeze, back, and worse. At `lg` (1024px) it is
  // 1024 - 256 - 64 = 704, which leaves the panel 456px. Under `lg` the row
  // stacks, which is the readable layout; a 200%-zoomed desktop lands there
  // too. §5a-vi: measure the PANEL, not the window.
  //
  // A VIEWPORT BREAKPOINT, NOT A CONTAINER QUERY, on purpose. Measuring this
  // container (`@container`) reads better, but the element that carries it
  // would wrap <Outlet />, and Modal renders INLINE, not through a portal: in
  // a browser where a query container also takes layout containment, that
  // element becomes the containing block of the dialog's `position: fixed`
  // backdrop, and Change password's and Remove photo's dialogs would centre
  // on this page's height instead of the screen. ReportCard's container is
  // safe for the opposite reason — its dialog lives outside it.
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Reveal as="nav" aria-label="Settings sections" className={`${cardClass} p-2 lg:w-[14.5rem] lg:shrink-0`}>
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              {/* The active tab is told apart by weight as well as colour;
                  NavLink adds aria-current="page" itself. `min-h-11` is the
                  44px touch target, and a label that wraps at the Large
                  text size grows the row instead of clipping. */}
              <NavLink
                to={tab.to}
                end={tab.to === ''}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent ${
                    isActive
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-fg-body hover:bg-surface-muted hover:text-fg'
                  }`
                }
              >
                {/* The flex is on the span, never on the `fa-solid` element. */}
                <span aria-hidden="true" className="flex w-5 shrink-0 items-center justify-center">
                  <i className={`fa-solid ${tab.icon}`} />
                </span>
                <span className="min-w-0">{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </Reveal>

      <section className={`${cardClass} min-w-0 flex-1 p-5 sm:p-6 lg:max-w-[42.5rem]`}>
        <Outlet />
      </section>
    </div>
  );
}
