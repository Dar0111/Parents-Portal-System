import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Icon from '../icons';
import { requestLeave } from '../navigation/leaveGuard';
import { isBuilt } from '../navigation/routes';
import { useTheme } from '../theme/ThemeProvider';
import { useSocket } from './SocketProvider';
import { useUnread } from './UnreadProvider';
import { TOAST_MS, nextToast, otherIdFromRoute, rowFor } from './messageToast';

// THE NEW-MESSAGE TOAST, phone (feat/message-toast, 2026-10-02;
// MOBILE_CONVENTIONS M22). The web's toast (client/src/realtime/
// MessageToast.jsx) with the phone's differences only:
//   - WHERE: floating at the top, just under the header, over every screen
//     of AppShell. The app sets no header height of its own, so this is
//     React Navigation's default Android header height (56) below the
//     top safe-area inset — no new import (`@react-navigation/elements` is
//     not a direct dependency).
//   - NO HOVER, so no pause: 5 s, started again by every new toast.
//   - ANNOUNCED with accessibilityLiveRegion on an always-mounted box, plus
//     AccessibilityInfo.announceForAccessibility (iOS has no live regions).
//   - "IN THAT CONVERSATION" is the focused route: `MessageThread` with
//     `params.otherId`, read from the navigation state (otherIdFromRoute).
// Everything else — the words, never the body, the server's count, the
// newest sender replacing, never my own, never in that conversation — is
// the mirrored realtime/messageToast.js. No sound, no vibration.

// React Navigation's default Android header height; see above.
const HEADER_HEIGHT = 56;

export default function MessageToast() {
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { subscribeConversations } = useUnread();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const viewingOtherId = useNavigationState((state) => otherIdFromRoute(state));

  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const pendingRef = useRef(null);
  const viewingRef = useRef(viewingOtherId);
  const selfRef = useRef(user?.id);
  useEffect(() => {
    viewingRef.current = viewingOtherId;
  }, [viewingOtherId]);
  useEffect(() => {
    selfRef.current = user?.id;
  }, [user?.id]);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // 1. A message arrived: remember the sender's id — never the body.
  useEffect(
    () =>
      subscribe((message) => {
        pendingRef.current = message?.sender_id ?? null;
      }),
    [subscribe]
  );

  // 2. The Unread provider's re-read landed: decide from that person's row.
  useEffect(
    () =>
      subscribeConversations((rows) => {
        const senderId = pendingRef.current;
        if (senderId == null) return;
        pendingRef.current = null;
        const next = nextToast(toastRef.current, {
          senderId,
          selfId: selfRef.current,
          viewingOtherId: viewingRef.current,
          row: rowFor(rows, senderId),
        });
        if (!next.changed) return;
        toastRef.current = next.toast;
        setToast(next.toast);
        AccessibilityInfo.announceForAccessibility(next.toast.label);
      }),
    [subscribeConversations]
  );

  // 3. Five seconds, started again by every new toast object.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const dismiss = useCallback(() => setToast(null), []);

  // View opens that conversation through the unsaved-changes guard: on
  // Attendance with unsaved marks it asks "Leave without saving?" first.
  // AppShell is the root stack's `Home` screen, so the thread is reached as
  // Home → MessageThread.
  const view = useCallback(() => {
    if (!toast) return;
    const { senderId, name } = toast;
    requestLeave(() => {
      setToast(null);
      navigation.navigate('Home', { screen: 'MessageThread', params: { otherId: senderId, name } });
    });
  }, [toast, navigation]);

  // An admin has no Messages screen, so no toast (a notification must be
  // openable, §10).
  if (!isBuilt(`/${user?.role}/messages`)) return null;

  return (
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + HEADER_HEIGHT + 8, left: 12, right: 12, zIndex: 50 }}
    >
      {toast ? (
        <View className="flex-row items-center gap-3 rounded-xl border border-edge bg-surface p-3" style={{ elevation: 6 }}>
          <Avatar name={toast.name} photo={toast.photo} />
          <Text className="min-w-0 flex-1 text-sm font-medium text-fg">{toast.label}</Text>
          <Pressable onPress={view} accessibilityRole="button" accessibilityLabel={`View, ${toast.label}`}>
            <View className="rounded-lg bg-primary px-3 py-2">
              <Text className="text-sm font-medium text-primary-fg">View</Text>
            </View>
          </Pressable>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
            <View className="h-9 w-9 items-center justify-center rounded-lg">
              <Icon name="fa-xmark" size={15} color={tokens['fg-muted']} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
