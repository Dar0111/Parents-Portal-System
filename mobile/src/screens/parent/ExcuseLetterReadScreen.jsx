import { Pressable, ScrollView, Text, View } from 'react-native';
import StatusBadge from '../../components/StatusBadge';
import { longDate } from '../../format/date';

// THE READING VIEW — the web's modal as a screen. It renders the LIST ROW
// it was given, never GET /:id (§20c: the detail endpoint returns strictly
// less than the list). Absence date, status, reason, details when present,
// the adviser's remarks when present; Edit only while Pending, and the
// web's sentence once reviewed. No identifier anywhere.
function Field({ label, children }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-0.5">{children}</View>
    </View>
  );
}

export default function ExcuseLetterReadScreen({ navigation, route }) {
  const letter = route.params.letter;
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4 pb-10">
      <View className="gap-4 rounded-xl border border-edge bg-surface p-4">
        <Field label="Absence date">
          <Text className="text-sm text-fg">{longDate(letter.absence_date)}</Text>
        </Field>
        <Field label="Status">
          <StatusBadge status={letter.status} />
        </Field>
        <Field label="Reason">
          <Text className="text-sm text-fg">{letter.reason}</Text>
        </Field>
        {letter.details ? (
          <Field label="Details">
            <Text className="text-sm text-fg">{letter.details}</Text>
          </Field>
        ) : null}
        {letter.teacher_remarks ? (
          <Field label="Adviser remarks">
            <Text className="text-sm text-fg">{letter.teacher_remarks}</Text>
          </Field>
        ) : null}
        {letter.status === 'Pending' ? (
          <Pressable
            onPress={() => navigation.navigate('ExcuseLetterCompose', { letter })}
            accessibilityRole="button"
            className="self-start rounded-lg border border-edge-strong px-3 py-1.5"
          >
            <Text className="text-sm text-fg-body">Edit</Text>
          </Pressable>
        ) : (
          <Text className="text-sm text-fg-muted">This letter has been reviewed and can no longer be edited.</Text>
        )}
      </View>
    </ScrollView>
  );
}
