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
// failed card would re-request six that already succeeded. There is no
// reload control on a card that has not failed (owner, 2026-10-04): the
// browser's own reload is the reload on the web.
//
// THE WHOLE CARD IS THE LINK (feat/ui-polish f2, 2026-09-30). Every card is a
// doorway to the page that owns its data; the "Open →" footer made the
// doorway one short word. The TITLE is the link, and its ::after is stretched
// over the card, so a click anywhere opens it while the keyboard still meets
// ONE tab stop named by the title. The card itself is not an <a>: Retry, and
// the System card's backups link, would then be interactive
// content inside a link, which HTML forbids. Anything interactive inside a
// card sits `relative z-10`, above the stretched link. An ERROR card does not
// link at all — its one action is Retry, and a stray click must not navigate
// away from the failure it reports.
//
// THE FOCUS OUTLINE IS `brand`, DRAWN 2px OUTSIDE THE CARD (UI-5). It was a
// `focus-ring` ring on the ::after, which sat on the card's own 1px border
// and measured 1.18:1 against the page in Light and 1.95:1 in Dark — under
// WCAG 1.4.11's 3:1. The outline is on the <section>, keyed on the title
// link's :focus-visible (`.card-link`, so the System card's inner link does
// not light the whole card), and sits on the page background, where `brand`
// is 15.31:1 (Light) and 9.29:1 (Dark) — asserted by lint:contrast.
//
// THE LOOK (feat/ui-refresh): 16px corners and the smallest shadow at rest; a
// card that links lifts to a larger shadow under the pointer. The header is
// TWO ROWS — the icon in its chip, then the title on its own line in the
// title face — because a serif title beside the chip does not fit an admin
// tile: at 1024px a tile's header is 132px, and "Waiting for approval"
// (161px) would break to three lines beside the chip and to two under it
// (measured from the font files, 2026-10-04). One header shape at every
// width beats one that changes per card.
//
// `transition-shadow`, NOT the bare `transition`: the grid's entrance tweens
// each card's opacity and transform, and a CSS transition on those same two
// properties would chase every frame of it.
//
// `compact` (UI-3): the admin's four number tiles — less padding, a tighter
// header. The admin grid says `items-start`, so there a card takes its
// CONTENT height; the parent and teacher grids stretch each row (Darryl,
// 2026-09-30).
export default function Card({
  title,
  icon,
  to,
  loading = false,
  error = null,
  onRetry = null,
  tone = 'default',
  compact = false,
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

  // The icon's chip. On a toned card the chip is the plain surface with the
  // tone's own strong colour, so it reads as a cut-out of the tinted frame
  // rather than a second tint on top of it. Each is a pair lint:contrast
  // already checks on `surface`.
  const chipClass =
    tone === 'warning'
      ? 'bg-surface text-warning-strong'
      : tone === 'danger'
        ? 'bg-surface text-danger-text'
        : 'bg-brand-soft text-brand';

  const linked = Boolean(to) && !error;

  return (
    <section
      className={`group relative flex flex-col rounded-2xl border shadow-xs ${toneClass} ${compact ? 'p-4' : 'p-5'} ${
        linked ? 'transition-shadow hover:shadow-md' : ''
      } has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-brand ${className}`}
    >
      <div className={`${compact ? 'mb-2' : 'mb-3'} flex flex-col items-start gap-2`}>
        {icon ? (
          // The wrapper carries the flex, never the element with `fa-solid`:
          // Font Awesome's `.fa-solid { display: inline-block }` is unlayered
          // and beats Tailwind's layered `.flex`, so flex on the <i> is
          // silently dropped (found in D3, 2026-09-19).
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${chipClass}`}
          >
            <i className={`fa-solid ${icon}`} />
          </span>
        ) : null}
        <h2 className="w-full min-w-0 font-serif text-base font-bold text-fg">
          {linked ? (
            <Link
              to={to}
              className="card-link underline-offset-2 after:absolute after:inset-0 after:rounded-2xl group-hover:underline focus-visible:outline-none"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
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
// uses; a caller with a count passes the count — or, for a whole-number
// count, <CountUp value={n} />, which renders that same number and only
// animates its arrival (feat/ui-refresh). One component, one job.
//
// `large` is the emphasised card's lead (f2): the first number on the screen
// a user lands on is the one bigger number there.
//
// ONE STEP DOWN (the type scale, §24, Darryl, 2026-09-30): a figure is
// `text-xl` and `large` is `text-2xl` — they were `text-2xl` / `text-3xl` and
// read too big on a laptop. Bold and tabular since feat/ui-refresh, so a
// figure that changes does not shift the caption under it.
export function Stat({ value, caption, muted = false, large = false }) {
  return (
    <div className="min-w-0">
      <p
        className={`${large ? 'text-2xl' : 'text-xl'} break-words font-bold tabular-nums ${muted ? 'text-fg-muted' : 'text-fg'}`}
      >
        {value}
      </p>
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
