import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { DURATION, RISE, STAGGER, motionAllowed } from './reduceMotion';

// An entrance on the phone: the block fades in while rising a few dp. The
// web's motion/Reveal.jsx, with React Native's own Animated on the NATIVE
// driver (opacity and transform only, so the JS thread — and a Tecno's
// frame budget — is never involved once it starts). No animation library.
//
// ONCE, ON MOUNT. A refresh or a re-render never replays it.
//
// `index` staggers a row of blocks: each starts 40 ms after the one before,
// and the delay stops growing after the sixth so a long list never trails.
//
// REDUCE MOTION, OR NOT KNOWN YET: the block is created already at its final
// value, and no animation is started (motion/reduceMotion.js). So the content
// is never hidden behind a tween that will not run.
//
// NOT FOR: attendance marking, grade entry, the message toast, a dialog.
// And only around a handful of blocks per screen — a hero, a card grid —
// never every row of a list.
export default function Reveal({ index = 0, style, children }) {
  // Decided once, at mount. `useState` (not a ref) so the value is created in
  // the initialiser and never read from `.current` during render.
  const [animate] = useState(motionAllowed);
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate) return undefined;
    const tween = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION.slow,
      delay: Math.min(index, 6) * STAGGER,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    tween.start();
    return () => tween.stop();
  }, [animate, index, progress]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
