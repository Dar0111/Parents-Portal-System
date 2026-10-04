import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { DRAFT_COPY, editContext, itemChangedSince, threadContext } from '../../drafts/draftCore';
import { deviceDrafts, useDeviceDraft } from '../../drafts/useDraft';
import useTeacherTargets, { keyOf } from '../../hooks/useTeacherTargets';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// NEW / EDIT ANNOUNCEMENT — the web's compose modal as a modal screen, and
// THE ONE COMPOSER: "Announce to a class" on a message thread opens THIS
// screen with `content` (the unsent draft, never the last incoming message)
// and an optional `target` (`grade|section`, sent only from a parent thread
// whose contacts row carried the child's class). The target is re-validated
// against this teacher's own list before it is selected — the thread
// preselects, it does not authorize, and the server decides on POST. A
// requested target not in the list lands on "Pick a section" with a notice,
// never silently on another section. With NO targets at all the form does
// not open (a form with no valid target is a dead end) and the draft is
// shown so it is not lost.
//
// A teacher cannot post school-wide or whole-grade (admin-only, 403), so
// those options are not offered. No attachment field: nothing uploads.
//
// THE LOOK (feat/ui-refresh, 2026-10-02): the form is one card, then the
// neutral way out and the ONE filled step forward. No pull-to-refresh: the
// screen is a write form (its targets are `useTeacherTargets`' one read).
//
// THE FORM KEEPS A DRAFT ON THIS PHONE (feat/form-drafts, 2026-10-04; MOBILE
// M25) under this account's numeric id — `new`, or `edit-<post id>`. Close,
// Back and a killed app keep it; it comes back when this screen opens again,
// with the notice; it is removed on a confirmed post or edit, a confirmed
// Discard draft, and logout. A thread hand-off over a saved new-announcement
// draft ASKS first ("Replace your saved announcement draft with this
// message?"), and an announcement started from a conversation clears that
// conversation's draft once it posts (`fromThread`). The auto-selected
// section counts as what the form OPENED with, so it alone never makes a draft.
export default function AnnouncementComposeScreen({ navigation, route }) {
  const { tokens } = useTheme();
  const editing = route?.params?.editing || null;
  const arrivedContent = typeof route?.params?.content === 'string' ? route.params.content : null;
  const requestedTarget = typeof route?.params?.target === 'string' ? route.params.target : '';
  const handoffThread = Number.isInteger(route?.params?.fromThread) && route.params.fromThread > 0 ? route.params.fromThread : null;
  const { sections, loading: targetsLoading } = useTeacherTargets();

  // What the form OPENED with — without a hand-off's text, so that text
  // counts as typed and is kept as this form's draft.
  const [opening] = useState(() => ({
    title: editing?.title || '',
    content: editing?.content || '',
    category: editing?.category || '',
    target: editing ? `${editing.target_grade}|${editing.target_section}` : '',
  }));
  const [form, setForm] = useState(() => ({ ...opening, content: editing?.content || arrivedContent || '' }));
  const [staleTargetNotice, setStaleTargetNotice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resolved, setResolved] = useState(false);

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const autoBase = useMemo(() => {
    if (editing || targetsLoading) return opening;
    if (requestedTarget && sections.some((s) => keyOf(s) === requestedTarget)) return { ...opening, target: requestedTarget };
    if (!requestedTarget && sections.length === 1) return { ...opening, target: keyOf(sections[0]) };
    return opening;
  }, [editing, targetsLoading, requestedTarget, sections, opening]);
  const [restoredBase, setRestoredBase] = useState(null);
  const [draftNotice, setDraftNotice] = useState(null);
  const [fromThread, setFromThread] = useState(editing ? null : handoffThread);
  const restore = useCallback(
    (record, { saveNow }) => {
      if (!record) return;
      function applySaved() {
        setForm(record.values);
        setRestoredBase(record.base || opening);
        setFromThread(editing ? null : record.fromThread);
        setDraftNotice(editing && itemChangedSince('announcement', record, opening) ? 'changed' : 'restored');
      }
      // A hand-off with text over a saved new-announcement draft: ask. "This
      // message" is shown as the question's body. "Use this message" writes
      // the hand-off over the saved draft at once.
      if (!editing && arrivedContent && arrivedContent.trim()) {
        Alert.alert(DRAFT_COPY.replaceTitle, arrivedContent, [
          { text: DRAFT_COPY.replaceKeep, style: 'cancel', onPress: applySaved },
          { text: DRAFT_COPY.replaceUse, onPress: saveNow },
        ]);
        return;
      }
      applySaved();
    },
    [editing, opening, arrivedContent]
  );
  const draft = useDeviceDraft({
    userId,
    form: 'announcement',
    context: editing ? editContext(editing.id) : 'new',
    values: form,
    base: restoredBase || autoBase,
    // Written only while there is a section to post to: with none, the form
    // never opens and a hand-off's text stays in its conversation.
    active: Boolean(editing) || sections.length > 0,
    fromThread: editing ? null : fromThread,
    onRestore: restore,
  });

  // After "Discard this draft?" was confirmed (DraftNotice's Alert).
  function discardDraft() {
    draft.discard();
    setForm(autoBase);
    setRestoredBase(null);
    setFromThread(null);
    setDraftNotice(null);
  }

  // Resolve the target ONCE the list has loaded: the thread's requested
  // key if known, else the one-section auto-select, else "Pick a section".
  // A restored draft keeps its own section: nothing is resolved over it.
  useEffect(() => {
    if (targetsLoading || resolved) return;
    setResolved(true);
    if (editing || restoredBase) return;
    const known = requestedTarget && sections.some((s) => keyOf(s) === requestedTarget);
    if (known) setForm((f) => ({ ...f, target: requestedTarget }));
    else if (requestedTarget) setStaleTargetNotice(true);
    else if (sections.length === 1) setForm((f) => ({ ...f, target: keyOf(sections[0]) }));
  }, [targetsLoading, resolved, editing, requestedTarget, sections, restoredBase]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const [grade, name] = form.target.split('|');
      const body = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category.trim() || undefined,
        target_grade: Number(grade),
        target_section: name,
      };
      if (editing) await api.put(`/announcements/${editing.id}`, body, { unwrap: 'announcement' });
      else await api.post('/announcements', body, { unwrap: 'announcement' });
      // The server confirmed: this form's draft goes — and, for an
      // announcement started from a conversation, that conversation's draft
      // too, so the same words are not later sent to the parent by mistake.
      draft.submitted(form);
      if (!editing && fromThread) deviceDrafts.clear({ userId, form: 'message', context: threadContext(fromThread) });
      // popTo, not navigate: navigate pushes a second drawer (M16). From a
      // message thread this also closes the thread — accepted.
      navigation.popTo('Main', { screen: '/teacher/announcements', params: { notice: editing ? 'Announcement updated.' : 'Announcement posted.' } });
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  if (targetsLoading) return <LoadingSpinner className="py-16" />;

  if (!editing && sections.length === 0) {
    const [grade, name] = requestedTarget.split('|');
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
        <View className="gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
          <View className="flex-row items-start gap-3">
            <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm text-warning-strong">
              The announcement form could not open: your section list did not load, or you have no sections to post to.
              {requestedTarget ? ` It was meant for Grade ${grade} - ${name}.` : ''} Nothing was posted.
            </Text>
          </View>
          {arrivedContent ? (
            <>
              <Text className="text-sm text-warning-strong">{DRAFT_COPY.handoffStillInThread}</Text>
              <FormField label="Undelivered message draft" value={arrivedContent} editable={false} multiline textAlignVertical="top" className="min-h-20" />
            </>
          ) : null}
        </View>
        <Button variant="secondary" className="self-end" onPress={() => navigation.goBack()}>
          Close
        </Button>
      </ScrollView>
    );
  }

  const ready = form.title.trim() && form.content.trim() && form.target;

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {draftNotice ? <DraftNotice changed={draftNotice === 'changed'} onDiscard={discardDraft} /> : null}
        {formError ? <ErrorAlert message={formError} /> : null}
        {staleTargetNotice ? (
          <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
            <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm text-warning-strong">That class is not in your current list. Pick a section.</Text>
          </View>
        ) : null}

        <Reveal>
          <View className={`${cardClass} gap-4 p-4`}>
            <FormField
              label="Posting to"
              required
              hint="Parents of this section will see this post. A section with no students has no parents to reach. Teachers can only post to their own sections."
              render={() => (
                <Segmented
                  label="Posting to"
                  value={form.target}
                  onChange={(target) => {
                    setForm((f) => ({ ...f, target }));
                    setStaleTargetNotice(false);
                  }}
                  options={sections.map((s) => ({ key: keyOf(s), label: `Grade ${s.grade_level} - ${s.name}` }))}
                />
              )}
            />
            <FormField label="Title" required maxLength={200} value={form.title} onChangeText={(title) => setForm((f) => ({ ...f, title }))} />
            <FormField
              label="Message"
              required
              value={form.content}
              onChangeText={(content) => setForm((f) => ({ ...f, content }))}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              className="min-h-36"
            />
            <FormField label="Category" maxLength={50} value={form.category} onChangeText={(category) => setForm((f) => ({ ...f, category }))} hint="Optional — e.g. Reminder, Activity." />
          </View>
        </Reveal>

        {/* The label still changes while the write is in flight; `loading`
            adds the spinner, and the button is disabled exactly when it was
            before (saving, or a required field empty). */}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => navigation.goBack()} disabled={saving}>
            Close
          </Button>
          <Button variant="primary" onPress={submit} disabled={saving || !ready} loading={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Post'}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
