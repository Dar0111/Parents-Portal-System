import { Pressable, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

// A row of bounded choices — Term 1 / 2 / 3 / Final, a status filter, Upcoming
// / All — that AUTO-APPLIES (§21: a bounded control needs no Apply). One
// selected segment, `accessibilityRole="radio"`. Scrolls horizontally when the
// labels do not fit.
//
// EACH SEGMENT IS A CONTROL AND A 44dp TARGET (feat/ui-refresh, 2026-10-02).
// The height is a plain style object in dp — the phone's rem is 14, so a
// height class would fall short (M19) — and never a style function (M20).
// The selected one is filled AND its label is the heavier face, so the choice
// does not rest on colour alone. Since feat/look-fixes it takes the CONTROL
// corner (`rounded-lg`, §27f / M23) instead of a pill; the 1dp border is on
// both states, so a choice never changes a segment's size.
const TARGET = 44;

export default function Segmented({ options, value, onChange, label }) {
  const { tokens } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            android_ripple={{ color: tokens[active ? 'primary-hover' : 'edge-strong'] }}
            className={`items-center justify-center overflow-hidden rounded-lg border px-4 ${
              active ? 'border-primary bg-primary' : 'border-edge-strong bg-surface'
            }`}
            style={{ minHeight: TARGET }}
          >
            <Text className={`text-sm ${active ? 'font-semibold text-primary-fg' : 'text-fg-body'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
