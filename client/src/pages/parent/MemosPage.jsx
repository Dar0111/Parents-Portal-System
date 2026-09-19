import { useCallback, useEffect, useState } from 'react';
import api, { listParams } from '../../api/axios';
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
// NOT RENDERED: `attachment_url` (column exists, nothing uploads).
// `posted_by` is still on the row and is still not shown (teacher pages
// authorize edits with the numeric id). The name is posted_by_name,
// INNER JOINed 2026-09-11 (71d23f9); this page renders it in the modal
// only (2026-09-12). Only admins POST memos, so the value is always an
// admin; it is still rendered — same line as the other two pages.

export default function ParentMemosPage() {
  usePageTitle('Memos');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get('/memos', { unwrap: ['memos', 'page'], params: listParams({ offset, sort }) });
      setRows(result.memos);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

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
            className="text-left font-medium text-brand underline-offset-2 hover:underline"
          >
            {row.title}
          </button>
          <div className="line-clamp-2 max-w-2xl text-xs text-fg-muted">{row.content}</div>
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
      <p className="rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-fg-body">
        <i className="fa-solid fa-circle-info mr-2 text-fg-faint" />
        Memos come from the school administration and go to everyone.
      </p>

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
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>Posted {String(reading?.created_at).slice(0, 10)}</span>
            <span aria-hidden="true">·</span>
            <span>Posted by {reading?.posted_by_name}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-secondary">
            {reading?.content}
          </p>
        </div>
      </Modal>
    </div>
  );
}
