import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { RESEND_COOLDOWN_SECONDS, resendLabel } from '../auth/accountSteps';
import Button from '../components/Button';
import { cardClass } from '../components/buttonStyles';
import FormStatus, { ok, fail } from '../components/FormStatus';
import FormField from '../components/FormField';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import ScreenStatusBar from '../components/ScreenStatusBar';
import Seal from '../components/Seal';
import Text from '../components/Text';
import useCooldown from '../hooks/useCooldown';
import Icon from '../icons';
import Reveal from '../motion/Reveal';
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
//
// THE FRAME IS THE SIGN-IN FAMILY'S (feat/ui-refresh, 2026-10-02): Login's
// brand band made compact — the seal on its disc beside the wordmark — and
// one card overlapping its bottom edge (`-mt-12` against `pb-16`, never
// absolute positioning: the card's height changes with the step). The
// screen's title is the card's, in the title face; the submit is the shared
// `Button` at Login's size. The card stays mounted across the two steps, so
// its entrance never replays.
//
// A screen that is only a write form has no pull-to-refresh.
//
// RESEND, ON A 60-SECOND CLOCK (feat/first-signin, 2026-10-18), as on the web:
// started on EVERY 202 alike — the server is silent inside the minute — so it
// never depends on whether a code really went out.

// The card surface with the sign-in family's larger corner (see LoginScreen).
const AUTH_CARD = cardClass.replace('rounded-2xl', 'rounded-3xl');

const BAND_CORNERS = { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 };

export default function ForgotPasswordScreen({ navigation }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const clock = useCooldown();

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
      clock.start(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  // The same request again, for the same Login ID — and the same reply.
  async function resend() {
    if (clock.remaining > 0 || submitting) return;
    setStatus(null);
    setSubmitting(true);
    try {
      const message = await api.post('/auth/forgot-password', { login_id: loginId.trim() }, { unwrap: 'message' });
      setSentNotice(message);
      clock.start(RESEND_COOLDOWN_SECONDS);
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
      const message = await api.post(
        '/auth/reset-password',
        { login_id: loginId.trim(), code: code.trim(), new_password: newPassword },
        { unwrap: 'message' }
      );
      // popTo, not navigate: React Navigation 7 pushes a second Login from
      // here (M16, fix/mobile-popto). The server's own sentence goes with it
      // and Login shows it once (fix/smoke-round, F6) — it used to arrive
      // there with no word that the reset had worked.
      navigation.popTo('Login', { notice: message });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'new_password') setNewError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      {/* The status bar takes the band's colour while focused, as on Login. */}
      <ScreenStatusBar color={tokens['brand-panel']} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow">
        {/* The halo's ring colour is the brand panel's, so the seal carries
            it here, on the band, as it does on Login. */}
        <View className="bg-brand-panel px-6 pb-16" style={{ paddingTop: insets.top + 24, ...BAND_CORNERS }}>
          <Reveal>
            <View className="flex-row items-center justify-center gap-3">
              <Seal size={44} halo />
              <Text className="font-serif text-lg text-brand-panel-fg">Parent’s Portal</Text>
            </View>
          </Reveal>
        </View>

        <View className="-mt-12 w-full flex-1 px-4 pb-10">
          <Reveal index={1}>
            <View className={`${AUTH_CARD} p-5`}>
              <Text accessibilityRole="header" className="mb-4 font-serif text-xl text-fg">
                Reset your password
              </Text>
              {step === 'request' ? (
                <View className="gap-4">
                  <Text className="text-sm text-fg-muted">
                    Enter your Login ID. If the account has a confirmed email address or mobile number, we will send a six-digit code to it.
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
                  <Button
                    variant="primary"
                    size="lg"
                    full
                    loading={submitting}
                    disabled={!loginId.trim()}
                    onPress={requestCode}
                  >
                    {submitting ? 'Sending…' : 'Send code'}
                  </Button>
                  <FormStatus status={status} />
                </View>
              ) : (
                <View className="gap-4">
                  {/* The server's uniform sentence, not a claim that a code
                      is in a particular inbox. */}
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
                  <Button
                    variant="primary"
                    size="lg"
                    full
                    loading={submitting}
                    disabled={!resetReady}
                    onPress={submitReset}
                  >
                    {submitting ? 'Saving…' : 'Set new password'}
                  </Button>
                  <Button size="lg" full disabled={submitting || clock.remaining > 0} onPress={resend}>
                    {resendLabel(clock.remaining)}
                  </Button>
                  <FormStatus status={status} />
                  {/* A text button, centred under the submit and 44dp tall —
                      the quiet way back to step one, never a second filled
                      button. */}
                  <View className="items-center">
                    <Pressable
                      onPress={() => {
                        setStep('request');
                        setCode('');
                        setStatus(null);
                        setNewError(null);
                      }}
                      accessibilityRole="button"
                      className="flex-row items-center"
                      style={{ minHeight: 44 }}
                    >
                      <Text className="text-sm font-semibold text-brand">Use a different Login ID</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </Reveal>

          <View className="mt-2 items-center">
            <Pressable
              onPress={() => navigation.popTo('Login')}
              accessibilityRole="link"
              className="flex-row items-center gap-2"
              style={{ minHeight: 48 }}
            >
              <Icon name="fa-arrow-left" size={11} color={tokens.brand} />
              <Text className="text-sm font-semibold text-brand">Back to sign in</Text>
            </Pressable>
          </View>

          {/* The fallback, and the whole reason the admin temporary password
              exists: an account with no confirmed email or mobile number
              cannot be reset here, and gets no hint that it is the reason —
              that would be the oracle again. The office is the answer either
              way. */}
          <Text className="text-center text-sm text-fg-muted">
            No confirmed email or mobile number on your account? Ask your child’s adviser or the school office.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
