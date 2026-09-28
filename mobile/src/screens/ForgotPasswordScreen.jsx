import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import FormStatus, { ok, fail } from '../components/FormStatus';
import FormField from '../components/FormField';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import Seal from '../components/Seal';
import { useTheme } from '../theme/ThemeProvider';

// Self-service password reset — the web's ForgotPassword (R2), two steps in
// ONE screen: POST /auth/forgot-password then POST /auth/reset-password.
//
// ONE SCREEN AND NOT TWO, for the web's reason made sharper on a phone: the
// login id typed in step one must reach step two, and a navigation param is
// the phone's URL — a parent's login_id IS their child's LRN (§5c). Component
// state is the only honest carrier.
//
// THE RESPONSE TO STEP ONE IS THE SAME WHATEVER HAPPENS, and this screen does
// not undo that: 202 with one sentence for every case, the step advances on
// it, no branch on whether a code really went out. Step two's failure is
// equally flat and carries no count of tries. Do not add one.
export default function ForgotPasswordScreen({ navigation }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState('request');
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ next: false, confirm: false });
  const [newError, setNewError] = useState(null);
  const [sentNotice, setSentNotice] = useState('');
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmError(newPassword, confirmPassword);
  const resetReady = /^\d{6}$/.test(code) && passwordFormReady(newPassword, confirmPassword);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function requestCode() {
    if (!loginId.trim() || submitting) return;
    setStatus(null);
    setSubmitting(true);
    try {
      const message = await api.post('/auth/forgot-password', { login_id: loginId.trim() }, { unwrap: 'message' });
      setSentNotice(message);
      setStep('reset');
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset() {
    if (!resetReady || submitting) return;
    setStatus(null);
    setNewError(null);
    setSubmitting(true);
    try {
      await api.post(
        '/auth/reset-password',
        { login_id: loginId.trim(), code: code.trim(), new_password: newPassword },
        { unwrap: 'message' }
      );
      // popTo, not navigate: React Navigation 7 pushes a second Login from
      // here (M16, fix/mobile-popto).
      navigation.popTo('Login');
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'new_password') setNewError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  const buttonClass = (disabled) =>
    `flex-row items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 ${disabled ? 'opacity-60' : ''}`;

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
          <Text className="text-lg font-semibold text-fg">Reset your password</Text>
        </View>

        <View className="rounded-2xl border border-edge bg-surface p-6">
          {step === 'request' ? (
            <View className="gap-4">
              <Text className="text-sm text-fg-muted">
                Enter your Login ID. If the account has a confirmed email address, we will send a six-digit code to it.
              </Text>
              <FormField
                label="Login ID"
                hint="Parents: use your child's LRN. Teachers and staff: your assigned ID."
                required
                value={loginId}
                onChangeText={setLoginId}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="send"
                onSubmitEditing={requestCode}
              />
              <Pressable
                onPress={requestCode}
                disabled={submitting || !loginId.trim()}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting || !loginId.trim(), busy: submitting }}
                className={buttonClass(submitting || !loginId.trim())}
              >
                {submitting ? <ActivityIndicator size="small" color={tokens['primary-fg']} /> : null}
                <Text className="text-sm font-medium text-primary-fg">{submitting ? 'Sending…' : 'Send code'}</Text>
              </Pressable>
              <FormStatus status={status} />
            </View>
          ) : (
            <View className="gap-4">
              <FormStatus status={ok(sentNotice)} />
              <Text className="text-sm text-fg-muted">
                The code is good for a short time and can be used once. Enter it with your new password.
              </Text>
              <FormField
                label="Six-digit code"
                required
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
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
                disabled={submitting}
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
                disabled={submitting}
              />
              <Pressable
                onPress={submitReset}
                disabled={submitting || !resetReady}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting || !resetReady, busy: submitting }}
                className={buttonClass(submitting || !resetReady)}
              >
                {submitting ? <ActivityIndicator size="small" color={tokens['primary-fg']} /> : null}
                <Text className="text-sm font-medium text-primary-fg">{submitting ? 'Saving…' : 'Set new password'}</Text>
              </Pressable>
              <FormStatus status={status} />
              <Pressable
                onPress={() => {
                  setStep('request');
                  setCode('');
                  setStatus(null);
                  setNewError(null);
                }}
                accessibilityRole="button"
                className="self-start"
              >
                <Text className="text-sm font-medium text-brand">Use a different Login ID</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable onPress={() => navigation.popTo('Login')} accessibilityRole="link" className="mt-5 items-center">
          <Text className="text-sm font-medium text-brand">Back to sign in</Text>
        </Pressable>

        <Text className="mt-2 text-center text-sm text-fg-muted">
          No email on your account? Ask your child’s adviser or the school office.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
