import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher memos — READ ONLY, and that is the whole design.
//
// POST, PUT and DELETE on /api/memos are all authorize('admin') in
// routes/content.js, so a teacher never reaches those handlers: the middleware
// answers 403 "Access denied." before any of them runs. A compose or edit
// control on this page would therefore fail 100% of the time, which is exactly
// the dead-end affordance the Students page (no Edit button) and the Excuse
// Letters page (no Review button outside adviser scope) set a precedent
// against.
//
// The page says so plainly instead, because a list with no controls and no
// explanation reads as unfinished rather than as intentional.
//
// Memos also have NO targeting columns at all — no target_grade, no
// target_section — so they are school-wide by schema design and there is
// nothing to filter by. GET /api/memos accepts no query parameters.

export default function MemosPage() {
  usePageTitle('Memos');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          <div className="font-medium text-slate-900">{row.title}</div>
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
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <i className="fa-solid fa-circle-info mr-2 text-slate-400" />
        Memos are posted by the school administration and go to everyone. Teachers read them here;
        to reach your own class, use Announcements.
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon="fa-file-lines"
        emptyTitle="No memos yet"
        // No filters exist on this endpoint, so there is only one empty case —
        // nothing to disambiguate, and no filter-state branch to derive
        // (convention 5f applies by having exactly one branch here, not none).
        emptyMessage="Memos from the school administration will appear here."
      />
    </div>
  );
}
