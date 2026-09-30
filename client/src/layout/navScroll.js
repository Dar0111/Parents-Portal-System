// The sidebar's two scroll behaviours, as pure-enough helpers so
// scripts/ssr-nav-scroll.jsx can drive them (feat/ui-polish, 2026-09-30).

// THE ACTIVE ITEM IS ALWAYS IN VIEW (UI-10). At 1280x600 with the rail
// collapsed, Backup & Restore's icon sat below the visible part of the nav
// with nothing to say so. The least movement that shows the whole item:
// above → align its top, below → align its bottom, already visible → no
// change. An item taller than the box aligns its top. All in the box's own
// content coordinates (`itemTop` measured from the top of its content).
export function nearestScrollTop({ scrollTop, viewHeight, itemTop, itemHeight }) {
  const itemBottom = itemTop + itemHeight;
  if (itemTop < scrollTop) return itemTop;
  if (itemBottom > scrollTop + viewHeight) {
    return itemHeight > viewHeight ? itemTop : itemBottom - viewHeight;
  }
  return scrollTop;
}

// Applies nearestScrollTop to a nav box, finding the item NavLink marks
// `aria-current="page"`. It sets `scrollTop` directly — no animation, and NOT
// `scrollIntoView`, which may also scroll the document itself. A box with no
// layout (the sidebar below md is `display: none`) is left alone.
export function revealActive(box) {
  if (!box || box.clientHeight === 0) return;
  const item = box.querySelector('[aria-current="page"]');
  if (!item) return;
  const boxTop = box.getBoundingClientRect().top;
  const rect = item.getBoundingClientRect();
  const next = nearestScrollTop({
    scrollTop: box.scrollTop,
    viewHeight: box.clientHeight,
    itemTop: rect.top - boxTop + box.scrollTop,
    itemHeight: rect.height,
  });
  if (next !== box.scrollTop) box.scrollTop = next;
}

// A PORTALLED TOOLTIP MUST NOT OUTLIVE ITS POSITION (UI-8, Condition B).
// RailTooltip is measured once, when it appears, and rendered on
// document.body, so it no longer moves with the nav: any scroll — the nav
// box's own, the page's — or a resize hides it. `scroll` does not bubble, so
// the listener is on the CAPTURE phase at `window`, which sees every
// element's scroll. Returns the unsubscribe. (Route changes are handled in
// RailTooltip, which keys its position on the pathname.)
export function watchDismiss(target, hide) {
  const scrollOptions = { capture: true, passive: true };
  target.addEventListener('scroll', hide, scrollOptions);
  target.addEventListener('resize', hide);
  return () => {
    target.removeEventListener('scroll', hide, scrollOptions);
    target.removeEventListener('resize', hide);
  };
}
