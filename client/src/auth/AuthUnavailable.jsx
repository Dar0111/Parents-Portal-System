import ErrorAlert from '../components/ErrorAlert';

// THE PANEL THAT REPLACES A LOGOUT (pre-Stage-5 #4, 2026-09-25).
//
// Rendered by ProtectedRoute and RootRedirect in the spinner's frame when
// /auth/me failed for any reason other than a 401 — the token is still in
// storage and the URL is untouched, so Retry re-reads the session in place.
// It must never say "log in": the whole point is that the user is NOT
// logged out, and copy sending them to /login would undo the fix in prose.
// The reason line is extractError's wording (the API's own message for a
// 5xx, the offline sentence for no response) through ErrorAlert, per §2.
export default function AuthUnavailable({ message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 shadow-sm">
        <h1 className="text-base font-semibold text-fg">Can't reach the school server</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Your session is kept. Try again when you're connected.
        </p>
        <ErrorAlert message={message} onRetry={onRetry} className="mt-4" />
      </div>
    </div>
  );
}
