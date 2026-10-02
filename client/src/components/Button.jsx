import { buttonClass } from './buttonClass';

// The button (feat/ui-refresh). Variants, sizes and the reasoning are in
// buttonClass.js; this is the element over them.
//
//   <Button variant="primary" onClick={save}>Save</Button>
//   <Button variant="primary" loading={saving} type="submit">Save</Button>
//   <Button icon="fa-plus" variant="primary">Create teacher</Button>
//   <Link to="/x" className={buttonClass({ variant: 'secondary' })}>Open</Link>
//
// `type` DEFAULTS TO "button", not the browser's "submit": a button dropped
// into a form must not submit it by accident. A submit says so.
//
// `loading` disables the button and swaps the leading icon for a spinner —
// the label stays, so the button keeps its width and its name. A page that
// changes the label while busy ("Saving…") still does that itself.
//
// WITHOUT `icon` OR `loading`, THE CHILDREN ARE THE BUTTON'S ONLY CONTENT —
// no wrapper span — so `<button …>Try again</button>` stays exactly that for
// the proofs that read it.
//
// The icon's wrapper carries the flex, never the element with `fa-solid`:
// Font Awesome's unlayered `display: inline-block` beats Tailwind's layered
// `.flex` (found in D3, 2026-09-19).
export default function Button({
  variant = 'secondary',
  size = 'md',
  full = false,
  loading = false,
  icon = null,
  type = 'button',
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const glyph = loading ? 'fa-circle-notch fa-spin' : icon;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, full, className })}
      {...rest}
    >
      {glyph ? (
        <span aria-hidden="true" className="flex items-center justify-center">
          <i className={`fa-solid ${glyph}`} />
        </span>
      ) : null}
      {children}
    </button>
  );
}
