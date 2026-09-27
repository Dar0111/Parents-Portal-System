import { Pressable, Text, View } from 'react-native';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// The web's dashboard Card (§12): each card owns its own loading, error and
// empty state INSIDE its frame, and `onRetry` refetches that card alone. No
// card is red — `danger` is defined and deliberately unused; amber means
// "there is something to do". `onOpen` replaces the web's `to` link.
export default function Card({ title, icon, onOpen, linkLabel = 'Open', loading = false, error = null, onRetry = null, tone = 'default', children }) {
  const { tokens } = useTheme();
  const toneClass =
    tone === 'warning' ? 'border-warning-edge bg-warning-soft' : tone === 'danger' ? 'border-danger-edge bg-danger-soft' : 'border-edge bg-surface';
  return (
    <View className={`rounded-xl border p-5 ${toneClass}`}>
      <View className="mb-3 flex-row items-center gap-2">
        {icon ? <Icon name={icon} size={13} color={tokens['fg-muted']} /> : null}
        <Text className="text-sm font-semibold text-fg">{title}</Text>
      </View>
      <View className="min-w-0">
        {loading ? (
          <View className="py-4">
            <LoadingSpinner />
          </View>
        ) : error ? (
          <ErrorAlert message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </View>
      {onOpen ? (
        <Pressable onPress={onOpen} accessibilityRole="link" className="mt-4 self-start">
          <Text className="text-sm font-medium text-brand">{linkLabel} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// `Stat` must not format (§15d): a grade-bearing value arrives already
// rendered by GradeValue; a count arrives as a number.
export function Stat({ value, caption, muted = false }) {
  return (
    <View>
      <Text className={`text-2xl font-semibold ${muted ? 'text-fg-muted' : 'text-fg'}`}>{value}</Text>
      {caption ? <Text className="mt-1 text-sm text-fg-muted">{caption}</Text> : null}
    </View>
  );
}

export function CardEmpty({ children }) {
  return <Text className="text-sm text-fg-muted">{children}</Text>;
}
