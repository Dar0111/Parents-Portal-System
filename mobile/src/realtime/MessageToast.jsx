import { useNavigation, useNavigationState } from '@react-navigation/native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import messageTone from '../../assets/sounds/message-tone.wav';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Text from '../components/Text';
import Icon from '../icons';
import { drawerOpenInState } from '../navigation/drawerOpen';
import { requestLeave } from '../navigation/leaveGuard';
import { isBuilt } from '../navigation/routes';
import { useTheme } from '../theme/ThemeProvider';
import { useSocket } from './SocketProvider';
import { useUnread } from './UnreadProvider';
import { TOAST_MS, createToastStore, otherIdFromRoute, rowFor } from './messageToast';
import { alertOnToast, createAudioModeGate, createGatedPlay } from './toastAlert';

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
//   - THE ALERT (fix round, 2026-10-02): on a toast SHOW or UPDATE only, the
//     tone AND a 150 ms vibration (realtime/toastAlert.js). The tone is
//     assets/sounds/message-tone.wav, generated from the mirrored TONE by
//     scripts/make-message-tone.mjs and played through expo-audio — ONE
//     player for the life of AppShell, released on unmount (logout). The
//     audio mode DUCKS other apps' sound rather than pausing it. A tone that
//     fails is silent; the vibration and the toast still happen.
//   - SILENT / VIBRATE-ONLY (fix round B9): no tone. Every play waits for
//     the ONE module-level audio-mode promise (toastAlert.js), because
//     expo-audio only refuses `play()` in those ringer modes once
//     `playsInSilentMode: false` has resolved. Do Not Disturb is NOT
//     covered — expo-audio never reads it (KNOWN_ISSUES; fixed with the APK).
// Everything else — the words, never the body, the server's count, the
// newest sender replacing, never my own, never in that conversation — is
// the mirrored realtime/messageToast.js.

// React Navigation's default Android header height; see above.
const HEADER_HEIGHT = 56;

// View and Dismiss are 44dp targets, sized in dp on each Pressable's inner
// View through a plain style object (the phone's rem is 14 — M19).
const TARGET = 44;

// The bundled tone — a local asset imported like the seal's PNG (Metro
// bundles it), never a URL.
const TONE_SOURCE = messageTone;

// THE AUDIO MODE — ONE promise for the app, kept at module level so a
// logout and a login do not set it again: DUCK other apps (they lower their
// volume and keep playing — never paused), no background playback, and NO
// TONE in silent or vibrate-only mode (Android reads the ringer; iOS the
// silent switch). Started on mount; a failure is retried once, by the next
// alert, and is reported in a development build only.
const audioMode = createAudioModeGate(
  () => setAudioModeAsync({ interruptionMode: 'duckOthers', shouldPlayInBackground: false, playsInSilentMode: false }),
  {
    onError: (error) => {
      if (__DEV__) console.warn('[message-tone] audio mode not set; the next alert retries once:', error);
    },
  }
);

export default function MessageToast() {
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { subscribeConversations } = useUnread();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const viewingOtherId = useNavigationState((state) => otherIdFromRoute(state));
  // NOT OVER AN OPEN DRAWER (feat/look-fixes, 2026-10-05): the drawer lives
  // inside the stack this toast floats over, so the toast sat on the drawer's
  // top. While it is open the toast renders nothing; the store, the 5 s timer,
  // the tone and the announcement run exactly as before, and no motion is
  // added (navigation/drawerOpen.js).
  const drawerOpen = useNavigationState((state) => drawerOpenInState(state));
  const enabled = isBuilt(`/${user?.role}/messages`);

  const [toast, setToast] = useState(null);
  // THE TOAST'S ONE HOME (fix round): every change — show, update, replace,
  // ×, the 5 s expiry, View — goes through this store; nothing is stale.
  const [store] = useState(() => createToastStore(setToast));
  // ONE player for the life of this component; expo-audio releases it on
  // unmount, and AppShell unmounts on logout.
  const player = useAudioPlayer(TONE_SOURCE);

  const pendingRef = useRef(null);
  const viewingRef = useRef(viewingOtherId);
  const selfRef = useRef(user?.id);
  const enabledRef = useRef(enabled);
  const playerRef = useRef(player);
  useEffect(() => {
    viewingRef.current = viewingOtherId;
  }, [viewingOtherId]);
  useEffect(() => {
    selfRef.current = user?.id;
  }, [user?.id]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // Start the audio mode now, so the first alert does not wait for it.
  useEffect(() => {
    audioMode.ready();
  }, []);

  // 1. A message arrived: remember the sender's id — never the body.
  useEffect(
    () =>
      subscribe((message) => {
        pendingRef.current = message?.sender_id ?? null;
      }),
    [subscribe]
  );

  // 2. The Unread provider's re-read landed: decide from that person's row,
  // then — only on a show or update — announce, play the tone and vibrate.
  useEffect(() => {
    // The tone, only once the audio mode has resolved (see `audioMode` above).
    const playTone = createGatedPlay(audioMode, () => {
      const tone = playerRef.current;
      const seek = tone.seekTo(0);
      if (seek && typeof seek.catch === 'function') seek.catch(() => {});
      tone.play();
    });
    return subscribeConversations((rows) => {
      const senderId = pendingRef.current;
      if (senderId == null) return;
      pendingRef.current = null;
      const changed = store.receive({
        senderId,
        selfId: selfRef.current,
        viewingOtherId: viewingRef.current,
        row: rowFor(rows, senderId),
      });
      if (!changed) return;
      AccessibilityInfo.announceForAccessibility(store.get().label);
      alertOnToast(changed, {
        enabled: enabledRef.current,
        play: playTone,
        vibrate: (ms) => Vibration.vibrate(ms),
      });
    });
  }, [subscribeConversations, store]);

  // 3. Five seconds, started again by every new toast object.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => store.clear(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, store]);

  const dismiss = useCallback(() => store.clear(), [store]);

  // View opens that conversation through the unsaved-changes guard: on
  // Attendance with unsaved marks it asks "Leave without saving?" first.
  // AppShell is the root stack's `Home` screen, so the thread is reached as
  // Home → MessageThread.
  const view = useCallback(() => {
    if (!toast) return;
    const { senderId, name } = toast;
    requestLeave(() => {
      store.clear();
      navigation.navigate('Home', { screen: 'MessageThread', params: { otherId: senderId, name } });
    });
  }, [toast, navigation, store]);

  // A role with no Messages screen gets no toast and no alert (a
  // notification must be openable, §10). Every role has one since
  // 2026-10-05 — the admin too (teacher <-> admin only) — so the admin gets
  // the badge, the toast, the tone and the vibration.
  if (!enabled) return null;

  return (
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + HEADER_HEIGHT + 8, left: 12, right: 12, zIndex: 50 }}
    >
      {toast && !drawerOpen ? (
        <View className="flex-row items-center gap-2 rounded-2xl border border-edge bg-surface p-3" style={{ elevation: 6 }}>
          <Avatar name={toast.name} photo={toast.photo} />
          <Text className="min-w-0 flex-1 text-sm font-semibold text-fg">{toast.label}</Text>
          <Pressable onPress={view} accessibilityRole="button" accessibilityLabel={`View, ${toast.label}`}>
            <View className="items-center justify-center rounded-xl bg-primary px-3" style={{ minHeight: TARGET }}>
              <Text className="text-sm font-semibold text-primary-fg">View</Text>
            </View>
          </Pressable>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
            <View className="items-center justify-center rounded-xl" style={{ width: TARGET, height: TARGET }}>
              <Icon name="fa-xmark" size={16} color={tokens['fg-muted']} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
