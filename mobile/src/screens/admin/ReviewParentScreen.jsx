import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import { reviewConfirmText, reviewDoneText, reviewProblem } from './users/logic';

// REVIEW A PENDING PARENT — the web's review dialog as a modal screen.
// LEAVING PENDING IS ONE-WAY (approve / reject answer 400 once the account is
// not pending; there is no return-to-pending), so the decision is confirmed
// and NAMED BACK (§5e) with the web's words. A rejection needs a reason — the
// web's message on Continue. The login id IS shown here: this is the admin
// acting on that account (§5c), as the web's dialog does. The row is the
// pending list's row; the result goes back to the queue's own slot.
function Field({ label, value }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      <Text className="mt-0.5 text-sm text-fg">{value || '—'}</Text>
    </View>
  );
}

export default function ReviewParentScreen({ navigation, route }) {
  const parent = route.params.parent;
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function tryConfirm() {
    const problem = reviewProblem(decision, reason);
    setError(problem);
    if (!problem) setConfirming(true);
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (decision === 'approve') await api.put(`/users/parents/${parent.id}/approve`, {}, { unwrap: 'user' });
      else await api.put(`/users/parents/${parent.id}/reject`, { reason: reason.trim() }, { unwrap: 'message' });
      navigation.navigate('Main', { screen: '/admin/users', params: { notice: reviewDoneText(decision), noticeKey: 'pending' } });
    } catch (err) {
      setError(extractError(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        <Text className="text-base font-semibold text-fg">Review parent — {parent.name}</Text>
        {error ? <ErrorAlert message={error} /> : null}
        <View className="gap-3 rounded-xl border border-edge bg-surface p-4">
          <Field label="Student" value={`${parent.student_last_name}, ${parent.student_first_name}`} />
          <Field label="Class" value={`Grade ${parent.grade_level} - ${parent.section}`} />
          <Field label="Login ID" value={parent.login_id} />
          <Field label="Created by" value={parent.created_by_name} />
        </View>

        {confirming ? (
          <>
            <View className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2">
              <Text className="text-sm text-warning-strong">
                <Text className="font-semibold">{reviewConfirmText(decision)}</Text> This cannot be returned to pending afterward.
              </Text>
            </View>
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => setConfirming(false)} disabled={saving} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Go back</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={saving}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
                className={`rounded-lg px-4 py-2 ${decision === 'approve' ? 'bg-success-solid' : 'bg-danger-solid'} ${saving ? 'opacity-60' : ''}`}
              >
                <Text className="text-sm font-medium text-solid-fg">{saving ? 'Saving…' : `Yes, ${decision === 'approve' ? 'approve' : 'reject'}`}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View>
              <Text className="mb-1.5 text-sm font-medium text-fg-secondary">Decision</Text>
              <View className="flex-row gap-2">
                {[
                  { value: 'approve', label: 'Approve' },
                  { value: 'reject', label: 'Reject' },
                ].map((option) => {
                  const active = decision === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setDecision(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, checked: active }}
                      className={`min-h-11 flex-1 items-center justify-center rounded-lg border px-3 py-2 ${active ? 'border-primary bg-primary' : 'border-edge-strong bg-surface'}`}
                    >
                      <Text className={`text-sm ${active ? 'font-medium text-primary-fg' : 'text-fg-body'}`}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {decision === 'reject' ? (
              <FormField label="Reason" required value={reason} onChangeText={setReason} multiline numberOfLines={3} textAlignVertical="top" className="min-h-24" />
            ) : null}
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="rounded-lg border border-edge-strong px-4 py-2">
                <Text className="text-sm font-medium text-fg-body">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={tryConfirm}
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
