// MANILA CALENDAR DAYS FOR A TIMESTAMP COLUMN (feat/activity-log, B2).
//
// A DATE column arrives as a 'YYYY-MM-DD' string and is compared as one
// (config/db.js, `dateStrings`). A TIMESTAMP is an INSTANT, so "the entries of
// 23 October" is a range of instants: from Manila's midnight of that day up to
// the next one. Asia/Manila has kept UTC+8 with no daylight saving since 1978,
// so a day's bounds are fixed-offset instants built from the string itself —
// nothing here reads the server's own zone, and a host running in UTC builds
// the same bounds.
//
// The bounds are Date objects. mysql2 writes a Date parameter in the Node
// process's zone and MySQL reads it in the session zone — the same pairing
// every TIMESTAMP read in this API already relies on (config/db.js sets no
// `timezone`). node-postgres sends a Date with its offset, so the PostgreSQL
// port gets an exact instant with no change here.

const SCHOOL_TIME_ZONE = 'Asia/Manila';
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-02-30" has the shape and is not a day (utils/dateFormat.js checks the
// shape only). Round-tripped through UTC parts, so nothing can shift.
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_SHAPE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

// The first instant of a Manila day.
function manilaDayStart(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`);
}

// The first instant AFTER a Manila day — an exclusive upper bound, so 23:59:59
// and the milliseconds after it belong to the day and midnight does not.
function manilaDayEnd(dateStr) {
  return new Date(manilaDayStart(dateStr).getTime() + DAY_MS);
}

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// An instant's Manila date and 24-hour time: { date: 'YYYY-MM-DD', time:
// 'HH:MM:SS' }, or null for something that is not an instant.
function manilaParts(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const parts = PARTS.formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

// Today's Manila date as 'YYYY-MM-DD'. `now` is a parameter so a test can fix it.
function manilaToday(now = new Date()) {
  return manilaParts(now).date;
}

module.exports = { SCHOOL_TIME_ZONE, isRealDate, manilaDayStart, manilaDayEnd, manilaParts, manilaToday };
