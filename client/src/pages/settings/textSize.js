// Text size — Normal / Large — stored on THIS DEVICE only (Darryl,
// 2026-09-18). Not on the server: no user_id key, no new column, and a shared
// family laptop keeps one setting for everyone who uses it.
//
// The class is applied at startup by an inline <script> in client/index.html
// BEFORE the module bundle loads, so the first paint is already at the chosen
// size — no flash from Normal to Large. That script and this module read the
// same key and set the same class; keep them in step by hand (the script
// cannot import this file).
//
// Every read/write of localStorage is inside try/catch: private windows and
// blocked storage throw, and a settings page must not crash for that — it
// applies the size for this session and says it could not be remembered.
//
// The type scale is rem-based (Tailwind v4 defaults, no config), so one root
// font-size scales every page, including widths declared in rem. The three
// decorative sizes that used to be fixed px (DataTable's sort icon and pager
// chevrons, both message-thread timestamps) are rem since 2026-09-19
// (fix/copy-nits), so nothing on screen stays put at Large.

export const TEXT_SIZE_KEY = 'pp.textSize';
export const TEXT_SIZE_CLASS = 'text-large';

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal', description: 'The default size.' },
  { value: 'large', label: 'Large', description: 'About 12% bigger everywhere — text, buttons and tables.' },
];

export function readTextSize() {
  if (typeof document === 'undefined') return 'normal'; // SSR / tests
  try {
    return window.localStorage.getItem(TEXT_SIZE_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return document.documentElement.classList.contains(TEXT_SIZE_CLASS) ? 'large' : 'normal';
  }
}

export function applyTextSize(value) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(TEXT_SIZE_CLASS, value === 'large');
}

// Applies for this session, then tries to remember it. Returns whether the
// device will remember (false = storage refused; the size still applied).
export function saveTextSize(value) {
  applyTextSize(value);
  try {
    if (value === 'large') window.localStorage.setItem(TEXT_SIZE_KEY, 'large');
    else window.localStorage.removeItem(TEXT_SIZE_KEY);
    return true;
  } catch {
    return false;
  }
}
