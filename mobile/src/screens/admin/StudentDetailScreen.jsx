import { useCallback, useLayoutEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import extractError from '../../api/extractError';
import DateField from '../../components/DateField';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import StatusBadge from '../../components/StatusBadge';
import { contactError, contactRuleHint } from '../../format/contactRule';
import { longDate, todayLocalDateString } from '../../format/date';
import { useTheme } from '../../theme/ThemeProvider';

// ONE STUDENT RECORD, ADMIN VIEW — the web's admin/StudentDetailPage.jsx: the
// teacher record's shape minus everything that exists because a teacher is
// scoped. Edit ALWAYS shows (PUT /students/:id is admin-unscoped); a 404 is
// "Student not found" (admin sees every id); no Create parent (teacher-only;
// the pending queue is on Users); no status control (it lives on the list).
// The LRN is shown — an admin acting on the student (§5c) — and the route
// keys on students.id. The card reads `student`, written by load() and the
// edit's success only (§5b).
const EMPTY_EDIT = { first_name: '', last_name: '', birthday: '', gender: '', address: '', contact_number: '' };
const GENDERS = [
  { key: '', label: 'Not recorded' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];

function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      {value ? <Text className="mt-0.5 text-sm text-fg">{value}</Text> : <Text className="mt-0.5 text-sm text-fg-muted">{empty}</Text>}
    </View>
  );
}

export default function StudentDetailScreen({ navigation, route }) {
  const id = route.params.id;
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const today = todayLocalDateString();
  const [student, setStudent] = useState(null);
  const [parentAccount, setParentAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_EDIT);
  const [editStatus, setEditStatus] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: student ? `${student.first_name} ${student.last_name}` : 'Student' });
  }, [navigation, student]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const row = await api.get(`/students/${id}`, { unwrap: ['student', 'parent_account'] });
      setStudent(row.student);
      setParentAccount(row.parent_account);
    } catch (err) {
      if (err?.response?.status === 404) setNotFound(true);
      else setError(extractError(err));
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const set = (key) => (value) => {
    setFieldErrors((prev) => ({ ...prev, [key]: null }));
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  function openEdit() {
    setDraft({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      birthday: student.birthday || '',
      gender: student.gender || '',
      address: student.address || '',
      contact_number: student.contact_number || '',
    });
    setEditStatus(null);
    setFieldErrors({});
    setStatus(null);
    setEditOpen(true);
  }

  function closeEdit() {
    if (saving) return;
    setEditOpen(false);
  }

  async function submitEdit() {
    if (saving) return;
    setEditStatus(null);
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setEditStatus(fail('First name and last name are required.'));
      return;
    }
    const contact = contactError(draft.contact_number);
    if (contact) {
      setFieldErrors({ contact_number: contact });
      return;
    }
    setSaving(true);
    try {
      const { student: updated, message } = await api.put(
        `/students/${student.id}`,
        {
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
          birthday: draft.birthday.trim(),
          gender: draft.gender,
          address: draft.address.trim(),
          contact_number: draft.contact_number.trim(),
        },
        { unwrap: ['student', 'message'] }
      );
      setStudent(updated);
      setStatus(ok(message));
      setEditOpen(false);
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setEditStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !student) return <LoadingSpinner className="py-16" label="Loading student…" />;
  if (notFound) {
    return (
      <View className="flex-1 bg-page p-4">
        <EmptyState icon="fa-user-slash" title="Student not found" message="No student record exists with this id." />
      </View>
    );
  }
  if (error && !student) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={error} onRetry={load} />
      </View>
    );
  }
  if (!student) return null;

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      <FormStatus status={status} />
      <View className="rounded-xl border border-edge bg-surface p-4">
        <View className="border-b border-edge pb-4">
          <Text className="text-lg font-semibold text-fg">
            {student.last_name}, {student.first_name}
          </Text>
          <Text className="mt-0.5 text-sm text-fg-muted">
            Grade {student.grade_level} - {student.section}
          </Text>
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <StatusBadge status={student.status} />
            <Pressable onPress={openEdit} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
              <Text className="text-sm font-medium text-fg-secondary">Edit</Text>
            </Pressable>
          </View>
        </View>
        <View className="mt-4 gap-4">
          <Field label="LRN" value={student.lrn} />
          <Field label="Birthday" value={student.birthday ? longDate(student.birthday) : null} />
          <Field label="Gender" value={titleCase(student.gender)} />
          <Field label="Contact number" value={student.contact_number} />
          <Field label="Parent account" value={parentAccount ? titleCase(parentAccount.status) : null} empty="None" />
          <Field label="Address" value={student.address} />
        </View>
      </View>

      <Modal visible={editOpen} animationType="slide" onRequestClose={closeEdit} presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-4 pb-10">
            <Text className="text-base font-semibold text-fg">Edit student</Text>
            <FormStatus status={editStatus} />
            <FormField label="LRN" value={student.lrn} editable={false} />
            <FormField label="First name" required value={draft.first_name} onChangeText={set('first_name')} />
            <FormField label="Last name" required value={draft.last_name} onChangeText={set('last_name')} />
            <FormField label="Grade level" value={`Grade ${student.grade_level}`} editable={false} />
            <FormField label="Section" value={student.section} editable={false} />
            <Text className="text-sm text-fg-muted">A student's class cannot be changed here. The system does not support moving a student between classes.</Text>
            <DateField label="Birthday" value={draft.birthday} onChange={set('birthday')} maximumDate={today} clearable error={fieldErrors.birthday} />
            <FormField label="Gender" error={fieldErrors.gender} render={() => <Segmented label="Gender" value={draft.gender} onChange={set('gender')} options={GENDERS} />} />
            <FormField label="Address" value={draft.address} onChangeText={set('address')} multiline numberOfLines={2} textAlignVertical="top" className="min-h-20" />
            <FormField label="Contact number" value={draft.contact_number} onChangeText={set('contact_number')} maxLength={20} keyboardType="phone-pad" hint={contactRuleHint()} error={fieldErrors.contact_number} />
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={closeEdit} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitEdit}
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
      </Modal>
    </ScrollView>
  );
}
