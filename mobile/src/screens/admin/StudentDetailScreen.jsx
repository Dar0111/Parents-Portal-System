import { useCallback, useLayoutEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Modal, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// ONE STUDENT RECORD, ADMIN VIEW — the web's admin/StudentDetailPage.jsx: the
// teacher record's shape minus everything that exists because a teacher is
// scoped. Edit ALWAYS shows (PUT /students/:id is admin-unscoped); a 404 is
// "Student not found" (admin sees every id); no Create parent (teacher-only;
// the pending queue is on Users); no status control (it lives on the list).
// The LRN is shown — an admin acting on the student (§5c) — and the route
// keys on students.id. The cards read `student`, written by load() and the
// edit's success only (§5b).
//
// THE LAYOUT (feat/ui-refresh, 2026-10-03) is the web's: a HEADER CARD — the
// learner in the title face with their initials (a learner has no photo,
// §25), the class and the status badge, and Edit — and ONE FACT CARD (two
// until the privacy build, 2026-10-10): who the learner is and whether a
// parent account is linked. The learner's birthday, gender, address and
// contact number — and the Contact details card — are gone: no longer
// collected (decision 6). Edit is the neutral button: nothing on this screen
// is a filled action, the record is mostly read.
//
// PULL TO REFRESH is load() — the same GET every focus already makes. The
// record stays on screen under the pull spinner; the edit sheet is a Modal
// over the screen, so no pull can start while it is open.
const EMPTY_EDIT = { first_name: '', last_name: '' };

function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
      {value ? <Text className="mt-1 text-sm text-fg">{value}</Text> : <Text className="mt-1 text-sm text-fg-muted">{empty}</Text>}
    </View>
  );
}

// The head of one fact card: the icon chip and the card's title.
function CardTitle({ icon, children }) {
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

export default function StudentDetailScreen({ navigation, route }) {
  const id = route.params.id;
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  // The web's disabled field (`disabled:bg-surface-subtle disabled:text-fg-muted`,
  // fix round PF5): the LRN and the class cannot be changed here, so they must
  // not look like fields you can type in. Inline, so it wins over FormField's
  // `bg-surface text-fg` whatever the stylesheet order.
  const readOnlyStyle = { backgroundColor: tokens['surface-subtle'], color: tokens['fg-muted'] };
  const [student, setStudent] = useState(null);
  const [parentAccount, setParentAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_EDIT);
  const [editStatus, setEditStatus] = useState(null);
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
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  function openEdit() {
    setDraft({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
    });
    setEditStatus(null);
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
    setSaving(true);
    try {
      const { student: updated, message } = await api.put(
        `/students/${student.id}`,
        {
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
        },
        { unwrap: ['student', 'message'] }
      );
      setStudent(updated);
      setStatus(ok(message));
      setEditOpen(false);
    } catch (err) {
      setEditStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  // The pull's handler: load() as it is, with a busy flag for the pull
  // spinner alone (load keeps the record on screen while it re-reads).
  async function pullToRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !student) return <LoadingSpinner className="py-16" label="Loading student…" />;
  const pull = <RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />;
  if (notFound) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4" refreshControl={pull}>
        <View className={cardClass}>
          <EmptyState icon="fa-user-slash" title="Student not found" message="No student record exists with this id." />
        </View>
      </ScrollView>
    );
  }
  if (error && !student) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4" refreshControl={pull}>
        <ErrorAlert message={error} onRetry={load} />
      </ScrollView>
    );
  }
  if (!student) return null;

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10" refreshControl={pull}>
      <FormStatus status={status} />

      <Reveal>
        <View className={`${cardClass} gap-4 p-5`}>
          <View className="flex-row items-start gap-3">
            <Avatar name={`${student.first_name} ${student.last_name}`} size={48} />
            <View className="min-w-0 flex-1">
              <Text accessibilityRole="header" className="font-serif text-xl text-fg">
                {student.last_name}, {student.first_name}
              </Text>
              <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
                <Text className="text-sm text-fg-muted">
                  Grade {student.grade_level} - {student.section}
                </Text>
                <StatusBadge status={student.status} />
              </View>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Button icon="fa-pen" onPress={openEdit}>
              Edit
            </Button>
          </View>
        </View>
      </Reveal>

      {/* Same fields as the teacher view, plus the linked parent account —
          which it is, not a button: POST /users/parents is teacher-only.
          "None" = no account yet. */}
      <View className={`${cardClass} gap-4 p-4`}>
        <CardTitle icon="fa-id-card">Student details</CardTitle>
        <Field label="LRN" value={student.lrn} />
        <Field label="Parent account" value={parentAccount ? titleCase(parentAccount.status) : null} empty="None" />
      </View>

      <Modal visible={editOpen} animationType="slide" onRequestClose={closeEdit} presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
            <Text accessibilityRole="header" className="font-serif text-xl text-fg">
              Edit student
            </Text>
            <FormStatus status={editStatus} />
            <View className={`${cardClass} gap-4 p-4`}>
              <FormField label="LRN" value={student.lrn} editable={false} accessibilityState={{ disabled: true }} style={readOnlyStyle} />
              <FormField label="First name" required value={draft.first_name} onChangeText={set('first_name')} />
              <FormField label="Last name" required value={draft.last_name} onChangeText={set('last_name')} />
              <FormField
                label="Grade level"
                value={`Grade ${student.grade_level}`}
                editable={false}
                accessibilityState={{ disabled: true }}
                style={readOnlyStyle}
              />
              <FormField label="Section" value={student.section} editable={false} accessibilityState={{ disabled: true }} style={readOnlyStyle} />
              <Text className="text-sm text-fg-muted">A student's class cannot be changed here. The system does not support moving a student between classes.</Text>
            </View>
            {/* The label still changes while the write is in flight; `loading`
                is the old `disabled={saving}` plus its spinner. */}
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button onPress={closeEdit} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onPress={submitEdit} loading={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
