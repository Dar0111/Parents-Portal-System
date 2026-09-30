// Theme — Light / Dark / System — stored on THIS DEVICE only, like text size
// (textSize.js), and for the same reason: no server change, no user column, a
// shared family laptop keeps one setting for everyone who uses it.
//
// Applied as `data-theme="light|dark"` on <html>. index.css keys every token
// on `[data-theme="dark"]`, so the attribute is the whole mechanism: no page
// carries a per-theme variant class (docs/FRONTEND_CONVENTIONS.md §8).
//
// STARTUP: an inline <script> in client/index.html reads the same key with
// the same rules and sets the attribute BEFORE the module bundle loads, so the
// first paint is already the right theme — no flash from light to dark. That
// script also paints <html> itself dark (background + color-scheme) because in
// dev Vite injects the stylesheet from JS and the canvas would otherwise be
// white until then. That script and this module must agree; keep the two in
// step by hand (the script cannot import this file). applyTheme() below
// clears those two inline styles on every apply so a switch back to Light at
// runtime does not leave a dark <html> behind them.
//
// Every localStorage read/write is inside try/catch: private windows and
// blocked storage throw, and Settings must not crash for that — it applies
// the theme for this session and says it could not be remembered.

export const THEME_KEY = 'pp.theme';
export const THEMES = ['light', 'dark', 'system'];
const DEFAULT_THEME = 'light'; // a fresh device is Light (Darryl, 2026-09-19) — not System

// Duplicated in index.html's inline script — keep in step by hand.
const DARK_HTML_BACKGROUND = '#0A0C1F'; // the dark page (index.css), as in index.html

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'The default.' },
  { value: 'dark', label: 'Dark', description: 'Darker colors, easier on the eyes at night.' },
  { value: 'system', label: 'System', description: "Follows your device's setting and changes with it." },
];

function mediaQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return null;
  }
}

// The stored PREFERENCE (light | dark | system). An unknown or missing value
// reads as the default and is left in storage untouched until the user picks.
export function readTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME; // SSR / tests
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// The RESOLVED theme (light | dark) for a preference.
export function resolveTheme(preference) {
  if (preference === 'dark') return 'dark';
  if (preference === 'system') return mediaQuery()?.matches ? 'dark' : 'light';
  return 'light';
}

// Sets data-theme for this session. Also clears (or, for dark, re-sets) the
// two inline styles index.html paints before the bundle, so nothing sticks
// after a runtime switch.
export function applyTheme(preference) {
  if (typeof document === 'undefined') return 'light';
  const resolved = resolveTheme(preference);
  const html = document.documentElement;
  html.setAttribute('data-theme', resolved);
  if (resolved === 'dark') {
    html.style.colorScheme = 'dark';
    html.style.backgroundColor = DARK_HTML_BACKGROUND;
  } else {
    html.style.colorScheme = '';
    html.style.backgroundColor = '';
  }
  return resolved;
}

// Applies for this session, then tries to remember it. Returns whether the
// device will remember (false = storage refused; the theme still applied).
export function saveTheme(preference) {
  applyTheme(preference);
  try {
    if (preference === DEFAULT_THEME) window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

// PRINTING IN DARK PUTS NEAR-WHITE TEXT ON WHITE PAPER (UI-D, 2026-09-25).
//
// Browsers do not print backgrounds by default, so a dark theme's `--fg`
// (slate-100) lands on an unprinted white sheet. That is not "hard to read",
// it is invisible — and it would hit the one output the school actually
// keeps, the Summary of Grades.
//
// WHY HERE AND NOT IN `@media print`. The obvious fix is to re-declare the
// light values inside a print media query, and it is the wrong one: that is a
// verbatim second copy of ~71 custom properties, and the next person to
// change a token would have to change it in two places with nothing to catch
// them missing one. This module already owns the attribute that IS the theme,
// so it can swap the attribute for the duration of the print and leave one
// copy of the values. Same mechanism as every other switch, no duplication.
//
// RESTORING READS STORAGE AGAIN RATHER THAN REMEMBERING. `endPrintTheme` does
// not stash "what it was" before printing — it calls `applyTheme(readTheme())`,
// the exact line `initTheme` uses at startup. So SYSTEM comes back as System
// and re-resolves live against the OS, rather than being frozen to whichever
// side it happened to be on when the print dialog opened. Nothing is written
// to storage at any point: the stored preference is never touched.
export function beginPrintTheme() {
  return applyTheme('light');
}

export function endPrintTheme() {
  return applyTheme(readTheme());
}

// `beforeprint`/`afterprint` cover Chrome, Edge and Firefox. SAFARI FIRES
// NEITHER — it changes `matchMedia('print')` instead — so both are
// registered. On a browser with both, each simply calls `applyTheme` twice
// with the same argument, which is idempotent.
function initPrintTheme() {
  if (typeof window === 'undefined') return () => {};

  const onBefore = () => beginPrintTheme();
  const onAfter = () => endPrintTheme();
  window.addEventListener('beforeprint', onBefore);
  window.addEventListener('afterprint', onAfter);

  let mq = null;
  try {
    mq = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
  } catch {
    mq = null;
  }
  const onMediaChange = (event) => (event.matches ? beginPrintTheme() : endPrintTheme());
  if (mq) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMediaChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onMediaChange);
  }

  return () => {
    window.removeEventListener('beforeprint', onBefore);
    window.removeEventListener('afterprint', onAfter);
    if (!mq) return;
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMediaChange);
    else if (typeof mq.removeListener === 'function') mq.removeListener(onMediaChange);
  };
}

// Called once at app start (main.jsx): applies the stored preference and
// registers the ONE media-query listener that keeps "System" live — it
// re-applies only while the stored preference is still `system`. It also
// registers the print listeners above, so `main.jsx` needs no second call:
// this module owns the attribute's whole lifecycle.
export function initTheme() {
  applyTheme(readTheme());
  const stopPrint = initPrintTheme();
  const mq = mediaQuery();
  if (!mq) return stopPrint;
  const onChange = () => {
    if (readTheme() === 'system') applyTheme('system');
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange);
  return () => {
    stopPrint();
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange);
    else if (typeof mq.removeListener === 'function') mq.removeListener(onChange);
  };
}
