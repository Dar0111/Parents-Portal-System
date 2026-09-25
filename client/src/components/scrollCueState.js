// The arithmetic behind `ScrollCue.jsx` — pure, no JSX, no DOM.
//
// ITS OWN MODULE FOR TWO REASONS (§17b). A proof has to DRIVE this: an SSR
// render has no layout, so `scrollWidth`, `clientWidth` and every cell
// geometry come back as zero and the component renders with none of its state
// logic exercised — the same shape as §14e. And a function exported beside a
// component trips `react(only-export-components)`, which moved the oxlint
// baseline 43 → 45 once already (see `scripts/ssr-ui-a.jsx`'s header).
//
// TWO PAGES, TWO QUESTIONS, ONE FUNCTION. The class summary's columns are
// learning areas, so "how many are off to the right" is the useful answer and
// the count is the wording. The class record's columns are assessment slots
// within ONE subject, where a count says nothing — "7 more assessments" does
// not tell a teacher that Summative and the computed Grade are what they have
// not seen. So it measures the GROUP header row instead and names them.
// `cueState` takes the cells either way; whether a caller passes labels is
// what decides which answer it gets back.

// WHETHER TO SHOW A CUE AT ALL. A table overhanging by less than a character
// has nothing worth scrolling to (measured: the desktop class summary
// overflowed by 2px and nagged "Swipe for the Average →").
const GATE_SLACK = 24;

// WHICH COLUMNS THE HINT NAMES — strict, sub-pixel only. These are two
// different questions and one number cannot answer both: applying 24 here
// dropped "Performance Tasks" from the class record's hint at 390px while its
// WS column was visibly cut and its highest-possible-score hidden behind the
// button (browser check, 2026-09-25). Once a cue is shown at all, a column cut
// AT ALL is a column the reader has not read.
const CELL_SLACK = 1;

// A cell is "not fully visible" when its right edge is past the viewport's
// right edge. NOT when it merely starts past it: a column half on screen is a
// column the reader has not read, and at 390px the layout deliberately leaves
// the next one visibly cut off rather than fitting it exactly, so the
// half-visible case is the COMMON one here and not an edge case.
function hiddenCells(cells, viewportRight) {
  return cells.filter((cell) => cell.right > viewportRight + CELL_SLACK);
}

// `cells` is `[{ right, label? }]` in document order — the caller measures
// them, because only the page knows which row carries the meaningful columns
// (the summary has one header row; the record has two, and the leaf row is
// not the one worth naming).
//
// Returns everything the component renders from, so the component itself
// holds no arithmetic:
//
//   overflowing — is there anything to the right at all
//   scrolled    — has the reader moved, which is what the pinned column's
//                 shadow keys on (no shadow at rest; it means "there is
//                 content underneath me")
//   atEnd       — nothing further right, so the fade, the button and the
//                 hint all stand down together
//   hiddenCount — for the counting caller
//   hiddenLabels— for the naming caller
export function cueState({ scrollLeft = 0, clientWidth = 0, scrollWidth = 0, cells = [] } = {}) {
  // GATE_SLACK, not CELL_SLACK. This began at 1px on both, and 1px was too
  // literal a reading of the rule the gate exists for: the desktop class
  // summary overflowed by exactly 2px — scrollWidth 992 against clientWidth
  // 990 — and told the teacher to swipe for an Average column that was two
  // pixels short of fully visible. It also FLAPPED, appearing at 1279px and
  // vanishing at 1281px.
  //
  // Widening BOTH was the overcorrection, and it cost the hint its accuracy:
  // see CELL_SLACK. The gate asks "is there anything worth scrolling to"; the
  // cells ask "what has the reader not seen". Only the first is about
  // legibility of the overhang.
  const overflowing = scrollWidth > clientWidth + GATE_SLACK;
  const atEnd = !overflowing || scrollLeft + clientWidth >= scrollWidth - GATE_SLACK;
  const viewportRight = scrollLeft + clientWidth;
  const hidden = overflowing && !atEnd ? hiddenCells(cells, viewportRight) : [];

  return {
    overflowing,
    scrolled: scrollLeft > 0,
    atEnd,
    hiddenCount: hidden.length,
    hiddenLabels: hidden.map((cell) => cell.label).filter(Boolean),
  };
}

// One tap moves MOST of a screenful, not all of it: a full-width jump leaves
// nothing in common between the two views and the reader loses their place.
// The overlap is what makes the movement legible.
export function scrollStep(clientWidth) {
  return Math.max(1, Math.round((clientWidth || 0) * 0.8));
}

// "A, B and C" — the record's group wording. Listing them with commas only
// ("Performance Tasks, Summative, Grade") reads as a fragment; the last
// conjunction is what makes it a sentence a person can act on.
export function listLabels(labels) {
  const list = (labels || []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
