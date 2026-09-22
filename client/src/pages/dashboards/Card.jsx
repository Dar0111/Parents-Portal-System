import { Link } from 'react-router-dom';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';

// The dashboard card (DB2, 2026-09-19). Local to pages/dashboards/ on
// purpose (Darryl, Q5): it is used ~17 times by three files and nowhere
// else, and promoting it to components/ would make it a frozen primitive
// under §7b before a second kind of consumer has ever asked anything of it.
// Move it there when one does, not before.
//
// ---------------------------------------------------------------------------
// WHY LOADING AND ERROR LIVE IN THE CARD, NOT IN THE PAGE
// ---------------------------------------------------------------------------
// A dashboard is the one screen where several independent failures are
// normal: seven requests, seven things that can time out, 403, or come back
// malformed. If the page owned one `loading` and one `error`, a single failed
// request would blank six working cards — and `Promise.all` would do exactly
// that, because it rejects as a unit. So each card owns its own three states
// and renders them INSIDE its own frame, the same division DataTable already
// uses (§5: the frame stays, the contents change).
//
// `onRetry` refetches THAT CARD ONLY. A page-level reload to recover one
// failed card would re-request six that already succeeded.
//
// The footer link is not decoration: every card is a doorway to the page that
// owns its data, and a number with nowhere to go is a dead end on the one
// screen a user lands on first.
export default function Card({
  title,
  icon,
  to,
  linkLabel = 'Open',
  loading = false,
  error = null,
  onRetry = null,
  tone = 'default',
  className = '',
  children,
}) {
  // `tone` colours the FRAME, never a verdict (§4). It says "this needs
  // attention", not "this is bad" — amber for a queue with something in it.
  //
  // NO DASHBOARD CARD IS RED. `danger` exists for completeness and is
  // deliberately unused: red means something HAS failed, and the only thing
  // on a dashboard that can fail is a request, which ErrorAlert already
  // renders inside the card. The admin lockout hazard was built red and
  // corrected on review — a state that could strand you later is a warning.
  const toneClass =
    tone === 'warning'
      ? 'border-warning-edge bg-warning-soft'
      : tone === 'danger'
        ? 'border-danger-edge bg-danger-soft'
        : 'border-edge bg-surface';

  return (
    <section className={`flex flex-col rounded-xl border ${toneClass} p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {icon ? (
          // The wrapper carries the flex, never the element with `fa-solid`:
          // Font Awesome's `.fa-solid { display: inline-block }` is unlayered
          // and beats Tailwind's layered `.flex`, so flex on the <i> is
          // silently dropped (found in D3, 2026-09-19).
          <span className="flex h-5 w-5 items-center justify-center text-fg-muted">
            <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
          </span>
        ) : null}
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>

      <div className="min-w-0 flex-1">
        {loading ? (
          <div className="py-4">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <ErrorAlert message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>

      {to ? (
        <div className="mt-4">
          <Link
            to={to}
            className="text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            {linkLabel}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// The one number a card exists to show, plus its caption. Separate from Card
// so a card can hold a list instead without inheriting type sizes meant for a
// figure.
//
// IT DELIBERATELY DOES NOT FORMAT `value`, and that is the fix for the
// precision defect rather than the cause of it (DV4, 2026-09-23).
//
// The bug: the parent dashboard passed `grades.general_average` straight in,
// so a general average of 87.5 read "87.5" here against the report card's
// "87.50" — the same number, two spellings, two screens. The tempting fix is
// a formatter inside this component. It would be wrong: `Stat` also renders
// "3 of 5", an unread COUNT, and "Pending", none of which may gain decimals.
//
// So the split is at the CALL SITE, exactly as the 2026-09-22 rounding fix
// split GradeValue's `whole`: a caller with a grade-bearing value passes
// <GradeValue …/> as the value and gets the one renderer the whole system
// uses; a caller with a count passes the count. One component, one job.
export function Stat({ value, caption, muted = false }) {
  return (
    <div>
      <p className={`text-2xl font-semibold ${muted ? 'text-fg-muted' : 'text-fg'}`}>{value}</p>
      {caption ? <p className="mt-1 text-sm text-fg-muted">{caption}</p> : null}
    </div>
  );
}

// A card's own empty state. Deliberately quieter than components/EmptyState —
// that one owns a whole table frame with an icon and 3rem of padding, which
// inside a 5rem card reads as a broken layout.
export function CardEmpty({ children }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}
