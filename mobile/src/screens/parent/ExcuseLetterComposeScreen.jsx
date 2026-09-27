import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import { longDate, todayLocalDateString } from '../../format/date';
import Icon from '../../icons';
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
      navigation.navigate('Main', { screen: '/parent/excuse-letters', params: { notice: editing ? 'Letter updated.' : 'Letter submitted.' } });
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
        {formError ? <ErrorAlert message={formError} /> : null}
        <View className="rounded-lg border border-info-edge bg-info-soft px-3 py-2">
          <Text className="text-sm text-info-strong">The adviser records the reason. It does not change the attendance record for that day.</Text>
        </View>

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
                className={`flex-row items-center justify-between rounded-lg border bg-surface px-3 py-2.5 ${invalid ? 'border-danger-edge-strong' : 'border-edge-strong'}`}
              >
                <Text className={`text-base ${absenceDate ? 'text-fg' : 'text-fg-muted'}`}>{absenceDate ? longDate(absenceDate) : 'Pick a date'}</Text>
                <Icon name="fa-calendar-days" size={14} color={tokens['fg-faint']} />
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

        <View className="flex-row justify-end gap-2">
          <Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-2">
            <Text className="text-sm text-fg-body">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={saving || !reason.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !reason.trim(), busy: saving }}
            className={`rounded-lg bg-primary px-4 py-2 ${saving || !reason.trim() ? 'opacity-60' : ''}`}
          >
            <Text className="text-sm font-medium text-primary-fg">{saving ? 'Saving…' : editing ? 'Save changes' : 'Submit'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
