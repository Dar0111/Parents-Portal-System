import { Pressable, View } from 'react-native';
import Text from '../../../components/Text';
import { STATUS_ORDER } from './roster';

// THE FOUR-WAY CONTROL — the web's `StatusButtons` (§17c) on the phone. Four
// full words, one row per learner. Selected carries a tone fill, a 2px border
// AND the bold face against the regular one, so the state never rests on
// colour alone (§4). `accessibilityState.selected` rather than a radio group:
// a row may legitimately have NO mark, and an unset radio group cannot say
// that. The tap goes through `pickStatus` (the verbatim roster.js): the
// selected button again clears an UNSAVED mark and is a no-op on a recorded
// one.
//
// 48dp TALL, AS A NUMBER (feat/ui-refresh, 2026-10-03). They were `h-11`,
// which at the phone's 14dp rem is 38.5dp (M19) — under a finger's size on
// the control a teacher taps forty times a morning. The height is a plain
// style object, never a class and never a style function (M20).
//
// NOT THE SHARED `Button`, AND NO RIPPLE: this is the attendance register,
// where nothing moves (the refresh's motion rule). The answer to a tap is the
// button changing state. The border is 1px or 2px inside the same 48dp
// minimum, so selecting one never changes the row's height.
const TARGET = 48;
const TABULAR = { fontVariant: ['tabular-nums'] };

const STATUS_TONE = {
  Present: { box: 'border-success-edge bg-success-soft', text: 'text-success-fg' },
  Late: { box: 'border-warning-edge bg-warning-soft', text: 'text-warning-fg' },
  Absent: { box: 'border-danger-edge bg-danger-soft', text: 'text-danger-fg' },
  Excused: { box: 'border-info-edge bg-info-soft', text: 'text-info-fg' },
};

export default function StatusButtons({ student, marks, onPick }) {
  const current = marks[student.id] || '';
  return (
    <View accessibilityLabel={`Attendance status for ${student.first_name} ${student.last_name}`} className="flex-row gap-2">
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
            className={`flex-1 items-center justify-center rounded-lg px-1 ${on ? `border-2 ${tone.box}` : 'border border-edge-strong bg-surface'}`}
            style={{ minHeight: TARGET }}
          >
            <Text numberOfLines={1} className={`text-xs ${on ? `font-bold ${tone.text}` : 'text-fg-body'}`}>
              {status}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// THE FOUR COUNTS, in the same order and the same tones as the buttons under
// them — one map in this file, so a count and the button it counts cannot
// drift apart (the web's count chips make the same promise). Each tile
// carries its WORD under the figure: the tone only repeats what the text
// says. COUNTS ONLY, never a rate.
//
// FOUR EQUAL TILES, NOT WRAPPING CHIPS: a chip grows when a count gains a
// digit and a row of them would re-wrap in the middle of marking a register,
// moving every learner under it. A tile's width is a quarter of the row
// whatever the figure, so the roster stays where it is; the tiles also sit
// in the same four columns as the buttons.
export function StatusCounts({ counts }) {
  return (
    <View className="flex-row gap-2">
      {STATUS_ORDER.map((status) => {
        const tone = STATUS_TONE[status];
        return (
          <View key={status} accessible accessibilityLabel={`${status} ${counts[status]}`} className={`flex-1 items-center rounded-xl border px-1 py-1.5 ${tone.box}`}>
            <Text className={`text-base font-bold ${tone.text}`} style={TABULAR}>
              {counts[status]}
            </Text>
            <Text numberOfLines={1} className={`text-xs font-semibold ${tone.text}`}>
              {status}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
