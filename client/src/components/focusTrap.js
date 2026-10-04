import { useEffect, useRef } from 'react';

// THE FOCUS TRAP (feat/look-fixes, 2026-10-05) — for `Modal` and the web
// drawer (layout/Shell.jsx), the two panels that sit over the page. Before it,
// Tab walked out of an open dialog into the page behind it (KNOWN_ISSUES,
// closed by this branch).
//
// Three rules, one hook:
//   - FOCUS GOES IN ONCE PER OPENING. The effect depends on `active` only (and
//     on `ref`, a stable object) — never on anything that changes while
//     someone types. The old Modal bug was an effect that also listed
//     `onClose`, a new function every keystroke, and took focus back to the
//     panel on each one (2026-09-08, Modal.jsx's header note).
//   - TAB WRAPS inside the container: past the last control to the first,
//     Shift+Tab before the first to the last. Everything else is the
//     browser's own Tab order.
//   - FOCUS GOES BACK TO THE OPENER on close, when the opener is still in the
//     document — the button that opened a dialog, the menu button that opened
//     the drawer.
//   - `onEscape` (optional) runs on Escape — the drawer's close. It is read
//     through a ref, so a new function every render never re-runs the effect.
//     `Modal` keeps its own Escape listener and passes none.
//
// The container must be focusable itself (`tabIndex={-1}`): it takes the
// first focus, so a dialog does not jump into its first field and a screen
// reader starts at the dialog's name.

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

// PURE — where Tab goes next. `count` focusable controls, `current` the index
// of the focused one (-1 when focus is on the container itself or outside
// it). Returns the index to focus, -1 for "the container" (nothing inside can
// take focus), or null for "let the browser move as it would".
export function nextFocusIndex(count, current, shift) {
  if (count <= 0) return -1;
  if (shift) return current <= 0 ? count - 1 : null;
  return current === -1 || current >= count - 1 ? 0 : null;
}

function focusableIn(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0);
}

export function useFocusTrap(ref, active, { onEscape = null } = {}) {
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    if (!container) return undefined;

    const opener = document.activeElement;
    container.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape' && escapeRef.current) {
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusableIn(container);
      const next = nextFocusIndex(list.length, list.indexOf(document.activeElement), event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      if (next === -1) container.focus();
      else list[next].focus();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && opener !== document.body && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [ref, active]);
}
