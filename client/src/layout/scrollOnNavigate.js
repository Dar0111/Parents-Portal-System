// A NEW PAGE STARTS AT THE TOP (build 2 fix round F5, 2026-10-08).
//
// The document is the only scroller (§9), and React Router does not touch it:
// a page opened from the sidebar or a link kept the PREVIOUS page's scroll —
// the dashboard scrolled down, then Students opened at its bottom. Shell.jsx
// asks this, in a layout effect, on every location change, and scrolls the
// window to the top when it says yes. Pure — no React, no DOM — so a proof can
// drive it.
//
// THE RULE:
//   - the PATHNAME changed, on a NEW navigation — React Router's `PUSH` (a
//     link, the sidebar, `navigate()`) or `REPLACE` (a redirect): to the top;
//   - `POP` (Back, Forward, the first load): never — the browser restores the
//     scroll that page had;
//   - the same pathname (only the query changed — a filter, a pinned
//     `?term=`, Admin → Users' preset leaving the address): never.
//
// Messages keeps its own positioning: a thread opens at its newest message and
// brings the message box into view in its own effects, after its messages
// have loaded — later than this, so it has the last word.
export function shouldScrollToTop({ previousPath, nextPath, navigationType }) {
  if (!nextPath || previousPath === nextPath) return false;
  return navigationType === 'PUSH' || navigationType === 'REPLACE';
}
