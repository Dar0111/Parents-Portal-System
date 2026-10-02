import Text from '../components/Text';
import GradeValue from './GradeValue';

// A DESCRIPTIVE LETTER IS NOT A GradeValue (§14a). In descriptive mode the
// cell is the letter with its descriptor beside it; an UNRECORDED letter is
// Pending, not N/A — so the null goes through GradeValue in NUMERICAL mode
// on purpose. In numerical mode a term grade prints whole (§3).
const NULL_IS_PENDING = 'numerical';

export default function TermValue({ entry, mode, className = '' }) {
  if (mode === 'descriptive') {
    if (!entry?.descriptive_grade) {
      return <GradeValue value={null} mode={NULL_IS_PENDING} className={className} />;
    }
    return (
      <Text className={className}>
        <Text className="font-semibold">{entry.descriptive_grade}</Text>
        {entry.descriptor?.descriptor ? <Text className="text-xs text-fg-muted">{`  ${entry.descriptor.descriptor}`}</Text> : null}
      </Text>
    );
  }
  return <GradeValue value={entry?.term_grade} mode={mode} whole className={className} />;
}
