import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import { cardClass } from '../components/buttonStyles';
import FormStatus, { fail } from '../components/FormStatus';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import ScreenStatusBar from '../components/ScreenStatusBar';
import Seal from '../components/Seal';
import Text from '../components/Text';
import Reveal from '../motion/Reveal';
import { useTheme } from '../theme/ThemeProvider';

// THE NEW PASSWORD — the last of the three steps before the app (R2; rebuilt
// for feat/first-signin, 2026-10-18; MOBILE M26). RootNavigator renders ONLY
// this screen while nextStep() says 'password' — consent and the contact are
// done, `must_change_password` is still set — routed on the fields from
// /auth/me, never on the 403 (§11). No drawer, no other route: a nav full of
// links the server would refuse is an interface that lies.
//
// NO "TEMPORARY PASSWORD" FIELD ANY MORE (the owner's scope item 2): it was
// typed at sign-in, and the contact step confirmed a code in THIS session.
// PUT /auth/first-password takes the new password alone and refuses it
// unless both are true (server/routes/auth.js has the guard).
//
// THE REPLACEMENT TOKEN IS THE WHOLE EXIT. The write bumps token_version,
// which kills the token this screen is holding; applyToken stores the
// replacement and re-reads /auth/me, and the flag coming back as 0 from the
// SERVER — never assumed locally — is what makes RootNavigator route away.
//
// THE FRAME IS THE SIGN-IN FAMILY'S (feat/ui-refresh, 2026-10-02), the same
// as ForgotPasswordScreen: Login's brand band made compact — the seal beside
// the wordmark — and one card overlapping its bottom edge. A screen that is
// only a write form has no pull-to-refresh.

// The card surface with the sign-in family's larger corner (see LoginScreen).
const AUTH_CARD = cardClass.replace('rounded-2xl', 'rounded-3xl');

const BAND_CORNERS = { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 };

export default function ForcedPasswordChangeScreen() {
  const { user, logout, applyToken } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ next: false, confirm: false });
  const [newError, setNewError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const mismatch = confirmError(newPassword, confirmPassword);
  const ready = passwordFormReady(newPassword, confirmPassword);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit() {
    if (!ready || saving) return;
    setStatus(null);
    setNewError(null);
    setSaving(true);
    try {
      const { token } = await api.put('/auth/first-password', { new_password: newPassword }, { unwrap: ['message', 'token'] });
      await applyToken(token);
      // No navigate: the re-read /auth/me clears the flag and RootNavigator
      // renders the role home.
    } catch (err) {
      if (err?.response?.data?.field === 'new_password') setNewError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      {/* The status bar takes the band's colour while focused, as on Login. */}
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
                  Set a new password
                </Text>
                <Text className="mt-2 text-sm text-fg-muted">
                  {user?.name}, choose your own password to finish signing in. The one you signed in with stops working.
                </Text>
              </View>

              <View className="gap-4">
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
                <Button variant="primary" size="lg" full loading={saving} disabled={!ready} onPress={submit}>
                  {saving ? 'Saving…' : 'Save password'}
                </Button>
                <FormStatus status={status} />
              </View>
            </View>
          </Reveal>

          {/* The one way off this screen, and it changes nothing: logout is
              client-side only, so the step is still due at the next sign-in.
              A text button, 48dp tall (a plain style object in dp — M19). */}
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
