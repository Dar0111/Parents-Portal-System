// THE BUTTON, AS ONE SET OF CLASSES (feat/ui-refresh, 2026-10-02).
//
// Until this file there was no button: 209 `<button>`s carried their own
// class string — 14 spellings of the primary, 18 of the secondary, three
// different disabled opacities, and no focus style on any of them. This is
// the one definition; `Button.jsx` is the component over it, and a `<Link>`
// that must look like a button takes the same string from `buttonClass()`.
//
// A PLAIN MODULE, NOT INSIDE Button.jsx: a component file that also exports a
// function costs a `react(only-export-components)` warning, and the lint
// baseline has no room for one.
//
// SIZES ARE REM AND MIN-HEIGHTS, never fixed heights — a label that wraps at
// the Large text size grows the button instead of clipping.
//   md   44px. The default: every form action and page action.
//   sm   44px below `sm` (a finger), 36px from `sm` up (a pointer) — the row
//        action inside a table or a card.
//   lg   48px, full-width auth submits.
//   icon / icon-sm  square, for an icon-only control (give it an sr-only
//        label; the icon is aria-hidden).
//
// THE FOCUS OUTLINE IS `focus-accent`, 2px, offset 2px — a checked pair on
// `surface` (lint:contrast). Keyboard only (`focus-visible`).
//
// `disabledStyles: false` leaves out the two `disabled:` utilities, for a
// button that is never disabled and whose markup a proof reads for that word
// (FilterActions: Apply is quiet when clean, never disabled — §21).
//
// ONE RADIUS SCALE BY ROLE (feat/look-fixes, 2026-10-05; FRONTEND §27f): a
// CONTROL — this button, an input, a tab, a toggle track — is `rounded-lg`
// (8px); a CONTAINER (`cardClass` below, a modal) is `rounded-xl` (12px); a
// segment inside a track and a TAG (a status badge, an audience chip) are
// `rounded-md` (6px); avatars, the seal, dots and counts stay circles.
//
// EVERY VARIANT HAS A 1px BORDER, the filled ones in their own fill colour
// (hover included) and ghost a transparent one, so a button never changes
// size when its variant changes — Apply flips from secondary to primary in
// place — and a primary beside a secondary is the same box. No shadow: the
// fill and the border carry the button.
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-60';

const SIZES = {
  md: 'min-h-11 px-4 py-2 text-sm',
  sm: 'min-h-11 min-w-11 px-3 py-1.5 text-sm sm:min-h-9 sm:min-w-9',
  lg: 'min-h-12 px-5 py-3 text-base',
  icon: 'h-11 w-11 shrink-0',
  'icon-sm': 'h-11 w-11 shrink-0 sm:h-9 sm:w-9',
};

const VARIANTS = {
  // The one filled accent action on a screen.
  primary: 'border-primary bg-primary text-primary-fg hover:border-primary-hover hover:bg-primary-hover',
  // The neutral bordered button: Cancel, Reset, a row action.
  secondary: 'border-edge-strong bg-surface text-fg-secondary hover:bg-surface-muted',
  // No frame until hovered: toolbar and icon controls.
  ghost: 'border-transparent text-fg-body hover:bg-surface-muted hover:text-fg',
  // A destructive confirm.
  danger: 'border-danger-solid bg-danger-solid text-solid-fg hover:border-danger-solid-hover hover:bg-danger-solid-hover',
  // A destructive row action, before the confirmation that names it.
  'danger-outline': 'border-danger-edge bg-surface text-danger-text hover:bg-danger-soft',
  // An approving confirm.
  success: 'border-success-solid bg-success-solid text-solid-fg hover:border-success-solid-hover hover:bg-success-solid-hover',
};

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  full = false,
  disabledStyles = true,
  className = '',
} = {}) {
  return [
    BASE,
    SIZES[size] || SIZES.md,
    VARIANTS[variant] || VARIANTS.secondary,
    disabledStyles ? DISABLED : '',
    full ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

// A text link that behaves like a button or sits in running text: brand
// colour, underlined on hover, the same focus outline.
export const linkClass =
  'font-semibold text-brand underline-offset-2 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

// THE CARD SURFACE. Every panel, list frame and form card: the CONTAINER
// radius (12px), the hairline edge, and no shadow at rest — the edge carries
// the separation in both themes (§8; in dark a shadow is invisible anyway).
// Add padding at the call site.
export const cardClass = 'rounded-xl border border-edge bg-surface';
