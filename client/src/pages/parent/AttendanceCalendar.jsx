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
        <div className="min-h-16 rounded-lg p-2 text-xs text-fg-ghost" aria-hidden="true">
          {cell.day}
        </div>
      </td>
    );
  }

  const frame = [
    'min-h-16 w-full rounded-lg p-2 text-left transition',
    record ? 'border border-edge bg-surface' : 'border border-dashed border-edge-strong bg-transparent',
    isToday ? 'ring-2 ring-focus-ring' : '',
    selected ? 'bg-surface-muted' : '',
  ].join(' ');

  const body = (
    <>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-semibold text-fg">{cell.day}</span>
        {isToday ? <span className="text-[0.625rem] font-medium text-brand">Today</span> : null}
      </span>
      <span className="mt-1 block">
        {record ? (
          <>
            {/* Full word from sm up, single letter below it. Both are TEXT —
                the pill is never colour alone. */}
            <span className="hidden sm:inline">
              <StatusBadge status={record.status} />
            </span>
            <span className="sm:hidden">
              <StatusBadge status={record.status} label={LETTER[record.status] || record.status} />
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-ghost">{isToday ? 'Not recorded yet' : ''}</span>
        )}
      </span>
      {letter ? (
        <span className="mt-1 block truncate text-[0.625rem] text-fg-muted">
          Excuse letter · {letter.status}
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
          onClick={() => onSelect(cell.date)}
          aria-label={label}
          aria-expanded={selected}
          aria-controls="attendance-day-detail"
          aria-current={isToday ? 'date' : undefined}
          className={`${frame} hover:bg-surface-subtle`}
        >
          {body}
        </button>
      ) : (
        <div className={frame} aria-label={label} aria-current={isToday ? 'date' : undefined} role="group">
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
      <table className="w-full table-fixed border-collapse">
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
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted sm:hidden">
        <span>P = Present</span>
        <span>L = Late</span>
        <span>A = Absent</span>
        <span>E = Excused</span>
      </p>

      {alsoRecorded.length ? (
        <div className="mt-4 rounded-lg border border-edge bg-surface-subtle px-4 py-3">
          <p className="text-xs font-semibold text-fg">Also recorded this month</p>
          <p className="mt-1 text-xs text-fg-muted">
            These fall on a weekend, so they are not in the grid above — but they ARE counted below.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {alsoRecorded.map((row) => (
              <li key={row.date} className="flex items-center gap-2 text-xs text-fg-body">
                <span>
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
