import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DataList from '../../components/DataList';
import DateField from '../../components/DateField';
import ErrorAlert from '../../components/ErrorAlert';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import LoadingSpinner from '../../components/LoadingSpinner';
import Segmented from '../../components/Segmented';
import { longDate } from '../../format/date';

// TEACHER → ATTENDANCE RECORDS — the read-only sibling of the encode screen.
// NEVER SENDS `date` (BUILD ORDER rule): the correction path is Attendance,
// which the hint names. Section + From + To are STAGED behind Apply (§21a).
// The section control always offers "Everything I recorded" (the MINE
// sentinel, never a section id) beside the advisory sections (#6): a teacher
// reads a row they RECORDED or one for a learner CURRENTLY in a section they
// advise, and "Everything I recorded" is how a former adviser reads theirs.
// Three empty branches from the applied values (§5f).
const MINE = 'mine';

export default function AttendanceRecordsScreen({ navigation }) {
  const { user } = useAuth();
  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionId, setSectionId] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedSectionId, setAppliedSectionId] = useState(null);
  const [applied, setApplied] = useState({ from: '', to: '' });

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((s) => Number(s.adviser_id) === Number(user?.id));
        setSections(mine);
        const initial = mine.length ? mine[0].id : MINE;
        setSectionId(initial);
        setAppliedSectionId(initial);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const section = useMemo(() => (sections || []).find((s) => s.id === appliedSectionId) || null, [sections, appliedSectionId]);
  const showingMine = appliedSectionId === MINE;

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (!section && !showingMine) return;
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...(section ? { grade_level: section.grade_level, section: section.name } : {}), ...listParams({ offset }) };
        if (applied.from) params.from = applied.from;
        if (applied.to) params.to = applied.to;
        const result = await api.get('/attendance', { unwrap: ['attendance', 'page'], params });
        setRows((prev) => (offset === 0 ? result.attendance : [...prev, ...result.attendance]));
        setPage(result.page);
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [section, showingMine, applied]
  );

  // FETCH ON FOCUS, NOT ONLY ON A FILTER CHANGE (F1, 2026-09-28). A drawer
  // screen is never unmounted (M14), so a `useEffect` on `load` fetched once
  // and then only when an APPLIED filter changed: a day saved on Attendance
  // afterwards stayed invisible here — "Everything I recorded" read "You
  // have not recorded any attendance yet" beside a saved row until a chip
  // was re-applied. `useFocusEffect` runs on every focus AND whenever `load`
  // changes while focused, so it covers both. The server was measured
  // correct first: the same two requests, replayed as TCH-001, returned both
  // rows. Rows already on screen stay while the refetch runs (DataList shows
  // its spinner only on an empty list).
  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load])
  );

  function applyFilters() {
    setAppliedSectionId(sectionId);
    setApplied({ from, to });
  }

  function resetFilters() {
    setFrom('');
    setTo('');
    setApplied({ from: '', to: '' });
    setSectionId(appliedSectionId);
  }

  const dirty = isDirty({ sectionId, from, to }, { sectionId: appliedSectionId, from: applied.from, to: applied.to });
  const hasDateRange = Boolean(applied.from || applied.to);

  const hint = (
    <Text className="text-sm text-fg-muted">
      To change a mark, open{' '}
      <Text onPress={() => navigation.navigate('/teacher/attendance')} accessibilityRole="link" className="font-medium text-brand underline">
        Attendance
      </Text>{' '}
      and pick that date.
    </Text>
  );

  if (sectionsError) {
    return (
      <View className="flex-1 gap-3 bg-page p-4">
        {hint}
        <ErrorAlert message={sectionsError} />
      </View>
    );
  }
  if (sections === null) return <LoadingSpinner className="py-16" label="Loading your sections…" />;

  const empty = hasDateRange
    ? {
        icon: 'fa-filter',
        title: 'No records match these dates',
        message: 'Try a different date range, or reset to see every recorded day.',
        action: (
          <Pressable onPress={resetFilters} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
            <Text className="text-sm text-fg-body">Reset</Text>
          </Pressable>
        ),
      }
    : showingMine
      ? {
          icon: 'fa-clipboard-user',
          title: 'You have not recorded any attendance yet',
          message: 'Every day you save on Attendance appears here, even for learners who later move to another section.',
        }
      : { icon: 'fa-clipboard-user', title: 'No attendance recorded for this section yet', message: 'Records appear here after the adviser saves a day on Attendance.' };

  const header = (
    <View className="mb-3 gap-3">
      {hint}
      <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
        <Segmented
          label="Section"
          value={sectionId}
          onChange={setSectionId}
          options={[...sections.map((s) => ({ key: s.id, label: `Grade ${s.grade_level} - ${s.name}` })), { key: MINE, label: 'Everything I recorded' }]}
        />
        {/* STACKED, not side by side (feat/ui-polish, 2026-09-30): once a
            date is set each field adds its 44-unit × button, and at half a
            phone's width "30 September 2026" wrapped. Full width keeps the
            long date on one line; DateField itself is unchanged. */}
        <View className="gap-3">
          <DateField label="From" value={from} onChange={setFrom} clearable />
          <DateField label="To" value={to} onChange={setTo} clearable />
        </View>
        <FilterActions dirty={dirty} canReset={hasDateRange} onApply={applyFilters} onReset={resetFilters} />
      </View>
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        avatar: `${row.first_name} ${row.last_name}`,
        title: `${row.last_name}, ${row.first_name}`,
        meta: showingMine ? `${longDate(row.date)} · Grade ${row.grade_level} - ${row.section}` : longDate(row.date),
        status: row.status,
      })}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true })}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(rows.length || PAGE_SIZE)}
      header={header}
      empty={empty}
    />
  );
}
