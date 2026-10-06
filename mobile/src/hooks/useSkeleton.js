import { useEffect, useState } from 'react';

// THE SKELETON'S CLOCK (build 2, feat/dashboards-look, 2026-10-07) — one rule
// for when a loading placeholder shows, on the web and on the phone. Mirrored
// byte for byte to mobile/src/hooks/useSkeleton.js (lint:mirrors), so the two
// cannot drift on it. Pure React: no DOM, no React Native.
//
// THE OWNER'S RULES (decision 6):
//   - NOTHING FOR THE FIRST 300 ms. A fast load never shows a skeleton at all.
//     During the wait the region is already there with the real height
//     reserved, so nothing moves when the content lands — it is only not
//     painted yet. A screen reader hears "loading" from the first frame.
//   - NO MINIMUM DISPLAY TIME. The moment loading ends, the content, the error
//     or the empty state takes over. A minimum would hold a placeholder over
//     content that has already arrived, and over an error or an empty state.
//   - The phase is worked out DURING RENDER; the only state this sets is from
//     the timer's own callback, never synchronously in an effect.
//
// WHAT "LOADING" MEANS IS THE CALLER'S: the skeleton is for a region with
// NOTHING of its content on screen (decision 1, narrowed 2026-10-07). A
// re-read over content already shown keeps that content — `aria-busy`, inert,
// and on a list greyed after this same 300 ms — and never swaps it for this.
export const SKELETON_DELAY_MS = 300;

// PURE — 'off' (not loading), 'wait' (loading, inside the delay: reserve the
// space, paint nothing) or 'skeleton' (loading past the delay: paint it).
export function skeletonPhase({ loading, elapsedMs, delayMs = SKELETON_DELAY_MS }) {
  if (!loading) return 'off';
  return elapsedMs >= delayMs ? 'skeleton' : 'wait';
}

// The hook over it. A new wait (loading going false → true) starts the clock
// again: the "previous value" check below is React's own pattern for resetting
// state from a prop during render, so no effect has to clear anything.
export function useSkeleton(loading, delayMs = SKELETON_DELAY_MS) {
  const active = Boolean(loading);
  const [seen, setSeen] = useState(active); // the `loading` of the last render
  const [elapsed, setElapsed] = useState(false);
  if (active !== seen) {
    setSeen(active);
    setElapsed(false);
  }

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return skeletonPhase({ loading: active, elapsedMs: elapsed && active === seen ? delayMs : 0, delayMs });
}

export default useSkeleton;
