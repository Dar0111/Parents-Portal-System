// PROOF — feat/ui-polish fix round (UI-10, UI-8 Condition B):
// `layout/navScroll.js`, driven directly.
//
//   1. nearestScrollTop — the least nav scroll that shows the whole active
//      item: above, below, already visible, taller than the box.
//   2. revealActive — against a stand-in nav box: finds the
//      `aria-current="page"` item, sets scrollTop only when it must, and
//      leaves a box with no layout (the sidebar below md) alone.
//   3. watchDismiss — a portalled tooltip is hidden by a scroll (listened to
//      on the CAPTURE phase, because `scroll` does not bubble and the nav box
//      is not `window`) and by a resize, and never again after unsubscribe.
//
// What it cannot: that a browser delivers a nav box's scroll to a
// window capture listener, or that the tooltip paints above the page — those
// are the re-check's rows.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-nav-scroll.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-nav-scroll.js

import { nearestScrollTop, revealActive, watchDismiss } from '../src/layout/navScroll.js';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

console.log('\n1. nearestScrollTop');
const view = { scrollTop: 100, viewHeight: 300 };
assert(nearestScrollTop({ ...view, itemTop: 150, itemHeight: 40 }) === 100, 'already fully visible → no movement');
assert(nearestScrollTop({ ...view, itemTop: 40, itemHeight: 40 }) === 40, 'above → its top aligns with the box top');
assert(nearestScrollTop({ ...view, itemTop: 520, itemHeight: 40 }) === 260, 'below → its BOTTOM aligns with the box bottom (560 − 300), not its top');
assert(nearestScrollTop({ ...view, itemTop: 380, itemHeight: 40 }) === 120, 'half-hidden at the bottom edge → the least movement (420 − 300)');
assert(nearestScrollTop({ ...view, itemTop: 500, itemHeight: 400 }) === 500, 'taller than the box → its top aligns');
assert(nearestScrollTop({ scrollTop: 0, viewHeight: 300, itemTop: 0, itemHeight: 40 }) === 0, 'the first item at rest → 0');

console.log('\n2. revealActive (a stand-in nav box)');
function fakeBox({ scrollTop, clientHeight, boxTop, item, links = [] }) {
  const box = {
    scrollTop,
    clientHeight,
    writes: 0,
    getBoundingClientRect: () => ({ top: boxTop }),
    querySelector: (sel) => (sel === '[aria-current="page"]' ? item : null),
    // The nav's links, for the round-up to an item's top (build 1 fix round).
    querySelectorAll: (sel) => (sel === 'a[href]' ? links : []),
  };
  // Count writes, so "leaves it alone" means no assignment at all.
  let value = scrollTop;
  Object.defineProperty(box, 'scrollTop', {
    get: () => value,
    set: (v) => {
      box.writes += 1;
      value = v;
    },
  });
  return box;
}
// The box is at y=50 and scrolled 0; the active item's viewport top is 650,
// so its content top is 600 and it is below a 300-tall box → its bottom
// aligns at 640 − 300 = 340. The nav's items are 44px tall every 50px from
// content top 0 (viewport 50), the active one the thirteenth (600), so 340
// would cut the item at 300–344 through the top edge; the scroll is rounded
// up to the next item's top, 350 (build 1 fix round). The active item,
// 600–640, is still whole in 350–650.
const active = { getBoundingClientRect: () => ({ top: 650, height: 40 }) };
const links = Array.from({ length: 13 }, (_, i) => (i === 12 ? active : { getBoundingClientRect: () => ({ top: 50 + i * 50, height: 44 }) }));
const below = fakeBox({ scrollTop: 0, clientHeight: 300, boxTop: 50, item: active, links });
revealActive(below);
assert(below.scrollTop === 350 && below.writes === 1, 'an active item below the fold is scrolled to — once, to 350: its bottom would sit at 340, rounded up to the next item top so no item is cut at the top edge', `got ${below.scrollTop} in ${below.writes} write(s)`);
const bare = fakeBox({ scrollTop: 0, clientHeight: 300, boxTop: 50, item: { getBoundingClientRect: () => ({ top: 650, height: 40 }) } });
revealActive(bare);
assert(bare.scrollTop === 340 && bare.writes === 1, 'CONTROL: with no item tops to round to, the bottom alignment stands (340) — the round-up comes from the items, not a constant', `got ${bare.scrollTop}`);
const visible = fakeBox({ scrollTop: 0, clientHeight: 300, boxTop: 50, item: { getBoundingClientRect: () => ({ top: 100, height: 40 }) } });
revealActive(visible);
assert(visible.writes === 0, 'an already-visible item → scrollTop is not written at all');
const hidden = fakeBox({ scrollTop: 0, clientHeight: 0, boxTop: 0, item: { getBoundingClientRect: () => ({ top: 900, height: 40 }) } });
revealActive(hidden);
assert(hidden.writes === 0, 'a box with no layout (display: none below md) is left alone');
const noActive = fakeBox({ scrollTop: 10, clientHeight: 300, boxTop: 0, item: null });
revealActive(noActive);
revealActive(null);
assert(noActive.writes === 0, 'no aria-current item, or no box → nothing happens, nothing throws');

console.log('\n3. watchDismiss');
const calls = [];
const target = new EventTarget();
const realAdd = target.addEventListener.bind(target);
target.addEventListener = (type, fn, options) => {
  calls.push({ type, options });
  realAdd(type, fn, options);
};
let hides = 0;
const stop = watchDismiss(target, () => {
  hides += 1;
});
const scrollReg = calls.find((c) => c.type === 'scroll');
assert(scrollReg?.options?.capture === true, 'scroll is listened to on the CAPTURE phase — it does not bubble, and the nav box is not the window');
target.dispatchEvent(new Event('scroll'));
assert(hides === 1, 'a scroll hides the tooltip');
target.dispatchEvent(new Event('resize'));
assert(hides === 2, 'a resize hides the tooltip');
stop();
target.dispatchEvent(new Event('scroll'));
target.dispatchEvent(new Event('resize'));
assert(hides === 2, 'after unsubscribe neither event reaches it — no listener leaks past the tooltip', `hides=${hides}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
