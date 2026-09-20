import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';
import StatusBadge from './StatusBadge';

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
//
// ---------------------------------------------------------------------------
// CARD LAYOUT BELOW `sm` (DV1, 2026-09-20) — opt-in via `renderCard`
// ---------------------------------------------------------------------------
// A six-column table on a 390px phone is the parent's NORMAL case, not an edge
// one, and the answer to it was a horizontal scrollbar. A page that supplies
// `renderCard` gets stacked cards under `sm` instead, and the table from `sm`
// up; a page that does not is completely unchanged. That opt-in is what lets
// this land six pages at a time instead of twenty-two in one review.
//
// `renderCard(row)` returns DATA, NEVER JSX:
//
//   { to?, onSelect?, avatar?, title, subtitle?, meta?, status?, statusTone?,
//     actions? }
//
// and the reason is the accessibility rule below. A column's `render` returns
// cell JSX full of buttons — reusing it here would put a button inside a link.
// Returning data makes that unrepresentable rather than merely discouraged.
//
// EXACTLY ONE INTERACTIVE ELEMENT PER CARD, and it is a real <Link> or
// <button>: focusable, Enter/Space, a visible focus ring, no `onClick` on a
// div anywhere. A card with `to` or `onSelect` is that one element and shows a
// chevron. A page with no single primary action — the Users directory, where
// Edit / Reset password / Deactivate are three peers — passes NEITHER, and the
// card renders STATIC with no chevron and its actions in a row underneath. A
// card that looks tappable and is not is worse than one that never claimed to
// be.
//
// The table is unchanged in this respect: rows stay non-interactive <tr>s and
// actions stay real buttons in the Actions cell.

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

// The inside of a card, shared by all three outer shapes (link, button,
// static) so they cannot drift apart. `interactive` only decides whether the
// chevron is drawn — it is not a style switch.
function CardBody({ card, interactive }) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {card.avatar ? <Avatar name={card.avatar} /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{card.title}</div>
          {card.subtitle ? <div className="mt-0.5 truncate text-sm text-fg-muted">{card.subtitle}</div> : null}
          {card.meta ? <div className="mt-0.5 truncate text-xs text-fg-muted">{card.meta}</div> : null}
          {card.status ? (
            <div className="mt-2">
              <StatusBadge status={card.status} tone={card.statusTone} />
            </div>
          ) : null}
        </div>
      </div>
      {interactive ? (
        <i aria-hidden="true" className="fa-solid fa-chevron-right mt-1 shrink-0 text-xs text-fg-faint" />
      ) : null}
    </>
  );
}

// `first:rounded-t-xl` so a hovered first card does not paint a square
// corner over the frame's rounded one — the same job the frame's old
// `overflow-hidden` used to do.
const CARD_SHELL =
  'flex w-full items-start gap-3 border-b border-edge-soft px-4 py-3 text-left first:rounded-t-xl last:border-0';

function Card({ card }) {
  // A link wins over a handler when a page supplies both: a real href is
  // openable in a new tab and survives a middle click, which an onClick is
  // not and does not.
  if (card.to) {
    return (
      <Link to={card.to} className={`${CARD_SHELL} transition hover:bg-surface-subtle`}>
        <CardBody card={card} interactive />
      </Link>
    );
  }
  if (card.onSelect) {
    return (
      <button type="button" onClick={card.onSelect} className={`${CARD_SHELL} transition hover:bg-surface-subtle`}>
        <CardBody card={card} interactive />
      </button>
    );
  }
  // No primary action: static, no chevron, no hover affordance. Actions —
  // when the page gives any — sit in their own row beneath, where they are
  // siblings rather than children of something clickable.
  return (
    <div className={CARD_SHELL}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <CardBody card={card} interactive={false} />
        </div>
        {card.actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{card.actions}</div> : null}
      </div>
    </div>
  );
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
  // Card mode below `sm`. Omitted = today's behaviour, table at every width.
  renderCard = null,
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

  // NO `overflow-hidden` HERE, AND THAT IS THE STICKY HEADER'S WHOLE STORY.
  //
  // This frame carried `overflow-hidden` to clip the table's square corners
  // to its own rounded ones. But ANY ancestor whose overflow is not
  // `visible` — hidden included, even though nothing can scroll it — becomes
  // the nearest scrollport, and a `position: sticky` descendant resolves its
  // `top` against THAT box instead of the viewport. So `top: var(--header-h)`
  // offset the header 61px DOWN INSIDE THE CARD: an empty band above the
  // table and the header sitting on top of row 1, on every DataTable page
  // including the sixteen this dispatch never touched. Found in browser
  // review 2026-09-20.
  //
  // The corners are clipped by rounding the pieces that actually paint
  // instead — the outer header cells and the pager — which costs three
  // classes and no containing block. Do not put `overflow-hidden` back.
  const frame = `rounded-xl border border-edge bg-surface ${className}`;

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

  const cards = renderCard ? sortedRows.map((row, index) => ({ key: row[keyField] ?? index, card: renderCard(row) })) : null;

  return (
    <div className={frame}>
      {cards ? <div className="sm:hidden">{cards.map(({ key, card }) => <Card key={key} card={card} />)}</div> : null}

      {/* `sm:overflow-x-visible` is what makes the sticky header work, and it
          is not cosmetic. `overflow-x-auto` alone makes this div a scroll
          CONTAINER on both axes (CSS computes the other axis from `visible`
          to `auto`), so a sticky <th> would resolve against a box with no
          scroll range and never stick while the page scrolled. Releasing it
          from `sm` up is safe precisely because the card layout has taken
          over below `sm`, which is the only width the horizontal scroller
          was ever for. */}
      <div className={`overflow-x-auto sm:overflow-x-visible ${cards ? 'hidden sm:block' : ''}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* The background lives on the CELLS, not on this row: a sticky
                <th> paints its own background, and a row background behind
                it would show through at the rounded corners. */}
            <tr className="border-b border-edge">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    // ONE style object. `top` is the app header's height —
                    // see --header-h in index.css for why and how it is
                    // derived — and `width` is the caller's optional column
                    // width, which used to live in a style prop of its own.
                    // Two `style` props on one element is not an override,
                    // it is the first one silently disappearing, so the
                    // column widths would have stopped working.
                    // bg-surface-subtle below is required, not decorative: a
                    // transparent sticky header lets rows show through it.
                    style={{ top: 'var(--header-h)', ...(column.width ? { width: column.width } : null) }}
                    // `sm:sticky`, NOT `sticky`. Below `sm` the wrapper above
                    // is still `overflow-x-auto` — it has to be, for the
                    // sixteen pages that have no card layout yet — so it is
                    // a scrollport there and a sticky header would be offset
                    // inside it exactly as it was inside the frame. Static
                    // below `sm` is the honest answer: a phone scrolls the
                    // page, and those pages already scroll sideways.
                    //
                    // first/last rounding replaces the frame's old
                    // `overflow-hidden`; see the note on `frame`.
                    className={`sm:sticky z-10 bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-body first:rounded-tl-xl last:rounded-tr-xl ${
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
                    className={`px-4 py-3 text-fg-secondary ${ALIGN[column.align] || ALIGN.left}`}
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
          className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-edge bg-surface-subtle px-4 py-2 text-xs text-fg-body"
          data-testid="datatable-pager"
        >
          <span>
            Showing {first}–{last} of {page.total}
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
