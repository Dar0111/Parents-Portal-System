import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Segmented from '../../components/Segmented';
import { announcementBody, AUDIENCES, audienceHint, EMPTY_ANN, EMPTY_MEMO, formFromRow, memoBody } from './posts/logic';

// NEW / EDIT AN ANNOUNCEMENT OR A MEMO (admin) — the web's two dialogs as one
// modal screen, `kind` choosing which. An announcement's AUDIENCE is
// everyone, one whole grade, or one class; every write sends BOTH target keys,
// null when absent (`announcementBody`), and the class comes from GET
// /sections, never typed. The hint says who will see it (§5i), and a class
// with no students is warned about. A memo has no audience — every memo goes
// to every teacher and every parent. No confirmation (§5e: edit repeats; a
// new post is removed by Delete). The result goes back to its own list.
export default function PostComposeScreen({ navigation, route }) {
  const kind = route.params.kind;
  const editing = route.params.editing || null;
  const isMemo = kind === 'memo';
  const [form, setForm] = useState(isMemo ? (editing ? { title: editing.title || '', content: editing.content || '' } : EMPTY_MEMO) : editing ? formFromRow(editing) : EMPTY_ANN);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isMemo) return undefined;
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setSections(all);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isMemo]);

  const formSections = useMemo(
    () => (form.grade ? sections.filter((s) => Number(s.grade_level) === Number(form.grade)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [sections, form.grade]
  );
  const chosenSection = formSections.find((s) => s.name === form.section) || null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (saving) return;
    setError(null);
    const { body, problem } = isMemo ? memoBody(form) : announcementBody(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const path = isMemo ? '/memos' : '/announcements';
      const unwrap = isMemo ? 'memo' : 'announcement';
      if (editing) await api.put(`${path}/${editing.id}`, body, { unwrap });
      else await api.post(path, body, { unwrap });
      const notice = isMemo ? (editing ? 'Memo updated.' : 'Memo posted.') : editing ? 'Announcement updated.' : 'Announcement posted.';
      navigation.navigate('Main', { screen: '/admin/announcements', params: { notice, kind } });
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const ready = form.title.trim() && form.content.trim();

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {error ? <ErrorAlert message={error} /> : null}
        {isMemo ? (
          <Text className="text-sm text-fg-muted">Memos have no audience setting — every memo goes to every teacher and every parent.</Text>
        ) : (
          <>
            <FormField
              label="Audience"
              render={() => <Segmented label="Audience" value={form.audience} onChange={(a) => setForm((f) => ({ ...f, audience: a, section: '' }))} options={AUDIENCES} />}
            />
            {form.audience !== 'school' ? (
              <FormField
                label="Grade"
                render={() => (
                  <Segmented
                    label="Grade"
                    value={form.grade}
                    onChange={(g) => setForm((f) => ({ ...f, grade: g, section: '' }))}
                    options={[1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }))}
                  />
                )}
              />
            ) : null}
            {form.audience === 'class' ? (
              <FormField
                label="Class"
                render={() =>
                  form.grade ? (
                    <Segmented label="Class" value={form.section} onChange={set('section')} options={formSections.map((s) => ({ key: s.name, label: s.name }))} />
                  ) : (
                    <Text className="text-sm text-fg-muted">Pick a grade first.</Text>
                  )
                }
              />
            ) : null}
            <Text className="text-sm text-fg-muted">{audienceHint(form)}</Text>
            {form.audience === 'class' && chosenSection && Number(chosenSection.student_count) === 0 ? (
              <View className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2">
                <Text className="text-sm text-warning-strong">This class has no students, so no parent will see this post.</Text>
              </View>
            ) : null}
          </>
        )}
        <FormField label="Title" required maxLength={200} value={form.title} onChangeText={set('title')} />
        <FormField label="Message" required value={form.content} onChangeText={set('content')} multiline numberOfLines={6} textAlignVertical="top" className="min-h-36" />
        {!isMemo ? <FormField label="Category" maxLength={50} value={form.category} onChangeText={set('category')} hint="Optional — e.g. Reminder, Activity." /> : null}
        <View className="flex-row justify-end gap-2">
          <Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
            <Text className="text-sm font-medium text-fg-body">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={saving || !ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !ready, busy: saving }}
            className={`rounded-lg bg-primary px-4 py-2 ${saving || !ready ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : editing ? 'Save changes' : isMemo ? 'Post memo' : 'Post'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
