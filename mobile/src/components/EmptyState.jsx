import { View } from 'react-native';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

// The web's EmptyState. Copy is derived from the filter state by the caller,
// never from a flag (§5f); `action` is a node and only appears when acting
// would change the result.
//
// The icon sits in a quiet chip (feat/ui-refresh, 2026-10-02) so an empty
// list reads as a designed state, not a missing one; the title is the one
// emphasised line and the message the caption under it.
export default function EmptyState({ icon = 'fa-inbox', title = 'Nothing here yet', message, action, className = '' }) {
  const { tokens } = useTheme();
  return (
    <View className={`items-center justify-center px-6 py-12 ${className}`}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted">
        <Icon name={icon} size={22} color={tokens['fg-muted']} />
      </View>
      <Text className="text-center text-base font-semibold text-fg">{title}</Text>
      {message ? <Text className="mt-1 max-w-sm text-center text-sm text-fg-muted">{message}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}
