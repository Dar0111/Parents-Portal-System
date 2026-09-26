import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import Seal from '../components/Seal';
import { DevLink } from './dev/ConnectionScreen';

// THE PLACEHOLDER HOME for a role whose dashboard is not on the phone yet
// (Darryl, branch 2 decision 3): the drawer is live with Settings and About,
// its other items dimmed, and this screen says so. Each role's branch
// replaces it in navigation/routes.js. The scaffold's theme picker moved to
// Settings → Personalization; sign out is in the drawer.
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

export default function RoleHome({ navigation }) {
  const { user } = useAuth();

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4">
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
          This role’s screens arrive on its own branch. Settings and About are open from the menu; the rest is
          listed there dimmed until it is built.
        </Text>
      </View>

      {DevLink ? <DevLink navigation={navigation} /> : null}
    </ScrollView>
  );
}
