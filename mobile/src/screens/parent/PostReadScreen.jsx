import { ScrollView, Text, View } from 'react-native';
import { longDate, timestampDay } from '../../format/date';

// ONE READING SCREEN for an announcement, a memo or an event — the web's
// three reading modals, which differ only in their meta line. `kind` picks
// the line; `row` is the LIST ROW (there is no GET /:id for any of the
// three). Audience labels are derived from the target columns' NULLNESS,
// never from `user.grade_level` (BUILD ORDER rule).
export function announcementAudience(row) {
  if (row.target_grade === null) return 'For everyone at the school';
  if (row.target_section === null) return "For your child's year level";
  return "For your child's class";
}

export function eventAudience(row) {
  return row.target_grade === null ? 'For everyone at the school' : "For your child's year level";
}

function metaLine(kind, row) {
  if (kind === 'announcement') {
    return [announcementAudience(row), `Posted ${timestampDay(row.created_at)}`, `Posted by ${row.posted_by_name}`, row.category || null];
  }
  if (kind === 'event') {
    return [longDate(row.event_date), eventAudience(row), `Posted by ${row.posted_by_name}`];
  }
  return [`Posted ${timestampDay(row.created_at)}`, `Posted by ${row.posted_by_name}`];
}

export default function PostReadScreen({ route }) {
  const { kind, row } = route.params;
  const body = kind === 'event' ? row.description : row.content;
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4 pb-10">
      <View className="rounded-xl border border-edge bg-surface p-4">
        <Text className="text-base font-semibold text-fg">{row.title}</Text>
        <Text className="mt-2 text-xs text-fg-muted">{metaLine(kind, row).filter(Boolean).join(' · ')}</Text>
        {body ? (
          <Text className="mt-4 text-sm leading-relaxed text-fg-secondary">{body}</Text>
        ) : (
          <Text className="mt-4 text-sm italic text-fg-muted">No further details.</Text>
        )}
      </View>
    </ScrollView>
  );
}
