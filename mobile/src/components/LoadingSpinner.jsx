import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const SIZES = { sm: 'small', md: 'large', lg: 'large' };

export default function LoadingSpinner({ size = 'md', label = 'Loading…', className = '' }) {
  const { tokens } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className={`items-center justify-center gap-2 ${className}`}>
      <ActivityIndicator size={SIZES[size] || SIZES.md} color={tokens['fg-faint']} />
      {label ? <Text className="text-sm text-fg-muted">{label}</Text> : null}
    </View>
  );
}
