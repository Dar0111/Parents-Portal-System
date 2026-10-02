import { View } from 'react-native';
import Avatar from '../../components/Avatar';
import Text from '../../components/Text';
import Icon from '../../icons';
import { userCardLines } from '../../navigation/drawerFold';
import { useTheme } from '../../theme/ThemeProvider';

// THE PROFILE HERO (feat/ui-refresh, 2026-10-02) — the web's
// pages/dashboards/ProfileHero.jsx on the phone: the band at the top of the
// TEACHER and ADMIN dashboards — who is signed in, and a few facts about the
// day. The staff counterpart of the parent's "Your child" hero, on the same
// `brand-panel` surface for the same reason (it is a solid field in both
// themes, where `primary` is a button fill).
//
// IT FETCHES NOTHING AND DECIDES NOTHING. `user` is the session's own
// (`useAuth`), and `facts` is a list the DASHBOARD builds from requests it
// already makes for its cards — a fact is simply absent until the card data
// behind it has arrived, so there is no spinner here and no second copy of a
// number that could disagree with the card below it. No link either: the
// drawer's user card is the way to Account information.
//
// THE ROLE LINE IS THE DRAWER USER CARD'S (`userCardLines`, drawerFold.js —
// one rule, one function, driven by proof-drawer): staff read
// "Teacher · <login id>"; A PARENT'S LOGIN ID IS NEVER SHOWN, because it is
// the child's LRN (§5c) — not as the detail and not as the name fallback. No
// parent screen renders this component today; the rule holds anyway, so
// reusing it cannot leak one.
//
// NOTHING IN HERE IS `primary`, AND NOTHING IS RED: the pills are the plain
// surface, as on the parent hero and on About.
export default function ProfileHero({ user, facts = [] }) {
  const { tokens } = useTheme();
  const { name, detail } = userCardLines(user);
  const shown = facts.filter((fact) => fact && fact.label);

  return (
    <View className="rounded-2xl border border-edge bg-brand-panel p-5">
      <View className="flex-row items-center gap-4">
        {/* A photo when the account has one, initials otherwise — Avatar's own
            rule, and its own fallback when the file is gone. */}
        <Avatar name={name} photo={user?.profile_pic} size={64} />
        <View className="min-w-0 flex-1">
          {name ? (
            <Text accessibilityRole="header" className="font-serif text-xl text-brand-panel-fg">
              {name}
            </Text>
          ) : null}
          {detail ? <Text className="mt-1 text-sm text-brand-panel-muted">{detail}</Text> : null}
        </View>
      </View>
      {shown.length ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {shown.map((fact) => (
            // `maxWidth` and the label's `flexShrink` are plain style objects:
            // a pill longer than the band wraps its words instead of running
            // off the edge at 360dp.
            <View key={fact.key || fact.label} className="flex-row items-center gap-2 rounded-full bg-surface px-3 py-1" style={{ maxWidth: '100%' }}>
              {fact.icon ? <Icon name={fact.icon} size={11} color={tokens['fg-muted']} /> : null}
              <Text className="text-xs font-semibold text-fg-secondary" style={{ flexShrink: 1 }}>
                {fact.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
