import { ScrollView, View } from 'react-native';
import { cardClass } from '../../components/buttonStyles';
import Text from '../../components/Text';
import { longDate, timestampDay } from '../../format/date';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// ONE READING SCREEN for an announcement, a memo or an event — the web's
// three reading modals, which differ only in their meta line. `kind` picks
// the line; `row` is the LIST ROW (there is no GET /:id for any of the
// three). Audience labels are derived from the target columns' NULLNESS,
// never from `user.grade_level` (BUILD ORDER rule).
//
// THE LOOK (feat/ui-refresh), as the web's reading modals: a header card —
// the title in the title face, and the meta under it — then the body as
// reading text in a card of its own. The meta is the SAME facts in the same
// order as the one line it used to be; they are only set apart: an event's
// date leads as the emphasised line (the date is what defines an event), who
// the post is for is a chip (the one fact that decides whether it concerns
// this parent), and the rest is the caption. Nothing is fetched, so there is
// nothing to reload.
export function announcementAudience(row) {
  if (row.target_grade === null) return 'For everyone at the school';
  if (row.target_section === null) return "For your child's year level";
  return "For your child's class";
}

export function eventAudience(row) {
  return row.target_grade === null ? 'For everyone at the school' : "For your child's year level";
}

const KIND_ICON = { announcement: 'fa-bullhorn', memo: 'fa-file-lines', event: 'fa-calendar-days' };

// `when` is an event's date; `audience` the chip; `caption` everything else.
function metaParts(kind, row) {
  if (kind === 'announcement') {
    return {
      when: null,
      audience: announcementAudience(row),
      caption: [`Posted ${timestampDay(row.created_at)}`, `Posted by ${row.posted_by_name}`, row.category || null],
    };
  }
  if (kind === 'event') {
    return { when: longDate(row.event_date), audience: eventAudience(row), caption: [`Posted by ${row.posted_by_name}`] };
  }
  return { when: null, audience: null, caption: [`Posted ${timestampDay(row.created_at)}`, `Posted by ${row.posted_by_name}`] };
}

export default function PostReadScreen({ route }) {
  const { tokens } = useTheme();
  const { kind, row } = route.params;
  const body = kind === 'event' ? row.description : row.content;
  const meta = metaParts(kind, row);
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      <Reveal>
        <View className={`${cardClass} p-5`}>
          <View className="flex-row items-start gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
              <Icon name={KIND_ICON[kind] || 'fa-file-lines'} size={14} color={tokens.brand} />
            </View>
            <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-xl text-fg">
              {row.title}
            </Text>
          </View>
          {meta.when ? <Text className="mt-4 text-sm font-semibold text-fg">{meta.when}</Text> : null}
          {meta.audience ? (
            <View className={`${meta.when ? 'mt-2' : 'mt-4'} self-start rounded-full bg-brand-soft px-2.5 py-0.5`}>
              <Text className="text-xs font-semibold text-brand">{meta.audience}</Text>
            </View>
          ) : null}
          <Text className={`${meta.audience ? 'mt-2' : 'mt-4'} text-xs text-fg-muted`}>{meta.caption.filter(Boolean).join(' · ')}</Text>
        </View>
      </Reveal>

      <View className={`${cardClass} p-5`}>
        {body ? (
          <Text className="text-base leading-relaxed text-fg-body">{body}</Text>
        ) : (
          <Text className="text-sm italic text-fg-muted">No further details.</Text>
        )}
      </View>
    </ScrollView>
  );
}
