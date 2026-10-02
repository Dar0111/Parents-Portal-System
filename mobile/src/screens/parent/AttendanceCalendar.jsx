import { Pressable, View } from 'react-native';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import Icon from '../../icons';
import { longDate, monthGrid, weekdayName } from '../../format/date';
import { useTheme } from '../../theme/ThemeProvider';
import { LETTER, alsoRecorded, dayLabel, letterByDate } from './attendance/logic';

// THE MONTH GRID ON A PHONE (DV2): five columns, Monday to Friday, whole
// weeks, letter pills only (the web shows the word from `xl`, which a phone
// never reaches), the legend always visible, and the "Also recorded" strip
// for a weekend row — real, counted in the totals, not in the grid. Identity
// is the YYYY-MM-DD string; the grid comes from format/date.js's monthGrid.
//
// THREE STATES, TOLD APART BY SHAPE (the frame), GLYPH (the pill's letter)
// AND NAME (the accessibility label from `dayLabel`) — never by colour
// alone: a recorded day is a solid frame holding a StatusBadge, an unrecorded
// one a dashed, empty frame, and a day outside the month has no frame at all.
//
// THE CELL'S WIDTH IS UNCHANGED BY feat/ui-refresh, and what is inside it
// was re-fitted to the new type scale by arithmetic, for a 360dp phone:
//   360 − 32 (screen padding) − 2 (card border) − 28 (card `p-4` at the 14dp
//   rem) = 298dp for five columns = 59.6dp each; − 3.5 (the `p-0.5` gutter)
//   − 4 (Today's 2dp ring, the widest border) − 14 (`p-2`) = 38.1dp of
//   content.
// "Today" used to sit BESIDE the day number at a fixed 10dp. At the scale's
// smallest step (`text-xs`, 11.4dp) the word is about 30dp and a two-digit
// number about 12dp — 42dp, which does not fit 38. So "Today" has its own
// line under the number (30dp fits), and so does "Not yet" (about 35dp; if a
// larger OS font wraps it, the cell grows). The widest thing in a cell is
// still the letter pill, about 26dp.
//
// Today's cell is therefore one line taller than its neighbours, so every
// frame FILLS its week row (`flex-1` inside the stretched column) — the row
// is as tall as its tallest cell and the cells stay level. The excuse-letter
// envelope moved up beside the day number (12 + 10dp fits), so a day with a
// letter is no taller than one without.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function DayCell({ cell, record, letter, isToday, onSelect, selected }) {
  const { tokens } = useTheme();
  if (!cell.inMonth) {
    return (
      <View className="flex-1 p-0.5">
        <View className="min-h-16 rounded-lg p-2">
          <Text className="text-xs text-fg-ghost">{cell.day}</Text>
        </View>
      </View>
    );
  }
  const label = dayLabel(cell, record, letter);
  // ONE border state and ONE background, never two that depend on stylesheet
  // order: Today's ring wins over the recorded / unrecorded edge (an
  // unrecorded Today keeps its dashes), and the selected fill over the
  // recorded one.
  const edge = isToday
    ? `border-2 border-focus-edge ${record ? '' : 'border-dashed'}`
    : record
      ? 'border border-edge'
      : 'border border-dashed border-edge-strong';
  const fill = selected ? 'bg-surface-muted' : record ? 'bg-surface' : '';
  return (
    <View className="flex-1 p-0.5">
      <Pressable
        onPress={() => onSelect(cell.date)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, expanded: selected }}
        android_ripple={{ color: tokens['edge-strong'] }}
        className={`min-h-16 flex-1 overflow-hidden rounded-lg p-2 ${edge} ${fill}`}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-fg" style={{ fontVariant: ['tabular-nums'] }}>
            {cell.day}
          </Text>
          {letter ? <Icon name="fa-envelope" size={10} color={tokens['fg-muted']} /> : null}
        </View>
        {isToday ? <Text className="text-xs font-semibold text-brand">Today</Text> : null}
        <View className="mt-1">
          {record ? (
            <StatusBadge status={record.status} label={LETTER[record.status] || record.status} />
          ) : isToday ? (
            <Text className="text-xs text-fg-muted">Not yet</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

// The key's four letters, in the order the summary counts them.
const LEGEND = [
  ['P', 'Present'],
  ['L', 'Late'],
  ['A', 'Absent'],
  ['E', 'Excused'],
];

export default function AttendanceCalendar({ year, month, records, letters, today, selected, onSelect }) {
  const { tokens } = useTheme();
  const weeks = monthGrid(year, month);
  const byDate = new Map();
  for (const row of records || []) byDate.set(row.date, row);
  const letterMap = letterByDate(letters);
  const extra = alsoRecorded(records, year, month);

  return (
    <View>
      <View className="flex-row">
        {WEEKDAYS.map((label) => (
          <Text key={label} className="flex-1 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} className="flex-row">
          {week.map((cell) => (
            <DayCell
              key={cell.date}
              cell={cell}
              record={cell.inMonth ? byDate.get(cell.date) : null}
              letter={cell.inMonth ? letterMap.get(cell.date) : null}
              isToday={cell.date === today}
              selected={cell.date === selected}
              onSelect={onSelect}
            />
          ))}
        </View>
      ))}
      {/* The letter is set a step darker than its word, so the key reads as
          letter → word at a glance; each entry's text is unchanged
          ("P = Present"). */}
      <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1 border-t border-edge-soft pt-3">
        {LEGEND.map(([letter, word]) => (
          <Text key={letter} className="text-xs text-fg-muted">
            <Text className="font-semibold text-fg-secondary">{letter}</Text> = {word}
          </Text>
        ))}
        <View className="flex-row items-center gap-1">
          <Icon name="fa-envelope" size={10} color={tokens['fg-muted']} />
          <Text className="text-xs text-fg-muted">= excuse letter</Text>
        </View>
      </View>
      {extra.length ? (
        <View className="mt-4 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Also recorded this month</Text>
          <Text className="mt-1 text-xs text-fg-muted">These fall on a weekend, so they are not in the grid above — but they are counted in the totals.</Text>
          <View className="mt-2 gap-2">
            {extra.map((row) => (
              <View key={row.date} className="flex-row flex-wrap items-center gap-2">
                <Text className="text-xs text-fg-body">
                  {weekdayName(row.date)} {longDate(row.date)}
                </Text>
                <StatusBadge status={row.status} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
