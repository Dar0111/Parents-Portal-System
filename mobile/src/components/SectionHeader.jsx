import { View } from 'react-native';
import ReloadButton from './ReloadButton';
import Text from './Text';

// THE HEADER OF ONE SECTION OF A SCREEN (feat/ui-refresh, 2026-10-02) — the
// web's components/SectionHeader.jsx: the section's title in the title face,
// an optional sentence under it, and on the right its Reload and its own
// actions.
//
// The navigator's header is the screen's title; this is the title of a
// section INSIDE the screen, announced as a heading.
//
// RELOAD BELONGS TO THE SECTION: `onReload` is its existing fetch and
// `reloading` its loading flag; the section's own frame shows the loading and
// error states exactly as on the first load. `reloadDisabled` is for the
// screens with unsaved work (see ReloadButton).
export default function SectionHeader({
  title,
  description = null,
  onReload = null,
  reloading = false,
  reloadDisabled = false,
  reloadLabel = 'Reload',
  actions = null,
  className = '',
}) {
  return (
    <View className={`flex-row items-end justify-between gap-3 ${className}`}>
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className="font-serif text-lg text-fg">
          {title}
        </Text>
        {description ? <Text className="mt-1 text-sm text-fg-muted">{description}</Text> : null}
      </View>
      {onReload || actions ? (
        <View className="flex-row items-center gap-2">
          {onReload ? (
            <ReloadButton onReload={onReload} loading={reloading} disabled={reloadDisabled} label={reloadLabel} />
          ) : null}
          {actions}
        </View>
      ) : null}
    </View>
  );
}
