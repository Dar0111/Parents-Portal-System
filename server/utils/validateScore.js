// Score validation shared by every path that stores a raw score.
//
// WHY THIS FILE EXISTS (2026-09-22). Darryl, from the school: **the school
// never awards half points.** Every score and every highest-possible score
// it gives is a whole number — 5, 10, 20, 50 — so `42.5/50` is not a value
// this system should be able to hold. Until now nothing stopped it: the
// columns are `DECIMAL(5,2)` and the only checks were "score >= 0" and
// "max > 0".
//
// ONE DEFINITION, IN ONE PLACE, because the rule has to hold at four write
// paths (`POST` and `PUT` on a component, `PATCH /:id/exam`, and the
// class-record bulk endpoint when it lands) and a rule re-implemented per
// endpoint is a rule that drifts. The class-record grid is what made this
// urgent — it is the screen where a teacher types 40 learners x 9 slots —
// but **the gate belongs on the SERVER, not on the grid's inputs**: the
// endpoints are callable directly and Expo will call them, so a form-only
// rule is not a rule at all.
//
// THIS DOES NOT MAKE COMPUTED VALUES INTEGERS, and that distinction is the
// whole point. An Initial Grade of 83.60, a weighted part of 27.60 and a
// General Average of 90.13 are all correct and all keep two decimals
// (docs/GRADING_SPEC.md §4a). This constrains what a TEACHER TYPES, never
// what the system works out from it.
//
// NEW WRITES ONLY — no sweep of existing rows. The seeded baseline has zero
// `grade_components` and the pilot has not started, so there is nothing
// non-integral on disk to fix; a migration rewriting real scores to satisfy
// a rule added later would be the wrong trade even if there were.

// A whole number, as a NUMBER. Deliberately NOT accepting a numeric string:
// every caller here reads `req.body`, which is parsed JSON, so a score that
// arrives as "18" is a client sending the wrong type and should be told so
// rather than quietly coerced. (This is the opposite of the rule in
// gradeComputation.js's `bandFor`, which MUST coerce — it reads DECIMAL
// columns back out of mysql2, and those always arrive as strings. Same
// project, two directions, two correct answers.)
//
// `Number.isInteger` is false for NaN and both Infinities, so no separate
// finite check is needed.
function isWholeNumber(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

// The refusal wording, in one place so all eight call sites read alike.
// It names the field, the reason and the value actually received — §2: the
// API's own message is what reaches the user through `extractError`, so it
// has to carry the reason, not just the rule.
function wholeNumberMessage(field, value) {
  return `${field} must be a whole number — the school does not award half points (got ${value}).`;
}

// WHAT THE COLUMNS CAN HOLD (D-273, the Nov 4 error). Every score, every
// highest possible score and every value a recompute stores — the
// percentages, the weighted parts, the Initial Grade and the term grade — is
// numeric(5,2), and PostgreSQL refuses a value that ROUNDS to 1000 or more
// (22003, "must round to an absolute value less than 10^3"). Until this, a
// typed 1000, or a score ten times its HPS, reached the database and came
// back as a 500.
//
// THIS IS THE COLUMNS' OWN LIMIT, NOT A CAP. A score above its HPS is still
// allowed and never clamped (the school awards bonus points,
// docs/GRADING_SPEC.md), and gradeComputation.js still clamps nothing: the
// limit refuses only what the database would refuse anyway, as a 400 the
// screens can show, before anything is written. 999.995 is PostgreSQL's own
// rounding line, so 999.994 fits (it is stored as 999.99) and 999.995 does
// not. A TYPED value is a whole number, so for a teacher the limit is 999.
const COLUMN_LIMIT = 999.995;
const MAX_TYPED_VALUE = 999;

function fitsScoreColumn(value) {
  return Math.abs(Number(value)) < COLUMN_LIMIT;
}

// One sentence in the class record's own words: "The score", "The highest
// possible score of Written Work 2", "The ST1 highest possible score". No
// dash of its own: the web's preview strip already prints "Live totals are
// out of date —" before it.
function typedLimitMessage(what, value) {
  return `${what} must be ${MAX_TYPED_VALUE} or less (you entered ${value}).`;
}

// The Summative fields as the grid names them: ST1 / ST2 / TE, and
// "highest possible score" for a maximum (ClassRecordPage.jsx's header).
function examFieldLabel(field) {
  const [part, kind] = String(field).split('_');
  return kind === 'max' ? `The ${part.toUpperCase()} highest possible score` : `The ${part.toUpperCase()} score`;
}

// The values recomputeGrade stores, in the order they are checked, named as
// the class record shows them. A percentage is checked before what is
// derived from it, so the sentence names the cause: the weighted parts, the
// Initial Grade and the term grade cannot pass 1000 unless a percentage has
// (the weights sum to 100).
const COMPUTED_VALUES = [
  ['ww_percentage', 'Written Work', '%'],
  ['pt_percentage', 'Performance Task', '%'],
  ['ex_percentage', 'Summative', '%'],
  ['ww_weighted', 'WW WS', ''],
  ['pt_weighted', 'PT WS', ''],
  ['ex_weighted', 'ST WS', ''],
  ['initial_grade', 'The Initial grade', ''],
  ['term_grade', 'The Term grade', ''],
];

// Thrown by recomputeGrade, inside a transaction, BEFORE its UPDATE; each of
// the five handlers that recompute rolls back and answers it with a 400 and
// this message, never a 500 and never a log line (it is a refusal, not a
// fault).
class GradeRangeError extends Error {
  constructor({ label, unit, value, learner }) {
    super(
      `${label} for ${learner} would be ${Number(value).toFixed(2)}${unit}, more than the class record can hold. Check the scores and the HPS.`
    );
    this.name = 'GradeRangeError';
  }
}

// `values` is keyed by the column names above. Returns the first value that
// does not fit, or null. A null value (not yet computable) always fits.
function firstComputedOverflow(values) {
  for (const [key, label, unit] of COMPUTED_VALUES) {
    const value = values[key];
    if (value !== null && value !== undefined && !fitsScoreColumn(value)) return { key, label, unit, value };
  }
  return null;
}

// A slot's display name: what the grid header and the parent breakdown
// modal show. Resolved HERE, on the server, and never in a renderer —
// two clients will read it (the web grid now, Expo later) and a fallback
// computed twice is a fallback that drifts. Every read endpoint that
// returns a slot or a slot-backed component emits this already resolved.
//
// `grade_components.label` is NOT this value. A slot row leaves label NULL
// and renders display_label instead: storing the resolved text on the row
// would be a snapshot that goes stale the moment the slot is renamed.
// Legacy rows (no slot_id) keep whatever label they were written with, and
// that is what they display.
function slotDisplayLabel(type, slotNo, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed;
  return `${type === 'WW' ? 'Written Work' : 'Performance Task'} ${slotNo}`;
}

// A slot name is optional. Empty-after-trim normalises to NULL rather than
// '' so there is ONE representation of "unnamed" — otherwise a name of a
// single space would defeat the fallback above and print a blank header.
// Returns { value } or { error }.
function normalizeSlotName(name) {
  if (name === undefined || name === null) return { value: null };
  if (typeof name !== 'string') return { error: 'A slot name must be text.' };
  const trimmed = name.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > 100) {
    return { error: `A slot name may be at most 100 characters (got ${trimmed.length}).` };
  }
  return { value: trimmed };
}

module.exports = {
  isWholeNumber,
  wholeNumberMessage,
  slotDisplayLabel,
  normalizeSlotName,
  MAX_TYPED_VALUE,
  fitsScoreColumn,
  typedLimitMessage,
  examFieldLabel,
  GradeRangeError,
  firstComputedOverflow,
};
