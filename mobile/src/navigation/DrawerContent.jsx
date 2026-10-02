import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Seal from '../components/Seal';
import Text from '../components/Text';
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
import { requestLeave } from './leaveGuard';
import { groupNav } from './navGroups';
import { isBuilt } from './routes';

// THE DRAWER — the web sidebar on a phone (feat/nav-drawer-groups,
// 2026-09-30; MOBILE_CONVENTIONS M19). The same Brand, the same groups,
// labels and order (navGroups.js is a mirror), the same active style and
// badges, Settings / About as a separate bottom group, and the user card at
// the bottom with the ONE Logout. NOT here: the web's hover tooltip on
// Logout — a phone has no hover, and the button carries its name for a
// screen reader.
//
// THE LOOK IS THE WEB SIDEBAR'S (feat/ui-refresh, 2026-10-02; the web's
// layout/Shell.jsx): the brand block with the product name in the title face
// and a hairline under it; rows as rounded pills; group labels as eyebrows;
// the user card as a small rounded card of its own. THE ACTIVE ROW
// IS SAID THREE WAYS — the brand tint, the heavier label and a 3dp brand bar
// on its left edge — so it never rests on colour alone, and
// `accessibilityState.selected` says it to a screen reader.
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
// A minimum, never a fixed height: a label that wraps at a large OS font
// scale grows its row instead of clipping.
const TARGET = 48;

// The active row's bar: 3dp wide on the row's left edge, inset 14dp from the
// top and the bottom, so it is 20dp tall on a 48dp row (the web's) and grows
// with a row that wraps. A plain style object beside the `absolute` class.
const ACTIVE_BAR = { left: 0, top: 14, bottom: 14, width: 3 };

// NO STYLE FUNCTION ON A PRESSABLE — NativeWind's css-interop wraps every
// Pressable and merges a non-array `style` as `{ ...style }`, so a function
// arrives as `{}` (measured in proof-drawer against the real runtime). The
// fix-round cause: 6980e06 gave the user card its width that way, the card
// shrank to its avatar, and the name column got no width at all. Layout sits
// in className on an inner View, or in a plain style OBJECT.
//
// PRESS FEEDBACK IS ANDROID'S OWN RIPPLE (feat/ui-refresh) — `android_ripple`
// is a PROP, not a style, so the rule above is untouched. The rounded corners
// that clip it are on a plain View AROUND each row's button: a parent with
// `overflow-hidden` clips whatever its child draws. The active tint sits on
// that same View, under the ripple, never on the row's inner View — an opaque
// child would cover the ripple it sits on.

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
      <Text className="text-xs font-semibold text-primary-fg">{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function NavRow({ item, active, badge, onPress, tokens }) {
  const built = isBuilt(item.to);
  const on = built && active;
  const color = on ? tokens.brand : built ? tokens['fg-body'] : tokens['fg-ghost'];
  return (
    <View className={`overflow-hidden rounded-xl ${on ? 'bg-brand-soft' : ''}`}>
      <Pressable
        disabled={!built}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: !built }}
        accessibilityLabel={built ? item.label : `${item.label}, not on the phone yet`}
        android_ripple={{ color: tokens['edge-strong'] }}
      >
        <View style={{ minHeight: TARGET }} className="flex-row items-center gap-3 px-3 py-2">
          <View className="w-6 items-center">
            <Icon name={item.icon} size={16} color={color} />
          </View>
          <Text
            className={`min-w-0 flex-1 text-sm ${on ? 'font-semibold text-brand' : built ? 'text-fg-body' : 'text-fg-ghost'}`}
          >
            {item.label}
          </Text>
          {built ? <Badge count={badge} /> : null}
        </View>
      </Pressable>
      {on ? <View pointerEvents="none" className="absolute rounded-full bg-brand" style={ACTIVE_BAR} /> : null}
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

  // EVERY EXIT HERE ASKS FIRST on a screen with unsaved bulk work
  // (fix/leave-guard, 2026-10-01): a drawer item, the account card and
  // Logout all go through requestLeave(), which runs the exit at once when no
  // screen has registered a dialog (navigation/leaveGuard.js, a mirror).
  // Tapping the item for the screen you are already on leaves nothing behind
  // and does not ask.
  function openItem(item) {
    if (activeName === item.to) {
      navigation.navigate(item.to);
      return;
    }
    requestLeave(() => navigation.navigate(item.to));
  }

  const row = (item) => (
    <NavRow
      key={item.to}
      item={item}
      active={activeName === item.to}
      badge={badgeFor(item, role, counts, unread)}
      onPress={() => openItem(item)}
      tokens={tokens}
    />
  );

  // Close first, so coming Back from Account information lands on the page,
  // not on a drawer still open over it.
  function openAccount() {
    requestLeave(() => {
      navigation.closeDrawer();
      navigation.navigate('AccountInfo');
    });
  }

  // THE DRAWER PADS BOTH EDGES ITSELF (re-check finding, 2026-09-27): it is
  // outside any screen layout, and edge-to-edge Android put the status bar
  // over the seal and the navigation bar over Logout. `paddingTop: 0` had
  // removed the scroll view's own top inset; both insets are explicit now.
  //
  // THE SIDE GUTTERS ARE SET HERE, NOT BY THE SCROLL VIEW (feat/ui-refresh):
  // React Navigation's DrawerContentScrollView pads its content 12dp at the
  // start and the end, which would stop the hairlines short of the drawer's
  // edges. Both are zeroed, each block carries its own gutter, and the three
  // hairlines run edge to edge as on the web. The app is portrait-only, so
  // there is no side inset to lose. The bottom is a plain 8dp: the user card
  // under the list owns the bottom inset, so the list no longer ends in a
  // band of empty scroll as tall as the navigation bar.
  return (
    <View className="flex-1 bg-surface">
      <DrawerContentScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingStart: 0, paddingEnd: 0 }}
      >
        {/* THE BRAND BLOCK. Neither line is capped at one line: at a large OS
            font scale the name wraps and the block grows instead of
            clipping, as on the web. */}
        <View className="flex-row items-center gap-3 border-b border-edge px-4 pb-4 pt-2">
          <Seal size={40} />
          <View className="min-w-0 flex-1">
            <Text className="font-serif text-base text-fg">Parent’s Portal</Text>
            <Text className="text-xs text-fg-muted">Capt. H. Francisco ES</Text>
          </View>
        </View>

        <View className="gap-1 px-3 pb-4 pt-3">
          {sections.top.map(row)}
          {sections.groups.map((group, i) => {
            const open = isGroupOpen(group.label, folded, activeLabel);
            const locked = !group.label || group.label === activeLabel;
            return (
              <View key={group.label || `rest-${i}`} className="gap-1 pt-2">
                {group.label ? (
                  <View className="overflow-hidden rounded-xl">
                    <Pressable
                      onPress={() => toggle(group.label)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={group.label}
                      accessibilityHint={locked ? 'Holds the page you are on, so it stays open' : undefined}
                      android_ripple={{ color: tokens['edge-strong'] }}
                    >
                      <View style={{ minHeight: TARGET }} className="flex-row items-center justify-between gap-3 px-3">
                        <Text className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                          {group.label}
                        </Text>
                        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                          <Icon name="fa-chevron-right" size={11} color={tokens['fg-muted']} />
                        </View>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
                {open ? group.items.map(row) : null}
              </View>
            );
          })}
        </View>

        {sections.bottom.length ? (
          <View className="gap-1 border-t border-edge px-3 py-2">{sections.bottom.map(row)}</View>
        ) : null}
      </DrawerContentScrollView>

      {/* THE USER CARD — the web's, on the phone: a rounded, bordered tile of
          its own, set in from the drawer's edges, under the hairline that
          ends the scrolling list. The avatar and name open Settings → Account
          information; Logout is a separate 48dp icon beside it, never inside
          it. THE NAME WRAPS TO TWO LINES BEFORE IT CLIPS — the name is the
          one thing this card is for, and the button's label always carries it
          whole. A parent's second line is "Parent" alone, never the login id
          (drawerFold.js, §5c). */}
      <View className="border-t border-edge pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
        <View className="mx-2 flex-row items-center gap-2 rounded-2xl border border-edge bg-surface-subtle p-2">
          {/* The one button here whose corners are on the button itself: it
              must stay the row's own flex child, with its width in the plain
              style object below (proof-drawer evaluates that object). */}
          <Pressable
            onPress={openAccount}
            accessibilityRole="button"
            accessibilityLabel={`${name ? `${name}, ` : ''}Account information`}
            android_ripple={{ color: tokens['edge-strong'] }}
            className="overflow-hidden rounded-xl"
            style={{ flex: 1, minWidth: 0 }}
          >
            <View style={{ minHeight: TARGET }} className="flex-row items-center gap-3 px-1.5 py-1">
              <Avatar name={name} photo={user?.profile_pic} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={2} className="text-sm font-semibold text-fg">
                  {name}
                </Text>
                <Text numberOfLines={1} className="text-xs text-fg-muted">
                  {detail}
                </Text>
              </View>
            </View>
          </Pressable>
          <View className="overflow-hidden rounded-xl">
            <Pressable
              onPress={() => requestLeave(logout)}
              accessibilityRole="button"
              accessibilityLabel="Logout"
              android_ripple={{ color: tokens['edge-strong'] }}
            >
              <View style={{ width: TARGET, height: TARGET }} className="items-center justify-center">
                <Icon name="fa-right-from-bracket" size={16} color={tokens['fg-body']} />
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
