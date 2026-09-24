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

// ---------------------------------------------------------------------------
// TWO KINDS OF DATE, AND THE DIFFERENCE IS NOT COSMETIC (UI-C1a, 2026-09-25).
//
// A DATE COLUMN is a calendar day with no time and no zone. `config/db.js`
// sets `dateStrings: ['DATE']`, so `absence_date`, `event_date`,
// `attendance.date` and `date_recorded` arrive as the literal string
// "2026-09-25" and round-trip unchanged. The helpers for these do STRING
// SURGERY and never build a `Date` — that is what makes them incapable of
// shifting a day (§5a-iv).
//
// A TIMESTAMP is an instant. Every `created_at` in the schema is
// `TIMESTAMP`, MySQL stores PH wall-clock (`time_zone = SYSTEM`), mysql2
// parses it as local, and then `res.json()` calls `toISOString()`. So a post
// made at 07:00 on 25 September leaves the API as:
//
//     "2026-09-24T23:00:00.000Z"      <- measured, not reasoned
//
// and `String(created_at).slice(0, 10)` — which is what seventeen call sites
// did — yields "2026-09-24", THE DAY BEFORE. PH is UTC+8, so the UTC date
// rolls over at 08:00 local: every post made between midnight and 07:59 PH
// displayed as the previous day. School mornings sit inside that window.
//
// So an instant must be converted back to the school's calendar day before
// anything is read off it, and that is what `dateTime` and `timestampDay` do.
// ---------------------------------------------------------------------------

// The school's timezone, hardcoded on purpose. This is ONE school in ONE
// place, and the alternative — the viewer's zone — would let a parent abroad
// see a different day than the teacher who posted it. The date a school
// record belongs to is a fact about the school, not about who is looking.
export const SCHOOL_TIME_ZONE = 'Asia/Manila';

// A date-only string is "YYYY-MM-DD" and nothing else. A timestamp carries a
// "T", and passing one to a date-only helper is the bug this whole section
// exists to stop happening again.
function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

// DEV-only, because a wrong date is not worth blanking a page over — and
// because production still renders the RIGHT day via the fallback below. It
// names the helper so the fix is obvious from the console line alone.
function warnTimestamp(helper, value) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(
      `format/date.js: ${helper}() was given a TIMESTAMP ("${value}"), not a date-only string. ` +
      `Timestamps must go through dateTime() or timestampDay(), which convert to ${SCHOOL_TIME_ZONE} first — ` +
      `slicing or splitting an ISO instant shows the PREVIOUS day for anything posted before 08:00 PH.`
    );
  }
}

// "25 Sep 2026" — the table-cell form. Short because a date column sits
// beside several others; unambiguous because "22 Sep" cannot be read as
// either day-first or month-first, which "22/09" and "09/22" can.
export function shortDate(dateStr) {
  if (!isDateOnly(dateStr) && /T/.test(String(dateStr))) {
    warnTimestamp('shortDate', dateStr);
    return timestampDay(dateStr, { style: 'short' });
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${monthName(m).slice(0, 3)} ${y}`;
}

// "14 September 2026" — for an accessible name, never for a request.
export function longDate(dateStr) {
  if (!isDateOnly(dateStr) && /T/.test(String(dateStr))) {
    warnTimestamp('longDate', dateStr);
    return timestampDay(dateStr, { style: 'long' });
  }
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${monthName(m)} ${y}`;
}

// THE CALENDAR DAY AN INSTANT FELL ON, in the school's timezone.
//
// `Intl` is the whole implementation: it is the only thing that converts an
// instant to a named zone correctly, including any future rule change, and
// it does not depend on where the machine running the browser happens to be.
// `en-GB` gives day-month-year parts; the parts are reassembled by hand so
// the output matches `shortDate`/`longDate` exactly rather than whatever the
// locale would punctuate.
export function timestampDay(value, { style = 'short' } = {}) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return String(value ?? '');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  if (!y || !m || !d) return String(value ?? '');
  return style === 'long' ? `${d} ${monthName(m)} ${y}` : `${d} ${monthName(m).slice(0, 3)} ${y}`;
}

// The Manila calendar day of an instant, as "YYYY-MM-DD" — the comparable
// form. `timestampDay` above is for READING; this is for ARITHMETIC, and
// keeping them apart stops anyone parsing a display string back into a date.
function manilaDayKey(value) {
  // `new Date(null)` is the EPOCH, not an invalid date — so a missing
  // timestamp would silently become 1 January 1970 and report itself as
  // twenty thousand days old. The nullish check has to come first; the
  // NaN check below cannot catch it.
  if (value === null || value === undefined || value === '') return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return y && m && d ? `${y}-${m}-${d}` : null;
}

// HOW MANY CALENDAR DAYS AGO, in Manila — not how many 24-hour blocks.
//
// The distinction is the bug this replaces. `AdminDashboard` computed
// `Math.floor((Date.now() - then) / 86400000)` and called 0 "today", so a
// backup taken at 23:00 and looked at from 01:00 the next morning was two
// hours old, scored 0, and reported **"Last backup today"** when it was
// yesterday. Elapsed duration and calendar distance are different questions
// and only one of them is what "today" means.
//
// Both days are reduced to their Manila date first and compared as days, so
// the answer does not depend on the hour, on the viewer's zone, or on
// whether a month or year boundary sits between them.
//
// `now` is a parameter so a proof can fix it. A helper that reads the clock
// internally can only be tested at whatever time the test happens to run.
export function calendarDaysAgo(value, now = Date.now()) {
  const then = manilaDayKey(value);
  const today = manilaDayKey(now);
  if (!then || !today) return null;
  // UTC constructors on a date-only key: both sides are built the same way,
  // so the difference is exact whole days with no zone in it at all.
  const [ty, tm, td] = then.split('-').map(Number);
  const [ny, nm, nd] = today.split('-').map(Number);
  const msPerDay = 86400000;
  return Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(ty, tm - 1, td)) / msPerDay);
}

// "today" / "yesterday" / "3 days ago" — the words for the number above.
export function calendarDaysAgoLabel(value, now = Date.now()) {
  const days = calendarDaysAgo(value, now);
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// "25 Sep 2026, 7:00 AM" — an instant WITH its time, for the one place the
// time of day is the point: a message in a thread.
export function dateTime(value) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return String(value ?? '');
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(at);
  return `${timestampDay(at, { style: 'short' })}, ${time}`;
}

// "Monday" for a day string, from the local constructor.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function weekdayName(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

// Saturday or Sunday. Added for DV4's last-week attendance strip.
//
// THIS IS THE ONLY THING THE CLIENT CAN KNOW ABOUT A DAY WITH NO RECORD, and
// the limit is worth stating where the helper lives: `attendance` holds only
// days someone marked, and NOTHING in the schema holds a school calendar
// (term dates and holidays are still the pre-Stage-5 CAL item). So a date with
// no row is a weekend, a holiday, a suspension, or an adviser who has not
// marked it yet — and only the first of those is derivable here.
//
// A weekend is therefore NOT "no school": POST /api/attendance/bulk has no
// weekday validation, two fixtures have recorded a Saturday, and whether the
// school holds weekend classes is an open question. A caller must render
// "weekend" and "not recorded" as distinct states and must let a real weekend
// record win over both.
export function isWeekend(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

// The last `count` calendar days ending at `end` (inclusive), oldest first.
//
// Date ARITHMETIC, which is why it is here and not in a page: §5a-iv says a
// page formats a date and never computes one. `new Date(y, m-1, d - i)` uses
// the LOCAL constructor and lets the platform roll month and year boundaries,
// so this is correct across 1 March and 1 January without a special case —
// and it never parses a string, so nothing can shift a day.
export function lastNDays(count, end = todayLocalDateString()) {
  const [y, m, d] = String(end).split('-').map(Number);
  if (!y || !m || !d) return [];
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(y, m - 1, d - i);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}
