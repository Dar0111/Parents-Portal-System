import { ActivityIndicator, Pressable } from 'react-native';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { buttonStyles } from './buttonStyles';
import Text from './Text';

// The phone's button (feat/ui-refresh). Variants and sizes are in
// buttonStyles.js.
//
//   <Button variant="primary" onPress={save}>Save</Button>
//   <Button variant="primary" loading={saving} onPress={save}>Save</Button>
//   <Button icon="fa-pen" onPress={edit}>Edit</Button>
//
// `children` is the LABEL (a string); it is also the accessible name unless
// `accessibilityLabel` says otherwise. `loading` disables the button and
// shows a spinner in place of the icon — the label stays, so the button
// keeps its width. A screen that changes the label while busy still does.
//
// NO STYLE FUNCTION (M20): NativeWind drops a style function on a Pressable
// that has a className, so the press feedback is Android's own ripple — a
// prop, not a style — and the height is a plain style object in dp.
export default function Button({
  variant = 'secondary',
  size = 'md',
  full = false,
  loading = false,
  disabled = false,
  icon = null,
  onPress,
  accessibilityLabel,
  className = '',
  children,
  ...rest
}) {
  const { tokens } = useTheme();
  const off = disabled || loading;
  const look = buttonStyles({ variant, size, full, disabled: off });

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy: loading }}
      android_ripple={{ color: tokens[look.ripple] }}
      className={`${look.box} ${className}`}
      style={{ minHeight: look.minHeight }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tokens[look.ink]} />
      ) : icon ? (
        <Icon name={icon} size={14} color={tokens[look.ink]} />
      ) : null}
      {children ? <Text className={look.label}>{children}</Text> : null}
    </Pressable>
  );
}
