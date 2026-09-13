// Shared by every route that accepts a plain YYYY-MM-DD DATE value —
// attendance.date, events.event_date,
// students.birthday. Was duplicated identically in three route files;
// one implementation now, same pattern as parseId/sanitizeUser.

function isValidDateFormat(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// "Today" as the school actually experiences it, not as UTC does.
// new Date().toISOString() converts to UTC before slicing — during PH
// local hours before 8am (UTC+8), UTC's calendar date is still
// yesterday, so a naive isFutureDate()/isMoreThanOneYearAhead() built on
// that would reject a teacher's same-day attendance entry as "in the
// future" for the first 8 hours of every day. getFullYear()/getMonth()/
// getDate() read the Date object's LOCAL wall-clock components instead —
// same pattern routes/backups.js's formatBackupFilename() already uses
// for its own timestamped filenames.
function todayLocalDateString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

module.exports = { isValidDateFormat, todayLocalDateString };
