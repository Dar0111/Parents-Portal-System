import { useCallback, useEffect, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import { timestampDay } from '../../format/date';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import { linkClass } from '../../components/buttonClass';
import Reveal from '../../motion/Reveal';
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
//
// RELOAD (feat/ui-refresh) is `load` itself — the same request with the page
// and sort that are applied now; nothing is reset. The table's own frame
// shows the loading and error states, as on the first load.

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
          <button type="button" onClick={() => setReading(row)} className={`${linkClass} text-left`}>
            {row.title}
          </button>
          <div className="mt-0.5 line-clamp-2 max-w-2xl text-xs text-fg-muted">{row.content}</div>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Posted',
      sortable: true,
      // A TIMESTAMP → the school's calendar day. Slicing the ISO string
      // showed the previous day before 08:00 PH (format/date.js).
      nowrap: true,
      render: (row) => <span className="tabular-nums">{timestampDay(row.created_at)}</span>,
    },
  ];

  return (
    <>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* No audience label on a memo row: memos have no targeting columns
              at all, so the fact is true of the whole page rather than of any
              row — it is the section's own description. */}
          <SectionHeader
            title="Posted memos"
            description="Memos come from the school administration and go to everyone."
            onReload={load}
            reloading={loading}
            reloadLabel="Reload memos"
          />

          <DataTable
            // CONTENT-LIST CARD (DV1b-a). Memos are school-wide, so there is
            // no audience to show and meta carries only the date.
            // `posted_by_name` is deliberately NOT on the card: the table does
            // not show it either on this page, and it belongs to the detail
            // modal — adding it here would put a fact on the card that the
            // list never carried.
            renderCard={(row) => ({
              onSelect: () => setReading(row),
              title: row.title,
              subtitle: row.content,
              meta: timestampDay(row.created_at),
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
            emptyIcon="fa-file-lines"
            emptyTitle="No memos yet"
            // This endpoint accepts no filters and needs no student, so there
            // is exactly one cause of an empty list. Convention 5f applies
            // here by having one honest branch, not none — and forcing a
            // second would be the invented flag the convention exists to
            // prevent.
            emptyMessage="Memos from the school administration will appear here."
          />
        </section>
      </Reveal>

      {/* OUTSIDE the entrance wrapper: Modal renders inline behind a fixed
          backdrop, so it must never sit under an element that can carry a
          transform (motion/motion.js). Its body is the scroller. */}
      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.title}
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-fg-muted">
            <span className="tabular-nums">Posted {timestampDay(reading?.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>Posted by {reading?.posted_by_name}</span>
          </div>
          {/* Reading text: one step larger than the body size, in a column
              that stays under ~75 characters however wide the dialog is. */}
          <p className="max-w-prose whitespace-pre-wrap break-words text-base leading-relaxed text-fg-body">
            {reading?.content}
          </p>
        </div>
      </Modal>
    </>
  );
}
