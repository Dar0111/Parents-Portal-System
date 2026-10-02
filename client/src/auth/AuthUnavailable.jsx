import Button from '../components/Button';
import ErrorAlert from '../components/ErrorAlert';
import { cardClass } from '../components/buttonClass';

// THE PANEL THAT REPLACES A LOGOUT (pre-Stage-5 #4, 2026-09-25).
//
// Rendered by ProtectedRoute and RootRedirect in the spinner's frame when
// /auth/me failed for any reason other than a 401 — the token is still in
// storage and the URL is untouched, so Retry re-reads the session in place.
// It must never say "log in": the whole point is that the user is NOT
// logged out, and copy sending them to /login would undo the fix in prose.
// The reason line is extractError's wording (the API's own message for a
// 5xx, the offline sentence for no response) through ErrorAlert, per §2.
//
// ONE "Try again", AND IT IS THE SCREEN'S ONE ACTION (feat/ui-refresh,
// 2026-10-02): the full-width primary button under the reason, calling the
// same `onRetry` ErrorAlert's own text button used to. ErrorAlert therefore
// gets no `onRetry` here — two buttons with one name would be one too many.
// SHOWN ON THE SAME CONDITION AS BEFORE: ErrorAlert drew its retry only when
// it had both a message and an `onRetry`, so this button asks for both too.
// Both callers always pass both; the condition is kept so that moving the
// button is a restyle and nothing else.
// Outside the Shell, so this screen keeps its own single <h1>.
export default function AuthUnavailable({ message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <div className={`${cardClass} w-full max-w-md p-6 sm:p-8`}>
        {/* The flex is on the chip, never on the <i> (Font Awesome's
            unlayered display wins over a layered utility). Decoration only. */}
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"
        >
          <i className="fa-solid fa-plug-circle-xmark text-lg" />
        </span>
        <h1 className="mt-4 font-serif text-xl font-bold text-fg">Can't reach the school server</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Your session is kept. Try again when you're connected.
        </p>
        <ErrorAlert message={message} className="mt-5" />
        {message && onRetry ? (
          <Button variant="primary" full onClick={onRetry} className="mt-5">
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
