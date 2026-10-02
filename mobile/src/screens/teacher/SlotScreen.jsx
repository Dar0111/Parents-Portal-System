import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { Alert, KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import GradeValue from '../../format/GradeValue';
import TermValue from '../../format/TermValue';
import Icon from '../../icons';
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
//
// RELOAD IS `record.reload` (feat/ui-refresh, 2026-10-03) — useSlotRecord's
// own load(), the same GET for this class key. A fresh read clears every
// draft ("a fresh read is a new truth"), so WHILE ANYTHING IS UNSAVED THE
// BUTTON IS DISABLED and the line under the header says why: it must never
// be a silent discard, and the leave prompt's sentence does not describe a
// reload (§5i). "Unsaved" here is wider than `record.dirty`: a keystroke
// that is not a whole number is never sent, so it does not make the record
// dirty, and a reload would still wipe it — a score, or the column's highest
// possible score. Also disabled while a save is in flight (the save re-reads
// itself) and while a dry run is — a preview that lands after a fresh read
// would describe the old one.
//
// WHILE THE RELOAD IS IN FLIGHT THE INPUTS ARE NOT ON SCREEN — the loading
// state is, as on the first read: load() clears every draft when its reply
// lands, so a score typed during the request would vanish with nothing said.
// `reloading` is set and cleared by the reload handler alone (never in an
// effect), so a save's own re-read behaves exactly as it did.
//
// NOTHING HERE MOVES (the refresh's motion rule): no entrance, and the
// reload line keeps its place when it is empty, so the first keystroke does
// not push the column down under the keyboard.
const TITLE = 'Leave without saving?';
const BODY = 'You have unsaved scores in this slot. Leaving now discards them — nothing has been sent to the server yet.';
const RELOAD_BLOCKED = 'Save or discard your changes before reloading.';
const TABULAR = { fontVariant: ['tabular-nums'] };
// 48dp, as a number: the phone's rem is 14, so a height class falls short
// (M19). It was `h-11` — 38.5dp.
const SCORE_INPUT = { height: 48 };

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
  const [reloading, setReloading] = useState(false);

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

  // The Reload button's handler. It clears the save result first: "Class
  // record saved." describes the action before this one (§7c). load() keeps
  // its own failure in `record.error` and never rejects.
  async function reloadRecord() {
    setStatus(null);
    setReloading(true);
    try {
      await record.reload();
    } finally {
      setReloading(false);
    }
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
  // What a reload would wipe: anything the request would send, an invalid
  // score keystroke, and a highest possible score typed here that differs
  // from the stored one (an invalid or cleared Summative maximum is never
  // sent, so `record.dirty` alone would miss it).
  const hpsStored = isExam ? server.exam_max?.[part] ?? null : slot.max_score ?? null;
  const hpsTyped = hpsValue !== (hpsStored === null ? '' : String(hpsStored));
  const unsavedWork = record.dirty || pending.invalid.length > 0 || hpsTyped;
  const saveOff = !canEncode || record.saving || !record.dirty;

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-6">
        <View className="gap-1">
          {/* WHICH COLUMN OF WHICH RECORD — the navigator's title names the
              slot; this names the record around it. */}
          <SectionHeader
            title="Class record"
            description={`${server.subject.name} · Grade ${server.grade_level} - ${server.section} · Term ${server.term} · ${groupName}`}
            onReload={reloadRecord}
            reloading={record.loading || reloading}
            reloadDisabled={unsavedWork || record.saving || previewing}
            reloadLabel="Reload class record"
          />
          {/* ALWAYS ONE LINE TALL: empty, it holds a space, so the column
              does not drop a line on the first keystroke. */}
          <Text className="text-xs text-fg-muted" style={{ minHeight: 16 }}>
            {unsavedWork ? RELOAD_BLOCKED : ' '}
          </Text>
        </View>

        {reloading ? (
          <LoadingSpinner className="py-12" label="Loading the class record…" />
        ) : (
          <>
            {!canEncode ? (
              <View className="flex-row items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
                <Icon name="fa-eye" size={14} color={tokens['fg-faint']} style={{ marginTop: 3 }} />
                <Text className="min-w-0 flex-1 text-sm text-fg-body">You can see this class record but not change it — you are not the assigned teacher for {server.subject.name}.</Text>
              </View>
            ) : null}
            {previewError ? (
              <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
                <Icon name="fa-triangle-exclamation" size={14} color={tokens['warning-icon']} style={{ marginTop: 3 }} />
                <Text className="min-w-0 flex-1 text-sm text-warning-strong">Live totals are out of date — {previewError}</Text>
              </View>
            ) : null}

            {/* THE COLUMN'S OWN SETTINGS: its name and its highest possible
                score, with the group's total and weight under them. */}
            <View className={`${cardClass} gap-3 p-4`}>
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
              <View className="border-t border-edge-soft pt-3">
                <Text className="text-xs text-fg-muted" style={TABULAR}>
                  {groupName} highest possible: {groupHps?.[group] ?? '—'} · weight {server.weights?.[group] ?? '—'}%
                </Text>
              </View>
            </View>

            {server.learners.length === 0 ? (
              <Text className="text-sm text-fg-muted">This class has no active learners, so there is nothing to record yet.</Text>
            ) : null}

            {server.learners.length ? (
              <View className="gap-3">
                {server.learners.map((learner) => {
                  const raw = valueFor(learner);
                  const parsed = parseCell(raw);
                  const aboveMax = parsed.value !== null && max !== null && parsed.value > max;
                  const dirtyCell = draft[`${learner.student_id}:${field}`] !== undefined;
                  const disabled = !canEncode || learner.is_locked || (!isExam && max === null);
                  const computed = preview?.get(learner.student_id) || learner;
                  const total = computed[`${group}_total`];
                  return (
                    <View key={learner.student_id} className={`${cardClass} p-4`}>
                      <View className="flex-row items-center gap-3">
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={2} className="text-base font-semibold text-fg">
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
                          className={`w-20 rounded-xl px-2 text-center font-sans text-base text-fg ${disabled ? 'bg-surface-subtle' : 'bg-surface'} ${cellRing(Boolean(parsed.error), aboveMax, dirtyCell)}`}
                          style={SCORE_INPUT}
                        />
                        <Text className="w-12 text-sm text-fg-muted" style={TABULAR}>
                          {max === null ? '' : `/ ${max}`}
                        </Text>
                      </View>
                      {parsed.error ? <Text className="mt-2 text-xs text-danger-text">{parsed.error}</Text> : null}
                      {aboveMax ? <Text className="mt-2 text-xs text-warning-fg">Above the highest possible score — saved as typed if it is a bonus.</Text> : null}
                      {/* THE LIVE LINE — every number from the server (§5b). */}
                      <View className={`mt-3 flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-edge-soft pt-3 ${stale ? 'opacity-60' : ''}`}>
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
                          <TermValue entry={{ descriptive_grade: computed.descriptive_grade, descriptor: null }} mode="descriptive" className="text-xs font-semibold text-fg" />
                        ) : (
                          <GradeValue value={computed.term_grade} mode="numerical" whole className="text-xs font-semibold text-fg" />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {confirming ? (
              // THE INLINE CONFIRMATION, the web's lists in full. While it is
              // open ITS "Save all" is the filled button; the bar's goes quiet.
              <View className="gap-3 rounded-xl border border-warning-edge bg-warning-soft p-4">
                <Text className="font-serif text-base text-warning-strong">Save the class record?</Text>
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
                <View className="flex-row flex-wrap justify-end gap-2">
                  <Button variant="secondary" onPress={() => setConfirming(false)}>
                    Go back
                  </Button>
                  <Button variant="primary" onPress={doSave}>
                    Save all
                  </Button>
                </View>
              </View>
            ) : null}
            <FormStatus status={status} />
          </>
        )}
      </ScrollView>

      {/* THE PINNED SAVE BAR. Save all is the screen's one filled button —
          except while the confirmation above is open, when that panel's is. */}
      <View className="flex-row items-center gap-3 border-t border-edge bg-surface px-4 py-3">
        <Text className={`min-w-0 flex-1 text-sm ${pending.invalid.length ? 'font-semibold text-danger-fg' : record.dirty ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}>
          {pending.invalid.length
            ? `${pending.invalid.length} cell${pending.invalid.length === 1 ? '' : 's'} need a whole number.`
            : previewing
              ? 'calculating…'
              : record.dirty
                ? 'You have unsaved changes.'
                : 'No unsaved changes'}
        </Text>
        <Button variant={confirming ? 'secondary' : 'primary'} onPress={onSave} loading={record.saving} disabled={saveOff}>
          {record.saving ? 'Saving…' : 'Save all'}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
