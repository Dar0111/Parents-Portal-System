import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import { longDate, shortDate } from '../../format/date';
import FormField, { filterSelectClass } from '../../components/FormField';
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
        if (mine.length) setSectionId(mine[0].id);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const section = useMemo(
    () => (sections || []).find((s) => s.id === sectionId) || null,
    [sections, sectionId]
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
  }

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
