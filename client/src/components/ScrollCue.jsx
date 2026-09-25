import { useCallback, useEffect, useRef, useState } from 'react';
import { cueState, scrollStep } from './scrollCueState';

// A horizontal scroller that SAYS it scrolls (UI-D-2, 2026-09-25).
//
// THE PROBLEM IT SOLVES IS AN AFFORDANCE ONE, NOT A LAYOUT ONE. SMOKE-1
// finding 11: at 390px Teacher → Class summary cuts inside a word ("FILI…",
// "— Pe…") and nothing on screen says six more subjects and the Average exist
// to the right — no visible scrollbar on a touch device, no fade, no control.
// A teacher on a phone would reasonably read the class as having three
// subjects. The table was always scrollable; nobody was told.
//
// DO NOT "FIX" IT BY REMOVING THE SCROLLER. §5a-i kept it deliberately — a
// sticky header and an in-table horizontal scroller cannot coexist, and that
// question is closed. This adds the signal the scroller never had.
//
// FOUR SIGNALS, BECAUSE ONE IS NOT ENOUGH FOR EVERY READER:
//
//   words   — a hint line above the table, because a gradient is a hint and a
//             sentence is an instruction. It is the only signal that survives
//             a screen reader, and the only one that says WHAT is off-screen
//             rather than merely that something is.
//   a fade   — the right edge, so the cut looks intentional rather than broken.
//   a button — 44px, the touch target, for anyone who will not or cannot drag.
//   a shadow — on the pinned first column once scrolled, so the pinned column
//             reads as ON TOP of the content rather than beside it.
//
// EVERY ONE OF THEM IS CONDITIONAL ON THE TABLE ACTUALLY OVERFLOWING, and all
// of them stand down at the end. A cue on a table with nothing to scroll is
// worse than no cue: it tells the reader something is there when nothing is.
// On a wide desktop the component renders the hint line's row and nothing
// else.
//
// THE NATIVE SCROLLBAR STAYS. It is a real affordance on every pointer device
// and the one thing here that is not a reimplementation.
//
// `cells` COMES FROM THE PAGE, VIA `measureCells`, because only the page knows
// which header row carries meaningful columns — the summary has one row of
// learning areas, the record has two and the leaf row is not the one worth
// naming. See `scrollCueState.js`.
//
// `className` FRAMES THE WHOLE THING, NOT THE SCROLLER. It started on the
// scroller, which put the class record's card border BETWEEN the hint and the
// table — the hint floating above the card on one page and sitting inside it
// on the other, because the summary's border comes from a wrapper in the page
// (browser check, 2026-09-25). The hint describes the table, so it belongs
// inside the same box; putting the frame on the outer element is what makes
// both pages agree.
export default function ScrollCue({
  ariaLabel,
  className = '',
  describe,
  endLabel = 'End of table',
  measureCells,
  children,
}) {
  const scrollerRef = useRef(null);
  const [state, setState] = useState({
    overflowing: false,
    scrolled: false,
    atEnd: true,
    hiddenCount: 0,
    hiddenLabels: [],
  });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Cell geometry is read RELATIVE TO THE SCROLLER's content box, not from
    // getBoundingClientRect against the viewport: the scroller may itself sit
    // inside a page that has scrolled, and `offsetLeft` inside a positioned
    // ancestor is the only measure that stays true when it does.
    const cells = typeof measureCells === 'function' ? measureCells(el) : [];
    setState(
      cueState({
        scrollLeft: el.scrollLeft,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        cells,
      })
    );
  }, [measureCells]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    measure();

    el.addEventListener('scroll', measure, { passive: true });

    // A RESIZE OBSERVER, NOT A WINDOW RESIZE LISTENER. The thing that decides
    // whether this table overflows is the width of its CONTAINER, and that
    // changes without the window doing anything — Shell reveals its 240px
    // sidebar at `sm`, a column count changes when the Term select changes,
    // and the report-card precedent (§5a-vi) is the same lesson: measure the
    // element, not the window. Both the scroller and its content are watched,
    // because either can change while the other does not.
    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener('scroll', measure);
      if (observer) observer.disconnect();
    };
  }, [measure]);

  function nudge() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: scrollStep(el.clientWidth), behavior: 'smooth' });
  }

  const hint = state.overflowing
    ? state.atEnd
      ? endLabel
      : describe?.(state) || null
    : null;

  return (
    <div className={className}>
      {/* `aria-live="polite"`: the sentence changes as the reader scrolls, and
          a screen-reader user gets the update without being interrupted.
          `print:hidden` — paper does not scroll, and §18 releases the
          scroller entirely there.

          THE ELEMENT IS ALWAYS RENDERED, THE SPACE IS NOT. A live region has
          to exist in the DOM BEFORE its content changes, or the first
          announcement is missed — so this cannot be `{hint ? <p/> : null}`.
          But it also must not reserve a line on a desktop table that does not
          overflow: it first shipped with `min-h-5` and put a blank strip
          above every wide class summary (browser check, 2026-09-25). `sr-only`
          while empty keeps the region alive at zero layout cost, and the
          visible classes come back with the text. */}
      <p
        className={
          hint ? 'px-3 pt-2 text-xs text-fg-muted print:hidden' : 'sr-only'
        }
        aria-live="polite"
      >
        {hint}
      </p>

      <div className="relative">
        <div
          ref={scrollerRef}
          // FOCUSABLE AND NAMED. A scroll container that only responds to
          // drag is unreachable from a keyboard; `tabIndex=0` makes the
          // arrow keys work and the label says what is being scrolled
          // rather than announcing an unnamed region.
          tabIndex={0}
          role="region"
          aria-label={ariaLabel}
          data-scrolled={state.scrolled ? 'true' : 'false'}
          className="print-sheet-scroller overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {children}
        </div>

        {state.overflowing && !state.atEnd ? (
          <>
            {/* `pointer-events-none` so the fade never swallows a drag that
                starts on top of it — it is a picture of an edge, not a
                control. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent print:hidden"
            />
            {/* 44px, the touch target, and a real <button>. The hint line
                above already carries the meaning, so this is `aria-hidden`
                to avoid announcing the same thing twice — but it is NOT
                hidden from the keyboard, because the scroller itself is
                focusable and arrow keys do the same job. */}
            <button
              type="button"
              onClick={nudge}
              aria-hidden="true"
              tabIndex={-1}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-edge-strong bg-surface text-fg-body shadow-sm transition hover:bg-surface-muted print:hidden"
            >
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
