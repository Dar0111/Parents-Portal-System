import { Pressable, View } from 'react-native';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

// `message` is the string from extractError() — the API's own wording, never
// rewritten (§2). Several endpoints answer with a deliberately specific
// reason, and replacing it with "Request failed" would throw away the most
// useful part of the response.
//
// "Try again" is a text button in the alert's own tone, and a 44dp target:
// the height is a plain style object in dp, never a class (the phone's rem is
// 14 — M19), and never a style function (M20).
export default function ErrorAlert({ message, onRetry, className = '' }) {
  const { tokens } = useTheme();
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      className={`flex-row items-start gap-3 rounded-xl border border-danger-edge bg-danger-soft px-4 py-3 ${className}`}
    >
      <Icon name="fa-circle-exclamation" size={16} color={tokens['danger-icon']} style={{ marginTop: 2 }} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-danger-strong">{message}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            className="mt-1 flex-row items-center self-start"
            style={{ minHeight: 44 }}
          >
            <Text className="text-sm font-semibold text-danger-fg underline">Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
