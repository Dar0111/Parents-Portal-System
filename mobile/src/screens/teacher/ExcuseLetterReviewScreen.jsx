import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Text from '../../components/Text';
import { longDate } from '../../format/date';
import { REVIEW_UNWRAP, confirmSentence, confirmTail, isClassDay, reviewNote, successNote } from '../../format/excuseAttendance';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// REVIEW A LETTER — the web's review modal as a modal screen. Decision
// (Approve / Decline) → Remarks → Continue → a confirmation NAMING THE
// DECISION BACK (§5e: once a letter leaves Pending, PATCH /:id/review
// answers 403 and there is no un-review). Remarks stay optional on both
// decisions — an API decision — and the nudge shows only on Decline. THE
// DAY sits at the moment of decision (feat/excuse-attendance, B8): a decision
// sets that day's attendance (approved → Excused, declined → Absent, a
// Present, Late or Excused mark kept, nothing on a day that is not a class
// day), so the screen reads the day's mark and says what each decision does
// to it — the web's words, format/excuseAttendance.js mirrored. On success
// the list gets `notice` naming the learner and the day as the server wrote
// it, because a reviewed letter leaves the default Pending list on the reload.
//
// The row is the LIST ROW (§20c); `canReview` was decided on the list, and
// the server still decides: a 403 here is a reason shown in place, never a
// logout (§2), and the form returns to the decision step so the teacher can
// re-read.
//
// THE LOOK (feat/ui-refresh, 2026-10-02). The letter is one card: the two
// short facts, then the parent's own words at reading size. THE DECISION IS
// TWO TOGGLES OF EQUAL WIDTH, each a 48dp target (a plain style object in dp
// — M19 — and never a style function — M20). The chosen one is tinted, its
// label is the heavier face AND it carries a check, so the choice is never
// colour alone; it is deliberately NOT filled, so the one filled button on
// the screen is the step forward. The confirm takes the decision's own
// variant: `success` to approve, `danger` to decline. NO ENTRANCE MOTION:
// nothing may delay the sentence that names the decision.
function Field({ label, children }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

export default function ExcuseLetterReviewScreen({ navigation, route }) {
  const letter = route.params.letter;
  const { tokens } = useTheme();
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  // THE LETTER'S DAY: its mark, from the adviser's own read of that learner's
  // attendance; only a class day is read. `{ state, current }` — loading from
  // the first render (no state set in the effect), then ready or failed. A
  // reply older than the newest read is dropped.
  const date = letter.absence_date;
  const [day, setDay] = useState(() => (isClassDay(date) ? { state: 'loading', current: null } : null));
  const dayTicket = useRef(0);
  const fetchDay = useCallback(() => {
    dayTicket.current += 1;
    const ticket = dayTicket.current;
    api
      .get(`/attendance/student/${letter.student_id}`, { unwrap: 'attendance', params: { from: date, to: date } })
      .then((rows) => {
        if (dayTicket.current !== ticket) return;
        const row = rows.find((r) => r.date === date);
        setDay({ state: 'ready', current: row ? row.status : null });
      })
      .catch(() => {
        if (dayTicket.current === ticket) setDay({ state: 'failed', current: null });
      });
  }, [letter.student_id, date]);
  useEffect(() => {
    if (isClassDay(date)) fetchDay();
  }, [date, fetchDay]);

  async function submitReview() {
    if (saving || !decision) return;
    setSaving(true);
    setReviewError(null);
    try {
      const reply = await api.patch(`/excuse-letters/${letter.id}/review`, { status: decision, teacher_remarks: remarks.trim() || undefined }, { unwrap: REVIEW_UNWRAP });
      // The day as the SERVER wrote it, never the prediction.
      const message = successNote(`${letter.last_name}, ${letter.first_name}`, decision, reply);
      // popTo, not navigate: navigate pushes a second drawer (M16).
      navigation.popTo('Main', { screen: '/teacher/excuse-letters', params: { notice: message } });
    } catch (err) {
      setReviewError(extractError(err));
      setConfirming(false);
      // The day may have moved under the review (a 409 is exactly that).
      if (isClassDay(date)) {
        setDay({ state: 'loading', current: null });
        fetchDay();
      }
    } finally {
      setSaving(false);
    }
  }

  const approve = decision === 'Approved';

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        <Text accessibilityRole="header" className="font-serif text-xl text-fg">
          Review letter — {letter.first_name} {letter.last_name}
        </Text>
        {reviewError ? <ErrorAlert message={reviewError} /> : null}

        <View className={`${cardClass} gap-4 p-4`}>
          <Field label="Absence date">
            <Text className="text-sm text-fg">{longDate(letter.absence_date)}</Text>
          </Field>
          <Field label="Class">
            <Text className="text-sm text-fg">
              Grade {letter.grade_level} - {letter.section}
            </Text>
          </Field>
          <Field label="Reason">
            <Text className="text-base leading-relaxed text-fg-body">{letter.reason}</Text>
          </Field>
          {letter.details ? (
            <Field label="Details">
              <Text className="text-base leading-relaxed text-fg-body">{letter.details}</Text>
            </Field>
          ) : null}
        </View>

        <View className="flex-row items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3">
          <Icon name="fa-circle-info" size={16} color={tokens['info-strong']} style={{ marginTop: 2 }} />
          <Text className="min-w-0 flex-1 text-sm text-info-strong">{reviewNote(date, day)}</Text>
        </View>

        {confirming ? (
          <>
            <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
              <Icon name="fa-triangle-exclamation" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
              <Text className="min-w-0 flex-1 text-sm text-warning-strong">
                <Text className="font-semibold">{approve ? 'Approve this letter?' : 'Decline this letter?'}</Text> {confirmSentence(decision, date, day)} {confirmTail(decision, date, day)}
              </Text>
            </View>
            {/* The label still changes while the write is in flight; `loading`
                is the old `disabled={saving}` plus its spinner. */}
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button variant="secondary" onPress={() => setConfirming(false)} disabled={saving}>
                Go back
              </Button>
              <Button variant={approve ? 'success' : 'danger'} onPress={submitReview} loading={saving}>
                {saving ? 'Saving…' : `Yes, ${approve ? 'approve' : 'decline'}`}
              </Button>
            </View>
          </>
        ) : (
          <>
            <View className={`${cardClass} gap-4 p-4`}>
              <View>
                <Text className="mb-1.5 text-sm font-semibold text-fg-secondary">Decision</Text>
                <View className="flex-row gap-2">
                  {['Approved', 'Declined'].map((value) => {
                    const active = decision === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setDecision(value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active, checked: active }}
                        android_ripple={{ color: tokens['edge-strong'] }}
                        className={`flex-1 flex-row items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-2 ${
                          active ? 'border-primary bg-brand-soft' : 'border-edge-strong bg-surface'
                        }`}
                        style={{ minHeight: 48 }}
                      >
                        {active ? <Icon name="fa-check" size={14} color={tokens.brand} /> : null}
                        <Text className={`text-sm ${active ? 'font-semibold text-brand' : 'text-fg-body'}`}>{value === 'Approved' ? 'Approve' : 'Decline'}</Text>
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
            </View>
            <View className="flex-row flex-wrap justify-end gap-2">
              <Button variant="secondary" onPress={() => navigation.goBack()} disabled={saving}>
                Cancel
              </Button>
              {/* Waits for the day's read, so the confirmation can name its effect. */}
              <Button variant="primary" onPress={() => setConfirming(true)} disabled={!decision || day?.state === 'loading'}>
                Continue
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
