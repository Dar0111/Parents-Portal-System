import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import PasswordChecklist from '../../components/PasswordChecklist';
import PasswordField from '../../components/PasswordField';
import { createTeacherBody, createTeacherProblem, teacherCreatedNotice } from './users/logic';

// CREATE TEACHER — the web's dialog as a modal screen. POST /users/teachers
// hardcodes role 'teacher' and the account is ACTIVE at once (LOCKED
// DECISIONS). NO CONFIRMATION (§5e): there is no delete, and the undo is
// Deactivate. The checks are the web's, in its order (`createTeacherProblem`),
// and a refusal lands under its own field — the client's or the server's 400
// naming `field` (password). The typed password is never echoed back after
// the save. NO EMAIL, NO CONTACT NUMBER (feat/account-create, 2026-10-21):
// the teacher confirms their own Gmail or mobile number at the first
// sign-in, and POST /users/teachers refuses either key with a value.
//
// THE LOOK (feat/ui-refresh, 2026-10-03): the fields in one card, then the
// neutral way out and the one filled step forward — both the shared `Button`
// at 48dp. NO PULL-TO-REFRESH: a write-only form shows no server data. The
// label still
// changes while the write is in flight; `loading` is the old
// `disabled={saving}` plus its spinner and busy state.
const EMPTY = { login_id: '', password: '', name: '' };

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
      const created = await api.post('/users/teachers', createTeacherBody(form), { unwrap: 'user' });
      // popTo, not navigate: navigate pushes a second drawer (A1, M16).
      navigation.popTo('Main', { screen: '/admin/users', params: { notice: teacherCreatedNotice(created), noticeKey: 'directory' } });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'password') setFieldErrors({ [field]: extractError(err) });
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
        </View>
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button onPress={() => navigation.goBack()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" icon="fa-user-plus" onPress={submit} loading={saving}>
            {saving ? 'Creating…' : 'Create teacher'}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
