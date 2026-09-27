import { Pressable, Text, View } from 'react-native';

// Apply, Reset, and the sentence that says the two are out of step — the
// web's components/FilterActions.jsx (§21). A phone has no <form> submit,
// so Apply takes `onApply`; everything else is the web's rule:
//
//   - QUIET WHEN CLEAN, AND STILL ENABLED. Neutral means "nothing is
//     waiting"; disabled would say "you may not", which is false — re-applying
//     an unchanged filter refetches, a legitimate thing to want. Clean reuses
//     the Reset class exactly, so the pair is matched by construction.
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
const neutral = 'rounded-lg border border-edge-strong bg-surface px-4 py-2';

export default function FilterActions({ dirty, canReset, onApply, onReset, applyLabel = 'Apply', resetLabel = 'Reset' }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Pressable
        onPress={onApply}
        accessibilityRole="button"
        className={dirty ? 'rounded-lg bg-primary px-4 py-2' : neutral}
      >
        <Text className={`text-sm font-medium ${dirty ? 'text-primary-fg' : 'text-fg-body'}`}>{applyLabel}</Text>
      </Pressable>
      {canReset ? (
        <Pressable onPress={onReset} accessibilityRole="button" className={neutral}>
          <Text className="text-sm font-medium text-fg-body">{resetLabel}</Text>
        </Pressable>
      ) : null}
      <Text accessibilityLiveRegion="polite" className={dirty ? 'text-sm text-brand' : ''}>
        {dirty ? '● Changes not applied' : ''}
      </Text>
    </View>
  );
}
