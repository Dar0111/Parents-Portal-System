import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import { PersonCell } from '../../components/Avatar';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterSelectClass } from '../../components/FormField';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import Reveal from '../../motion/Reveal';
import { usePageTitle } from '../../layout/usePageTitle';

// Admin student roster — Figure 5 process 1.23 (see CLAUDE.md → ADMIN SCOPE
// AUDIT and the scope decision under it). Admin is UNSCOPED: no
// TEACHER_VIEW_SCOPE_SQL, no useTeacherTargets, no GET /assignments.
//
// No Enroll here — the wizard lives on Teacher → Students. No parent-create
// control either: POST /users/parents is authorize('teacher') and answers an
// admin 403 "Access denied." The pending queue is Admin → Users.
//
// STATUS DEFAULTS TO ALL (status=all). An admin roster that hides inactive
// students by default is an incomplete roster presented as complete, and it
// makes the Status column constant. 'active' is sent explicitly for the
// Active option; it is also the server's fall-through default, so a typo
// would silently return active rows (flagged server-side, not fixed here).
//
// §5b: `students` renders from the last successful load(), and load() is
// its ONLY writer. After a status PATCH the page reloads rather than
// replacing the row from the response: the response is server state, but a
// deactivated row replaced in place would stay visible under Status=Active —
// a list that no longer matches the filter it claims to show (§5f/§5i).
//
// §5e: no confirmation on Deactivate/Activate. The same endpoint reverses it
// (students.js PATCH /:id/status, 'active' <-> 'inactive'). Admin → Users
// approve/reject confirm because leaving pending is one-way; this is not.
//
// §5c: the LRN renders here because this is an admin acting on the student.
// It never goes in a URL — the detail route keys on students.id.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header
// (title, what deactivating does), the filter card, the write's result, the
// list. The section list behind the Section filter is reference data read
// once on mount, as before.

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const DEFAULT_FILTERS = { status: 'all', grade_level: '', section: '', search: '' };

export default function StudentsPage() {
  usePageTitle('Students');

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // GET /sections is unscoped reference data. Section is an EXACT match on
  // the server (s.section = ?), so free text would turn a typo into an empty
  // list that reads as "nothing here". A failed load leaves the dropdown
  // empty and disabled — the other filters still work.
  const [sections, setSections] = useState([]);

  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  // Assembled once, trimmed exactly as the commit trims it (item 5). This
  // page's `status` defaults to the STRING 'all', not '', so the comparison
  // has to be value-by-value rather than a truthiness test — `isDirty` is,
  // and `canReset` below already had to work around the same thing by hand.
  const draftFilters = { ...draft, search: draft.search.trim() };
  const dirty = isDirty(draftFilters, applied);

  // Keyed status. The only write here is a row action, so there is one key.
  // It renders directly above the table it describes, not at the top of the
  // page: the row that changed is in that table. See FormStatus.
  const [status, setStatus] = useState({});
  const [statusSavingId, setStatusSavingId] = useState(null);

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { status: applied.status, ...listParams({ offset, sort }) };
      if (applied.grade_level) params.grade_level = applied.grade_level;
      if (applied.section) params.section = applied.section;
      if (applied.search) params.search = applied.search;
      const result = await api.get('/students', { unwrap: ['students', 'page'], params });
      setStudents(result.students);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setStudents([]);
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

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setSections(rows);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The server filters section by NAME only, and section names are unique
  // per grade, not school-wide. So the dropdown waits for a grade: a
  // section picked without one could match a same-named section elsewhere.
  const sectionOptions = useMemo(
    () =>
      draft.grade_level
        ? sections
            .filter((row) => Number(row.grade_level) === Number(draft.grade_level))
            .map((row) => row.name)
            .sort((a, b) => a.localeCompare(b))
        : [],
    [sections, draft.grade_level]
  );

  function applyFilters(event) {
    event.preventDefault();
    // Loading before applied, or the frame between them renders the wrong
    // empty copy (Admin → Users found this).
    setLoading(true);
    setOffset(0);
    setApplied(draftFilters);
  }

  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    setLoading(true);
    setOffset(0);
    setApplied(DEFAULT_FILTERS);
  }

  // Its own value, not a reused flag (§5f): "does the applied state differ
  // from the default" is a separate question from which empty copy applies.
  const canReset =
    applied.status !== DEFAULT_FILTERS.status ||
    Boolean(applied.grade_level || applied.section || applied.search);

  async function setStudentStatus(row, nextStatus) {
    setStatus({});
    setStatusSavingId(row.id);
    try {
      await api.patch(`/students/${row.id}/status`, { status: nextStatus }, { unwrap: 'student' });
      setStatus({
        list: ok(
          nextStatus === 'inactive'
            ? `${row.first_name} ${row.last_name} deactivated.`
            : `${row.first_name} ${row.last_name} activated.`
        ),
      });
      await load();
    } catch (err) {
      setStatus({ list: fail(extractError(err)) });
    } finally {
      setStatusSavingId(null);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      render: (row) => (
        <Link
          to={`/admin/students/${row.id}`}
          className="inline-flex min-w-0 rounded-lg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
        >
          {/* NO `secondary` (UI-B item 2). The class is already its own
              column two cells to the right, so a line under the name repeats
              it at exactly the width where the column is visible. It earns
              its place on the CARD, where there are no columns — which is
              why the card below keeps its subtitle and this does not. */}
          <PersonCell name={`${row.last_name}, ${row.first_name}`} nameClass="text-brand" />
        </Link>
      ),
    },
    // nowrap: an LRN is an identifier, never text to reflow (§5c). Tabular
    // figures so twelve digits line up down the column.
    { key: 'lrn', header: 'LRN', nowrap: true, render: (row) => <span className="tabular-nums">{row.lrn}</span> },
    {
      key: 'class',
      header: 'Grade & section',
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
    {
      key: 'action',
      header: '',
      align: 'right',
      // The button keeps one line and the column claims its own width.
      nowrap: true,
      render: (row) => {
        const busy = statusSavingId === row.id;
        const next = row.status === 'active' ? 'inactive' : 'active';
        return (
          // `loading` is the old `disabled={busy}` and its spinner — and the
          // WORD STAYS beside the spinner now. It used to be replaced by it,
          // which left a button with no name for as long as the request ran
          // and made the column jump in width.
          <Button size="sm" loading={busy} onClick={() => setStudentStatus(row, next)}>
            {next === 'inactive' ? 'Deactivate' : 'Activate'}
          </Button>
        );
      },
    },
  ];

  return (
    <Reveal className="space-y-6">
      <section className="space-y-3">
        {/* §5i: every clause here is enforced by a line of server code.
            Hidden from teachers' lists — GET /students defaults to active-only
            (students.js), and Teacher → Attendance fetches status=active.
            No new attendance — attendance.js POST / and POST /bulk refuse an
            inactive student. No new grade record — grades.js POST / refuses one.
            Nothing else changes — PATCH /:id/status updates students.status
            only. Deliberately NOT claimed: that the parent loses access
            (login checks the parent's own users.status), or that grades are
            frozen (scores can still be added to an existing grade record).

            The sentence is the header's description, held to a reading
            measure. There is no header action: nothing is created here. */}
        <SectionHeader
          title="Students"
          description={
            <span className="block max-w-prose">
              Deactivating a student hides them from teachers' student and attendance lists, and
              stops new attendance and new grade records from being created for them. Their
              existing records and their parent's account are not changed. Activate reverses it.
            </span>
          }
        />

        {/* The filter bar is its own card. */}
        <form onSubmit={applyFilters} className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
          <FormField
            label="Status"
            as="select"
            className={filterSelectClass}
            value={draft.status}
            onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </FormField>
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
            {sectionOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FormField>
          <FormField
            label="Search"
            placeholder="Name or LRN"
            value={draft.search}
            onChange={(e) => setDraft((prev) => ({ ...prev, search: e.target.value }))}
            className="min-w-56 flex-1"
          />
          {/* Search keeps `min-w-56 flex-1` — like `teacher/StudentsPage`, it
              is this page's widest control by choice, not by omission, so
              `filterFieldClass` is deliberately not applied to it (item 5). */}
          <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
        </form>

        {/* §5f: two causes, two branches. canReset decides both the copy and
            whether Reset is offered — offering it on "nothing exists" would be
            a dead end. */}
        <FormStatus status={status.list} />

        <DataTable
          // The Student column and the card both lead with an avatar, so the
          // skeleton does too (fix round F4).
          skeletonAvatar
          // Same primary action as the teacher roster, same reason the LRN is
          // not on the card (§5c) even though the table column keeps it — the
          // table is a desk screen, the card is a phone.
          renderCard={(row) => ({
            to: `/admin/students/${row.id}`,
            avatar: `${row.first_name} ${row.last_name}`,
            title: `${row.last_name}, ${row.first_name}`,
            subtitle: `Grade ${row.grade_level} - ${row.section}`,
            status: row.status,
          })}
          columns={columns}
          rows={students}
          loading={loading}
          queryKey={[applied, offset, sort]}
          error={error}
          onRetry={load}
          page={page}
          onPageChange={setOffset}
          sort={sort}
          onSortChange={changeSort}
          emptyIcon={canReset ? 'fa-magnifying-glass' : 'fa-user-graduate'}
          emptyTitle={canReset ? 'No students match these filters' : 'No students yet'}
          emptyMessage={
            canReset
              ? 'Try a different status, grade, section, or search, or reset to see every student.'
              : 'Students enrolled by teachers appear here.'
          }
          emptyAction={
            canReset ? (
              <Button size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : null
          }
        />
      </section>
    </Reveal>
  );
}
