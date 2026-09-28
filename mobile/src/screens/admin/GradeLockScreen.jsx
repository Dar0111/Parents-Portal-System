import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import StatusBadge from '../../components/StatusBadge';
import TermValue from '../../format/TermValue';

// LOCK OR UNLOCK ONE TERM GRADE — the web's lock modal as a modal screen.
// PATCH /grades/:id/lock is admin-only, and lock AND unlock are one boolean
// on it (CLAUDE.md: no teacher-side lock). ONE DELIBERATE STEP, NOT A
// CONFIRMATION (§5e): it is reversible with one tap. The copy is the web's,
// read from routes/grades.js: locking stops every change to the grade's
// scores or letter — by teachers AND admins — and stops it being deleted,
// until unlocked; parents and teachers still see it exactly as it is. The
// entry is the list's snapshot; the Grades screen re-reads on return.
export default function GradeLockScreen({ navigation, route }) {
  const { subjectName, term, mode, entry } = route.params;
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
      <Text className="text-base font-semibold text-fg">
        {subjectName} · Term {term}
      </Text>
      {error ? <ErrorAlert message={error} /> : null}
      {entry ? (
        <View className="gap-3 rounded-xl border border-edge bg-surface p-4">
          <View className="flex-row items-center justify-between gap-3">
            <TermValue entry={entry} mode={mode} className="text-sm text-fg" />
            <StatusBadge status={entry.is_locked ? 'locked' : 'unlocked'} />
          </View>
          <Text className="text-sm text-fg-body">
            Locking stops every change to this grade's scores or letter — by teachers and by admins — and stops it from being deleted, until it is unlocked here.
            Parents and teachers still see it exactly as it is; the teacher sees it marked Locked.
          </Text>
        </View>
      ) : (
        <Text className="text-sm text-fg-muted">This term no longer has a grade record.</Text>
      )}
      <View className="flex-row justify-end gap-2">
        <Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
          <Text className="text-sm font-medium text-fg-body">Close</Text>
        </Pressable>
        {entry?.grade_id ? (
          <Pressable
            onPress={toggle}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            className={`rounded-lg bg-primary px-4 py-2 ${saving ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : entry.is_locked ? 'Unlock grade' : 'Lock grade'}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
