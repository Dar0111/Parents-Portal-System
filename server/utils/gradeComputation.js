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

// WW/PT: an arbitrary number of raw scores, averaged as one combined
// percentage — sum(score) / sum(max_score) x 100. Well-defined with as
// few as one row; returns null only when there are no rows at all, or
// when every max_score sums to 0 (a percentage against zero possible
// points is undefined, not zero).
function componentPercentage(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
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

module.exports = {
  roundTo2,
  componentPercentage,
  subTestPercentage,
  exPercentage,
  weighted,
  initialGrade,
};
