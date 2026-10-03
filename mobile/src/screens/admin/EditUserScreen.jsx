import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import { contactError, contactRuleHint } from '../../format/contactRule';

// EDIT A USER — name, email and contact only (PUT /users/:id), the web's
// dialog as a modal screen. No confirmation: repeatable (§5e). Editing YOUR
// OWN row changes the user the session holds, so `refresh` re-reads /auth/me
// — best effort: the write succeeded, and a failed re-read must not turn it
// into an error. The login id is not editable and is not shown here.
//
// THE LOOK (feat/ui-refresh, 2026-10-03): the three fields in one card, then
// Cancel and the one filled Save — the shared `Button` at 48dp. NO
// PULL-TO-REFRESH: the form is filled from the list's row and shows no read
// of its own.
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
      // popTo, not navigate: navigate pushes a second drawer (A1, M16).
      navigation.popTo('Main', { screen: '/admin/users', params: { notice: 'User updated.', noticeKey: 'directory' } });
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {formError ? <ErrorAlert message={formError} /> : null}
        <View className={`${cardClass} gap-4 p-4`}>
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
        </View>
        {/* The label still changes while the write is in flight; `loading` is
            the old `disabled={saving}` plus its spinner and busy state. */}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button onPress={() => navigation.goBack()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onPress={submit} loading={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
