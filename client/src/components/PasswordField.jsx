import FormField, { controlClassFor } from './FormField';

// FormField shape 4 (render) + controlClass. Show/hide is per field.
// Third copy extracted from Teacher Settings and Parent Settings; create-
// parent on Teacher → Students is the consumer that hit three.
// Do not add a fifth FormField shape.
//
// LOGIN USES THIS TOO, since 2026-09-19. This header used to end "Login is not
// this component", written when Login had two hand-rolled inputs and no reveal
// toggle at all — it was a description of that page, not a rule about this
// one. The Login redesign gave the page a real password field rather than a
// fourth copy of the toggle, so the sentence was retired with the thing it
// described.
//
// 2026-09-18 (Settings redesign): `error` renders the message under the field
// AND turns the border red — shape 4 never got the red border before, so a
// refused password showed a red message over a grey input. `inputRef` lets a
// page move focus to the field that was refused (§7c: the result renders at
// the control that caused it — and, for a refused current password, focus
// goes there too). `below` is a node rendered under the input inside the
// field — the live password checklist — kept out of FormField's `hint`
// because a <ul> cannot live inside that <p>.

// `leadingIcon` (2026-09-19, the Login addendum) is an optional Font Awesome
// class — `fa-lock` on Login. One prop rather than a new FormField shape: the
// reveal button already occupies the right inset of this control, so the left
// inset is the symmetrical slot and nothing else about the field changes. It
// is inert by construction — `pointer-events-none` and no aria, so it never
// takes focus and adds nothing to the accessible name; the label still says
// what the field is. Omitted, the control renders exactly as before, which is
// what every existing caller gets.
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
  leadingIcon,
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
            {/* THE FLEX GOES ON THE SPAN, NEVER ON THE <i>. Font Awesome ships
                `.fa-solid { display: var(--fa-display, inline-block) }`
                UNLAYERED, and Tailwind's `.flex` lives in `@layer utilities` —
                unlayered CSS beats layered CSS whatever the order, so `flex`
                on an element that also carries `fa-solid` is silently ignored
                and the glyph sits at the top of the box. Found in browser
                review 2026-09-19, after exactly that. The reveal button below
                never had the bug because the flex is on the <button>. */}
            {leadingIcon ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-fg-faint"
              >
                <i className={`fa-solid ${leadingIcon}`} />
              </span>
            ) : null}
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
              className={`${controlClassFor(invalid)} pr-10 ${leadingIcon ? 'pl-10' : ''}`}
            />
            <button
              type="button"
              onClick={onToggleReveal}
              disabled={disabled}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-faint transition hover:text-fg-body disabled:opacity-50"
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
