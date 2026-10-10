import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';

// ADMIN → STUDENTS — the web's admin/StudentsPage.jsx. Admin is UNSCOPED; the
// status DEFAULTS TO ALL (an admin roster hiding inactive students is an
// incomplete roster shown as complete). Status / grade / section / search are
// STAGED behind Apply (§21a); the section waits for a grade. No Enroll and no
// parent-create here (both are the adviser's).
//
// DEACTIVATE / ACTIVATE LIVES ON THE LIST, as on the web, with no confirm
// (§5e — the same endpoint reverses it). On the phone the card therefore has
// TWO PEERS — Open and Deactivate / Activate — so it is a STATIC card with
// actions (§5a-iii), not a tappable one; the web's narrow card had no status
// control at all. A declared difference (M18). The list reloads after a
// status write rather than patching the row (§5b), and on focus (M14).
//
// THE LOOK (feat/ui-refresh, 2026-10-03) is the web's: the section's header,
// the sentence that says what deactivating does as its own paragraph under
// it, and the filters in their own card. There is no header action: nothing
// is created here.
const STATUS_OPTIONS = [
  { key: 'all', label: 'All statuses' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];
const GRADES = [{ key: '', label: 'All grades' }, ...[1, 2, 3, 4, 5, 6].map((g) => ({ key: String(g), label: `Grade ${g}` }))];
const DEFAULT_FILTERS = { status: 'all', grade_level: '', section: '', search: '' };

export default function StudentsScreen({ navigation }) {
  const [students, setStudents] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sections, setSections] = useState([]);
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [status, setStatus] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const draftFilters = { ...draft, search: draft.search.trim() };
  const dirty = isDirty(draftFilters, applied);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { status: applied.status, ...listParams({ offset }) };
        if (applied.grade_level) params.grade_level = applied.grade_level;
        if (applied.section) params.section = applied.section;
        if (applied.search) params.search = applied.search;
        const result = await api.get('/students', { unwrap: ['students', 'page'], params });
        setStudents((prev) => (offset === 0 ? result.students : [...prev, ...result.students]));
        setPage(result.page);
      } catch (err) {
        setError(extractError(err));
        if (offset === 0) setStudents([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [applied]
  );

  useFocusEffect(
    useCallback(() => {
      load(0);
    }, [load])
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setSections(rows);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sectionOptions = useMemo(
    () =>
      draft.grade_level
        ? sections
            .filter((row) => Number(row.grade_level) === Number(draft.grade_level))
            .map((row) => row.name)
            .sort((a, b) => a.localeCompare(b))
        : [],
    [sections, draft.grade_level]
  );

  async function setStudentStatus(row, next) {
    setStatus(null);
    setSavingId(row.id);
    try {
      await api.patch(`/students/${row.id}/status`, { status: next }, { unwrap: 'student' });
      setStatus(ok(`${row.first_name} ${row.last_name} ${next === 'inactive' ? 'deactivated' : 'activated'}.`));
      await load(0);
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSavingId(null);
    }
  }

  function applyFilters() {
    setApplied(draftFilters);
  }

  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  }

  const canReset = applied.status !== DEFAULT_FILTERS.status || Boolean(applied.grade_level || applied.section || applied.search);

  // No section title (feat/look-fixes, owner-approved copy): the navigator's
  // header already says "Students", and a second "Students" right under it
  // was the same word twice.
  const header = (
    <View className="mb-4 gap-4">
      <Text className="text-sm text-fg-muted">
        Deactivating a student hides them from teachers' student and attendance lists, and stops new attendance and new grade records from being created for
        them. Their existing records and their parent's account are not changed. Activate reverses it.
      </Text>
      {/* The filter bar is its own card. */}
      <View className={`${cardClass} gap-4 p-4`}>
        <Segmented label="Status" value={draft.status} onChange={(v) => setDraft((p) => ({ ...p, status: v }))} options={STATUS_OPTIONS} />
        <Segmented label="Grade" value={draft.grade_level} onChange={(v) => setDraft((p) => ({ ...p, grade_level: v, section: '' }))} options={GRADES} />
        {draft.grade_level ? (
          <Segmented
            label="Section"
            value={draft.section}
            onChange={(v) => setDraft((p) => ({ ...p, section: v }))}
            options={[{ key: '', label: 'All sections' }, ...sectionOptions.map((name) => ({ key: name, label: name }))]}
          />
        ) : null}
        <FormField
          label="Search"
          placeholder="Name or LRN"
          value={draft.search}
          onChangeText={(v) => setDraft((p) => ({ ...p, search: v }))}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={applyFilters}
        />
        <FilterActions dirty={dirty} canReset={canReset} onApply={applyFilters} onReset={resetFilters} />
      </View>
      <FormStatus status={status} />
    </View>
  );

  return (
    <DataList
      rows={students}
      skeletonAvatar
      queryKey={[applied]}
      renderCard={(row) => {
        const next = row.status === 'active' ? 'inactive' : 'active';
        const busy = savingId === row.id;
        return {
          avatar: `${row.first_name} ${row.last_name}`,
          title: `${row.last_name}, ${row.first_name}`,
          subtitle: `Grade ${row.grade_level} - ${row.section}`,
          status: row.status,
          actions: [
            { label: 'Open', onPress: () => navigation.navigate('AdminStudentDetail', { id: row.id }) },
            { label: busy ? 'Saving…' : next === 'inactive' ? 'Deactivate' : 'Activate', tone: next === 'inactive' ? 'danger' : 'neutral', onPress: busy ? () => {} : () => setStudentStatus(row, next) },
          ],
        };
      }}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true })}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(students.length || PAGE_SIZE)}
      header={header}
      empty={
        canReset
          ? {
              icon: 'fa-magnifying-glass',
              title: 'No students match these filters',
              message: 'Try a different status, grade, section, or search, or reset to see every student.',
              action: (
                <Button size="sm" onPress={resetFilters}>
                  Reset filters
                </Button>
              ),
            }
          : { icon: 'fa-user-graduate', title: 'No students yet', message: 'Students enrolled by teachers appear here.' }
      }
    />
  );
}
