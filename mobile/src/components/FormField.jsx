import { TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

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
//
// THE CONTROL (feat/ui-refresh, 2026-10-02): the 12px corner every button
// has, and tall enough for a finger — `py-3.5` around one `text-base` line is
// about 48dp at the phone's 14dp rem (M19). `font-sans` is IN the class
// because a TextInput is not the shared `Text`: without it the typed text and
// the placeholder would fall back to the system face.
const controlBaseClass = 'w-full rounded-xl border bg-surface px-4 py-3.5 font-sans text-base text-fg';
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
        <Text className="mb-1.5 text-sm font-semibold text-fg-secondary">
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
