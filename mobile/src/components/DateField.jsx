import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';
import FormField from './FormField';
import { longDate } from '../format/date';
import Icon from '../icons';
import { useTheme } from '../theme/ThemeProvider';

// THE PHONE'S <input type="date"> — one field, six screens (the letters and
// events filters, event compose, the enrol and edit birthdays, the attendance
// records range). Declared as a SCOPE EXPANSION on the teacher branch: the
// parent's compose carried this inline, and a second copy is the drift the
// mirror rule exists to stop.
//
// THE VALUE IS A YYYY-MM-DD STRING, in and out. The native picker hands back
// a Date and the identity is assembled from its LOCAL year / month / day —
// never toISOString() (§5a-iv). The string is what a request sends and what a
// DATE column returns, so nothing here parses one except to PLACE the picker
// (`dateToLocal`, the local constructor). `maximumDate` / `minimumDate`
// mirror a server rule; the server still decides.
//
// `clearable` renders an × for a filter bound (From / To) — an optional
// field's empty state is "no bound", and a picker cannot say that itself.
export function dateFromParts(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateToLocal(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DateField({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  maximumDate,
  minimumDate,
  clearable = false,
  required = false,
  disabled = false,
  error,
  hint,
  className = '',
}) {
  const { tokens } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const anchor = value || maximumDate || minimumDate || dateFromParts(new Date());

  return (
    <FormField
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      render={({ invalid }) => (
        <>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowPicker(true)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={value ? `${label}, ${longDate(value)}` : `${label}, ${placeholder}`}
              accessibilityState={{ disabled }}
              className={`min-h-11 flex-1 flex-row items-center justify-between rounded-lg border bg-surface px-3 py-2.5 ${
                invalid ? 'border-danger-edge-strong' : 'border-edge-strong'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              <Text className={`text-base ${value ? 'text-fg' : 'text-fg-muted'}`}>{value ? longDate(value) : placeholder}</Text>
              <Icon name="fa-calendar-days" size={14} color={tokens['fg-faint']} />
            </Pressable>
            {clearable && value ? (
              <Pressable
                onPress={() => onChange('')}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${label}`}
                className="h-11 w-11 items-center justify-center rounded-lg border border-edge-strong bg-surface"
              >
                <Icon name="fa-xmark" size={14} color={tokens['fg-body']} />
              </Pressable>
            ) : null}
          </View>
          {showPicker ? (
            <DateTimePicker
              value={dateToLocal(anchor)}
              mode="date"
              display="default"
              maximumDate={maximumDate ? dateToLocal(maximumDate) : undefined}
              minimumDate={minimumDate ? dateToLocal(minimumDate) : undefined}
              // The 9.x API: `onChange` is deprecated and raised a LogBox
              // warning on the parent branch. `onValueChange` fires on Set,
              // `onDismiss` on Cancel or the back gesture.
              onValueChange={(event, picked) => {
                setShowPicker(Platform.OS === 'ios');
                if (picked) onChange(dateFromParts(picked));
              }}
              onDismiss={() => setShowPicker(false)}
            />
          ) : null}
        </>
      )}
    />
  );
}
