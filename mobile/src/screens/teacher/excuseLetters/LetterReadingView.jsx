import { ScrollView, Text, View } from 'react-native';
import StatusBadge from '../../../components/StatusBadge';
import { longDate } from '../../../format/date';

// The teacher's READ-ONLY view of a reviewed excuse letter — the web's
// excuseLetters/readingView.jsx (UI-E), as a pushed screen. It renders the
// LIST ROW it was given, never GET /:id (§20c: the detail endpoint returns
// strictly less than the list). The learner and the class ARE shown, where
// the parent's view omits them: a parent has one child, a teacher has a
// list. "Adviser remarks", not "your remarks" (§5i): the read scope is wider
// than the review scope. No LRN reaches this (§5c) — there is none in the
// payload. No Edit and no Review control: a reviewed letter cannot be
// reviewed again (`PATCH /:id/review` answers 403 once the status moved).
//
// The four deliberate omissions are the web's — the reviewer's name (an
// unresolved id), a reviewed date (no column), "Submitted", the attachment
// (nothing uploads).
function Field({ label, children }) {
  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</Text>
      <View className="mt-0.5">{children}</View>
    </View>
  );
}

export function LetterReadingView({ letter }) {
  if (!letter) return null;
  return (
    <View className="gap-4 rounded-xl border border-edge bg-surface p-4">
      <Field label="Learner">
        <Text className="text-sm text-fg">
          {letter.last_name}, {letter.first_name}
        </Text>
      </Field>
      <Field label="Class">
        <Text className="text-sm text-fg">
          Grade {letter.grade_level} - {letter.section}
        </Text>
      </Field>
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
      <Text className="text-xs text-fg-muted">Reviewed letters cannot be changed. Read-only.</Text>
    </View>
  );
}

export default function TeacherExcuseLetterReadScreen({ route }) {
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4 pb-10">
      <LetterReadingView letter={route.params.letter} />
    </ScrollView>
  );
}
