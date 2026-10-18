import { useCallback, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import {
  RESEND_COOLDOWN_SECONDS,
  contactCopy,
  defaultChannel,
  formatCountdown,
  sentToLine,
  spacedNumber,
} from '../auth/accountSteps';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import { cardClass } from '../components/buttonStyles';
import ContactCodeForm from '../components/ContactCodeForm';
import FormField from '../components/FormField';
import FormStatus, { fail } from '../components/FormStatus';
import ScreenStatusBar from '../components/ScreenStatusBar';
import Seal from '../components/Seal';
import Segmented from '../components/Segmented';
import Text from '../components/Text';
import { contactError, normalizeContact } from '../format/contactRule';
import useCooldown from '../hooks/useCooldown';
import Reveal from '../motion/Reveal';
import { useTheme } from '../theme/ThemeProvider';

// THE CONTACT STEP on the phone (feat/first-signin, 2026-10-18; MOBILE M26) —
// the twin of the web's pages/ConfirmContact.jsx, with the same mirrored words
// (auth/accountSteps.js). RootNavigator mounts ONLY this screen while
// /auth/me says `contact_pending` and consent is done — routed on the field,
// never on the CONTACT_VERIFICATION_REQUIRED 403 (§11).
//
// No Back and no Skip. THE ANDROID BACK BUTTON IS CONSUMED while this screen
// is focused (the owner's scope item 2): it is the only screen mounted, so the
// default would close the app off the step. Sign out is the one way off, and
// it changes nothing — the step is still due at the next sign-in.
//
// A value already on the account shows read-only with "Change"; a new one is
// saved first (PUT /auth/email or /auth/contact — each unconfirms what it
// changed), then the verify request sends the code. The 60-second resend
// clock is the server's; this screen counts it per channel.
//
// THE FRAME IS THE SIGN-IN FAMILY'S, as on ForcedPasswordChangeScreen.
const AUTH_CARD = cardClass.replace('rounded-2xl', 'rounded-3xl');
const BAND_CORNERS = { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 };

const CHANNELS = [
  { key: 'email', label: 'Gmail' },
  { key: 'mobile', label: 'Mobile number' },
];

function storedValue(user, channel) {
  return (channel === 'email' ? user?.email : user?.contact_number) || '';
}

export default function ConfirmContactScreen() {
  const { user, logout, refresh } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  const copy = contactCopy(user);
  const [channel, setChannel] = useState(() => defaultChannel(user));
  const [drafts, setDrafts] = useState(() => ({ email: user?.email || '', mobile: user?.contact_number || '' }));
  const [editing, setEditing] = useState(() => ({ email: !user?.email, mobile: !user?.contact_number }));
  const [phase, setPhase] = useState('enter');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const emailClock = useCooldown();
  const mobileClock = useCooldown();
  const clock = channel === 'email' ? emailClock : mobileClock;

  const stored = storedValue(user, channel);
  const draft = drafts[channel];
  const showInput = editing[channel] || !stored;
  const label = channel === 'email' ? 'Gmail' : 'Mobile number';

  function pick(next) {
    setChannel(next);
    setFieldError(null);
    setStatus(null);
  }

  function change() {
    setPhase('enter');
    setEditing((prev) => ({ ...prev, [channel]: true }));
    setCode('');
    setCodeError(null);
    setStatus(null);
  }

  async function sendCode() {
    if (busy || clock.remaining > 0) return;
    setStatus(null);
    setFieldError(null);
    setCodeError(null);
    const value = (showInput ? draft : stored).trim();
    if (!value) {
      setFieldError(channel === 'email' ? 'Enter your email address.' : 'Enter your mobile number.');
      return;
    }
    if (channel === 'mobile') {
      const problem = contactError(value);
      if (problem) {
        setFieldError(problem);
        return;
      }
    }
    const target = channel === 'mobile' ? normalizeContact(value) : value;
    setBusy(true);
    try {
      if (target !== stored) {
        if (channel === 'email') await api.put('/auth/email', { email: value }, { unwrap: 'user' });
        else await api.put('/auth/contact', { contact_number: value }, { unwrap: 'user' });
        await refresh();
        setEditing((prev) => ({ ...prev, [channel]: false }));
      }
      const path = channel === 'email' ? '/auth/verify-email/request' : '/auth/verify-contact/request';
      const message = await api.post(path, {}, { unwrap: 'message' });
      // The already-confirmed 200 sent nothing — the step may simply be done;
      // the re-read lets RootNavigator move on.
      if (/already confirmed/i.test(message)) {
        await refresh();
        return;
      }
      setSentTo(target);
      setCode('');
      setPhase('code');
      clock.start(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.field === 'email' || data?.field === 'contact_number') {
        setFieldError(extractError(err));
      } else {
        if (err?.response?.status === 429 && Number(data?.retry_after) > 0) clock.start(Number(data.retry_after));
        setStatus(fail(extractError(err)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code) || busy) return;
    setStatus(null);
    setCodeError(null);
    setBusy(true);
    try {
      const path = channel === 'email' ? '/auth/verify-email/confirm' : '/auth/verify-contact/confirm';
      await api.post(path, { code }, { unwrap: 'message' });
      // No navigate: the re-read clears `contact_pending` and RootNavigator
      // mounts the next step (the new password) or the app.
      await refresh();
    } catch (err) {
      setCodeError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScreenStatusBar color={tokens['brand-panel']} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow">
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
              <View className="mb-5">
                <Text accessibilityRole="header" className="font-serif text-xl text-fg">
                  {copy.title}
                </Text>
                <Text className="mt-2 text-sm text-fg-muted">{copy.intro}</Text>
              </View>

              {phase === 'enter' ? (
                <View className="gap-4">
                  <Segmented options={CHANNELS} value={channel} onChange={pick} label="Where to send the code" />
                  {showInput ? (
                    <FormField
                      key={channel}
                      label={label}
                      value={draft}
                      onChangeText={(text) => {
                        setFieldError(null);
                        setDrafts((prev) => ({ ...prev, [channel]: text }));
                      }}
                      keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                      autoComplete={channel === 'email' ? 'email' : 'tel'}
                      textContentType={channel === 'email' ? 'emailAddress' : 'telephoneNumber'}
                      autoCapitalize="none"
                      autoCorrect={false}
                      hint={
                        channel === 'email'
                          ? 'Use an address you can open now — a Gmail works.'
                          : 'A Philippine mobile number, for example 0917 123 4567.'
                      }
                      error={fieldError}
                      editable={!busy}
                    />
                  ) : (
                    <View className="rounded-lg border border-edge bg-surface-subtle px-4 py-3">
                      <Text className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</Text>
                      <View className="mt-1 flex-row flex-wrap items-center justify-between gap-2">
                        <Text className="min-w-0 flex-shrink text-sm text-fg">{channel === 'mobile' ? spacedNumber(stored) : stored}</Text>
                        <Pressable
                          onPress={() => setEditing((prev) => ({ ...prev, [channel]: true }))}
                          accessibilityRole="button"
                          disabled={busy}
                          className="justify-center"
                          style={{ minHeight: 48 }}
                        >
                          <Text className="text-sm font-semibold text-brand">Change</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Button variant="primary" size="lg" full loading={busy} disabled={busy || clock.remaining > 0} onPress={sendCode}>
                    {busy ? 'Sending…' : clock.remaining > 0 ? `Send code in ${formatCountdown(clock.remaining)}` : 'Send code'}
                  </Button>
                  <FormStatus status={status} />
                </View>
              ) : (
                <View className="gap-4">
                  <View className="flex-row flex-wrap items-center gap-x-2">
                    <Text className="min-w-0 flex-shrink text-sm text-fg-body">{sentToLine(channel, sentTo)}</Text>
                    <Pressable onPress={change} accessibilityRole="button" disabled={busy} className="justify-center" style={{ minHeight: 48 }}>
                      <Text className="text-sm font-semibold text-brand">Change</Text>
                    </Pressable>
                  </View>
                  <ContactCodeForm
                    code={code}
                    onCodeChange={(next) => {
                      setCodeError(null);
                      setCode(next);
                    }}
                    error={codeError}
                    hint="It expires in 10 minutes and can be used once."
                    busy={busy}
                    onSubmit={confirm}
                    onResend={sendCode}
                    remaining={clock.remaining}
                    size="lg"
                    full
                  />
                  <FormStatus status={status} />
                </View>
              )}
            </View>
          </Reveal>

          {/* The one way off this step, and it changes nothing. 48dp tall (M19). */}
          <View className="mt-2 items-center">
            <Pressable onPress={logout} accessibilityRole="button" className="flex-row items-center" style={{ minHeight: 48 }}>
              <Text className="text-sm font-semibold text-brand">Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
