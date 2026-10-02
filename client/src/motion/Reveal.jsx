import { useRef } from 'react';
import { DURATION, EASE, MOTION_OK, RISE, gsap, useGSAP } from './motion';

// An entrance: the element (or, with `stagger`, each of its direct children
// in turn) fades in while rising a few pixels. Once, on mount — a reload or a
// re-render never replays it.
//
// The rendered markup carries NO inline style: the hidden start state is set
// by GSAP in a layout effect, before the first paint, and only when motion is
// allowed (see motion.js). So an SSR render, a no-JS page and a
// reduced-motion visitor all get the final state, and `clearProps` returns
// the element to exactly that state when the tween ends.
//
// `stagger` reads the children present AT MOUNT. Put it on a grid whose
// cells exist from the first render (a dashboard's cards own their loading
// state inside themselves), not on a list that arrives later.
//
// NOT FOR: the attendance roster, the class-record grid, the message toast,
// or anything inside a "Leave without saving?" dialog.
export default function Reveal({
  as: Tag = 'div',
  stagger = false,
  delay = 0,
  rise = RISE,
  className,
  children,
  ...rest
}) {
  const ref = useRef(null);

  useGSAP(
    () => {
      const node = ref.current;
      if (!node) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const targets = stagger ? Array.from(node.children) : node;
        const count = stagger ? node.children.length : 1;
        if (!count) return;
        gsap.from(targets, {
          autoAlpha: 0,
          y: rise,
          duration: stagger ? DURATION.base : DURATION.slow,
          ease: EASE,
          delay,
          // 50 ms a step, but the last child never starts later than 300 ms.
          stagger: stagger ? Math.min(0.05, 0.3 / count) : 0,
          clearProps: 'opacity,visibility,transform',
        });
      });
    },
    { scope: ref }
  );

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
