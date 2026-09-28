import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import DataList from '../../components/DataList';
import DateField from '../../components/DateField';
import EmptyState from '../../components/EmptyState';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import Segmented from '../../components/Segmented';
import { longDate } from '../../format/date';

// ADMIN → ATTENDANCE — the web's admin/AttendancePage.jsx: VIEW ONLY (the API
// lets admin write; this screen calls none of it). Grade, section, From, To
// and status are STAGED behind Apply (§21a); the section waits for a grade
// and names one with no adviser. NOTHING IS FETCHED until a grade or a date
// range is applied — the whole school at once is not useful — so the first
// state is a prompt. Never sends `date` (that branch drops from/to). Counts
// only over the rows shown, never a rate. The copy names who corrects a mark
// and sends the admin nowhere (§5i). Re-reads on focus (M14).
const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];
const EMPTY = { grade_level: '', section: '', from: '', to: '', status: '' };
const GRADES = [{ key: '', label: 'All grades' }, ...[1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }))];

export default function AttendanceScreen() {
  const [sections, setSections] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const dirty = isDirty(draft, applied);
  const hasScope = Boolean(applied.grade_level || applied.from || applied.to);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((all) => {
        if (!cancelled) setSections(all);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (!hasScope) return;
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...listParams({ offset }) };
        for (const key of ['grade_level', 'section', 'from', 'to', 'status']) if (applied[key]) params[key] = applied[key];
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
    [applied, hasScope]
  );

  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load])
  );

  const sectionOptions = useMemo(
    () => (draft.grade_level ? sections.filter((s) => Number(s.grade_level) === Number(draft.grade_level)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [sections, draft.grade_level]
  );
  const appliedSection = useMemo(
    () => (applied.section ? sections.find((s) => Number(s.grade_level) === Number(applied.grade_level) && s.name === applied.section) || null : null),
    [sections, applied.grade_level, applied.section]
  );

  function applyFilters() {
    setRows([]);
    setPage(null);
    setApplied({ ...draft });
  }

  function resetFilters() {
    setDraft(EMPTY);
    setRows([]);
    setPage(null);
    setError(null);
    setApplied(EMPTY);
  }

  const canReset = Object.values(applied).some(Boolean);
  const counts = useMemo(() => {
    const c = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
    for (const row of rows) if (c[row.status] !== undefined) c[row.status] += 1;
    return c;
  }, [rows]);

  const empty = (() => {
    if (applied.from || applied.to || applied.status) {
      return {
        icon: 'fa-filter',
        title: 'No records match these filters',
        message: 'Try different dates or a different status, or reset.',
        action: (
          <Pressable onPress={resetFilters} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
            <Text className="text-sm text-fg-body">Reset</Text>
          </Pressable>
        ),
      };
    }
    if (applied.section) {
      const label = `Grade ${applied.grade_level} - ${applied.section}`;
      if (appliedSection && appliedSection.adviser_id == null) {
        return { icon: 'fa-user-slash', title: `${label} has no adviser`, message: "Attendance is recorded by the section's adviser, so none has been recorded here." };
      }
      return { icon: 'fa-clipboard-user', title: `No attendance recorded for ${label} yet`, message: 'Records appear here after the adviser saves a day.' };
    }
    return { icon: 'fa-clipboard-user', title: `No attendance recorded for Grade ${applied.grade_level} yet`, message: 'Records appear here after an adviser saves a day.' };
  })();

  const header = (
    <View className="mb-3 gap-3">
      <Text className="text-sm text-fg-muted">View only. Each section's adviser records attendance, and corrects a mark by saving that date again on their own Attendance page.</Text>
      <View className="gap-3 rounded-xl border border-edge bg-surface p-3">
        <Segmented label="Grade" value={draft.grade_level} onChange={(v) => setDraft((p) => ({ ...p, grade_level: v, section: '' }))} options={GRADES} />
        {draft.grade_level ? (
          <Segmented
            label="Section"
            value={draft.section}
            onChange={(v) => setDraft((p) => ({ ...p, section: v }))}
            options={[{ key: '', label: 'All sections' }, ...sectionOptions.map((s) => ({ key: s.name, label: `${s.name}${s.adviser_id == null ? ' (no adviser)' : ''}` }))]}
          />
        ) : null}
        <View className="flex-row gap-2">
          <DateField label="From" value={draft.from} onChange={(v) => setDraft((p) => ({ ...p, from: v }))} clearable className="flex-1" />
          <DateField label="To" value={draft.to} onChange={(v) => setDraft((p) => ({ ...p, to: v }))} clearable className="flex-1" />
        </View>
        <Segmented label="Status" value={draft.status} onChange={(v) => setDraft((p) => ({ ...p, status: v }))} options={[{ key: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ key: s, label: s }))]} />
        <FilterActions dirty={dirty} canReset={canReset} onApply={applyFilters} onReset={resetFilters} />
      </View>
      {hasScope && !loading && !error && rows.length ? (
        <Text className="text-sm text-fg-muted">
          {rows.length} record{rows.length === 1 ? '' : 's'} · Present {counts.Present} · Late {counts.Late} · Absent {counts.Absent} · Excused {counts.Excused}
        </Text>
      ) : null}
    </View>
  );

  if (!hasScope) {
    return (
      <ScrollView className="flex-1 bg-page" contentContainerClassName="px-4 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        {header}
        <EmptyState icon="fa-magnifying-glass" title="Choose a grade or a date range to see attendance records" message="Records are not loaded until you narrow them — the whole school at once is not useful." />
      </ScrollView>
    );
  }

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        avatar: `${row.first_name} ${row.last_name}`,
        title: `${row.last_name}, ${row.first_name}`,
        meta: `${longDate(row.date)} · Grade ${row.grade_level} - ${row.section}`,
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
