import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { watchDismiss } from '../layout/navScroll';

// The collapsed sidebar's label, shown beside an icon on HOVER and on
// KEYBOARD FOCUS (feat/ui-polish, 2026-09-30, decision Q3). Not the browser's
// `title`: that never appears on focus, only after a hover delay, so a
// keyboard user tabbing down the rail would see bare icons.
//
// KEYBOARD FOCUS MEANS `:focus-visible`, AND A CLICK HIDES IT (UI-11). It
// showed on any `focus`, and a mouse click leaves focus on the button — so
// "Expand sidebar" stayed over the page ("Record e…" on Grades) until focus
// moved. Now: hover shows it, focus shows it only when the element matches
// `:focus-visible`, and pointer-down hides it and keeps it hidden until the
// pointer leaves and comes back.
//
// PORTALLED TO document.body AT z-45 (UI-8). It was a fixed-position child
// of the sidebar, and a `position: sticky` sidebar forms its own stacking
// context, so its z-35 was trapped inside it: the dashboard cards (`relative`
// since f2) and the class record's `sticky z-10` cells painted over it
// ("Grad"). On <body>, z-45 is above the header (30), the drawer and the bell
// panel (40), and below Modal (50).
//
// A PORTALLED TOOLTIP NO LONGER MOVES WITH ITS ICON (Condition B), so it is
// measured once when it appears and hidden by anything that would detach it:
// any scroll or a resize (`watchDismiss`), and a route change — the position
// carries the pathname it was measured on and is not rendered on any other.
//
// Visual only. The control it wraps carries its own name (an `sr-only`
// label), so the tooltip is aria-hidden rather than announced twice. Escape
// dismisses it without moving focus (WCAG 1.4.13). `fg` on `surface` with the
// `edge` border is an ALREADY-CHECKED contrast pair.
export default function RailTooltip({ label, enabled = true, children }) {
  const ref = useRef(null);
  const suppressed = useRef(false);
  const [pos, setPos] = useState(null);
  const { pathname } = useLocation();
  const shown = enabled && pos !== null && pos.path === pathname;

  useEffect(() => {
    if (!shown) return undefined;
    return watchDismiss(window, () => setPos(null));
  }, [shown]);

  if (!enabled) return children;

  const place = () => {
    // The CONTROL's box, not the wrapper's: the collapse toggle carries
    // `mb-2`, and as a flex item the wrapper does not collapse that margin,
    // so measuring the wrapper put "Expand sidebar" 4px below its button.
    const el = ref.current?.firstElementChild ?? ref.current;
    const r = el?.getBoundingClientRect();
    if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8, path: pathname });
  };
  const hide = () => setPos(null);

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        if (!suppressed.current) place();
      }}
      onMouseLeave={() => {
        suppressed.current = false;
        hide();
      }}
      onFocus={(e) => {
        if (e.target.matches?.(':focus-visible')) place();
      }}
      onBlur={hide}
      onPointerDown={() => {
        suppressed.current = true;
        hide();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {children}
      {shown
        ? createPortal(
            <span
              aria-hidden="true"
              style={{ top: pos.top, left: pos.left }}
              className="pointer-events-none fixed z-[45] -translate-y-1/2 whitespace-nowrap rounded-md border border-edge bg-surface px-2 py-1 text-xs font-medium text-fg shadow-lg"
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </div>
  );
}
