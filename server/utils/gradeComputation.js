/**
 * Pure grade-computation functions — no DB, no HTTP, no side effects.
 * Every function returns `null` when a required input is missing or
 * undefined; none of them guess at a partial result. This is deliberate:
 * an Initial Grade computed from only Written Works, with Performance
 * Tasks and Examinations still empty, would look like a real (and likely
 * failing) grade to a parent — it must be null, not a number, until every
 * required input actually exists. See CLAUDE.md's Grades module note.
 *
 * Rounding: every value is rounded to 2 decimals with round-HALF-UP
 * (never half-to-even/banker's rounding), and every function that takes
 * an already-rounded value as an input uses it as given — nothing here
 * re-derives from a hidden higher-precision intermediate. This is so the
 * numbers a parent or teacher sees on screen at every stage are the exact
 * numbers that fed the next stage: displayed math that doesn't add up by
 * hand destroys trust in a grading system faster than a hundredth of a
 * point of theoretical precision loss ever would.
 *
 * A percentage over 100 (bonus points, or a data-entry error) is NOT
 * clamped anywhere in this module — see subTestPercentage/componentPercentage.
 */

// Math.round((x + Number.EPSILON) * 100) / 100 rather than a plain
// Math.round(x * 100) / 100: without the EPSILON nudge, a value that is
// mathematically exactly on a .005 boundary (e.g. 1.005) can be stored by
// IEEE 754 as very slightly *below* that boundary (1.00499999999999989...),
// which would then round down instead of up. The nudge corrects for that
// representation error without changing any value that wasn't already on
// a boundary.
function roundTo2(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// The same rule at whole-number precision, for the values the school's own
// records carry as integers: a Term Grade (already whole — it comes out of
// transmutation_table, an INT column) and a FINAL GRADE, which DO 015 and the
// school's summary sheet both print as a whole number. The General Average is
// NOT one of these — it keeps roundTo2, because the sheet prints 721/8 as
// 90.13, two decimals, computed over the rounded subject grades.
//
// Same EPSILON nudge, same reason as above: a value sitting mathematically on
// .5 can be stored a hair below it and would round down without the nudge.
//
// NEVER toFixed() for this. toFixed rounds on the binary value and is
// inconsistent across inputs — (1.005).toFixed(2) is "1.00", not "1.01" —
// and it returns a STRING, so a caller that forgets Number() starts
// concatenating grades instead of averaging them.
//
// Math.round is half-up toward +Infinity, so Math.round(-89.5) is -89, not
// -90. Irrelevant here (no grade is negative) but stated so nobody reuses
// this helper for a signed quantity expecting symmetry.
function roundToWhole(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value + Number.EPSILON);
}

// WW/PT: an arbitrary number of raw scores, averaged as one combined
// percentage — sum(score) / sum(max_score) x 100. Well-defined with as
// few as one row; returns null only when there are no rows at all, or
// when every max_score sums to 0 (a percentage against zero possible
// points is undefined, not zero).
//
// ---------------------------------------------------------------------------
// `requiredSlotIds` — A MISSING SCORE IN A USED COLUMN IS INCOMPLETE, NOT
// ABSENT (added 2026-09-22, and it corrects a real defect)
// ---------------------------------------------------------------------------
// An assessment slot whose highest possible score is set is one the class
// SAT. A learner with no score in it has not been marked yet, so their group
// is not computable — "— Pending" — exactly as it is when an exam part is
// missing.
//
// Without this the missing score was simply left out of both the numerator
// and the denominator, which quietly RAISES the grade of a learner who
// skipped an assessment: 18 out of a used 20+10 showed as 90.00 rather than
// waiting for the second mark. That is the opposite of what the rule says
// and the opposite of what a teacher would expect from a class record.
//
// AN UNUSED SLOT IS STILL EXCLUDED, and the two cases must not be confused:
// no highest possible score means the assessment never happened, so nobody
// is missing anything. `requiredSlotIds` therefore carries only the USED
// slots.
//
// Omitted entirely, behaviour is unchanged — which is what keeps legacy
// rows, and every caller that does not know about slots, computing exactly
// as before.
function componentPercentage(rows, requiredSlotIds = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  if (Array.isArray(requiredSlotIds) && requiredSlotIds.length) {
    const present = new Set(rows.map((row) => Number(row.slot_id)).filter((id) => Number.isFinite(id)));
    for (const id of requiredSlotIds) {
      if (!present.has(Number(id))) return null;
    }
  }

  let totalScore = 0;
  let totalMax = 0;
  for (const row of rows) {
    totalScore += Number(row.score);
    totalMax += Number(row.max_score);
  }

  if (totalMax === 0) {
    return null;
  }

  return roundTo2((totalScore / totalMax) * 100);
}

// One EX sub-test (ST1, ST2, or TE): score / max x 100. Unlike WW/PT,
// this is always exactly one raw score and one max — not an aggregate.
function subTestPercentage(score, max) {
  if (score === null || score === undefined || max === null || max === undefined) {
    return null;
  }
  const maxNum = Number(max);
  if (maxNum === 0) {
    return null;
  }
  return roundTo2((Number(score) / maxNum) * 100);
}

// EX is a fixed, positional composite — ST1 x0.30 + ST2 x0.30 + TE x0.40.
// All three sub-test percentages must exist; there is no defined partial
// formula for two of three fixed positions in DO 015 s.2026, and
// inventing one here would be guessing at a grading rule.
function exPercentage(st1Percentage, st2Percentage, tePercentage) {
  if (
    st1Percentage === null ||
    st1Percentage === undefined ||
    st2Percentage === null ||
    st2Percentage === undefined ||
    tePercentage === null ||
    tePercentage === undefined
  ) {
    return null;
  }
  return roundTo2(st1Percentage * 0.3 + st2Percentage * 0.3 + tePercentage * 0.4);
}

// Any component's percentage, scaled by its grade_weight_configs weight
// for that subject (ww_weight, pt_weight, or ex_weight).
function weighted(percentage, weight) {
  if (percentage === null || percentage === undefined || weight === null || weight === undefined) {
    return null;
  }
  return roundTo2((Number(percentage) * Number(weight)) / 100);
}

// Initial Grade = sum of the three weighted components. All three must
// exist — IG is not an average of whatever has been entered so far.
function initialGrade(wwWeighted, ptWeighted, exWeighted) {
  if (
    wwWeighted === null ||
    wwWeighted === undefined ||
    ptWeighted === null ||
    ptWeighted === undefined ||
    exWeighted === null ||
    exWeighted === undefined
  ) {
    return null;
  }
  return roundTo2(wwWeighted + ptWeighted + exWeighted);
}

// Table 11 (GRADING_SPEC §6b) — the qualitative descriptor and pass/fail
// remark a parent sees printed next to a NUMERICAL grade (term_grade or
// final_grade) on the SF9. Bands are inclusive on both ends; checked from
// the top down so a boundary value (e.g. exactly 90) lands in the higher
// band. Returns null for a null/undefined input — the same "don't guess"
// contract as every other function in this module — and for anything
// outside 0-100, since Table 11 defines no band for it and this function
// must not invent one silently.
// ONE TABLE, TWO READERS (2026-09-22). Table 11's numerical bands and the
// Grade 1 letter bands of GRADING_SPEC §6a are the same five thresholds —
// 90 / 80 / 75 / 65 — and DepEd's letters are named after the qualitative
// descriptors, so A *is* Advancing. Keeping two hardcoded ladders would let a
// future edit move one and not the other, and nothing would catch it: a
// Grade 1 learner would be banded D while the same score printed
// "Connecting" for Grade 2. So the thresholds exist ONCE and both functions
// read them.
//
// Ordered high to low and matched top-down, so a boundary value (exactly 90)
// lands in the HIGHER band. The last row's `min` is -Infinity rather than 0:
// the 0-100 range check happens before the walk, and a floor of 0 here would
// silently make a negative score Emerging instead of null.
const BANDS = [
  { min: 90, letter: 'A', descriptor: 'Advancing', remarks: 'Passed' },
  { min: 80, letter: 'B', descriptor: 'Benchmarking', remarks: 'Passed' },
  { min: 75, letter: 'C', descriptor: 'Connecting', remarks: 'Passed' },
  { min: 65, letter: 'D', descriptor: 'Developing', remarks: 'Failed' },
  { min: -Infinity, letter: 'E', descriptor: 'Emerging', remarks: 'Failed' },
];

// Shared by both readers below. Returns null for a missing input and for
// anything outside 0-100 — Table 11 and §6a both define bands only inside
// that range, and this module's standing contract is to return null rather
// than invent one. NOTE the consequence, because percentages are deliberately
// NOT clamped elsewhere in this file: a weighted score above 100 (bonus
// points) yields NO band and therefore no letter, which renders as Pending.
// That is the honest answer — "the school's table does not say" — and a cap,
// if the school ever wants one, belongs in route validation as explicit
// policy, not hidden in here.
function bandFor(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0 || numeric > 100) {
    return null;
  }
  return BANDS.find((band) => numeric >= band.min) || null;
}

function qualitativeDescriptor(grade) {
  const band = bandFor(grade);
  return band ? { descriptor: band.descriptor, remarks: band.remarks } : null;
}

// GRADING_SPEC §6a — the Grade 1 letter, from the RAW weighted score. No
// transmutation: Grade 1 never touches transmutation_table, so this takes the
// Initial Grade exactly as computed and bands it.
//
// Returns the bare letter. The letter's meaning comes from
// descriptiveGradeMeaning() below, which is already what every reader uses —
// so a caller that stores this letter gets the same descriptor a
// teacher-entered letter has always produced, through the same lookup.
function bandForScore(score) {
  const band = bandFor(score);
  return band ? band.letter : null;
}

// Table 8 (GRADING_SPEC §6) — what a Grade 1 DESCRIPTIVE letter means, in
// English and Filipino. Notice the English words are the SAME words as
// Table 11's numerical descriptors (Advancing/Benchmarking/...) — DepEd's
// own letters are named after the qualitative bands, not an independent
// vocabulary; this is not a coincidence this module invented. Returns
// null for anything other than the five valid letters — same "don't
// guess" contract as the rest of this module.
const DESCRIPTIVE_GRADE_MEANINGS = {
  A: { descriptor: 'Advancing', filipino: 'Namumukod-tangi' },
  B: { descriptor: 'Benchmarking', filipino: 'Napamamalas' },
  C: { descriptor: 'Connecting', filipino: 'Natutungo' },
  D: { descriptor: 'Developing', filipino: 'Napauunlad' },
  E: { descriptor: 'Emerging', filipino: 'Nagsisimula' },
};
function descriptiveGradeMeaning(letter) {
  return DESCRIPTIVE_GRADE_MEANINGS[letter] || null;
}

module.exports = {
  roundTo2,
  roundToWhole,
  componentPercentage,
  subTestPercentage,
  exPercentage,
  weighted,
  initialGrade,
  qualitativeDescriptor,
  bandForScore,
  descriptiveGradeMeaning,
};
