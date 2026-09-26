import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';
import { settingsTabsForRole } from './tabs';

// SETTINGS AS A LIST OF ROWS PUSHING SUB-SCREENS (Darryl, branch 2 decision
// 2). `tabs.js` is a verbatim copy of the web's, so the rows and their order
// are the web's; the screen each opens is looked up by LABEL, because the
// web keys admin's first tab and everyone else's on the same empty `to`.
// A tab with no screen on the phone yet (admin's School settings) renders
// dimmed, the same unbuilt state the drawer uses.
const SCREEN_BY_LABEL = {
  'Account information': 'AccountInfo',
  'Change password': 'ChangePassword',
  Personalization: 'Personalization',
};

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const tabs = settingsTabsForRole(user?.role);

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4">
      <View className="rounded-xl border border-edge bg-surface">
        {tabs.map((tab, index) => {
          const screen = SCREEN_BY_LABEL[tab.label] || null;
          return (
            <Pressable
              key={tab.label}
              disabled={!screen}
              onPress={() => navigation.navigate(screen)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !screen }}
              accessibilityLabel={screen ? tab.label : `${tab.label}, not on the phone yet`}
              className={`flex-row items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-edge-soft' : ''}`}
            >
              <View className="w-5 items-center">
                <Icon name={tab.icon} size={15} color={screen ? tokens.brand : tokens['fg-ghost']} />
              </View>
              <Text className={`flex-1 text-sm ${screen ? 'text-fg' : 'text-fg-ghost'}`}>{tab.label}</Text>
              {screen ? <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-3 px-1 text-xs text-fg-muted">
        Personalization is stored on this phone only. Text size follows the phone’s own setting.
      </Text>
    </ScrollView>
  );
}
