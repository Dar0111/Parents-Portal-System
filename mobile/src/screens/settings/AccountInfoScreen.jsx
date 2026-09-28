import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import { contactError, contactRuleHint } from '../../format/contactRule';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// The web's Account information section, screen-shaped. Every sentence is
// the web's: the role copy, the three email states, the office-vs-admin
// split (§11: a screen may not tell someone to ask an office they ARE).
// THE LOCKED "current number" IS THE LAST SUCCESSFUL READ (§5b): the draft
// is its own state and `refresh()` after a save is what updates the shown
// value. §5c: this is the ONE screen that shows a parent's login_id, masked
// until Show is tapped; nothing else on the phone displays an LRN.
function Field({ label, value, empty = 'Not recorded', children }) {
  return (
    <View className="py-2">
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-1">
        {children ?? (value ? <Text className="text-sm text-fg">{value}</Text> : <Text className="text-sm text-fg-muted">{empty}</Text>)}
      </View>
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

function MaskedLoginId({ value }) {
  const [shown, setShown] = useState(false);
  if (!value) return <Text className="text-sm text-fg-muted">—</Text>;
  return (
    <View className="flex-row items-center gap-3">
      <Text
        accessibilityLabel={shown ? `Login ID ${value}` : 'Login ID hidden'}
        className="text-sm tracking-widest text-fg"
        style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
      >
        {shown ? value : '•'.repeat(Math.max(8, value.length))}
      </Text>
      <Pressable onPress={() => setShown((s) => !s)} accessibilityRole="button" accessibilityState={{ selected: shown }}>
        <Text className="text-xs font-medium text-brand">{shown ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}

function VerifiedMark({ at }) {
  const { tokens } = useTheme();
  if (!at) {
    return (
      <View className="mt-1 flex-row items-center gap-1">
        <Icon name="fa-circle-exclamation" size={11} color={tokens['warning-icon']} />
        <Text className="text-xs font-medium text-warning-strong">Not confirmed</Text>
      </View>
    );
  }
  return (
    <View className="mt-1 flex-row items-center gap-1">
      <Icon name="fa-circle-check" size={11} color={tokens['success-icon']} />
      <Text className="text-xs font-medium text-success-strong">Verified · {new Date(at).toLocaleDateString()}</Text>
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

function Button({ label, onPress, disabled, primary = true }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`items-center rounded-lg px-4 py-2.5 ${
        primary ? 'bg-primary' : 'border border-edge-strong'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <Text className={`text-sm font-medium ${primary ? 'text-primary-fg' : 'text-fg-body'}`}>{label}</Text>
    </Pressable>
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-4 pb-10">
        <Text className="text-base font-semibold text-fg">Account information</Text>
        <Text className="mt-1 text-sm text-fg-muted">{ROLE_COPY[role] || ''}</Text>

        <View className="mt-4 rounded-lg border border-edge bg-surface-subtle px-4 py-2">
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

        <View className="mt-6 gap-3">
          <Text className="text-sm font-semibold text-fg">Email address</Text>
          {!hasEmail ? (
            <Text className="text-sm text-fg-muted">
              {isAdmin
                ? 'There is no email address on this account. Add one by editing your account in Admin → Users — without it you cannot reset your own password, and only another admin can get you back in.'
                : 'There is no email address on this account. Ask the school office to add one — without it you cannot reset your own password, and the office has to do it for you.'}
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
                {isAdmin ? 'only another admin can get you back in.' : 'only the school office can get you back in.'}
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
                    <Button
                      label={emailBusy ? 'Confirming…' : 'Confirm email'}
                      onPress={confirmEmailCode}
                      disabled={emailBusy || !/^\d{6}$/.test(emailCode)}
                    />
                    <Button label="Send a new code" onPress={requestEmailCode} disabled={emailBusy} primary={false} />
                  </View>
                </View>
              ) : (
                <View className="self-start">
                  <Button label={emailBusy ? 'Sending…' : 'Verify email'} onPress={requestEmailCode} disabled={emailBusy} />
                </View>
              )}
            </>
          )}
          <FormStatus status={status.email} />
        </View>

        <View className="mt-6 gap-3">
          <Text className="text-sm font-semibold text-fg">Mobile number</Text>
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
                    <Button
                      label={contactBusy ? 'Confirming…' : 'Confirm number'}
                      onPress={confirmContactCode}
                      disabled={contactBusy || !/^\d{6}$/.test(contactCode)}
                    />
                    <Button label="Send a new code" onPress={requestContactCode} disabled={contactBusy} primary={false} />
                  </View>
                </View>
              ) : (
                <View className="self-start">
                  <Button label={contactBusy ? 'Sending…' : 'Text me a code'} onPress={requestContactCode} disabled={contactBusy} />
                </View>
              )}
            </>
          )}
          <FormStatus status={status.mobile} />
        </View>

        <View className="mt-6 gap-3">
          <Text className="text-sm font-semibold text-fg">Update contact number</Text>
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
          <View className="self-start">
            <Button label={saving ? 'Saving…' : 'Save contact number'} onPress={saveContact} disabled={saving || !contactDirty} />
          </View>
          <FormStatus status={status.contact} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
