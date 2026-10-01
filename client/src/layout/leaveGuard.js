// THE LEAVE GUARD FOR EXITS THAT ARE NOT LINKS (fix/leave-guard, 2026-10-01).
//
// The two bulk-entry pages already ask "Leave without saving?" for a link, the
// Back button and a reload. What they could not see were the exits that are
// BUTTONS: Log out on the user card, a row in the notification bell, and on
// the phone every drawer item. A button calls logout() or navigate() itself,
// so no click listener on links ever hears it, and the work was gone with no
// warning (owner check, 2026-10-01).
//
// So those buttons ask HERE first. A page with unsaved work registers its own
// dialog while it is dirty; every non-link exit calls requestLeave(proceed):
//   - no page has registered  -> proceed() at once, exactly as before;
//   - a page has registered   -> that page's dialog opens with `proceed`, and
//     only "Leave and discard" runs it. Stay, Escape and the backdrop do not.
//
// PURE AND SHARED. No React, no DOM, no React Native — one module-level slot.
// It is mirrored byte for byte to mobile/src/navigation/leaveGuard.js
// (lint:mirrors), so the web and the phone cannot drift on what "asks" means.
// Proofs: client/scripts/ssr-leave-guard.jsx, mobile/scripts/proof-leave-guard.mjs.
//
// ONE SLOT, NOT A LIST: only one screen holds unsaved bulk work at a time.
// A second registration replaces the first, and a cleanup only clears the
// slot if it still holds the function that cleanup was made for — so React's
// StrictMode (register, clean up, register again) ends with exactly one.

let current = null;

// Register `ask(proceed)` as the dialog for the page that has unsaved work.
// Returns the cleanup to run when the page is clean again or unmounts.
export function setLeaveGuard(ask) {
  const fn = typeof ask === 'function' ? ask : null;
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

// True while a page has registered its dialog.
export function hasLeaveGuard() {
  return current !== null;
}

// Every non-link exit goes through here. Returns 'proceeded' or 'asked'.
// `proceed` runs AT MOST ONCE, however many times a dialog calls it.
export function requestLeave(proceed) {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    proceed();
  };
  if (!current) {
    once();
    return 'proceeded';
  }
  current(once);
  return 'asked';
}
