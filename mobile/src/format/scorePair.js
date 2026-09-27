// Raw score pairs — "46/50" — and the whole-number rule they share with a
// Term Grade. Moved out of `format/grade.jsx` in UI-A (2026-09-23).
//
// WHY ITS OWN MODULE, and it is §17b's reason again: `grade.jsx` is a `.jsx`
// file whose exports are components, and adding a function export to it trips
// `react(only-export-components)` — which moved the oxlint baseline 43 → 45
// the moment this shipped inside that file. A plain `.js` module beside
// `format/date.js` exports functions and nothing else, so the rule has
// nothing to complain about.
//
// `formatWholeGrade` CAME WITH IT and is exported rather than left behind,
// because `grade.jsx` still needs it for a Term Grade and a Final Grade and
// there must be exactly ONE implementation of the rule below. Splitting it
// would put "89.5 stays 89.5" in two files, which is the one thing this whole
// area exists to prevent.

// A TERM GRADE and a FINAL GRADE are whole numbers (2026-09-22). The school's
// Summary of Grades and DO 015 both print them that way, and since the
// rounding fix the server stores them that way too — a Term Grade comes out
// of transmutation_table (an INT column) and computeFinalGrade now rounds to
// a whole number. Two decimals on screen made a correct 89 read as 89.00.
//
// THIS IS NOT toFixed(0), AND THE DIFFERENCE MATTERS. From SY 2027-2028 the
// transmutation table has no rows, recomputeGrade falls back to
// term_grade = the Initial Grade, and Initial Grades carry two decimals. A
// stored 89.5 under toFixed(0) would display as "90" — a number the database
// does not hold. So this renders the integer only when the value IS integral
// and otherwise shows what is actually stored:
//
//     "87.00" -> "87"        89 -> "89"        89.5 -> "89.5"
//
// The same reasoning rules out Math.round for display. Rounding is the
// server's job and it has already happened; the client's job is to not add
// decimals that are not there, never to remove ones that are.
//
// General Average and Initial Grade keep `formatGrade` in `grade.jsx` — the
// general average is 721/8 = 90.13 on the school's own sheet, so two decimals
// there is the correct answer, not an oversight. Two precisions one level
// apart is a real distinction in the school's records.
// `String(Number(x))` is the whole implementation: Number("87.00") is 87 and
// String(87) is "87", while String(89.5) is "89.5". No branch on
// Number.isInteger is needed — JavaScript's own number-to-string already
// drops trailing zeros and keeps real decimals, which is exactly the rule.
export function formatWholeGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return null;
  return String(asNumber);
}

// A RAW SCORE PAIR is the same rule one level down (UI-A item 6, 2026-09-23).
//
// Every score a teacher types is a WHOLE number since CR0, and the columns are
// still DECIMAL(5,2), so mysql2 hands back "46.00" and the parent breakdown
// printed "46.00/50.00" — two dead decimals on the one screen parents read.
// It reuses formatWholeGrade per side rather than reimplementing it: the rule
// that 42.5 must stay 42.5 is the same rule, and a legacy row can still hold
// one. Rounding here would be the same defect toFixed(0) would have been.
//
// FOUR CASES, and the two null ones are different statements:
//
//   46 / 50     -> "46/50"
//   null / 50   -> "Pending"  — the slot is USED and this learner has no score
//   46 / null   -> null       — an unused slot; the caller renders NOTHING
//   null / null -> null       — nothing recorded; the caller says so
//
// `max === null` returning null rather than "46/?" is deliberate: an unused
// slot has no denominator to print, and a score without one is not a fact a
// parent can read. GRADING_SPEC §6e is the same distinction on the server —
// USED is the highest possible score, not the row.
//
// The pending case is a SENTINEL rather than a bare string so the call site
// cannot drift from it by retyping the word.
export const SCORE_PENDING = 'pending';

export function formatScorePair(score, max) {
  const maxText = formatWholeGrade(max);
  if (maxText === null) return null;
  const scoreText = formatWholeGrade(score);
  if (scoreText === null) return SCORE_PENDING;
  return `${scoreText}/${maxText}`;
}
