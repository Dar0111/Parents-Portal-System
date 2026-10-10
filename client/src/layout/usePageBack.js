import { createContext, useContext, useLayoutEffect } from 'react';

// THE TOP BAR'S WAY BACK (feat/shared-messages fix round W1, 2026-10-11;
// FRONTEND §30a). A Messages thread opens at its newest message with the box
// in the window, so on a long thread its own "All conversations" link sits
// above the window and going back took a scroll up. The page hands the top
// bar the same target, and Header.jsx shows a ← before the title — the
// phone's thread header — which never scrolls away (the bar is sticky). The
// page's own link stays where it is.
//
// Shell owns the state and provides this around <Outlet />, as it does the
// title (usePageTitle.js). `to` is the value the page's own link already
// uses, so the two cannot point at different places; `label` is the ←'s
// accessible name (the arrow is decoration). A page that never calls this
// gets no ←: today that is every page but the thread.
//
// A LAYOUT EFFECT, unlike the title's: the ← is a control, so it is set and
// cleared before the browser paints — never shown for a frame on a page it
// does not belong to.
export const PageBackContext = createContext(null);

export function usePageBack(to, label) {
  const setBack = useContext(PageBackContext)?.setBack;

  useLayoutEffect(() => {
    if (!setBack || !to) return undefined;
    setBack({ to, label });
    return () => setBack(null);
  }, [setBack, to, label]);
}
