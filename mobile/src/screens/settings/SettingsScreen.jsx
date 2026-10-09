import { Pressable, ScrollView, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { cardClass } from '../../components/buttonStyles';
import Text from '../../components/Text';
import Icon from '../../icons';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';
import { settingsTabsForRole } from './tabs';

// SETTINGS AS A LIST OF ROWS PUSHING SUB-SCREENS (Darryl, branch 2 decision
// 2). `tabs.js` is a verbatim copy of the web's, so the rows and their order
// are the web's; the screen each opens is looked up by LABEL, because the
// web keys admin's first tab and everyone else's on the same empty `to`.
// A tab with no screen on the phone yet would render dimmed, the same unbuilt
// state the drawer uses; since branch 4 admin's School settings has its own.
//
// THE LOOK (feat/ui-refresh, 2026-10-02): ONE grouped card, a hairline
// between rows, and each row an icon chip, the label and a chevron. A ROW IS
// 56dp, SET IN dp through a plain style object — a minimum, never a fixed
// height, so a label that wraps at a large OS font scale grows its row (the
// phone's rem is 14 — M19; never a style function — M20). Press feedback is
// Android's own ripple, clipped to the card's corners by `overflow-hidden`
// on the card. `tabs.js` carries no description, so a row has none.
const SCREEN_BY_LABEL = {
  'School settings': 'SchoolSettings',
  'Account information': 'AccountInfo',
  'Change password': 'ChangePassword',
  'Security & policy': 'SecurityPolicy',
  Personalization: 'Personalization',
};

const ROW = { minHeight: 56 };

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const tabs = settingsTabsForRole(user?.role);

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-3 p-4 pb-10">
      <Reveal>
        <View className={`${cardClass} overflow-hidden`}>
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
                android_ripple={{ color: tokens['edge-strong'] }}
                className={`flex-row items-center gap-3 px-4 py-2.5 ${index > 0 ? 'border-t border-edge-soft' : ''}`}
                style={ROW}
              >
                <View
                  className={`h-9 w-9 items-center justify-center rounded-xl ${screen ? 'bg-brand-soft' : 'bg-surface-muted'}`}
                >
                  <Icon name={tab.icon} size={15} color={screen ? tokens.brand : tokens['fg-ghost']} />
                </View>
                <Text className={`min-w-0 flex-1 text-sm font-semibold ${screen ? 'text-fg' : 'text-fg-ghost'}`}>
                  {tab.label}
                </Text>
                {screen ? <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Reveal>
      <Text className="px-1 text-xs text-fg-muted">
        Personalization is stored on this phone only. Text size follows the phone’s own setting.
      </Text>
    </ScrollView>
  );
}
