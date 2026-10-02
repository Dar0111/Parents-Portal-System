import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cardClass } from '../../components/buttonStyles';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Text from '../../components/Text';
import Icon from '../../icons';
import { THEME_OPTIONS } from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';

// Theme only (M3): the web's text-size choice is dropped on the phone in
// favour of the OS font scale — a declared deviation, not an omission. The
// outcome renders next to the control (§7c) with the web's two sentences,
// "browser" replaced by "phone".
//
// NO RELOAD HERE (feat/ui-refresh): nothing on this screen comes from the
// server, so there is nothing to ask for again.

// The glyph beside each option, keyed by the option's stored value. Decoration
// only: the label and the description say what the option is. The options
// themselves — values, labels, descriptions — stay in theme/theme.js; a value
// with no entry here simply renders without a glyph.
//
// A Map OF PAIRS, NOT AN OBJECT LITERAL, as on the web: `lint:colors` reads
// the second option's value followed by a colon — which is how an object key
// is spelled — as Tailwind's theme variant, and fails the run.
const OPTION_ICONS = new Map([
  ['light', 'fa-sun'],
  ['dark', 'fa-moon'],
  ['system', 'fa-gear'],
]);

// A minimum in dp through a plain style object (the phone's rem is 14 — M19),
// so two lines of description at a large OS font scale grow the card.
const OPTION = { minHeight: 64 };

// One option, as a card that is ONE radio: the whole card is the target.
//
// THE SELECTED CARD IS NOT TOLD APART BY COLOUR ALONE: a check mark at the
// right, a doubled edge and a heavier label — and `accessibilityState` says
// it to a screen reader, as before. The corners and the edge are on a plain
// View AROUND the button, which clips Android's ripple to them; the button
// itself carries no className and no style function (M20).
function OptionCard({ option, selected, onPress, tokens }) {
  const icon = OPTION_ICONS.get(option.value);
  return (
    <View
      className={`overflow-hidden rounded-xl ${
        selected ? 'border-2 border-primary bg-surface-subtle' : 'border border-edge bg-surface'
      }`}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        android_ripple={{ color: tokens['edge-strong'] }}
      >
        <View style={OPTION} className="flex-row items-center gap-3 px-4 py-3">
          {icon ? (
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
              <Icon name={icon} size={15} color={tokens.brand} />
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            <Text className={`text-sm text-fg ${selected ? 'font-semibold' : ''}`}>{option.label}</Text>
            <Text className="text-sm text-fg-muted">{option.description}</Text>
          </View>
          {selected ? <Icon name="fa-check" size={16} color={tokens.brand} /> : null}
        </View>
      </Pressable>
    </View>
  );
}

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
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      <SectionHeader
        title="Personalization"
        description="These choices are stored on this phone only. Other devices, and other people using this account elsewhere, are not affected."
      />

      <View className="gap-3">
        <Text accessibilityRole="header" className="font-serif text-base text-fg">
          Theme
        </Text>
        {THEME_OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            option={option}
            selected={option.value === preference}
            onPress={() => choose(option.value)}
            tokens={tokens}
          />
        ))}
        <FormStatus status={status} />
      </View>

      <View className={`${cardClass} gap-1 p-4`}>
        <Text accessibilityRole="header" className="font-serif text-base text-fg">
          Text size
        </Text>
        <Text className="text-sm text-fg-muted">
          Follows your phone’s own text-size setting (Settings → Display on most phones). There is no separate
          choice here.
        </Text>
      </View>
    </ScrollView>
  );
}
