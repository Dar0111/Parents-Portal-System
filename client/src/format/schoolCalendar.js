// THE SCHOOL CALENDAR — the client's copy. THIS FILE MIRRORS
// server/utils/schoolCalendar.js; THE SERVER DECIDES. The table, the boundary
// rule and the clamp are the same code, and `scripts/ssr-school-calendar.jsx`
// loads both files and asserts they agree on every boundary — a change to one
// without the other fails there first.
//
// SY 2026-2027 as the school gave it (locked 2026-09-26): classes run
// 2026-06-08 → 2027-04-08 in three terms with a break between the second and
// the third. No Saturday classes — but weekends are never blocked; this
// module says which term a day falls in, not whether a day may hold a record.
//
// `current_term` is NOT a setting since pre-Stage-5 #7 (2026-09-26): the term
// a screen opens on is derived from today's date here, so the hero, the class
// record and the class summary can never disagree with each other or with
// the school. Admin → Settings shows the derived term read-only.
//
// STRINGS ONLY. Every date in and out is a `YYYY-MM-DD` string compared with
// `<` / `===` (§5a-iv): nothing is parsed, so nothing can shift through a
// timezone. A `Date` argument THROWS rather than being coerced.

export const SCHOOL_YEAR = '2026-2027';
export const CLASSES_START = '2026-06-08';
export const CLASSES_END = '2027-04-08';

export const TERMS = Object.freeze([
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
// else Term 1. The day before classes is Term 1, a start date is its own term
// at once, the December–January break is still Term 2, and every day after
// classes end stays Term 3 until the next year's table ships.
export function currentTerm(today) {
  assertDateString(today, 'today');
  let current = 1;
  for (const entry of TERMS) {
    if (entry.start <= today) current = entry.term;
  }
  return current;
}

export function termDates(term) {
  const entry = TERMS.find((t) => t.term === Number(term));
  if (!entry) throw new RangeError(`No term ${term} in SY ${SCHOOL_YEAR}.`);
  return entry;
}

// The month a calendar opens on, kept inside the school year: a month before
// classes start opens on the first month of classes, a month after they end
// opens on the last. `{ year, month }` in, the same shape out.
export function clampMonthToSchoolYear({ year, month }) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const first = CLASSES_START.slice(0, 7);
  const last = CLASSES_END.slice(0, 7);
  const clamped = key < first ? first : key > last ? last : key;
  const [y, m] = clamped.split('-').map(Number);
  return { year: y, month: m };
}
