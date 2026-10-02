import { useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable } from 'react-native';
import Icon from '../icons';
import { DURATION, motionAllowed } from '../motion/reduceMotion';
import { useTheme } from '../theme/ThemeProvider';

// RELOAD — one section's own data, asked for again (feat/ui-refresh); the
// web's components/ReloadButton.jsx. `onReload` is the section's EXISTING
// fetch with whatever filters are applied now; this button only says "ask
// again". Pull-to-refresh stays on every screen that had it — this is the
// visible control for the same request.
//
// DISABLED WHILE LOADING (a spinner takes the icon's place), and `disabled`
// is for unsaved work: on Attendance and the Grades slot a reload would
// replace what has been typed, so those screens disable it while anything is
// unsaved and say why beside it.
//
// A 44dp square with an icon; `label` is its accessible name ("Reload
// announcements"). The icon makes one turn on press — native driver,
// transform only, and not at all when reduce-motion is on.
export default function ReloadButton({ onReload, loading = false, disabled = false, label = 'Reload' }) {
  const { tokens } = useTheme();
  const [turn] = useState(() => new Animated.Value(0));
  const off = disabled || loading;

  function handlePress() {
    if (motionAllowed()) {
      turn.setValue(0);
      Animated.timing(turn, {
        toValue: 1,
        duration: DURATION.slow,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
    if (onReload) onReload();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      android_ripple={{ color: tokens['edge-strong'] }}
      className={`items-center justify-center overflow-hidden rounded-xl border border-edge-strong bg-surface ${off ? 'opacity-60' : ''}`}
      style={{ width: 44, height: 44 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tokens['fg-secondary']} />
      ) : (
        <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Icon name="fa-rotate-right" size={15} color={tokens['fg-secondary']} />
        </Animated.View>
      )}
    </Pressable>
  );
}
