import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import EmptyState from './EmptyState';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';
import StatusBadge from './StatusBadge';
import { buttonClass, cardClass } from './buttonClass';

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
//   { to?, onSelect?, avatar?, avatarPhoto?, title, subtitle?, meta?, status?,
//     statusTone?, actions? }
//
// `avatarPhoto` is a USER's stored photo file name (Avatar shows it, or the
// initials of `avatar` when it is null or fails to load) — data, like the rest.
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

// The same three alignments for a sortable header's button, which is a flex
// row (label + sort icon) and so is placed by `justify-*`, not `text-*`.
const JUSTIFY = {
  left: 'justify-start',
  right: 'justify-end',
  center: 'justify-center',
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
        {card.avatar ? <Avatar name={card.avatar} photo={card.avatarPhoto} /> : null}
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

// `first:rounded-t-2xl` so a hovered first card does not paint a square
// corner over the frame's rounded one — the same job the frame's old
// `overflow-hidden` used to do. The radius is the FRAME's (`cardClass`,
// rounded-2xl since feat/ui-refresh); move the two together.
//
// `py-3.5` (feat/ui-refresh): a card is a finger's target on a phone, so it
// gets a little more air than a table row's cell.
const CARD_SHELL =
  'flex w-full items-start gap-3 border-b border-edge-soft px-4 py-3.5 text-left first:rounded-t-2xl last:border-0';

// THE LAST CARD ROUNDS ITS BOTTOM ONLY WHEN NOTHING SITS UNDER IT. In paged
// mode the pager is the frame's bottom edge and carries the rounding; without
// one the last card is, and its hover would paint square over the frame's
// bottom corners. Decided by the table, so it is a prop, not a guess.
const CARD_SHELL_END = 'last:rounded-b-2xl';

// One interactive card's hover and keyboard focus. The outline is drawn
// INSIDE the card (-2px offset): the frame has no overflow to clip an outer
// one, but the next card's background would cover half of it.
const CARD_INTERACTIVE =
  'transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent';

function Card({ card, roundEnd }) {
  const shell = roundEnd ? `${CARD_SHELL} ${CARD_SHELL_END}` : CARD_SHELL;

  // `actions` BESIDE a primary action is a silent no-op, and it shipped once
  // (UI-B, 2026-09-23). Only the static branch below renders `actions` — that
  // is §5a-iii enforced by construction, since a button beside a `<Link>` or
  // a `<button>` would be a button inside one. Passing both is therefore not
  // an error and not a warning; the buttons simply never appear, and the
  // dispatch that did it reported the opposite in good faith because nothing
  // contradicted it. A source-text proof cannot catch this (§17d): the prop
  // IS written, it just never renders.
  //
  // console.error, not a throw: the prop is inert, not dangerous, and
  // blanking a page over it would be worse than the bug. DEV only, matching
  // the one existing idiom (App.jsx's /dev/ui route).
  if (import.meta.env.DEV && card.actions && (card.to || card.onSelect)) {
    console.error(
      'DataTable card: `actions` is ignored when the card has `to` or `onSelect`. ' +
      'A card with a primary action is ONE interactive element (§5a-iii), so `actions` ' +
      'is never rendered beside it — the buttons will be silently missing. ' +
      'Move the action into the view the card opens, or drop `to`/`onSelect` and let ' +
      'the card be static with its actions underneath.'
    );
  }

  // A link wins over a handler when a page supplies both: a real href is
  // openable in a new tab and survives a middle click, which an onClick is
  // not and does not.
  if (card.to) {
    return (
      <Link to={card.to} className={`${shell} ${CARD_INTERACTIVE}`}>
        <CardBody card={card} interactive />
      </Link>
    );
  }
  if (card.onSelect) {
    return (
      <button type="button" onClick={card.onSelect} className={`${shell} ${CARD_INTERACTIVE}`}>
        <CardBody card={card} interactive />
      </button>
    );
  }
  // No primary action: static, no chevron, no hover affordance. Actions —
  // when the page gives any — sit in their own row beneath, where they are
  // siblings rather than children of something clickable.
  return (
    <div className={shell}>
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
  // instead — the outer header cells, the pager, the first card, and (when
  // there is no pager under them) the last row's outer cells and the last
  // card — which costs a few classes and no containing block. Do not put
  // `overflow-hidden` back.
  //
  // THE FRAME IS `cardClass` (feat/ui-refresh, 2026-10-02): 16px corners, the
  // hairline edge, the smallest shadow — the same surface as every card and
  // panel. Every `rounded-*-2xl` below is that radius; if `cardClass` ever
  // changes its corner, they change with it.
  const frame = `${cardClass} ${className}`;

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
      {cards ? <div className="sm:hidden">{cards.map(({ key, card }) => <Card key={key} card={card} roundEnd={!paged} />)}</div> : null}

      {/* ---------------------------------------------------------------
          THE HORIZONTAL SCROLLER IS BACK AT EVERY WIDTH, AND THERE IS NO
          STICKY HEADER. Darryl's decision, 2026-09-20, after three fixes
          in a row each traded one breakage for another:

            1. sticky + the frame's `overflow-hidden` → the header was
               offset 61px INSIDE the card, covering row 1 everywhere.
            2. released the scroller at `sm` → at 200% zoom the table was
               wider than <main> and THE PAGE scrolled sideways.
            3. `wrap-anywhere` to make the table unable to overflow → it
               shrinks min-content by breaking words mid-letter, so a
               squeezed table read "S/U/BJ/E/C/T", "Mathemat/ics", and —
               worst — split an LRN across four lines.

          The root cause is structural and was never going to yield to a
          fourth attempt: sticky resolves against the nearest scrollport,
          and containing horizontal overflow REQUIRES an ancestor to be
          one. They cannot both be true of the same table.

          So the feature is dropped rather than balanced. These lists are
          paginated at 50 rows; a header that scrolls away after 50 rows
          costs little, and every alternative cost more — a nested scroll
          area (against §9, which makes the document the only scroller), a
          breakpoint that only moves the failure, or mangled text.

          KEPT from those attempts, because they were right on their own
          merits: the frame has no `overflow-hidden` (it was only ever
          there to clip corners, and it made the frame a scrollport), and
          the corners are clipped by rounding the pieces that paint.
          --------------------------------------------------------------- */}
      <div className={`overflow-x-auto ${cards ? 'hidden sm:block' : ''}`}>
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
                    style={column.width ? { width: column.width } : undefined}
                    // NOT sticky, and no `wrap-anywhere` — the note on the
                    // wrapper above says why both were tried and dropped.
                    // `whitespace-nowrap` keeps a label like "Grade &
                    // section" on one line rather than stacking it into a
                    // column of single words when the table is squeezed.
                    //
                    // first/last rounding replaces the frame's old
                    // `overflow-hidden`; see the note on `frame`.
                    //
                    // The eyebrow style (feat/ui-refresh): small, uppercase,
                    // muted — a label for the column, quieter than its values.
                    //
                    // A SORTABLE header's padding lives on its BUTTON, not on
                    // the cell (`p-0` here), so the whole header cell is the
                    // target — 44px tall — instead of the label's own few
                    // pixels, and the keyboard outline has a box to draw in.
                    className={`whitespace-nowrap bg-surface-subtle text-xs font-semibold uppercase tracking-wider text-fg-muted first:rounded-tl-2xl last:rounded-tr-2xl ${
                      column.sortable ? 'p-0' : 'px-4 py-3'
                    } ${ALIGN[column.align] || ALIGN.left}`}
                  >
                    {column.sortable ? (
                      // The outline is drawn INSIDE the button (-2px): it
                      // fills the cell, and the frame's corner would clip an
                      // outer one on the first and last columns.
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={`flex min-h-11 w-full items-center gap-1.5 rounded-xl px-4 py-3 font-semibold uppercase tracking-wider transition hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent ${
                          JUSTIFY[column.align] || JUSTIFY.left
                        }`}
                      >
                        {column.header}
                        <i
                          aria-hidden="true"
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
                className="border-b border-edge-soft transition-colors last:border-0 hover:bg-surface-subtle"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    // NO `wrap-anywhere`. Default wrapping breaks at spaces
                    // only, so a word is never split mid-letter and an LRN,
                    // a grade or a date — none of which contain a space —
                    // cannot be broken at all. That is the whole fix for
                    // "13/56/74/54" and "Mathemat/ics".
                    //
                    // `nowrap` on a column is the stronger promise, for
                    // values that must not break even at a space: a
                    // formatted date ("Sep 20, 2026, 1:30 AM"), a class
                    // ("Grade 6 - Malikhain"), or an action cluster whose
                    // buttons should keep one row and claim their width
                    // rather than wrap under the text beside them.
                    //
                    // The LAST row's outer cells round with the frame when
                    // no pager sits under them — the hovered row's
                    // background would otherwise paint square over the
                    // frame's bottom corners (see the note on `frame`).
                    className={`px-4 py-3.5 text-fg-secondary ${column.nowrap ? 'whitespace-nowrap' : ''} ${
                      ALIGN[column.align] || ALIGN.left
                    } ${!paged && index === sortedRows.length - 1 ? 'first:rounded-bl-2xl last:rounded-br-2xl' : ''}`}
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
          className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-edge bg-surface-subtle px-4 py-2.5 text-sm text-fg-body"
          data-testid="datatable-pager"
        >
          <span className="tabular-nums">
            Showing {first}–{last} of {page.total}
          </span>
          {/* The row-action button (buttonClass `sm`): 44px under a finger,
              36px under a pointer, the shared focus outline and the shared
              disabled look. The icons are decoration — the words are the
              names. */}
          <span className="inline-flex gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => onPageChange && onPageChange(Math.max(0, page.offset - page.limit))}
              className={buttonClass({ size: 'sm' })}
            >
              <i aria-hidden="true" className="fa-solid fa-chevron-left text-[0.625rem]" />
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => onPageChange && onPageChange(page.offset + page.limit)}
              className={buttonClass({ size: 'sm' })}
            >
              Next
              <i aria-hidden="true" className="fa-solid fa-chevron-right text-[0.625rem]" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
