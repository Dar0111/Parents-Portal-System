import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import { todayLocalDateString } from '../../format/date';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent events — READ ONLY.
//
// NO COMPOSE, EDIT OR DELETE. POST/PUT/DELETE on /api/events are all
// authorize('teacher', 'admin'), so a parent gets 403 "Access denied." from
// the middleware before any handler runs.
//
// FULL TEXT OPENS IN A MODAL, NOT A DETAIL ROUTE — there is no
// GET /api/events/:id (404 "Route not found." from server.js's fallback). The
// row already carries every column (SELECT e.*), so the modal costs no
// request.
//
// ONE FILTER, AND IT IS THE ONLY VERIFIED ONE WORTH OFFERING. `from` and `to`
// are both server-validated (400 on a malformed date) and `grade_level` is
// too, but grade_level is AND-ed straight onto e.target_grade — which is FALSE
// for a school-wide event — so for a parent it can only hide the school's own
// events. A free from/to range is not offered either: a parent picking March
// 2019 is a query about nothing. What remains is Upcoming vs All, built on
// `from` alone.
//
// `from` IS INCLUSIVE. The handler is `e.event_date >= ?`, so today's event
// counts as upcoming — which is the behaviour a parent expects on the morning
// of the event itself. The value comes from todayLocalDateString(), never
// toISOString(): see client/src/format/date.js for the two UTC bugs this
// project has already paid for. When the range is All, `from` is OMITTED
// ENTIRELY rather than sent empty — content.js gates on `if (from)`, so an
// empty string would be skipped anyway, but sending a parameter that means
// nothing is how a filter starts lying about what it asked for.
//
// THE SELECT IS THE APPLIED VALUE. There is no draft and no Apply button —
// unlike the teacher events page, which has three controls that only make
// sense committed together. One control that refetches on change has no state
// worth staging.
//
// SORTED IN THE PAGE, NOT BY A NEW DataTable PROP. The API returns
// event_date DESC, which puts the most distant future event above today's —
// wrong for Upcoming. DataTable has no defaultSort and extending a shared
// primitive for one page is the thing conventions 5/9 exist to prevent, so the
// page sorts the array it owns before handing it down. DataTable copies before
// sorting and never mutates, so a header click still works, and its third
// click clears back to this order rather than to the API's.
//
// NOT RENDERED: `posted_by` (numeric id, still on the row for teacher
// edit authorization). The name is posted_by_name, INNER JOINed
// 2026-09-11 (71d23f9); this page renders it in the modal only
// (2026-09-12). `/auth/me` no longer returns `lrn` (a582bd8, 2026-09-12).
// `login_id` is still the LRN and is still not rendered here
// (convention 5c). The events table has no attachment column at all.
//
// AUDIENCE LABELS COME FROM target_grade's NULLNESS, never from
// user.grade_level, which /auth/me does return. Two cases here rather than
// announcements' three: the events table has no target_section column, so
// whole-grade is the only targeted shape that exists.

function audienceLabel(row) {
  return row.target_grade === null
    ? 'For everyone at the school'
    : "For your child's year level";
}

export default function ParentEventsPage() {
  usePageTitle('Events');
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  // This IS the applied filter value, not a draft of one.
  const [range, setRange] = useState('upcoming');

  // The request is ALWAYS made. user.student_id only picks which empty copy to
  // show once the list has come back empty — skipping the fetch because the
  // account "looks unlinked" would hide real events behind a stale
  // AuthContext.
  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // range or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  function changeRange(next) {
    setRange(next);
    setOffset(0);
  }

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  // The order used to be a client-side sort of the whole list — soonest
  // first for Upcoming, most recent first for All. On a paged list that is
  // the SERVER's job: with no header sort chosen, Upcoming asks for
  // event_date ascending and All takes the endpoint's own event_date DESC.
  const effectiveSort = useMemo(
    () => sort ?? (range === 'upcoming' ? { key: 'event_date', dir: 'asc' } : null),
    [sort, range]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...listParams({ offset, sort: effectiveSort }) };
      if (range === 'upcoming') params.from = todayLocalDateString();
      const result = await api.get('/events', { unwrap: ['events', 'page'], params });
      setRows(result.events);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [range, offset, effectiveSort]);

  useEffect(() => {
    load();
  }, [load]);

  // Convention 5f — one branch per cause, keyed on the actual applied value,
  // never on a boolean meaning "something is set". A reset is offered only in
  // the branch where resetting would change the result: on "nothing exists at
  // all" it would be a dead end.
  const empty = useMemo(() => {
    if (user?.student_id == null) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message:
          "Ask the school office to link your account so you can see events for your child's year level.",
        showPast: false,
      };
    }
    if (range === 'upcoming') {
      return {
        icon: 'fa-calendar-check',
        title: 'Nothing coming up',
        message: "School events for your child's year level appear here.",
        showPast: true,
      };
    }
    return {
      icon: 'fa-calendar-days',
      title: 'No events yet',
      message: 'School events will appear here once they are posted.',
      showPast: false,
    };
  }, [user?.student_id, range]);

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Event',
        sortable: true,
        render: (row) => (
          <div>
            <button
              type="button"
              onClick={() => setReading(row)}
              className="text-left font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {row.title}
            </button>
            {row.description ? (
              <div className="line-clamp-2 max-w-xl text-xs text-slate-500">{row.description}</div>
            ) : null}
            <div className="mt-1 text-xs text-slate-400">{audienceLabel(row)}</div>
          </div>
        ),
      },
      { key: 'event_date', header: 'Date', sortable: true },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <FormField
          label="Show"
          as="select"
          className={filterSelectClass}
          value={range}
          onChange={(e) => changeRange(e.target.value)}
          hint="Upcoming includes anything happening today."
        >
          <option value="upcoming">Upcoming events</option>
          <option value="all">All events, including past</option>
        </FormField>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        page={page}
        onPageChange={setOffset}
        sort={sort}
        onSortChange={changeSort}
        emptyIcon={empty.icon}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
        emptyAction={
          empty.showPast ? (
            <button
              type="button"
              onClick={() => changeRange('all')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Show past events
            </button>
          ) : null
        }
      />

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.title}
        size="lg"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{reading?.event_date}</span>
            <span aria-hidden="true">·</span>
            <span>{reading ? audienceLabel(reading) : null}</span>
            <span aria-hidden="true">·</span>
            <span>Posted by {reading?.posted_by_name}</span>
          </div>
          {/* description is NULLABLE in the schema, so an empty modal body is a
              real possibility and gets said out loud rather than rendering a
              blank panel. */}
          {reading?.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {reading.description}
            </p>
          ) : (
            <p className="text-sm italic text-slate-500">No further details.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
