import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDrawerStatus } from '@react-navigation/drawer';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { Alert, BackHandler, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { createTickets } from '../../api/tickets';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DateField from '../../components/DateField';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import {
  AttendanceRegisterSkeleton,
  RosterCardsSkeleton,
  RosterNoteSkeleton,
  RosterSaveBarSkeleton,
  RosterSummarySkeleton,
} from '../../components/SkeletonShapes';
import Text from '../../components/Text';
import { longDate, todayLocalDateString } from '../../format/date';
import { useQueryRows, useSkeleton } from '../../hooks/useSkeleton';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { markRestPresent, pickStatus, ROW_STATE_LABEL, rosterCounts, rowState, unsavedCount } from './attendance/roster';
import StatusButtons, { StatusCounts } from './attendance/StatusButtons';
import { setLeaveGuard } from '../../navigation/leaveGuard';

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
//   3. EVERY OTHER EXIT, while this screen is FOCUSED and has unsaved marks
//      (fix/leave-guard, 2026-10-01, the owner's decision): a drawer item,
//      the account card, the bell and Logout ask through
//      navigation/leaveGuard.js, and the hardware Back button asks here.
//      Because a drawer screen stays mounted, "Leave and discard" must
//      really discard: it resets the marks to the last saved state BEFORE
//      the exit runs, or the word would be a lie (§5i). Logout would lose
//      them anyway — that is the one exit that took them with no warning.
//
// PULL TO REFRESH IS `loadRoster` ITSELF (fix round, 2026-10-04) — the same
// two requests, for the class and day chosen above. loadRoster resets the
// marks from the database, so WHILE ANYTHING IS UNSAVED THE PULL IS DISABLED
// (a refresh must never be a silent discard, and the leave prompt's sentence
// would be wrong for it — §5i), and while a save is in flight (the save does
// its own re-read). WHILE A PULL'S READ IS IN FLIGHT THE ROSTER TAKES NO
// TOUCHES and Save waits: a mark tapped during the request would be replaced
// when its reply lands, with nothing said. `refreshing` is set and cleared by
// the pull's handler alone, so a save's own re-read and a date or section
// change look exactly as they did.
//
// NOTHING ON THIS SCREEN MOVES (the refresh's motion rule): no entrance, and
// nothing above the roster changes height while a register is being marked —
// the four counts are equal tiles, and a row's state sits under the name, not
// beside it.
//
// One title on every bulk-entry screen, web and phone (owner decision).
const PROMPT_TITLE = 'Leave without saving?';
const TABULAR = { fontVariant: ['tabular-nums'] };

export default function AttendanceScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
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
  const [refreshing, setRefreshing] = useState(false);

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

  // LATEST REPLY WINS (feat/skeleton-tier2-phone, api/tickets.js mirrored): a
  // date or section change starts a new read while the last may be in flight,
  // and the older register must not land last under the new day — its marks
  // would then be saved for the wrong date. Each read takes a ticket; its
  // reply, its failure and its end apply only while it is the newest.
  const [rosterTickets] = useState(createTickets);

  const loadRoster = useCallback(async () => {
    if (!section) return;
    const ticket = rosterTickets.take();
    setRosterLoading(true);
    setRosterError(null);
    setStatus(null);
    try {
      // Both COMPLETE sets (C2): every active learner, every row for the date.
      const [students, existing] = await Promise.all([
        fetchAll('/students', { unwrap: 'students', params: { grade_level: section.grade_level, section: section.name, status: 'active' } }),
        fetchAll('/attendance', { unwrap: 'attendance', params: { grade_level: section.grade_level, section: section.name, date } }),
      ]);
      if (!rosterTickets.isLatest(ticket)) return;
      const existingByStudent = new Map(existing.map((row) => [row.student_id, row.status]));
      setRoster(students);
      setMarks(Object.fromEntries(students.map((s) => [s.id, existingByStudent.get(s.id) || ''])));
      setRecorded(existingByStudent);
    } catch (err) {
      if (!rosterTickets.isLatest(ticket)) return;
      setRosterError(extractError(err));
      setRoster([]);
      setMarks({});
      setRecorded(new Map());
    } finally {
      if (rosterTickets.isLatest(ticket)) setRosterLoading(false);
    }
  }, [section, date, rosterTickets]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const entries = useMemo(() => roster.filter((s) => marks[s.id]).map((s) => ({ student_id: s.id, status: marks[s.id] })), [roster, marks]);
  const counts = useMemo(() => rosterCounts(roster, marks), [roster, marks]);
  const unsaved = useMemo(() => unsavedCount(roster, marks, recorded), [roster, marks, recorded]);

  // The pull's handler — never while anything is unsaved or a save is in
  // flight (the pull is disabled then too; this guards a platform that
  // ignores `enabled`). loadRoster keeps its own failure in `rosterError` and
  // never rejects.
  const canPull = unsaved === 0 && !saving;
  async function pullToRefresh() {
    if (!canPull) return;
    setRefreshing(true);
    try {
      await loadRoster();
    } finally {
      setRefreshing(false);
    }
  }
  const pull = (
    <RefreshControl
      refreshing={refreshing}
      enabled={canPull}
      onRefresh={pullToRefresh}
      tintColor={tokens['fg-muted']}
      colors={[tokens.brand]}
    />
  );
  const unsetCount = roster.length - entries.length;
  const isUpdate = recorded.size > 0;

  const pick = useCallback((id, value) => setMarks((m) => pickStatus(m, recorded, id, value)), [recorded]);

  function promptBody(verb) {
    return `You have ${unsaved} unsaved mark${unsaved === 1 ? '' : 's'} for ${className} on ${longDate(date)}. ${verb} discards ${unsaved === 1 ? 'it' : 'them'} — nothing has been sent to the server yet.`;
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

  // 3. Every other exit, while focused and dirty. The marks go back to what
  // the database holds (`recorded`) before the exit runs — the screen stays
  // mounted behind the next one, so without this they would quietly survive.
  const drawerStatus = useDrawerStatus();
  useFocusEffect(
    useCallback(() => {
      if (unsaved === 0) return undefined;
      // promptBody('Leaving now'), spelled out so the dependency list below is
      // complete without listing a function that is new on every render.
      const body = `You have ${unsaved} unsaved mark${unsaved === 1 ? '' : 's'} for ${className} on ${longDate(date)}. Leaving now discards ${unsaved === 1 ? 'it' : 'them'} — nothing has been sent to the server yet.`;
      const ask = (proceed) => {
        Alert.alert(PROMPT_TITLE, body, [
          { text: 'Stay on this page', style: 'cancel' },
          {
            text: 'Leave and discard',
            style: 'destructive',
            onPress: () => {
              setMarks(Object.fromEntries(roster.map((s) => [s.id, recorded.get(s.id) || ''])));
              proceed();
            },
          },
        ]);
      };
      const release = setLeaveGuard(ask);
      // The hardware Back button: the drawer would jump to its first screen.
      // An OPEN drawer is left to close itself — Back closing the drawer
      // leaves nothing behind.
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (drawerStatus === 'open') return false;
        ask(() => navigation.goBack());
        return true;
      });
      return () => {
        release();
        sub.remove();
      };
    }, [unsaved, className, date, roster, recorded, drawerStatus, navigation])
  );

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

  // THE SKELETONS (feat/skeleton-tier2-phone), above every return. The
  // sections: the whole register waits on them, in its own card shape (the
  // web's fix round T1). The roster: WAITING IS "THE ROWS ON SCREEN ARE NOT
  // THIS REGISTER'S" (the web's T2) — from the render where the section or the
  // date changes, before its read starts — or a first read with nothing on
  // screen. While it waits, everything computed from the old roster is
  // skeleton in place: the summary card (counts and Mark all Present), the
  // cards, the note and the pinned Save bar. Save's re-read and a pull keep
  // the cards, which take no touches until it answers (the owner's Q4).
  const sectionsPhase = useSkeleton(sections === null);
  const rosterCurrent = useQueryRows(roster, rosterLoading, [sectionId, date]);
  const rosterWaiting = !rosterCurrent || (rosterLoading && roster.length === 0);
  const rosterPhase = useSkeleton(rosterWaiting);

  if (sectionsError) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={sectionsError} />
      </View>
    );
  }
  if (sections === null) return <AttendanceRegisterSkeleton phase={sectionsPhase} />;
  if (!sections.length) {
    return (
      <View className="flex-1 bg-page p-4">
        <View className={cardClass}>
          <EmptyState
            icon="fa-clipboard-user"
            title="You are not the adviser of any section"
            message="Attendance is recorded by the section adviser. An admin can assign you to a section from the Sections page."
          />
        </View>
      </View>
    );
  }

  const header = (
    <View className="mb-4 gap-4">
      {/* WHICH REGISTER: the class and the day. Everything below this card is
          that one register. */}
      <View className={`${cardClass} gap-3 p-4`}>
        <View>
          <Text className="mb-1.5 text-sm font-semibold text-fg-secondary">Section</Text>
          {sections.length === 1 ? (
            <Text className="text-base font-semibold text-fg">{className}</Text>
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

      {/* The description names the register: the class, then the day. */}
      <SectionHeader title="Roster" description={`${className} · ${longDate(date)}`} />

      {rosterWaiting ? (
        <RosterSummarySkeleton phase={rosterPhase} />
      ) : roster.length ? (
        <View className={`${cardClass} gap-3 p-4`}>
          <View className="flex-row items-center gap-3">
            <Text className="min-w-0 flex-1 text-sm font-semibold text-fg" style={TABULAR}>
              {counts.marked} of {counts.total} marked
            </Text>
            {/* The label names what it does: it never overwrites (§5i). */}
            <Button variant="secondary" size="sm" onPress={() => setMarks((m) => markRestPresent(roster, m))} disabled={counts.marked === counts.total}>
              {counts.marked === 0 ? 'Mark all Present' : 'Mark the rest Present'}
            </Button>
          </View>
          <StatusCounts counts={counts} />
        </View>
      ) : null}
    </View>
  );

  const footer = roster.length ? (
    <View className="mt-4 gap-3">
      {unsetCount > 0 ? (
        <View className="flex-row items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
          <Icon name="fa-circle-info" size={14} color={tokens['fg-faint']} style={{ marginTop: 3 }} />
          <Text className="min-w-0 flex-1 text-sm text-fg-body">
            {unsetCount} of {roster.length} student{roster.length === 1 ? '' : 's'} {unsetCount === 1 ? 'has' : 'have'} no status and will not be submitted.
          </Text>
        </View>
      ) : null}
      <FormStatus status={status} />
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-page">
      {rosterWaiting ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {header}
          <RosterCardsSkeleton phase={rosterPhase} />
          <View className="mt-4">
            <RosterNoteSkeleton phase={rosterPhase} />
          </View>
        </ScrollView>
      ) : rosterError ? (
        <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={pull}>
          {header}
          <ErrorAlert message={rosterError} onRetry={loadRoster} />
        </ScrollView>
      ) : roster.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={pull}>
          {header}
          <View className={cardClass}>
            <EmptyState icon="fa-user-graduate" title="No students in this section" message="Students appear here once they are enrolled in this section." />
          </View>
        </ScrollView>
      ) : (
        // While a pull's read is in flight no mark may be tapped (see the
        // header), nor while a save and its re-read are (the owner's Q4, the
        // web's inert cards): the wrapper, not the list, takes the touch
        // block — a plain View honours `pointerEvents` on every platform.
        <View className="flex-1" pointerEvents={refreshing || saving ? 'none' : 'auto'}>
          <FlatList
            data={roster}
            keyExtractor={(s) => String(s.id)}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            ItemSeparatorComponent={() => <View className="h-3" />}
            contentContainerStyle={{ padding: 16 }}
            refreshControl={pull}
            renderItem={({ item: s }) => {
              const state = rowState(s.id, marks, recorded);
              return (
                // ONE CARD PER LEARNER. The words carry the row's state; the
                // tone and the weight only repeat it.
                <View className={`${cardClass} p-4`}>
                  {/* No LRN on the phone card (§5c). */}
                  <Text className="text-base font-semibold text-fg">
                    {s.last_name}, {s.first_name}
                  </Text>
                  <Text className={`mt-0.5 text-xs ${state === 'changed' ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}>{ROW_STATE_LABEL[state]}</Text>
                  <View className="mt-3">
                    <StatusButtons student={s} marks={marks} onPick={pick} />
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {rosterWaiting ? (
        <RosterSaveBarSkeleton phase={rosterPhase} />
      ) : roster.length ? (
        // THE PINNED SAVE BAR, outside the list and above the frame's bottom
        // inset, with the unsaved count so Save is never a guess. Save is the
        // screen's one filled button.
        <View className="flex-row items-center gap-3 border-t border-edge bg-surface px-4 py-3">
          <Text className={`min-w-0 flex-1 text-sm ${unsaved ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}>
            {unsaved === 0 ? 'No unsaved changes' : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
          </Text>
          <Button variant="primary" onPress={handleSubmit} loading={saving} disabled={saving || refreshing || entries.length === 0}>
            {saving ? 'Saving…' : isUpdate ? 'Update attendance' : 'Save attendance'}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
