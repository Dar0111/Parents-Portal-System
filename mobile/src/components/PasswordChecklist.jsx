import { View } from 'react-native';
import { PASSWORD_RULES, passwordIsValid } from '../format/passwordRule';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

// The live password checklist — one rule per line, grey until it passes,
// green after — read from format/passwordRule.js (a verbatim copy of the
// web's), so a rule change edits that module on both platforms and nothing
// here. The list is present from the first keystroke, so the number of lines
// never changes and nothing jumps.
//
// The two helper exports are the web's (client/src/components/PasswordChecklist.jsx)
// for the same reason it keeps them: a misnamed helper is a build error, a
// re-derived comparison at four call sites is a silent one.
export const PASSWORD_MISMATCH = 'Passwords do not match.';

export function confirmError(value, confirm) {
  return confirm && confirm !== value ? PASSWORD_MISMATCH : null;
}

export function passwordFormReady(value, confirm) {
  return passwordIsValid(value) && confirm === value;
}

export default function PasswordChecklist({ value }) {
  const { tokens } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" className="mt-2.5 gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const passes = rule.test(value);
        return (
          <View key={rule.key} className="flex-row items-center gap-2">
            <Icon
              name={passes ? 'fa-circle-check' : 'fa-circle'}
              size={12}
              color={passes ? tokens['success-icon'] : tokens['fg-ghost']}
            />
            <Text
              accessibilityLabel={`${rule.label} — ${passes ? 'met' : 'not yet'}`}
              className={`min-w-0 flex-1 text-sm ${passes ? 'text-success-fg' : 'text-fg-muted'}`}
            >
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
