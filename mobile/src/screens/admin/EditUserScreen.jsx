import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import { contactError, contactRuleHint } from '../../format/contactRule';

// EDIT A USER — name, email and contact only (PUT /users/:id), the web's
// dialog as a modal screen. No confirmation: repeatable (§5e). Editing YOUR
// OWN row changes the user the session holds, so `refresh` re-reads /auth/me
// — best effort: the write succeeded, and a failed re-read must not turn it
// into an error. The login id is not editable and is not shown here.
export default function EditUserScreen({ navigation, route }) {
  const target = route.params.target;
  const { user: me, refresh } = useAuth();
  const [form, setForm] = useState({ name: target.name || '', email: target.email || '', contact_number: target.contact_number || '' });
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
    if (!form.name.trim()) {
      setFormError('name must not be empty.');
      return;
    }
    const contact = contactError(form.contact_number);
    if (contact) {
      setFieldErrors({ contact_number: contact });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/users/${target.id}`, { name: form.name.trim(), email: form.email.trim(), contact_number: form.contact_number.trim() }, { unwrap: 'user' });
      if (target.id === me?.id) await refresh().catch(() => {});
      navigation.navigate('Main', { screen: '/admin/users', params: { notice: 'User updated.', noticeKey: 'directory' } });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'contact_number' || field === 'email') setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-4 pb-10">
        {formError ? <ErrorAlert message={formError} /> : null}
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
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
