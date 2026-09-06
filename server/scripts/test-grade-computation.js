/**
 * Unit tests for utils/gradeComputation.js — direct function calls, no
 * server, no DB, no HTTP. This is the arithmetic itself: worked examples
 * with numbers checkable by hand, every partial-state null case, rounding
 * boundaries, division by zero, and the over-100 (bonus points) decision.
 *
 * Usage: npm run test:grade-computation
 */
const {
  roundTo2,
  componentPercentage,
  subTestPercentage,
  exPercentage,
  weighted,
  initialGrade,
  qualitativeDescriptor,
  descriptiveGradeMeaning,
} = require('../utils/gradeComputation');

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\ngradeComputation unit tests\n');

// --- Full worked example, core weights (20/50/30) ---
console.log('Worked example — core weights (20/50/30):');

const wwRows = [
  { score: 45, max_score: 50 },
  { score: 42, max_score: 50 },
];
const ptRows = [
  { score: 88, max_score: 100 },
  { score: 92, max_score: 100 },
];

const wwPct = componentPercentage(wwRows);
assert(wwPct === 87.0, `ww_percentage = 87.00 (got ${wwPct})`);

const ptPct = componentPercentage(ptRows);
assert(ptPct === 90.0, `pt_percentage = 90.00 (got ${ptPct})`);

const st1Pct = subTestPercentage(17, 20);
const st2Pct = subTestPercentage(16, 20);
const tePct = subTestPercentage(45, 50);
assert(st1Pct === 85.0, `ST1 percentage = 85.00 (got ${st1Pct})`);
assert(st2Pct === 80.0, `ST2 percentage = 80.00 (got ${st2Pct})`);
assert(tePct === 90.0, `TE percentage = 90.00 (got ${tePct})`);

const exPct = exPercentage(st1Pct, st2Pct, tePct);
assert(exPct === 85.5, `ex_percentage = 85.50 = (85x0.30)+(80x0.30)+(90x0.40) (got ${exPct})`);

const wwWeightedCore = weighted(wwPct, 20.0);
const ptWeightedCore = weighted(ptPct, 50.0);
const exWeightedCore = weighted(exPct, 30.0);
assert(wwWeightedCore === 17.4, `ww_weighted = 17.40 (got ${wwWeightedCore})`);
assert(ptWeightedCore === 45.0, `pt_weighted = 45.00 (got ${ptWeightedCore})`);
assert(exWeightedCore === 25.65, `ex_weighted = 25.65 (got ${exWeightedCore})`);

const igCore = initialGrade(wwWeightedCore, ptWeightedCore, exWeightedCore);
assert(igCore === 88.05, `Initial Grade = 88.05 = 17.40 + 45.00 + 25.65 (got ${igCore})`);

// --- Same raw scores, MAPEH/EPP weights (20/60/20) ---
console.log('\nSame raw scores — MAPEH/EPP weights (20/60/20):');

const wwWeightedMapeh = weighted(wwPct, 20.0);
const ptWeightedMapeh = weighted(ptPct, 60.0);
const exWeightedMapeh = weighted(exPct, 20.0);
assert(wwWeightedMapeh === 17.4, `ww_weighted = 17.40, unchanged (got ${wwWeightedMapeh})`);
assert(ptWeightedMapeh === 54.0, `pt_weighted = 54.00 (got ${ptWeightedMapeh})`);
assert(exWeightedMapeh === 17.1, `ex_weighted = 17.10 (got ${exWeightedMapeh})`);

const igMapeh = initialGrade(wwWeightedMapeh, ptWeightedMapeh, exWeightedMapeh);
assert(igMapeh === 88.5, `Initial Grade = 88.50 = 17.40 + 54.00 + 17.10 (got ${igMapeh})`);

assert(igCore !== igMapeh, 'Same raw scores produce a different Initial Grade under different weights');

// --- Partial states: never a partial number ---
console.log('\nPartial states — must be null, never a guessed number:');

assert(componentPercentage([]) === null, 'componentPercentage([]) — no components yet — is null');
assert(initialGrade(wwWeightedCore, null, null) === null, 'IG with only WW weighted is null (PT, EX missing)');
assert(initialGrade(wwWeightedCore, ptWeightedCore, null) === null, 'IG with WW+PT but no EX is null');
assert(exPercentage(st1Pct, st2Pct, null) === null, 'ex_percentage with ST1+ST2 but no TE is null');
assert(exPercentage(null, st2Pct, tePct) === null, 'ex_percentage missing ST1 is null');
assert(weighted(null, 20.0) === null, 'weighted(null, weight) is null');
assert(initialGrade(null, null, null) === null, 'IG with nothing entered is null');

// --- Rounding: half-up, not half-to-even (banker's) ---
console.log('\nRounding — half-up, deliberately not half-to-even:');

// 0.125 and 12.5 are both exactly representable in binary floating point
// (1/8 and 25/2) — no representation-error ambiguity in this case, so this
// isolates the rounding RULE itself, not a floating-point artifact.
// Half-up rounds 0.125 -> 0.13. Half-to-even (banker's rounding) would
// round it to 0.12 instead, since 2 is even and 3 is odd — this function
// deliberately does not do that.
assert(roundTo2(0.125) === 0.13, `roundTo2(0.125) = 0.13 under half-up (half-to-even would give 0.12) (got ${roundTo2(0.125)})`);

// A value whose intended 3rd-decimal boundary is affected by IEEE 754
// representation error (1.005 is stored as very slightly below 1.005) —
// the Number.EPSILON nudge in roundTo2 corrects this to the mathematically
// correct 1.01, not the naive Math.round(1.005*100)/100 result of 1.00.
assert(roundTo2(1.005) === 1.01, `roundTo2(1.005) = 1.01, correcting for floating-point representation error (got ${roundTo2(1.005)})`);

// --- Division by zero ---
console.log('\nDivision by zero:');

assert(subTestPercentage(18, 0) === null, 'subTestPercentage with max_score 0 is null, not Infinity/NaN');
assert(
  componentPercentage([{ score: 0, max_score: 0 }]) === null,
  'componentPercentage where every max_score sums to 0 is null'
);
assert(
  componentPercentage([{ score: 10, max_score: 20 }, { score: 0, max_score: 0 }]) !== null,
  'componentPercentage still computes correctly when only SOME rows have max_score 0 (sums, not per-row)'
);

// --- Over 100% (bonus points) — DECISION: not clamped ---
console.log('\nOver 100% (bonus points) — deliberately NOT clamped:');

// Decided here, not guessed: clamping would silently distort either a real
// data-entry mistake (a teacher meant to type 10.5, not 105) or a genuine
// bonus-points score a teacher intended — the pure computation layer has
// no way to tell which, and neither GRADING_SPEC.md nor DO 015 mentions a
// bonus-points cap. Clamping would be inventing a grading policy that
// doesn't exist. The honest, undistorted math is passed through; if a cap
// is ever wanted, it belongs in route-level validation (score <= max_score),
// a policy decision, not something buried in the arithmetic.
const bonusPct = subTestPercentage(105, 100);
assert(bonusPct === 105.0, `subTestPercentage(105, 100) = 105.00, not clamped to 100 (got ${bonusPct})`);

const bonusWeighted = weighted(bonusPct, 30.0);
assert(bonusWeighted === 31.5, `A >100% percentage flows through weighted() unclamped too (got ${bonusWeighted})`);

// --- Qualitative descriptor (Table 11) — every band boundary ---
console.log('\nQualitative descriptor (Table 11) — band boundaries:');

assert(
  qualitativeDescriptor(90).descriptor === 'Advancing' && qualitativeDescriptor(90).remarks === 'Passed',
  'qualitativeDescriptor(90) = Advancing/Passed (floor of the top band)'
);
assert(
  qualitativeDescriptor(89).descriptor === 'Benchmarking' && qualitativeDescriptor(89).remarks === 'Passed',
  'qualitativeDescriptor(89) = Benchmarking/Passed (just below 90)'
);
assert(
  qualitativeDescriptor(80).descriptor === 'Benchmarking' && qualitativeDescriptor(80).remarks === 'Passed',
  'qualitativeDescriptor(80) = Benchmarking/Passed (floor of that band)'
);
assert(
  qualitativeDescriptor(79).descriptor === 'Connecting' && qualitativeDescriptor(79).remarks === 'Passed',
  'qualitativeDescriptor(79) = Connecting/Passed (just below 80)'
);
assert(
  qualitativeDescriptor(75).descriptor === 'Connecting' && qualitativeDescriptor(75).remarks === 'Passed',
  'qualitativeDescriptor(75) = Connecting/Passed (floor of the passing band)'
);
assert(
  qualitativeDescriptor(74).descriptor === 'Developing' && qualitativeDescriptor(74).remarks === 'Failed',
  'qualitativeDescriptor(74) = Developing/Failed (just below the passing floor)'
);
assert(
  qualitativeDescriptor(65).descriptor === 'Developing' && qualitativeDescriptor(65).remarks === 'Failed',
  'qualitativeDescriptor(65) = Developing/Failed (floor of that band)'
);
assert(
  qualitativeDescriptor(64).descriptor === 'Emerging' && qualitativeDescriptor(64).remarks === 'Failed',
  'qualitativeDescriptor(64) = Emerging/Failed (just below 65)'
);
assert(
  qualitativeDescriptor(0).descriptor === 'Emerging' && qualitativeDescriptor(100).descriptor === 'Advancing',
  'qualitativeDescriptor covers both ends of the full 0-100 range'
);
assert(qualitativeDescriptor(null) === null, 'qualitativeDescriptor(null) is null, not a guess');
assert(qualitativeDescriptor(undefined) === null, 'qualitativeDescriptor(undefined) is null');
assert(qualitativeDescriptor(-1) === null, 'qualitativeDescriptor(-1) is null — Table 11 defines no band below 0');
assert(qualitativeDescriptor(100.01) === null, 'qualitativeDescriptor(100.01) is null — Table 11 defines no band above 100');

// --- Descriptive letter meaning (Table 8) — all five letters, English + Filipino ---
console.log('\nDescriptive letter meaning (Table 8):');

assert(
  descriptiveGradeMeaning('A').descriptor === 'Advancing' && descriptiveGradeMeaning('A').filipino === 'Namumukod-tangi',
  "descriptiveGradeMeaning('A') = Advancing / Namumukod-tangi"
);
assert(
  descriptiveGradeMeaning('B').descriptor === 'Benchmarking' && descriptiveGradeMeaning('B').filipino === 'Napamamalas',
  "descriptiveGradeMeaning('B') = Benchmarking / Napamamalas"
);
assert(
  descriptiveGradeMeaning('C').descriptor === 'Connecting' && descriptiveGradeMeaning('C').filipino === 'Natutungo',
  "descriptiveGradeMeaning('C') = Connecting / Natutungo"
);
assert(
  descriptiveGradeMeaning('D').descriptor === 'Developing' && descriptiveGradeMeaning('D').filipino === 'Napauunlad',
  "descriptiveGradeMeaning('D') = Developing / Napauunlad"
);
assert(
  descriptiveGradeMeaning('E').descriptor === 'Emerging' && descriptiveGradeMeaning('E').filipino === 'Nagsisimula',
  "descriptiveGradeMeaning('E') = Emerging / Nagsisimula"
);
// The same five English words as Table 11's numerical descriptors above —
// confirmed directly, not just asserted by eye reading the two tables.
assert(
  ['A', 'B', 'C', 'D', 'E'].every((letter) =>
    [qualitativeDescriptor(90), qualitativeDescriptor(89), qualitativeDescriptor(79), qualitativeDescriptor(74), qualitativeDescriptor(64)].some(
      (band) => band.descriptor === descriptiveGradeMeaning(letter).descriptor
    )
  ),
  "Table 8's five letter descriptors are the exact same words as Table 11's five numerical bands"
);
assert(descriptiveGradeMeaning('F') === null, "descriptiveGradeMeaning('F') is null — not a valid letter");
assert(descriptiveGradeMeaning(null) === null, 'descriptiveGradeMeaning(null) is null');
assert(descriptiveGradeMeaning('a') === null, "descriptiveGradeMeaning('a') is null — lowercase is not a valid key");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
