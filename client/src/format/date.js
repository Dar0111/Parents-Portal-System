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
