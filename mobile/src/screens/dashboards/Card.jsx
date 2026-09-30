import { Pressable, Text, View } from 'react-native';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// The web's dashboard Card (§12): each card owns its own loading, error and
// empty state INSIDE its frame, and `onRetry` refetches that card alone. No
// card is red — `danger` is defined and deliberately unused; amber means
// "there is something to do". `onOpen` replaces the web's `to` link.
//
// THE WHOLE CARD IS THE PRESS TARGET (feat/ui-polish f2, 2026-09-30), not an
// "Open →" row at its foot: a tap anywhere on it opens the screen that owns
// its data, announced as a link. An ERROR card is not pressable — its one
// action is Retry, and a stray tap must not leave the failure it reports.
export default function Card({ title, icon, onOpen, loading = false, error = null, onRetry = null, tone = 'default', children }) {
  const { tokens } = useTheme();
  const toneClass =
    tone === 'warning' ? 'border-warning-edge bg-warning-soft' : tone === 'danger' ? 'border-danger-edge bg-danger-soft' : 'border-edge bg-surface';
  const body = (
    <>
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
    </>
  );
  if (onOpen && !error) {
    return (
      // Press feedback is a plain RN style function on a Pressable with NO
      // className; the frame's classes sit on the View inside, so NativeWind
      // never has to merge its styles with a function. (`active:` is used on
      // no other screen, so it is unproven here.)
      <Pressable onPress={onOpen} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View className={`rounded-xl border p-5 ${toneClass}`}>{body}</View>
      </Pressable>
    );
  }
  return <View className={`rounded-xl border p-5 ${toneClass}`}>{body}</View>;
}

// `Stat` must not format (§15d): a grade-bearing value arrives already
// rendered by GradeValue; a count arrives as a number. `large` is the
// emphasised card's lead (f2): on one column, emphasis is first position plus
// the bigger number.
export function Stat({ value, caption, muted = false, large = false }) {
  return (
    <View>
      {/* One step down, as on the web (§24, M19): `text-xl` / `large`
          `text-2xl` — 17.5 / 21dp at the phone's 14dp rem. */}
      <Text className={`${large ? 'text-2xl' : 'text-xl'} font-semibold ${muted ? 'text-fg-muted' : 'text-fg'}`}>{value}</Text>
      {caption ? <Text className="mt-1 text-sm text-fg-muted">{caption}</Text> : null}
    </View>
  );
}

export function CardEmpty({ children }) {
  return <Text className="text-sm text-fg-muted">{children}</Text>;
}
