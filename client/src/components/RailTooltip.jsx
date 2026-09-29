import { useRef, useState } from 'react';

// The collapsed sidebar's label, shown beside an icon on HOVER and on
// KEYBOARD FOCUS (feat/ui-polish, 2026-09-30, decision Q3). Not the browser's
// `title`: that never appears on focus, only after a hover delay, so a
// keyboard user tabbing down the rail would see bare icons.
//
// FIXED-POSITION, measured from the wrapper's rect when it appears. The rail
// scrolls inside itself (§9: `overflow-y-auto` on the nav box), and an
// absolutely positioned child of a scroll container is clipped by it — the
// label would be cut at the rail's 64px edge.
//
// Visual only. The control it wraps carries its own name (an `sr-only`
// label), so the tooltip is aria-hidden rather than announced twice. Escape
// dismisses it without moving focus (WCAG 1.4.13).
//
// `fg` on `surface` with the `edge` border is an ALREADY-CHECKED contrast
// pair, so this adds nothing to `lint:contrast`. z-35: above the sticky
// header (30), below the drawer and the bell panel (40) and the Modal (50).
export default function RailTooltip({ label, enabled = true, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  if (!enabled) return children;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 });
  };
  const hide = () => setPos(null);

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {children}
      {pos ? (
        <span
          aria-hidden="true"
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[35] -translate-y-1/2 whitespace-nowrap rounded-md border border-edge bg-surface px-2 py-1 text-xs font-medium text-fg shadow-lg"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
