import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import { longDate } from '../../format/date';

// REVIEW A LETTER — the web's review modal as a modal screen. Decision
// (Approve / Decline) → Remarks → Continue → a confirmation NAMING THE
// DECISION BACK (§5e: once a letter leaves Pending, PATCH /:id/review
// answers 403 and there is no un-review). Remarks stay optional on both
// decisions — an API decision — and the nudge shows only on Decline. THE
// SCHOOL'S OWN RULE sits at the moment of decision: approving records the
// reason and does not touch the attendance record (the handler names no
// attendance query). On success the list gets `notice` naming the learner,
// because a reviewed letter leaves the default Pending list on the reload.
//
// The row is the LIST ROW (§20c); `canReview` was decided on the list, and
// the server still decides: a 403 here is a reason shown in place, never a
// logout (§2), and the form returns to the decision step so the teacher can
// re-read.
function Field({ label, children }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-0.5">{children}</View>
    </View>
  );
}

export default function ExcuseLetterReviewScreen({ navigation, route }) {
  const letter = route.params.letter;
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  async function submitReview() {
    if (saving || !decision) return;
    setSaving(true);
    setReviewError(null);
    try {
      await api.patch(`/excuse-letters/${letter.id}/review`, { status: decision, teacher_remarks: remarks.trim() || undefined }, { unwrap: 'excuse_letter' });
      const message = `Letter from ${letter.last_name}, ${letter.first_name} ${decision === 'Approved' ? 'approved' : 'declined'}.`;
      navigation.navigate('Main', { screen: '/teacher/excuse-letters', params: { notice: message } });
    } catch (err) {
      setReviewError(extractError(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  const approve = decision === 'Approved';

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        <Text className="text-base font-semibold text-fg">
          Review letter — {letter.first_name} {letter.last_name}
        </Text>
        {reviewError ? <ErrorAlert message={reviewError} /> : null}

        <View className="gap-3 rounded-xl border border-edge bg-surface p-4">
          <Field label="Absence date">
            <Text className="text-sm text-fg">{longDate(letter.absence_date)}</Text>
          </Field>
          <Field label="Class">
            <Text className="text-sm text-fg">
              Grade {letter.grade_level} - {letter.section}
            </Text>
          </Field>
          <Field label="Reason">
            <Text className="text-sm text-fg">{letter.reason}</Text>
          </Field>
          {letter.details ? (
            <Field label="Details">
              <Text className="text-sm text-fg">{letter.details}</Text>
            </Field>
          ) : null}
        </View>

        <View className="rounded-lg border border-info-edge bg-info-soft px-3 py-2">
          <Text className="text-sm text-info-strong">Approving records the reason given in this letter. It does not change the attendance record for that day.</Text>
        </View>

        {confirming ? (
          <>
            <View className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2">
              <Text className="text-sm text-warning-strong">
                <Text className="font-semibold">{approve ? 'Approve this letter?' : 'Decline this letter?'}</Text> This cannot be changed afterward.
              </Text>
            </View>
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => setConfirming(false)} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Go back</Text>
              </Pressable>
              <Pressable
                onPress={submitReview}
                disabled={saving}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
                className={`rounded-lg px-4 py-2 ${approve ? 'bg-success-solid' : 'bg-danger-solid'} ${saving ? 'opacity-60' : ''}`}
              >
                <Text className="text-sm font-medium text-solid-fg">{saving ? 'Saving…' : `Yes, ${approve ? 'approve' : 'decline'}`}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View>
              <Text className="mb-1.5 text-sm font-medium text-fg-secondary">Decision</Text>
              <View className="flex-row gap-2">
                {['Approved', 'Declined'].map((value) => {
                  const active = decision === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setDecision(value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, checked: active }}
                      className={`min-h-11 flex-1 items-center justify-center rounded-lg border px-3 py-2 ${active ? 'border-primary bg-primary' : 'border-edge-strong bg-surface'}`}
                    >
                      <Text className={`text-sm ${active ? 'font-medium text-primary-fg' : 'text-fg-body'}`}>{value === 'Approved' ? 'Approve' : 'Decline'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <FormField
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="min-h-24"
              hint={decision === 'Declined' ? 'Optional — but a declined letter with no reason sends the parent to Messages to ask why.' : 'Optional.'}
            />
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => navigation.goBack()} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirming(true)}
                disabled={!decision}
                accessibilityRole="button"
                accessibilityState={{ disabled: !decision }}
                className={`rounded-lg bg-primary px-4 py-2 ${!decision ? 'opacity-60' : ''}`}
              >
                <Text className="text-sm font-medium text-primary-fg">Continue</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
