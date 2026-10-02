import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DateField from '../../components/DateField';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import ReloadButton from '../../components/ReloadButton';
import Segmented from '../../components/Segmented';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import { contactError, contactRuleHint } from '../../format/contactRule';
import { longDate, todayLocalDateString } from '../../format/date';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// ONE STUDENT RECORD — the web's StudentDetailPage.jsx. It fetches GET
// /students/:id itself (the id is a route param, `students.id`, never the
// LRN — §5c) and a 404 is "not in your classes": the API collapses "does
// not exist" and "outside your scope" so a teacher cannot enumerate ids, and
// the copy must not undo that. TWO GATES, TWO SOURCES: Edit is assigned OR
// adviser; Create parent is the ADVISER of the learner's section only, and
// "already has a parent" comes from the response's `parent_account`, never
// from probing the 409.
//
// Edit is an in-screen Modal (the web's reversible one-phase dialog);
// Create parent is the Enroll screen opened at its parent phase, because
// that is the same irreversible two-phase form. The cards read `student`,
// whose writers are load() and the edit's success path (§5b) — never the
// draft. The LRN IS shown here: a teacher acting on this learner (§5c).
//
// THE LAYOUT (feat/ui-refresh, 2026-10-02) is the web's: a HEADER CARD — the
// learner in the title face with their initials (a learner has no photo,
// §25), the class and the status badge, the record's Reload, then its
// actions and the notes that say what this teacher may not do here — and
// TWO FACT CARDS by what the fact is for: who the learner is, and how to
// reach the family. Create parent account is the screen's one filled action.
//
// RELOAD is load() — the same GET the screen opens with. The whole screen
// shows the spinner while it runs, exactly as on the first load, so the
// header card's entrance plays again when the record comes back.
const EMPTY_EDIT = { first_name: '', last_name: '', birthday: '', gender: '', address: '', contact_number: '' };
const GENDERS = [
  { key: '', label: 'Not recorded' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];

// Display casing only (§5d): the two fields whose stored form is lowercase
// by schema; never an address, never an LRN.
function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Field({ label, value }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
      {value ? <Text className="mt-1 text-sm text-fg">{value}</Text> : <Text className="mt-1 text-sm text-fg-muted">Not recorded</Text>}
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

function assignmentMatchesStudent(row, student) {
  return Number(row.grade_level) === Number(student.grade_level) && String(row.section) === String(student.section);
}

function draftFrom(row) {
  return {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    birthday: row.birthday || '',
    gender: row.gender || '',
    address: row.address || '',
    contact_number: row.contact_number || '',
  };
}

export default function StudentDetailScreen({ navigation, route }) {
  const id = route.params.id;
  const notice = route.params?.notice || null;
  const { user } = useAuth();
  const { tokens } = useTheme();
  // An RN Modal is its own window, outside ScreenFrame — it pads the bottom
  // inset itself, or edge-to-edge Android puts the nav bar over Save.
  const insets = useSafeAreaInsets();
  const today = todayLocalDateString();

  const [student, setStudent] = useState(null);
  const [parentAccount, setParentAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notInScope, setNotInScope] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [advised, setAdvised] = useState([]);
  const [status, setStatus] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [draft, setDraft] = useState(EMPTY_EDIT);

  useLayoutEffect(() => {
    navigation.setOptions({ title: student ? `${student.first_name} ${student.last_name}` : 'Student' });
  }, [navigation, student]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotInScope(false);
    try {
      const row = await api.get(`/students/${id}`, { unwrap: ['student', 'parent_account'] });
      setStudent(row.student);
      setParentAccount(row.parent_account);
    } catch (err) {
      if (err?.response?.status === 404) setNotInScope(true);
      else setError(extractError(err));
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A write on the Enroll screen (create parent) brought us back: show its
  // message and re-read so parent_account reflects the new row (§5b).
  useFocusEffect(
    useCallback(() => {
      if (notice) {
        setStatus(ok(notice));
        load();
        navigation.setParams({ notice: null });
      }
    }, [notice, load, navigation])
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get('/assignments', { unwrap: 'assignments' })
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setAdvised(rows.filter((sec) => Number(sec.adviser_id) === Number(user.id)));
      })
      .catch(() => {
        if (!cancelled) setAdvised([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const advisesThisSection = useMemo(() => (student ? advised.some((sec) => Number(sec.id) === Number(student.section_id)) : false), [advised, student]);
  const canEdit = useMemo(() => (student ? assignments.some((row) => assignmentMatchesStudent(row, student)) || advisesThisSection : false), [assignments, student, advisesThisSection]);
  const canCreateParent = advisesThisSection;

  function openEdit() {
    if (!student) return;
    setDraft(draftFrom(student));
    setEditError(null);
    setFieldErrors({});
    setStatus(null);
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setEditError(null);
    setFieldErrors({});
    setDraft(EMPTY_EDIT);
  }

  function setField(field) {
    return (value) => {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
      setDraft((prev) => ({ ...prev, [field]: value }));
    };
  }

  async function submitEdit() {
    if (!student || savingEdit) return;
    setEditError(null);
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setEditError('First name and last name are required.');
      return;
    }
    const contactProblem = contactError(draft.contact_number);
    if (contactProblem) {
      setFieldErrors({ contact_number: contactProblem });
      return;
    }
    setSavingEdit(true);
    try {
      // Omit grade_level, section, lrn, status: a class change is refused
      // with 400 and omitting cannot trip it.
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
      setDraft(EMPTY_EDIT);
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setEditError(extractError(err));
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) return <LoadingSpinner className="py-16" label="Loading student…" />;

  if (notInScope) {
    return (
      <View className="flex-1 bg-page p-4">
        <View className={cardClass}>
          <EmptyState icon="fa-user-slash" title="This student is not in your classes" message="You can only open students in the sections you teach or advise." />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={error} onRetry={load} />
      </View>
    );
  }

  if (!student) return null;

  // The record's notes: whether a parent account exists, and what this
  // teacher may NOT do here and why. Any of the three may be absent; the
  // strip under the actions is drawn only when at least one is present.
  const showCreateParent = !parentAccount && canCreateParent;
  const showEditNote = !canEdit;
  const showParentNote = !parentAccount && !canCreateParent;
  const hasNotes = Boolean(parentAccount) || showEditNote || showParentNote;

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
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
            <ReloadButton onReload={load} loading={loading} disabled={editOpen || savingEdit} label="Reload student record" />
          </View>

          {canEdit || showCreateParent ? (
            <View className="flex-row flex-wrap gap-2">
              {canEdit ? (
                <Button icon="fa-pen" onPress={openEdit}>
                  Edit
                </Button>
              ) : null}
              {showCreateParent ? (
                <Button variant="primary" icon="fa-user-plus" onPress={() => navigation.navigate('Enroll', { student })}>
                  Create parent account
                </Button>
              ) : null}
            </View>
          ) : null}

          {hasNotes ? (
            <View className="gap-2 border-t border-edge-soft pt-4">
              {parentAccount ? (
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-sm text-fg-body">Parent account:</Text>
                  <StatusBadge status={parentAccount.status} />
                </View>
              ) : null}
              {showEditNote ? <Text className="text-sm text-fg-muted">Editing a student is limited to classes you teach or advise.</Text> : null}
              {showParentNote ? <Text className="text-sm text-fg-muted">Only the adviser of this section can create the parent account.</Text> : null}
            </View>
          ) : null}
        </View>
      </Reveal>

      {/* What a teacher needs to identify a learner and contact their
          guardian; section_id, created_by and the timestamps are omitted
          as on the web. `birthday` is a DATE column: `longDate` is string
          surgery on the literal (§5a-iv). */}
      <View className={`${cardClass} gap-4 p-4`}>
        <CardTitle icon="fa-id-card">Student details</CardTitle>
        <Field label="LRN" value={student.lrn} />
        <Field label="Birthday" value={student.birthday ? longDate(student.birthday) : null} />
        <Field label="Gender" value={titleCase(student.gender)} />
      </View>

      <View className={`${cardClass} gap-4 p-4`}>
        <CardTitle icon="fa-address-book">Contact details</CardTitle>
        <Field label="Contact number" value={student.contact_number} />
        <Field label="Address" value={student.address} />
      </View>

      <Modal visible={editOpen} animationType="slide" onRequestClose={closeEdit} presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
            <Text accessibilityRole="header" className="font-serif text-xl text-fg">
              Edit student
            </Text>
            {editError ? <ErrorAlert message={editError} /> : null}
            <View className={`${cardClass} gap-4 p-4`}>
              <FormField label="LRN" value={student.lrn} editable={false} />
              <FormField label="First name" required value={draft.first_name} onChangeText={setField('first_name')} />
              <FormField label="Last name" required value={draft.last_name} onChangeText={setField('last_name')} />
              <FormField label="Grade level" value={`Grade ${student.grade_level}`} editable={false} />
              <FormField label="Section" value={student.section} editable={false} />
              {/* §5i: the fact plus the reason; no transfer route is named. */}
              <Text className="text-sm text-fg-muted">A student's class cannot be changed here. The system does not support moving a student between classes.</Text>
              <DateField label="Birthday" value={draft.birthday} onChange={setField('birthday')} maximumDate={today} clearable error={fieldErrors.birthday} />
              <FormField label="Gender" error={fieldErrors.gender} render={() => <Segmented label="Gender" value={draft.gender} onChange={setField('gender')} options={GENDERS} />} />
              <FormField label="Address" value={draft.address} onChangeText={setField('address')} multiline numberOfLines={2} textAlignVertical="top" className="min-h-20" />
              <FormField
                label="Contact number"
                value={draft.contact_number}
                onChangeText={setField('contact_number')}
                maxLength={20}
                keyboardType="phone-pad"
                hint={contactRuleHint()}
                error={fieldErrors.contact_number}
              />
            </View>
            {/* The label still changes while the write is in flight; `loading`
                adds the spinner and the busy state. */}
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button onPress={closeEdit} disabled={savingEdit}>
                Cancel
              </Button>
              <Button variant="primary" onPress={submitEdit} loading={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save'}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
