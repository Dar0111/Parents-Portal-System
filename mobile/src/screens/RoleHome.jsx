import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import Seal from '../components/Seal';
import Icon from '../icons';
import { DevLink } from './dev/ConnectionScreen';
import { THEME_OPTIONS } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

// THE THREE EMPTY ROLE HOMES, and the theme smoke, on the scaffold branch.
// One component for all three roles: it shows who is signed in, offers sign
// out, and carries the Light / Dark / System picker that Settings →
// Personalization will own once the parent branch builds it. Until then this
// is where the two-token theme smoke is read on the phone: `bg-page` behind
// a `bg-surface` card with `border-edge`, `text-fg` and `text-fg-muted`, and
// the `brand-soft` / `brand` pair — every one must flip when the picker does.
//
// The dashboards themselves arrive per role branch (Parent → Teacher → Admin)
// and replace this screen in RootNavigator; nothing here is a design.
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

export default function RoleHome({ navigation }) {
  const { user, logout } = useAuth();
  const { preference, resolved, tokens, setPreference } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="px-4 pb-10" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
      <View className="flex-row items-center gap-3">
        <Seal size={40} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-fg">Parent’s Portal</Text>
          <Text className="text-sm text-fg-muted">{ROLE_LABEL[user?.role] || user?.role} · signed in</Text>
        </View>
      </View>

      <View className="mt-6 rounded-xl border border-edge bg-surface p-4">
        <Text className="text-sm text-fg-muted">Signed in as</Text>
        <Text className="mt-1 text-lg font-semibold text-fg">{user?.name}</Text>
        <View className="mt-3 self-start rounded-full bg-brand-soft px-3 py-1">
          <Text className="text-xs font-medium text-brand">{ROLE_LABEL[user?.role] || user?.role}</Text>
        </View>
        <Text className="mt-4 text-sm text-fg-body">
          This role’s screens arrive on its own branch. This screen exists so the sign-in, the session and the theme
          can be proved on the phone first.
        </Text>
      </View>

      <View className="mt-6 rounded-xl border border-edge bg-surface p-4">
        <Text className="text-sm font-medium text-fg-secondary">Theme</Text>
        <Text className="mt-1 text-sm text-fg-muted">Stored on this device. Showing {resolved}.</Text>
        <View className="mt-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPreference(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                className={`flex-row items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  selected ? 'border-brand bg-brand-soft' : 'border-edge bg-surface'
                }`}
              >
                <Icon
                  name={selected ? 'fa-circle-check' : 'fa-circle'}
                  size={14}
                  color={selected ? tokens.brand : tokens['fg-ghost']}
                />
                <View className="flex-1">
                  <Text className={`text-sm font-medium ${selected ? 'text-brand' : 'text-fg'}`}>{option.label}</Text>
                  <Text className="text-xs text-fg-muted">{option.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={logout}
        accessibilityRole="button"
        className="mt-6 flex-row items-center justify-center gap-2 rounded-lg border border-edge-strong px-4 py-3"
      >
        <Icon name="fa-right-from-bracket" size={14} color={tokens['fg-body']} />
        <Text className="text-sm font-medium text-fg-body">Sign out</Text>
      </Pressable>

      {DevLink ? <DevLink navigation={navigation} /> : null}
    </ScrollView>
  );
}
