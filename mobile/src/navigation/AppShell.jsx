import { createDrawerNavigator } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import NotificationBell from '../components/NotificationBell';
import Icon from '../icons';
import { useNotifications } from '../realtime/NotificationProvider';
import { useUnread } from '../realtime/UnreadProvider';
import LiveStatus from '../realtime/LiveStatus';
// With its extension: MessageToast.jsx and the pure messageToast.js differ
// only by case, and an extensionless import on a case-insensitive disk can
// land on the .js (the web build failed exactly that way; M22).
import MessageToast from '../realtime/MessageToast.jsx';
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
import AdminAnnouncementsScreen from '../screens/admin/AnnouncementsScreen';
import AdminAttendanceScreen from '../screens/admin/AttendanceScreen';
import AdminGradeLockScreen from '../screens/admin/GradeLockScreen';
import AdminGradesScreen from '../screens/admin/GradesScreen';
import AdminPostComposeScreen from '../screens/admin/PostComposeScreen';
import AdminStudentDetailScreen from '../screens/admin/StudentDetailScreen';
import AdminStudentsScreen from '../screens/admin/StudentsScreen';
import AdminCreateTeacherScreen from '../screens/admin/CreateTeacherScreen';
import AdminDashboardScreen from '../screens/admin/DashboardScreen';
import AdminEditUserScreen from '../screens/admin/EditUserScreen';
import AdminReviewParentScreen from '../screens/admin/ReviewParentScreen';
import AdminUsersScreen from '../screens/admin/UsersScreen';
import SchoolSettingsScreen from '../screens/settings/SchoolSettingsScreen';
import TeacherAnnouncementComposeScreen from '../screens/teacher/AnnouncementComposeScreen';
import TeacherAnnouncementsScreen from '../screens/teacher/AnnouncementsScreen';
import TeacherAttendanceRecordsScreen from '../screens/teacher/AttendanceRecordsScreen';
import TeacherAttendanceScreen from '../screens/teacher/AttendanceScreen';
import TeacherClassSummaryLearnerScreen from '../screens/teacher/ClassSummaryLearnerScreen';
import TeacherClassSummaryScreen from '../screens/teacher/ClassSummaryScreen';
import TeacherGradesScreen from '../screens/teacher/GradesScreen';
import TeacherSlotScreen from '../screens/teacher/SlotScreen';
import TeacherDashboardScreen from '../screens/teacher/DashboardScreen';
import TeacherEnrollScreen from '../screens/teacher/EnrollScreen';
import TeacherEventComposeScreen from '../screens/teacher/EventComposeScreen';
import TeacherEventsScreen from '../screens/teacher/EventsScreen';
import TeacherExcuseLetterReviewScreen from '../screens/teacher/ExcuseLetterReviewScreen';
import TeacherExcuseLettersScreen from '../screens/teacher/ExcuseLettersScreen';
import TeacherExcuseLetterReadScreen from '../screens/teacher/excuseLetters/LetterReadingView';
import TeacherMemosScreen from '../screens/teacher/MemosScreen';
import TeacherMessagesScreen from '../screens/teacher/MessagesScreen';
import TeacherNewMessageScreen from '../screens/teacher/NewMessageScreen';
import TeacherStudentDetailScreen from '../screens/teacher/StudentDetailScreen';
import TeacherStudentsScreen from '../screens/teacher/StudentsScreen';
import AccountInfoScreen from '../screens/settings/AccountInfoScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import PersonalizationScreen from '../screens/settings/PersonalizationScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { TITLE_FONT } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import DrawerContent, { badgeFor } from './DrawerContent';
import { navForRole } from './nav';
import { isBuilt, isWebOnly, routeFor } from './routes';

// THE MENU BUTTON CARRIES A DOT WHEN ANY DRAWER BADGE IS ABOVE ZERO — a
// MOBILE ADDITION, declared (MOBILE_CONVENTIONS M9). The web's narrow-screen
// header has no badge on its hamburger (layout/Header.jsx), because its
// sidebar is on screen from `md` up; on a phone the drawer is closed nearly
// always, so a Messages badge nobody can see is a count that does not exist.
// The dot is presence only — the numbers stay on the drawer rows — and it
// is the SUM OF THE ROWS' OWN BADGES, each the server's (§10): messages are
// not in the bell and grades are never badged, so this dot and the bell's
// count answer different questions and neither is derived from the other.
//
// A 44dp SQUARE, SET IN dp (feat/ui-refresh, 2026-10-02) — the phone's rem
// is 14, so the old `h-9 w-9` was 31.5dp, well under a finger's target. The
// size is a plain style OBJECT and the press feedback is Android's ripple, a
// prop (never a style function on a Pressable — M20).
//
// THE DOT IS A SIBLING OF THE BUTTON, NOT ITS CHILD — the bell's rule
// (components/NotificationBell.jsx), so the two header buttons match: the
// button clips its ripple to its rounded corner, and a dot hanging off that
// corner would be clipped with it. As a sibling it stays where it always
// was, on the top-right corner. It takes no touches and is hidden from the
// screen reader — the button's own label already says the count in words.
const MENU_SIZE = 44;

function MenuButton() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const { counts } = useNotifications();
  const { unread } = useUnread();
  const items = navForRole(user?.role);
  const total = items.reduce((sum, item) => sum + (badgeFor(item, user?.role, counts, unread) || 0), 0);
  return (
    <View className="ml-2" style={{ width: MENU_SIZE, height: MENU_SIZE }}>
      <Pressable
        onPress={() => navigation.toggleDrawer()}
        accessibilityRole="button"
        accessibilityLabel={total > 0 ? `Open menu, ${total} unread` : 'Open menu'}
        android_ripple={{ color: tokens['edge-strong'] }}
        className="items-center justify-center overflow-hidden rounded-xl border border-edge-strong"
        style={{ width: MENU_SIZE, height: MENU_SIZE }}
      >
        <Icon name="fa-bars" size={16} color={tokens['fg-body']} />
      </Pressable>
      {total > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface bg-primary"
        />
      ) : null}
    </View>
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
  TeacherDashboard: TeacherDashboardScreen,
  TeacherStudents: TeacherStudentsScreen,
  TeacherAttendance: TeacherAttendanceScreen,
  TeacherAttendanceRecords: TeacherAttendanceRecordsScreen,
  TeacherGrades: TeacherGradesScreen,
  TeacherClassSummary: TeacherClassSummaryScreen,
  TeacherExcuseLetters: TeacherExcuseLettersScreen,
  TeacherAnnouncements: TeacherAnnouncementsScreen,
  TeacherMemos: TeacherMemosScreen,
  TeacherEvents: TeacherEventsScreen,
  TeacherMessages: TeacherMessagesScreen,
  AdminDashboard: AdminDashboardScreen,
  AdminUsers: AdminUsersScreen,
  AdminStudents: AdminStudentsScreen,
  AdminGrades: AdminGradesScreen,
  AdminAttendance: AdminAttendanceScreen,
  AdminAnnouncements: AdminAnnouncementsScreen,
};

const POST_TITLES = { announcement: 'Announcement', memo: 'Memo', event: 'Event' };

// THE SCREEN FRAME OWNS THE BOTTOM SAFE AREA (re-check finding, 2026-09-27).
// Android runs edge-to-edge here, so the system navigation bar overlays
// the bottom of every screen: it sat on the thread's composer and on the
// drawer's Logout. One frame, applied by both navigators' `screenLayout`,
// pads every screen's bottom by the inset on the page colour, so nothing a
// screen anchors at its bottom — a composer, a form's buttons, the last
// card of a list — can land under the bar. The headers own the top inset;
// the drawer, outside any screen layout, pads both edges itself.
export function ScreenFrame({ children }) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  return <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: tokens.page }}>{children}</View>;
}

function withStrip({ children }) {
  return (
    <ScreenFrame>
      <LiveStatus />
      {children}
    </ScreenFrame>
  );
}

function headerOptions(tokens) {
  return {
    headerStyle: { backgroundColor: tokens.surface },
    headerTintColor: tokens.fg,
    // The title face (Merriweather Bold), by family name and with NO
    // fontWeight: a weight beside a custom family makes Android fake the bold
    // (tailwind.config.js). The header's HEIGHT is untouched — the message
    // toast sits a fixed 56dp under the top inset (M22).
    headerTitleStyle: { fontFamily: TITLE_FONT, fontSize: 16, color: tokens.fg },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: tokens.page },
  };
}

function RoleDrawer() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  // A WEB-ONLY item (Backup & Restore) is dropped here, before the drawer
  // sees the list: hidden, not dimmed (routes.js WEB_ONLY, branch 4).
  const items = navForRole(user?.role).filter((item) => !isWebOnly(item.to));
  const built = items.filter((item) => isBuilt(item.to) && COMPONENTS[routeFor(item.to)]);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} items={items} />}
      screenLayout={withStrip}
      screenOptions={{
        ...headerOptions(tokens),
        headerLeft: () => <MenuButton />,
        headerRight: () => <NotificationBell />,
        // 296dp since feat/ui-refresh (it was 280): the user card is now a
        // tile set in from the drawer's edges, and the extra 16dp gives its
        // name back the width the inset took. On a 360dp phone that leaves a
        // 64dp strip of the page to tap the drawer shut.
        drawerStyle: { backgroundColor: tokens.surface, width: 296 },
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

// THE NEW-MESSAGE TOAST FLOATS OVER EVERY SCREEN (feat/message-toast, M22):
// a sibling of the stack, absolutely placed under the header, so one toast
// serves the drawer screens and the pushed ones alike.
export default function AppShell() {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1 }}>
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
      {/* The teacher's detail screens (branch 3). Modal for the web's
          dialogs — enrol, review, the two composers; a push for the record,
          the reading view and the contact picker. The thread is shared. */}
      <Stack.Screen name="StudentDetail" component={TeacherStudentDetailScreen} options={{ title: 'Student' }} />
      <Stack.Screen
        name="Enroll"
        component={TeacherEnrollScreen}
        options={({ route }) => ({ presentation: 'modal', title: route.params?.student ? 'Create parent account' : 'Enroll a student' })}
      />
      <Stack.Screen name="ExcuseLetterReview" component={TeacherExcuseLetterReviewScreen} options={{ presentation: 'modal', title: 'Review letter' }} />
      <Stack.Screen name="TeacherExcuseLetterRead" component={TeacherExcuseLetterReadScreen} options={{ title: 'Excuse letter' }} />
      <Stack.Screen
        name="AnnouncementCompose"
        component={TeacherAnnouncementComposeScreen}
        options={({ route }) => ({ presentation: 'modal', title: route.params?.editing ? 'Edit announcement' : 'New announcement' })}
      />
      <Stack.Screen
        name="EventCompose"
        component={TeacherEventComposeScreen}
        options={({ route }) => ({ presentation: 'modal', title: route.params?.editing ? 'Edit event' : 'New event' })}
      />
      <Stack.Screen name="TeacherNewMessage" component={TeacherNewMessageScreen} options={{ title: 'New message' }} />
      {/* The second half: one class-record column (a push, so Back is the
          guarded removal), and a learner's read-only report card. */}
      <Stack.Screen name="ClassRecordSlot" component={TeacherSlotScreen} options={({ route }) => ({ title: route.params?.title || 'Slot' })} />
      <Stack.Screen name="ClassSummaryLearner" component={TeacherClassSummaryLearnerScreen} options={({ route }) => ({ title: route.params?.name || 'Report card' })} />
      {/* The admin's detail screens (branch 4): the web's dialogs as modal
          screens, and School settings pushed from the Settings list. The
          temporary password is NOT a screen — it is a popup inside Users,
          so it never becomes a navigation param. */}
      <Stack.Screen name="CreateTeacher" component={AdminCreateTeacherScreen} options={{ presentation: 'modal', title: 'Create teacher' }} />
      <Stack.Screen name="EditUser" component={AdminEditUserScreen} options={({ route }) => ({ presentation: 'modal', title: route.params?.target ? `Edit ${route.params.target.name}` : 'Edit user' })} />
      <Stack.Screen name="ReviewParent" component={AdminReviewParentScreen} options={{ presentation: 'modal', title: 'Review parent' }} />
      <Stack.Screen name="SchoolSettings" component={SchoolSettingsScreen} options={{ title: 'School settings' }} />
      <Stack.Screen name="AdminStudentDetail" component={AdminStudentDetailScreen} options={{ title: 'Student' }} />
      <Stack.Screen name="GradeLock" component={AdminGradeLockScreen} options={{ presentation: 'modal', title: 'Lock or unlock' }} />
      <Stack.Screen
        name="PostCompose"
        component={AdminPostComposeScreen}
        options={({ route }) => ({
          presentation: 'modal',
          title: `${route.params?.editing ? 'Edit' : 'New'} ${route.params?.kind === 'memo' ? 'memo' : 'announcement'}`,
        })}
      />
    </Stack.Navigator>
    <MessageToast />
    </View>
  );
}
