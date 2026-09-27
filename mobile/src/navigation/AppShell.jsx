import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import NotificationBell from '../components/NotificationBell';
import Icon from '../icons';
import { useNotifications } from '../realtime/NotificationProvider';
import { useUnread } from '../realtime/UnreadProvider';
import LiveStatus from '../realtime/LiveStatus';
import AboutScreen from '../screens/AboutScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AnnouncementsScreen from '../screens/parent/AnnouncementsScreen';
import AttendanceScreen from '../screens/parent/AttendanceScreen';
import DashboardScreen from '../screens/parent/DashboardScreen';
import EventsScreen from '../screens/parent/EventsScreen';
import ExcuseLetterComposeScreen from '../screens/parent/ExcuseLetterComposeScreen';
import ExcuseLetterReadScreen from '../screens/parent/ExcuseLetterReadScreen';
import ExcuseLettersScreen from '../screens/parent/ExcuseLettersScreen';
import GradeBreakdownScreen from '../screens/parent/GradeBreakdownScreen';
import GradesScreen from '../screens/parent/GradesScreen';
import MemosScreen from '../screens/parent/MemosScreen';
import MessagesScreen from '../screens/parent/MessagesScreen';
import MessageThreadScreen from '../screens/parent/MessageThreadScreen';
import NewMessageScreen from '../screens/parent/NewMessageScreen';
import PostReadScreen from '../screens/parent/PostReadScreen';
import RoleHome from '../screens/RoleHome';
import AccountInfoScreen from '../screens/settings/AccountInfoScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import PersonalizationScreen from '../screens/settings/PersonalizationScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useTheme } from '../theme/ThemeProvider';
import DrawerContent, { badgeFor } from './DrawerContent';
import { navForRole } from './nav';
import { isBuilt, routeFor } from './routes';

// THE MENU BUTTON CARRIES A DOT WHEN ANY DRAWER BADGE IS ABOVE ZERO — a
// MOBILE ADDITION, declared (MOBILE_CONVENTIONS M9). The web's narrow-screen
// header has no badge on its hamburger (layout/Header.jsx), because its
// sidebar is on screen from `sm` up; on a phone the drawer is closed nearly
// always, so a Messages badge nobody can see is a count that does not exist.
// The dot is presence only — the numbers stay on the drawer rows — and it
// is the SUM OF THE ROWS' OWN BADGES, each the server's (§10): messages are
// not in the bell and grades are never badged, so this dot and the bell's
// count answer different questions and neither is derived from the other.
function MenuButton() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const { counts } = useNotifications();
  const { unread } = useUnread();
  const items = navForRole(user?.role);
  const total = items.reduce((sum, item) => sum + (badgeFor(item, user?.role, counts, unread) || 0), 0);
  return (
    <Pressable
      onPress={() => navigation.toggleDrawer()}
      accessibilityRole="button"
      accessibilityLabel={total > 0 ? `Open menu, ${total} unread` : 'Open menu'}
      className="ml-2 h-9 w-9 items-center justify-center rounded-lg border border-edge-strong"
    >
      <Icon name="fa-bars" size={15} color={tokens['fg-body']} />
      {total > 0 ? <View className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface bg-primary" /> : null}
    </Pressable>
  );
}

// THE PHONE'S Shell (MOBILE_CONVENTIONS M9). A drawer per role, built from
// navigation/nav.js exactly as the web's sidebar is, with each drawer route
// NAMED BY ITS PATH so nav items and notification links navigate by the
// string they already carry (routes.js). Around the drawer, a native stack
// holds the screens that are not nav items — Notifications and the three
// Settings sub-screens here; the thread, the reading views, compose and the
// grade breakdown on the parent branch's second half.
//
// THE STRIP IS IN THE LAYOUT, NOT IN EACH SCREEN. `screenLayout` wraps every
// screen of both navigators with LiveStatus above its content, which is §5g's
// "wherever anything depending on the channel is shown" — the badges are in
// the drawer and the bell is in every header, so that is every screen.
//
// This is the ONE file that imports screens; routes.js maps a path to a
// screen NAME and stays pure so a proof can load it.
const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

const COMPONENTS = {
  RoleHome,
  Settings: SettingsScreen,
  About: AboutScreen,
  ParentDashboard: DashboardScreen,
  ParentGrades: GradesScreen,
  ParentAttendance: AttendanceScreen,
  ParentExcuseLetters: ExcuseLettersScreen,
  ParentAnnouncements: AnnouncementsScreen,
  ParentMemos: MemosScreen,
  ParentEvents: EventsScreen,
  ParentMessages: MessagesScreen,
};

const POST_TITLES = { announcement: 'Announcement', memo: 'Memo', event: 'Event' };

function withStrip({ children }) {
  return (
    <>
      <LiveStatus />
      {children}
    </>
  );
}

function headerOptions(tokens) {
  return {
    headerStyle: { backgroundColor: tokens.surface },
    headerTintColor: tokens.fg,
    headerTitleStyle: { fontSize: 16, fontWeight: '600', color: tokens.fg },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: tokens.page },
  };
}

function RoleDrawer() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const items = navForRole(user?.role);
  const built = items.filter((item) => isBuilt(item.to) && COMPONENTS[routeFor(item.to)]);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} items={items} />}
      screenLayout={withStrip}
      screenOptions={{
        ...headerOptions(tokens),
        headerLeft: () => <MenuButton />,
        headerRight: () => <NotificationBell />,
        drawerStyle: { backgroundColor: tokens.surface, width: 280 },
        sceneStyle: { backgroundColor: tokens.page },
      }}
    >
      {built.map((item) => (
        <Drawer.Screen
          key={item.to}
          name={item.to}
          component={COMPONENTS[routeFor(item.to)]}
          options={{ title: item.label }}
        />
      ))}
    </Drawer.Navigator>
  );
}

export default function AppShell() {
  const { tokens } = useTheme();
  return (
    <Stack.Navigator screenLayout={withStrip} screenOptions={headerOptions(tokens)}>
      <Stack.Screen name="Main" component={RoleDrawer} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="AccountInfo" component={AccountInfoScreen} options={{ title: 'Account information' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change password' }} />
      <Stack.Screen name="Personalization" component={PersonalizationScreen} options={{ title: 'Personalization' }} />
      {/* The parent's detail screens. Modal presentation for the two that
          the web opened as dialogs (the breakdown, compose); a push for the
          reading views and the thread. */}
      <Stack.Screen
        name="GradeBreakdown"
        component={GradeBreakdownScreen}
        options={({ route }) => ({ presentation: 'modal', title: route.params?.subjectName ? `${route.params.subjectName} · Term ${route.params.term}` : 'Grade' })}
      />
      <Stack.Screen name="ExcuseLetterRead" component={ExcuseLetterReadScreen} options={{ title: 'Excuse letter' }} />
      <Stack.Screen
        name="ExcuseLetterCompose"
        component={ExcuseLetterComposeScreen}
        options={({ route }) => ({ presentation: 'modal', title: route.params?.letter ? 'Edit excuse letter' : 'Submit excuse letter' })}
      />
      <Stack.Screen name="PostRead" component={PostReadScreen} options={({ route }) => ({ title: POST_TITLES[route.params?.kind] || 'Post' })} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={{ title: 'New message' }} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} options={({ route }) => ({ title: route.params?.name || 'Conversation' })} />
    </Stack.Navigator>
  );
}
