// THE PHONE'S BUTTON, AS ONE SET OF CLASSES (feat/ui-refresh, 2026-10-02) —
// the web's components/buttonClass.js, in React Native's terms. Until this
// file the phone had 124 Pressables with their own class strings and two
// file-local `Button`s that disagreed.
//
// A plain module beside Button.jsx, so the component file exports a component
// only (react/only-export-components).
//
// THE HEIGHT IS IN dp, AS A NUMBER, NEVER A CLASS. The phone's rem is 14
// (M19), so `min-h-12` would be 42dp; the drawer already sets its 48dp
// targets through a style object for the same reason (M20).
//   md   48dp — every form action and page action
//   sm   44dp — an action inside a card or a row
//   lg   52dp — the full-width auth submit
//
// `ripple` and `ink` are TOKEN NAMES, resolved to the theme's value by
// Button.jsx: the Android ripple and an SVG icon take a colour value, not a
// class (§8 still holds — the value is the token's). The neutral ripple is
// `edge-strong`, not `surface-muted`: Android draws a ripple at reduced
// alpha, and the lighter token all but vanishes on a white surface.
//
// THE WEB'S SHAPE RULES (feat/look-fixes, 2026-10-05; FRONTEND §27f, MOBILE
// M23): a button is a CONTROL, `rounded-lg` (7dp at the phone's rem); a card
// is a CONTAINER, `rounded-xl`. EVERY VARIANT HAS A 1dp BORDER — the filled
// ones in their own fill colour, ghost a transparent one — so a button that
// changes variant in place (FilterActions' Apply) keeps the same box.
const BOX = 'flex-row items-center justify-center gap-2 overflow-hidden rounded-lg border';

const SIZES = {
  md: { pad: 'px-4 py-2.5', minHeight: 48, label: 'text-sm' },
  sm: { pad: 'px-3 py-2', minHeight: 44, label: 'text-sm' },
  lg: { pad: 'px-5 py-3', minHeight: 52, label: 'text-base' },
};

const VARIANTS = {
  // The one filled accent action on a screen.
  primary: { box: 'border-primary bg-primary', label: 'text-primary-fg', ink: 'primary-fg', ripple: 'primary-hover' },
  // The neutral bordered button: Cancel, Reset, a row action.
  secondary: { box: 'border-edge-strong bg-surface', label: 'text-fg-secondary', ink: 'fg-secondary', ripple: 'edge-strong' },
  // No frame: a quiet control beside others.
  ghost: { box: 'border-transparent', label: 'text-fg-body', ink: 'fg-body', ripple: 'edge-strong' },
  // A destructive confirm.
  danger: { box: 'border-danger-solid bg-danger-solid', label: 'text-solid-fg', ink: 'solid-fg', ripple: 'danger-solid-hover' },
  // A destructive row action, before the confirmation that names it.
  'danger-outline': { box: 'border-danger-edge bg-surface', label: 'text-danger-text', ink: 'danger-text', ripple: 'danger-edge' },
  // An approving confirm.
  success: { box: 'border-success-solid bg-success-solid', label: 'text-solid-fg', ink: 'solid-fg', ripple: 'success-solid-hover' },
};

export function buttonStyles({ variant = 'secondary', size = 'md', full = false, disabled = false } = {}) {
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const s = SIZES[size] || SIZES.md;
  return {
    box: [BOX, s.pad, v.box, full ? 'self-stretch' : '', disabled ? 'opacity-60' : ''].filter(Boolean).join(' '),
    label: `${s.label} font-semibold ${v.label}`,
    minHeight: s.minHeight,
    ink: v.ink,
    ripple: v.ripple,
  };
}

// THE CARD SURFACE: the CONTAINER corner (`rounded-xl`, 10.5dp at the phone's
// rem; 14dp before feat/look-fixes) and the hairline edge. Add padding at the
// call site.
export const cardClass = 'rounded-xl border border-edge bg-surface';
