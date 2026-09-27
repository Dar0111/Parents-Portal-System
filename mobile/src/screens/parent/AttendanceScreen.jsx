import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import Icon from '../../icons';
import { addMonths, longDate, monthBounds, monthName, todayLocalDateString, weekdayName } from '../../format/date';
import { clampMonthToSchoolYear } from '../../format/schoolCalendar';
import { useTheme } from '../../theme/ThemeProvider';
import AttendanceCalendar from './AttendanceCalendar';
import { COUNTS, EMPTY_SUMMARY, countOf, recordedDays, yearRows, yearTotals } from './attendance/logic';

// PARENT → ATTENDANCE (DV2): the summary FIRST (the number a parent opens
// this page for), then the month grid, the day detail, "How this is
// counted", and the school-year record. The fraction, never a percentage;
// Late counts as present, Excused as absent — the school's decision. The
// month opens on today's, clamped to the school year (#7). The year table
// scrolls sideways with its row labels fixed.
export default function AttendanceScreen() {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const studentId = user?.student_id ?? null;
  const today = todayLocalDateString();
  const [view, setView] = useState(() => {
    const { year, month } = monthBounds(today);
    return clampMonthToSchoolYear({ year, month });
  });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [letters, setLetters] = useState([]);
  const [adviser, setAdviser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [yearTick, setYearTick] = useState(0);
  const monthLabel = `${monthName(view.month)} ${view.year}`;

  const load = useCallback(
    async ({ pull = false } = {}) => {
      if (studentId == null) {
        setSummary(EMPTY_SUMMARY);
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }
      if (pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { from, to } = monthBounds(`${view.year}-${String(view.month).padStart(2, '0')}-01`);
        const [nextSummary, monthRows] = await Promise.all([
          api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary', params: { from, to } }),
          fetchAll(`/attendance/student/${studentId}`, { unwrap: 'attendance', params: { from, to } }),
        ]);
        setSummary(nextSummary);
        setRows(monthRows);
      } catch (err) {
        setError(extractError(err));
        setSummary(EMPTY_SUMMARY);
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [studentId, view]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (studentId == null) return undefined;
    let cancelled = false;
    fetchAll(`/attendance/student/${studentId}`, { unwrap: 'attendance' })
      .then((all) => {
        if (!cancelled) setAllRows(all);
      })
      .catch(() => {
        if (!cancelled) setAllRows([]);
      });
    fetchAll('/excuse-letters/mine', { unwrap: 'excuse_letters' })
      .then((all) => {
        if (!cancelled) setLetters(all);
      })
      .catch(() => {
        if (!cancelled) setLetters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, yearTick]);

  useEffect(() => {
    if (user?.grade_level == null || !user?.section) return undefined;
    let cancelled = false;
    api
      .get(`/sections?grade_level=${user.grade_level}`, { unwrap: 'sections' })
      .then((sections) => {
        const match = sections.find((s) => s.name === user.section);
        if (!cancelled) setAdviser(match?.adviser_name || null);
      })
      .catch(() => {
        if (!cancelled) setAdviser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.grade_level, user?.section]);

  function goMonth(delta) {
    setSelected(null);
    setView((current) => addMonths(current, delta));
  }

  const fraction = recordedDays(summary);
  const linked = studentId != null;
  const yRows = useMemo(() => yearRows(allRows), [allRows]);
  const totals = useMemo(() => yearTotals(yRows), [yRows]);
  const selectedRecord = selected ? rows.find((r) => r.date === selected) : null;
  const selectedLetter = selected ? letters.find((l) => l.absence_date === selected) : null;
  const childLine = [
    `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim(),
    user?.grade_level != null ? `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '') : '',
    adviser ? `Adviser: ${adviser}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!linked) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4">
        <View className="rounded-xl border border-edge bg-surface p-6">
          <Text className="text-sm text-fg-muted">This account is not linked to a learner yet, so there is no attendance to show. Ask the school office.</Text>
        </View>
      </ScrollView>
    );
  }

  const cell = 'w-14 px-2 py-2 text-right text-sm';

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setYearTick((n) => n + 1);
            load({ pull: true });
          }}
          tintColor={tokens['fg-muted']}
          colors={[tokens.brand]}
        />
      }
    >
      {childLine ? <Text className="text-sm text-fg-muted">{childLine}</Text> : null}
      {error ? <ErrorAlert message={error} onRetry={() => load()} /> : null}

      <View className="rounded-xl border border-edge bg-surface p-4">
        <Text className="text-sm font-semibold text-fg">{monthLabel}</Text>
        {fraction ? (
          <>
            <Text className="mt-2 text-2xl font-semibold text-fg">
              {fraction.present} of {fraction.total}
            </Text>
            <Text className="text-sm text-fg-muted">Present on recorded days</Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {COUNTS.map((key) => (
                <View key={key} className="flex-row items-center gap-1.5">
                  <StatusBadge status={key} />
                  <Text className="text-sm text-fg-body">{countOf(summary, key)}</Text>
                </View>
              ))}
            </View>
            <Text className="mt-3 text-xs text-fg-muted">Late counts as present · Excused counts as absent</Text>
          </>
        ) : (
          <Text className="mt-2 text-sm text-fg-muted">Nothing recorded this month.</Text>
        )}
      </View>

      <View className="rounded-xl border border-edge bg-surface p-4">
        <View className="mb-4 flex-row items-center justify-between gap-3">
          <Pressable onPress={() => goMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" className="h-9 w-9 items-center justify-center rounded-lg border border-edge-strong">
            <Icon name="fa-chevron-left" size={13} color={tokens['fg-body']} />
          </Pressable>
          <Text className="text-sm font-semibold text-fg" accessibilityLiveRegion="polite">
            {monthLabel}
          </Text>
          <Pressable onPress={() => goMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" className="h-9 w-9 items-center justify-center rounded-lg border border-edge-strong">
            <Icon name="fa-chevron-right" size={13} color={tokens['fg-body']} />
          </Pressable>
        </View>
        {loading ? (
          <LoadingSpinner className="py-12" />
        ) : (
          <AttendanceCalendar
            year={view.year}
            month={view.month}
            records={rows}
            letters={letters}
            today={today}
            selected={selected}
            onSelect={(date) => setSelected((current) => (current === date ? null : date))}
          />
        )}
        {selected ? (
          <View className="mt-4 rounded-lg border border-edge bg-surface-subtle px-4 py-3">
            <Text className="text-sm font-medium text-fg">
              {weekdayName(selected)} {longDate(selected)}
            </Text>
            <View className="mt-2">{selectedRecord ? <StatusBadge status={selectedRecord.status} /> : <Text className="text-sm text-fg-muted">Not recorded</Text>}</View>
            {selectedLetter ? <Text className="mt-2 text-sm text-fg-muted">Excuse letter · {selectedLetter.status}</Text> : null}
          </View>
        ) : null}
      </View>

      <View className="rounded-xl border border-edge bg-surface p-4">
        <Text className="text-sm font-semibold text-fg">How this is counted</Text>
        <Text className="mt-2 text-sm text-fg-muted">
          Late counts as present. Excused counts as absent. Only the days {adviser ? `${adviser} recorded` : "your child's adviser recorded"} are counted — a school day with no
          record is left out, not marked absent.
        </Text>
      </View>

      {yRows.length ? (
        <View className="rounded-xl border border-edge bg-surface p-4">
          <Text className="text-sm font-semibold text-fg">School year record</Text>
          <Text className="mt-1 text-xs text-fg-muted">Only months with recorded days are shown. A dash means nothing was recorded that month.</Text>
          <View className="mt-3 flex-row">
            <View className="border-r border-edge">
              <Text className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"> </Text>
              {['Recorded days', 'Present', 'Absent'].map((label) => (
                <Text key={label} className="px-2 py-2 text-sm font-medium text-fg">
                  {label}
                </Text>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View className="flex-row">
                  {yRows.map((r) => (
                    <Text key={r.key} className={`${cell} text-xs font-semibold uppercase tracking-wider text-fg-muted`}>
                      {monthName(r.month).slice(0, 3)}
                    </Text>
                  ))}
                  <Text className={`${cell} text-xs font-semibold uppercase tracking-wider text-fg`}>Total</Text>
                </View>
                {[
                  ['recorded'],
                  ['present'],
                  ['absent'],
                ].map(([key]) => (
                  <View key={key} className="flex-row">
                    {yRows.map((r) => (
                      <Text key={r.key} className={`${cell} text-fg-secondary`}>
                        {r.recorded === undefined ? '—' : r[key]}
                      </Text>
                    ))}
                    <Text className={`${cell} font-medium text-fg`}>{totals[key]}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
