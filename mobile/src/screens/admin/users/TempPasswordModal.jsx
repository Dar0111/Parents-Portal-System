import { useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import api from '../../../api/client';
import extractError from '../../../api/extractError';
import Button from '../../../components/Button';
import { cardClass } from '../../../components/buttonStyles';
import ErrorAlert from '../../../components/ErrorAlert';
import Text from '../../../components/Text';
import Icon from '../../../icons';
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
//
// THE LOOK (feat/ui-refresh, 2026-10-03): the title in the title face, each
// phase's words in one card, the shown-once warning as a notice with its
// glyph, and the shared `Button` — full width for the single way out of phase
// two. The password line itself is as it was: the fixed-width face, not
// selectable, one accessible name. NO MOTION on either phase, and still no
// Copy.
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
          <Text accessibilityRole="header" className="font-serif text-xl text-fg">
            Reset password — {target?.name}
          </Text>
          {error ? <ErrorAlert message={error} /> : null}
          {password ? (
            <>
              <View className={`${cardClass} gap-4 p-4`}>
                <Text className="text-sm text-fg-body">
                  Give this to <Text className="font-semibold text-fg">{target?.name}</Text>. When they next sign in, they confirm their Gmail or mobile number
                  with a code, then choose their own password.
                </Text>
                <View className="rounded-xl border border-edge bg-surface-subtle px-4 py-4">
                  <Text selectable={false} accessibilityLabel="Temporary password" className="text-center font-mono text-lg tracking-wider text-fg">
                    {password}
                  </Text>
                </View>
              </View>
              <View accessibilityRole="alert" className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
                <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
                <Text className="min-w-0 flex-1 text-sm text-warning-strong">
                  This is shown once. It is not stored anywhere in readable form and cannot be looked up again — if you close this without passing it on, set
                  another one. It is also cleared if you leave the app.
                </Text>
              </View>
              <Button variant="primary" full onPress={close}>
                Done — I have given it to them
              </Button>
            </>
          ) : (
            <>
              <View className={`${cardClass} gap-3 p-4`}>
                <Text className="text-sm text-fg-body">
                  Set a temporary password for <Text className="font-semibold text-fg">{target?.name}</Text>?
                </Text>
                <Text className="text-sm text-fg-muted">
                  Their current password stops working immediately and they are signed out everywhere. The new one is shown once, on the next screen, and they
                  must choose their own before they can use the portal again. This cannot be undone.
                </Text>
              </View>
              {/* The label still changes while the write is in flight; `loading`
                  is the old `disabled={saving}` plus its spinner. */}
              <View className="flex-row flex-wrap justify-end gap-2">
                <Button onPress={close} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={submit} loading={saving}>
                  {saving ? 'Setting…' : 'Yes, set a temporary password'}
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
