import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { createTickets } from '../../api/tickets';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { todayLocalDateString } from '../../format/date';
import {
  LOCKS_UNWRAP,
  applyLabel,
  introFor,
  locksBody,
  previewLines,
  resultLine,
  scopeHeading,
  skippedRow,
} from '../../format/gradeLocks';
import { currentTerm } from '../../format/schoolCalendar';

// LOCK OR UNLOCK A WHOLE TERM — the web's GradeLocksModal.jsx as a modal
// screen (fix/grade-locks, 2026-10-13; the owner's Finding 1). POST
// /api/grades/locks, admin only; every word from format/gradeLocks.js, the
// web's file mirrored byte for byte.
//
// PREVIEW, THEN ONE WRITE, as on the web: "Preview" is a dry run, and the
// primary button appears only once a preview of the choices ON SCREEN says
// there is something to do, naming the count. Changing a choice clears the
// preview and takes a new ticket, so a preview still in flight for the old
// choices is dropped (api/tickets.js); no choice changes while the write is
// out. Reversible by unlock, so no further confirmation (§5e).
//
// ON SUCCESS it returns to Admin → Grades with the result line as the notice
// — popTo, never navigate (A1: navigate pushes a second, empty 'Main'), the
// way GradeLockScreen does — and Grades re-reads on focus. A skipped learner
// is listed by name and class only, never an LRN (§5c). No motion, no
// pull-to-refresh: the one read here is the sections list, with its Retry.

const ACTIONS = [
  { key: 'lock', label: 'Lock' },
  { key: 'unlock', label: 'Unlock' },
];
const TERMS = ['1', '2', '3'].map((t) => ({ key: t, label: `Term ${t}` }));
const GRADES = [{ key: '', label: 'Whole school' }, ...[1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }))];

export default function GradeLocksScreen({ navigation }) {
  const [choices, setChoices] = useState(() => ({
    action: 'lock',
    term: String(currentTerm(todayLocalDateString())),
    grade: '',
    section: '',
  }));
  const [sections, setSections] = useState([]);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionsAttempt, setSectionsAttempt] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null); // 'preview' | 'apply' | null
  const [error, setError] = useState(null);
  const [tickets] = useState(createTickets);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (cancelled) return;
        setSections(rows);
        setSectionsError(null);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sectionsAttempt]);

  const sectionOptions = useMemo(
    () => [
      { key: '', label: 'All sections' },
      ...sections
        .filter((s) => Number(s.grade_level) === Number(choices.grade))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ key: s.name, label: s.name })),
    ],
    [sections, choices.grade]
  );

  function choose(patch) {
    if (busy === 'apply') return;
    tickets.take(); // a preview still in flight is for the old choices
    setChoices((prev) => ({ ...prev, ...patch }));
    setPreview(null);
    setError(null);
    setBusy(null);
  }

  async function runPreview() {
    const ticket = tickets.take();
    setBusy('preview');
    setError(null);
    try {
      const result = await api.post('/grades/locks', locksBody(choices, true), { unwrap: LOCKS_UNWRAP });
      if (!tickets.isLatest(ticket)) return;
      setPreview(result);
    } catch (err) {
      if (!tickets.isLatest(ticket)) return;
      setPreview(null);
      setError(extractError(err));
    } finally {
      if (tickets.isLatest(ticket)) setBusy(null);
    }
  }

  async function apply() {
    if (!preview || preview.records_changed === 0 || busy) return;
    setBusy('apply');
    setError(null);
    try {
      const result = await api.post('/grades/locks', locksBody(choices, false), { unwrap: LOCKS_UNWRAP });
      navigation.popTo('Main', { screen: '/admin/grades', params: { notice: resultLine(result) } });
    } catch (err) {
      setError(extractError(err));
      setBusy(null);
    }
  }

  const lock = choices.action === 'lock';
  const canApply = Boolean(preview) && preview.records_changed > 0;

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      {error ? <ErrorAlert message={error} /> : null}
      <View className={`${cardClass} gap-4 p-4`}>
        <Text className="text-sm text-fg-body">{introFor(lock)}</Text>
        <FormField
          label="Action"
          render={() => <Segmented label="Action" options={ACTIONS} value={choices.action} onChange={(v) => choose({ action: v })} />}
        />
        <FormField
          label="Term"
          render={() => <Segmented label="Term" options={TERMS} value={choices.term} onChange={(v) => choose({ term: v })} />}
        />
        <FormField
          label="Grade"
          render={() => (
            <Segmented label="Grade" options={GRADES} value={choices.grade} onChange={(v) => choose({ grade: v, section: '' })} />
          )}
        />
        {!choices.grade ? (
          <Text className="text-sm text-fg-muted">Pick a grade to narrow it to one section.</Text>
        ) : sectionsError ? (
          <ErrorAlert message={sectionsError} onRetry={() => setSectionsAttempt((n) => n + 1)} />
        ) : (
          <FormField
            label="Section"
            render={() => (
              <Segmented label="Section" options={sectionOptions} value={choices.section} onChange={(v) => choose({ section: v })} />
            )}
          />
        )}
      </View>

      {preview ? (
        <View className={`${cardClass} gap-2 p-4`}>
          <Text className="text-sm font-semibold text-fg">{scopeHeading(preview.scope)}</Text>
          {previewLines(preview).map((line) => (
            <Text key={line.text} className={`text-sm ${line.kind === 'nothing' ? 'text-fg-muted' : 'text-fg-body'}`}>
              {line.text}
            </Text>
          ))}
          {preview.lock
            ? preview.skipped.map((row) => (
                <Text key={row.student_id} className="text-sm text-fg-body">
                  {skippedRow(row)}
                </Text>
              ))
            : null}
        </View>
      ) : null}

      <View className="flex-row flex-wrap justify-end gap-2">
        <Button onPress={() => navigation.goBack()} disabled={busy === 'apply'}>
          Close
        </Button>
        <Button onPress={runPreview} loading={busy === 'preview'} disabled={busy === 'apply'}>
          Preview
        </Button>
        {canApply ? (
          <Button
            variant="primary"
            icon={lock ? 'fa-lock' : 'fa-lock-open'}
            onPress={apply}
            loading={busy === 'apply'}
            disabled={busy === 'preview'}
          >
            {applyLabel(lock, preview.records_changed)}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}
