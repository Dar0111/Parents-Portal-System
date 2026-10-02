import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import DateField from '../../components/DateField';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import useTeacherTargets from '../../hooks/useTeacherTargets';
import teacherEventCard from './events/card';

// TEACHER → EVENTS — list, compose, edit, delete. SHARES NO COMPONENT WITH
// ANNOUNCEMENTS (the web's reasoning): `description` is nullable, there is
// a required `event_date`, targeting is GRADE-ONLY (no target_section
// column), and the write scope is grade-level. Grade + From + To are STAGED
// behind Apply (§21a); New event is neutral on its own row (§21b). Edit and
// Delete are two peers on a static card, author only; Delete confirms with a
// native Alert naming the event (§5e). The card is the verbatim
// `events/card.jsx`. One reset serves the filter row and the empty state.
//
// THE SECTION HEADER (feat/ui-refresh) carries the list's title, its Reload
// and — for a teacher with no grade to post to — the sentence that stops the
// missing button reading as broken; nothing is said while the target list is
// loading. Reload is `load(0)`: the request pull-to-refresh and Try again
// already make, with the APPLIED grade and dates, back on the first page. It
// does not re-read the teacher's targets (`useTeacherTargets` reads them
// once). From and To sit one under the other, for the reason on Excuse
// Letters: side by side in this card a chosen date has no room at 360dp.
const DEFAULT = { grade: '', from: '', to: '' };

export default function EventsScreen({ navigation, route }) {
  const { user } = useAuth();
  const { grades, loading: targetsLoading } = useTeacherTargets();
  const notice = route?.params?.notice || null;

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [writeStatus, setWriteStatus] = useState(null);

  const [gradeFilter, setGradeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState(DEFAULT);
  const draftFilters = { grade: gradeFilter, from, to };
  const dirty = isDirty(draftFilters, applied);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...listParams({ offset }) };
        if (applied.grade) params.grade_level = applied.grade;
        if (applied.from) params.from = applied.from;
        if (applied.to) params.to = applied.to;
        const result = await api.get('/events', { unwrap: ['events', 'page'], params });
        setRows((prev) => (offset === 0 ? result.events : [...prev, ...result.events]));
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
    [applied]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (notice) {
        setWriteStatus(ok(notice));
        load(0);
        navigation.setParams({ notice: null });
      }
    }, [notice, load, navigation])
  );

  function confirmDelete(row) {
    setWriteStatus(null);
    Alert.alert('Delete event', `Delete “${row.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/events/${row.id}`, { raw: true });
            await load(0);
            setWriteStatus(ok('Event deleted.'));
          } catch (err) {
            setWriteStatus(fail(extractError(err)));
          }
        },
      },
    ]);
  }

  function applyFilters() {
    setApplied(draftFilters);
  }

  function resetFilters() {
    setGradeFilter('');
    setFrom('');
    setTo('');
    setApplied(DEFAULT);
  }

  const canPost = grades.length > 0;
  const hasFilter = Boolean(applied.grade || applied.from || applied.to);

  const empty = hasFilter
    ? {
        icon: 'fa-filter',
        title: 'No events match these filters',
        message: 'Try a different grade or date range.',
        action: (
          <Button size="sm" onPress={resetFilters}>
            Clear filters
          </Button>
        ),
      }
    : {
        icon: 'fa-calendar-days',
        title: 'No events yet',
        message: canPost ? 'School-wide events from the admin and events for your grades appear here.' : 'School-wide events from the admin appear here.',
      };

  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader
        title="Posted events"
        description={targetsLoading || canPost ? null : 'You can post once you are assigned to a class or made a section adviser.'}
        onReload={() => load(0)}
        reloading={loading || refreshing}
        reloadLabel="Reload events"
      />
      {!targetsLoading && canPost ? (
        <Button
          icon="fa-plus"
          className="self-end"
          onPress={() => {
            setWriteStatus(null);
            navigation.navigate('EventCompose');
          }}
        >
          New event
        </Button>
      ) : null}
      <View className={`${cardClass} gap-3 p-4`}>
        <Segmented
          label="Grade"
          value={gradeFilter}
          onChange={setGradeFilter}
          options={[{ key: '', label: 'All my grade levels' }, ...grades.map((g) => ({ key: String(g), label: `Grade ${g}` }))]}
        />
        <DateField label="From" value={from} onChange={setFrom} clearable />
        <DateField label="To" value={to} onChange={setTo} clearable />
        <FilterActions dirty={dirty} canReset={hasFilter} onApply={applyFilters} onReset={resetFilters} />
      </View>
      <FormStatus status={writeStatus} />
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) =>
        teacherEventCard(row, {
          actions:
            row.posted_by === user?.id
              ? [
                  { label: 'Edit', onPress: () => navigation.navigate('EventCompose', { editing: row }) },
                  { label: 'Delete', tone: 'danger', onPress: () => confirmDelete(row) },
                ]
              : undefined,
        })
      }
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
