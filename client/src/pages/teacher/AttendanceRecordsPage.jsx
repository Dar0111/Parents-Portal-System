import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import { longDate, shortDate } from '../../format/date';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher attendance RECORDS — read-only past rows. Encoding is the other
// page (/teacher/attendance). This is a sibling, not a tab or a mode.
//
// Attendance is the ADVISER's job (Stage B1). Section list is the same
// source as the encode page: GET /sections filtered on adviser_id, not
// teacher_assignments, not useTeacherTargets, not GET /assignments.
//
// GET /attendance (unwrap 'attendance') with grade_level + section.name
// and optional from/to. Never send `date` — that param swallows the
// range. One row per student per date, as the SELECT returns.
//
// READ ONLY. PUT /api/attendance/:id exists and is not called. A teacher
// who needs to fix a past day opens Attendance and re-submits; POST /bulk
// is ON DUPLICATE KEY UPDATE (§5e).
//
// §5b: `rows` come from the last successful GET only. There is no marks
// object. §5c: LRN is not in this payload and is not invented. recorded_by
// is a user id and is not rendered (GET /users/:id is admin-only).
//
// §5i sentence is always on the page, not gated on a loaded section.

export default function AttendanceRecordsPage() {
  usePageTitle('Attendance records');
  const { user } = useAuth();

  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // SECTION IS IN HERE NOW (item 5, 2026-09-25), and it fixes a real defect
  // rather than only tidying the shape. It used to write `sectionId` straight
  // through: it bypassed `applied` while still being a `load` dependency, AND
  // it never called `setOffset(0)` — so switching section on page 3 refetched
  // the NEW section at offset 100, against this page's own note that "a filter
  // or sort change resets to the first page (C6)".
  //
  // The visible trade: the Section select now waits for Apply like the dates
  // beside it, where before it applied instantly. That is the consistency the
  // cue depends on — a bar where one control commits and two stage cannot
  // honestly say "Changes not applied".
  const [appliedSectionId, setAppliedSectionId] = useState(null);
  const [applied, setApplied] = useState({ from: '', to: '' });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((s) => s.adviser_id === user?.id);
        setSections(mine);
        // The first advisory section is both the draft AND the applied value
        // on arrival: the page fetches immediately, so there is nothing
        // staged and the cue must not appear before the reader has touched
        // anything.
        if (mine.length) {
          setSectionId(mine[0].id);
          setAppliedSectionId(mine[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // THE FETCH READS THE APPLIED SECTION, never the draft — that is the whole
  // point of moving it. The select's own value is still `sectionId`.
  const section = useMemo(
    () => (sections || []).find((s) => s.id === appliedSectionId) || null,
    [sections, appliedSectionId]
  );

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    if (!section) return;

    setLoading(true);
    setError(null);
    try {
      const params = {
        grade_level: section.grade_level,
        section: section.name,
        ...listParams({ offset, sort }),
      };
      // Never send `date`. That branch ignores from/to.
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;

      const result = await api.get('/attendance', { unwrap: ['attendance', 'page'], params });
      setRows(result.attendance);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [section, applied, offset, sort]);

  useEffect(() => {
    load();
  }, [load]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  function resetFilters() {
    setFrom('');
    setTo('');
    setOffset(0);
    setApplied({ from: '', to: '' });
    // Reset clears the DATES, not the section: there is no "no section" state
    // — the page always shows one advisory class — so resetting to nothing
    // would have nothing to show. Unchanged from before item 5.
  }

  // ASSEMBLED ONCE, read by BOTH `isDirty` and the submit handler. Building
  // it twice is how the cue and the commit drift apart, which is §5b in
  // miniature: two derivations of one truth.
  const draftFilters = { sectionId, from, to };
  const appliedFilters = { sectionId: appliedSectionId, from: applied.from, to: applied.to };
  const dirty = isDirty(draftFilters, appliedFilters);

  const hasDateRange = Boolean(applied.from || applied.to);
  const canReset = hasDateRange;

  const emptyState = hasDateRange
    ? {
        icon: 'fa-filter',
        title: 'No records match these dates',
        message: 'Try a different date range, or reset to see every recorded day.',
        showReset: true,
      }
    : {
        icon: 'fa-clipboard-user',
        title: 'No attendance recorded for this section yet',
        message: 'Records appear here after the adviser saves a day on Attendance.',
        showReset: false,
      };

  const columns = useMemo(
    () => [
      // A DATE column: the literal "2026-09-25" arrives as a string and
      // `shortDate` rewrites it as one (§5a-iv). DataTable sorts the raw row
      // value, so the column still sorts chronologically.
      { key: 'date', header: 'Date', sortable: true, render: (row) => shortDate(row.date) },
      {
        key: 'student',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name}, ${row.first_name}`,
        render: (row) => (
          <span className="font-medium text-fg">
            {row.last_name}, {row.first_name}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    []
  );

  const hint = (
    <p className="text-sm text-fg-muted">
      To change a mark, open{' '}
      <Link
        to="/teacher/attendance"
        className="font-medium text-brand underline decoration-fg-ghost underline-offset-2 hover:decoration-brand"
      >
        Attendance
      </Link>{' '}
      and pick that date.
    </p>
  );

  if (sectionsError) {
    return (
      <div className="space-y-4">
        {hint}
        <ErrorAlert message={sectionsError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (sections === null) {
    return (
      <div className="space-y-4">
        {hint}
        <LoadingSpinner className="py-16" label="Loading your sections…" />
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="space-y-4">
        {hint}
        <EmptyState
          icon="fa-clipboard-user"
          title="You have no advisory section"
          message="Attendance records are for the class adviser."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hint}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setAppliedSectionId(sectionId);
          setApplied({ from, to });
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
      >
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg-secondary">Section</p>
          {sections.length === 1 ? (
            <p className="py-2 text-sm font-semibold text-fg">
              Grade {section?.grade_level} - {section?.name}
            </p>
          ) : (
            <FormField
              label={null}
              as="select"
              className={filterSelectClass}
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(Number(e.target.value))}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Grade {s.grade_level} - {s.name}
                </option>
              ))}
            </FormField>
          )}
        </div>

        <FormField
          label="From"
          type="date"
          className={filterFieldClass}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <FormField
          label="To"
          type="date"
          className={filterFieldClass}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
      </form>

      <DataTable
        // RECORD CARD (DV1b-a). Read-only by design: this is the sibling
        // route to the encode screen, and the correction path is that screen,
        // not this one — so no `to`, no `onSelect`, no chevron.
        //
        // The learner leads and the date is meta, not the other way round: a
        // teacher scanning this list is looking for a person. There is no
        // subtitle, because the only other fact is the status and that is the
        // badge.
        renderCard={(row) => ({
          avatar: `${row.first_name} ${row.last_name}`,
          title: `${row.last_name}, ${row.first_name}`,
          meta: longDate(row.date),
          status: row.status,
        })}
        columns={columns}
        rows={rows}
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
              Reset
            </button>
          ) : null
        }
      />
    </div>
  );
}
