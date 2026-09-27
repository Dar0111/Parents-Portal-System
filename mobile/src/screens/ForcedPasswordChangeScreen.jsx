import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import FormStatus, { fail } from '../components/FormStatus';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import Seal from '../components/Seal';
import { useTheme } from '../theme/ThemeProvider';

// The forced password change (R2). RootNavigator renders ONLY this screen
// while `user.must_change_password` is set — routed on the FIELD from
// /auth/me, never on the 403 (§11). No drawer, no other route: a nav full of
// links the server would refuse is an interface that lies.
//
// THE REPLACEMENT TOKEN IS THE WHOLE EXIT. The write bumps token_version,
// which kills the token this screen is holding; applyToken stores the
// replacement and re-reads /auth/me, and the flag coming back as 0 from the
// SERVER — never assumed locally — is what makes RootNavigator route away.
export default function ForcedPasswordChangeScreen() {
  const { user, logout, applyToken } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ current: false, next: false, confirm: false });
  const [currentError, setCurrentError] = useState(null);
  const [newError, setNewError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const currentRef = useRef(null);

  const mismatch = confirmError(newPassword, confirmPassword);
  const ready = Boolean(currentPassword) && passwordFormReady(newPassword, confirmPassword);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit() {
    if (!ready || saving) return;
    setStatus(null);
    setCurrentError(null);
    setNewError(null);
    setSaving(true);
    try {
      const { token } = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: ['message', 'token'] }
      );
      await applyToken(token);
      // No navigate: the re-read /auth/me clears the flag and RootNavigator
      // renders the role home.
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'current_password') {
        setCurrentError(extractError(err));
        currentRef.current?.focus();
      } else if (field === 'new_password') {
        setNewError(extractError(err));
      } else {
        setStatus(fail(extractError(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow justify-center px-4 pb-10"
        contentContainerStyle={{ paddingTop: insets.top + 40 }}
      >
        <View className="mb-6 items-center">
          <View className="mb-4">
            <Seal size={72} />
          </View>
          <Text className="text-lg font-semibold text-fg">Choose a new password</Text>
          <Text className="mt-1 text-center text-sm text-fg-muted">
            {user?.name}, the school gave this account a temporary password. Pick your own before you continue.
          </Text>
        </View>

        <View className="rounded-2xl border border-edge bg-surface p-6">
          <View className="gap-4">
            <PasswordField
              label="Temporary password"
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentError(null);
                setCurrentPassword(text);
              }}
              autoComplete="current-password"
              revealed={revealed.current}
              onToggleReveal={() => toggleRevealed('current')}
              error={currentError}
              inputRef={currentRef}
              disabled={saving}
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChangeText={(text) => {
                setNewError(null);
                setNewPassword(text);
              }}
              autoComplete="new-password"
              revealed={revealed.next}
              onToggleReveal={() => toggleRevealed('next')}
              error={newError}
              disabled={saving}
              below={<PasswordChecklist value={newPassword} />}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoComplete="new-password"
              revealed={revealed.confirm}
              onToggleReveal={() => toggleRevealed('confirm')}
              error={mismatch}
              disabled={saving}
            />
            {/* No confirmation step (§5e): the account cannot do anything else
                until this is done. */}
            <Pressable
              onPress={submit}
              disabled={saving || !ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving || !ready, busy: saving }}
              className={`flex-row items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 ${saving || !ready ? 'opacity-60' : ''}`}
            >
              {saving ? <ActivityIndicator size="small" color={tokens['primary-fg']} /> : null}
              <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : 'Save and continue'}</Text>
            </Pressable>
            <FormStatus status={status} />
          </View>
        </View>

        {/* The one way off this screen, and it changes nothing: logout is
            client-side only, so the flag is still set at the next sign-in. */}
        <Pressable onPress={logout} accessibilityRole="button" className="mt-5 items-center">
          <Text className="text-sm font-medium text-brand">Sign out instead</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
