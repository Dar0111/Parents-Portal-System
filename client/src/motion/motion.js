import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// MOTION, ONE SET OF NUMBERS (feat/ui-refresh, 2026-10-02).
//
// GSAP is bundled from node_modules and used for ENTRANCES only: a page or
// section arriving, dashboard cards staggering in, a figure counting up, the
// drawer sliding in. Every tween here is transform
// and opacity — never width, height, top or left — so nothing reflows and
// nothing shifts layout, and nothing waits on a tween: the page is
// interactive from the first frame.
//
// REDUCED MOTION IS THE DEFAULT PATH, NOT A SPECIAL CASE. A tween is only
// ever created inside `gsap.matchMedia().add(MOTION_OK, …)`, so with
// `prefers-reduced-motion: reduce` — and in an SSR render, and with no
// JavaScript at all — the markup simply IS its final state: no inline
// opacity, no transform. The proofs render that state.
//
// EVERY ENTRANCE CLEARS ITS INLINE STYLES WHEN IT ENDS (`clearProps`). A
// transform left behind on a wrapper would become the containing block of
// every `position: fixed` descendant — Modal renders inline, not through a
// portal — and would also print.
//
// WHERE THERE IS NO MOTION, ON PURPOSE: attendance marking, grade entry, the
// new-message toast and the "Leave without saving?" dialogs (so Modal itself
// is never animated).
gsap.registerPlugin(useGSAP);

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

// Seconds. `fast` is feedback on something pressed, `base` a small element
// arriving, `slow` a page or a hero. Exits are not animated: leaving is
// instant, which is faster than any exit tween.
export const DURATION = Object.freeze({ fast: 0.15, base: 0.25, slow: 0.4 });

// Arriving decelerates.
export const EASE = 'power2.out';

// How far an entering element travels, in px. Small: the motion says
// "arrived", it does not perform.
export const RISE = 12;

export { gsap, useGSAP };
