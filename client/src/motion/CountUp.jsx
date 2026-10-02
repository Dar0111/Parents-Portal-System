import { useRef } from 'react';
import { DURATION, EASE, MOTION_OK, gsap, useGSAP } from './motion';

// A COUNT THAT ARRIVES BY COUNTING (feat/ui-refresh). For a dashboard figure
// that is a whole number — letters to review, unread messages, accounts
// waiting.
//
// THE NUMBER IS STILL THE SERVER'S (§10). React renders `value` itself, so
// the markup — SSR, no JavaScript, reduced motion — is the real figure from
// the first byte. Only when motion is allowed does the first paint start at 0
// and run up to that same figure in 0.4 s; the tween always ends by writing
// `value` back, and a later change of `value` is a plain React update with no
// replay. Nothing here adds, subtracts or remembers a count.
//
// Anything that is not a whole number from 1 to 9999 — "3 of 5", a grade, a
// word, zero — is rendered untouched: a general average must never pass
// through a rounding it did not ask for (§3).
export default function CountUp({ value, className }) {
  const ref = useRef(null);
  const animatable = typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 9999;
  useGSAP(
    () => {
      const node = ref.current;
      if (!node || !animatable) return;
      // `data-figure` is kept current by React on every render, so a count
      // that changes while the first one is still running up ends on the NEW
      // figure, not the one this effect closed over.
      const settle = () => {
        node.textContent = node.dataset.figure;
      };
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const counter = { n: 0 };
        node.textContent = '0';
        gsap.to(counter, {
          n: value,
          duration: DURATION.slow,
          ease: EASE,
          onUpdate: () => {
            node.textContent = String(Math.round(counter.n));
          },
          onComplete: settle,
        });
        // Reverted (unmount, or the media query flipping): the real figure.
        return settle;
      });
    },
    { scope: ref }
  );

  return (
    <span ref={ref} data-figure={animatable ? value : undefined} className={className}>
      {value}
    </span>
  );
}
