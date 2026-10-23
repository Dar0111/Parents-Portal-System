import { useCallback, useMemo, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Text from '../../components/Text';
import { editContext, itemChangedSince } from '../../drafts/draftCore';
import { useDeviceDraft } from '../../drafts/useDraft';
import { longDate, todayLocalDateString } from '../../format/date';
import { PARENT_NOTE } from '../../format/excuseAttendance';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// SUBMIT / EDIT AN EXCUSE LETTER — the web's compose modal as a modal
// screen. POST /excuse-letters or PUT /excuse-letters/:id; `parent_id` and
// `student_id` come from the session on the server, never from here. THE
// DATE IS A STRING BUILT FROM PARTS: the native picker hands back a Date, and
// the YYYY-MM-DD identity is assembled from its local year / month / day —
// never toISOString() (§5a-iv). Not in the future (the server's rule,
// mirrored by `maximumDate`). No confirmation step: a submitted letter can
// still be edited while Pending (§5e). On success the list screen gets
// `notice` and re-reads its rows.
//
// THE LOOK (feat/ui-refresh): the note about what a letter does, then the
// three fields in one card, then Close and the screen's one filled action.
// The date trigger has the shared date field's shape (components/DateField:
// FormField's corner and padding, 48dp set in dp — M19 — and Android's ripple
// for feedback, never a style function — M20). It stays inline here because
// its accessible name while empty is this screen's own sentence. A write
// form: nothing is fetched, so there is nothing to reload.
//
// THE FORM KEEPS A DRAFT ON THIS PHONE (feat/form-drafts, 2026-10-04; MOBILE
// M25) under this account's numeric id — `new`, or `edit-<letter id>`. Close
// and Back keep it, and so does a killed app; it comes back when this screen
// opens again, with the notice. It is removed when the server confirms the
// submit, on a confirmed Discard draft, and on logout.
function dateFromParts(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateToLocal(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function ExcuseLetterComposeScreen({ navigation, route }) {
  const editing = route?.params?.letter || null;
  const { tokens } = useTheme();
  const today = todayLocalDateString();
  const [absenceDate, setAbsenceDate] = useState(editing?.absence_date || '');
  const [reason, setReason] = useState(editing?.reason || '');
  const [details, setDetails] = useState(editing?.details || '');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [dateError, setDateError] = useState(null);

  // The draft: the letter's own fields are the base for an edit (empty for a
  // new letter); a restored draft keeps the base it was started on, so the
  // "item changed" notice stays true until it is submitted or discarded.
  const { user } = useAuth();
  const opening = useMemo(
    () => ({ absence_date: editing?.absence_date || '', reason: editing?.reason || '', details: editing?.details || '' }),
    [editing]
  );
  const [draftBase, setDraftBase] = useState(opening);
  const [draftNotice, setDraftNotice] = useState(null);
  const values = useMemo(() => ({ absence_date: absenceDate, reason, details }), [absenceDate, reason, details]);
  const restore = useCallback(
    (record) => {
      if (!record) return;
      setAbsenceDate(record.values.absence_date);
      setReason(record.values.reason);
      setDetails(record.values.details);
      setDraftBase(record.base || opening);
      setDraftNotice(editing && itemChangedSince('excuse', record, opening) ? 'changed' : 'restored');
    },
    [editing, opening]
  );
  const draft = useDeviceDraft({
    userId: user?.id ?? null,
    form: 'excuse',
    context: editing ? editContext(editing.id) : 'new',
    values,
    base: draftBase,
    onRestore: restore,
  });

  // After "Discard this draft?" was confirmed (DraftNotice's Alert).
  function discardDraft() {
    draft.discard();
    setAbsenceDate(opening.absence_date);
    setReason(opening.reason);
    setDetails(opening.details);
    setDraftBase(opening);
    setDraftNotice(null);
  }

  async function submit() {
    if (saving) return;
    setFormError(null);
    setDateError(null);
    if (!absenceDate) {
      setDateError('Pick the date of the absence.');
      return;
    }
    setSaving(true);
    try {
      const body = { absence_date: absenceDate, reason, details: details.trim() ? details : null };
      if (editing) await api.put(`/excuse-letters/${editing.id}`, body, { unwrap: 'excuse_letter' });
      else await api.post('/excuse-letters', body, { unwrap: 'excuse_letter' });
      // The server confirmed: the draft goes, and is not written on unmount.
      draft.submitted(values);
      // popTo, not navigate: navigate pushes a second drawer (M16).
      navigation.popTo('Main', { screen: '/parent/excuse-letters', params: { notice: editing ? 'Letter updated.' : 'Letter submitted.' } });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'absence_date') setDateError(extractError(err));
      else setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {draftNotice ? <DraftNotice changed={draftNotice === 'changed'} onDiscard={discardDraft} /> : null}
        {formError ? <ErrorAlert message={formError} /> : null}
        <View className="flex-row items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3">
          <Icon name="fa-circle-info" size={16} color={tokens['info-strong']} style={{ marginTop: 2 }} />
          <Text className="min-w-0 flex-1 text-sm text-info-strong">{PARENT_NOTE}</Text>
        </View>

        <Reveal>
          <View className={`${cardClass} gap-4 p-4`}>
            <FormField
              label="Absence date"
              required
              error={dateError}
              render={({ invalid }) => (
                <>
                  <Pressable
                    onPress={() => setShowPicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel={absenceDate ? `Absence date, ${longDate(absenceDate)}` : 'Pick the absence date'}
                    android_ripple={{ color: tokens['edge-strong'] }}
                    className={`flex-row items-center justify-between gap-3 overflow-hidden rounded-xl border bg-surface px-4 py-3.5 ${invalid ? 'border-danger-edge-strong' : 'border-edge-strong'}`}
                    style={{ minHeight: 48 }}
                  >
                    <Text className={`min-w-0 flex-1 text-base ${absenceDate ? 'text-fg' : 'text-fg-muted'}`}>{absenceDate ? longDate(absenceDate) : 'Pick a date'}</Text>
                    <Icon name="fa-calendar-days" size={15} color={tokens['fg-muted']} />
                  </Pressable>
                  {showPicker ? (
                    <DateTimePicker
                      value={absenceDate ? dateToLocal(absenceDate) : dateToLocal(today)}
                      mode="date"
                      display="default"
                      maximumDate={dateToLocal(today)}
                      // The 9.x API: `onChange` is deprecated (it raised a LogBox
                      // warning on the phone check that covered the drawer's
                      // Logout). `onValueChange` fires on Set with the Date;
                      // `onDismiss` on Cancel or the back gesture.
                      onValueChange={(event, picked) => {
                        setShowPicker(Platform.OS === 'ios');
                        if (picked) {
                          setDateError(null);
                          setAbsenceDate(dateFromParts(picked));
                        }
                      }}
                      onDismiss={() => setShowPicker(false)}
                    />
                  ) : null}
                </>
              )}
            />

            <FormField label="Reason" required value={reason} onChangeText={setReason} placeholder="Short reason for the absence" />
            <FormField
              label="Details"
              value={details}
              onChangeText={setDetails}
              placeholder="Optional — anything the adviser should know"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="min-h-24"
            />
          </View>
        </Reveal>

        {/* The label still changes while the write is in flight; `loading`
            adds the spinner, and the button is disabled exactly when it was
            before (saving, or no reason typed). */}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="secondary" onPress={() => navigation.goBack()} disabled={saving}>
            Close
          </Button>
          <Button variant="primary" onPress={submit} disabled={saving || !reason.trim()} loading={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Submit'}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
