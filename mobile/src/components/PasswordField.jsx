import { Pressable, TextInput, View } from 'react-native';
import FormField, { controlClassFor } from './FormField';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';

// FormField shape 4 + the reveal toggle, as on the web. Show/hide is per
// field. `error` renders the message under the field AND turns the border
// red; `inputRef` lets a screen move focus to the field that was refused
// (§7c); `below` is a node under the input inside the field — the live
// password checklist. `leadingIcon` is an optional icon name (`fa-lock` on
// Login), inert and unlabelled: the label still says what the field is.
//
// `secureTextEntry` is RN's password mode. `textContentType`/`autoComplete`
// are passed through so the phone's password manager can offer to fill.
export default function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
  hint,
  revealed,
  onToggleReveal,
  error,
  inputRef,
  disabled = false,
  required = false,
  below,
  leadingIcon,
  onSubmitEditing,
  returnKeyType,
}) {
  const { tokens } = useTheme();
  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      required={required}
      render={({ invalid }) => (
        <>
          <View className="relative">
            {leadingIcon ? (
              <View pointerEvents="none" className="absolute inset-y-0 left-0 z-10 w-10 items-center justify-center">
                <Icon name={leadingIcon} size={15} color={tokens['fg-faint']} />
              </View>
            ) : null}
            <TextInput
              ref={inputRef}
              accessibilityLabel={label}
              value={value}
              onChangeText={onChangeText}
              secureTextEntry={!revealed}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={autoComplete}
              editable={!disabled}
              onSubmitEditing={onSubmitEditing}
              returnKeyType={returnKeyType}
              placeholderTextColor={tokens['fg-muted']}
              className={`${controlClassFor(invalid)} pr-10 ${leadingIcon ? 'pl-10' : ''}`}
            />
            <Pressable
              onPress={onToggleReveal}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              accessibilityState={{ selected: Boolean(revealed), disabled }}
              className="absolute inset-y-0 right-0 w-10 items-center justify-center"
            >
              <Icon name={revealed ? 'fa-eye-slash' : 'fa-eye'} size={15} color={tokens['fg-faint']} />
            </Pressable>
          </View>
          {below}
        </>
      )}
    />
  );
}
