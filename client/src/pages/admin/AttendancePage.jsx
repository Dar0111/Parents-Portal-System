import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import Button from '../../components/Button';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import { cardClass, linkClass } from '../../components/buttonClass';
import { longDate, shortDate } from '../../format/date';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

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
// child's recorded days). The count strip is facts over the rows shown.
//
// §5b: `rows` come from the last successful GET only; load() is the only
// writer. §5c: no LRN in this payload. The student link keys on student_id.
// recorded_by (a user id), id and timestamps are not rendered.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header
// (title, the view-only sentence), the filter card, the list, the count
// strip.

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];
// The count strip's own order — the one the count line always had.
const COUNT_ORDER = ['Present', 'Late', 'Absent', 'Excused'];
const EMPTY = { grade_level: '', section: '', from: '', to: '', status: '' };

export default function AdminAttendancePage() {
  usePageTitle('Attendance');

  // GET /sections is unscoped reference data (23 rows, with adviser_id).
  // A failed load leaves the section select empty; grade and dates still work.
  const [sections, setSections] = useState([]);

  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const dirty = isDirty(draft, applied);

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

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    if (!hasScope) return;
    setLoading(true);
    setError(null);
    try {
      const params = { ...listParams({ offset, sort }) };
      if (applied.grade_level) params.grade_level = applied.grade_level;
      if (applied.section) params.section = applied.section;
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      if (applied.status) params.status = applied.status;
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
  }, [applied, hasScope, offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

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
    setPage(null);
    setOffset(0);
    setApplied(next);
  }

  function resetFilters() {
    setDraft(EMPTY);
    setRows([]);
    setPage(null);
    setOffset(0);
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
            "Attendance is recorded by the section's adviser, so none has been recorded here. Set one under Assignments.",
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
    // A DATE column: `dateStrings: ['DATE']` delivers it as the literal
    // "2026-09-25", so `shortDate` is string surgery and cannot shift a day
    // (§5a-iv). Sorting is untouched — DataTable sorts the row value.
    // A date reads as one value (nowrap) and lines up down the column
    // (tabular figures).
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="tabular-nums">{shortDate(row.date)}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      render: (row) => (
        <Link to={`/admin/students/${row.student_id}`} className={linkClass}>
          {row.last_name}, {row.first_name}
        </Link>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      sortable: true,
      sortValue: (row) => `${row.grade_level}-${row.section}`,
      // A class reads as one value; it does not break at its spaces.
      nowrap: true,
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
    <Reveal className="space-y-6">
      <section className="space-y-3">
        {/* §5i, the description: true because POST /attendance/bulk is ON
            DUPLICATE KEY UPDATE. Does not send the admin to a page they cannot
            open, does not claim the admin can correct, does not say anyone is
            notified. */}
        <SectionHeader
          title="Attendance records"
          description="View only. Each section's adviser records attendance, and corrects a mark by saving that date again on their own Attendance page."
        />

        <form onSubmit={applyFilters} className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
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
            className={filterFieldClass}
            value={draft.from}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
          />
          <FormField
            label="To"
            type="date"
            className={filterFieldClass}
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
          {/* The cue appears here even before anything is fetched: this page
              deliberately shows a PROMPT until a grade or a date range is
              applied (`hasScope`), so "Changes not applied" over the prompt is
              exactly right — something is staged and the list is not it. */}
          <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
        </form>

        {!hasScope ? (
          // In the same frame the list will take, so the page does not change
          // shape when the first filter is applied.
          <div className={cardClass}>
            <EmptyState
              icon="fa-magnifying-glass"
              title="Choose a grade or a date range to see attendance records"
              message="Records are not loaded until you narrow them — the whole school at once is not useful."
            />
          </div>
        ) : (
          <>
            <DataTable
              // RECORD CARD (DV1b-a). Admin's attendance view is read-only —
              // recording is the adviser's — so no `to`, no `onSelect`, no
              // chevron. The learner leads, the date and class share meta, and
              // the status is the badge: each fact once.
              renderCard={(row) => ({
                avatar: `${row.first_name} ${row.last_name}`,
                title: `${row.last_name}, ${row.first_name}`,
                meta: `${longDate(row.date)} · Grade ${row.grade_level} - ${row.section}`,
                status: row.status,
              })}
              columns={columns}
              rows={rows}
              loading={loading}
              queryKey={[applied, hasScope, offset, sort]}
              skeletonAvatar="cards"
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
                  <Button size="sm" onClick={resetFilters}>
                    Reset
                  </Button>
                ) : null
              }
            />
            {/* THE COUNT STRIP — the old count line, same five facts in the
                same order, over the rows SHOWN (this page of the list), never
                a rate. Each status is its badge, so the strip and the Status
                column name a mark the same way; the word is in the badge, so
                nothing here is told by colour alone. */}
            {!loading && !error && rows.length ? (
              <div className={`${cardClass} flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4`}>
                <p className="text-sm font-semibold text-fg">
                  <span className="tabular-nums">{rows.length}</span> record{rows.length === 1 ? '' : 's'}
                </p>
                <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {COUNT_ORDER.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <dt>
                        <StatusBadge status={name} />
                      </dt>
                      <dd className="text-base font-bold tabular-nums text-fg">{counts[name]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </>
        )}
      </section>
    </Reveal>
  );
}
