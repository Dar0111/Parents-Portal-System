import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DateField from '../../components/DateField';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import PasswordField from '../../components/PasswordField';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { contactError, contactRuleHint } from '../../format/contactRule';
import { todayLocalDateString } from '../../format/date';
import { lrnError, lrnRuleHint } from '../../format/lrnRule';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// THE ENROL WIZARD — one modal screen, the web's four phases (Darryl,
// branch 3 decision 4): enroll → confirm-enroll → parent → confirm-parent.
// After the enrol 201 there is no path back to the first phase (that would
// POST again); Skip lands on the list, which re-reads on the notice.
//
// TWO ENTRY POINTS, ONE SCREEN. From the list: `classOptions` (the sections
// this teacher ADVISES, the only legal enrol targets) and the wizard starts
// at the first phase. From a student record: `student`, and the wizard
// starts at the PARENT phase for that learner — the web's second modal,
// which is the same two phases with the LRN already known. On success or
// Skip the screen returns to wherever it came from with `notice`.
//
// POST /users/parents is gated on the ADVISER of the learner's section (403
// otherwise, and an unknown LRN is that same 403, never a 404). The LRN it
// sends is the one the enrol just created, or the record's own — locked, never
// typed here. The LRN and contact pre-checks are the client's copies of the
// server's rules; the server decides and its 400 names the `field`, which
// renders under that input (§7c).
//
// THE LOOK (feat/ui-refresh, 2026-10-02) is the web's wizard: each form is a
// card, and every phase ends in the same pair — the neutral way out, then the
// ONE filled step forward. The two confirmations are warning notices, not
// body copy: each asks for a write the API cannot take back (§5e). The
// "is enrolled" sentence is in the success tone, because the enrol has landed
// by the time it shows; opened from a record nothing has been written yet, so
// that sentence stays plain. NO ENTRANCE MOTION: a phase swaps in place, and
// nothing may delay the sentence that names the decision.
const EMPTY_ENROLL = { lrn: '', first_name: '', last_name: '', classKey: '', birthday: '', gender: '', address: '', contact_number: '' };
const EMPTY_PARENT = { name: '', password: '', confirmPassword: '', email: '', contact_number: '' };

const GENDERS = [
  { key: '', label: 'Not recorded' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];

function parseClassKey(classKey) {
  const i = String(classKey).indexOf('|');
  if (i < 0) return null;
  const grade_level = Number(classKey.slice(0, i));
  const section = classKey.slice(i + 1);
  if (!Number.isInteger(grade_level) || !section) return null;
  return { grade_level, section };
}

// A confirmation: the sentence that names the decision back, in the warning
// tone. The icon is decoration; the sentence is the message.
function ConfirmNotice({ children }) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
      <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
      <Text className="min-w-0 flex-1 text-sm text-warning-strong">{children}</Text>
    </View>
  );
}

export default function EnrollScreen({ navigation, route }) {
  const classOptions = route?.params?.classOptions || [];
  const fromRecord = route?.params?.student || null;
  const today = todayLocalDateString();
  const { tokens } = useTheme();

  const [phase, setPhase] = useState(fromRecord ? 'parent' : 'enroll');
  const [enroll, setEnroll] = useState({ ...EMPTY_ENROLL, classKey: classOptions.length === 1 ? classOptions[0].key : '' });
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [enrolled, setEnrolled] = useState(fromRecord);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

  function setField(setter, field) {
    return (value) => {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
      setter((prev) => ({ ...prev, [field]: value }));
    };
  }

  function leave(notice) {
    // popTo, not navigate: navigate pushes a second record or a second
    // drawer instead of going back (M16, fix/mobile-popto).
    if (fromRecord) navigation.popTo('StudentDetail', { id: fromRecord.id, notice });
    else navigation.popTo('Main', { screen: '/teacher/students', params: { notice } });
  }

  function requestEnroll() {
    setFormError(null);
    const parsed = parseClassKey(enroll.classKey);
    if (!enroll.lrn.trim() || !enroll.first_name.trim() || !enroll.last_name.trim() || !parsed) {
      setFormError('LRN, first name, last name, and class are required.');
      return;
    }
    const clientErrors = { lrn: lrnError(enroll.lrn), contact_number: contactError(enroll.contact_number) };
    if (clientErrors.lrn || clientErrors.contact_number) {
      setFieldErrors(clientErrors);
      return;
    }
    setPhase('confirm-enroll');
  }

  async function submitEnroll() {
    const parsed = parseClassKey(enroll.classKey);
    if (!parsed || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        lrn: enroll.lrn.trim(),
        first_name: enroll.first_name.trim(),
        last_name: enroll.last_name.trim(),
        grade_level: parsed.grade_level,
        section: parsed.section,
      };
      if (enroll.birthday) body.birthday = enroll.birthday;
      if (enroll.gender) body.gender = enroll.gender;
      if (enroll.address.trim()) body.address = enroll.address.trim();
      if (enroll.contact_number.trim()) body.contact_number = enroll.contact_number.trim();
      const student = await api.post('/students', body, { unwrap: 'student' });
      setEnrolled(student);
      setPhase('parent');
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
      setPhase('enroll');
    } finally {
      setSaving(false);
    }
  }

  function requestParent() {
    setFormError(null);
    if (!parent.name.trim() || !parent.password) {
      setFormError('Guardian name and password are required.');
      return;
    }
    if (!passwordIsValid(parent.password)) {
      setFormError(`Password: ${passwordRuleHint()}`);
      return;
    }
    if (parent.password !== parent.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    const contactProblem = contactError(parent.contact_number);
    if (contactProblem) {
      setFieldErrors({ contact_number: contactProblem });
      return;
    }
    setPhase('confirm-parent');
  }

  async function submitParent() {
    if (!enrolled?.lrn || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = { lrn: enrolled.lrn, password: parent.password, name: parent.name.trim() };
      if (parent.email.trim()) body.email = parent.email.trim();
      if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();
      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      leave(message);
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
      setPhase('parent');
    } finally {
      setSaving(false);
    }
  }

  const parsedConfirm = parseClassKey(enroll.classKey);
  const classLabel = parsedConfirm ? `Grade ${parsedConfirm.grade_level} - ${parsedConfirm.section}` : '';
  const title =
    phase === 'enroll' ? 'Enroll a student' : phase === 'confirm-enroll' ? 'Enroll this student?' : phase === 'parent' ? 'Create parent account' : 'Create this parent account?';

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        <Text accessibilityRole="header" className="font-serif text-xl text-fg">
          {title}
        </Text>
        {formError ? <ErrorAlert message={formError} /> : null}

        {phase === 'enroll' ? (
          <>
            <View className={`${cardClass} gap-4 p-4`}>
              <FormField
                label="LRN"
                required
                value={enroll.lrn}
                onChangeText={setField(setEnroll, 'lrn')}
                maxLength={12}
                keyboardType="number-pad"
                hint={lrnRuleHint()}
                error={fieldErrors.lrn}
              />
              <FormField label="First name" required value={enroll.first_name} onChangeText={setField(setEnroll, 'first_name')} />
              <FormField label="Last name" required value={enroll.last_name} onChangeText={setField(setEnroll, 'last_name')} />
              <FormField
                label="Class"
                required
                render={() => (
                  <Segmented label="Class" value={enroll.classKey} onChange={setField(setEnroll, 'classKey')} options={classOptions.map((opt) => ({ key: opt.key, label: opt.label }))} />
                )}
              />
              <DateField label="Birthday" value={enroll.birthday} onChange={setField(setEnroll, 'birthday')} maximumDate={today} clearable error={fieldErrors.birthday} />
              <FormField label="Gender" error={fieldErrors.gender} render={() => <Segmented label="Gender" value={enroll.gender} onChange={setField(setEnroll, 'gender')} options={GENDERS} />} />
              <FormField label="Address" value={enroll.address} onChangeText={setField(setEnroll, 'address')} multiline numberOfLines={2} textAlignVertical="top" className="min-h-20" />
              <FormField
                label="Contact number"
                value={enroll.contact_number}
                onChangeText={setField(setEnroll, 'contact_number')}
                maxLength={20}
                keyboardType="phone-pad"
                hint={contactRuleHint()}
                error={fieldErrors.contact_number}
              />
            </View>
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button variant="secondary" onPress={() => navigation.goBack()} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onPress={requestEnroll} disabled={saving}>
                Continue
              </Button>
            </View>
          </>
        ) : null}

        {phase === 'confirm-enroll' ? (
          <>
            <ConfirmNotice>
              Enroll {enroll.first_name.trim()} {enroll.last_name.trim()} (LRN {enroll.lrn.trim()}) in {classLabel}? This cannot be undone from here — there is no delete for a
              student record.
            </ConfirmNotice>
            {/* The label still changes while the write is in flight; `loading`
                is the old `disabled={saving}` plus its spinner. */}
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button variant="secondary" onPress={() => setPhase('enroll')} disabled={saving}>
                Go back
              </Button>
              <Button variant="primary" onPress={submitEnroll} loading={saving}>
                {saving ? 'Enrolling…' : 'Yes, enroll this student'}
              </Button>
            </View>
          </>
        ) : null}

        {phase === 'parent' ? (
          <>
            {fromRecord ? (
              <Text className="text-sm text-fg-body">{`Create the pending parent account for ${enrolled?.first_name} ${enrolled?.last_name}.`}</Text>
            ) : (
              <View className="flex-row items-start gap-3 rounded-xl border border-success-edge bg-success-soft px-4 py-3">
                <Icon name="fa-circle-check" size={16} color={tokens['success-icon']} style={{ marginTop: 2 }} />
                <Text className="min-w-0 flex-1 text-sm text-success-strong">
                  {`${enrolled?.first_name} ${enrolled?.last_name} is enrolled. Create the pending parent account next, or skip and do it later from the student record.`}
                </Text>
              </View>
            )}
            <View className={`${cardClass} gap-4 p-4`}>
              {/* The LRN, shown to the adviser acting on this learner (§5c). */}
              <FormField label="Login ID (child's LRN)" value={enrolled?.lrn || ''} editable={false} />
              <FormField label="Guardian name" required value={parent.name} onChangeText={setField(setParent, 'name')} />
              <PasswordField
                label="Password"
                required
                value={parent.password}
                onChangeText={setField(setParent, 'password')}
                autoComplete="new-password"
                revealed={revealed.password}
                onToggleReveal={() => setRevealed((prev) => ({ ...prev, password: !prev.password }))}
                error={fieldErrors.password}
                below={<PasswordChecklist value={parent.password} />}
              />
              <PasswordField
                label="Confirm password"
                required
                value={parent.confirmPassword}
                onChangeText={setField(setParent, 'confirmPassword')}
                autoComplete="new-password"
                revealed={revealed.confirm}
                onToggleReveal={() => setRevealed((prev) => ({ ...prev, confirm: !prev.confirm }))}
                error={confirmError(parent.password, parent.confirmPassword)}
              />
              <FormField label="Email" value={parent.email} onChangeText={setField(setParent, 'email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={fieldErrors.email} />
              <FormField
                label="Contact number"
                value={parent.contact_number}
                onChangeText={setField(setParent, 'contact_number')}
                maxLength={20}
                keyboardType="phone-pad"
                hint={contactRuleHint()}
                error={fieldErrors.contact_number}
              />
            </View>
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onPress={() => (fromRecord ? navigation.goBack() : leave(`${enrolled?.first_name} ${enrolled?.last_name} is enrolled.`))}
                disabled={saving}
              >
                {fromRecord ? 'Cancel' : 'Skip'}
              </Button>
              <Button variant="primary" onPress={requestParent} disabled={saving || !passwordFormReady(parent.password, parent.confirmPassword)}>
                Continue
              </Button>
            </View>
          </>
        ) : null}

        {phase === 'confirm-parent' ? (
          <>
            <ConfirmNotice>
              Create a pending parent account for {parent.name.trim()} (login ID {enrolled?.lrn})? An admin must approve it before they can log in. You cannot un-create it.
            </ConfirmNotice>
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button variant="secondary" onPress={() => setPhase('parent')} disabled={saving}>
                Go back
              </Button>
              <Button variant="primary" onPress={submitParent} loading={saving}>
                {saving ? 'Creating…' : 'Yes, create parent account'}
              </Button>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
