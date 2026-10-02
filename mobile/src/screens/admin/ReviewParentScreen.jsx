import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Text from '../../components/Text';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { reviewConfirmText, reviewDoneText, reviewProblem } from './users/logic';

// REVIEW A PENDING PARENT — the web's review dialog as a modal screen.
// LEAVING PENDING IS ONE-WAY (approve / reject answer 400 once the account is
// not pending; there is no return-to-pending), so the decision is confirmed
// and NAMED BACK (§5e) with the web's words. A rejection needs a reason — the
// web's message on Continue. The login id IS shown here: this is the admin
// acting on that account (§5c), as the web's dialog does. The row is the
// pending list's row; the result goes back to the queue's own slot.
//
// THE LOOK (feat/ui-refresh, 2026-10-03). Who is being decided on is one card
// of facts above the decision. THE DECISION IS TWO TOGGLES OF EQUAL WIDTH,
// each a 48dp target (a plain style object in dp — M19 — and never a style
// function — M20). The chosen one is tinted, its label is the heavier face
// AND it carries a check, so the choice is never colour alone; it is
// deliberately NOT filled, so the one filled button on the screen is the step
// forward. The confirm takes the decision's own variant: `success` to
// approve, `danger` to reject — never the accent. NO ENTRANCE MOTION: nothing
// may delay the sentence that names the decision.
//
// THE MISSING REASON RENDERS UNDER THE REASON FIELD (§7c). Continue is
// disabled until a decision is chosen, so the one refusal it can reach is
// "Rejection reason is required." — the field's own. A server refusal still
// goes to the strip at the top.
function Field({ label, value }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
      <Text className="mt-1 text-sm text-fg">{value || '—'}</Text>
    </View>
  );
}

const DECISIONS = [
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
];

export default function ReviewParentScreen({ navigation, route }) {
  const parent = route.params.parent;
  const { tokens } = useTheme();
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [reasonError, setReasonError] = useState(null);

  function tryConfirm() {
    const problem = reviewProblem(decision, reason);
    const aboutReason = Boolean(problem) && decision === 'reject';
    setReasonError(aboutReason ? problem : null);
    setError(aboutReason ? null : problem);
    if (!problem) setConfirming(true);
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (decision === 'approve') await api.put(`/users/parents/${parent.id}/approve`, {}, { unwrap: 'user' });
      else await api.put(`/users/parents/${parent.id}/reject`, { reason: reason.trim() }, { unwrap: 'message' });
      // popTo, not navigate: navigate pushes a second drawer (A1, M16).
      navigation.popTo('Main', { screen: '/admin/users', params: { notice: reviewDoneText(decision), noticeKey: 'pending' } });
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
        <Text accessibilityRole="header" className="font-serif text-xl text-fg">
          Review parent — {parent.name}
        </Text>
        {error ? <ErrorAlert message={error} /> : null}
        <View className={`${cardClass} gap-4 p-4`}>
          <Field label="Student" value={`${parent.student_last_name}, ${parent.student_first_name}`} />
          <Field label="Class" value={`Grade ${parent.grade_level} - ${parent.section}`} />
          <Field label="Login ID" value={parent.login_id} />
          <Field label="Created by" value={parent.created_by_name} />
        </View>

        {confirming ? (
          <>
            <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
              <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
              <Text className="min-w-0 flex-1 text-sm text-warning-strong">
                <Text className="font-semibold">{reviewConfirmText(decision)}</Text> This cannot be returned to pending afterward.
              </Text>
            </View>
            {/* The label still changes while the write is in flight; `loading`
                is the old `disabled={saving}` plus its spinner. */}
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button onPress={() => setConfirming(false)} disabled={saving}>
                Go back
              </Button>
              <Button variant={decision === 'approve' ? 'success' : 'danger'} onPress={submit} loading={saving}>
                {saving ? 'Saving…' : `Yes, ${decision === 'approve' ? 'approve' : 'reject'}`}
              </Button>
            </View>
          </>
        ) : (
          <>
            <View className={`${cardClass} gap-4 p-4`}>
              <View>
                <Text className="mb-1.5 text-sm font-semibold text-fg-secondary">Decision</Text>
                <View className="flex-row gap-2">
                  {DECISIONS.map((option) => {
                    const active = decision === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setDecision(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active, checked: active }}
                        android_ripple={{ color: tokens['edge-strong'] }}
                        className={`flex-1 flex-row items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-2 ${
                          active ? 'border-primary bg-brand-soft' : 'border-edge-strong bg-surface'
                        }`}
                        style={{ minHeight: 48 }}
                      >
                        {active ? <Icon name="fa-check" size={14} color={tokens.brand} /> : null}
                        <Text className={`text-sm ${active ? 'font-semibold text-brand' : 'text-fg-body'}`}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {decision === 'reject' ? (
                <FormField
                  label="Reason"
                  required
                  value={reason}
                  onChangeText={(text) => {
                    setReasonError(null);
                    setReason(text);
                  }}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="min-h-24"
                  error={reasonError}
                />
              ) : null}
            </View>
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button onPress={() => navigation.goBack()}>Cancel</Button>
              <Button variant="primary" onPress={tryConfirm} disabled={!decision}>
                Continue
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
