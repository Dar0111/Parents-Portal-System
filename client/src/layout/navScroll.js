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
//
// NO ITEM IS CUT AT THE TOP EDGE (build 1 fix round, 2026-10-05). Scrolling
// DOWN to an item below the box aligns its bottom with the box's bottom, and
// whatever item that leaves at the top was cut through — on Class summary in
// the teacher's rail, Grades showed only its bottom edge under the » toggle,
// with no scrollbar to say the list had moved. So a downward scroll is
// rounded UP to the top of the first item at or past it: the top edge then
// falls between items. The active item stays whole — it is one of the
// candidates, so the rounding never passes its own top. Upward scrolls
// already align an item's top and are left as they are.
//
// THE PINNED ROW (fix round, 2026-10-06). Messages is `sticky bottom-0` in
// the nav (Shell.jsx, `data-nav-pinned`): while its own place is below the
// fold it covers the bottom 44px of the box. An active item ABOVE it in the
// list must clear that row, not the box's edge, so the view is shortened by
// the row and its 4px gap. An item after it (the admin's Backup & Restore)
// needs nothing — by the time it shows, the row is back in its own place —
// nor does Messages itself. And the row is never a snap candidate: stuck,
// its top is wherever the box's bottom is, not a place in the list.
function pinnedReserve(box, item) {
  const pinned = box.querySelector('[data-nav-pinned]');
  if (!pinned || typeof pinned.contains !== 'function' || pinned.contains(item)) return 0;
  if (typeof item.compareDocumentPosition !== 'function') return 0;
  const after = item.compareDocumentPosition(pinned) & Node.DOCUMENT_POSITION_FOLLOWING;
  return after ? pinned.getBoundingClientRect().height + 4 : 0;
}

export function revealActive(box) {
  if (!box || box.clientHeight === 0) return;
  const item = box.querySelector('[aria-current="page"]');
  if (!item) return;
  const boxTop = box.getBoundingClientRect().top;
  const contentTop = (el) => el.getBoundingClientRect().top - boxTop + box.scrollTop;
  const rect = item.getBoundingClientRect();
  let next = nearestScrollTop({
    scrollTop: box.scrollTop,
    viewHeight: box.clientHeight - pinnedReserve(box, item),
    itemTop: contentTop(item),
    itemHeight: rect.height,
  });
  if (next > box.scrollTop) {
    const links = Array.from(box.querySelectorAll('a[href]')).filter(
      (link) => typeof link.closest !== 'function' || !link.closest('[data-nav-pinned]')
    );
    const tops = links.map(contentTop).filter((top) => top >= next);
    if (tops.length) next = Math.min(...tops);
  }
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
