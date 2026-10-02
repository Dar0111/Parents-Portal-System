import { parseCell } from './useClassRecord';

// One score box in the grid.
//
// ---------------------------------------------------------------------------
// THE KEYBOARD MODEL IS THE FEATURE, NOT POLISH
// ---------------------------------------------------------------------------
// ENTER MOVES DOWN THE COLUMN, because that is the real workflow: a teacher
// records one quiz for forty learners, not nine scores for one learner.
// Arrows move in all four directions. Tab is deliberately NOT overridden — it
// keeps DOM order, because remapping it breaks the browser's own focus model
// and every screen reader's expectations along with it.
//
// Without this the teacher reaches for the mouse between every learner. At
// forty learners across nine slots that is the difference between the grid
// being faster than the old one-learner-at-a-time modal and being slower, so
// it is not a refinement of the feature — it is most of it.
//
// Movement skips disabled cells (an unused slot's column, a locked learner's
// row) by walking on in the same direction until it finds one that is not,
// so a locked row in the middle of a class does not trap the cursor.

// Not exported: the page never needs to build a cell id, and exporting a
// non-component from a component file costs a fast-refresh warning for no
// benefit (the same trade FormStatus documents in the other direction,
// where the export IS needed).
const cellId = (studentId, field) => `cr-${studentId}-${field}`;

function focusCell(id) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (el && !el.disabled) {
    el.focus();
    el.select?.();
    return true;
  }
  return false;
}

// `grid` is { rows: [studentId], cols: [field] } — the navigable order as the
// page renders it, so this never has to know what a slot or a Summative part
// is. Walks past disabled cells rather than stopping at them.
function move(grid, studentId, field, dRow, dCol) {
  const r = grid.rows.indexOf(studentId);
  const c = grid.cols.indexOf(field);
  if (r === -1 || c === -1) return;

  let row = r;
  let col = c;
  // At most one full pass in each direction: if every remaining cell is
  // disabled, focus simply stays where it is rather than looping forever.
  for (let step = 0; step < grid.rows.length * grid.cols.length; step += 1) {
    row += dRow;
    col += dCol;
    if (row < 0 || row >= grid.rows.length || col < 0 || col >= grid.cols.length) return;
    if (focusCell(cellId(grid.rows[row], grid.cols[col]))) return;
  }
}

// AUTOCOMPLETE IS PRIVACY HERE, not tidiness (browser check, 2026-09-22).
// Chrome offered saved logins on a score box — "ADMIN001" and a parent's
// login id, which IS a learner's LRN (§5c: half a credential). A grid of
// bare numeric inputs looks enough like a login form for the heuristic to
// fire. `autoComplete="off"` plus a name that is plainly not a credential
// field stops it; the id already addresses the cell.
export default function Cell({ studentId, field, value, onChange, disabled, hint, grid, aboveMax, dirty }) {
  const parsed = parseCell(value);
  const invalid = Boolean(parsed.error);

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      move(grid, studentId, field, event.shiftKey ? -1 : 1, 0);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(grid, studentId, field, 1, 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(grid, studentId, field, -1, 0);
      return;
    }
    // Left/right only move between cells when the caret is already at the
    // edge of the text — otherwise they are doing their normal job inside
    // the value the teacher is editing.
    const el = event.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (event.key === 'ArrowRight' && atEnd) {
      event.preventDefault();
      move(grid, studentId, field, 0, 1);
      return;
    }
    if (event.key === 'ArrowLeft' && atStart) {
      event.preventDefault();
      move(grid, studentId, field, 0, -1);
    }
  }

  // Three visual states, and they are distinguishable without colour: a
  // ring plus a title. `aboveMax` is amber, never red — a score above its
  // highest possible score is ALLOWED by the server (bonus points are not
  // clamped), so it is something to acknowledge at Save, not an error (§4).
  const ring = invalid
    ? 'ring-2 ring-danger-edge-strong'
    : aboveMax
      ? 'ring-2 ring-warning-edge-strong'
      : dirty
        ? 'ring-2 ring-info-edge'
        : '';

  // THE BOX IS THE SAME BOX (feat/ui-refresh): width, padding and text size
  // are untouched, so the grid's measured row height and column widths are
  // too. What changed is the corner (the small-chip radius) and the keyboard
  // focus — the shared 2px outline, drawn OUTSIDE the state ring so a focused
  // cell still shows whether it is unsaved, above its maximum or invalid. No
  // transition: a cell is typed into, and nothing in this grid moves.
  return (
    <input
      id={cellId(studentId, field)}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={`score-${studentId}-${field}`}
      className={`w-14 rounded-lg border border-edge-strong bg-surface px-1.5 py-1 text-center text-sm tabular-nums text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-fg-muted ${ring}`}
      value={value ?? ''}
      disabled={disabled}
      title={hint}
      aria-label={hint}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
