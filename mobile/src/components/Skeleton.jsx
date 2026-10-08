import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useMotionAllowed } from '../motion/reduceMotion';
import { useTheme } from '../theme/ThemeProvider';

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
// THE LOOK (decision 5): the `edge` token in both themes, no new token —
// passed by the owner on the device in both themes (2026-10-08).
//
// THE SHIMMER IS A SWEEP (fix round F6, 2026-10-08 — the owner picked it over
// the opacity pulse), the web's: ONE light band crossing the region left to
// right, each bar showing only the slice of it that crosses that bar, so the
// gaps between bars stay clean. React Native has no fixed backgrounds and no
// mask without a new package, so it is built from what is installed:
//   - the region keeps one `Animated.Value` — the band's left edge, in the
//     region's own coordinates — and runs it from just off the left edge to
//     the region's width, THREE passes of 1.5 s (4.5 s, under WCAG 2.2.2's
//     five seconds), on the NATIVE driver; then the band rests off the right
//     edge and the bars stand still — it never runs on without end;
//   - each bar measures where it sits in the region once it is laid out
//     (`measureLayout`), clips to its own corners (`overflow-hidden`) and
//     moves its copy of the band by `x − its own left` (`Animated.subtract`,
//     native too) — so every bar's slice lines up into one band;
//   - the band is a `react-native-svg` linear gradient (installed for the
//     icons): transparent → the band colour → transparent. In the light
//     theme `surface` over the `edge` bars, in the dark one `edge-strong` —
//     a light band in both, from the theme's own tokens.
// Under the OS's reduce-motion setting, or before the OS has answered
// (unknown means no, motion/reduceMotion.js), there is no band at all. The
// one loop in the app, by the owner's decision; motion is otherwise for
// entrances only (M23).
//
// ACCESSIBILITY (decision 7): the region is a `progressbar` with the label the
// spinner used ("Loading…" unless the caller names the wait), exactly as
// LoadingSpinner is; the shapes are hidden from the screen reader. React
// Native has no busy state to set beside it.
const FILL = 'bg-edge';
const BAND = 120;
const PASS_MS = 1500;
const PASSES = 3;

// What a bar needs from its region: the band's position, the region to
// measure against, whether the sweep is running, and the band's colour.
const SweepContext = createContext(null);

// One bone: a bar or a circle, with its slice of the band while it sweeps.
function Bone({ className, style }) {
  const sweep = useContext(SweepContext);
  const ref = useRef(null);
  const [left, setLeft] = useState(null);

  // Where this bone sits in the region — measured on every layout, so it is
  // known before the sweep starts.
  const onLayout = () => {
    const region = sweep?.regionRef.current;
    if (!region || !ref.current) return;
    ref.current.measureLayout(region, (x) => setLeft(x), () => setLeft(null));
  };

  const translateX = useMemo(
    () => (sweep && left !== null ? Animated.subtract(sweep.x, left) : null),
    [sweep, left]
  );

  return (
    <View ref={ref} onLayout={onLayout} className={`overflow-hidden ${FILL} ${className}`} style={style}>
      {sweep?.sweeping && translateX ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND, transform: [{ translateX }] }}>
          <Svg width={BAND} height="100%">
            <Defs>
              <LinearGradient id="skeleton-sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={sweep.band} stopOpacity="0" />
                <Stop offset="0.5" stopColor={sweep.band} stopOpacity={sweep.bandOpacity} />
                <Stop offset="1" stopColor={sweep.band} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={BAND} height="100%" fill="url(#skeleton-sweep)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

// One bar: a line of text, a figure, a tag, a control — the caller sizes it.
// `round` is the corner: a tag's by default, `rounded-lg` for a control.
export function SkeletonBar({ className = '', round = 'rounded-md', style }) {
  return <Bone className={`${round} ${className}`} style={style} />;
}

// An avatar or a disc.
export function SkeletonCircle({ size = 40 }) {
  return <Bone className="rounded-full" style={{ width: size, height: size }} />;
}

// The region. `phase` is useSkeleton's: 'wait' lays the shapes out unpainted,
// 'skeleton' paints them — and starts the sweep.
export default function Skeleton({ phase, label = 'Loading…', className = '', children }) {
  const motion = useMotionAllowed();
  const { tokens, resolved } = useTheme();
  const painted = phase === 'skeleton';
  const sweeping = painted && motion;
  const regionRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(-BAND));

  useEffect(() => {
    if (!sweeping || !width) {
      x.setValue(-BAND);
      return undefined;
    }
    // `loop` resets the value to its starting point (-BAND, off the left
    // edge) before each pass; after the last pass it rests at `width`, off
    // the right edge, so nothing is left on a bar.
    const pass = Animated.timing(x, { toValue: width, duration: PASS_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(pass, { iterations: PASSES });
    loop.start();
    return () => loop.stop();
  }, [sweeping, width, x]);

  const dark = resolved === 'dark';
  const sweep = useMemo(
    () => ({
      x,
      regionRef,
      sweeping,
      band: dark ? tokens['edge-strong'] : tokens.surface,
      bandOpacity: dark ? '0.9' : '0.8',
    }),
    [x, sweeping, dark, tokens]
  );

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className={className}>
      <View
        ref={regionRef}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ opacity: painted ? 1 : 0 }}
      >
        <SweepContext.Provider value={sweep}>{children}</SweepContext.Provider>
      </View>
    </View>
  );
}
