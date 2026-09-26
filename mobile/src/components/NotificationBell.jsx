import { useNavigation } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import Icon from '../icons';
import { useNotifications } from '../realtime/NotificationProvider';
import { useTheme } from '../theme/ThemeProvider';

// THE BELL, in every header. On the web it opens a dropdown panel; on the
// phone it opens the Notifications SCREEN (Darryl, Stage 5 decision 4). The
// count is the server's answer through NotificationProvider (§10) — nothing
// here computes one — and it is also words for a screen reader, because a
// bare number beside a bell icon says nothing.
export default function NotificationBell() {
  const navigation = useNavigation();
  const { counts } = useNotifications();
  const { tokens } = useTheme();
  const unread = counts.total;

  return (
    <Pressable
      onPress={() => navigation.navigate('Notifications')}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
      className="mr-2 h-9 w-9 items-center justify-center rounded-lg border border-edge-strong"
    >
      <Icon name="fa-bell" size={15} color={tokens['fg-body']} />
      {unread > 0 ? (
        <View className="absolute -right-1.5 -top-1.5 min-w-5 items-center rounded-full bg-primary px-1">
          <Text className="text-xs font-medium leading-5 text-primary-fg">{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
