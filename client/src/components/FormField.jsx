import { useId } from 'react';

// Shared control styling, exported so a page rendering a control this
// component does not cover (a date range, a custom picker) can still match.
// THE ERROR BORDER NEVER SHOWED, FOR ANY SHAPE, UNTIL 2026-09-18. The old
// composition was `${controlClass} ${error ? errorClass : ''}` — BOTH
// `border-slate-300` and `border-rose-300` on the element. Same specificity,
// so the stylesheet's order decides, and Tailwind v4 emits colour utilities in
// theme order: rose (byte 14876 of the built CSS) before slate (15086). Slate
// won every time; the message turned red and the input stayed grey — seen on
// Create teacher (Branch A) and Change password (Branch B). The fix is not a
// different class but NOT emitting the slate state classes when invalid:
// controlClassFor(invalid) picks one state or the other, never both.
const controlBaseClass =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
const normalStateClass = 'border-slate-300 focus:border-slate-400 focus:ring-slate-200';

// Exported for shape-4 callers: the render object tells them `invalid`, and
// this is the border they apply — the same one shapes 1–3 get.
export const errorClass = 'border-rose-300 focus:border-rose-400 focus:ring-rose-100';

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
//
// Trade-off, accepted: one width for every filter select means "All statuses"
// is as wide as the longest section name, and a four-control bar wraps sooner
// on a narrow laptop. Uniform and stable beats snug and jumpy.
export const filterSelectClass = 'w-full sm:w-72';

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
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}

      {control}

      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
