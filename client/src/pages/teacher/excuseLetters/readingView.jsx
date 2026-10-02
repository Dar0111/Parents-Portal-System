import StatusBadge from '../../../components/StatusBadge';
import { longDate } from '../../../format/date';

// The teacher's READ-ONLY view of a reviewed excuse letter (UI-E, 2026-09-25).
//
// WHAT IT FIXES. `details` and `teacher_remarks` rendered in exactly one place
// — inside the review Modal — and that modal opens only for a Pending letter
// in a section the teacher advises. So the moment a letter was reviewed, the
// teacher who wrote the remarks could not read them back AT ANY WIDTH. Not the
// DV1b-a card regression, which was the parent side: this one was symmetrical
// and pre-existing, and no automated check could see it because nothing was
// broken — a view simply did not exist.
//
// ITS OWN MODULE, not inline JSX in the page (§17b). It is a CONDITIONAL view,
// and a conditional view is what a source-text assertion cannot check (§17d):
// DV1b-b asserted that a prop was WRITTEN and reported it working while
// `DataTable` never rendered it. A function in a module can be imported and
// rendered, which is what `scripts/ssr-ui-e.jsx` does.
//
// THE PARENT'S VIEW IS THE PATTERN, NOT THE CODE. `parent/ExcuseLettersPage`'s
// reading modal is inline `<dl>` markup whose footer offers Edit, and the two
// views differ on four of six rows. Copying the layout keeps them recognisably
// the same document; sharing the component would have meant parameterising
// that footer away on the first call.
//
// FOUR DELIBERATE OMISSIONS, each of which was considered and rejected:
//
//   the reviewer's name — `reviewed_by` is a user id and nothing resolves it;
//                         showing it needs a server JOIN (pre-Stage-5).
//   a reviewed date     — there is NO `reviewed_at` column. `updated_at`
//                         changes on review AND on anything else, so it is a
//                         proxy, not the fact, and a proxy printed as a date
//                         is a claim the data cannot support (§5i).
//   "Submitted"         — `created_at` is available, but the parent's view
//                         does not show it and parity matters more here than
//                         the extra row.
//   the attachment      — `attachment_url` exists and NOTHING uploads, on any
//                         screen in the app. A row that is always empty is
//                         noise.
//
// "ADVISER REMARKS", NOT "YOUR REMARKS" (§5i). The read scope is wider than
// the review scope — any assigned teacher may read this, only the adviser
// wrote it — so the possessive would be false for exactly the reader who most
// needs the view to be accurate. It is also the parent's wording, so one
// letter reads the same to both sides.
//
// The learner and the class ARE shown, where the parent's view omits them: a
// parent has one child, a teacher has a list. No LRN reaches this (§5c) —
// there is none in the payload to leak.
//
// THE LAYOUT (feat/ui-refresh, 2026-10-02) — three kinds of row, one <dl>:
//
//   the four short facts   — small tiles, two to a row: who, which class,
//                            which day, and where the letter stands.
//   the parent's own words — Reason and Details at READING size, in a column
//                            that stays under ~75 characters.
//   the adviser's reply    — on the brand tint, so the one part of the letter
//                            the school wrote is told apart from the parent's
//                            by more than its heading.
//
// THE SEVEN HEADINGS, THEIR ORDER AND THEIR WORDS ARE PINNED by
// `scripts/ssr-ui-e.jsx`, which reads each <dt> as TEXT ONLY: never put an
// icon or any other element inside a <dt> here, or the heading it belongs to
// drops out of the proof's list.
//
// NO SCROLLER OF ITS OWN: Modal's body scrolls, and keeps its title bar on
// screen while it does.

// One eyebrow for every heading: small, uppercase, muted.
const HEADING = 'text-xs font-semibold uppercase tracking-wider text-fg-muted';
// A short fact's tile.
const TILE = 'min-w-0 rounded-xl bg-surface-subtle px-4 py-3';
// The parent's prose.
const READING = 'mt-1 max-w-prose whitespace-pre-wrap break-words text-base leading-relaxed text-fg-body';

export default function LetterReadingView({ letter }) {
  if (!letter) return null;

  return (
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className={TILE}>
          <dt className={HEADING}>Learner</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-fg">
            {letter.last_name}, {letter.first_name}
          </dd>
        </div>
        <div className={TILE}>
          <dt className={HEADING}>Class</dt>
          <dd className="mt-1 text-sm text-fg">
            Grade {letter.grade_level} - {letter.section}
          </dd>
        </div>
        <div className={TILE}>
          {/* A DATE column, so `longDate` is string surgery on the literal
              "2026-09-25" — nothing parsed, nothing shifted (§5a-iv). Long
              form because this is a reading view, not a table (§18). */}
          <dt className={HEADING}>Absence date</dt>
          <dd className="mt-1 text-sm tabular-nums text-fg">{longDate(letter.absence_date)}</dd>
        </div>
        <div className={TILE}>
          <dt className={HEADING}>Status</dt>
          <dd className="mt-1">
            <StatusBadge status={letter.status} />
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className={HEADING}>Reason</dt>
          <dd className={READING}>{letter.reason}</dd>
        </div>
        {/* `details` and `teacher_remarks` are both NULLABLE, and remarks are
            optional at the API layer by decision — a decline with no reason is
            a real row. Each heading renders only with its value, so an absent
            one is absent rather than an empty label, which would read as a
            failed fetch. */}
        {letter.details ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className={HEADING}>Details</dt>
            <dd className={READING}>{letter.details}</dd>
          </div>
        ) : null}
        {letter.teacher_remarks ? (
          <div className="min-w-0 rounded-xl bg-brand-soft px-4 py-3 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-brand">Adviser remarks</dt>
            <dd className="mt-1 max-w-prose whitespace-pre-wrap break-words text-base leading-relaxed text-fg">
              {letter.teacher_remarks}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* NO EDIT AND NO REVIEW CONTROL. A teacher never edits a letter — that
          is the parent's, and only while Pending — and a reviewed letter
          cannot be reviewed again: `PATCH /:id/review` answers 403 once the
          status has moved. §5i: this view makes no offer the API would
          refuse. */}
      <p className="flex items-center gap-2 text-xs text-fg-muted">
        <i aria-hidden="true" className="fa-solid fa-lock text-fg-faint" />
        Reviewed letters cannot be changed. Read-only.
      </p>
    </div>
  );
}
