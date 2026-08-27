import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL = {
  admin: 'Admin',
  teacher: 'Teacher',
  parent: 'Parent',
};

export default function Shell({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white sm:block">
        <div className="px-4 py-5 text-sm font-semibold text-slate-900">
          Parent's Portal
        </div>
        <nav className="px-2 text-sm text-slate-500">
          <div className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900">
            <i className="fa-solid fa-gauge mr-2" />
            Dashboard
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-base font-semibold text-slate-900">{title}</h1>

          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="font-medium text-slate-900">{user?.name || user?.login_id}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user?.role] || user?.role}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              <i className="fa-solid fa-right-from-bracket" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
