import { useId } from 'react';

// Shared control styling, exported so a page rendering a control this
// component does not cover (a date range, a custom picker) can still match.
export const controlClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const errorClass = 'border-rose-300 focus:border-rose-400 focus:ring-rose-100';

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
// `render` receives a single object ({ id, describedBy }) rather than
// positional arguments, so adding a third piece of wiring later is not a
// breaking change at every existing call site.
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
    render({ id: fieldId, describedBy })
  ) : (
    <Control
      id={fieldId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={`${controlClass} ${error ? errorClass : ''}`}
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
