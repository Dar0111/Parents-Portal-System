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
export default function LetterReadingView({ letter }) {
  if (!letter) return null;

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Learner</dt>
          <dd className="mt-0.5 text-sm text-fg">
            {letter.last_name}, {letter.first_name}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Class</dt>
          <dd className="mt-0.5 text-sm text-fg">
            Grade {letter.grade_level} - {letter.section}
          </dd>
        </div>
        <div>
          {/* A DATE column, so `longDate` is string surgery on the literal
              "2026-09-25" — nothing parsed, nothing shifted (§5a-iv). Long
              form because this is a reading view, not a table (§18). */}
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Absence date</dt>
          <dd className="mt-0.5 text-sm text-fg">{longDate(letter.absence_date)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Status</dt>
          <dd className="mt-0.5">
            <StatusBadge status={letter.status} />
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Reason</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{letter.reason}</dd>
        </div>
        {/* `details` and `teacher_remarks` are both NULLABLE, and remarks are
            optional at the API layer by decision — a decline with no reason is
            a real row. Each heading renders only with its value, so an absent
            one is absent rather than an empty label, which would read as a
            failed fetch. */}
        {letter.details ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Details</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{letter.details}</dd>
          </div>
        ) : null}
        {letter.teacher_remarks ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Adviser remarks</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{letter.teacher_remarks}</dd>
          </div>
        ) : null}
      </dl>

      {/* NO EDIT AND NO REVIEW CONTROL. A teacher never edits a letter — that
          is the parent's, and only while Pending — and a reviewed letter
          cannot be reviewed again: `PATCH /:id/review` answers 403 once the
          status has moved. §5i: this view makes no offer the API would
          refuse. */}
      <p className="text-xs text-fg-muted">
        Reviewed letters cannot be changed. Read-only.
      </p>
    </div>
  );
}
