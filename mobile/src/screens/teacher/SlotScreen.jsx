import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
import { useTheme } from '../../theme/ThemeProvider';
import { INITIAL_GUARD, transition } from './classRecord/backGuard';
import { buildSlotFrame, parseCell, slotKey } from './classRecord/buildPayload';
import useSlotRecord from './classRecord/useSlotRecord';

// ONE COLUMN OF THE CLASS RECORD (MOBILE_CONVENTIONS M13). Header: the
// highest possible score (for a Summative part, the CLASS-WIDE maximum, with
// the web's "mixed" flag), and for a WW/PT slot its optional name. Then one
// row per learner: the score input, and under it the LIVE LINE — that
// group's total, PS and WS and the Initial / Term (or Letter), from the
// server's dry run, dimmed while one is in flight or failed.
//
// SET HPS IS A DRY RUN; SAVE ALL WRITES (the working agreement). Typing the
// HPS or a score only previews. Save writes the slot, the typed components
// and a grade row per learner scored — for EVERY learner only when it
// carries Summative maxima (M13). The
// cell rings are the web's three: red for an invalid keystroke, amber for a
// score above its HPS (a bonus is allowed, never refused), blue for changed.
//
// THE SAVE CONFIRMATION IS AN INLINE PANEL with the web's full lists (Darryl,
// branch 3 decision 1): which highest possible scores change and how many
// learners that recomputes, and every score above its maximum by name.
//
// THE LEAVE PROMPT IS `backGuard.js`, VERBATIM, driven by React Navigation.
// The web's machine decides; only what its actions DO changes: `push` and
// `back` are the web's history sentinel and are no-ops here (a cancellable
// removal needs no sentinel), `ask` is the native Alert with the web's words.
// `usePreventRemove` is armed exactly while the machine says it is.
const TITLE = 'Leave without saving?';
const BODY = 'You have unsaved scores in this slot. Leaving now discards them — nothing has been sent to the server yet.';

function cellRing(invalid, aboveMax, dirty) {
  if (invalid) return 'border-2 border-danger-edge-strong';
  if (aboveMax) return 'border-2 border-warning-edge-strong';
  if (dirty) return 'border-2 border-info-edge';
  return 'border border-edge-strong';
}

export default function SlotScreen({ navigation, route }) {
  const { classKey, target, title } = route.params;
  const { tokens } = useTheme();
  const record = useSlotRecord(classKey);
  const { server, draft, setDraft, slotDraft, setSlotDraft, examMaxDraft, setExamMaxDraft, preview, previewGroupHps, previewSlots, previewing, previewError } = record;
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const isExam = target.kind === 'exam';
  const part = isExam ? target.part : null;
  const frame = useMemo(() => buildSlotFrame(previewSlots || server?.slots || []), [previewSlots, server]);
  const slot = isExam ? null : frame.find((s) => s.type === target.type && s.slot_no === target.slot_no) || null;
  const sKey = slot ? slotKey(slot.type, slot.slot_no) : null;
  const field = isExam ? `${part}_score` : sKey;
  const group = isExam ? 'ex' : slot?.type === 'WW' ? 'ww' : 'pt';
  const descriptive = server?.grading_mode === 'descriptive';
  const canEncode = Boolean(server?.can_encode);
  const groupHps = previewGroupHps || server?.group_hps;

  useLayoutEffect(() => {
    const name = slot?.name ? ` · ${slot.name}` : '';
    navigation.setOptions({ title: `${title}${name}` });
  }, [navigation, title, slot?.name]);

  // ---- the leave guard: backGuard.js decides, the phone performs ----
  const [guard, setGuard] = useState(INITIAL_GUARD);
  const guardRef = useRef(INITIAL_GUARD);
  const step = useCallback((event) => {
    const next = transition(guardRef.current, event);
    guardRef.current = next.state;
    setGuard(next.state);
    return next.action; // 'push' / 'back' are the web's history moves: no-ops here
  }, []);

  useEffect(() => {
    step(record.dirty ? 'dirty' : 'clean');
  }, [record.dirty, step]);

  usePreventRemove(guard.armed, ({ data }) => {
    if (step('pop') !== 'ask') {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(TITLE, BODY, [
      { text: 'Stay on this page', style: 'cancel', onPress: () => step('stay') },
      {
        text: 'Leave and discard',
        style: 'destructive',
        onPress: () => {
          step('leave');
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // ---- values ----
  const hpsValue = isExam
    ? examMaxDraft[part] !== undefined
      ? examMaxDraft[part]
      : server?.exam_max?.[part] == null
        ? ''
        : String(server.exam_max[part])
    : slotDraft[sKey]?.max_score !== undefined
      ? slotDraft[sKey].max_score
      : slot?.max_score == null
        ? ''
        : String(slot.max_score);
  const nameValue = !isExam && slotDraft[sKey]?.name !== undefined ? slotDraft[sKey].name : slot?.name || '';
  const hpsParsed = parseCell(hpsValue);
  const max = hpsValue === '' || hpsParsed.error ? null : hpsParsed.value;

  const setHps = (value) => {
    setStatus(null);
    if (isExam) setExamMaxDraft((d) => ({ ...d, [part]: value }));
    else setSlotDraft((d) => ({ ...d, [sKey]: { ...d[sKey], max_score: value } }));
  };
  const setName = (value) => setSlotDraft((d) => ({ ...d, [sKey]: { ...d[sKey], name: value } }));

  const valueFor = useCallback(
    (learner) => {
      const k = `${learner.student_id}:${field}`;
      if (draft[k] !== undefined) return draft[k];
      if (isExam) {
        const stored = learner[`ex_${part}`];
        return stored === null || stored === undefined ? '' : String(stored);
      }
      const stored = slot?.id ? learner.scores?.[slot.id] : undefined;
      return stored === undefined ? '' : String(stored);
    },
    [draft, field, isExam, part, slot]
  );

  const scoredCount = useMemo(() => {
    if (!server) return 0;
    if (isExam) return server.learners.filter((l) => l[`ex_${part}`] != null).length;
    return slot?.id ? server.learners.filter((l) => l.scores?.[slot.id] !== undefined).length : 0;
  }, [server, isExam, part, slot]);

  // The web's `pending`, for this column: an HPS change over existing
  // scores, every score above its maximum, every invalid keystroke.
  const pending = useMemo(() => {
    if (!server) return { hpsChanges: [], aboveMax: [], invalid: [] };
    const hpsChanges = [];
    const stored = isExam ? server.exam_max?.[part] ?? null : slot?.max_score ?? null;
    if (max !== null && stored !== null && max !== stored) hpsChanges.push({ label: isExam ? part.toUpperCase() : slot.display_label, from: stored, to: max, count: scoredCount });
    const aboveMax = [];
    const invalid = [];
    for (const learner of server.learners) {
      const parsed = parseCell(valueFor(learner));
      if (parsed.error) invalid.push(learner);
      else if (parsed.value !== null && max !== null && parsed.value > max) aboveMax.push({ learner, score: parsed.value, max });
    }
    return { hpsChanges, aboveMax, invalid };
  }, [server, isExam, part, slot, max, scoredCount, valueFor]);

  async function doSave() {
    setConfirming(false);
    const result = await record.save();
    if (result.nothing) setStatus(ok('Nothing to save — no changes yet.'));
    else setStatus(result.ok ? ok('Class record saved.') : fail(result.message));
  }

  function onSave() {
    setStatus(null);
    if (pending.hpsChanges.length || pending.aboveMax.length) setConfirming(true);
    else doSave();
  }

  if (record.error) {
    return (
      <View className="flex-1 bg-page p-4">
        <ErrorAlert message={record.error} onRetry={record.reload} />
      </View>
    );
  }
  if (!server || (!isExam && !slot)) return <LoadingSpinner className="py-16" label="Loading the class record…" />;

  const stale = previewing || Boolean(previewError);
  const groupName = isExam ? (descriptive ? 'Summative' : 'Summative Tests & Term Exam') : slot.type === 'WW' ? 'Written / Oral Works' : 'Performance Tasks';

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-4 pb-6">
        <Text className="text-sm text-fg-muted">
          {server.subject.name} · Grade {server.grade_level} - {server.section} · Term {server.term} · {groupName}
        </Text>
        {!canEncode ? (
          <View className="rounded-lg border border-edge bg-surface-subtle px-3 py-2">
            <Text className="text-sm text-fg-muted">You can see this class record but not change it — you are not the assigned teacher for {server.subject.name}.</Text>
          </View>
        ) : null}
        {previewError ? (
          <View className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2">
            <Text className="text-sm text-warning-fg">Live totals are out of date — {previewError}</Text>
          </View>
        ) : null}

        <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
          {!isExam ? (
            <FormField
              label="Name (optional)"
              value={nameValue}
              onChangeText={setName}
              editable={canEncode}
              placeholder={slot.display_label}
              hint={`Left blank, this column is called “${slot.display_label}” here and on the parent’s grade breakdown.`}
            />
          ) : null}
          <FormField
            label={isExam ? `${part.toUpperCase()} highest possible score — the whole class` : 'Highest possible score'}
            value={hpsValue}
            onChangeText={setHps}
            editable={canEncode}
            keyboardType="number-pad"
            error={hpsParsed.error || null}
            hint={
              isExam && server.exam_max_mixed?.[part]
                ? 'Learners in this class do not all have the same maximum for this part. Saving applies this one to every learner.'
                : scoredCount > 0
                  ? `${scoredCount} ${scoredCount === 1 ? 'learner has a score' : 'learners have scores'} in this column. Changing it recomputes their grades; it cannot be cleared while those scores are recorded.`
                  : 'No scores are recorded in this column yet. Setting it previews the column; nothing is written until Save all.'
            }
          />
          <Text className="text-xs text-fg-muted">
            {groupName} highest possible: {groupHps?.[group] ?? '—'} · weight {server.weights?.[group] ?? '—'}%
          </Text>
        </View>

        {server.learners.length === 0 ? (
          <Text className="text-sm text-fg-muted">This class has no active learners, so there is nothing to record yet.</Text>
        ) : null}

        {server.learners.map((learner) => {
          const raw = valueFor(learner);
          const parsed = parseCell(raw);
          const aboveMax = parsed.value !== null && max !== null && parsed.value > max;
          const dirtyCell = draft[`${learner.student_id}:${field}`] !== undefined;
          const disabled = !canEncode || learner.is_locked || (!isExam && max === null);
          const computed = preview?.get(learner.student_id) || learner;
          const total = computed[`${group}_total`];
          return (
            <View key={learner.student_id} className="rounded-xl border border-edge bg-surface p-3">
              <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-semibold text-fg">
                    {learner.name}
                  </Text>
                  {learner.is_locked ? (
                    <View className="mt-1">
                      <StatusBadge status="locked" />
                    </View>
                  ) : null}
                </View>
                <TextInput
                  value={raw}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [`${learner.student_id}:${field}`]: v }))}
                  editable={!disabled}
                  keyboardType="number-pad"
                  accessibilityLabel={`${learner.name} — ${title}${max === null ? ' (not in use)' : ` (out of ${max})`}`}
                  placeholderTextColor={tokens['fg-muted']}
                  placeholder={!isExam && max === null ? 'Set HPS' : ''}
                  className={`h-11 w-20 rounded-lg px-2 text-center text-base text-fg ${disabled ? 'bg-surface-subtle' : 'bg-surface'} ${cellRing(Boolean(parsed.error), aboveMax, dirtyCell)}`}
                />
                <Text className="w-12 text-sm text-fg-muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {max === null ? '' : `/ ${max}`}
                </Text>
              </View>
              {parsed.error ? <Text className="mt-1 text-xs text-danger-text">{parsed.error}</Text> : null}
              {aboveMax ? <Text className="mt-1 text-xs text-warning-fg">Above the highest possible score — saved as typed if it is a bonus.</Text> : null}
              {/* THE LIVE LINE — every number from the server (§5b). */}
              <View className={`mt-2 flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5 ${stale ? 'opacity-60' : ''}`}>
                <Text className="text-xs text-fg-muted">
                  {group.toUpperCase()} total {total == null ? '—' : total}
                  {computed[`${group}_total_max`] != null ? `/${computed[`${group}_total_max`]}` : ''} · PS{' '}
                </Text>
                <GradeValue value={computed[`${group}_percentage`]} mode="numerical" className="text-xs" />
                <Text className="text-xs text-fg-muted"> · WS </Text>
                <GradeValue value={computed[`${group}_weighted`]} mode="numerical" className="text-xs" />
                <Text className="text-xs text-fg-muted"> · Initial </Text>
                <GradeValue value={computed.initial_grade} mode="numerical" className="text-xs" />
                <Text className="text-xs text-fg-muted"> · {descriptive ? 'Letter' : 'Term'} </Text>
                {descriptive ? (
                  <TermValue entry={{ descriptive_grade: computed.descriptive_grade, descriptor: null }} mode="descriptive" className="text-xs font-medium text-fg" />
                ) : (
                  <GradeValue value={computed.term_grade} mode="numerical" whole className="text-xs font-medium text-fg" />
                )}
              </View>
            </View>
          );
        })}

        {confirming ? (
          // THE INLINE CONFIRMATION, the web's lists in full.
          <View className="gap-3 rounded-xl border border-warning-edge bg-warning-soft p-3">
            <Text className="text-sm font-semibold text-warning-strong">Save the class record?</Text>
            {pending.hpsChanges.map((c) => (
              <Text key={c.label} className="text-sm text-warning-strong">
                {c.label}: {c.from} → {c.to}. This recomputes {c.count} {c.count === 1 ? 'learner who already has' : 'learners who already have'} a score in it.
              </Text>
            ))}
            {pending.aboveMax.length ? (
              <View className="gap-1">
                <Text className="text-sm font-semibold text-warning-strong">
                  {pending.aboveMax.length} score{pending.aboveMax.length === 1 ? ' is' : 's are'} above the highest possible score
                </Text>
                {pending.aboveMax.map((a) => (
                  <Text key={a.learner.student_id} className="text-sm text-warning-strong">
                    {a.learner.name} — {title}: {a.score}/{a.max}
                  </Text>
                ))}
                <Text className="text-xs text-warning-strong">Scores above the highest possible score are saved as typed. Check that each is a bonus, not a typing mistake.</Text>
              </View>
            ) : null}
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" className="rounded-lg border border-edge-strong bg-surface px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Go back</Text>
              </Pressable>
              <Pressable onPress={doSave} accessibilityRole="button" className="rounded-lg bg-primary px-4 py-2">
                <Text className="text-sm font-medium text-primary-fg">Save all</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <FormStatus status={status} />
      </ScrollView>

      {/* THE PINNED SAVE BAR. */}
      <View className="flex-row items-center gap-3 border-t border-edge bg-surface px-4 py-3">
        <Text className={`flex-1 text-sm ${pending.invalid.length ? 'text-danger-fg' : record.dirty ? 'text-warning-fg' : 'text-fg-muted'}`}>
          {pending.invalid.length
            ? `${pending.invalid.length} cell${pending.invalid.length === 1 ? '' : 's'} need a whole number.`
            : previewing
              ? 'calculating…'
              : record.dirty
                ? 'You have unsaved changes.'
                : 'No unsaved changes'}
        </Text>
        <Pressable
          onPress={onSave}
          disabled={!canEncode || record.saving || !record.dirty}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canEncode || record.saving || !record.dirty, busy: record.saving }}
          className={`h-11 justify-center rounded-lg bg-primary px-4 ${!canEncode || record.saving || !record.dirty ? 'opacity-60' : ''}`}
        >
          <Text className="text-sm font-medium text-primary-fg">{record.saving ? 'Saving…' : 'Save all'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
