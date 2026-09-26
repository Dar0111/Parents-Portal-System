import { Text, View } from 'react-native';

// Initials on a brand-soft disc — the web's Avatar. There is no photo column
// anywhere in the schema, so initials are what the data can support.
export function initialsOf(name) {
  if (typeof name !== 'string') return '';
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

export default function Avatar({ name, size = 38 }) {
  const initials = initialsOf(name);
  if (!initials) return null;
  return (
    <View
      accessible={false}
      className="items-center justify-center rounded-full bg-brand-soft"
      style={{ width: size, height: size }}
    >
      <Text className="text-xs font-semibold text-brand">{initials}</Text>
    </View>
  );
}
