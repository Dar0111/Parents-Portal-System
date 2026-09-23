import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher excuse-letter queue and review action. No parent submission flow —
// that is a Parent page and a separate dispatch.
//
// THE SPLIT THIS PAGE SURFACES, and it is the sharpest in the codebase:
//   SEE a letter    -> assigned to the student's class OR adviser of its section
//   REVIEW a letter -> ADVISER ONLY (sections.adviser_id)
// So a teacher can legitimately see a letter they may not act on, and gets a
// 403 naming the reason rather than a 404. This page predicts that case before
// the click (see canReview below) so the button is never a dead end — but the
// server stays the authority and the 403 is still handled for real.
//
// NO DETAIL ROUTE, deliberately. GET /api/excuse-letters/:id returns
// `SELECT el.*` with NO student name, while the LIST returns el.* PLUS
// first_name/last_name/grade_level/section — so the detail endpoint returns
// strictly LESS than a list row, and a detail page would need a second call to
// /students/:id just to render a name. Everything the review needs is already
// in the row. (Recorded as a backend oddity in CLAUDE.md, not fixed here.)
//
// NO ATTACHMENT AFFORDANCE. excuse_letters.attachment_url exists in the schema
// but nothing writes it — POST /api/excuse-letters accepts only absence_date,
// reason and details, and there is no upload endpoint anywhere. Rendering a
// download link for a column that is always NULL would promise a feature that
// does not exist.

const STATUS_FILTERS = ['Pending', 'Approved', 'Declined', 'All'];

export default function ExcuseLettersPage() {
  usePageTitle('Excuse Letters');
  const { user } = useAuth();

  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The teacher's advisory sections, used to predict reviewability. Same source
  // the attendance page uses: GET /api/sections is unscoped reference data with
  // no ?adviser_id filter, so the narrowing happens client-side.
  const [advisorySections, setAdvisorySections] = useState([]);

  // Pending is the actionable set, so it is the landing view. The control shows
  // it as an active selection rather than an invisible default, so a teacher can
  // see that reviewed letters are filtered out rather than missing.
  const [status, setStatus] = useState('Pending');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ status: 'Pending', from: '', to: '' });

  // --- review modal state -------------------------------------------------
  // Deliberately its own state, created when the modal opens and discarded when
  // it closes. CLAUDE.md convention 5b: the row's stored status renders from the
  // fetched letter and is NEVER written by this form. They cannot share state
  // because the form's state does not exist while the modal is shut.
  const [reviewing, setReviewing] = useState(null); // the letter being reviewed
  const [decision, setDecision] = useState(null); // 'Approved' | 'Declined'
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setAdvisorySections(all.filter((s) => s.adviser_id === user?.id));
      })
      .catch(() => {
        // A failure here only costs the prediction, not the page: every Review
        // button simply hides, and the server would refuse anyway. Not surfaced
        // as a page error, because the letters themselves may have loaded fine.
        if (!cancelled) setAdvisorySections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6); a page emptied by
  // a review steps back on its own (C7, in DataTable).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...listParams({ offset, sort }) };
      // 'All' means "send no status filter" — unlike students.js's ?status, the
      // three values here are the letter's own ENUM and the endpoint validates
      // them, returning 400 on anything else. Safe to build on.
      if (applied.status !== 'All') params.status = applied.status;
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;

      const result = await api.get('/excuse-letters', { unwrap: ['excuse_letters', 'page'], params });
      setLetters(result.excuse_letters);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setLetters([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [applied, offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  // Reviewable iff the letter is still Pending AND its class is one this teacher
  // advises. CAVEAT, stated rather than hidden: the client matches on
  // grade_level + section NAME, while the server decides on students.section_id.
  // Those agree for every real row today, but a student with a NULL section_id
  // is unreviewable server-side while this would predict reviewable — which is
  // exactly why the 403 below is still handled as a real path, not treated as
  // unreachable. The prediction removes the dead-end button; it is not authority.
  const canReview = useCallback(
    (letter) =>
      letter.status === 'Pending' &&
      advisorySections.some(
        (s) => s.grade_level === letter.grade_level && s.name === letter.section
      ),
    [advisorySections]
  );

  function resetFilters() {
    setStatus('Pending');
    setFrom('');
    setTo('');
    setOffset(0);
    setApplied({ status: 'Pending', from: '', to: '' });
  }

  function openReview(letter) {
    setReviewing(letter);
    setDecision(null);
    setRemarks('');
    setConfirming(false);
    setReviewError(null);
  }

  function closeReview() {
    if (saving) return; // never dismiss mid-flight — see the Modal props below
    setReviewing(null);
  }

  async function submitReview() {
    setSaving(true);
    setReviewError(null);
    try {
      await api.patch(
        `/excuse-letters/${reviewing.id}/review`,
        { status: decision, teacher_remarks: remarks.trim() || undefined },
        { unwrap: 'excuse_letter' }
      );
      setReviewing(null);
      // Refetch rather than patching the row locally: the server is the
      // authority on what is now stored, and a client-side merge is exactly the
      // shape convention 5b exists to prevent.
      await load();
    } catch (err) {
      setReviewError(extractError(err));
      setConfirming(false); // back to the decision step so the teacher can re-read
    } finally {
      setSaving(false);
    }
  }

  // Whether any date bound is set. Used ONLY to decide narrowing — never to
  // decide copy on its own. See emptyState below.
  const hasDateRange = Boolean(applied.from || applied.to);

  // Empty-state copy is derived from the SPECIFIC filter state that produced
  // the empty result, never from one boolean meaning "something is set".
  //
  // This replaced a `filtered` flag that carried two different meanings at
  // once: it was true both when a narrow filter matched nothing AND when the
  // status was 'All', which is the LEAST narrowed state there is. So "All
  // returned nothing because no letters exist" and "your filter is too tight"
  // rendered the same wrong message, and "Nothing waiting for review" — a
  // claim about Pending specifically — could surface under other filters.
  // Three explicit branches make that structurally impossible rather than
  // merely unlikely.
  const emptyState = (() => {
    if (hasDateRange || (applied.status !== 'All' && applied.status !== 'Pending')) {
      return {
        icon: 'fa-filter',
        title: 'No letters match these filters',
        message: 'Try a different status or date range.',
        showReset: true,
      };
    }
    if (applied.status === 'Pending') {
      return {
        icon: 'fa-envelope-open-text',
        title: 'Nothing waiting for review',
        message:
          'Every letter for your classes has been reviewed. Switch the status filter to see past letters.',
        showReset: false,
      };
    }
    // status === 'All' with no dates: nothing exists at all, and no filter
    // change would reveal anything.
    return {
      icon: 'fa-envelope-open-text',
      title: 'No excuse letters yet',
      message: 'Letters submitted by parents in your classes will appear here.',
      showReset: false,
    };
  })();

  // The Reset control is about whether the form differs from its default, which
  // is a separate question from which empty copy applies — hence a separate
  // value rather than reusing one flag for both.
  const canReset = applied.status !== 'Pending' || hasDateRange;

  const columns = useMemo(
    () => [
      {
        key: 'student',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name}, ${row.first_name}`,
        render: (row) => (
          <div>
            <div className="font-medium text-fg">
              {row.last_name}, {row.first_name}
            </div>
            <div className="text-xs text-fg-muted">
              Grade {row.grade_level} - {row.section}
            </div>
          </div>
        ),
      },
      { key: 'absence_date', header: 'Absence date', sortable: true },
      {
        key: 'reason',
        header: 'Reason',
        render: (row) => (
          <span className="line-clamp-2 max-w-md text-fg-secondary" title={row.reason}>
            {row.reason}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        render: (row) =>
          canReview(row) ? (
            <button
              type="button"
              onClick={() => openReview(row)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
            >
              Review
            </button>
          ) : row.status === 'Pending' ? (
            // Seen but not actionable. Named rather than left blank, and never
            // rendered as a button that would only produce a 403 — the same
            // precedent the Students page set by omitting Edit.
            <span className="text-xs text-fg-muted">Adviser only</span>
          ) : null,
      },
    ],
    [canReview]
  );

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied({ status, from, to });
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
      >
        <FormField
          label="Status"
          as="select"
          className={filterSelectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s}
            </option>
          ))}
        </FormField>
        <FormField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <FormField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
        >
          Apply
        </button>
        {canReset ? (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted"
          >
            Reset
          </button>
        ) : null}
      </form>

      <DataTable
        // RECORD CARD (DV1b-a). The learner leads, the absence date and class
        // sit in meta, the reason is the subtitle, and the status is the
        // badge — each fact once.
        //
        // `onSelect` ONLY when this teacher may actually review: Review is the
        // one primary action here, so a reviewable letter is a tappable card
        // with a chevron. A letter belonging to another adviser's section, or
        // one already reviewed, is a STATIC card — the API answers 403 to a
        // non-adviser, so offering the tap would be a dead end (the same
        // anti-dead-end rule the Actions column already follows).
        renderCard={(row) => ({
          onSelect: canReview(row) ? () => openReview(row) : undefined,
          avatar: `${row.first_name} ${row.last_name}`,
          title: `${row.last_name}, ${row.first_name}`,
          subtitle: row.reason,
          meta: `${row.absence_date} · Grade ${row.grade_level} - ${row.section}`,
          status: row.status,
        })}
        columns={columns}
        rows={letters}
        loading={loading}
        error={error}
        onRetry={load}
        page={page}
        onPageChange={setOffset}
        sort={sort}
        onSortChange={changeSort}
        emptyIcon={emptyState.icon}
        emptyTitle={emptyState.title}
        emptyMessage={emptyState.message}
        emptyAction={
          emptyState.showReset ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
            >
              Reset filters
            </button>
          ) : null
        }
      />

      <Modal
        open={Boolean(reviewing)}
        onClose={closeReview}
        title={reviewing ? `Review letter — ${reviewing.first_name} ${reviewing.last_name}` : ''}
        closeOnBackdrop={!saving}
        footer={
          confirming ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={saving}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-solid-fg transition disabled:opacity-60 ${
                  decision === 'Approved'
                    ? 'bg-success-solid hover:bg-success-solid-hover'
                    : 'bg-danger-solid hover:bg-danger-solid-hover'
                }`}
              >
                {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, {decision === 'Approved' ? 'approve' : 'decline'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeReview}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!decision}
                onClick={() => setConfirming(true)}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
              >
                Continue
              </button>
            </>
          )
        }
      >
        {reviewing ? (
          <div className="space-y-4">
            {reviewError ? <ErrorAlert message={reviewError} /> : null}

            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Absence date</dt>
                <dd className="mt-0.5 text-sm text-fg">{reviewing.absence_date}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Class</dt>
                <dd className="mt-0.5 text-sm text-fg">
                  Grade {reviewing.grade_level} - {reviewing.section}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Reason</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{reviewing.reason}</dd>
              </div>
              {reviewing.details ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">Details</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{reviewing.details}</dd>
                </div>
              ) : null}
            </dl>

            {/* THE SCHOOL'S OWN RULE, at the moment of decision rather than in a
                page header: "excuse lang yung bata pero absent pa rin".
                Approving records the reason; it does not touch the attendance
                table (enforced server-side — that handler references no
                attendance query at all). A teacher who approves believing the
                absence clears has been misled by the interface into a wrong
                model of their own records. */}
            <p className="rounded-lg border border-info-edge bg-info-soft px-3 py-2 text-sm text-info-strong">
              Approving records the reason for this absence. It does not change the attendance
              record — the student stays marked Absent for that day.
            </p>

            {confirming ? (
              // Explicit confirmation because the API refuses correction: once a
              // letter leaves Pending, PATCH /:id/review answers 403 and there is
              // no un-review endpoint. Names the specific decision back rather
              // than asking a generic "are you sure".
              <p className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-strong">
                <strong>
                  {decision === 'Approved' ? 'Approve this letter?' : 'Decline this letter?'}
                </strong>{' '}
                This cannot be changed afterward.
              </p>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-fg-secondary">Decision</p>
                  <div className="flex gap-2">
                    {['Approved', 'Declined'].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDecision(value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                          decision === value
                            ? 'border-primary bg-primary font-medium text-primary-fg'
                            : 'border-edge-strong text-fg-body hover:bg-surface-muted'
                        }`}
                      >
                        {value === 'Approved' ? 'Approve' : 'Decline'}
                      </button>
                    ))}
                  </div>
                </div>

                <FormField
                  label="Remarks"
                  as="textarea"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  hint="Optional — but a declined letter with no reason sends the parent to Messages to ask why."
                />
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
