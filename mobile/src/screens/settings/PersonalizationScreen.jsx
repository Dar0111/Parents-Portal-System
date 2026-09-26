import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Icon from '../../icons';
import { THEME_OPTIONS } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';

// Theme only (M3): the web's text-size choice is dropped on the phone in
// favour of the OS font scale — a declared deviation, not an omission. The
// outcome renders next to the control (§7c) with the web's two sentences,
// "browser" replaced by "phone".
export default function PersonalizationScreen() {
  const { preference, tokens, setPreference } = useTheme();
  const [status, setStatus] = useState(null);

  async function choose(value) {
    const remembered = await setPreference(value);
    const label = THEME_OPTIONS.find((t) => t.value === value)?.label ?? value;
    setStatus(
      remembered
        ? ok(`Theme set to ${label}. Stored on this phone only.`)
        : fail(`Theme set to ${label} for now, but this phone is not letting the app remember it — it will go back to Light next time.`)
    );
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4">
      <Text className="text-base font-semibold text-fg">Personalization</Text>
      <Text className="mt-1 text-sm text-fg-muted">
        These choices are stored on this phone only. Other devices, and other people using this account elsewhere,
        are not affected.
      </Text>

      <Text className="mt-6 text-sm font-medium text-fg-secondary">Theme</Text>
      <View className="mt-3 gap-2">
        {THEME_OPTIONS.map((option) => {
          const selected = option.value === preference;
          return (
            <Pressable
              key={option.value}
              onPress={() => choose(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              className={`flex-row items-start gap-3 rounded-lg border px-4 py-3 ${
                selected ? 'border-primary bg-surface-subtle' : 'border-edge bg-surface'
              }`}
            >
              <Icon
                name={selected ? 'fa-circle-check' : 'fa-circle'}
                size={14}
                color={selected ? tokens.brand : tokens['fg-ghost']}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="text-sm font-medium text-fg">{option.label}</Text>
                <Text className="text-sm text-fg-muted">{option.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <FormStatus status={status} className="mt-3" />

      <Text className="mt-6 text-sm font-medium text-fg-secondary">Text size</Text>
      <Text className="mt-1 text-sm text-fg-muted">
        Follows your phone’s own text-size setting (Settings → Display on most phones). There is no separate
        choice here.
      </Text>
    </ScrollView>
  );
}
