import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import { unlockClearsSentence } from '../../format/acknowledgement';
import { timestampDay } from '../../format/date';
import TermValue from '../../format/TermValue';

// LOCK OR UNLOCK ONE TERM GRADE — the web's lock modal as a modal screen.
// PATCH /grades/:id/lock is admin-only, and lock AND unlock are one boolean
// on it (CLAUDE.md: no teacher-side lock). ONE DELIBERATE STEP, NOT A
// CONFIRMATION (§5e): it is reversible with one tap. The copy is the web's,
// read from routes/grades.js: locking stops every change to the grade's
// scores or letter — by teachers AND admins — and stops it being deleted,
// until unlocked; parents and teachers still see it exactly as it is. The
// entry is the list's snapshot; the Grades screen re-reads on return.
//
// THE LOOK (feat/ui-refresh, 2026-10-03) is the web's: the cell as it is
// stored — its value and its lock state — in one tile, above the sentence
// that says what locking does; then the neutral way out and the one filled
// action, whose glyph is the state it will SET. Lock and unlock only: there
// is no Delete here (KNOWN ISSUES). NO MOTION, and no pull-to-refresh — the
// screen shows the list's snapshot and makes no read of its own.
export default function GradeLockScreen({ navigation, route }) {
  // `acknowledgement` (feat/grade-acknowledgement): the term's parent
  // confirmation, or null — passed by the list so this sheet can say what an
  // unlock clears without a read of its own.
  const { subjectName, term, mode, entry, acknowledgement = null } = route.params;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    if (!entry?.grade_id || saving) return;
    const next = !entry.is_locked;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/grades/${entry.grade_id}/lock`, { is_locked: next }, { unwrap: 'grade' });
      // popTo, NOT navigate (A1, 2026-09-29): React Navigation 7's stack
      // pushes a SECOND 'Main' on navigate() from here — a fresh drawer whose
      // Grades screen has no grade, section or learner. popTo returns to the
      // original drawer, whose Grades screen keeps its selection and
      // re-fetches on focus (M14). Measured on the real StackRouter.
      navigation.popTo('Main', { screen: '/admin/grades', params: { notice: `${subjectName}, Term ${term} ${next ? 'locked' : 'unlocked'}.` } });
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      <Text accessibilityRole="header" className="font-serif text-xl text-fg">
        {subjectName} · Term {term}
      </Text>
      {error ? <ErrorAlert message={error} /> : null}
      {entry ? (
        <View className={`${cardClass} gap-4 p-4`}>
          <View className="flex-row items-center justify-between gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            {/* Semibold, not bold: a nested Text inherits the family, and in
                descriptive mode TermValue's letter names semibold itself — a
                bold wrapper would leave the descriptor heavier than the
                letter it describes. */}
            <Text className="min-w-0 flex-1 text-lg font-semibold text-fg">
              <TermValue entry={entry} mode={mode} />
            </Text>
            <StatusBadge status={entry.is_locked ? 'locked' : 'unlocked'} />
          </View>
          <Text className="text-sm text-fg-body">
            Locking stops every change to this grade's scores or letter — by teachers and by admins — and stops it from being deleted, until it is unlocked here.
            Parents and teachers still see it exactly as it is; the teacher sees it marked Locked.
          </Text>
          {/* §5i: exactly what the unlock paths do — shown only while the
              parent's confirmation of this term exists. */}
          {acknowledgement?.acknowledged_at ? (
            <Text className="text-sm text-fg-body">{unlockClearsSentence(timestampDay(acknowledgement.acknowledged_at, { style: 'long' }))}</Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-sm text-fg-muted">This term no longer has a grade record.</Text>
      )}
      {/* The label still changes while the write is in flight; `loading` is
          the old `disabled={saving}` plus its spinner. */}
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button onPress={() => navigation.goBack()} disabled={saving}>
          Close
        </Button>
        {entry?.grade_id ? (
          <Button variant="primary" icon={entry.is_locked ? 'fa-lock-open' : 'fa-lock'} onPress={toggle} loading={saving}>
            {saving ? 'Saving…' : entry.is_locked ? 'Unlock grade' : 'Lock grade'}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}
