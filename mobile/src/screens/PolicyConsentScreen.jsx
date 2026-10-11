import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import { cardClass } from '../components/buttonStyles';
import ErrorAlert from '../components/ErrorAlert';
import FormStatus, { fail } from '../components/FormStatus';
import ScreenStatusBar from '../components/ScreenStatusBar';
import Seal from '../components/Seal';
import Skeleton, { SkeletonBar } from '../components/Skeleton';
import Text from '../components/Text';
import useSkeleton from '../hooks/useSkeleton';
import Icon from '../icons';
import Reveal from '../motion/Reveal';
import { useTheme } from '../theme/ThemeProvider';

// THE CONSENT SCREEN on the phone (feat/privacy, 2026-10-10; MOBILE M26). A
// parent reads the Data Privacy Notice and the Terms of Use and accepts them —
// for themselves and on behalf of their child — before using the portal.
//
// RootNavigator renders ONLY this screen while `user.policy_pending` is set,
// AFTER the forced password change (the server orders them the same way) —
// routed on the FIELD from /auth/me, never on the server's
// `POLICY_ACCEPTANCE_REQUIRED` 403 (§2). No drawer, and the realtime providers
// are not mounted: a socket and two count requests for a session the server
// refuses would only fail.
//
// THREE TICKS, ALL REQUIRED, checked again by the server: the notice, the
// terms, and the parent's consent for their child — "As the parent or legal
// guardian of <first name>, …" — the FIRST NAME from /auth/me, never the LRN
// (§5c). The wording is the web's, word for word: the draft the principal
// will approve (fix round PF4). The accept sends the versions this screen
// SHOWED; a version that changed meanwhile is a 409, and the screen reloads the
// documents and clears the ticks. The exit is the re-read: `refresh()` brings
// `policy_pending` back false from the SERVER and RootNavigator routes home.
// Sign out is always there and changes nothing; the line above it says
// declining leaves the child's school records as they are.
//
// STAFF TOO (feat/staff-acceptance, 2026-10-11; the owner's decisions), as on
// the web: teachers and the admin get TWO ticks — the parent's first two, word
// for word — and no child tick, the accept sends no `on_behalf_of_child`, and
// the line above Sign out is the owner's sentence for staff. A parent's
// screen, ticks and words are unchanged.
//
// THE FRAME IS THE SIGN-IN FAMILY'S, as on ForcedPasswordChangeScreen; LOADING
// is Build 2's skeleton (components/Skeleton + hooks/useSkeleton, unchanged).
// A screen that is a one-time decision has no pull-to-refresh; a failed read
// has Try again.

const AUTH_CARD = cardClass.replace('rounded-2xl', 'rounded-3xl');
const BAND_CORNERS = { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 };
const NO_TICKS = { privacy_notice: false, terms_of_use: false, child: false };
const TICK_ROW = { minHeight: 48 };

function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

// One tick: the whole row is the target (48dp), announced as a checkbox with
// its state. The box is a View with the app's tokens — no new colour.
function Tick({ checked, onToggle, disabled, children }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      className="flex-row items-start gap-3 py-2"
      style={TICK_ROW}
    >
      <View
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
          checked ? 'border-primary bg-primary' : 'border-edge-strong bg-surface'
        }`}
      >
        {checked ? <Icon name="fa-check" size={13} color={tokens['primary-fg']} /> : null}
      </View>
      <Text className="min-w-0 flex-1 text-sm text-fg-body">{children}</Text>
    </Pressable>
  );
}

export default function PolicyConsentScreen() {
  const { user, logout, refresh } = useAuth();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [documents, setDocuments] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloads, setReloads] = useState(0);
  const [ticked, setTicked] = useState(NO_TICKS);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get('/policy', { unwrap: 'documents' })
      .then((docs) => {
        if (live) setDocuments(docs);
      })
      .catch((err) => {
        if (live) setLoadError(extractError(err));
      });
    return () => {
      live = false;
    };
  }, [reloads]);

  const loading = !documents && !loadError;
  const phase = useSkeleton(loading);
  const isParent = user?.role === 'parent';
  const childName = user?.student_first_name ? String(user.student_first_name) : null;
  // The child's tick is a parent's alone.
  const ready = Boolean(documents) && ticked.privacy_notice && ticked.terms_of_use && (!isParent || ticked.child);
  const titleOf = (doc) => documents?.find((d) => d.document === doc)?.title;

  function reload() {
    setDocuments(null);
    setLoadError(null);
    setTicked(NO_TICKS);
    setReloads((n) => n + 1);
  }

  function toggle(key) {
    return () => setTicked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function accept() {
    if (!ready || saving) return;
    setStatus(null);
    setSaving(true);
    try {
      const versions = Object.fromEntries(documents.map((d) => [d.document, d.version]));
      const body = isParent ? { versions, on_behalf_of_child: true } : { versions };
      await api.post('/policy/accept', body, { unwrap: 'policy_pending' });
      // No navigate: the re-read clears `policy_pending` and RootNavigator
      // renders the role home.
      await refresh();
    } catch (err) {
      setStatus(fail(extractError(err)));
      if (err?.response?.status === 409) reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-page">
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
                  Before you continue
                </Text>
                <Text className="mt-2 text-sm text-fg-muted">
                  {isParent
                    ? `${user?.name}, please read the school’s Data Privacy Notice and Terms of Use, then accept them for yourself and for your child.`
                    : `${user?.name}, please read the school’s Data Privacy Notice and Terms of Use, then accept them.`}
                </Text>
              </View>

              {loadError ? (
                <ErrorAlert message={loadError} onRetry={reload} />
              ) : loading ? (
                <Skeleton phase={phase} label="Loading the documents…">
                  <View className="gap-6">
                    {[0, 1].map((i) => (
                      <View key={i} className="gap-2">
                        <SkeletonBar className="h-5 w-48" />
                        <SkeletonBar className="h-4 w-24" />
                        <SkeletonBar className="h-28 w-full" round="rounded-lg" />
                      </View>
                    ))}
                  </View>
                </Skeleton>
              ) : (
                <View className="gap-6">
                  {documents.map((doc) => (
                    <View key={doc.document}>
                      <Text accessibilityRole="header" className="font-serif text-base text-fg">
                        {doc.title}
                      </Text>
                      <Text className="mt-0.5 text-xs text-fg-muted">Version {doc.version}</Text>
                      {/* A box for the text, nested in the screen's scroll: the
                          approved text will be long, and the screen scrolls it. */}
                      <View className="mt-2 gap-3 rounded-lg border border-edge bg-surface-subtle p-4">
                        {paragraphs(doc.text).map((p, i) => (
                          <Text key={i} className="text-sm text-fg-body">
                            {p}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))}

                  <View>
                    <Tick checked={ticked.privacy_notice} onToggle={toggle('privacy_notice')} disabled={saving}>
                      I have read and accept the {titleOf('privacy_notice') || 'Data Privacy Notice'}.
                    </Tick>
                    <Tick checked={ticked.terms_of_use} onToggle={toggle('terms_of_use')} disabled={saving}>
                      I have read and agree to the {titleOf('terms_of_use') || 'Terms of Use'}.
                    </Tick>
                    {isParent ? (
                      <Tick checked={ticked.child} onToggle={toggle('child')} disabled={saving}>
                        As the parent or legal guardian of {childName || 'my child'}, I consent, on my child’s behalf, to the
                        processing of my child’s personal data for the purposes in the notice.
                      </Tick>
                    ) : null}
                  </View>

                  <Button variant="primary" size="lg" full loading={saving} disabled={!ready} onPress={accept}>
                    {saving ? 'Saving…' : 'I agree and continue'}
                  </Button>
                  <FormStatus status={status} />
                </View>
              )}
            </View>
          </Reveal>

          {/* Always there, and it changes nothing: the next sign-in asks again. */}
          <View className="mt-4 items-center">
            <Text className="text-center text-sm text-fg-muted">
              {isParent
                ? 'Declining ends portal use only; your child’s school records stay as they are.'
                : 'Declining ends portal use only.'}
            </Text>
            <Pressable onPress={logout} accessibilityRole="button" className="flex-row items-center" style={{ minHeight: 48 }}>
              <Text className="text-sm font-semibold text-brand">Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
