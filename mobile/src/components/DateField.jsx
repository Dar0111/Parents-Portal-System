import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, Pressable, View } from 'react-native';
import FormField from './FormField';
import Text from './Text';
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
//
// BOTH TARGETS ARE 48dp, set in dp through a plain style object (the phone's
// rem is 14, so a height class would fall short — M19; and never a style
// function — M20). The trigger has FormField's corner and padding, so a date
// beside a text field is the same height; the clear button STRETCHES to the
// trigger's height (48dp is its floor), so the pair stays level when the OS
// font scale makes the trigger taller.
const TARGET = 48;

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
              android_ripple={{ color: tokens['edge-strong'] }}
              className={`flex-1 flex-row items-center justify-between gap-3 overflow-hidden rounded-lg border bg-surface px-4 py-3.5 ${
                invalid ? 'border-danger-edge-strong' : 'border-edge-strong'
              } ${disabled ? 'opacity-60' : ''}`}
              style={{ minHeight: TARGET }}
            >
              <Text className={`min-w-0 flex-1 text-base ${value ? 'text-fg' : 'text-fg-muted'}`}>
                {value ? longDate(value) : placeholder}
              </Text>
              <Icon name="fa-calendar-days" size={15} color={tokens['fg-muted']} />
            </Pressable>
            {clearable && value ? (
              <Pressable
                onPress={() => onChange('')}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${label}`}
                android_ripple={{ color: tokens['edge-strong'] }}
                className="items-center justify-center self-stretch overflow-hidden rounded-lg border border-edge-strong bg-surface"
                style={{ width: TARGET, minHeight: TARGET }}
              >
                <Icon name="fa-xmark" size={15} color={tokens['fg-body']} />
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
