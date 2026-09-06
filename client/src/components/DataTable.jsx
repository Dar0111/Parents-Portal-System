import { useMemo, useState } from 'react';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';

// Presentational only — it never fetches. The page owns the request and hands
// down rows/loading/error, so the same table renders a roster, a grade list,
// or a backup history without knowing anything about any of them.
//
// No pagination, deliberately: no endpoint in this API accepts limit/offset or
// page (checked across every file in server/routes/ — zero of them read those
// params), so every list arrives whole, and the first consumer is a ~40-row
// attendance roster. Building server pagination controls now would be wiring
// to a contract that does not exist.
// TRIGGER TO REVISIT: the admin GET /api/users list once real accounts exist —
// that is the first list here that could plausibly reach the hundreds.
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
}) {
  const [sort, setSort] = useState(null);

  const sortedRows = useMemo(() => {
    if (!sort || !Array.isArray(rows)) return rows || [];
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
  }, [rows, columns, sort]);

  function toggleSort(column) {
    if (!column.sortable) return;
    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, dir: 'asc' };
      if (current.dir === 'asc') return { key: column.key, dir: 'desc' };
      return null; // third click clears back to the API's own order
    });
  }

  const frame = `overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`;

  if (error) {
    return (
      <div className={frame}>
        <div className="p-4">
          <ErrorAlert message={error} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (loading) {
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

  return (
    <div className={frame}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                      ALIGN[column.align] || ALIGN.left
                    }`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1.5 uppercase tracking-wide transition hover:text-slate-900"
                      >
                        {column.header}
                        <i
                          className={`fa-solid text-[10px] ${
                            active
                              ? sort.dir === 'asc'
                                ? 'fa-arrow-up-short-wide text-slate-700'
                                : 'fa-arrow-down-wide-short text-slate-700'
                              : 'fa-sort text-slate-300'
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
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 text-slate-700 ${ALIGN[column.align] || ALIGN.left}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
