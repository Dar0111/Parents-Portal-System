import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
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

  // Page-level XOR (Teacher → Grades, 2026-09-07): one strip at a time.
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [statusSavingId, setStatusSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { status: applied.status };
      if (applied.grade_level) params.grade_level = applied.grade_level;
      if (applied.section) params.section = applied.section;
      if (applied.search) params.search = applied.search;
      const rows = await api.get('/students', { unwrap: 'students', params });
      setStudents(rows);
    } catch (err) {
      setError(extractError(err));
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [applied]);

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
    setApplied({ ...draft, search: draft.search.trim() });
  }

  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    setLoading(true);
    setApplied(DEFAULT_FILTERS);
  }

  // Its own value, not a reused flag (§5f): "does the applied state differ
  // from the default" is a separate question from which empty copy applies.
  const canReset =
    applied.status !== DEFAULT_FILTERS.status ||
    Boolean(applied.grade_level || applied.section || applied.search);

  async function setStudentStatus(row, nextStatus) {
    setSaveError(null);
    setSaveMessage(null);
    setStatusSavingId(row.id);
    try {
      await api.patch(`/students/${row.id}/status`, { status: nextStatus }, { unwrap: 'student' });
      setSaveMessage(
        nextStatus === 'inactive'
          ? `${row.first_name} ${row.last_name} deactivated.`
          : `${row.first_name} ${row.last_name} activated.`
      );
      await load();
    } catch (err) {
      setSaveError(extractError(err));
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
          className="font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {row.last_name}, {row.first_name}
        </Link>
      ),
    },
    { key: 'lrn', header: 'LRN' },
    {
      key: 'class',
      header: 'Grade & section',
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
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => {
        const busy = statusSavingId === row.id;
        const next = row.status === 'active' ? 'inactive' : 'active';
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStudentStatus(row, next)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {busy ? (
              <i className="fa-solid fa-circle-notch fa-spin" />
            ) : next === 'inactive' ? (
              'Deactivate'
            ) : (
              'Activate'
            )}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
      ) : null}

      {/* §5i: every clause here is enforced by a line of server code.
          Hidden from teachers' lists — GET /students defaults to active-only
          (students.js), and Teacher → Attendance fetches status=active.
          No new attendance — attendance.js POST / and POST /bulk refuse an
          inactive student. No new grade record — grades.js POST / refuses one.
          Nothing else changes — PATCH /:id/status updates students.status
          only. Deliberately NOT claimed: that the parent loses access
          (login checks the parent's own users.status), or that grades are
          frozen (scores can still be added to an existing grade record). */}
      <p className="text-sm text-slate-500">
        Deactivating a student hides them from teachers' student and attendance lists, and stops
        new attendance and new grade records from being created for them. Their existing records
        and their parent's account are not changed. Activate reverses it.
      </p>

      <form
        onSubmit={applyFilters}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <FormField
          label="Status"
          as="select"
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

      {/* §5f: two causes, two branches. canReset decides both the copy and
          whether Reset is offered — offering it on "nothing exists" would be
          a dead end. */}
      <DataTable
        columns={columns}
        rows={students}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={canReset ? 'fa-magnifying-glass' : 'fa-user-graduate'}
        emptyTitle={canReset ? 'No students match these filters' : 'No students yet'}
        emptyMessage={
          canReset
            ? 'Try a different status, grade, section, or search, or reset to see every student.'
            : 'Students enrolled by teachers appear here.'
        }
        emptyAction={
          canReset ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Reset filters
            </button>
          ) : null
        }
      />

      {students.length ? (
        <p className="text-sm text-slate-500">
          {students.length} student{students.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
