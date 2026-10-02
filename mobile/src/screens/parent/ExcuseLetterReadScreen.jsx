import { ScrollView, View } from 'react-native';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import { longDate } from '../../format/date';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// THE READING VIEW — the web's modal as a screen. It renders the LIST ROW
// it was given, never GET /:id (§20c: the detail endpoint returns strictly
// less than the list). Absence date, status, reason, details when present,
// the adviser's remarks when present; Edit only while Pending, and the
// web's sentence once reviewed. No identifier anywhere.
//
// THE LOOK (feat/ui-refresh), as the web's reading modal: a header card —
// the day the letter is about in the title face, with where it stands beside
// it — then the parent's own words in a card of their own, and the adviser's
// reply set apart inside it: after a decline that is the one thing the parent
// opened the letter to read. Edit is the screen's one action, under the
// letter. Nothing is fetched, so there is nothing to reload.

// The label over a field: the eyebrow style.
const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';
// A parent's own words (and the adviser's reply) are reading text.
const FIELD_PROSE = 'mt-1 text-base leading-relaxed text-fg-body';

export default function ExcuseLetterReadScreen({ navigation, route }) {
  const { tokens } = useTheme();
  const letter = route.params.letter;
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10">
      <Reveal>
        <View className={`${cardClass} flex-row items-start justify-between gap-4 p-5`}>
          <View className="min-w-0 flex-1">
            <Text className={FIELD_LABEL}>Absence date</Text>
            <Text accessibilityRole="header" className="mt-0.5 font-serif text-xl text-fg">
              {longDate(letter.absence_date)}
            </Text>
          </View>
          <View>
            <Text className={FIELD_LABEL}>Status</Text>
            <View className="mt-1.5">
              <StatusBadge status={letter.status} />
            </View>
          </View>
        </View>
      </Reveal>

      {/* `details` and `teacher_remarks` are both nullable: each label renders
          only with its value, so an absent one is absent rather than an empty
          label, which would read as a failed fetch. */}
      <View className={`${cardClass} gap-4 p-4`}>
        <View>
          <Text className={FIELD_LABEL}>Reason</Text>
          <Text className="mt-1 text-sm font-semibold text-fg">{letter.reason}</Text>
        </View>
        {letter.details ? (
          <View>
            <Text className={FIELD_LABEL}>Details</Text>
            <Text className={FIELD_PROSE}>{letter.details}</Text>
          </View>
        ) : null}
        {letter.teacher_remarks ? (
          <View className="rounded-xl border border-edge-soft bg-surface-subtle px-4 py-3">
            <Text className={FIELD_LABEL}>Adviser remarks</Text>
            <Text className={FIELD_PROSE}>{letter.teacher_remarks}</Text>
          </View>
        ) : null}
      </View>

      {letter.status === 'Pending' ? (
        <Button icon="fa-pen" className="self-start" onPress={() => navigation.navigate('ExcuseLetterCompose', { letter })}>
          Edit
        </Button>
      ) : (
        <View className="flex-row items-center gap-2">
          <Icon name="fa-lock" size={11} color={tokens['fg-faint']} />
          <Text className="min-w-0 flex-1 text-sm text-fg-muted">This letter has been reviewed and can no longer be edited.</Text>
        </View>
      )}
    </ScrollView>
  );
}
