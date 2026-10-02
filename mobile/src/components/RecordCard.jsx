import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Avatar from './Avatar';
import Button from './Button';
import { cardClass } from './buttonStyles';
import StatusBadge from './StatusBadge';
import Text from './Text';

// ONE CARD, THE WEB'S `renderCard` DATA CONTRACT (§5a-iii, MOBILE_CONVENTIONS
// M11). A page's card builder returns DATA, never JSX — which is why the
// parent's `excuseLetters/card.jsx` is a verbatim copy — and this component
// is the one renderer: `avatar` (+ `avatarPhoto`, a USER's stored photo file
// name, feat/profile-photos), `title`, `subtitle`, `meta`, `status` (+
// `statusTone`), and EXACTLY ONE interactive element, `onSelect`. The web's
// `to` becomes `onSelect` on the phone (navigation is a function here, not
// a URL), and `unread` is a mobile addition for the Notifications rows: a
// dot and a bolder title, so a read row and an unread row differ by more
// than colour.
//
// `actions` (branch 3) is the web's slot with the web's rule: rendered ONLY
// on the static branch — no `onSelect` — because a button beside a primary
// action would be a button inside one (§5a-iii, §17d). Pass both and the
// actions vanish, exactly as `DataTable`'s card does. On the phone the slot
// is DATA, not JSX: `[{ label, onPress, tone: 'neutral' | 'danger' }]`, so
// the verbatim card builders (`teacher/announcements/card.jsx` and friends)
// pass through whatever the screen hands them and the contract stays "a
// card returns data".
//
// THE LOOK (feat/ui-refresh, 2026-10-02): the shared card surface
// (`cardClass`), the title one step larger than the lines under it, and each
// action the shared `Button` at its 44dp row size — a danger action is the
// OUTLINE variant, because the confirmation that names it comes after. A
// tappable card answers a press with Android's ripple: a prop, never a style
// function (M20).
//
// THE TITLE'S WEIGHT CARRIES `unread`: bold when unread, regular when read,
// and semibold on every card that has no read state at all.
function titleClass(unread) {
  if (unread === true) return 'font-bold text-fg';
  if (unread === false) return 'font-normal text-fg-secondary';
  return 'font-semibold text-fg';
}

function Actions({ actions }) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  return (
    <View className="mt-3 flex-row flex-wrap gap-2 border-t border-edge-soft pt-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          size="sm"
          variant={action.tone === 'danger' ? 'danger-outline' : 'secondary'}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ))}
    </View>
  );
}

export default function RecordCard({ card }) {
  const { tokens } = useTheme();

  const body = (
    <View className="flex-row items-start gap-3">
      {card.unread !== undefined ? (
        <View className={`mt-2 h-2 w-2 rounded-full ${card.unread ? 'bg-primary' : 'bg-transparent'}`} />
      ) : null}
      {card.avatar ? <Avatar name={card.avatar} photo={card.avatarPhoto} /> : null}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className={`text-base ${titleClass(card.unread)}`}>
          {card.title}
        </Text>
        {card.subtitle ? (
          <Text numberOfLines={2} className="mt-0.5 text-sm text-fg-muted">
            {card.subtitle}
          </Text>
        ) : null}
        {card.meta ? (
          <Text numberOfLines={2} className="mt-1 text-xs text-fg-muted">
            {card.meta}
          </Text>
        ) : null}
        {card.status ? (
          <View className="mt-2">
            <StatusBadge status={card.status} tone={card.statusTone} />
          </View>
        ) : null}
      </View>
    </View>
  );

  const shell = `${cardClass} p-4`;

  if (card.onSelect) {
    return (
      <Pressable
        onPress={card.onSelect}
        accessibilityRole="button"
        accessibilityLabel={card.accessibilityLabel || card.title}
        android_ripple={{ color: tokens['edge-strong'] }}
        className={`${shell} overflow-hidden`}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View className={shell}>
      {body}
      <Actions actions={card.actions} />
    </View>
  );
}
