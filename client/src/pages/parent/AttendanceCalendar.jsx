import { useLayoutEffect, useRef } from 'react';
import StatusBadge from '../../components/StatusBadge';
import { longDate, monthGrid, weekdayName } from '../../format/date';

// The month grid for Parent → Attendance (DV2, 2026-09-20).
//
// PRESENTATIONAL ONLY, like DataTable: the page owns the request and hands
// down the month, the records and the letters. This file does no fetching and
// no date arithmetic of its own — `monthGrid` in format/date.js owns that.
//
// ---------------------------------------------------------------------------
// COLOUR IS NEVER THE ONLY CARRIER
// ---------------------------------------------------------------------------
// Every day that has a record renders a `StatusBadge`, which is colour AND
// text in the same element. That is why there is no bespoke dot: a coloured
// dot plus a legend somewhere else asks a colour-blind reader to hold a key
// in their head, and `info` has no `-icon` token anyway, so a four-colour dot
// would have meant inventing one (DV2 plan, Q11 — Darryl chose the pill).
//
// At 390px the badge shows a single letter (P / L / A / E) with the full word
// in the accessible name, and a legend under the grid maps letter to word for
// sighted readers. The letter is still text, so the "never colour alone" rule
// holds at every width rather than only at desktop.
//
// ---------------------------------------------------------------------------
// WHAT A DAY MEANS, AND WHY "NOT RECORDED" IS NOT "ABSENT"
// ---------------------------------------------------------------------------
// A school day with no row is LEFT OUT of the counts, not treated as an
// absence — that is the whole reason the page says "recorded days" and never
// "class days" (§5i, and the principal's 2026-09-13 rule). So an unrecorded
// weekday renders a dashed, empty cell and its accessible name says "not
// recorded", never a status.
//
// NO VERDICTS ANYWHERE (§4): no colour on the month as a whole, no threshold,
// no "good attendance". The page counts and displays.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// EVERY DAY CELL IS ONE FIXED HEIGHT (feat/ui-polish, Darryl, 2026-09-30).
// Cells were `min-h-16`, so the tallest one (Absent + "Excuse letter ·
// Pending") grew its own frame and its row, while the other frames in that
// row stayed short and every other week was shorter again — and a <button>
// centres its content vertically, so an empty day's number floated in the
// middle while the full one sat top-left. Now every frame, in the month or
// not, with data or without, is the height of that TALLEST variant, measured
// in a browser (Playwright, 2026-09-30): 77px below `xl`, where the letter
// line is the envelope alone, and 97px from `xl`, where "Excuse letter ·
// Pending" is spelled out and wraps to two lines. In rem, so Large text
// scales the frame with its contents. The content is a top-aligned column,
// so the day number is top-left everywhere and "Today" stays top-right.
//
// A MINIMUM, AND THE MONTH GROWS TOGETHER (A0, Darryl, 2026-09-30). As a
// fixed height it overflowed at Large text from 1280 to ~1300px, where the
// letter line wraps to THREE lines (116px of content in a 107px frame). So
// these are minimums, and `useEqualDayHeights` below sets every frame of the
// month to the tallest one: normal text is exactly as before (every frame
// already is the tallest), and a taller cell grows the whole month with it
// rather than spilling or leaving one week taller.
const CELL_HEIGHT = 'min-h-[4.8125rem] xl:min-h-[6.0625rem]';

// Every day frame (`data-day-frame`) in the table is given the height of the
// tallest one. Measured with the inline height cleared, so each frame first
// takes its own natural height (its content, or the minimum above); then all
// are pinned to the tallest. Re-run when the month's data changes, when the
// table's size changes (a resize reflows the letter line), and once the
// fonts have loaded (the icon font arrives after first layout). A table row
// equalises only itself, which is why this is not left to CSS.
function useEqualDayHeights(ref, dataKey) {
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return undefined;
    let raf = 0;
    const apply = () => {
      const frames = [...table.querySelectorAll('[data-day-frame]')];
      for (const f of frames) f.style.height = '';
      const tallest = Math.max(0, ...frames.map((f) => f.getBoundingClientRect().height));
      if (tallest > 0) for (const f of frames) f.style.height = `${tallest}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(table);
    document.fonts?.ready?.then(schedule);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [ref, dataKey]);
}

// One letter for the compact pill. The full word is always in the accessible
// name, so this is an abbreviation for sighted readers, not the only label.
const LETTER = { Present: 'P', Late: 'L', Absent: 'A', Excused: 'E' };

// The sentence a screen reader hears for one cell. Built here rather than at
// the call site so every cell is phrased the same way.
function dayLabel(cell, record, letter) {
  const when = `${weekdayName(cell.date)} ${longDate(cell.date)}`;
  if (!record) return `${when}: not recorded`;
  const base = `${when}: ${record.status}`;
  return letter ? `${base}, excuse letter ${letter.status.toLowerCase()}` : base;
}

function DayCell({ cell, record, letter, isToday, onSelect, selected }) {
  const label = dayLabel(cell, record, letter);

  // Outside the month: a faded day number and nothing else. It belongs to
  // another month's data, so showing a status here would attribute a record
  // to the wrong month.
  if (!cell.inMonth) {
    return (
      <td className="p-1 align-top">
        <div data-day-frame="" className={`${CELL_HEIGHT} rounded-lg p-2 text-xs text-fg-ghost`} aria-hidden="true">
          {cell.day}
        </div>
      </td>
    );
  }

  // THREE STATES, TOLD APART BY SHAPE (the frame), GLYPH (the pill's letter)
  // AND NAME (the aria-label) — never by colour alone: a recorded day is a
  // solid frame holding a StatusBadge, an unrecorded one a dashed, empty
  // frame, and a day outside the month has no frame at all. The sizing —
  // CELL_HEIGHT, `p-2`, the `rounded-lg` chip corner — is the measured set
  // from feat/ui-polish and is unchanged by feat/ui-refresh.
  const frame = [
    `flex ${CELL_HEIGHT} w-full flex-col justify-start rounded-lg p-2 text-left transition`,
    record ? 'border border-edge bg-surface' : 'border border-dashed border-edge-strong bg-transparent',
    isToday ? 'ring-2 ring-focus-ring' : '',
    selected ? 'bg-surface-muted' : '',
  ].join(' ');

  const body = (
    <>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-semibold tabular-nums text-fg">{cell.day}</span>
        {isToday ? <span className="text-[0.625rem] font-semibold text-brand">Today</span> : null}
      </span>
      <span className="mt-1 block">
        {record ? (
          <>
            {/* THE WORD ONLY WHERE IT FITS, AND `xl` IS DERIVED, NOT PICKED.
                At 200% zoom the word pills overflowed their cells (browser
                review, 2026-09-20). Cell content width is
                (main − 240px sidebar − 48px page padding − 48px card padding
                − 20rem side panel − gap) ÷ 5 columns, minus the cell's own
                24px of padding:

                  at lg  1024 → (736 − 48 − 336) ÷ 5 − 24 ≈  46px
                  at xl  1280 → (992 − 48 − 336) ÷ 5 − 24 ≈  97px

                A "Present" pill is about 69px, and 78px at Large text. So
                `lg` still overflows and `xl` clears it with room. Below xl
                the LETTER pill carries the meaning — it is still text, and
                the legend and the accessible name both spell it out. */}
            <span className="hidden xl:inline">
              <StatusBadge status={record.status} />
            </span>
            <span className="xl:hidden">
              <StatusBadge status={record.status} label={LETTER[record.status] || record.status} />
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-ghost">{isToday ? 'Not recorded yet' : ''}</span>
        )}
      </span>
      {letter ? (
        // An ICON below xl: the text line truncated to "Excuse…" in a narrow
        // cell, which says less than nothing. The icon is aria-hidden and
        // carries no accessible text of its own ON PURPOSE — the day's
        // aria-label already ends "…, excuse letter pending", and an
        // aria-label on the button replaces its inner text entirely, so
        // sr-only text here would never be announced. The full line is in
        // the day detail card, and in the cell from xl where it fits whole.
        <span className="mt-1 flex items-center gap-1 text-[0.625rem] text-fg-muted">
          <i aria-hidden="true" className="fa-solid fa-envelope" />
          <span className="hidden xl:inline">Excuse letter · {letter.status}</span>
        </span>
      ) : null}
    </>
  );

  return (
    <td className="p-1 align-top">
      {onSelect ? (
        // ONE interactive element per day, a real <button> — focusable,
        // Enter/Space, never an onClick on a div. `aria-expanded` and
        // `aria-controls` tie it to the detail card the page renders below.
        <button
          type="button"
          data-day-frame=""
          onClick={() => onSelect(cell.date)}
          aria-label={label}
          aria-expanded={selected}
          aria-controls="attendance-day-detail"
          aria-current={isToday ? 'date' : undefined}
          // The keyboard outline is the shared one, offset outward: the cell's
          // 4px gutter has room for it, and it must not be confused with
          // Today's ring, which sits on the frame itself.
          className={`${frame} hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent`}
        >
          {body}
        </button>
      ) : (
        <div data-day-frame="" className={frame} aria-label={label} aria-current={isToday ? 'date' : undefined} role="group">
          {body}
        </div>
      )}
    </td>
  );
}

export default function AttendanceCalendar({
  year,
  month,
  monthLabel,
  records,
  letters,
  today,
  selected,
  onSelect,
}) {
  const weeks = monthGrid(year, month);
  const tableRef = useRef(null);
  // What the frames' content depends on: the month, and each record's and
  // letter's date and status. A new key re-measures (A0).
  const dataKey = [
    year,
    month,
    today,
    ...(records || []).map((r) => `${r.date}:${r.status}`),
    ...(letters || []).map((l) => `${l.absence_date}:${l.status}`),
  ].join('|');
  useEqualDayHeights(tableRef, dataKey);

  // String identity, never a parsed Date — see format/date.js.
  const byDate = new Map();
  for (const row of records || []) byDate.set(row.date, row);
  const letterByDate = new Map();
  for (const row of letters || []) {
    const existing = letterByDate.get(row.absence_date);
    // Most recently submitted wins when a day somehow has several.
    if (!existing || String(row.created_at) > String(existing.created_at)) {
      letterByDate.set(row.absence_date, row);
    }
  }

  // A record whose date is NOT in the grid is a weekend (or a stray). It is
  // in the month's counts, so it must be visible somewhere or the grid and
  // the summary disagree — see the note in format/date.js → monthGrid.
  const inGrid = new Set(weeks.flat().filter((c) => c.inMonth).map((c) => c.date));
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const alsoRecorded = (records || [])
    .filter((row) => String(row.date).startsWith(prefix) && !inGrid.has(row.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <div>
      <table ref={tableRef} className="w-full table-fixed border-collapse">
        <caption className="sr-only">Attendance for {monthLabel}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((label) => (
              <th
                key={label}
                scope="col"
                className="whitespace-nowrap px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((cell) => (
                <DayCell
                  key={cell.date}
                  cell={cell}
                  record={cell.inMonth ? byDate.get(cell.date) : null}
                  letter={cell.inMonth ? letterByDate.get(cell.date) : null}
                  isToday={cell.date === today}
                  selected={cell.date === selected}
                  onSelect={cell.inMonth ? onSelect : null}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend for the single-letter pills. Below sm only, because from sm
          up the badge already spells the word out. */}
      {/* The legend follows the pill: visible wherever the cells show
          letters, hidden once they show the word. */}
      {/* The letter is set a step darker than its word, so the key reads as
          letter → word at a glance; each entry's text is unchanged
          ("P = Present"). */}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-edge-soft pt-3 text-xs text-fg-muted xl:hidden">
        {[
          ['P', 'Present'],
          ['L', 'Late'],
          ['A', 'Absent'],
          ['E', 'Excused'],
        ].map(([letter, word]) => (
          <span key={letter}>
            <span className="font-semibold text-fg-secondary">{letter}</span> = {word}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i aria-hidden="true" className="fa-solid fa-envelope" /> = excuse letter
        </span>
      </p>

      {alsoRecorded.length ? (
        <div className="mt-4 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Also recorded this month</p>
          <p className="mt-1 text-xs text-fg-muted">
            These fall on a weekend, so they are not in the grid above — but they are counted in the
            totals.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {alsoRecorded.map((row) => (
              <li key={row.date} className="flex items-center gap-2 text-xs text-fg-body">
                <span className="tabular-nums">
                  {weekdayName(row.date)} {longDate(row.date)}
                </span>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
