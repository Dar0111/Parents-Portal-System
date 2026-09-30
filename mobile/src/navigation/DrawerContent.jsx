import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Seal from '../components/Seal';
import Icon from '../icons';
import { useNotifications } from '../realtime/NotificationProvider';
import { useUnread } from '../realtime/UnreadProvider';
import { useTheme } from '../theme/ThemeProvider';
import {
  NAV_GROUPS_KEY,
  activeGroupLabel,
  foldedFor,
  isGroupOpen,
  parseFolded,
  toggleFolded,
  userCardLines,
} from './drawerFold';
import { groupNav } from './navGroups';
import { isBuilt } from './routes';

// THE DRAWER — the web sidebar on a phone (feat/nav-drawer-groups,
// 2026-09-30; MOBILE_CONVENTIONS M19). The same Brand, the same groups,
// labels and order (navGroups.js is a mirror), the same active style and
// badges, Settings / About as a separate bottom group, and the user card at
// the bottom with the ONE Logout. NOT here: the web's icon-only rail and its
// hover tooltips — a phone has neither the width problem nor a hover.
//
// PHONE-ONLY: a group label is a button that folds its group (drawerFold.js
// holds the rules — remembered per role in `pp.navGroups`, and the group
// holding the active page is always open).
//
// Three item states, as on the web (§6): built (a route), blocked (never on a
// current item), and UNBUILT — here decided by routes.js rather than by
// nav.js's `built` flag, because nav.js is a verbatim copy of the web's,
// where every item is built. A dimmed row is "not on the phone yet".
//
// A BADGE RENDERS ONLY ON A BUILT ITEM (§6), and every count is the server's
// (§10): Messages from UnreadProvider, the rest from NotificationProvider,
// joined only here, at the point of rendering one number on one row.
//
// TOUCH TARGETS ARE 48dp, SET IN dp (`minHeight: 48`), not `min-h-12`:
// NativeWind's inlineRem is 14 here, so `h-12` is 42dp, under Android's 48.
const TARGET = 48;

// NO STYLE FUNCTION ON A PRESSABLE — NativeWind's css-interop wraps every
// Pressable and merges a non-array `style` as `{ ...style }`, so a function
// arrives as `{}` (measured in proof-drawer against the real runtime). The
// fix-round cause: 6980e06 gave the user card its width that way, the card
// shrank to its avatar, and the name column got no width at all. Layout sits
// in className on an inner View, or in a plain style OBJECT; there is no
// pressed feedback, as before this branch.

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

function NavRow({ item, active, badge, onPress, tokens }) {
  const built = isBuilt(item.to);
  const on = built && active;
  const color = on ? tokens.brand : built ? tokens['fg-body'] : tokens['fg-ghost'];
  return (
    <Pressable
      disabled={!built}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !built }}
      accessibilityLabel={built ? item.label : `${item.label}, not on the phone yet`}
    >
      <View
        style={{ minHeight: TARGET }}
        className={`flex-row items-center gap-3 rounded-lg px-3 ${on ? 'bg-brand-soft' : ''}`}
      >
        <View className="w-5 items-center">
          <Icon name={item.icon} size={15} color={color} />
        </View>
        <Text
          className={`flex-1 text-sm ${on ? 'font-medium text-brand' : built ? 'text-fg-body' : 'text-fg-ghost'}`}
        >
          {item.label}
        </Text>
        {built ? <Badge count={badge} /> : null}
      </View>
    </Pressable>
  );
}

export default function DrawerContent({ navigation, state, items }) {
  const { user, logout } = useAuth();
  const { tokens } = useTheme();
  const { unread } = useUnread();
  const { counts } = useNotifications();
  const insets = useSafeAreaInsets();
  const activeName = state.routeNames[state.index];
  const role = user?.role;

  // Everything open until the stored state is read, and for good if it
  // cannot be: a failed read never hides a page.
  const [stored, setStored] = useState({});
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(NAV_GROUPS_KEY)
      .then((raw) => {
        if (live && raw) setStored(parseFolded(raw));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function toggle(label) {
    setStored((prev) => {
      const next = toggleFolded(prev, role, label);
      AsyncStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  const sections = groupNav(role, items);
  const folded = foldedFor(stored, role);
  const activeLabel = activeGroupLabel(sections.groups, activeName);
  const { name, detail } = userCardLines(user);

  const row = (item) => (
    <NavRow
      key={item.to}
      item={item}
      active={activeName === item.to}
      badge={badgeFor(item, role, counts, unread)}
      onPress={() => navigation.navigate(item.to)}
      tokens={tokens}
    />
  );

  // Close first, so coming Back from Account information lands on the page,
  // not on a drawer still open over it.
  function openAccount() {
    navigation.closeDrawer();
    navigation.navigate('AccountInfo');
  }

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
          {sections.top.map(row)}
          {sections.groups.map((group, i) => {
            const open = isGroupOpen(group.label, folded, activeLabel);
            const locked = !group.label || group.label === activeLabel;
            return (
              <View key={group.label || `rest-${i}`} className="pt-2">
                {group.label ? (
                  <Pressable
                    onPress={() => toggle(group.label)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={group.label}
                    accessibilityHint={locked ? 'Holds the page you are on, so it stays open' : undefined}
                  >
                    <View style={{ minHeight: TARGET }} className="flex-row items-center justify-between px-3">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        {group.label}
                      </Text>
                      <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                        <Icon name="fa-chevron-right" size={11} color={tokens['fg-muted']} />
                      </View>
                    </View>
                  </Pressable>
                ) : null}
                {open ? group.items.map(row) : null}
              </View>
            );
          })}
        </View>

        {sections.bottom.length ? (
          <View className="gap-0.5 border-t border-edge px-2 py-2">{sections.bottom.map(row)}</View>
        ) : null}
      </DrawerContentScrollView>

      {/* THE USER CARD — the web's, on the phone. The avatar and name open
          Settings → Account information; Logout is a separate 48dp icon
          beside it, never inside it. */}
      <View
        className="flex-row items-center gap-1 border-t border-edge px-2 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <Pressable
          onPress={openAccount}
          accessibilityRole="button"
          accessibilityLabel={`${name ? `${name}, ` : ''}Account information`}
          style={{ flex: 1, minWidth: 0 }}
        >
          <View style={{ minHeight: 56 }} className="flex-row items-center gap-3 px-2">
            <Avatar name={name} photo={user?.profile_pic} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-medium text-fg">
                {name}
              </Text>
              <Text numberOfLines={1} className="text-xs text-fg-muted">
                {detail}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable onPress={logout} accessibilityRole="button" accessibilityLabel="Logout">
          <View style={{ width: TARGET, height: TARGET }} className="items-center justify-center">
            <Icon name="fa-right-from-bracket" size={16} color={tokens['fg-body']} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
