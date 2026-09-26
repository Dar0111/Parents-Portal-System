import { Text, View } from 'react-native';
import ErrorAlert from './ErrorAlert';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';

// The outcome of ONE write, rendered next to the control that caused it
// (§7c). One value — `{ tone, text }` — so a success and a failure cannot
// both be on screen; the XOR is structural. An error still goes through
// ErrorAlert (the API's own wording); a success is announced politely.
// `ok` / `fail` are the web's builders, kept for the web's reason: a
// misspelled tone string would render a FAILURE as a green strip.
export default function FormStatus({ status, className = '' }) {
  const { tokens } = useTheme();
  if (!status?.text) return null;

  if (status.tone === 'error') {
    return <ErrorAlert message={status.text} className={className} />;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`flex-row items-start gap-3 rounded-lg border border-success-edge bg-success-soft px-4 py-3 ${className}`}
    >
      <Icon name="fa-circle-check" size={15} color={tokens['success-icon']} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm text-success-strong">{status.text}</Text>
    </View>
  );
}

export const ok = (text) => ({ tone: 'ok', text });
export const fail = (text) => ({ tone: 'error', text });
