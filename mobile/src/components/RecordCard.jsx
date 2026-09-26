import { Pressable, Text, View } from 'react-native';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';

// ONE CARD, THE WEB'S `renderCard` DATA CONTRACT (§5a-iii, MOBILE_CONVENTIONS
// M11). A page's card builder returns DATA, never JSX — which is why the
// parent's `excuseLetters/card.jsx` is a verbatim copy — and this component
// is the one renderer: `avatar`, `title`, `subtitle`, `meta`, `status` (+
// `statusTone`), and EXACTLY ONE interactive element, `onSelect`. The web's
// `to` becomes `onSelect` on the phone (navigation is a function here, not
// a URL), and `unread` is a mobile addition for the Notifications rows: a
// dot and a bolder title, so a read row and an unread row differ by more
// than colour.
export default function RecordCard({ card }) {
  const body = (
    <View className="flex-row items-start gap-3">
      {card.unread !== undefined ? (
        <View className={`mt-2 h-2 w-2 rounded-full ${card.unread ? 'bg-primary' : 'bg-transparent'}`} />
      ) : null}
      {card.avatar ? <Avatar name={card.avatar} /> : null}
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={2}
          className={`text-sm ${card.unread === false ? 'text-fg-muted' : 'font-semibold text-fg'}`}
        >
          {card.title}
        </Text>
        {card.subtitle ? (
          <Text numberOfLines={2} className="mt-0.5 text-sm text-fg-muted">
            {card.subtitle}
          </Text>
        ) : null}
        {card.meta ? (
          <Text numberOfLines={1} className="mt-0.5 text-xs text-fg-muted">
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

  const shell = 'rounded-xl border border-edge bg-surface px-4 py-3';

  if (card.onSelect) {
    return (
      <Pressable
        onPress={card.onSelect}
        accessibilityRole="button"
        accessibilityLabel={card.accessibilityLabel || card.title}
        className={shell}
      >
        {body}
      </Pressable>
    );
  }
  return <View className={shell}>{body}</View>;
}
