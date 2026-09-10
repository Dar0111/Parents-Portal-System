import FormField, { controlClass } from './FormField';

// FormField shape 4 (render) + controlClass. Show/hide is per field.
// Third copy extracted from Teacher Settings and Parent Settings; create-
// parent on Teacher → Students is the consumer that hit three.
// Do not add a fifth FormField shape. Admin → Users and Login are not
// this component.

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  revealed,
  onToggleReveal,
}) {
  return (
    <FormField
      label={label}
      hint={hint}
      render={({ id, describedBy }) => (
        <div className="relative">
          <input
            id={id}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={onChange}
            autoComplete={autoComplete}
            aria-describedby={describedBy}
            className={`${controlClass} pr-10`}
          />
          <button
            type="button"
            onClick={onToggleReveal}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
          >
            <i className={`fa-solid ${revealed ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
        </div>
      )}
    />
  );
}
