import { Pressable, ScrollView, Text } from 'react-native';

// A row of bounded choices — Term 1 / 2 / 3 / Final, a status filter, Upcoming
// / All — that AUTO-APPLIES (§21: a bounded control needs no Apply). One
// selected segment, `accessibilityRole="radio"`, the web's term-segment
// styling. Scrolls horizontally when the labels do not fit.
export default function Segmented({ options, value, onChange, label }) {
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
            className={`rounded-lg border px-3 py-1.5 ${active ? 'border-primary bg-primary' : 'border-edge-strong bg-surface'}`}
          >
            <Text className={`text-sm ${active ? 'text-primary-fg' : 'text-fg-body'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
