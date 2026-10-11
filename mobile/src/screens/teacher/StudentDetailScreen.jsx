import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Modal, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import { StudentDetailSkeleton } from '../../components/SkeletonShapes';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import useSkeleton from '../../hooks/useSkeleton';
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
// §25), the class and the status badge, then its actions and the notes that
// say what this teacher may not do here — and ONE FACT CARD (two until the
// privacy build, 2026-10-10): who the learner is. The learner's birthday,
// gender, address and contact number — and the Contact details card — are
// gone: no longer collected (decision 6). Create parent account is the
// screen's one filled action.
//
// PULL TO REFRESH is load() — the same GET the screen opens with; the record
// stays on screen under the pull spinner (only the first load, and the
// re-read after Create parent, show the whole-screen spinner).
const EMPTY_EDIT = { first_name: '', last_name: '' };

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
  const [notInScope, setNotInScope] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [advised, setAdvised] = useState([]);
  const [status, setStatus] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [draft, setDraft] = useState(EMPTY_EDIT);

  useLayoutEffect(() => {
    navigation.setOptions({ title: student ? `${student.first_name} ${student.last_name}` : 'Student' });
  }, [navigation, student]);

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (pull) setRefreshing(true);
      else setLoading(true);
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
        setRefreshing(false);
      }
    },
    [id]
  );

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
    setStatus(null);
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setEditError(null);
    setDraft(EMPTY_EDIT);
  }

  function setField(field) {
    return (value) => {
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
    setSavingEdit(true);
    try {
      // Omit grade_level, section, lrn, status: a class change is refused
      // with 400 and omitting cannot trip it.
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
      setDraft(EMPTY_EDIT);
    } catch (err) {
      setEditError(extractError(err));
    } finally {
      setSavingEdit(false);
    }
  }

  // A pull with no record on screen (from the error or not-found state) shows
  // the loading frame too, never a blank screen.
  // The record's skeleton (feat/skeleton-tier2-phone), on the same guard: a
  // first load, or a pull with no record on screen. The stack header's back
  // arrow stays above it.
  const firstRead = loading || (refreshing && !student);
  const phase = useSkeleton(firstRead);
  if (firstRead) return <StudentDetailSkeleton phase={phase} fields={1} />;

  const pull = <RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />;

  if (notInScope) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4" refreshControl={pull}>
        <View className={cardClass}>
          <EmptyState icon="fa-user-slash" title="This student is not in your classes" message="You can only open students in the sections you teach or advise." />
        </View>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4" refreshControl={pull}>
        <ErrorAlert message={error} onRetry={() => load()} />
      </ScrollView>
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

      {/* What a teacher needs to identify a learner; section_id, created_by
          and the timestamps are omitted as on the web. */}
      <View className={`${cardClass} gap-4 p-4`}>
        <CardTitle icon="fa-id-card">Student details</CardTitle>
        <Field label="LRN" value={student.lrn} />
      </View>

      <Modal visible={editOpen} animationType="slide" onRequestClose={closeEdit} presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: tokens.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
            <Text accessibilityRole="header" className="font-serif text-xl text-fg">
              Edit student
            </Text>
            {editError ? <ErrorAlert message={editError} /> : null}
            <View className={`${cardClass} gap-4 p-4`}>
              <FormField label="LRN" value={student.lrn} editable={false} accessibilityState={{ disabled: true }} style={readOnlyStyle} />
              <FormField label="First name" required value={draft.first_name} onChangeText={setField('first_name')} />
              <FormField label="Last name" required value={draft.last_name} onChangeText={setField('last_name')} />
              <FormField
                label="Grade level"
                value={`Grade ${student.grade_level}`}
                editable={false}
                accessibilityState={{ disabled: true }}
                style={readOnlyStyle}
              />
              <FormField label="Section" value={student.section} editable={false} accessibilityState={{ disabled: true }} style={readOnlyStyle} />
              {/* §5i: the fact plus the reason; no transfer route is named. */}
              <Text className="text-sm text-fg-muted">A student's class cannot be changed here. The system does not support moving a student between classes.</Text>
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
