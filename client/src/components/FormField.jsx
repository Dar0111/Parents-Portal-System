import { useId } from 'react';
import { buttonClass } from './buttonClass';

// Shared control styling, exported so a page rendering a control this
// component does not cover (a date range, a custom picker) can still match.
//
// THE CONTROL IS 44px TALL AND 8px-CORNERED (feat/ui-refresh, 2026-10-02;
// the corner since feat/look-fixes, 2026-10-05): `min-h-11 rounded-lg`, the
// same height and the CONTROL corner every button has (buttonClass.js, §27f),
// so a filter row's inputs and its Apply line up and a finger has a full
// target. A MIN-height, so a <textarea> still takes the height its `rows`
// ask for.
//
// FOCUS IS THE ACCENT BORDER (feat/look-fixes): `focus:border-focus-accent`,
// 5.17:1 on `surface` in Light and 6.97:1 in Dark (lint:contrast's
// focus-accent/surface pair). It was `focus-edge`, 2.56:1 in Light — under
// WCAG 1.4.11's 3:1, so in Light a focused field barely differed from an
// idle one. The 2px `focus-ring` halo stays as decoration around it.
//
// THE ERROR BORDER NEVER SHOWED, FOR ANY SHAPE, UNTIL 2026-09-18. The old
// composition was `${controlClass} ${error ? errorClass : ''}` — BOTH
// `border-edge-strong` and `border-danger-edge-strong` on the element. Same specificity,
// so the stylesheet's order decides, and Tailwind v4 emits colour utilities in
// theme order: rose (byte 14876 of the built CSS) before slate (15086). Slate
// won every time; the message turned red and the input stayed grey — seen on
// Create teacher (Branch A) and Change password (Branch B). The fix is not a
// different class but NOT emitting the slate state classes when invalid:
// controlClassFor(invalid) picks one state or the other, never both.
const controlBaseClass =
  'block min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg shadow-xs transition placeholder:text-fg-muted focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-fg-muted';
const normalStateClass = 'border-edge-strong focus:border-focus-accent focus:ring-focus-ring';

// Exported for shape-4 callers: the render object tells them `invalid`, and
// this is the border they apply — the same one shapes 1–3 get.
export const errorClass = 'border-danger-edge-strong focus:border-danger-edge-focus focus:ring-danger-ring-focus';

// The normal control, unchanged as a string for every existing caller of
// `controlClass` (a custom range picker, the gallery). Do not append
// `errorClass` to it — that is the bug above; use controlClassFor().
export const controlClass = `${controlBaseClass} ${normalStateClass}`;

export function controlClassFor(invalid) {
  return `${controlBaseClass} ${invalid ? errorClass : normalStateClass}`;
}

// The width every filter-bar <select> gets. Pass it as the FormField's
// `className` — it sizes the WRAPPER, which is what a bare flex item lacks.
//
// THE BUG IT FIXES: `controlClass` is `w-full`, so a select fills its wrapper
// — but the wrapper is `<div className={className}>`, and the filter-bar
// selects passed no className at all. A flex item with no width is sized by
// its content, and a select's content changes with the selection, so the
// control visibly resized as you picked: Admin → Students' Section placeholder
// alone swings between "Pick a grade first" and "All sections", moving Search
// and Apply sideways. Only three selects in the whole client had a width
// before this (two `max-w-xs`, one `w-48`, all on Parent pages), which is why
// this is one shared token rather than a per-page fix.
//
// A FIXED width, not `min-w-`: a minimum still grows to fit a long option, so
// the control would still move — just less often, which is worse to diagnose.
//
// WHY w-72 (18rem / 288px). Sized from the longest option text these selects
// can really show, both 30 characters: "Mapagkakatiwalaan (no adviser)" on
// Admin → Attendance (only 3 of 23 sections have an adviser, so the suffix is
// the common case) and "Araling Panlipunan (not yours)" on Teacher → Grades.
// At the control's 14px text that is ~216px of glyphs, plus `px-3` (24px) and
// the native dropdown arrow (~20px) — about 260px needed. w-64 (256px) is
// under it; w-72 leaves ~28px. Truncating a section name is the exact defect
// being fixed, so the tie goes to the wider token.
// (Those figures were taken at the 14px system face. Since feat/ui-refresh the
// control's text is 15px Source Sans 3 — a narrower face — and the sum has NOT
// been re-measured; the width itself is unchanged.)
//
// Trade-off, accepted: one width for every filter select means "All statuses"
// is as wide as the longest section name, and a four-control bar wraps sooner
// on a narrow laptop. Uniform and stable beats snug and jumpy.
export const filterSelectClass = 'w-full sm:w-72';

// THE SAME FIX FOR DATE AND SEARCH INPUTS (item 5, 2026-09-25). Six filter
// controls across four pages carried NO width class at all — every date input,
// plus `admin/UsersPage`'s search — so their `FormField` wrapper was a
// content-sized flex item and the input inside it rendered at the browser's
// default width, around 180px, sitting beside the buttons instead of stacking.
// That is the same defect the note above describes for selects, left unfixed
// on the controls that are not selects.
//
// NARROWER THAN A SELECT ON PURPOSE. A date input's content is fixed and
// short, and two dates at `sm:w-72` would push Apply off a 640px row — the
// wrapping this constant exists to prevent. Below `sm` both are `w-full` and
// stack, which is the part that matters at 390px.
//
// ONE DELIBERATE EXCEPTION, not an oversight: `teacher/StudentsPage`'s search
// keeps `min-w-56 flex-1`. It is that page's primary control and was sized
// that way on purpose; flattening a considered choice into a shared constant
// would be the wrong kind of consistency.
export const filterFieldClass = 'w-full sm:w-44';

// THE NEUTRAL BORDERED BUTTON, single-sourced (item 5b, 2026-09-25). Item 5
// wrote this string into `FilterActions` as a fresh literal, and the code
// review found the same string already living in `admin/AnnouncementsPage`
// and, in a smaller `px-3 py-1.5` form, in every empty-state Reset button on
// the nine filter pages. `FilterActions`' quiet Apply and its Reset are meant
// to be a matched pair BY CONSTRUCTION — which is only true if both read one
// constant. The empty-state buttons on the pages are deliberately NOT
// re-styled here (flagged, out of 5b's scope).
//
// IT IS THE SECONDARY BUTTON NOW (feat/ui-refresh, 2026-10-02) — the same
// classes `buttonClass({ variant: 'secondary' })` gives every other neutral
// button, evaluated once into this constant so the export name and every
// caller stay as they were. WITHOUT THE TWO `disabled:` UTILITIES, on
// purpose: `FilterActions`' Apply is quiet when clean and never disabled
// (§21), and its proof reads the markup for that very word.
//
// EXPORTED AS A TEMPLATE STRING, NOT AS THE CALL ITSELF. oxlint's
// react(only-export-components) accepts a string or template literal as a
// constant export and counts `export const x = someCall()` as a warning — the
// lint baseline has no room for one. Same value either way.
const neutralButton = buttonClass({ variant: 'secondary', disabledStyles: false });
export const buttonNeutralClass = `${neutralButton}`;

// Four supported call shapes, and only four:
//
//   1. <FormField label="Name" placeholder="…" />                  -> <input>
//   2. <FormField label="Remarks" as="textarea" rows={3} />         -> <textarea>
//   3. <FormField label="Status" as="select">{options}</FormField>  -> <select>
//   4. <FormField label="Range" render={({ id }) => …} />           -> anything
//
// `children` are the children OF the rendered control, which is what makes
// shape 3 work — a <select> needs both `as` (the control) and children (its
// options). They are forwarded only when `as !== 'input'`: <input> is a void
// element and React throws if it is given children.
//
// Shape 4 is the escape hatch for a control this component does not model.
// `render` receives a single object ({ id, describedBy, invalid }) rather than
// positional arguments, so adding a piece of wiring later is not a breaking
// change at every existing call site — `invalid` (2026-09-18) is exactly that
// addition: shapes 1–3 got the red border from `error` all along, shape 4
// never did, so a refused password showed a red message over a grey input.
export default function FormField({
  label,
  as = 'input',
  id,
  error,
  hint,
  required = false,
  className = '',
  render,
  children,
  ...rest
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  const Control = as;
  const control = render ? (
    render({ id: fieldId, describedBy, invalid: Boolean(error) })
  ) : (
    <Control
      id={fieldId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={controlClassFor(Boolean(error))}
      {...rest}
    >
      {as === 'input' ? undefined : children}
    </Control>
  );

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-fg-secondary">
          {label}
          {required ? <span className="ml-0.5 text-danger-icon">*</span> : null}
        </label>
      ) : null}

      {control}

      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-sm text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
