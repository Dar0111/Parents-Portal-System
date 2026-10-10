import { useCallback, useEffect, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import SectionHeader from '../../components/SectionHeader';
import { timestampDay } from '../../format/date';
import Reveal from '../../motion/Reveal';
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
// Posted by is attribution only. A name does not unlock a control —
// writes stay admin-only; this is not the start of an Actions column.
//
// Memos also have NO targeting columns at all — no target_grade, no
// target_section — so they are school-wide by schema design and there is
// nothing to filter by. GET /api/memos accepts no query parameters.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section. The sentence
// that explains why the list has no controls is the section's description,
// under its title.

export default function MemosPage() {
  usePageTitle('Memos');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          <div className="font-semibold text-fg">{row.title}</div>
          <div className="mt-0.5 line-clamp-2 max-w-2xl text-xs text-fg-muted">{row.content}</div>
        </div>
      ),
    },
    {
      key: 'posted_by_name',
      header: 'Posted by',
      sortable: true,
      // Never null: INNER JOIN on posted_by NOT NULL + ON DELETE RESTRICT
      // (71d23f9). DataTable's nulls-last path has no case to get wrong here.
      render: (row) => row.posted_by_name,
    },
    {
      key: 'created_at',
      header: 'Posted',
      sortable: true,
      nowrap: true,
      // A TIMESTAMP, converted to the school's day. Slicing the ISO string
      // showed the previous day before 08:00 PH (format/date.js).
      render: (row) => <span className="tabular-nums">{timestampDay(row.created_at)}</span>,
    },
  ];

  return (
    <Reveal className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Posted memos"
          // The page's one explanation, capped to a readable line length.
          description={
            <span className="block max-w-prose">
              Memos are posted by the school administration and go to everyone. Teachers read them
              here; to reach your own class, use Announcements.
            </span>
          }
        />

        <DataTable
          // CONTENT-LIST CARD (DV1b-a). Memos are school-wide by definition —
          // the table has no audience column because there is nothing to vary —
          // so meta carries who posted it and when, and nothing repeats.
          //
          // Static card: a teacher does not own a memo and this page offers no
          // per-row action, so neither `to` nor `onSelect` is passed and no
          // chevron is drawn.
          renderCard={(row) => ({
            title: row.title,
            subtitle: row.content,
            meta: `${row.posted_by_name} · ${timestampDay(row.created_at)}`,
          })}
          columns={columns}
          rows={rows}
          loading={loading}
          queryKey={[offset, sort]}
          error={error}
          onRetry={load}
          page={page}
          onPageChange={setOffset}
          sort={sort}
          onSortChange={changeSort}
          emptyIcon="fa-file-lines"
          emptyTitle="No memos yet"
          // No filters exist on this endpoint, so there is only one empty case —
          // nothing to disambiguate, and no filter-state branch to derive
          // (convention 5f applies by having exactly one branch here, not none).
          emptyMessage="Memos from the school administration will appear here."
        />
      </section>
    </Reveal>
  );
}
