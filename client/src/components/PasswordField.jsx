import FormField, { controlClass, errorClass } from './FormField';

// FormField shape 4 (render) + controlClass. Show/hide is per field.
// Third copy extracted from Teacher Settings and Parent Settings; create-
// parent on Teacher → Students is the consumer that hit three.
// Do not add a fifth FormField shape. Login is not this component.
//
// 2026-09-18 (Settings redesign): `error` renders the message under the field
// AND turns the border red — shape 4 never got the red border before, so a
// refused password showed a red message over a grey input. `inputRef` lets a
// page move focus to the field that was refused (§7c: the result renders at
// the control that caused it — and, for a refused current password, focus
// goes there too). `below` is a node rendered under the input inside the
// field — the live password checklist — kept out of FormField's `hint`
// because a <ul> cannot live inside that <p>.

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  revealed,
  onToggleReveal,
  error,
  inputRef,
  disabled = false,
  required = false,
  below,
}) {
  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      required={required}
      render={({ id, describedBy, invalid }) => (
        <>
          <div className="relative">
            <input
              ref={inputRef}
              id={id}
              type={revealed ? 'text' : 'password'}
              value={value}
              onChange={onChange}
              autoComplete={autoComplete}
              disabled={disabled}
              required={required}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              className={`${controlClass} pr-10 ${invalid ? errorClass : ''}`}
            />
            <button
              type="button"
              onClick={onToggleReveal}
              disabled={disabled}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
            >
              <i className={`fa-solid ${revealed ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
          {below}
        </>
      )}
    />
  );
}
