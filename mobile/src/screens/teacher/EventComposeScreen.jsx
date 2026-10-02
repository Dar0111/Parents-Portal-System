import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DateField from '../../components/DateField';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import { todayLocalDateString } from '../../format/date';
import useTeacherTargets from '../../hooks/useTeacherTargets';
import Reveal from '../../motion/Reveal';

// NEW / EDIT EVENT — the web's compose modal as a modal screen. `event_date`
// is the picker's STRING built from local parts, never a Date re-serialised
// (§5a-iv); an empty description is null, not "", so the column stays honest
// about "not provided". Posting to is a GRADE (the events table has no
// target_section), auto-selected when this teacher has exactly one; a
// school-wide event is admin-only and not offered.
//
// THE LOOK (feat/ui-refresh, 2026-10-02): the form is one card, then the
// neutral way out and the ONE filled step forward. No reload: the screen is
// a write form (its targets are `useTeacherTargets`' one read).
export default function EventComposeScreen({ navigation, route }) {
  const editing = route?.params?.editing || null;
  const { grades, loading: targetsLoading } = useTeacherTargets();
  const [form, setForm] = useState({
    title: editing?.title || '',
    description: editing?.description || '',
    event_date: editing?.event_date || todayLocalDateString(),
    target_grade: editing ? String(editing.target_grade ?? '') : '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (targetsLoading || resolved) return;
    setResolved(true);
    if (!editing && grades.length === 1) setForm((f) => ({ ...f, target_grade: String(grades[0]) }));
  }, [targetsLoading, resolved, editing, grades]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.event_date,
        target_grade: Number(form.target_grade),
      };
      if (editing) await api.put(`/events/${editing.id}`, body, { unwrap: 'event' });
      else await api.post('/events', body, { unwrap: 'event' });
      // popTo, not navigate: navigate pushes a second drawer (M16).
      navigation.popTo('Main', { screen: '/teacher/events', params: { notice: editing ? 'Event updated.' : 'Event posted.' } });
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  if (targetsLoading) return <LoadingSpinner className="py-16" />;

  const ready = form.title.trim() && form.event_date && form.target_grade;

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {formError ? <ErrorAlert message={formError} /> : null}
        <Reveal>
          <View className={`${cardClass} gap-4 p-4`}>
            <FormField
              label="Posting to"
              required
              hint="Everyone in this grade sees it. School-wide events are admin-only."
              render={() => (
                <Segmented
                  label="Posting to"
                  value={form.target_grade}
                  onChange={(target_grade) => setForm((f) => ({ ...f, target_grade }))}
                  options={grades.map((g) => ({ key: String(g), label: `Grade ${g}` }))}
                />
              )}
            />
            <FormField label="Title" required maxLength={200} value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} />
            <DateField label="Date" required value={form.event_date} onChange={(event_date) => setForm((f) => ({ ...f, event_date }))} />
            <FormField
              label="Description"
              value={form.description}
              onChangeText={(description) => setForm((f) => ({ ...f, description }))}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              className="min-h-32"
              hint="Optional."
            />
          </View>
        </Reveal>
        {/* The label still changes while the write is in flight; `loading`
            adds the spinner, and the button is disabled exactly when it was
            before (saving, or a required field empty). */}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => navigation.goBack()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onPress={submit} disabled={saving || !ready} loading={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Post'}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
