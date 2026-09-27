import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import { takeLogoutReason } from '../auth/tokenStore';
import FormField, { controlClassFor } from '../components/FormField';
import PasswordField from '../components/PasswordField';
import Seal from '../components/Seal';
import Icon from '../icons';
import { DevLink } from './dev/ConnectionScreen';
import { useTheme } from '../theme/ThemeProvider';

// THE SIGN-IN SCREEN — the web's Login (client/src/pages/Login.jsx) at phone
// width: the brand band across the top with the seal on its disc and the
// school name, the card overlapping the band's bottom edge, the two fields
// from the primitives. The desktop panel's furniture (the district line,
// "Est. 1961") is the web's `hidden lg:block` and does not exist at 390px
// there either.
//
// THE PANEL'S SCHOOL NAME IS THE SETTING, with the fallback carrying "– Main"
// (fix/polish, 2026-09-26). `GET /settings/public` is the one unauthenticated
// settings read; until it answers, or if it never does, the fallback is the
// copy — no error state, nothing to retry.
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
const SCHOOL_NAME_FALLBACK = 'Captain H. Francisco Elementary School – Main';

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
        <View className="items-center bg-brand-panel px-6 pb-16" style={{ paddingTop: insets.top + 32 }}>
          <View className="mb-5">
            <Seal size={96} halo />
          </View>
          <Text className="text-2xl font-semibold text-brand-panel-fg">Parent’s Portal</Text>
          <Text className="mt-2 text-center text-sm text-brand-panel-muted">{schoolName}</Text>
        </View>

        <View className="-mt-12 w-full flex-1 px-4 pb-10">
          <View className="rounded-2xl border border-edge bg-surface p-6">
            <View className="mb-6">
              <Text className="text-lg font-semibold text-fg">Welcome back</Text>
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

              {error ? (
                <Text accessibilityRole="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                className={`flex-row items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 ${submitting ? 'opacity-60' : ''}`}
              >
                {submitting ? <ActivityIndicator size="small" color={tokens['primary-fg']} /> : null}
                <Text className="text-sm font-medium text-primary-fg">{submitting ? 'Signing in…' : 'Sign in'}</Text>
                {submitting ? null : <Icon name="fa-arrow-right" size={11} color={tokens['primary-fg']} />}
              </Pressable>
            </View>

            <Text className="mt-5 text-sm text-fg-muted">
              <Text
                accessibilityRole="link"
                onPress={() => navigation.navigate('ForgotPassword')}
                className="font-medium text-brand"
              >
                Forgot your password?
              </Text>{' '}
              No email on your account? Ask the school office.
            </Text>
          </View>

          {/* The school's details and the DepEd VMV, signed out (pre-Stage-5
              #5a): a parent looking for the office phone should not need an
              account to find it. BELOW the card, as on the web. */}
          <Pressable
            onPress={() => navigation.navigate('About', { publicView: true })}
            accessibilityRole="link"
            className="mt-4 flex-row items-center justify-center gap-2"
          >
            <Icon name="fa-circle-info" size={13} color={tokens['fg-muted']} />
            <Text className="text-sm font-medium text-fg-muted">About the school</Text>
          </Pressable>

          {/* DEV ONLY — src/screens/dev/ is an empty module in a production
              bundle (metro.config.js), so `DevLink` is undefined there and
              nothing renders. The /dev/ui rule, at the resolver. */}
          {DevLink ? <DevLink navigation={navigation} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
