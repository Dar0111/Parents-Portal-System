import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { buttonStyles } from './buttonStyles';
import Text from './Text';

// Apply, Reset, and the sentence that says the two are out of step — the
// web's components/FilterActions.jsx (§21). A phone has no <form> submit,
// so Apply takes `onApply`; everything else is the web's rule:
//
//   - QUIET WHEN CLEAN, AND STILL ENABLED. Neutral means "nothing is
//     waiting"; disabled would say "you may not", which is false — re-applying
//     an unchanged filter refetches, a legitimate thing to want. Clean reuses
//     the Reset look exactly, so the pair is matched by construction.
//   - FILLED WHEN DIRTY. The fill IS the "changes not applied" signal, which is
//     why a page action never sits beside it filled (§21b — every teacher
//     page action on the phone is neutral and on its own row).
//   - THE SENTENCE IS THE SIGNAL; THE DOT IS DECORATION. The live region is
//     always mounted and only its text toggles, so a screen reader announces
//     the change; an empty Text keeps the region alive at zero cost.
//
// `canReset` stays the page's: each computes it from its own applied values
// and defaults. `resetLabel` exists for Students' "Clear" — the page owns the
// word, this component owns the behaviour.
//
// THE TWO LOOKS ARE THE SHARED BUTTON'S (feat/ui-refresh, 2026-10-02) — the
// classes `buttonStyles()` gives every secondary and primary button, read
// once. It stays a Pressable + Text here rather than a `Button`: Apply is
// NEVER disabled, and it must not gain a disabled look by inheriting one. The
// 48dp height is a plain style object in dp (M19), never a style function
// (M20); the press feedback is Android's ripple.
//
// APPLY REMOUNTS WHEN IT FLIPS (feat/look-fixes, 2026-10-05): the Pressable is
// KEYED by its state, so going dirty or clean mounts a fresh element instead
// of restyling the old one in place. In place, the owner's phone showed a
// dirty Apply as an empty blue box in Dark on every filter bar (the label
// unreadable or clipped — not provable from the source, so both routes are
// closed): a fresh mount is the path every other button takes, and every
// variant now keeps a 1dp border (buttonStyles.js), so the box does not
// change size either.
const quiet = buttonStyles({ variant: 'secondary' });
const filled = buttonStyles({ variant: 'primary' });

export default function FilterActions({ dirty, canReset, onApply, onReset, applyLabel = 'Apply', resetLabel = 'Reset' }) {
  const { tokens } = useTheme();
  const apply = dirty ? filled : quiet;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Pressable
        key={dirty ? 'apply-dirty' : 'apply-clean'}
        onPress={onApply}
        accessibilityRole="button"
        android_ripple={{ color: tokens[apply.ripple] }}
        className={apply.box}
        style={{ minHeight: 48 }}
      >
        <Text className={apply.label}>{applyLabel}</Text>
      </Pressable>
      {canReset ? (
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          android_ripple={{ color: tokens[quiet.ripple] }}
          className={quiet.box}
          style={{ minHeight: 48 }}
        >
          <Text className={quiet.label}>{resetLabel}</Text>
        </Pressable>
      ) : null}
      <Text accessibilityLiveRegion="polite" className={dirty ? 'text-sm font-semibold text-brand' : ''}>
        {dirty ? '● Changes not applied' : ''}
      </Text>
    </View>
  );
}
