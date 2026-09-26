import { Pressable, Text, View } from 'react-native';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { useNotifications } from './NotificationProvider';
import { useSocket } from './SocketProvider';
import { useUnread } from './UnreadProvider';

// The visible half of §5g: when the live channel is down, SAY SO and offer
// a refresh. Never fake liveness, never poll. Renders nothing while
// connected. Mounted by AppShell's `screenLayout`, so it sits above every
// screen's content — the badges and the bell are on every screen.
//
// REFRESH RECONNECTS AND REFETCHES BOTH COUNTS (Darryl, branch 2 decision 4)
// rather than reloading a page the phone does not have; each list screen
// has pull-to-refresh for its own rows. The copy says "new updates", not
// "new messages" — the channel carries notifications too (N2).
export default function LiveStatus() {
  const { connected, reconnect } = useSocket();
  const { refresh: refreshNotifications } = useNotifications();
  const { refresh: refreshUnread } = useUnread();
  const { tokens } = useTheme();

  if (connected) return null;

  function onRefresh() {
    reconnect();
    refreshNotifications();
    refreshUnread();
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row flex-wrap items-center justify-between gap-3 border-b border-warning-edge bg-warning-soft px-4 py-2.5"
    >
      <View className="flex-1 flex-row items-start gap-2">
        <Icon name="fa-plug-circle-xmark" size={13} color={tokens['warning-icon']} style={{ marginTop: 3 }} />
        <Text className="flex-1 text-sm text-warning-strong">
          Live updates paused — new updates will not appear on their own.
        </Text>
      </View>
      <Pressable
        onPress={onRefresh}
        accessibilityRole="button"
        className="rounded-lg border border-warning-edge-strong bg-surface px-3 py-1"
      >
        <Text className="text-sm font-medium text-warning-strong">Refresh</Text>
      </Pressable>
    </View>
  );
}
