import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import api, { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { createTickets } from '../../api/tickets';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import { MonthGridSkeleton, MonthSummarySkeleton } from '../../components/SkeletonShapes';
import StatusBadge from '../../components/StatusBadge';
import Text from '../../components/Text';
import Icon from '../../icons';
import { addMonths, longDate, monthBounds, monthName, todayLocalDateString, weekdayName } from '../../format/date';
import { clampMonthToSchoolYear } from '../../format/schoolCalendar';
import useSkeleton from '../../hooks/useSkeleton';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';
import AttendanceCalendar from './AttendanceCalendar';
import { COUNTS, EMPTY_SUMMARY, countOf, recordedDays, yearRows, yearTotals } from './attendance/logic';

// PARENT → ATTENDANCE (DV2): the summary FIRST (the number a parent opens
// this page for), then the month grid, the day detail, "How this is
// counted", and the school-year record. The fraction, never a percentage;
// Late counts as present, Excused as absent — the school's decision. The
// month opens on today's, clamped to the school year (#7). The year table
// scrolls sideways with its row labels fixed.
//
// PULL TO REFRESH runs `reloadAll`: the month (`load`, with the month that is
// on screen — the view and the selected day are not touched) and, through
// `yearTick`, the whole history and the letters, so the cards stay one
// answer. The adviser's name is reference data and is not re-read.
//
// EVERY FOCUS AFTER THE FIRST re-reads the same way, QUIETLY (feat/excuse-
// attendance, B8; the owner's Q8): an adviser's decision on a letter now sets
// that day's attendance, and a drawer screen stays mounted, so without this a
// parent opening Attendance after the bell said "approved" saw the day as it
// was. Quiet: the answer on screen stays (no skeleton, no pull indicator)
// until the new one lands — or, if the re-read fails, gives way to the error,
// as any failed read of the month does (a pull or the next focus retries).
// With an error on screen there is no answer to keep, so that focus read is
// not quiet: it shows the skeleton.

// One cell of the school-year table. The SIZE is named where the cell is
// used — `text-xs` on the header row, `text-sm` on the body rows — and never
// twice on one cell, so the fixed label column and the scrolling months have
// the same line height on every row and stay level.
const YEAR_CELL = 'w-14 px-2 py-2 text-right';
const YEAR_HEAD = 'text-xs font-semibold uppercase tracking-wide';

// The two prev / next month buttons: 48dp squares, set in dp (M19).
const MONTH_BUTTON = 'items-center justify-center overflow-hidden rounded-xl border border-edge-strong bg-surface';
const MONTH_BUTTON_SIZE = { width: 48, height: 48 };

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

  // LATEST REPLY WINS (feat/skeleton-tier2-phone; the web's fix round P2,
  // api/tickets.js mirrored). A month change starts a new read while the last
  // month's may still be in flight, and the two can answer in either order: on
  // a slow line the older month's counts and rows would land last, under the
  // newer month's name. Each read takes a ticket and applies its reply, its
  // failure and its end only while that ticket is the newest.
  const [tickets] = useState(createTickets);

  const load = useCallback(
    async ({ pull = false, quiet = false } = {}) => {
      const ticket = tickets.take();
      if (studentId == null) {
        setSummary(EMPTY_SUMMARY);
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }
      if (pull) setRefreshing(true);
      else if (!quiet) setLoading(true);
      setError(null);
      try {
        const { from, to } = monthBounds(`${view.year}-${String(view.month).padStart(2, '0')}-01`);
        const [nextSummary, monthRows] = await Promise.all([
          api.get(`/attendance/summary/${studentId}`, { unwrap: 'summary', params: { from, to } }),
          fetchAll(`/attendance/student/${studentId}`, { unwrap: 'attendance', params: { from, to } }),
        ]);
        if (!tickets.isLatest(ticket)) return;
        setSummary(nextSummary);
        setRows(monthRows);
      } catch (err) {
        if (!tickets.isLatest(ticket)) return;
        setError(extractError(err));
        setSummary(EMPTY_SUMMARY);
        setRows([]);
      } finally {
        if (tickets.isLatest(ticket)) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [studentId, view, tickets]
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

  // The month's own request plus the two whole-history reads — what a pull
  // has always asked for.
  function reloadAll({ pull = false, quiet = false } = {}) {
    setYearTick((n) => n + 1);
    load({ pull, quiet });
  }

  // The quiet focus re-read (see the header). The first focus is the mount,
  // which the effects above have already read; `load` is read through a ref so
  // the callback runs on a focus only, never on a month change. Quiet only
  // while an ANSWER is on screen: after a failed read there is nothing to keep,
  // so the re-read shows the skeleton like any first read — never "Nothing
  // recorded this month." over an empty month while the read is out.
  const firstFocus = useRef(true);
  const latestLoad = useRef(load);
  const failedRead = useRef(false);
  useEffect(() => {
    latestLoad.current = load;
    failedRead.current = error != null;
  });
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return undefined;
      }
      setYearTick((n) => n + 1);
      latestLoad.current({ quiet: !failedRead.current });
      return undefined;
    }, [])
  );

  const fraction = recordedDays(summary);
  const linked = studentId != null;
  const yRows = useMemo(() => yearRows(allRows), [allRows]);
  const totals = useMemo(() => yearTotals(yRows), [yRows]);
  const selectedRecord = selected ? rows.find((r) => r.date === selected) : null;
  const selectedLetter = selected ? letters.find((l) => l.absence_date === selected) : null;
  // The learner this page is about: the band's title, and one line of
  // context under it — the same three facts the single line above the grid
  // used to carry, in the same order; any of them may be missing. A learner
  // has no photo, so the circle is always initials.
  const childName = `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim();
  const childMeta = [
    user?.grade_level != null ? `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '') : '',
    adviser ? `Adviser: ${adviser}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The month's skeletons — the summary card and the grid (feat/skeleton-
  // tier2-phone): `loading` is set by a non-pull read only, which runs for a
  // first load or a new month, so it is always a new key. A pull keeps both.
  const monthPhase = useSkeleton(loading);

  if (!linked) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="p-4">
        <View className={`${cardClass} flex-row items-start gap-3 p-5`}>
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
            <Icon name="fa-link-slash" size={14} color={tokens['fg-muted']} />
          </View>
          <Text className="min-w-0 flex-1 text-sm text-fg-muted">This account is not linked to a learner yet, so there is no attendance to show. Ask the school office.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => reloadAll({ pull: true })}
          tintColor={tokens['fg-muted']}
          colors={[tokens.brand]}
        />
      }
    >
      {/* WHO THIS IS ABOUT — the same band as the dashboard's "Your child"
          card. "Name not recorded" is the wording that card already uses
          for a linked learner with no name on the row. */}
      <Reveal>
        <View className="flex-row items-center gap-3 rounded-2xl border border-edge bg-brand-panel p-4">
          <Avatar name={childName} size={48} />
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="font-serif text-xl text-brand-panel-fg">
              {childName || 'Name not recorded'}
            </Text>
            {childMeta ? <Text className="mt-0.5 text-sm text-brand-panel-muted">{childMeta}</Text> : null}
          </View>
        </View>
      </Reveal>

      {error ? <ErrorAlert message={error} onRetry={() => load()} /> : null}

      <View className={`${cardClass} p-4`}>
        <Text className="font-serif text-base text-fg">{monthLabel}</Text>
        {/* While the month loads (the web's fix round P1) the card is skeleton
            under the month's name: what it held belongs to another month, or
            to nothing yet, and "Nothing recorded" is a claim only the month's
            answer can make. */}
        {loading ? (
          <MonthSummarySkeleton phase={monthPhase} />
        ) : fraction ? (
          <>
            {/* THE FRACTION, and only the fraction. One sentence for a screen
                reader — "21 of 23" — set as a figure and its denominator. */}
            <Text className="mt-3">
              <Text className="text-2xl font-bold text-fg" style={{ fontVariant: ['tabular-nums'] }}>
                {fraction.present}
              </Text>{' '}
              <Text className="text-base font-semibold text-fg-muted" style={{ fontVariant: ['tabular-nums'] }}>
                of {fraction.total}
              </Text>
            </Text>
            <Text className="text-sm text-fg-muted">Present on recorded days</Text>
            {/* The four counts as tiles, two across: the status is a
                StatusBadge — colour AND word — and the count beside it is the
                server's own number for the month. */}
            <View className="mt-4 gap-2">
              {[COUNTS.slice(0, 2), COUNTS.slice(2)].map((pair) => (
                <View key={pair[0]} className="flex-row gap-2">
                  {pair.map((key) => (
                    <View key={key} className="flex-1 flex-row items-center justify-between gap-2 rounded-xl border border-edge-soft bg-surface-subtle px-3 py-2.5">
                      <StatusBadge status={key} />
                      <Text className="text-base font-bold text-fg" style={{ fontVariant: ['tabular-nums'] }}>
                        {countOf(summary, key)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <Text className="mt-4 text-xs text-fg-muted">Late counts as present · Excused counts as absent</Text>
          </>
        ) : (
          <Text className="mt-2 text-sm text-fg-muted">Nothing recorded this month.</Text>
        )}
      </View>

      <View className={`${cardClass} p-4`}>
        {/* Month navigation: two 48dp icon buttons, each named by its label,
            with the month between them announced politely when it changes. */}
        <View className="mb-4 flex-row items-center justify-between gap-2">
          <Pressable
            onPress={() => goMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            android_ripple={{ color: tokens['edge-strong'] }}
            className={MONTH_BUTTON}
            style={MONTH_BUTTON_SIZE}
          >
            <Icon name="fa-chevron-left" size={13} color={tokens['fg-body']} />
          </Pressable>
          <Text className="min-w-0 flex-1 text-center font-serif text-base text-fg" accessibilityLiveRegion="polite">
            {monthLabel}
          </Text>
          <Pressable
            onPress={() => goMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            android_ripple={{ color: tokens['edge-strong'] }}
            className={MONTH_BUTTON}
            style={MONTH_BUTTON_SIZE}
          >
            <Icon name="fa-chevron-right" size={13} color={tokens['fg-body']} />
          </Pressable>
        </View>
        {loading ? (
          <MonthGridSkeleton phase={monthPhase} />
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
          <View className="mt-4 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            <Text className="text-sm font-semibold text-fg">
              {weekdayName(selected)} {longDate(selected)}
            </Text>
            <View className="mt-2">{selectedRecord ? <StatusBadge status={selectedRecord.status} /> : <Text className="text-sm text-fg-muted">Not recorded</Text>}</View>
            {selectedLetter ? (
              <View className="mt-2 flex-row items-center gap-2">
                <Icon name="fa-envelope" size={11} color={tokens['fg-muted']} />
                <Text className="min-w-0 flex-1 text-sm text-fg-muted">Excuse letter · {selectedLetter.status}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className={`${cardClass} flex-row items-start gap-3 p-4`}>
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
          <Icon name="fa-circle-info" size={14} color={tokens.brand} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-base text-fg">How this is counted</Text>
          {/* Never "recorded by —": when no adviser is assigned to the
              section, the sentence has to work without a name. */}
          <Text className="mt-1 text-sm text-fg-body">
            Late counts as present. Excused counts as absent. Only the days {adviser ? `${adviser} recorded` : "your child's adviser recorded"} are counted — a school day with no
            record is left out, not marked absent.
          </Text>
        </View>
      </View>

      {yRows.length ? (
        <View className={`${cardClass} p-4`}>
          <Text className="font-serif text-base text-fg">School year record</Text>
          <Text className="mt-1 text-xs text-fg-muted">Only months with recorded days are shown. A dash means nothing was recorded that month.</Text>
          <View className="mt-3 flex-row">
            <View className="border-r border-edge">
              <Text className={`px-2 py-2 ${YEAR_HEAD} text-fg-muted`}> </Text>
              {['Recorded days', 'Present', 'Absent'].map((label) => (
                <Text key={label} className="px-2 py-2 text-sm font-semibold text-fg">
                  {label}
                </Text>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View className="flex-row">
                  {yRows.map((r) => (
                    <Text key={r.key} className={`${YEAR_CELL} ${YEAR_HEAD} text-fg-muted`}>
                      {monthName(r.month).slice(0, 3)}
                    </Text>
                  ))}
                  <Text className={`${YEAR_CELL} ${YEAR_HEAD} text-fg`}>Total</Text>
                </View>
                {[
                  ['recorded'],
                  ['present'],
                  ['absent'],
                ].map(([key]) => (
                  <View key={key} className="flex-row">
                    {yRows.map((r) => (
                      <Text key={r.key} className={`${YEAR_CELL} text-sm text-fg-secondary`} style={{ fontVariant: ['tabular-nums'] }}>
                        {r.recorded === undefined ? '—' : r[key]}
                      </Text>
                    ))}
                    <Text className={`${YEAR_CELL} text-sm font-semibold text-fg`} style={{ fontVariant: ['tabular-nums'] }}>
                      {totals[key]}
                    </Text>
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
