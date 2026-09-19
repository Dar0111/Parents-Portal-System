import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';
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
// Narrow screens: below `sm` (the breakpoint Shell uses for its own sidebar)
// the tab card stacks ABOVE the panel as a full-width list — same NavLinks,
// no second component.

export default function SettingsLayout() {
  usePageTitle('Settings');
  const { user } = useAuth();
  const tabs = settingsTabsForRole(user?.role);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <nav
        aria-label="Settings sections"
        className="rounded-lg border border-edge bg-surface p-2 sm:w-[14.5rem] sm:shrink-0"
      >
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.to === ''}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-fg-body hover:bg-surface-subtle hover:text-fg'
                  }`
                }
              >
                <i className={`fa-solid ${tab.icon} w-4 text-center`} aria-hidden="true" />
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0 flex-1 rounded-lg border border-edge bg-surface p-4 sm:max-w-[42.5rem] sm:p-6">
        <Outlet />
      </section>
    </div>
  );
}
