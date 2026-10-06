import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useMotionAllowed } from '../motion/reduceMotion';

// THE SKELETON (build 2, feat/dashboards-look, 2026-10-07) — the web's
// components/Skeleton.jsx on the phone, tier 1: DataList's first load, the
// dashboard Card and the report card. A placeholder SHAPED LIKE THE CONTENT
// — bars where text will be, a circle where an avatar will be — inside the
// same frame, so the content arrives into the space the skeleton held.
//
// WHEN IT SHOWS is hooks/useSkeleton.js (mirrored from the web): nothing for
// 300 ms, then this, gone the moment loading ends — no minimum. The shapes
// are laid out from the first frame at opacity 0, so the height is reserved
// and nothing moves when they paint. Only a region with NOTHING of its
// content on screen gets one; a re-read keeps what is shown (decision 1).
//
// THE LOOK (decision 5): the `edge` token in both themes, no new token. Faint
// on purpose (decoration, never information — WCAG 1.4.11 does not apply);
// if it does not read on the device the fallback is `edge-strong` — change
// FILL here.
//
// THE SHIMMER IS FINITE, AND STILL UNDER REDUCED MOTION. React Native's own
// Animated on the NATIVE driver, opacity only, 1 → 0.5 → 1 over 2 s, TWICE —
// the web's two `pulse` cycles — and then the shapes simply stand: it never
// runs on without end. Under the OS's reduce-motion setting, or before the OS
// has answered (unknown means no, motion/reduceMotion.js), it does not run at
// all. The one loop in the app, by the owner's decision; motion is otherwise
// for entrances only (M23).
//
// ACCESSIBILITY (decision 7): the region is a `progressbar` with the label the
// spinner used ("Loading…" unless the caller names the wait), exactly as
// LoadingSpinner is; the shapes are hidden from the screen reader. React
// Native has no busy state to set beside it.
const FILL = 'bg-edge';
const PULSE_MS = 1000;
const SHIMMER_ITERATIONS = 2;

// One bar: a line of text, a figure, a tag, a control — the caller sizes it.
// `round` is the corner: a tag's by default, `rounded-lg` for a control.
export function SkeletonBar({ className = '', round = 'rounded-md', style }) {
  return <View className={`${round} ${FILL} ${className}`} style={style} />;
}

// An avatar or a disc.
export function SkeletonCircle({ size = 40 }) {
  return <View className={`rounded-full ${FILL}`} style={{ width: size, height: size }} />;
}

// The region. `phase` is useSkeleton's: 'wait' lays the shapes out unpainted,
// 'skeleton' paints them.
export default function Skeleton({ phase, label = 'Loading…', className = '', children }) {
  const motion = useMotionAllowed();
  const painted = phase === 'skeleton';
  const shimmer = painted && motion;
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!shimmer) {
      pulse.setValue(1);
      return undefined;
    }
    const half = (toValue) =>
      Animated.timing(pulse, { toValue, duration: PULSE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([half(0.5), half(1)]), { iterations: SHIMMER_ITERATIONS });
    loop.start();
    return () => loop.stop();
  }, [shimmer, pulse]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className={className}>
      <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ opacity: pulse }}>
        <View style={{ opacity: painted ? 1 : 0 }}>{children}</View>
      </Animated.View>
    </View>
  );
}
