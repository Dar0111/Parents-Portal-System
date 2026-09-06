import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher student list. READ ONLY — no create, no edit, no attendance history.
// Those are separate pages; this one answers "who is in my classes".
//
// Read scope is assigned OR section adviser (utils/teacherScope.js), so an
// adviser holding no subject assignments still sees their advisory section —
// TCH-002 is the account that proves it.

export default function StudentsPage() {
  usePageTitle('Students');

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Committed filter values — what has actually been sent to the API. Kept
  // separate from the input's own value so typing does not fire a request per
  // keystroke, and so the empty state can tell "no students at all" from "no
  // students matching a filter".
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [applied, setApplied] = useState({ search: '', section: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // NOTE: ?status is deliberately NOT sent. The endpoint matches only
      // 'inactive' and 'all' as literals; everything else — including 'active'
      // — falls through to an active-only default, which is the one branch
      // that is actually verified. '?status=all' is recorded as UNVERIFIED
      // (the seed has zero inactive students, so its live check could not have
      // failed), and this page will not build on that. Consequence, recorded
      // as a known gap rather than hidden: a transferred-out student simply
      // disappears from this list with no explanation.
      const params = {};
      if (applied.search) params.search = applied.search;
      if (applied.section) params.section = applied.section;

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

  function applyFilters(event) {
    event.preventDefault();
    setApplied({ search: search.trim(), section: section.trim() });
  }

  function clearFilters() {
    setSearch('');
    setSection('');
    setApplied({ search: '', section: '' });
  }

  const filtered = Boolean(applied.search || applied.section);

  const columns = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      // A <Link> in the cell rather than a clickable row: DataTable has no
      // onRowClick, and adding one for the first page that wants it would
      // shape a shared primitive around a single caller. If a second page
      // needs whole-row clicking, that is the trigger to add it.
      render: (row) => (
        <Link
          to={`/teacher/students/${row.id}`}
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
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <form
        onSubmit={applyFilters}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <FormField
          label="Search"
          placeholder="Name or LRN"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-56 flex-1"
        />
        <FormField
          label="Section"
          placeholder="e.g. Malikhain"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="min-w-44"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Apply
        </button>
        {filtered ? (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            Clear
          </button>
        ) : null}
      </form>

      <DataTable
        columns={columns}
        rows={students}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={filtered ? 'fa-magnifying-glass' : 'fa-user-graduate'}
        // Two genuinely different situations, deliberately not one message:
        // an empty scope is not the same as a filter that matched nothing.
        emptyTitle={filtered ? 'No students match that search' : 'No students assigned to you yet'}
        emptyMessage={
          filtered
            ? 'Try a different name, LRN, or section.'
            : 'You see students in the sections you teach or advise. An admin can assign you to a section.'
        }
        emptyAction={
          filtered ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Clear filters
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
