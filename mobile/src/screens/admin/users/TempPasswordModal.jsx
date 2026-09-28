import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import api from '../../../api/client';
import extractError from '../../../api/extractError';
import ErrorAlert from '../../../components/ErrorAlert';
import { useTheme } from '../../../theme/ThemeProvider';

// RESET PASSWORD — the web's two-phase dialog (MOBILE_CONVENTIONS M17).
// Phase one confirms BY NAME, with the web's words: the old password stops
// working the instant this returns, and there is no undo (§5e). Phase two
// shows the generated password ONCE.
//
// WHERE THE PASSWORD MAY LIVE, AND WHERE IT MAY NOT:
//   - only in this component's state — never a navigation param (params
//     persist in navigation state), never a FormStatus text (the success
//     line names the person only, as on the web), never a console line;
//   - cleared when the popup closes, AND when the app leaves the
//     foreground (Darryl's A3) — the popup then closes itself;
//   - screen capture is blocked (`expo-screen-capture`, Android's secure
//     flag) ONLY while a password is on screen, and lifted the moment it is
//     cleared, so no other screen of the app is affected;
//   - NO Copy button on the phone (Darryl, Q2 — a declared difference): the
//     phone's clipboard can keep it in a history the app cannot clear.
// The server hashes it and returns it in this one response; no endpoint can
// produce it again, so losing it means setting another.
const CAPTURE_KEY = 'temp-password';

export default function TempPasswordModal({ target, onClose, onSet }) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const [password, setPassword] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // The capture block follows the password exactly.
  useEffect(() => {
    if (!password) return undefined;
    preventScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    return () => {
      allowScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    };
  }, [password]);

  // Leaving the app clears it and closes the popup (A3).
  useEffect(() => {
    if (!target) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        setPassword(null);
        onClose();
      }
    });
    return () => sub.remove();
  }, [target, onClose]);

  function close() {
    if (saving) return;
    setPassword(null);
    setError(null);
    onClose();
  }

  async function submit() {
    if (!target || saving) return;
    setSaving(true);
    setError(null);
    try {
      const temporary = await api.post(`/users/${target.id}/temp-password`, {}, { unwrap: 'temporary_password' });
      setPassword(temporary);
      onSet(target);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={Boolean(target)} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: tokens.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
          <Text className="text-base font-semibold text-fg">Reset password — {target?.name}</Text>
          {error ? <ErrorAlert message={error} /> : null}
          {password ? (
            <>
              <Text className="text-sm text-fg-body">
                Give this to <Text className="font-medium text-fg">{target?.name}</Text>. They will be asked to choose their own password the next time they
                sign in.
              </Text>
              <View className="rounded-lg border border-edge bg-surface-subtle px-3 py-3">
                <Text selectable={false} accessibilityLabel="Temporary password" className="text-center font-mono text-lg tracking-wider text-fg">
                  {password}
                </Text>
              </View>
              <View accessibilityRole="alert" className="rounded-lg bg-warning-soft px-3 py-2">
                <Text className="text-sm text-warning-strong">
                  This is shown once. It is not stored anywhere in readable form and cannot be looked up again — if you close this without passing it on, set
                  another one. It is also cleared if you leave the app.
                </Text>
              </View>
              <Pressable onPress={close} accessibilityRole="button" className="items-center rounded-lg bg-primary px-4 py-2.5">
                <Text className="text-sm font-medium text-primary-fg">Done — I have given it to them</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="text-sm text-fg-body">
                Set a temporary password for <Text className="font-medium text-fg">{target?.name}</Text>?
              </Text>
              <Text className="text-sm text-fg-muted">
                Their current password stops working immediately and they are signed out everywhere. The new one is shown once, on the next screen, and they
                must choose their own before they can use the portal again. This cannot be undone.
              </Text>
              <View className="flex-row justify-end gap-2">
                <Pressable onPress={close} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                  <Text className="text-sm font-medium text-fg-body">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, busy: saving }}
                  className={`rounded-lg bg-primary px-4 py-2 ${saving ? 'opacity-60' : ''}`}
                >
                  <Text className="text-sm font-medium text-primary-fg">{saving ? 'Setting…' : 'Yes, set a temporary password'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
