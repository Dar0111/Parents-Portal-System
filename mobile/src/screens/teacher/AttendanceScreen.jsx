import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DateField from '../../components/DateField';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import { longDate, todayLocalDateString } from '../../format/date';
import { markRestPresent, pickStatus, ROW_STATE_LABEL, rosterCounts, rowState, unsavedCount } from './attendance/roster';
import StatusButtons from './attendance/StatusButtons';

// TEACHER → ATTENDANCE (encode) — the web's AttendancePage.jsx on the phone,
// the bespoke card list the web already uses below `sm` (§17c). The ADVISER
// records it (sections.adviser_id, never teacher_assignments), so the section
// list is the sections this teacher advises; one is a heading, two or more
// are chips. `marks` (what the teacher typed) and `recorded` (the database's
// answer, written only by loadRoster) are two states (§5b); the roster logic
// is the verbatim `attendance/roster.js`. Counts only, never a rate. Unmarked
// rows are omitted from the request, never defaulted to Present.
//
// THE PROMPT (MOBILE_CONVENTIONS M14, the declared deviation). Two places:
//   1. IN-SCREEN, on a date or section change with unsaved marks (Darryl,
//      branch 3 decision 2) — that change reloads the roster and would
//      discard them.
//   2. `usePreventRemove` while anything is unsaved — the approved
//      `beforeRemove`. MEASURED IN THE ROUTER, NOT ASSUMED: a drawer screen
//      is never REMOVED by Back or by another drawer item (the drawer
//      changes its index and keeps every route, backBehavior 'firstRoute'),
//      so this screen stays mounted and its marks SURVIVE the trip. The
//      hook fires only if something ever removes the route; the phone check
//      proves the marks are still there on return.
const PROMPT_TITLE = 'Leave without saving attendance?';

export default function AttendanceScreen({ navigation }) {
  const { user } = useAuth();
  const today = todayLocalDateString();

  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);
  const [date, setDate] = useState(today);

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState(null);
  const [marks, setMarks] = useState({});
  const [recorded, setRecorded] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((s) => Number(s.adviser_id) === Number(user?.id));
        setSections(mine);
        if (mine.length) setSectionId(mine[0].id);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const section = useMemo(() => (sections || []).find((s) => s.id === sectionId) || null, [sections, sectionId]);
  const className = section ? `Grade ${section.grade_level} - ${section.name}` : '';

  const loadRoster = useCallback(async () => {
    if (!section) return;
    setRosterLoading(true);
    setRosterError(null);
    setStatus(null);
    try {
      // Both COMPLETE sets (C2): every active learner, every row for the date.
      const [students, existing] = await Promise.all([
        fetchAll('/students', { unwrap: 'students', params: { grade_level: section.grade_level, section: section.name, status: 'active' } }),
        fetchAll('/attendance', { unwrap: 'attendance', params: { grade_level: section.grade_level, section: section.name, date } }),
      ]);
      const existingByStudent = new Map(existing.map((row) => [row.student_id, row.status]));
      setRoster(students);
      setMarks(Object.fromEntries(students.map((s) => [s.id, existingByStudent.get(s.id) || ''])));
      setRecorded(existingByStudent);
    } catch (err) {
      setRosterError(extractError(err));
      setRoster([]);
      setMarks({});
      setRecorded(new Map());
    } finally {
      setRosterLoading(false);
    }
  }, [section, date]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const entries = useMemo(() => roster.filter((s) => marks[s.id]).map((s) => ({ student_id: s.id, status: marks[s.id] })), [roster, marks]);
  const counts = useMemo(() => rosterCounts(roster, marks), [roster, marks]);
  const unsaved = useMemo(() => unsavedCount(roster, marks, recorded), [roster, marks, recorded]);
  const unsetCount = roster.length - entries.length;
  const isUpdate = recorded.size > 0;

  const pick = useCallback((id, value) => setMarks((m) => pickStatus(m, recorded, id, value)), [recorded]);

  function promptBody(verb) {
    return `You have ${unsaved} unsaved mark${unsaved === 1 ? '' : 's'} for ${className} on ${longDate(date)}. ${verb} discards them — nothing has been sent to the server yet.`;
  }

  // 1. In-screen: a date or section change reloads the roster.
  function guarded(apply) {
    if (unsaved === 0) {
      apply();
      return;
    }
    Alert.alert(PROMPT_TITLE, promptBody('Changing the date or section'), [
      { text: 'Stay on this page', style: 'cancel' },
      { text: 'Leave and discard', style: 'destructive', onPress: apply },
    ]);
  }

  // 2. The approved beforeRemove, via React Navigation's own hook.
  usePreventRemove(unsaved > 0, ({ data }) => {
    Alert.alert(PROMPT_TITLE, promptBody('Leaving now'), [
      { text: 'Stay on this page', style: 'cancel' },
      { text: 'Leave and discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  async function handleSubmit() {
    if (!section || saving || entries.length === 0) return;
    setSaving(true);
    setStatus(null);
    try {
      await api.post('/attendance/bulk', { section_id: section.id, date, entries }, { unwrap: 'attendance' });
      // Re-read FIRST, message second (fix/smoke-gate): loadRoster clears the
      // status, so a message set before it never painted.
      const saved = entries.length;
      await loadRoster();
      setStatus(ok(`Attendance saved for ${saved} student${saved === 1 ? '' : 's'}.`));
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  if (sectionsError) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={sectionsError} />
      </View>
    );
  }
  if (sections === null) return <LoadingSpinner className="py-16" label="Loading your sections…" />;
  if (!sections.length) {
    return (
      <View className="flex-1 bg-page p-4">
        <EmptyState
          icon="fa-clipboard-user"
          title="You are not the adviser of any section"
          message="Attendance is recorded by the section adviser. An admin can assign you to a section from the Sections page."
        />
      </View>
    );
  }

  const header = (
    <View className="mb-3 gap-3">
      <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
        <View>
          <Text className="mb-1.5 text-sm font-medium text-fg-secondary">Section</Text>
          {sections.length === 1 ? (
            <Text className="text-sm font-semibold text-fg">{className}</Text>
          ) : (
            <Segmented
              label="Section"
              value={sectionId}
              onChange={(id) => id !== sectionId && guarded(() => setSectionId(id))}
              options={sections.map((s) => ({ key: s.id, label: `Grade ${s.grade_level} - ${s.name}` }))}
            />
          )}
        </View>
        {/* The value is a local YYYY-MM-DD string sent verbatim; max today
            mirrors the API's not-in-the-future rule. */}
        <DateField label="Date" value={date} maximumDate={today} onChange={(next) => next !== date && guarded(() => setDate(next))} />
      </View>

      {roster.length ? (
        <View className="flex-row flex-wrap items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-fg">
              {counts.marked} of {counts.total} marked
            </Text>
            <Text className="text-xs text-fg-muted">
              Present {counts.Present} · Late {counts.Late} · Absent {counts.Absent} · Excused {counts.Excused}
            </Text>
          </View>
          <Pressable
            onPress={() => setMarks((m) => markRestPresent(roster, m))}
            disabled={counts.marked === counts.total}
            accessibilityRole="button"
            accessibilityState={{ disabled: counts.marked === counts.total }}
            className={`h-11 justify-center rounded-lg border border-edge-strong px-3.5 ${counts.marked === counts.total ? 'opacity-50' : ''}`}
          >
            {/* The label names what it does: it never overwrites (§5i). */}
            <Text className="text-sm font-semibold text-fg-body">{counts.marked === 0 ? 'Mark all Present' : 'Mark the rest Present'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const footer = roster.length ? (
    <View className="mt-3 gap-3">
      {unsetCount > 0 ? (
        <Text className="text-sm text-fg-muted">
          {unsetCount} of {roster.length} student{roster.length === 1 ? '' : 's'} {unsetCount === 1 ? 'has' : 'have'} no status and will not be submitted.
        </Text>
      ) : null}
      <FormStatus status={status} />
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-page">
      {rosterLoading && !roster.length ? (
        <View className="p-4">
          {header}
          <LoadingSpinner className="py-10" label="Loading the roster…" />
        </View>
      ) : rosterError ? (
        <View className="p-4">
          {header}
          <ErrorAlert message={rosterError} onRetry={loadRoster} />
        </View>
      ) : roster.length === 0 ? (
        <View className="p-4">
          {header}
          <EmptyState icon="fa-user-graduate" title="No students in this section" message="Students appear here once they are enrolled in this section." />
        </View>
      ) : (
        <FlatList
          data={roster}
          keyExtractor={(s) => String(s.id)}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ItemSeparatorComponent={() => <View className="h-2" />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item: s }) => {
            const state = rowState(s.id, marks, recorded);
            return (
              <View className="rounded-xl border border-edge bg-surface p-3">
                {/* No LRN on the phone card (§5c). */}
                <Text className="font-semibold text-fg">
                  {s.last_name}, {s.first_name}
                </Text>
                <Text className={`text-xs ${state === 'changed' ? 'text-warning-fg' : 'text-fg-muted'}`}>{ROW_STATE_LABEL[state]}</Text>
                <View className="mt-2.5">
                  <StatusButtons student={s} marks={marks} onPick={pick} />
                </View>
              </View>
            );
          }}
        />
      )}

      {roster.length ? (
        // THE PINNED SAVE BAR, outside the list and above the frame's bottom
        // inset, with the unsaved count so Save is never a guess.
        <View className="flex-row items-center gap-3 border-t border-edge bg-surface px-4 py-3">
          <Text className={`flex-1 text-sm ${unsaved ? 'text-warning-fg' : 'text-fg-muted'}`}>
            {unsaved === 0 ? 'No unsaved changes' : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
          </Text>
          <Pressable
            onPress={handleSubmit}
            disabled={saving || entries.length === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || entries.length === 0, busy: saving }}
            className={`h-11 justify-center rounded-lg bg-primary px-4 ${saving || entries.length === 0 ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : isUpdate ? 'Update attendance' : 'Save attendance'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
