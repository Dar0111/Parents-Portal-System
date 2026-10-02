import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Text from '../../components/Text';
import { contactError, contactRuleHint } from '../../format/contactRule';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { userCardLines } from '../../navigation/drawerFold';
import { useTheme } from '../../theme/ThemeProvider';

// The web's Account information section, screen-shaped. Every sentence is
// the web's: the role copy, the three email states, the office-vs-admin
// split (§11: a screen may not tell someone to ask an office they ARE).
// THE LOCKED "current number" IS THE LAST SUCCESSFUL READ (§5b): the draft
// is its own state and `refresh()` after a save is what updates the shown
// value. §5c: this is the ONE screen that shows a parent's login_id, masked
// until Show is tapped; nothing else on the phone displays an LRN.
//
// THE LOOK (feat/ui-refresh, 2026-10-02): a profile card (the avatar, the
// name, the role, and the photo's own controls), the school's record of the
// account as one card of locked fields, then one card per sub-section, each
// with ONE clear action. THE SCREEN HAS ONE FILLED BUTTON — Save contact
// number, its one always-available write; every other action is the bordered
// button, and Remove photo is drawn as the destructive one.
//
// RELOAD (feat/ui-refresh) is the web's, on the phone: the section header's
// button calls AuthContext's refresh() — GET /auth/me, the call the mount
// effect and every write here already make. It never touches a number being
// typed or a typed code, so nothing unsaved is lost; a failure is shown under
// the header rather than swallowed, because this time somebody asked.

// A locked fact: the label in the eyebrow style, the value under it.
function Field({ label, value, empty = 'Not recorded', children }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-1">
        {children ?? (value ? <Text className="text-sm text-fg">{value}</Text> : <Text className="text-sm text-fg-muted">{empty}</Text>)}
      </View>
    </View>
  );
}

// A sub-section's title: the icon chip and the title face. The chip is
// decoration; the heading is the name.
function SubHeading({ icon, children }) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
        <Icon name={icon} size={15} color={tokens.brand} />
      </View>
      <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-base text-fg">
        {children}
      </Text>
    </View>
  );
}

function childName(user) {
  if (!user?.student_id) return null;
  const name = `${user.student_first_name || ''} ${user.student_last_name || ''}`.trim();
  return name || null;
}

function childClass(user) {
  if (!user?.student_id) return null;
  if (user.grade_level == null && !user.section) return null;
  return `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '');
}

// The Show / Hide control is the small bordered button — 44dp tall, where the
// old text link was a 16dp target. It wraps under the dots when the row is
// narrow rather than running out of it.
function MaskedLoginId({ value }) {
  const [shown, setShown] = useState(false);
  if (!value) return <Text className="text-sm text-fg-muted">—</Text>;
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Text
        accessibilityLabel={shown ? `Login ID ${value}` : 'Login ID hidden'}
        className="text-sm tracking-widest text-fg"
        style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
      >
        {shown ? value : '•'.repeat(Math.max(8, value.length))}
      </Text>
      <Button
        size="sm"
        icon={shown ? 'fa-eye-slash' : 'fa-eye'}
        onPress={() => setShown((s) => !s)}
        accessibilityState={{ selected: shown }}
      >
        {shown ? 'Hide' : 'Show'}
      </Button>
    </View>
  );
}

// A PILL IN ITS OWN TONE (feat/ui-refresh), as on the web: each state has its
// own glyph and its own words, never colour alone. It sits UNDER the value it
// marks, so a long address never has to share its line with it.
function VerifiedMark({ at }) {
  const { tokens } = useTheme();
  if (!at) {
    return (
      <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-warning-soft px-2 py-0.5">
        <Icon name="fa-circle-exclamation" size={11} color={tokens['warning-icon']} />
        <Text className="text-xs font-semibold text-warning-strong">Not confirmed</Text>
      </View>
    );
  }
  return (
    <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-success-soft px-2 py-0.5">
      <Icon name="fa-circle-check" size={11} color={tokens['success-icon']} />
      <Text className="text-xs font-semibold text-success-strong">Verified · {new Date(at).toLocaleDateString()}</Text>
    </View>
  );
}

// The stored number (always 09XXXXXXXXX) read as 0917 123 4567. Display only
// (§5d) — the value sent, stored and compared is never the spaced one.
function spacedNumber(value) {
  return /^09\d{9}$/.test(value || '') ? `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}` : value;
}

function ContactValue({ value, at }) {
  if (!value) return <Text className="text-sm text-fg-muted">Not recorded</Text>;
  return (
    <>
      <Text className="text-sm text-fg">{spacedNumber(value)}</Text>
      <VerifiedMark at={at} />
    </>
  );
}

const ROLE_COPY = {
  teacher:
    'Your name, Teacher ID and email are school records. Ask the office if something is wrong. You can update your contact number here and your password under Change password.',
  admin:
    'Your name, Admin ID and email are school records. You can update your contact number here and your password under Change password.',
  parent:
    "Your name, your child's name, LRN, grade and section are school records. Ask the office if something is wrong. You can update your contact number here and your password under Change password.",
};

// PROFILE PHOTO (feat/profile-photos, 2026-09-30) — the web's block, on the
// phone. THE PHOTO LIBRARY ONLY, NEVER THE CAMERA (Darryl's decision 3):
// `expo-image-picker`'s library call opens Android's own photo picker, which
// needs no storage permission, and the camera would add a permission prompt.
// The picker crops to a square at quality 0.8, so what is sent is small; the
// server still decodes, re-encodes to a 512 × 512 JPEG and strips EXIF — a
// phone photo's GPS position never reaches disk. The two checks here only
// save a pointless upload; the server says the same sentences.
//
// §5e: choosing a photo uploads it (another choice undoes it). REMOVING
// deletes the file with no undo, so a native Alert asks first, in the web's
// words. §5b: the avatar is user.profile_pic from the last /auth/me.
//
// THE PROFILE CARD (feat/ui-refresh): the avatar sits beside the name and the
// role line — the drawer's own two lines (drawerFold.js), so A PARENT'S CARD
// NEVER SHOWS THE LOGIN ID here either (§5c) — and the photo's controls are
// under them, in the same card as the picture they change.
//
// `busy` IS HELD BY THE SCREEN, not here, as on the web, and nothing else
// about it changed: the header's Reload has to know a photo write is in
// flight, because that write ends in the same refresh() the reload makes.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX = 5 * 1024 * 1024;

function ProfilePhoto({ user, refresh, status, setStatus, busy, setBusy }) {
  const hasPhoto = Boolean(user?.profile_pic);
  const { name, detail } = userCardLines(user);

  async function pick() {
    setStatus({});
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } catch (err) {
      setStatus({ photo: fail(err?.message || 'The photo library could not be opened.') });
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const type = asset.mimeType || 'image/jpeg';
    if (!PHOTO_TYPES.includes(type)) {
      setStatus({ photo: fail('Choose a JPEG, PNG or WebP image.') });
      return;
    }
    if (asset.fileSize && asset.fileSize > PHOTO_MAX) {
      setStatus({ photo: fail('The photo must be 5 MB or smaller.') });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      // The file name sent is a fixed word, never anything from the account.
      form.append('photo', { uri: asset.uri, name: type === 'image/png' ? 'photo.png' : type === 'image/webp' ? 'photo.webp' : 'photo.jpg', type });
      await api.put('/auth/photo', form, { unwrap: 'user' });
      await refresh();
      setStatus({ photo: ok(hasPhoto ? 'Profile photo changed.' : 'Profile photo added.') });
    } catch (err) {
      setStatus({ photo: fail(extractError(err)) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setStatus({});
    setBusy(true);
    try {
      await api.delete('/auth/photo', { unwrap: 'user' });
      await refresh();
      setStatus({ photo: ok('Profile photo removed.') });
    } catch (err) {
      setStatus({ photo: fail(extractError(err)) });
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove() {
    Alert.alert(
      'Remove your profile photo?',
      'The photo is deleted and cannot be brought back; your initials show instead. You can upload a new one at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, remove it', style: 'destructive', onPress: remove },
      ]
    );
  }

  return (
    <View className={`${cardClass} gap-4 p-4`}>
      <View className="flex-row items-center gap-4">
        <Avatar name={user?.name} photo={user?.profile_pic} size={72} />
        <View className="min-w-0 flex-1">
          {name ? <Text className="font-serif text-xl text-fg">{name}</Text> : null}
          {detail ? <Text className="mt-1 text-sm text-fg-muted">{detail}</Text> : null}
        </View>
      </View>
      <View className="gap-3 border-t border-edge-soft pt-4">
        <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Profile photo</Text>
        {/* REMOVE IS THE DESTRUCTIVE ONE and is drawn as such; pressing it
            still only opens the question above. Both buttons stay disabled
            while either write is in flight. */}
        <View className="flex-row flex-wrap gap-2">
          <Button icon="fa-image" onPress={pick} disabled={busy}>
            {busy ? 'Saving…' : hasPhoto ? 'Change photo' : 'Choose a photo'}
          </Button>
          {hasPhoto ? (
            <Button variant="danger-outline" icon="fa-trash" onPress={confirmRemove} disabled={busy}>
              Remove photo
            </Button>
          ) : null}
        </View>
        <Text className="text-xs text-fg-muted">
          From your photo library — JPEG, PNG or WebP, up to 5 MB, cropped to a square. It shows beside your name in the
          portal instead of your initials.
        </Text>
        <FormStatus status={status.photo} />
      </View>
    </View>
  );
}

export default function AccountInfoScreen() {
  const { user, refresh } = useAuth();
  const role = user?.role;
  const linked = Boolean(user?.student_id);
  const storedContact = user?.contact_number ?? '';
  const [draft, setDraft] = useState(null);
  const contactValue = draft === null ? storedContact : draft;
  const contactDirty = contactValue.trim() !== storedContact.trim();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({});
  const [contactFieldError, setContactFieldError] = useState(null);
  const emailVerifiedAt = user?.email_verified_at || null;
  const hasEmail = Boolean(user?.email);
  const isAdmin = role === 'admin';
  const [emailStep, setEmailStep] = useState('idle');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeError, setEmailCodeError] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);
  // The web's mobile-number confirmation, word for word (feat/sms-transport).
  const contactVerifiedAt = user?.contact_verified_at || null;
  const [contactStep, setContactStep] = useState('idle');
  const [contactCode, setContactCode] = useState('');
  const [contactCodeError, setContactCodeError] = useState(null);
  const [contactBusy, setContactBusy] = useState(false);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    refreshRef.current().catch(() => {});
  }, []);

  // The profile photo's write in flight (ProfilePhoto sets it). Held here so
  // the header's Reload can be disabled for it, like the three writes below.
  const [photoBusy, setPhotoBusy] = useState(false);

  // RELOAD — the header's button. The same refresh() as the mount read, but
  // asked for by hand, so its failure is said (under the header, with Try
  // again) instead of swallowed. Set from the press, never from an effect.
  // It writes only the auth user: a number being typed and a typed code are
  // left exactly as they are. The one thing it lets go of is a contact draft
  // that already EQUALS the stored number (typed in and put back) — kept, the
  // input would go on following that draft, and a number changed elsewhere
  // would show in the card above while the field still offered the old one
  // as an edit to save.
  //
  // §7c: A FAILED RELOAD IS ONE MORE KEY OF THE SCREEN'S ONE STATUS OBJECT,
  // not a state of its own — so the next action's message replaces it. A
  // reload that WORKS leaves every message alone; starting one clears only an
  // earlier reload's failure.
  const [reloading, setReloading] = useState(false);
  async function reload() {
    setReloading(true);
    setStatus((prev) => (prev.reload ? {} : prev));
    if (!contactDirty) setDraft(null);
    try {
      await refresh();
    } catch (err) {
      setStatus({ reload: fail(extractError(err)) });
    } finally {
      setReloading(false);
    }
  }

  async function saveContact() {
    setStatus({});
    setContactFieldError(null);
    const next = contactValue.trim();
    if (!next) {
      setContactFieldError('Contact number must not be empty.');
      return;
    }
    const problem = contactError(next);
    if (problem) {
      setContactFieldError(problem);
      return;
    }
    setSaving(true);
    const wasConfirmed = Boolean(contactVerifiedAt);
    try {
      const saved = await api.put('/auth/contact', { contact_number: next }, { unwrap: 'user' });
      await refresh();
      setDraft(null);
      setContactStep('idle');
      setContactCode('');
      setStatus({
        contact: ok(
          wasConfirmed && !saved?.contact_verified_at
            ? 'Contact number updated. The new number is not confirmed yet — text yourself a code above to confirm it.'
            : 'Contact number updated.'
        ),
      });
    } catch (err) {
      if (err?.response?.data?.field === 'contact_number') setContactFieldError(extractError(err));
      else setStatus({ contact: fail(extractError(err)) });
    } finally {
      setSaving(false);
    }
  }

  async function requestEmailCode() {
    setStatus({});
    setEmailCodeError(null);
    setEmailBusy(true);
    try {
      const message = await api.post('/auth/verify-email/request', {}, { unwrap: 'message' });
      if (/already confirmed/i.test(message)) {
        await refresh();
        setEmailStep('idle');
      } else {
        setEmailStep('code');
      }
      setStatus({ email: ok(message) });
    } catch (err) {
      setStatus({ email: fail(extractError(err)) });
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailCode() {
    setStatus({});
    setEmailCodeError(null);
    setEmailBusy(true);
    try {
      const message = await api.post('/auth/verify-email/confirm', { code: emailCode.trim() }, { unwrap: 'message' });
      await refresh();
      setEmailCode('');
      setEmailStep('idle');
      setStatus({ email: ok(message) });
    } catch (err) {
      setEmailCodeError(extractError(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function requestContactCode() {
    setStatus({});
    setContactCodeError(null);
    setContactBusy(true);
    try {
      const message = await api.post('/auth/verify-contact/request', {}, { unwrap: 'message' });
      if (/already confirmed/i.test(message)) {
        await refresh();
        setContactStep('idle');
      } else {
        setContactStep('code');
      }
      setStatus({ mobile: ok(message) });
    } catch (err) {
      setStatus({ mobile: fail(extractError(err)) });
    } finally {
      setContactBusy(false);
    }
  }

  async function confirmContactCode() {
    setStatus({});
    setContactCodeError(null);
    setContactBusy(true);
    try {
      const message = await api.post('/auth/verify-contact/confirm', { code: contactCode.trim() }, { unwrap: 'message' });
      await refresh();
      setContactCode('');
      setContactStep('idle');
      setStatus({ mobile: ok(message) });
    } catch (err) {
      setContactCodeError(extractError(err));
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {/* Disabled while one of this screen's own writes is in flight: each
            of them ends in the same refresh(), and two reads racing to
            setUser would let the older one land last. */}
        <SectionHeader
          title="Account information"
          description={ROLE_COPY[role] || ''}
          onReload={reload}
          reloading={reloading}
          reloadDisabled={saving || emailBusy || contactBusy || photoBusy}
          reloadLabel="Reload account information"
        />

        {status.reload ? <ErrorAlert message={status.reload.text} onRetry={reload} /> : null}

        <Reveal>
          <ProfilePhoto
            user={user}
            refresh={refresh}
            status={status}
            setStatus={setStatus}
            busy={photoBusy}
            setBusy={setPhotoBusy}
          />
        </Reveal>

        {/* The school's record of this account, locked. */}
        <View className={`${cardClass} gap-4 p-4`}>
          {role === 'parent' ? (
            <>
              <Field label="Parent name" value={user?.name} />
              <Field label="Learner" value={childName(user)} empty={linked ? 'Not recorded' : 'Not linked to a student record'} />
              <Field label="Class" value={childClass(user)} empty={linked ? 'Not recorded' : 'Not linked'} />
              <Field label="Email">
                {hasEmail ? (
                  <>
                    <Text className="text-sm text-fg">{user.email}</Text>
                    <VerifiedMark at={emailVerifiedAt} />
                  </>
                ) : (
                  <Text className="text-sm text-fg-muted">Not recorded</Text>
                )}
              </Field>
              <Field label="Contact number">
                <ContactValue value={storedContact} at={contactVerifiedAt} />
              </Field>
              <Field label="Login ID (child's LRN)">
                <MaskedLoginId value={user?.login_id} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Name" value={user?.name} />
              <Field label={role === 'admin' ? 'Admin ID' : 'Teacher ID'} value={user?.login_id} empty="—" />
              <Field label="Email">
                {hasEmail ? (
                  <>
                    <Text className="text-sm text-fg">{user.email}</Text>
                    <VerifiedMark at={emailVerifiedAt} />
                  </>
                ) : (
                  <Text className="text-sm text-fg-muted">Not recorded</Text>
                )}
              </Field>
              <Field label="Contact number">
                <ContactValue value={storedContact} at={contactVerifiedAt} />
              </Field>
            </>
          )}
        </View>

        <View className={`${cardClass} gap-3 p-4`}>
          <SubHeading icon="fa-envelope">Email address</SubHeading>
          {!hasEmail ? (
            <Text className="text-sm text-fg-muted">
              {/* F1: the web's four sentences, keyed on the stored confirmation. */}
              {contactVerifiedAt
                ? isAdmin
                  ? 'There is no email address on this account. Reset codes can still come to your confirmed mobile number. Add an email by editing your account in Admin → Users if you also want one.'
                  : 'There is no email address on this account. Reset codes can still come to your confirmed mobile number. Ask the school office if you also want an email added.'
                : isAdmin
                  ? 'There is no email address on this account. Add one by editing your account in Admin → Users, or confirm a mobile number below — without either, you cannot reset your own password and only another admin can get you back in.'
                  : 'There is no email address on this account. Ask the school office to add one, or confirm a mobile number below — without either, you cannot reset your own password and the office has to do it for you.'}
            </Text>
          ) : emailVerifiedAt ? (
            <Text className="text-sm text-fg-muted">
              This address is confirmed, so you can reset your own password from the sign-in page.{' '}
              {isAdmin ? 'To change it, edit your account in Admin → Users.' : 'To change the address itself, ask the school office.'}
            </Text>
          ) : (
            <>
              <Text className="text-sm text-fg-muted">
                This address is not confirmed yet. Confirming it is what lets you reset your own password from the
                sign-in page. Until then,{' '}
                {/* F2: the web's three endings, keyed on the stored confirmation. */}
                {contactVerifiedAt
                  ? 'reset codes can still come to your confirmed mobile number.'
                  : isAdmin
                    ? 'only another admin can get you back in.'
                    : 'only the school office can get you back in.'}
              </Text>
              {emailStep === 'code' ? (
                <View className="gap-3">
                  <FormField
                    label="Six-digit code"
                    value={emailCode}
                    onChangeText={(text) => {
                      setEmailCodeError(null);
                      setEmailCode(text.replace(/\D/g, '').slice(0, 6));
                    }}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    hint={`Sent to ${user.email}. It expires shortly and can be used once.`}
                    error={emailCodeError}
                  />
                  <View className="flex-row flex-wrap gap-2">
                    <Button onPress={confirmEmailCode} disabled={emailBusy || !/^\d{6}$/.test(emailCode)}>
                      {emailBusy ? 'Confirming…' : 'Confirm email'}
                    </Button>
                    <Button variant="ghost" onPress={requestEmailCode} disabled={emailBusy}>
                      Send a new code
                    </Button>
                  </View>
                </View>
              ) : (
                <Button className="self-start" onPress={requestEmailCode} disabled={emailBusy}>
                  {emailBusy ? 'Sending…' : 'Verify email'}
                </Button>
              )}
            </>
          )}
          <FormStatus status={status.email} />
        </View>

        <View className={`${cardClass} gap-3 p-4`}>
          <SubHeading icon="fa-phone">Mobile number</SubHeading>
          {!storedContact ? (
            <Text className="text-sm text-fg-muted">
              There is no mobile number on this account. Add one below — once it is confirmed, reset codes can also come by
              text message.
            </Text>
          ) : contactVerifiedAt ? (
            <Text className="text-sm text-fg-muted">
              This number is confirmed, so reset codes can also come to it by text message. Changing the number below
              removes the confirmation.
            </Text>
          ) : (
            <>
              <Text className="text-sm text-fg-muted">
                This number is not confirmed yet. Confirming it lets you get password reset codes by text message.
              </Text>
              {contactStep === 'code' ? (
                <View className="gap-3">
                  <FormField
                    label="Six-digit code"
                    value={contactCode}
                    onChangeText={(text) => {
                      setContactCodeError(null);
                      setContactCode(text.replace(/\D/g, '').slice(0, 6));
                    }}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    hint={`Sent to ${spacedNumber(storedContact)} by text message. It expires shortly and can be used once.`}
                    error={contactCodeError}
                  />
                  <View className="flex-row flex-wrap gap-2">
                    <Button onPress={confirmContactCode} disabled={contactBusy || !/^\d{6}$/.test(contactCode)}>
                      {contactBusy ? 'Confirming…' : 'Confirm number'}
                    </Button>
                    <Button variant="ghost" onPress={requestContactCode} disabled={contactBusy}>
                      Send a new code
                    </Button>
                  </View>
                </View>
              ) : (
                <Button className="self-start" onPress={requestContactCode} disabled={contactBusy}>
                  {contactBusy ? 'Sending…' : 'Text me a code'}
                </Button>
              )}
            </>
          )}
          <FormStatus status={status.mobile} />
        </View>

        <View className={`${cardClass} gap-3 p-4`}>
          <SubHeading icon="fa-pen-to-square">Update contact number</SubHeading>
          <Text className="text-sm text-fg-muted">If you change phones, update this so the school can still reach you.</Text>
          <FormField
            label="New contact number"
            value={contactValue}
            onChangeText={(text) => {
              setContactFieldError(null);
              setDraft(text);
            }}
            maxLength={20}
            keyboardType="phone-pad"
            autoComplete="tel"
            hint={contactRuleHint()}
            error={contactFieldError}
          />
          <Button variant="primary" full onPress={saveContact} disabled={saving || !contactDirty}>
            {saving ? 'Saving…' : 'Save contact number'}
          </Button>
          <FormStatus status={status.contact} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
