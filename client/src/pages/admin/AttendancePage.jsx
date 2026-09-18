import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import FormField, { filterSelectClass } from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// Admin attendance records — Figure 5 process 1.15 ("view all attendance
// record"). VIEW ONLY. The API lets admin POST /, POST /bulk and PUT /:id
// (one of the three places the ADMIN SCOPE AUDIT records the API exceeding
// Figure 5); this page calls none of them.
//
// Sibling of teacher/AttendanceRecordsPage.jsx, minus what exists because a
// teacher advises one section: no "my sections" filter, no mine[0]
// auto-select (meaningless across 23 sections), no link to /teacher/attendance
// (an admin cannot open it — the §5i line here says who corrects a mark and
// sends the admin nowhere).
//
// Grade-then-section pair copied from admin/StudentsPage.jsx: GET /attendance
// filters section by NAME only (s.section = ?), and names are unique per
// grade, so the section select waits for a grade.
//
// NOTHING IS FETCHED until a grade or a date range is applied. GET /attendance
// has no limit; with no filters it returns every row in the school — a real
// answer nobody wants. The first state is a prompt.
//
// Never send `date` — that branch drops from/to. One day is From = To.
//
// NO RATE. A percentage across different students on different dates
// measures nothing (Parent → Attendance's rate is one child over that
// child's recorded days). The count line is facts over the rows shown.
//
// §5b: `rows` come from the last successful GET only; load() is the only
// writer. §5c: no LRN in this payload. The student link keys on student_id.
// recorded_by (a user id), id and timestamps are not rendered.

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];
const EMPTY = { grade_level: '', section: '', from: '', to: '', status: '' };

export default function AdminAttendancePage() {
  usePageTitle('Attendance');

  // GET /sections is unscoped reference data (23 rows, with adviser_id).
  // A failed load leaves the section select empty; grade and dates still work.
  const [sections, setSections] = useState([]);

  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setSections(all);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Grade or a date range — status alone is not enough to bound the fetch.
  const hasScope = Boolean(applied.grade_level || applied.from || applied.to);

  const load = useCallback(async () => {
    if (!hasScope) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (applied.grade_level) params.grade_level = applied.grade_level;
      if (applied.section) params.section = applied.section;
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      if (applied.status) params.status = applied.status;
      setRows(await api.get('/attendance', { unwrap: 'attendance', params }));
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, hasScope]);

  useEffect(() => {
    load();
  }, [load]);

  const sectionOptions = useMemo(
    () =>
      draft.grade_level
        ? sections
            .filter((s) => Number(s.grade_level) === Number(draft.grade_level))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [sections, draft.grade_level]
  );

  const appliedSection = useMemo(
    () =>
      applied.section
        ? sections.find(
            (s) => Number(s.grade_level) === Number(applied.grade_level) && s.name === applied.section
          ) || null
        : null,
    [sections, applied.grade_level, applied.section]
  );

  function applyFilters(event) {
    event.preventDefault();
    const next = { ...draft };
    // Loading before applied, so the frame between them cannot render the
    // wrong empty copy. Only when a fetch will actually run.
    if (next.grade_level || next.from || next.to) setLoading(true);
    setRows([]);
    setApplied(next);
  }

  function resetFilters() {
    setDraft(EMPTY);
    setRows([]);
    setError(null);
    setApplied(EMPTY);
  }

  // Its own value (§5f): whether anything is applied is a different question
  // from which empty copy applies.
  const canReset = Object.values(applied).some(Boolean);

  const counts = useMemo(() => {
    const c = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
    for (const row of rows) if (c[row.status] !== undefined) c[row.status] += 1;
    return c;
  }, [rows]);

  // §5f — one branch per cause. Only the "filters matched nothing" branch
  // offers Reset in the table: in the others, resetting reveals nothing.
  const emptyState = (() => {
    if (applied.from || applied.to || applied.status) {
      return {
        icon: 'fa-filter',
        title: 'No records match these filters',
        message: 'Try different dates or a different status, or reset.',
        showReset: true,
      };
    }
    if (applied.section) {
      const label = `Grade ${applied.grade_level} - ${applied.section}`;
      if (appliedSection && appliedSection.adviser_id == null) {
        return {
          icon: 'fa-user-slash',
          title: `${label} has no adviser`,
          message:
            "Attendance is recorded by the section's adviser, so none has been recorded here.",
          showReset: false,
        };
      }
      return {
        icon: 'fa-clipboard-user',
        title: `No attendance recorded for ${label} yet`,
        message: 'Records appear here after the adviser saves a day.',
        showReset: false,
      };
    }
    return {
      icon: 'fa-clipboard-user',
      title: `No attendance recorded for Grade ${applied.grade_level} yet`,
      message: 'Records appear here after an adviser saves a day.',
      showReset: false,
    };
  })();

  const columns = [
    { key: 'date', header: 'Date', sortable: true },
    {
      key: 'student',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      render: (row) => (
        <Link
          to={`/admin/students/${row.student_id}`}
          className="font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {row.last_name}, {row.first_name}
        </Link>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      sortable: true,
      sortValue: (row) => `${row.grade_level}-${row.section}`,
      render: (row) => `Grade ${row.grade_level} - ${row.section}`,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* §5i: true because POST /attendance/bulk is ON DUPLICATE KEY UPDATE.
          Does not send the admin to a page they cannot open, does not claim
          the admin can correct, does not say anyone is notified. */}
      <p className="text-sm text-slate-500">
        View only. Each section&apos;s adviser records attendance, and corrects a mark by saving
        that date again on their own Attendance page.
      </p>

      <form
        onSubmit={applyFilters}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <FormField
          label="Grade"
          as="select"
          className={filterSelectClass}
          value={draft.grade_level}
          onChange={(e) => setDraft((prev) => ({ ...prev, grade_level: e.target.value, section: '' }))}
        >
          <option value="">All grades</option>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <option key={g} value={String(g)}>
              Grade {g}
            </option>
          ))}
        </FormField>
        <FormField
          label="Section"
          as="select"
          className={filterSelectClass}
          value={draft.section}
          disabled={!draft.grade_level}
          onChange={(e) => setDraft((prev) => ({ ...prev, section: e.target.value }))}
        >
          <option value="">{draft.grade_level ? 'All sections' : 'Pick a grade first'}</option>
          {sectionOptions.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
              {s.adviser_id == null ? ' (no adviser)' : ''}
            </option>
          ))}
        </FormField>
        <FormField
          label="From"
          type="date"
          value={draft.from}
          onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
        />
        <FormField
          label="To"
          type="date"
          value={draft.to}
          onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
        />
        <FormField
          label="Status"
          as="select"
          className={filterSelectClass}
          value={draft.status}
          onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FormField>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Apply
        </button>
        {canReset ? (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            Reset
          </button>
        ) : null}
      </form>

      {!hasScope ? (
        <EmptyState
          icon="fa-magnifying-glass"
          title="Choose a grade or a date range to see attendance records"
          message="Records are not loaded until you narrow them — the whole school at once is not useful."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            loading={loading}
            error={error}
            onRetry={load}
            emptyIcon={emptyState.icon}
            emptyTitle={emptyState.title}
            emptyMessage={emptyState.message}
            emptyAction={
              emptyState.showReset ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  Reset
                </button>
              ) : null
            }
          />
          {!loading && !error && rows.length ? (
            <p className="text-sm text-slate-500">
              {rows.length} record{rows.length === 1 ? '' : 's'} · Present {counts.Present} · Late{' '}
              {counts.Late} · Absent {counts.Absent} · Excused {counts.Excused}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
