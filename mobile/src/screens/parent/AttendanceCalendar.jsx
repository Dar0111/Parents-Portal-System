import { Pressable, Text, View } from 'react-native';
import StatusBadge from '../../components/StatusBadge';
import Icon from '../../icons';
import { longDate, monthGrid, weekdayName } from '../../format/date';
import { useTheme } from '../../theme/ThemeProvider';
import { LETTER, alsoRecorded, dayLabel, letterByDate } from './attendance/logic';

// THE MONTH GRID ON A PHONE (DV2): five columns, Monday to Friday, whole
// weeks, letter pills only (the web shows the word from `xl`, which a phone
// never reaches), the legend always visible, and the "Also recorded" strip
// for a weekend row — real, counted in the totals, not in the grid. Identity
// is the YYYY-MM-DD string; the grid comes from format/date.js's monthGrid.
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
  const frame = [
    'min-h-16 rounded-lg p-2',
    record ? 'border border-edge bg-surface' : 'border border-dashed border-edge-strong',
    isToday ? 'border-2 border-focus-edge' : '',
    selected ? 'bg-surface-muted' : '',
  ].join(' ');
  return (
    <View className="flex-1 p-0.5">
      <Pressable
        onPress={() => onSelect(cell.date)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, expanded: selected }}
        className={frame}
      >
        <View className="flex-row items-baseline justify-between">
          <Text className="text-xs font-semibold text-fg">{cell.day}</Text>
          {isToday ? <Text className="text-[10px] font-medium text-brand">Today</Text> : null}
        </View>
        <View className="mt-1">
          {record ? (
            <StatusBadge status={record.status} label={LETTER[record.status] || record.status} />
          ) : isToday ? (
            <Text className="text-[10px] text-fg-ghost">Not yet</Text>
          ) : null}
        </View>
        {letter ? (
          <View className="mt-1">
            <Icon name="fa-envelope" size={10} color={tokens['fg-muted']} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

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
          <Text key={label} className="flex-1 pb-2 text-center text-xs font-semibold uppercase tracking-wider text-fg-muted">
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
      <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-xs text-fg-muted">P = Present</Text>
        <Text className="text-xs text-fg-muted">L = Late</Text>
        <Text className="text-xs text-fg-muted">A = Absent</Text>
        <Text className="text-xs text-fg-muted">E = Excused</Text>
        <View className="flex-row items-center gap-1">
          <Icon name="fa-envelope" size={10} color={tokens['fg-muted']} />
          <Text className="text-xs text-fg-muted">= excuse letter</Text>
        </View>
      </View>
      {extra.length ? (
        <View className="mt-4 rounded-lg border border-edge bg-surface-subtle px-4 py-3">
          <Text className="text-xs font-semibold text-fg">Also recorded this month</Text>
          <Text className="mt-1 text-xs text-fg-muted">These fall on a weekend, so they are not in the grid above — but they are counted in the totals.</Text>
          <View className="mt-2 gap-2">
            {extra.map((row) => (
              <View key={row.date} className="flex-row items-center gap-2">
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
