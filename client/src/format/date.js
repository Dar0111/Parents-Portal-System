// Local calendar dates, never UTC.
//
// THE RULE FOR THIS WHOLE CLIENT: never build a YYYY-MM-DD string with
// toISOString(). This project has hit that bug twice on the server side, and
// both times it was invisible outside a narrow window:
//
//   1. A DATE column round-tripped a calendar day backwards at UTC+8, because
//      toISOString() converts to UTC and Manila is 8 hours ahead — so any time
//      before 08:00 local, UTC is still on yesterday's date.
//   2. isFutureDate() computed "today" the same wrong way, so a teacher's
//      own-day attendance entry was rejected as "in the future" for the first
//      eight hours of every day.
//
// Both are fixed server-side (config/db.js dateStrings, utils/dateFormat.js).
// This file is the client's half of the same discipline, and mirrors the
// server's own todayLocalDateString() rather than inventing a second approach.
//
// Note that <input type="date"> already gives a local YYYY-MM-DD string in its
// value — so it must be sent to the API verbatim, never parsed into a Date and
// re-serialized. The only thing that needs computing here is "today".

export function todayLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// MONTH MATHS FOR THE ATTENDANCE CALENDAR (DV2, 2026-09-20)
// ---------------------------------------------------------------------------
// These moved here out of parent/AttendancePage.jsx, where `monthBounds` had
// lived since 2026-09-09, because DV2 gives them a second and third caller
// (the grid and the school-year table). This is the file whose entire purpose
// is "local dates, never UTC", so month arithmetic belongs in it rather than
// in a page.
//
// THE ONE RULE THAT MATTERS HERE, and it is what keeps the UTC bug out:
//
//   IDENTITY IS A STRING. A day is `"2026-09-14"` and is compared with `===`.
//   `config/db.js` sets `dateStrings: ['DATE']`, so `attendance.date` arrives
//   from the API in exactly that shape — no parsing happens anywhere, so
//   there is no instant to shift and no timezone to get wrong.
//
//   A `Date` OBJECT IS USED ONLY FOR PLACEMENT — which weekday column a day
//   falls in, and how many days a month has. Both go through the LOCAL
//   constructor `new Date(y, mIndex, d)`, never `new Date(string)` (which
//   parses "2026-09-14" as UTC midnight and is a day early west of Greenwich
//   — the same class of bug as toISOString).

// Zero-padded local date string from parts. The single place a day string is
// built, so the format cannot drift between the grid and the fetch params.
function dateString(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Days in a month, from the local constructor. `new Date(y, m, 0)` with `m`
// 1-based is the last day of month `m`, because day 0 of the NEXT month is
// the last day of this one. Leap years come out of this for free.
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// First and last day of a month as local YYYY-MM-DD strings — the `from`/`to`
// a request is built from. Defaults to the month containing today.
export function monthBounds(anchor = todayLocalDateString()) {
  const [yearStr, monthStr] = anchor.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  return { year, month, from: dateString(year, month, 1), to: dateString(year, month, daysInMonth(year, month)) };
}

// Step a month, wrapping the year. Returns `{ year, month }` with month 1–12.
// Arithmetic on the numbers, not on a Date, so December -> January cannot
// drift through a timezone.
export function addMonths({ year, month }, delta) {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(month) {
  return MONTH_NAMES[month - 1] || '';
}

// The Mon–Fri grid for a month.
//
// Returns whole WEEKS, each an array of five cells, so the caller renders a
// table without doing any date maths of its own. A cell is
// `{ date, day, inMonth }` — `date` is the YYYY-MM-DD identity string, `day`
// the day number for display, `inMonth` false for the leading/trailing days
// that pad the first and last weeks.
//
// WEEKENDS ARE NOT IN THE GRID, and that is a display choice, not a claim
// that they hold no data: `attendance` has no weekday constraint and
// `POST /api/attendance/bulk` accepts a Saturday (proved by a fixture on
// 2026-09-19). A record on a weekend is real and must be shown elsewhere —
// see the "Also recorded" strip in AttendanceCalendar — or the grid would
// quietly disagree with the month's own counts.
export function monthGrid(year, month) {
  const total = daysInMonth(year, month);
  // 0 = Sunday … 6 = Saturday, from the LOCAL constructor.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  // Monday-first column index; Sat/Sun both fold onto Monday's column so a
  // month starting at a weekend begins on the following Monday rather than
  // opening with a blank week.
  const lead = firstWeekday === 0 || firstWeekday === 6 ? 0 : firstWeekday - 1;

  const cells = [];
  // Leading pad, taken from the PREVIOUS month so the faded cells show real
  // day numbers rather than blanks.
  if (lead > 0) {
    const prev = addMonths({ year, month }, -1);
    const prevTotal = daysInMonth(prev.year, prev.month);
    for (let i = lead; i > 0; i -= 1) {
      const day = prevTotal - i + 1;
      cells.push({ date: dateString(prev.year, prev.month, day), day, inMonth: false });
    }
  }

  for (let day = 1; day <= total; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 0 || weekday === 6) continue; // weekends are not columns
    cells.push({ date: dateString(year, month, day), day, inMonth: true });
  }

  // Trailing pad from the next month, to complete the final week.
  const next = addMonths({ year, month }, 1);
  let nextDay = 1;
  while (cells.length % 5 !== 0) {
    const weekday = new Date(next.year, next.month - 1, nextDay).getDay();
    if (weekday !== 0 && weekday !== 6) {
      cells.push({ date: dateString(next.year, next.month, nextDay), day: nextDay, inMonth: false });
    }
    nextDay += 1;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 5) weeks.push(cells.slice(i, i + 5));
  return weeks;
}

// "14 September 2026" — for an accessible name, never for a request.
export function longDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${monthName(m)} ${y}`;
}

// "Monday" for a day string, from the local constructor.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function weekdayName(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}
