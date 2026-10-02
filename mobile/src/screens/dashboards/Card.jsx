import { Pressable, View } from 'react-native';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import ReloadButton from '../../components/ReloadButton';
import Text from '../../components/Text';
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
//
// `onReload` IS THE SAME IDEA WITHOUT A FAILURE (feat/ui-refresh, 2026-10-02):
// the card's own existing fetch, asked again from the button at the right of
// its header ("Reload <title>"). The body shows its normal spinner while it
// runs. Cards fed by ONE request each carry that request's reload, so pressing
// any of them refreshes them all — the button reloads what feeds its card, it
// never makes a request of its own. `reloading` is for a card whose body also
// reads a second, quieter request (the parent's subject list, the System
// card's backup line): the button stays busy until every read it started is
// back. It defaults to `loading`. Pull-to-refresh is unchanged.
//
// THE RELOAD BUTTON IS A SIBLING OF THE LINK, NEVER INSIDE IT. A Pressable is
// one accessible element, so a button nested in the card's link would be
// folded into the link's name and a screen reader could never reach it. It is
// placed over the header's right end instead — the header keeps an empty 44dp
// box there — and, drawn after the link, it takes its own taps.
//
// THE LOOK (feat/ui-refresh): the card surface (16px corners, the hairline
// edge), the icon in its chip, the title in the title face. On a toned card
// the chip is the plain surface with the tone's own strong colour, so it
// reads as a cut-out of the tinted frame rather than a second tint on it.
const TONES = {
  default: { frame: cardClass, chip: 'bg-brand-soft', ink: 'brand' },
  warning: { frame: 'rounded-2xl border border-warning-edge bg-warning-soft', chip: 'bg-surface', ink: 'warning-strong' },
  danger: { frame: 'rounded-2xl border border-danger-edge bg-danger-soft', chip: 'bg-surface', ink: 'danger-text' },
};

export default function Card({
  title,
  icon,
  onOpen,
  loading = false,
  error = null,
  onRetry = null,
  onReload = null,
  reloading,
  tone = 'default',
  children,
}) {
  const { tokens } = useTheme();
  const look = TONES[tone] || TONES.default;
  const frame = (
    <View className={`${look.frame} p-4`}>
      {/* 44dp tall with or without a Reload, so every card's header is one
          height. A long title wraps beside the chip; it is never cut. */}
      <View className="mb-3 flex-row items-center gap-3" style={{ minHeight: 44 }}>
        {icon ? (
          <View className={`h-9 w-9 items-center justify-center rounded-xl ${look.chip}`}>
            <Icon name={icon} size={14} color={tokens[look.ink]} />
          </View>
        ) : null}
        <Text className="min-w-0 flex-1 font-serif text-base text-fg">{title}</Text>
        {/* The room the Reload button is drawn over (below). */}
        {onReload ? <View style={{ width: 44, height: 44 }} /> : null}
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
    </View>
  );
  return (
    <View>
      {onOpen && !error ? (
        // Press feedback is a plain RN style function on a Pressable with NO
        // className; the frame's classes sit on the View inside, so NativeWind
        // never has to merge its styles with a function. (`active:` is used on
        // no other screen, so it is unproven here.)
        <Pressable onPress={onOpen} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          {frame}
        </Pressable>
      ) : (
        frame
      )}
      {onReload ? (
        // `right-4 top-4` is the frame's own `p-4`, so the button sits exactly
        // on the box the header left for it.
        <View className="absolute right-4 top-4">
          <ReloadButton onReload={onReload} loading={reloading ?? loading} label={`Reload ${title}`} />
        </View>
      ) : null}
    </View>
  );
}

// `Stat` must not format (§15d): a grade-bearing value arrives already
// rendered by GradeValue; a count arrives as a number. `large` is the
// emphasised card's lead (f2): on one column, emphasis is first position plus
// the bigger number.
export function Stat({ value, caption, muted = false, large = false }) {
  return (
    <View className="min-w-0">
      {/* One step down, as on the web (§24, M19): `text-xl` / `large`
          `text-2xl`. Bold since feat/ui-refresh, as the web's figure is. */}
      <Text className={`${large ? 'text-2xl' : 'text-xl'} font-bold ${muted ? 'text-fg-muted' : 'text-fg'}`}>{value}</Text>
      {caption ? <Text className="mt-1 text-sm text-fg-muted">{caption}</Text> : null}
    </View>
  );
}

export function CardEmpty({ children }) {
  return <Text className="text-sm text-fg-muted">{children}</Text>;
}
