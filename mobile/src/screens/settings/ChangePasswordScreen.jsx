import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import PasswordField from '../../components/PasswordField';
import { useTheme } from '../../theme/ThemeProvider';

// The web's Change password section. THE CONFIRMATION IS A NATIVE Alert
// naming the decision back (§5e: a password change has no undo), with the
// web's exact sentence. THE REPLACEMENT TOKEN IS STORED BEFORE /me IS
// RE-READ (applyToken) — R1 bumps token_version on this write, so a caller
// that dropped the token would sign its own user out on the success path.
export default function ChangePasswordScreen() {
  const { applyToken } = useAuth();
  const { tokens } = useTheme();
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

  function requestChange() {
    if (!ready || saving) return;
    setStatus(null);
    setCurrentError(null);
    setNewError(null);
    Alert.alert(
      'Change your password?',
      'You will stay logged in on this device. Use the new password the next time you log in.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Yes, change password', onPress: save },
      ]
    );
  }

  async function save() {
    setSaving(true);
    try {
      const { message, token } = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: ['message', 'token'] }
      );
      await applyToken(token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRevealed({ current: false, next: false, confirm: false });
      setStatus(ok(message));
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'current_password') {
        setCurrentError(extractError(err));
        setTimeout(() => currentRef.current?.focus(), 0);
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-4">
        <Text className="text-base font-semibold text-fg">Change password</Text>
        <Text className="mt-1 text-sm text-fg-muted">
          You will stay logged in on this device. Use the new password the next time you log in.
        </Text>

        <View className="mt-6 gap-3">
          <PasswordField
            label="Current password"
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
          <Pressable
            onPress={requestChange}
            disabled={saving || !ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !ready, busy: saving }}
            className={`items-center rounded-lg bg-primary px-4 py-3 ${saving || !ready ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg" style={{ color: tokens['primary-fg'] }}>
              {saving ? 'Saving…' : 'Change password'}
            </Text>
          </Pressable>
          <FormStatus status={status} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
