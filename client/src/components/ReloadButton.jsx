import { buttonClass } from './buttonClass';
import { DURATION, EASE, MOTION_OK, gsap } from '../motion/motion';

// RELOAD — one section's own data, asked for again (feat/ui-refresh).
//
// `onReload` is the section's EXISTING fetch — the same call, with whatever
// filters, page and sort are applied right now. This button never knows what
// it reloads and never touches state; it only says "ask again".
//
// DISABLED WHILE LOADING, so a second request cannot be stacked on the first,
// and the icon spins for as long as `loading` is true (Font Awesome's own
// `fa-spin`, which stands still under reduced motion).
//
// `disabled` + `hint` ARE FOR UNSAVED WORK. On the bulk-entry screens (class
// record, attendance) a reload would replace what has been typed, so while
// anything is unsaved the page passes `disabled` and a `hint` saying why —
// the hint is the button's title, so the reason is one hover or long-press
// away rather than a dead control with no explanation.
//
// THE NAME: `label` is the accessible name ("Reload announcements"); the
// visible word is always "Reload" and is shown from `sm` up, icon alone
// below it (a 44px target either way). `compact` keeps it icon-only at every
// width — inside a dashboard card's header.
//
// The quick turn on click is the one GSAP tween here: transform only, 0.4 s,
// and not created at all under reduced motion.
export default function ReloadButton({
  onReload,
  loading = false,
  disabled = false,
  hint = '',
  label = 'Reload',
  compact = false,
  className = '',
}) {
  // The turn is started from the click itself, on the clicked button's own
  // icon — no ref, no effect. A 0.4 s tween on a node that unmounts meanwhile
  // simply ends; `overwrite` stops a second click stacking a second turn.
  function handleClick(event) {
    const glyph = event.currentTarget.querySelector('[data-reload-icon]');
    if (glyph && window.matchMedia(MOTION_OK).matches) {
      gsap.fromTo(
        glyph,
        { rotation: 0 },
        { rotation: 360, duration: DURATION.slow, ease: EASE, overwrite: true, clearProps: 'transform' }
      );
    }
    if (onReload) onReload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={label}
      title={hint || label}
      className={`${buttonClass({
        variant: 'secondary',
        size: compact ? 'icon-sm' : 'sm',
      })} print:hidden ${className}`}
    >
      <span data-reload-icon="" aria-hidden="true" className="flex items-center justify-center">
        <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`} />
      </span>
      {compact ? null : <span className="hidden sm:inline">Reload</span>}
    </button>
  );
}
