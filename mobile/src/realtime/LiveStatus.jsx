import { Pressable, View } from 'react-native';
import Text from '../components/Text';
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
//
// A FULL-WIDTH STRIP, edge to edge, never a rounded card: it belongs to the
// frame, not to the screen under it. Refresh is a 44dp target — the height
// is a plain style object in dp (M19), never a style function (M20).
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
      className="flex-row flex-wrap items-center justify-between gap-3 border-b border-warning-edge bg-warning-soft px-4 py-2"
    >
      <View className="min-w-0 flex-1 flex-row items-start gap-2">
        <Icon name="fa-plug-circle-xmark" size={14} color={tokens['warning-icon']} style={{ marginTop: 3 }} />
        <Text className="flex-1 text-sm text-warning-strong">
          Live updates paused — new updates will not appear on their own.
        </Text>
      </View>
      <Pressable
        onPress={onRefresh}
        accessibilityRole="button"
        android_ripple={{ color: tokens['warning-edge'] }}
        className="items-center justify-center overflow-hidden rounded-xl border border-warning-edge-strong bg-surface px-4"
        style={{ minHeight: 44 }}
      >
        <Text className="text-sm font-semibold text-warning-strong">Refresh</Text>
      </Pressable>
    </View>
  );
}
