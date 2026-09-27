import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import { todayLocalDateString } from '../../format/date';
import { currentTerm } from '../../format/schoolCalendar';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { buildSlotFrame, slotKey } from './classRecord/buildPayload';
import useSlotRecord from './classRecord/useSlotRecord';

// TEACHER → GRADES — the class record ONE SLOT AT A TIME (MOBILE_CONVENTIONS
// M13). The web's grid is a sheet of 30-odd columns; a phone shows the
// choice instead: Subject → Class → Term, then the fixed frame (WW1–5, PT1–3,
// and the three Summative parts) as a list, each row naming its highest
// possible score and how many learners have a score in it. A row opens the
// SLOT SCREEN, which is the only place anything is typed or saved; this
// screen re-reads on focus so a save there shows here.
//
// ENCODE SCOPE IS ASSIGNMENTS ONLY (never `useTeacherTargets`): the subject
// and class choices come from GET /assignments, and an adviser with no
// assignment (TCH-002) gets the explaining empty state. THE TERM IS PINNED
// ONCE from the school calendar (§13g) and the segment overrides it.
const TERMS = [1, 2, 3].map((t) => ({ key: t, label: `Term ${t}` }));
const EXAM_PARTS = ['st1', 'st2', 'te'];

function useAssignments() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchAll('/assignments', { unwrap: 'assignments' })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const subjects = useMemo(() => {
    if (!rows) return [];
    const byId = new Map();
    for (const row of rows) if (!byId.has(row.subject_id)) byId.set(row.subject_id, { id: row.subject_id, name: row.subject_name });
    return [...byId.values()];
  }, [rows]);
  const classesFor = useCallback(
    (subjectId) =>
      !rows || subjectId == null
        ? []
        : rows
            .filter((row) => Number(row.subject_id) === Number(subjectId))
            .map((row) => ({ id: row.id, grade_level: row.grade_level, section: row.section }))
            .sort((a, b) => a.grade_level - b.grade_level || String(a.section).localeCompare(String(b.section))),
    [rows]
  );
  return { rows, subjects, classesFor, error };
}

function SlotRow({ code, title, hps, scored, total, onPress, first }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hps === null ? 'highest possible score not set' : `out of ${hps}`}, ${scored} of ${total} scored`}
      className={`flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-edge-soft'}`}
    >
      <Text className="w-10 text-sm font-semibold text-fg">{code}</Text>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm text-fg">
          {title}
        </Text>
        <Text className="text-xs text-fg-muted">
          {scored} of {total} scored
        </Text>
      </View>
      {hps === null ? (
        <View className="rounded border border-dashed border-edge-strong px-2 py-0.5">
          <Text className="text-xs text-fg-muted">Set HPS</Text>
        </View>
      ) : (
        <Text className="text-sm text-fg-body" style={{ fontVariant: ['tabular-nums'] }}>
          / {hps}
        </Text>
      )}
      <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} />
    </Pressable>
  );
}

export default function GradesScreen({ navigation }) {
  const { tokens } = useTheme();
  const { rows: assignments, subjects, classesFor, error: assignmentsError } = useAssignments();
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [assignmentId, setAssignmentId] = useState(null);
  const [pinnedTerm] = useState(() => currentTerm(todayLocalDateString()));
  const [term, setTerm] = useState(pinnedTerm);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const subject = subjects.find((s) => s.id === subjectId) || subjects[0] || null;
  const classes = useMemo(() => classesFor(subject?.id), [classesFor, subject]);
  const selectedClass = classes.find((c) => c.id === assignmentId) || classes[0] || null;

  const classKey = useMemo(() => {
    if (!selectedClass || !settings?.academic_year || !subject) return null;
    return { subject_id: subject.id, grade_level: selectedClass.grade_level, section: selectedClass.section, term, school_year: settings.academic_year };
  }, [selectedClass, subject, term, settings]);

  const record = useSlotRecord(classKey);
  const { server, reload } = record;

  // A save on the slot screen changed the rows: re-read on every return.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const learners = useMemo(() => server?.learners ?? [], [server]);
  const frame = useMemo(() => buildSlotFrame(server?.slots || []), [server]);
  const scoredCounts = useMemo(() => {
    const counts = {};
    for (const learner of learners) for (const slotId of Object.keys(learner.scores || {})) counts[slotId] = (counts[slotId] || 0) + 1;
    return counts;
  }, [learners]);
  const descriptive = server?.grading_mode === 'descriptive';

  function open(target, title) {
    navigation.navigate('ClassRecordSlot', { classKey, target, title });
  }

  let body;
  if (assignmentsError || settingsError) body = <ErrorAlert message={assignmentsError || settingsError} />;
  else if (assignments === null || settings === null) body = <LoadingSpinner className="py-12" label="Loading your classes…" />;
  else if (assignments.length === 0) {
    body = (
      <EmptyState icon="fa-chart-simple" title="No classes assigned to you" message="A class record needs a subject you are assigned to teach. Ask an admin to add the assignment." />
    );
  } else if (record.error) body = <ErrorAlert message={record.error} onRetry={reload} />;
  else if (!server) body = <LoadingSpinner className="py-12" label="Loading the class record…" />;
  else {
    const weights = server.weights || {};
    body = (
      <View className="gap-3">
        {!server.can_encode ? (
          <View className="rounded-lg border border-edge bg-surface-subtle px-3 py-2">
            <Text className="text-sm text-fg-muted">
              You can see this class record but not change it — you are not the assigned teacher for {server.subject.name} in Grade {server.grade_level} - {server.section}.
            </Text>
          </View>
        ) : null}
        {learners.length === 0 ? (
          <EmptyState
            icon="fa-user-graduate"
            title="No active learners in this class"
            message={`Grade ${server.grade_level} - ${server.section} has no active learners, so there is nothing to record yet.`}
          />
        ) : null}
        {[
          ['ww', 'Written / Oral Works', frame.filter((s) => s.type === 'WW')],
          ['pt', 'Performance Tasks', frame.filter((s) => s.type === 'PT')],
        ].map(([group, label, slots]) => (
          <View key={group} className="rounded-xl border border-edge bg-surface">
            <Text className="border-b border-edge px-4 py-2 text-xs font-semibold uppercase tracking-wider text-fg-body">
              {label} · {weights[group] ?? '—'}%
            </Text>
            {slots.map((slot, i) => (
              <SlotRow
                key={slotKey(slot.type, slot.slot_no)}
                first={i === 0}
                code={`${slot.type}${slot.slot_no}`}
                title={slot.name || slot.display_label}
                hps={slot.max_score}
                scored={slot.id ? scoredCounts[slot.id] || 0 : 0}
                total={learners.length}
                onPress={() => open({ kind: 'slot', type: slot.type, slot_no: slot.slot_no }, `${slot.type}${slot.slot_no}`)}
              />
            ))}
          </View>
        ))}
        <View className="rounded-xl border border-edge bg-surface">
          <Text className="border-b border-edge px-4 py-2 text-xs font-semibold uppercase tracking-wider text-fg-body">
            {descriptive ? 'Summative' : 'Summative Tests & Term Exam'} · {weights.ex ?? '—'}%
          </Text>
          {EXAM_PARTS.map((part, i) => (
            <SlotRow
              key={part}
              first={i === 0}
              code={part.toUpperCase()}
              title={part === 'te' ? 'Term exam' : `Summative test ${part.slice(2)}`}
              hps={server.exam_max?.[part] ?? null}
              scored={learners.filter((l) => l[`ex_${part}`] !== null && l[`ex_${part}`] !== undefined).length}
              total={learners.length}
              onPress={() => open({ kind: 'exam', part }, part.toUpperCase())}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-3 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Text className="text-sm text-fg-muted">Record one assessment at a time for one subject and term. Each save writes that column for the whole class.</Text>
      {subjects.length ? (
        <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
          <Segmented
            label="Subject"
            value={subject?.id}
            onChange={(id) => {
              setSubjectId(id);
              setAssignmentId(null);
            }}
            options={subjects.map((s) => ({ key: s.id, label: s.name }))}
          />
          {classes.length > 1 ? (
            <Segmented label="Class" value={selectedClass?.id} onChange={setAssignmentId} options={classes.map((c) => ({ key: c.id, label: `Grade ${c.grade_level} - ${c.section}` }))} />
          ) : selectedClass ? (
            <Text className="text-sm font-semibold text-fg">
              Grade {selectedClass.grade_level} - {selectedClass.section}
            </Text>
          ) : null}
          <Segmented label="Term" value={term} onChange={setTerm} options={TERMS} />
        </View>
      ) : null}
      {body}
    </ScrollView>
  );
}
