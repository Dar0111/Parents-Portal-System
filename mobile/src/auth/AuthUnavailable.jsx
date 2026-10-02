import { View } from 'react-native';
import { cardClass } from '../components/buttonStyles';
import ErrorAlert from '../components/ErrorAlert';
import Text from '../components/Text';

// THE SCREEN THAT REPLACES A LOGOUT (§22). Rendered by RootNavigator when
// /auth/me failed for any reason other than a 401 — the token is still in
// the store, so Try again re-reads the session in place. It must never say
// "log in": the whole point is that the user is NOT logged out. The reason
// line is extractError's wording through ErrorAlert (§2).
//
// One card on the page colour, as the sign-in screens are: the title in the
// title face (never beside a weight class — both are families), the
// reassurance under it, then the reason with its Try again.
export default function AuthUnavailable({ message, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center bg-page px-4">
      <View className={`w-full max-w-md ${cardClass} p-6`}>
        <Text accessibilityRole="header" className="font-serif text-lg text-fg">
          Can't reach the school server
        </Text>
        <Text className="mt-2 text-sm text-fg-muted">Your session is kept. Try again when you're connected.</Text>
        <ErrorAlert message={message} onRetry={onRetry} className="mt-4" />
      </View>
    </View>
  );
}
