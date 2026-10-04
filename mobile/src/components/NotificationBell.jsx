import { useNavigation } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import Icon from '../icons';
import { requestLeave } from '../navigation/leaveGuard';
import { useNotifications } from '../realtime/NotificationProvider';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

// THE BELL, in every header. On the web it opens a dropdown panel; on the
// phone it opens the Notifications SCREEN (Darryl, Stage 5 decision 4). The
// count is the server's answer through NotificationProvider (§10) — nothing
// here computes one — and it is also words for a screen reader, because a
// bare number beside a bell icon says nothing.
//
// OPENING IT IS AN EXIT, so on a screen with unsaved bulk work it asks first
// (fix/leave-guard, 2026-10-01) through navigation/leaveGuard.js.
//
// A 44dp SQUARE (feat/ui-refresh, 2026-10-02), set in dp through a plain
// style object — the phone's rem is 14, so a size class would fall short
// (M19) — and it fits inside the navigator's default 56dp header, whose
// height is NOT changed (the message toast is placed against it — M22).
//
// THE COUNT PILL IS A SIBLING OF THE BUTTON, NOT ITS CHILD: the button clips
// its press ripple to its rounded corner, and a pill hanging off that corner
// would be clipped with it. The pill takes no touches and is hidden from the
// screen reader — the button's own label already says the count in words.
const SIZE = 44;

export default function NotificationBell() {
  const navigation = useNavigation();
  const { counts } = useNotifications();
  const { tokens } = useTheme();
  const unread = counts.total;

  return (
    <View className="mr-2" style={{ width: SIZE, height: SIZE }}>
      <Pressable
        onPress={() => requestLeave(() => navigation.navigate('Notifications'))}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
        android_ripple={{ color: tokens['edge-strong'] }}
        className="items-center justify-center overflow-hidden rounded-lg border border-edge-strong"
        style={{ width: SIZE, height: SIZE }}
      >
        <Icon name="fa-bell" size={16} color={tokens['fg-body']} />
      </Pressable>
      {unread > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-primary px-1"
        >
          <Text className="text-xs font-semibold leading-5 text-primary-fg">{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </View>
  );
}
