import { Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

// THE MOBILE TWIN OF client/src/components/FormField.jsx — two shapes here,
// not four: RN has no <select> and no <textarea> (a multiline TextInput is
// shape 1 with `multiline`), so the shapes are
//
//   1. <FormField label="Login ID" value=… onChangeText=… />      -> <TextInput>
//   4. <FormField label="…" render={({ invalid }) => …} />       -> anything
//
// Shape 4 receives a SINGLE OBJECT, as on the web, so a later addition is not
// a breaking change at every call site. The web's `describedBy` has no RN
// equivalent; the error and hint are read by a screen reader as live text
// under the control instead.
//
// THE ERROR BORDER RULE IS THE WEB'S: `controlClassFor(invalid)` emits ONE
// border state, never both, so the red one cannot lose to the grey one by
// stylesheet order (the 2026-09-18 defect).
const controlBaseClass = 'w-full rounded-lg border bg-surface px-3 py-2.5 text-base text-fg';
const normalStateClass = 'border-edge-strong';
export const errorClass = 'border-danger-edge-strong';

export const controlClass = `${controlBaseClass} ${normalStateClass}`;

export function controlClassFor(invalid) {
  return `${controlBaseClass} ${invalid ? errorClass : normalStateClass}`;
}

export default function FormField({ label, error, hint, required = false, className = '', render, ...rest }) {
  const { tokens } = useTheme();
  const invalid = Boolean(error);

  const control = render ? (
    render({ invalid })
  ) : (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={tokens['fg-muted']}
      className={controlClassFor(invalid)}
      {...rest}
    />
  );

  return (
    <View className={className}>
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-fg-secondary">
          {label}
          {required ? <Text className="text-danger-icon"> *</Text> : null}
        </Text>
      ) : null}

      {control}

      {error ? (
        <Text accessibilityLiveRegion="polite" className="mt-1.5 text-sm text-danger-text">
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1.5 text-sm text-fg-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
