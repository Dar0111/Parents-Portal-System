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
  // cannot go and read. Parent and Admin Messages are built: false today, so
  // their unread counts are deliberately invisible until those pages land —
  // at which point flipping `built` makes the badge appear with no change
  // here. See the unread note in Shell below.
  const withBadge = (label) =>
    badge > 0 ? (
      <>
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
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
        className={`${base} cursor-not-allowed text-slate-300`}
      >
        <i className={`fa-solid ${item.icon} w-4 text-center`} />
        <span className="flex-1">{item.label}</span>
        <i className="fa-solid fa-circle-exclamation text-xs text-amber-400" />
      </span>
    );
  }

  if (!item.built) {
    return (
      <span
        title="Not built yet"
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-slate-300`}
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
            ? 'bg-slate-100 font-medium text-slate-900'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
        <div className="px-4 py-5 text-sm font-semibold text-slate-900">Parent&rsquo;s Portal</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-5">
              <span className="text-sm font-semibold text-slate-900">Parent&rsquo;s Portal</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 sm:hidden"
            >
              <i className="fa-solid fa-bars" />
            </button>
            <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium text-slate-900">{user?.name || user?.login_id}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user?.role] || user?.role}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
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
              say so, which is 5g's own failure mode one level out. */}
          <LiveStatus
            // A full reload rather than a per-page refetch: Shell cannot know
            // what the routed page fetches, and a Refresh that silently
            // refreshed only the badge would be its own small lie. Reloading
            // re-runs every fetch on the page and re-attempts the socket.
            onRefresh={() => window.location.reload()}
          />
          <PageTitleContext.Provider value={titleContext}>
            <Outlet />
          </PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
