import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import { ClassRecordSkeleton } from '../../components/SkeletonShapes';
import Text from '../../components/Text';
import { todayLocalDateString } from '../../format/date';
import { currentTerm } from '../../format/schoolCalendar';
import useSkeleton from '../../hooks/useSkeleton';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
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
//
// THE LOOK (feat/ui-refresh, 2026-10-03): the section header, one card that
// chooses WHICH record (each picker under its own label — the word was only
// the control's accessible name before), then the three groups, each a
// heading over its slots, each slot its own card and a 48dp target that
// answers a press with Android's ripple (a prop, never a style function —
// M20). PULL TO REFRESH is `record.reload`, the request the focus effect
// already makes; nothing is typed on this screen, so there is nothing for it
// to discard. The entrance is on the header alone: a slot row is the way into
// grade entry and does not move.
const TERMS = [1, 2, 3].map((t) => ({ key: t, label: `Term ${t}` }));
const EXAM_PARTS = ['st1', 'st2', 'te'];
const TABULAR = { fontVariant: ['tabular-nums'] };
const LABEL = 'mb-1.5 text-sm font-semibold text-fg-secondary';

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

// ONE SLOT, ONE CARD. The code sits in a chip that grows with the OS font
// scale (a minimum width, never a fixed one), the name may wrap, and the
// highest possible score keeps its place on the right.
function SlotRow({ code, title, hps, scored, total, onPress }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hps === null ? 'highest possible score not set' : `out of ${hps}`}, ${scored} of ${total} scored`}
      android_ripple={{ color: tokens['edge-strong'] }}
      className={`${cardClass} flex-row items-center gap-3 overflow-hidden px-4 py-3`}
      style={{ minHeight: 48 }}
    >
      <View className="h-9 items-center justify-center rounded-xl bg-brand-soft px-2" style={{ minWidth: 44 }}>
        <Text className="text-xs font-bold text-brand">{code}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className="text-sm font-semibold text-fg">
          {title}
        </Text>
        <Text className="text-xs text-fg-muted" style={TABULAR}>
          {scored} of {total} scored
        </Text>
      </View>
      {hps === null ? (
        <View className="rounded-lg border border-dashed border-edge-strong px-2 py-0.5">
          <Text className="text-xs text-fg-muted">Set HPS</Text>
        </View>
      ) : (
        <Text className="text-sm text-fg-body" style={TABULAR}>
          / {hps}
        </Text>
      )}
      <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} />
    </Pressable>
  );
}

// A group of slots: its name and weight as the heading, its slots under it.
function SlotGroup({ label, children }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </Text>
      {children}
    </View>
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

  // THE SKELETONS, AND WHOSE RECORD IS ON SCREEN (feat/skeleton-tier2-phone).
  // The server names the class it answered for, so a record from the previous
  // subject, class or term is told apart from this pick without new state:
  // until this pick's record arrives the slot list is skeleton — never the
  // old class's counts under the new pickers, never a row that opens the new
  // pick from the old one's numbers. The focus re-read of the SAME pick keeps
  // the list on screen (the record still matches it).
  const recordIsPick = Boolean(
    server &&
      classKey &&
      Number(server.subject?.id) === Number(classKey.subject_id) &&
      Number(server.grade_level) === Number(classKey.grade_level) &&
      server.section === classKey.section &&
      Number(server.term) === Number(classKey.term) &&
      server.school_year === classKey.school_year
  );
  const classesLoading = assignments === null || settings === null;
  const classesPhase = useSkeleton(classesLoading);
  const recordPhase = useSkeleton(!recordIsPick);

  let body;
  if (assignmentsError || settingsError) body = <ErrorAlert message={assignmentsError || settingsError} />;
  else if (classesLoading) body = <ClassRecordSkeleton phase={classesPhase} label="Loading your classes…" pickers />;
  else if (assignments.length === 0) {
    body = (
      <View className={cardClass}>
        <EmptyState icon="fa-chart-simple" title="No classes assigned to you" message="A class record needs a subject you are assigned to teach. Ask an admin to add the assignment." />
      </View>
    );
  } else if (record.error) body = <ErrorAlert message={record.error} onRetry={reload} />;
  else if (!recordIsPick) body = <ClassRecordSkeleton phase={recordPhase} label="Loading the class record…" />;
  else {
    const weights = server.weights || {};
    body = (
      <View className="gap-4">
        {!server.can_encode ? (
          <View className="flex-row items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            <Icon name="fa-eye" size={14} color={tokens['fg-faint']} style={{ marginTop: 3 }} />
            <Text className="min-w-0 flex-1 text-sm text-fg-body">
              You can see this class record but not change it — you are not the assigned teacher for {server.subject.name} in Grade {server.grade_level} - {server.section}.
            </Text>
          </View>
        ) : null}
        {learners.length === 0 ? (
          <View className={cardClass}>
            <EmptyState
              icon="fa-user-graduate"
              title="No active learners in this class"
              message={`Grade ${server.grade_level} - ${server.section} has no active learners, so there is nothing to record yet.`}
            />
          </View>
        ) : null}
        {[
          ['ww', 'Written / Oral Works', frame.filter((s) => s.type === 'WW')],
          ['pt', 'Performance Tasks', frame.filter((s) => s.type === 'PT')],
        ].map(([group, label, slots]) => (
          <SlotGroup key={group} label={`${label} · ${weights[group] ?? '—'}%`}>
            {slots.map((slot) => (
              <SlotRow
                key={slotKey(slot.type, slot.slot_no)}
                code={`${slot.type}${slot.slot_no}`}
                title={slot.name || slot.display_label}
                hps={slot.max_score}
                scored={slot.id ? scoredCounts[slot.id] || 0 : 0}
                total={learners.length}
                onPress={() => open({ kind: 'slot', type: slot.type, slot_no: slot.slot_no }, `${slot.type}${slot.slot_no}`)}
              />
            ))}
          </SlotGroup>
        ))}
        <SlotGroup label={`${descriptive ? 'Summative' : 'Summative Tests & Term Exam'} · ${weights.ex ?? '—'}%`}>
          {EXAM_PARTS.map((part) => (
            <SlotRow
              key={part}
              code={part.toUpperCase()}
              title={part === 'te' ? 'Term exam' : `Summative test ${part.slice(2)}`}
              hps={server.exam_max?.[part] ?? null}
              scored={learners.filter((l) => l[`ex_${part}`] !== null && l[`ex_${part}`] !== undefined).length}
              total={learners.length}
              onPress={() => open({ kind: 'exam', part }, part.toUpperCase())}
            />
          ))}
        </SlotGroup>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <Reveal>
        <View className="gap-4">
          <SectionHeader
            title="Class record"
            description="Record one assessment at a time for one subject and term. Each save writes that column for the whole class."
          />
          {/* WHICH RECORD: subject, then class, then term — the order a
              teacher thinks in. */}
          {subjects.length ? (
            <View className={`${cardClass} gap-3 p-4`}>
              <View>
                <Text className={LABEL}>Subject</Text>
                <Segmented
                  label="Subject"
                  value={subject?.id}
                  onChange={(id) => {
                    setSubjectId(id);
                    setAssignmentId(null);
                  }}
                  options={subjects.map((s) => ({ key: s.id, label: s.name }))}
                />
              </View>
              {classes.length > 1 ? (
                <View>
                  <Text className={LABEL}>Class</Text>
                  <Segmented label="Class" value={selectedClass?.id} onChange={setAssignmentId} options={classes.map((c) => ({ key: c.id, label: `Grade ${c.grade_level} - ${c.section}` }))} />
                </View>
              ) : selectedClass ? (
                // One class is not a choice, so it is named instead of offered.
                <View>
                  <Text className={LABEL}>Class</Text>
                  <Text className="text-base font-semibold text-fg">
                    Grade {selectedClass.grade_level} - {selectedClass.section}
                  </Text>
                </View>
              ) : null}
              <View>
                <Text className={LABEL}>Term</Text>
                <Segmented label="Term" value={term} onChange={setTerm} options={TERMS} />
              </View>
            </View>
          ) : null}
        </View>
      </Reveal>
      {body}
    </ScrollView>
  );
}
