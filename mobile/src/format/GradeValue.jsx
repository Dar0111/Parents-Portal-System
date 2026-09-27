import { Text } from 'react-native';
import { gradeText } from './gradeText';

// The web's GradeValue over gradeText (§3): a number prints in tabular
// figures; a null prints "— Pending" or "— N/A" as INLINE TEXT — touch has
// no hover, and the report card is read on a phone. `className` is for the
// caller's colour on a coloured surface (the hero); the default inherits.
export default function GradeValue({ value, mode, whole = false, className = '' }) {
  const { text, reason } = gradeText(value, mode, whole);
  if (text !== null) {
    return (
      <Text className={className} style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </Text>
    );
  }
  return (
    <Text accessibilityLabel={reason.title} className={`text-fg-muted ${className}`}>
      — <Text className="text-xs italic">{reason.short}</Text>
    </Text>
  );
}
