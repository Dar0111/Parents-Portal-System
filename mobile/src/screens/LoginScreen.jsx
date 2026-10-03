import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import { takeLogoutReason } from '../auth/tokenStore';
import Button from '../components/Button';
import { cardClass } from '../components/buttonStyles';
import FormField, { controlClassFor } from '../components/FormField';
import PasswordField from '../components/PasswordField';
import Seal from '../components/Seal';
import Text from '../components/Text';
import Icon from '../icons';
import Reveal from '../motion/Reveal';
import { DevLink } from './dev/ConnectionScreen';
import { useTheme } from '../theme/ThemeProvider';

// THE SIGN-IN SCREEN — the web's Login (client/src/pages/Login.jsx) at phone
// width, redrawn for feat/ui-refresh (2026-10-02): the brand band across the
// top with the seal on its disc, the wordmark in the title face and the
// school name; the form in one card that overlaps the band's bottom edge; the
// two fields from the primitives and the shared `Button` as the one filled
// action. The desktop panel's furniture (the district line, "Est. 1961") is
// the web's `hidden lg:block` and does not exist at 390px there either.
//
// THE OVERLAP IS `-mt-12` ON THE FORM COLUMN AGAINST `pb-16` ON THE BAND, as
// on the web, never absolute positioning: the card's height changes when the
// error box appears. Subtracting less than the band's bottom padding leaves a
// strip of the band beside the card, which is what makes the overlap read as
// deliberate. The band's two bottom corners are rounded through a plain style
// object (BAND_CORNERS), the same way every dp figure here is set.
//
// THE PANEL'S SCHOOL NAME IS THE SETTING, with the fallback carrying "– Main"
// (fix/polish, 2026-09-26). `GET /settings/public` is the one unauthenticated
// settings read; until it answers, or if it never does, the fallback is the
// copy — no error state, nothing to retry, and so no pull-to-refresh either.
//
// A REFUSED SIGN-IN IS THE SERVER'S SENTENCE, verbatim: wrong credentials
// (401), a pending / rejected account (403 + status), and — when no response
// came at all — extractError's offline sentence, so a dead API is never read
// as a wrong password. The 401 here does NOT end a session: api/client.js
// exempts /auth/login.
//
// THE LOGOUT REASON IS READ ONCE, in the state initialiser, and cleared by
// that read (tokenStore.takeLogoutReason) — a manual sign-out stores nothing,
// so it shows nothing.
//
// MOTION: one staged entrance — the band's content, then the card a beat
// later. Nothing else moves.
const SCHOOL_NAME_FALLBACK = 'Captain H. Francisco Elementary School – Main';

// The card surface with the sign-in family's larger corner. Swapped in the
// string rather than appended, so which radius wins never depends on the
// order two classes are emitted in.
const AUTH_CARD = cardClass.replace('rounded-2xl', 'rounded-3xl');

const BAND_CORNERS = { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 };

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [schoolName, setSchoolName] = useState(SCHOOL_NAME_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings/public', { unwrap: 'settings' })
      .then((settings) => {
        if (!cancelled && settings?.school_name) setSchoolName(settings.school_name);
      })
      .catch(() => {
        // The fallback is already on screen; a failed read changes nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(() => takeLogoutReason());
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await login(loginId.trim(), password);
      // No navigate: RootNavigator swaps to the signed-in stack on `user`.
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow">
        <View className="bg-brand-panel px-6 pb-16" style={{ paddingTop: insets.top + 32, ...BAND_CORNERS }}>
          <Reveal>
            <View className="items-center">
              <View className="mb-5">
                <Seal size={96} halo />
              </View>
              {/* The title face is a family of its own: never beside a weight
                  class (tailwind.config.js). */}
              <Text accessibilityRole="header" className="text-center font-serif text-2xl text-brand-panel-fg">
                Parent’s Portal
              </Text>
              <Text className="mt-2 text-center text-sm text-brand-panel-muted">{schoolName}</Text>
            </View>
          </Reveal>
        </View>

        <View className="-mt-12 w-full flex-1 px-4 pb-10">
          <Reveal index={1}>
            <View className={`${AUTH_CARD} p-5`}>
              <View className="mb-5">
                <Text accessibilityRole="header" className="font-serif text-xl text-fg">
                  Welcome back
                </Text>
                <Text className="mt-1 text-sm text-fg-muted">Sign in to continue.</Text>
              </View>

              <View className="gap-4">
                <FormField
                  label="Login ID"
                  hint="Parents: use your child's LRN. Teachers and staff: your assigned ID."
                  required
                  render={({ invalid }) => (
                    <View className="relative">
                      <View pointerEvents="none" className="absolute inset-y-0 left-0 z-10 w-10 items-center justify-center">
                        <Icon name="fa-user" size={15} color={tokens['fg-faint']} />
                      </View>
                      <TextInput
                        accessibilityLabel="Login ID"
                        value={loginId}
                        onChangeText={setLoginId}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        textContentType="username"
                        returnKeyType="next"
                        placeholderTextColor={tokens['fg-muted']}
                        className={`${controlClassFor(invalid)} pl-10`}
                      />
                    </View>
                  )}
                />

                <PasswordField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  autoComplete="current-password"
                  required
                  leadingIcon="fa-lock"
                  revealed={revealed}
                  onToggleReveal={() => setRevealed((r) => !r)}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                />

                {/* The refusal, directly above the button that caused it
                    (§7c), in the danger tone's checked pair. NOT ErrorAlert:
                    that carries an icon and a retry that do not belong on a
                    sign-in card. The box is a View because a border and a
                    corner belong on a View; the alert role stays on the
                    sentence, which is also a live region so it is announced
                    when it appears. */}
                {error ? (
                  <View className="rounded-xl border border-danger-edge bg-danger-soft px-4 py-3">
                    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-sm text-danger-strong">
                      {error}
                    </Text>
                  </View>
                ) : null}

                {/* `loading` disables the button and shows the spinner; the
                    label still changes while busy, as it always has. */}
                <Button variant="primary" size="lg" full loading={submitting} onPress={handleSubmit}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </View>

              {/* The link is its own 44dp line with the sentence under it, as
                  on the web: inline in the sentence it was one line of text
                  for a finger. The web's sentence (f4): a code goes to a
                  confirmed email OR mobile number, and it names no account's
                  state (§11). */}
              <View className="mt-4">
                <Pressable
                  onPress={() => navigation.navigate('ForgotPassword')}
                  accessibilityRole="link"
                  className="flex-row items-center self-start"
                  style={{ minHeight: 44 }}
                >
                  <Text className="text-sm font-semibold text-brand">Forgot your password?</Text>
                </Pressable>
                <Text className="text-sm text-fg-muted">{"We'll send a code to your confirmed email or mobile number."}</Text>
              </View>
            </View>
          </Reveal>

          {/* The school's details and the DepEd VMV, signed out (pre-Stage-5
              #5a): a parent looking for the office phone should not need an
              account to find it. BELOW the card, as on the web, and a 48dp
              target (a plain style object in dp — M19, M20). */}
          <View className="mt-4 items-center">
            <Pressable
              onPress={() => navigation.navigate('About', { publicView: true })}
              accessibilityRole="link"
              android_ripple={{ color: tokens['edge-strong'] }}
              className="flex-row items-center justify-center gap-2 overflow-hidden rounded-xl px-4"
              style={{ minHeight: 48 }}
            >
              <Icon name="fa-circle-info" size={13} color={tokens['fg-muted']} />
              <Text className="text-sm font-semibold text-fg-muted">About the school</Text>
            </Pressable>
          </View>

          {/* DEV ONLY — src/screens/dev/ is an empty module in a production
              bundle (metro.config.js), so `DevLink` is undefined there and
              nothing renders. The /dev/ui rule, at the resolver. */}
          {DevLink ? <DevLink navigation={navigation} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
