import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import Seal from '../components/Seal';
import Icon from '../icons';
import { useNotifications } from '../realtime/NotificationProvider';
import { useUnread } from '../realtime/UnreadProvider';
import { useTheme } from '../theme/ThemeProvider';
import { isBuilt } from './routes';

// THE DRAWER — the web sidebar's Brand, its nav items with badges, and the
// header's name / role / Logout, which on a phone live at the bottom of the
// drawer. Three item states, as on the web (§6): built (a route), blocked
// (never on a current item), and UNBUILT — here decided by routes.js rather
// than by nav.js's `built` flag, because nav.js is a verbatim copy of the
// web's, where every item is built. A dimmed row is "not on the phone yet",
// and the role branches un-dim them one by one.
//
// A BADGE RENDERS ONLY ON A BUILT ITEM (§6), and every count is the server's
// (§10): Messages from UnreadProvider, the rest from NotificationProvider,
// joined only here, at the point of rendering one number on one row.
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

const BADGE_BY_PATH = {
  '/excuse-letters': 'excuse_letters',
  '/announcements': 'announcements',
  '/memos': 'memos',
  '/events': 'events',
  '/users': 'users',
};

export function badgeFor(item, role, counts, unread) {
  if (!isBuilt(item.to)) return 0;
  if (item.to.endsWith('/messages')) return unread;
  if (role === 'admin' && item.to.endsWith('/announcements')) {
    return counts.announcements + counts.memos;
  }
  const suffix = Object.keys(BADGE_BY_PATH).find((p) => item.to.endsWith(p));
  return suffix ? counts[BADGE_BY_PATH[suffix]] || 0 : 0;
}

function Badge({ count }) {
  if (!(count > 0)) return null;
  return (
    <View className="rounded-full bg-primary px-2 py-0.5">
      <Text className="text-xs font-medium text-primary-fg">{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export default function DrawerContent({ navigation, state, items }) {
  const { user, logout } = useAuth();
  const { tokens } = useTheme();
  const { unread } = useUnread();
  const { counts } = useNotifications();
  const insets = useSafeAreaInsets();
  const activeName = state.routeNames[state.index];

  // THE DRAWER PADS BOTH EDGES ITSELF (re-check finding, 2026-09-27): it is
  // outside any screen layout, and edge-to-edge Android put the status bar
  // over the seal and the navigation bar over Logout. `paddingTop: 0` had
  // removed the scroll view's own top inset; both insets are explicit now.
  return (
    <View className="flex-1 bg-surface">
      <DrawerContentScrollView contentContainerStyle={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center gap-3 px-4 py-4">
          <Seal size={40} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-fg">
              Parent’s Portal
            </Text>
            <Text numberOfLines={1} className="text-xs text-fg-muted">
              Capt. H. Francisco ES
            </Text>
          </View>
        </View>

        <View className="gap-0.5 px-2 pb-4">
          {items.map((item) => {
            const built = isBuilt(item.to);
            const active = built && activeName === item.to;
            const badge = badgeFor(item, user?.role, counts, unread);
            const color = active ? tokens.brand : built ? tokens['fg-body'] : tokens['fg-ghost'];
            return (
              <Pressable
                key={item.to}
                disabled={!built}
                onPress={() => navigation.navigate(item.to)}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !built }}
                accessibilityLabel={built ? item.label : `${item.label}, not on the phone yet`}
                className={`flex-row items-center gap-3 rounded-lg px-3 py-2.5 ${active ? 'bg-brand-soft' : ''}`}
              >
                <View className="w-5 items-center">
                  <Icon name={item.icon} size={15} color={color} />
                </View>
                <Text
                  className={`flex-1 text-sm ${
                    active ? 'font-medium text-brand' : built ? 'text-fg-body' : 'text-fg-ghost'
                  }`}
                >
                  {item.label}
                </Text>
                {built ? <Badge count={badge} /> : null}
              </Pressable>
            );
          })}
        </View>
      </DrawerContentScrollView>

      <View className="border-t border-edge px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Text numberOfLines={1} className="text-sm font-medium text-fg">
          {user?.name || user?.login_id}
        </Text>
        <Text className="text-xs text-fg-muted">{ROLE_LABEL[user?.role] || user?.role}</Text>
        <Pressable
          onPress={logout}
          accessibilityRole="button"
          className="mt-3 flex-row items-center justify-center gap-2 rounded-lg border border-edge-strong px-3 py-2"
        >
          <Icon name="fa-right-from-bracket" size={13} color={tokens['fg-body']} />
          <Text className="text-sm text-fg-body">Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}
