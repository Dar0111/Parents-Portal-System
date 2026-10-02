import { ScrollView, View } from 'react-native';
import { cardClass } from '../../../components/buttonStyles';
import StatusBadge from '../../../components/StatusBadge';
import Text from '../../../components/Text';
import { longDate } from '../../../format/date';
import Icon from '../../../icons';
import Reveal from '../../../motion/Reveal';
import { useTheme } from '../../../theme/ThemeProvider';

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
//
// THE LAYOUT (feat/ui-refresh, 2026-10-02) is the web's, three kinds of row
// in one card, the seven headings and their order unchanged:
//
//   the four short facts   — small tiles, two to a row: who, which class,
//                            which day, and where the letter stands. Two
//                            explicit rows rather than a wrapping one, so
//                            the pairs never depend on how a row wraps.
//   the parent's own words — Reason and Details at READING size.
//   the adviser's reply    — on the brand tint, so the one part of the letter
//                            the school wrote is told apart from the parent's
//                            by more than its heading.
//
// No reload: nothing here is fetched — the screen renders its route param.

// One eyebrow for every heading: small, uppercase, muted.
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';
// The parent's prose.
const READING = 'mt-1 text-base leading-relaxed text-fg-body';

// A short fact's tile. Two share a row and stretch to the taller one's height.
function Tile({ label, children }) {
  return (
    <View className="min-w-0 flex-1 rounded-xl bg-surface-subtle px-3 py-3">
      <Text className={HEADING}>{label}</Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

export function LetterReadingView({ letter }) {
  const { tokens } = useTheme();
  if (!letter) return null;
  return (
    <View className={`${cardClass} gap-4 p-4`}>
      <View className="flex-row gap-3">
        <Tile label="Learner">
          <Text className="text-sm font-semibold text-fg">
            {letter.last_name}, {letter.first_name}
          </Text>
        </Tile>
        <Tile label="Class">
          <Text className="text-sm text-fg">
            Grade {letter.grade_level} - {letter.section}
          </Text>
        </Tile>
      </View>
      <View className="flex-row gap-3">
        <Tile label="Absence date">
          <Text className="text-sm text-fg">{longDate(letter.absence_date)}</Text>
        </Tile>
        <Tile label="Status">
          <StatusBadge status={letter.status} />
        </Tile>
      </View>
      <View>
        <Text className={HEADING}>Reason</Text>
        <Text className={READING}>{letter.reason}</Text>
      </View>
      {/* `details` and `teacher_remarks` are both nullable, and remarks are
          optional at the API layer by decision. Each heading renders only
          with its value, so an absent one is absent rather than an empty
          label, which would read as a failed fetch. */}
      {letter.details ? (
        <View>
          <Text className={HEADING}>Details</Text>
          <Text className={READING}>{letter.details}</Text>
        </View>
      ) : null}
      {letter.teacher_remarks ? (
        <View className="rounded-xl bg-brand-soft px-4 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-brand">Adviser remarks</Text>
          <Text className="mt-1 text-base leading-relaxed text-fg">{letter.teacher_remarks}</Text>
        </View>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Icon name="fa-lock" size={11} color={tokens['fg-faint']} />
        <Text className="min-w-0 flex-1 text-xs text-fg-muted">Reviewed letters cannot be changed. Read-only.</Text>
      </View>
    </View>
  );
}

export default function TeacherExcuseLetterReadScreen({ route }) {
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4 pb-10">
      <Reveal>
        <LetterReadingView letter={route.params.letter} />
      </Reveal>
    </ScrollView>
  );
}
