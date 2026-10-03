import { View } from 'react-native';
import Text from './Text';

// THE HEADER OF ONE SECTION OF A SCREEN (feat/ui-refresh, 2026-10-02) — the
// web's components/SectionHeader.jsx: the section's title in the title face,
// an optional sentence under it, and on the right its own actions.
//
// The navigator's header is the screen's title; this is the title of a
// section INSIDE the screen, announced as a heading.
//
// NO RELOAD CONTROL (owner, 2026-10-04): on the phone a screen that shows
// server data is refreshed by pulling it down, so a section header carries
// only the section's own actions.
export default function SectionHeader({ title, description = null, actions = null, className = '' }) {
  return (
    <View className={`flex-row items-end justify-between gap-3 ${className}`}>
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className="font-serif text-lg text-fg">
          {title}
        </Text>
        {description ? <Text className="mt-1 text-sm text-fg-muted">{description}</Text> : null}
      </View>
      {actions ? <View className="flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}
