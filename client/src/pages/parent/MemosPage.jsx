import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent memos — READ ONLY, like every role's memos page.
//
// NO COMPOSE, EDIT OR DELETE. POST/PUT/DELETE on /api/memos are all
// authorize('admin'), so a parent gets the same 403 "Access denied." from the
// middleware that a teacher does. The teacher page says who posts memos for
// the same reason this one does: a list with no controls and no explanation
// reads as unfinished rather than as intentional.
//
// FULL TEXT OPENS IN A MODAL, NOT A DETAIL ROUTE — there is no
// GET /api/memos/:id (404 "Route not found." from server.js's fallback), so a
// detail route would have to fetch the whole collection to render one row. The
// list row already carries every column (SELECT *), so the modal costs no
// request.
//
// NO FILTERS, AND NOT BY CHOICE: GET /api/memos accepts no query parameters at
// all. Verified live — ?grade_level=1 returns 200 with the full list, silently
// ignored, where announcements and events answer 400 on a bad grade_level.
// That inconsistency is recorded in CLAUDE.md as a backend finding, not worked
// around here.
//
// THIS IS THE ONE PAGE OF THE THREE WITH NO student_id DEPENDENCY. The memos
// handler has no parent branch — it returns every row to every role — while
// the announcements and events handlers return an empty array when
// getStudentClass() finds no student. So a parent whose account is not linked
// to a student sees all memos and zero announcements/events. That asymmetry is
// why this page has exactly ONE empty branch and those two have two and three.
//
// NOT RENDERED: `attachment_url` (column exists, nothing uploads, so an
// affordance would promise a feature that does not exist) and `posted_by` (a
// bare integer with no join, and GET /api/users/:id is admin-only, so it
// cannot be resolved to a name).

export default function ParentMemosPage() {
  usePageTitle('Memos');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/memos', { unwrap: 'memos' }));
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: 'title',
      header: 'Memo',
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
          <div className="line-clamp-2 max-w-2xl text-xs text-slate-500">{row.content}</div>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Posted',
      sortable: true,
      render: (row) => String(row.created_at).slice(0, 10),
    },
  ];

  return (
    <div className="space-y-4">
      {/* No audience label on a memo row: memos have no targeting columns at
          all, so the fact is true of the whole page rather than of any row. */}
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <i className="fa-solid fa-circle-info mr-2 text-slate-400" />
        Memos come from the school administration and go to everyone.
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon="fa-file-lines"
        emptyTitle="No memos yet"
        // This endpoint accepts no filters and needs no student, so there is
        // exactly one cause of an empty list. Convention 5f applies here by
        // having one honest branch, not none — and forcing a second would be
        // the invented flag the convention exists to prevent.
        emptyMessage="Memos from the school administration will appear here."
      />

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.title}
        size="lg"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          <p className="mb-3 text-xs text-slate-500">
            Posted {String(reading?.created_at).slice(0, 10)}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {reading?.content}
          </p>
        </div>
      </Modal>
    </div>
  );
}
