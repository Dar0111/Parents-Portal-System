import { Text, View } from 'react-native';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';

// The web's EmptyState. Copy is derived from the filter state by the caller,
// never from a flag (§5f); `action` is a node and only appears when acting
// would change the result.
export default function EmptyState({ icon = 'fa-inbox', title = 'Nothing here yet', message, action, className = '' }) {
  const { tokens } = useTheme();
  return (
    <View className={`items-center justify-center px-6 py-12 ${className}`}>
      <Icon name={icon} size={30} color={tokens['fg-ghost']} style={{ marginBottom: 12 }} />
      <Text className="text-center text-sm font-medium text-fg">{title}</Text>
      {message ? <Text className="mt-1 max-w-sm text-center text-sm text-fg-muted">{message}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}
