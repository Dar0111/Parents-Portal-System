import { useEffect, useMemo, useState } from 'react';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';

// Presentational only — it never fetches. The page owns the request and hands
// down rows/loading/error, so the same table renders a roster, a grade list,
// or a backup history without knowing anything about any of them.
//
// TWO MODES, decided by the `page` prop (2026-09-19, Server hardening C):
//
//   WHOLE LIST (no `page`): rows are the complete set and the table sorts
//   them client-side — the original behaviour, kept for the tables whose
//   source is not paginated (a report card) or is fetched whole (fetchAll).
//
//   PAGED (`page` = the API's { limit, offset, total, has_more }): rows are
//   ONE page. Sorting one page client-side would be wrong (the top row of
//   page 2 is not the top row of the set), so sorting is CONTROLLED here —
//   the header click calls onSortChange({ key, dir } | null) and the page
//   re-requests with sort/order against the server's allow-list; nothing is
//   sorted locally. A footer renders "1–50 of 812" with Previous / Next,
//   disabled at the bounds, calling onPageChange(nextOffset). The pager is
//   still rendered when everything fits on one page (disabled), so a list
//   never changes shape as it grows.
//
//   C7: a page that is empty while the set is not (the last row of page 2
//   was just approved away) is a page that no longer exists — the table asks
//   for the last page that does, instead of showing "nothing here" over a
//   list that has rows. That decision lives here so no page re-implements it.
//
// Loading / error / empty are rendered INSIDE the table frame rather than left
// to the page, so no page has to re-implement the three-state dance and none
// of them can quietly disagree about what "no rows" looks like.

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

// Compares two NON-empty values. Emptiness is handled by the caller, on
// purpose: "nulls last" must be resolved BEFORE the ascending/descending
// multiplier is applied, or descending flips it to nulls-first — which is
// exactly the case that matters, since sorting a grades column descending to
// find top marks would otherwise put every ungraded row at the top.
function compare(a, b) {
  if (a === b) return 0;

  const numA = typeof a === 'number' ? a : Number(a);
  const numB = typeof b === 'number' ? b : Number(b);
  // mysql2 returns DECIMAL columns as strings ("90.00"), so a numeric column
  // arrives here as text and must not be compared lexicographically.
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;

  return String(a).localeCompare(String(b));
}

// The offset of the last page that holds at least one row.
function lastPageOffset(page) {
  if (!page || page.total <= 0) return 0;
  return Math.floor((page.total - 1) / page.limit) * page.limit;
}

export default function DataTable({
  columns,
  rows,
  keyField = 'id',
  loading = false,
  error = null,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  emptyAction,
  className = '',
  // Paged mode (all four together; see the header comment).
  page = null,
  onPageChange,
  sort: controlledSort,
  onSortChange,
}) {
  const paged = Boolean(page);
  const [localSort, setLocalSort] = useState(null);
  const sort = paged ? controlledSort || null : localSort;

  const sortedRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    // Paged: the server ordered this page; never reorder it locally.
    if (paged || !sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;

    const valueOf = column.sortValue || ((row) => row[column.key]);
    const factor = sort.dir === 'desc' ? -1 : 1;

    // Copy before sorting — never mutate the array the page owns.
    return [...rows].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      const leftEmpty = isEmpty(left);
      const rightEmpty = isEmpty(right);

      // Empties sink to the bottom in BOTH directions, so this runs outside
      // the `* factor` below. Two empties compare equal, and Array#sort is
      // stable, so they keep their incoming order relative to each other.
      if (leftEmpty && rightEmpty) return 0;
      if (leftEmpty) return 1;
      if (rightEmpty) return -1;

      return compare(left, right) * factor;
    });
  }, [rows, columns, sort, paged]);

  // C7 — see the header comment. Only in paged mode, only once the page has
  // settled (not loading, no error), and only when the set itself has rows.
  const pageIsStale = paged && !loading && !error && page.total > 0 && sortedRows.length === 0 && page.offset > 0;
  useEffect(() => {
    if (pageIsStale && onPageChange) onPageChange(lastPageOffset(page));
  }, [pageIsStale, onPageChange, page]);

  function nextSort(current, column) {
    if (current?.key !== column.key) return { key: column.key, dir: 'asc' };
    if (current.dir === 'asc') return { key: column.key, dir: 'desc' };
    return null; // third click clears back to the API's own order
  }

  function toggleSort(column) {
    if (!column.sortable) return;
    if (paged) {
      if (onSortChange) onSortChange(nextSort(sort, column));
      return;
    }
    setLocalSort((current) => nextSort(current, column));
  }

  const frame = `overflow-hidden rounded-xl border border-edge bg-surface ${className}`;

  if (error) {
    return (
      <div className={frame}>
        <div className="p-4">
          <ErrorAlert message={error} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (loading || pageIsStale) {
    return (
      <div className={frame}>
        <LoadingSpinner className="py-12" />
      </div>
    );
  }

  if (!sortedRows.length) {
    return (
      <div className={frame}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          message={emptyMessage}
          action={emptyAction}
        />
      </div>
    );
  }

  const first = paged ? page.offset + 1 : 1;
  const last = paged ? page.offset + sortedRows.length : sortedRows.length;
  const canPrev = paged && page.offset > 0;
  const canNext = paged && page.has_more;

  return (
    <div className={frame}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-subtle">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-body ${
                      ALIGN[column.align] || ALIGN.left
                    }`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1.5 uppercase tracking-wide transition hover:text-fg"
                      >
                        {column.header}
                        <i
                          className={`fa-solid text-[0.625rem] ${
                            active
                              ? sort.dir === 'asc'
                                ? 'fa-arrow-up-short-wide text-fg-secondary'
                                : 'fa-arrow-down-wide-short text-fg-secondary'
                              : 'fa-sort text-fg-ghost'
                          }`}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row, index) => (
              <tr
                key={row[keyField] ?? index}
                className="border-b border-edge-soft last:border-0 hover:bg-surface-subtle"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 text-fg-secondary ${ALIGN[column.align] || ALIGN.left}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paged && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-edge bg-surface-subtle px-4 py-2 text-xs text-fg-body"
          data-testid="datatable-pager"
        >
          <span>
            {first}–{last} of {page.total}
          </span>
          <span className="inline-flex gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => onPageChange && onPageChange(Math.max(0, page.offset - page.limit))}
              className="rounded-lg border border-edge-strong bg-surface px-2.5 py-1 font-medium text-fg-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="fa-solid fa-chevron-left mr-1 text-[0.625rem]" />
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => onPageChange && onPageChange(page.offset + page.limit)}
              className="rounded-lg border border-edge-strong bg-surface px-2.5 py-1 font-medium text-fg-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <i className="fa-solid fa-chevron-right ml-1 text-[0.625rem]" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
