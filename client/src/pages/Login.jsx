import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roles';
import extractError from '../api/extractError';
import { takeLogoutReason } from '../api/axios';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  // B3 (2026-09-19): when the 401 interceptor sent the user here, the reason
  // it stored ("Account is not active." / "Your session has ended…") is the
  // first thing this page shows. Read once, in the state initialiser, and
  // cleared by takeLogoutReason, so a refresh or a manual Logout shows
  // nothing. Same slot as a failed sign-in: the next submit replaces it.
  const [error, setError] = useState(() => takeLogoutReason());
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const loggedInUser = await login(loginId.trim(), password);
      navigate(roleHome(loggedInUser.role), { replace: true });
    } catch (err) {
      // Backend sends the exact message to show: wrong credentials (401),
      // or pending/rejected account (403, routes/auth.js). extractError
      // returns it verbatim — and, when there is no response at all, the
      // distinct offline message, so a dead API is never mistaken for a
      // wrong password (this file predated extractError; KNOWN ISSUES row
      // closed 2026-09-18).
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-xl border border-edge bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-fg">Parent's Portal</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Captain H. Francisco Elementary School
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login_id" className="mb-1 block text-sm font-medium text-fg-secondary">
              Login ID
            </label>
            <input
              id="login_id"
              type="text"
              autoComplete="username"
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full rounded-lg border border-edge-strong px-3 py-2 text-sm focus:border-focus-edge focus:outline-none focus:ring-1 focus:ring-focus-ring"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-fg-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-edge-strong px-3 py-2 text-sm focus:border-focus-edge focus:outline-none focus:ring-1 focus:ring-focus-ring"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
