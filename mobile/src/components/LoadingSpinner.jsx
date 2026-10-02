import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';

const SIZES = { sm: 'small', md: 'large', lg: 'large' };

// The spinner is the accent colour — the same one pull-to-refresh draws on
// Android — and the label under it is the quiet caption.
export default function LoadingSpinner({ size = 'md', label = 'Loading…', className = '' }) {
  const { tokens } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className={`items-center justify-center gap-3 ${className}`}>
      <ActivityIndicator size={SIZES[size] || SIZES.md} color={tokens.brand} />
      {label ? <Text className="text-center text-sm text-fg-muted">{label}</Text> : null}
    </View>
  );
}
