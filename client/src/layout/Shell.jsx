import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { navForRole, navTitleForPath } from './nav';
import { PageTitleContext } from './usePageTitle';
import SocketProvider from '../realtime/SocketProvider';
import UnreadProvider, { useUnread } from '../realtime/UnreadProvider';
import LiveStatus from '../realtime/LiveStatus';

const ROLE_LABEL = {
  admin: 'Admin',
  teacher: 'Teacher',
  parent: 'Parent',
};

// Three states, not two — see nav.js. `blocked` is a stronger claim than
// `built: false` and takes precedence: an unbuilt page is merely unwritten, a
// blocked one cannot be designed until a school question is answered, and its
// tooltip carries that reason. Exported so the dev gallery can show all three
// side by side without logging in as three different roles.
export function NavItem({ item, onNavigate, badge = 0 }) {
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 transition';

  // The badge renders ONLY on a built item. A count on a dimmed, unclickable
  // nav entry would be worse than no count: it announces something the user
  // cannot go and read. Teacher and Parent Messages are both built, so both
  // carry a live count; admin has no Messages item at all since 2026-09-18,
  // so there is nothing to badge and `UnreadProvider` never fetches for that
  // role. A future role/page that lands built: false inherits this untouched.
  // See the unread note in Shell below.
  const withBadge = (label) =>
    badge > 0 ? (
      <>
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">
          {badge > 99 ? '99+' : badge}
        </span>
      </>
    ) : (
      label
    );

  if (item.blocked) {
    return (
      <span
        title={item.blocked}
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-fg-ghost`}
      >
        <i className={`fa-solid ${item.icon} w-4 text-center`} />
        <span className="flex-1">{item.label}</span>
        <i className="fa-solid fa-circle-exclamation text-xs text-warning-icon" />
      </span>
    );
  }

  if (!item.built) {
    return (
      <span
        title="Not built yet"
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-fg-ghost`}
      >
        <i className={`fa-solid ${item.icon} w-4 text-center`} />
        {item.label}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to.split('/').length === 2}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? 'bg-brand-soft font-medium text-brand'
            : 'text-fg-body hover:bg-surface-subtle hover:text-fg'
        }`
      }
    >
      <i className={`fa-solid ${item.icon} w-4 text-center`} />
      {withBadge(item.label)}
    </NavLink>
  );
}

// The socket lives here, not in a page: a teacher reading Students should still
// have their unread badge update, and a per-page hook would open one connection
// per mounting page. Shell renders exactly while a user is logged in, which is
// exactly the socket's lifetime.
export default function Shell() {
  const { user } = useAuth();
  // The badge is only fetched for a role whose Messages page actually exists.
  const messagesBuilt = Boolean(navForRole(user?.role).find((i) => i.to.endsWith('/messages'))?.built);

  return (
    <SocketProvider>
      <UnreadProvider enabled={messagesBuilt}>
        <ShellChrome />
      </UnreadProvider>
    </SocketProvider>
  );
}

function ShellChrome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Shell owns the page-title state and provides it to the routed page below,
  // so it can read the current value directly instead of consuming a context
  // it is itself providing.
  const [customTitle, setCustomTitle] = useState(null);
  const titleContext = useMemo(() => ({ setTitle: setCustomTitle }), []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const items = navForRole(user?.role);
  // Same test as Shell()'s `enabled` above, derived from the list this
  // component already has rather than threaded down as a prop. It gates the
  // LiveStatus strip: see the 5g note at its render below.
  const messagesBuilt = Boolean(items.find((i) => i.to.endsWith('/messages'))?.built);
  const { unread } = useUnread();
  const title =
    customTitle || navTitleForPath(user?.role, location.pathname) || "Parent's Portal";

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const nav = (
    <nav className="space-y-0.5 px-2 pb-4 text-sm">
      {items.map((item) => (
        <NavItem
          key={item.to}
          item={item}
          onNavigate={() => setMobileNavOpen(false)}
          badge={item.to.endsWith('/messages') ? unread : 0}
        />
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-page">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-edge bg-surface sm:flex">
        <div className="px-4 py-5 text-sm font-semibold text-fg">Parent&rsquo;s Portal</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-backdrop"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between px-4 py-5">
              <span className="text-sm font-semibold text-fg">Parent&rsquo;s Portal</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1 text-fg-faint hover:bg-surface-muted"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-edge bg-surface px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
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
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
            >
              <i className="fa-solid fa-right-from-bracket" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
          {/* CONVENTION 5g, and specifically WHERE the notice belongs: the
              unread badge in the sidebar depends on the live channel and is
              visible on EVERY page, so the notice that the channel is down has
              to be visible on every page too. Confining it to the Messages
              pages — where it started — left a teacher on Students or Grades
              with a badge that had silently stopped updating and nothing to
              say so, which is 5g's own failure mode one level out.

              GATED ON `messagesBuilt` SINCE 2026-09-18, which closes 5g's
              INVERSE — the case the convention left ownerless. 5g's rule is
              "say so wherever something channel-fed is shown"; for a role with
              no Messages item nothing on screen is channel-fed, so the strip
              announced a failure with no consequence the viewer could act on.
              Admin is that role and will stay that way: Admin -> Messages has
              no Figure 5 process and will not be built. This is the whole fix —
              a render condition. `SocketProvider` still connects for every
              role; an admin socket now feeds nothing, which is harmless and is
              recorded rather than optimised away here. */}
          {messagesBuilt ? (
            <LiveStatus
              // A full reload rather than a per-page refetch: Shell cannot know
              // what the routed page fetches, and a Refresh that silently
              // refreshed only the badge would be its own small lie. Reloading
              // re-runs every fetch on the page and re-attempts the socket.
              onRefresh={() => window.location.reload()}
            />
          ) : null}
          <PageTitleContext.Provider value={titleContext}>
            <Outlet />
          </PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
