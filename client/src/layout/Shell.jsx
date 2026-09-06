import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { navForRole, navTitleForPath } from './nav';
import { PageTitleContext } from './usePageTitle';

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
export function NavItem({ item, onNavigate }) {
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 transition';

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
      {item.label}
    </NavLink>
  );
}

export default function Shell() {
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
  const title =
    customTitle || navTitleForPath(user?.role, location.pathname) || "Parent's Portal";

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const nav = (
    <nav className="space-y-0.5 px-2 pb-4 text-sm">
      {items.map((item) => (
        <NavItem key={item.to} item={item} onNavigate={() => setMobileNavOpen(false)} />
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

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <PageTitleContext.Provider value={titleContext}>
            <Outlet />
          </PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
