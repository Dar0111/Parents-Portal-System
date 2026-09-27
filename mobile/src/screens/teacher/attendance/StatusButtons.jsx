import { Pressable, Text, View } from 'react-native';
import { STATUS_ORDER } from './roster';

// THE FOUR-WAY CONTROL — the web's `StatusButtons` (§17c) on the phone. Four
// full words, 44px tall, one row per learner. Selected carries a tone fill, a
// 2px border AND bold text, so the state never rests on colour alone (§4).
// `accessibilityState.selected` rather than a radio group: a row may
// legitimately have NO mark, and an unset radio group cannot say that. The
// tap goes through `pickStatus` (the verbatim roster.js): the selected button
// again clears an UNSAVED mark and is a no-op on a recorded one.
const STATUS_TONE = {
  Present: { box: 'border-success-edge bg-success-soft', text: 'text-success-fg' },
  Late: { box: 'border-warning-edge bg-warning-soft', text: 'text-warning-fg' },
  Absent: { box: 'border-danger-edge bg-danger-soft', text: 'text-danger-fg' },
  Excused: { box: 'border-info-edge bg-info-soft', text: 'text-info-fg' },
};

export default function StatusButtons({ student, marks, onPick }) {
  const current = marks[student.id] || '';
  return (
    <View accessibilityLabel={`Attendance status for ${student.first_name} ${student.last_name}`} className="flex-row gap-1.5">
      {STATUS_ORDER.map((status) => {
        const on = current === status;
        const tone = STATUS_TONE[status];
        return (
          <Pressable
            key={status}
            onPress={() => onPick(student.id, status)}
            accessibilityRole="button"
            accessibilityLabel={`${status}${on ? ', selected' : ''}`}
            accessibilityState={{ selected: on }}
            className={`h-11 flex-1 items-center justify-center rounded-lg px-1 ${on ? `border-2 ${tone.box}` : 'border border-edge-strong bg-surface'}`}
          >
            <Text numberOfLines={1} className={`text-xs ${on ? `font-bold ${tone.text}` : 'font-medium text-fg-body'}`}>
              {status}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
