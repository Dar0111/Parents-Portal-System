import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import PasswordChecklist from '../../components/PasswordChecklist';
import PasswordField from '../../components/PasswordField';
import { contactRuleHint } from '../../format/contactRule';
import { createTeacherBody, createTeacherProblem } from './users/logic';

// CREATE TEACHER — the web's dialog as a modal screen. POST /users/teachers
// hardcodes role 'teacher' and the account is ACTIVE at once (LOCKED
// DECISIONS). NO CONFIRMATION (§5e): there is no delete, and the undo is
// Deactivate. The checks are the web's, in its order (`createTeacherProblem`),
// and a refusal lands under its own field — the client's or the server's 400
// naming `field` (password, contact_number, email). The typed password is
// never echoed back after the save.
const EMPTY = { login_id: '', password: '', name: '', email: '', contact_number: '' };

export default function CreateTeacherScreen({ navigation }) {
  const [form, setForm] = useState(EMPTY);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key) => (value) => {
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function submit() {
    if (saving) return;
    setFormError(null);
    const problem = createTeacherProblem(form);
    if (problem) {
      if (problem.field) setFieldErrors({ [problem.field]: problem.message });
      else setFormError(problem.message);
      return;
    }
    setSaving(true);
    try {
      await api.post('/users/teachers', createTeacherBody(form), { unwrap: 'user' });
      navigation.navigate('Main', { screen: '/admin/users', params: { notice: 'Teacher account created and activated.', noticeKey: 'directory' } });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'password' || field === 'contact_number' || field === 'email') setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-4 pb-10">
        {formError ? <ErrorAlert message={formError} /> : null}
        <FormField
          label="Login ID"
          required
          value={form.login_id}
          onChangeText={set('login_id')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          hint="Assigned teacher ID, not an LRN. At most 20 characters."
        />
        <PasswordField
          label="Password"
          required
          value={form.password}
          onChangeText={set('password')}
          autoComplete="new-password"
          revealed={revealed}
          onToggleReveal={() => setRevealed((r) => !r)}
          error={fieldErrors.password}
          below={<PasswordChecklist value={form.password} />}
        />
        <FormField label="Name" required value={form.name} onChangeText={set('name')} />
        <FormField label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={fieldErrors.email} />
        <FormField
          label="Contact number"
          value={form.contact_number}
          onChangeText={set('contact_number')}
          keyboardType="phone-pad"
          maxLength={20}
          hint={contactRuleHint()}
          error={fieldErrors.contact_number}
        />
        <View className="flex-row justify-end gap-2">
          <Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
            <Text className="text-sm font-medium text-fg-body">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            className={`rounded-lg bg-primary px-4 py-2 ${saving ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Creating…' : 'Create teacher'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
