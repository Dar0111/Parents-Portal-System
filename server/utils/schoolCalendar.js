// THE SCHOOL CALENDAR — pre-Stage-5 #7 (CAL), 2026-09-26. THIS FILE DECIDES;
// client/src/format/schoolCalendar.js mirrors it line for line and the SSR
// proof asserts the two agree.
//
// SY 2026-2027 as the school gave it (locked 2026-09-26): classes run
// 2026-06-08 → 2027-04-08 in three terms with a break between the second and
// the third. No Saturday classes — but weekends are NEVER blocked here or
// anywhere else (OPEN QUESTIONS); this module says which term a day falls in,
// not whether a day may hold a record.
//
// WHY A MODULE AND NOT A SETTING. `system_settings.current_term` was a value
// an admin typed and every screen trusted, so the term the school was in and
// the term the app said could disagree — DV4's "Term 3 · C" hero came from a
// second derivation of the same fact. Since #7 the term is derived from the
// date, from this one table, and `current_term` is not a setting: the key is
// out of routes/settings.js's allow-list, the seed no longer writes it, and a
// row left on a live database is invisible (readAllowedSettings filters on
// the allow-list). Starting a new school year is "ship a new table here AND
// set academic_year" — the two must agree, and routes/dashboard.js refuses
// with a 500 naming both strings when they do not.
//
// STRINGS ONLY. Every date in and out is a `YYYY-MM-DD` string compared with
// `<` / `===`, exactly the §5a-iv rule the date helpers follow: nothing is
// parsed, so nothing can shift through a timezone. A `Date` argument THROWS —
// it is never coerced, because `String(new Date())` is not a date string and
// a silent coercion would put the wrong term on a screen with no error.

const SCHOOL_YEAR = '2026-2027';
const CLASSES_START = '2026-06-08';
const CLASSES_END = '2027-04-08';

const TERMS = Object.freeze([
  Object.freeze({ term: 1, start: '2026-06-08', end: '2026-09-15' }),
  Object.freeze({ term: 2, start: '2026-09-16', end: '2026-12-18' }),
  Object.freeze({ term: 3, start: '2027-01-04', end: '2027-04-08' }),
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function assertDateString(value, name) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    throw new TypeError(`${name} must be a YYYY-MM-DD string, got ${value instanceof Date ? 'a Date' : typeof value}.`);
  }
}

// THE BOUNDARY RULE: the latest term whose start date is on or before today,
// else Term 1. So the day before classes is Term 1, a start date is its own
// term at once, the December–January break is still Term 2 (a teacher is
// still encoding it; an end-based rule would already say Term 3), and every
// day after classes end stays Term 3 until the next year's table ships.
function currentTerm(today) {
  assertDateString(today, 'today');
  let current = 1;
  for (const entry of TERMS) {
    if (entry.start <= today) current = entry.term;
  }
  return current;
}

function termDates(term) {
  const entry = TERMS.find((t) => t.term === Number(term));
  if (!entry) throw new RangeError(`No term ${term} in SY ${SCHOOL_YEAR}.`);
  return entry;
}

// The month a calendar opens on, kept inside the school year: a month before
// classes start opens on the first month of classes, a month after they end
// opens on the last. `{ year, month }` in, the same shape out — the caller's
// month arithmetic (format/date.js addMonths) stays where it is.
function clampMonthToSchoolYear({ year, month }) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const first = CLASSES_START.slice(0, 7);
  const last = CLASSES_END.slice(0, 7);
  const clamped = key < first ? first : key > last ? last : key;
  const [y, m] = clamped.split('-').map(Number);
  return { year: y, month: m };
}

module.exports = { SCHOOL_YEAR, CLASSES_START, CLASSES_END, TERMS, currentTerm, termDates, clampMonthToSchoolYear };
