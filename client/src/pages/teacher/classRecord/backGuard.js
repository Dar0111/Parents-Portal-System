// THE BACK-BUTTON SENTINEL FOR THE CLASS RECORD (pre-Stage-5 #5b, 2026-09-26).
//
// Pure. No React, no `window`, no imports — a state machine a proof can
// drive through every transition, with the page doing only what the returned
// action says. That split is the whole design: the browser history is the
// one thing an SSR proof cannot see, so the decision is kept where a proof
// CAN see it.
//
// THE PROBLEM. Teacher → Grades guards unsaved scores two ways: `beforeunload`
// for a reload or a closed tab, and a capture-phase click interceptor for
// in-app links. A history pop is neither — the browser Back button walked
// straight past both and discarded a class's worth of typing (KNOWN_ISSUES,
// 2026-09-22). `useBlocker` is not available: the app mounts <BrowserRouter>,
// not a data router, and converting it for one screen is a routing rewrite.
//
// THE MECHANISM. On the first edit, push ONE extra history entry with the
// page's own URL — the sentinel. A Back press now pops the sentinel and lands
// on the same URL, so the router sees nothing and the page can ASK. Stay
// re-pushes the sentinel; Leave goes back once more, to the real previous
// entry. When the record becomes clean (a save, or the drafts discarded) the
// sentinel is consumed silently with one `back()`, so a clean page needs a
// single Back press like every other page — leaving it would be the "Back
// behaves oddly" cost the KNOWN_ISSUES row warned about.
//
// Events the page reports and the action it must perform:
//   'dirty'  the record just became dirty      → 'push'  (once; idempotent)
//   'pop'    popstate fired                     → 'ask'   while dirty; 'none' otherwise
//   'stay'   the user chose Stay                → 'push'  (the sentinel is re-armed)
//   'leave'  the user chose Leave and discard   → 'back'  (past the real previous entry)
//   'clean'  the record just became clean       → 'back'  if a sentinel is armed; else 'none'
//
// IDEMPOTENT ON 'dirty' — ONE SENTINEL, NEVER TWO. React StrictMode runs
// effects twice in development; two pushes would mean two Back presses to
// leave, and the proof's negative control is exactly that case.

export const INITIAL_GUARD = Object.freeze({ armed: false, asking: false });

// transition(state, event) -> { state, action }
export function transition(state, event) {
  const { armed, asking } = state;
  switch (event) {
    case 'dirty':
      if (armed || asking) return { state, action: 'none' };
      return { state: { armed: true, asking: false }, action: 'push' };
    case 'pop':
      // The pop itself consumed the sentinel entry. While one was armed the
      // user is trying to leave with unsaved work: ask. Otherwise (a clean
      // page, or the back() this machine issued itself) there is nothing to do.
      if (armed && !asking) return { state: { armed: false, asking: true }, action: 'ask' };
      return { state: { armed: false, asking }, action: 'none' };
    case 'stay':
      if (!asking) return { state, action: 'none' };
      return { state: { armed: true, asking: false }, action: 'push' };
    case 'leave':
      if (!asking) return { state, action: 'none' };
      return { state: { armed: false, asking: false }, action: 'back' };
    case 'clean':
      if (asking) return { state, action: 'none' };
      if (!armed) return { state, action: 'none' };
      return { state: { armed: false, asking: false }, action: 'back' };
    default:
      return { state, action: 'none' };
  }
}
