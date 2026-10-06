import { Pressable, View } from 'react-native';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import Skeleton, { SkeletonBar } from '../../components/Skeleton';
import Text from '../../components/Text';
import { useSkeleton } from '../../hooks/useSkeleton';
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
// No reload control on a card (owner, 2026-10-04): the dashboard's own
// pull-to-refresh asks every card again.
//
// THE LOOK (build 2, feat/dashboards-look, 2026-10-07 — the owner's Part C,
// the web card's): the container corner on EVERY tone (`rounded-xl`, §27f —
// the amber frame was `rounded-2xl` beside a `rounded-xl` default, two
// corners on one screen), the hairline edge, no shadow; the icon INLINE
// before the title in `fg-muted`, no tinted chip; the title in the title
// face. The amber frame stays (§12).
const TONES = {
  default: { frame: cardClass },
  warning: { frame: 'rounded-xl border border-warning-edge bg-warning-soft' },
  danger: { frame: 'rounded-xl border border-danger-edge bg-danger-soft' },
};

// LOADING AND RE-READING (build 2, feat/dashboards-look, 2026-10-07), the
// web Card's rule (decision 1), with useCard's two flags (a verbatim copy):
//   `loading` — nothing of this card's query is on screen: its SKELETON, in
//     the shape of what will arrive (`skeleton`: a figure, the bigger lead
//     figure, a figure over a short list, the admin's three counts, or the
//     System card's facts), after
//     300 ms, with the height reserved from the first frame.
//   `refreshing` — the same query read again (a focus re-read, a pull) over
//     its answer: the answer STAYS, its content takes no touches and is
//     marked busy. The card's own press is not stale — it opens the same
//     screen either way — so it is not part of that.
function Lines({ widths }) {
  return (
    <View className="mt-3 gap-2 border-t border-edge-soft pt-3">
      {widths.map((w) => (
        <View key={w} className="h-5 justify-center">
          <SkeletonBar className={`h-3 ${w}`} />
        </View>
      ))}
    </View>
  );
}

function Figure({ lead = false, width = 'w-16' }) {
  return (
    <>
      <View className={`${lead ? 'h-8' : 'h-7'} justify-center`}>
        <SkeletonBar className={`${lead ? 'h-6' : 'h-5'} ${width}`} />
      </View>
      <View className="mt-1 h-5 justify-center">
        <SkeletonBar className="h-3 w-2/3" />
      </View>
    </>
  );
}

const SKELETON_SHAPES = {
  figure: () => <Figure />,
  lead: () => <Figure lead />,
  list: () => (
    <>
      <Figure width="w-24" />
      <Lines widths={['w-3/4', 'w-2/3', 'w-1/2']} />
    </>
  ),
  // The admin People card (Part C): three label-figure-caption counts.
  counts: () => (
    <View className="gap-1">
      {['w-16', 'w-14', 'w-12'].map((w) => (
        <View key={w} className="px-3 py-2" style={{ minHeight: 48 }}>
          <View className="h-5 justify-center">
            <SkeletonBar className={`h-3 ${w}`} />
          </View>
          <View className="h-7 justify-center">
            <SkeletonBar className="h-5 w-10" />
          </View>
          <View className="mt-1 h-5 justify-center">
            <SkeletonBar className="h-3 w-3/4" />
          </View>
        </View>
      ))}
    </View>
  ),
  facts: () => (
    <>
      <View className="h-7 justify-center">
        <SkeletonBar className="h-5 w-40" />
      </View>
      <Lines widths={['w-1/2', 'w-2/5', 'w-3/4', 'w-1/2']} />
    </>
  ),
};

export default function Card({
  title,
  icon,
  onOpen,
  loading = false,
  refreshing = false,
  skeleton = 'figure',
  error = null,
  onRetry = null,
  tone = 'default',
  children,
}) {
  const { tokens } = useTheme();
  const phase = useSkeleton(loading);
  const Shape = SKELETON_SHAPES[skeleton] || SKELETON_SHAPES.figure;
  const look = TONES[tone] || TONES.default;
  const frame = (
    <View className={`${look.frame} p-4`}>
      {/* The icon and the title on one row. A long title wraps beside the
          icon; it is never cut. */}
      <View className="mb-3 flex-row items-center gap-2">
        {icon ? <Icon name={icon} size={14} color={tokens['fg-muted']} /> : null}
        <Text className="min-w-0 flex-1 font-serif text-base text-fg">{title}</Text>
      </View>
      <View
        className="min-w-0"
        pointerEvents={refreshing ? 'none' : 'auto'}
        accessibilityState={refreshing ? { busy: true } : undefined}
      >
        {loading ? (
          <Skeleton phase={phase}>
            <Shape />
          </Skeleton>
        ) : error ? (
          <ErrorAlert message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </View>
    </View>
  );
  return onOpen && !error ? (
    // Press feedback is a plain RN style function on a Pressable with NO
    // className; the frame's classes sit on the View inside, so NativeWind
    // never has to merge its styles with a function. (`active:` is used on
    // no other screen, so it is unproven here.)
    <Pressable onPress={onOpen} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {frame}
    </Pressable>
  ) : (
    frame
  );
}

// `Stat` must not format (§15d): a grade-bearing value arrives already
// rendered by GradeValue; a count arrives as a number. `large` is the
// emphasised card's lead (f2): on one column, emphasis is first position plus
// the bigger number.
// TABULAR FIGURES (Part C, as the web's `tabular-nums`): a figure that
// changes on a re-read does not shift the caption under it.
const TABULAR = { fontVariant: ['tabular-nums'] };

export function Stat({ value, caption, muted = false, large = false }) {
  return (
    <View className="min-w-0">
      {/* One step down, as on the web (§24, M19): `text-xl` / `large`
          `text-2xl`. Bold since feat/ui-refresh, as the web's figure is. */}
      <Text className={`${large ? 'text-2xl' : 'text-xl'} font-bold ${muted ? 'text-fg-muted' : 'text-fg'}`} style={TABULAR}>
        {value}
      </Text>
      {caption ? <Text className="mt-1 text-sm text-fg-muted">{caption}</Text> : null}
    </View>
  );
}

export function CardEmpty({ children }) {
  return <Text className="text-sm text-fg-muted">{children}</Text>;
}
