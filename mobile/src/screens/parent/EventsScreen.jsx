import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DataList from '../../components/DataList';
import Segmented from '../../components/Segmented';
import { longDate, todayLocalDateString } from '../../format/date';
import { eventAudience } from './PostReadScreen';

// PARENT → EVENTS. Upcoming asks the endpoint for `from=today` AND
// `sort=event_date&order=asc` explicitly — the default is DESC, right for the
// full list and wrong for "what is next" (§12). The range is a bounded
// control and auto-applies (§21). Three empty branches (§5f).
const RANGES = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All, including past' },
];

export default function EventsScreen({ navigation }) {
  const { user } = useAuth();
  const [range, setRange] = useState('upcoming');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (offset, { pull = false } = {}) => {
      if (offset === 0) {
        if (pull) setRefreshing(true);
        else setLoading(true);
      } else setLoadingMore(true);
      setError(null);
      try {
        const params = { ...listParams({ offset, sort: range === 'upcoming' ? { key: 'event_date', dir: 'asc' } : null }) };
        if (range === 'upcoming') params.from = todayLocalDateString();
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
    [range]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const empty = (() => {
    if (user?.student_id == null) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message: "Ask the school office to link your account so you can see events for your child's year level.",
      };
    }
    if (range === 'upcoming') {
      return {
        icon: 'fa-calendar-check',
        title: 'Nothing coming up',
        message: "School events for your child's year level appear here.",
        action: (
          <Pressable onPress={() => setRange('all')} accessibilityRole="button" className="rounded-lg border border-edge-strong px-3 py-1.5">
            <Text className="text-sm text-fg-body">Show past events</Text>
          </Pressable>
        ),
      };
    }
    return { icon: 'fa-calendar-days', title: 'No events yet', message: 'School events will appear here once they are posted.' };
  })();

  const header = (
    <View className="mb-3 rounded-xl border border-edge bg-surface p-3">
      <Segmented label="Show" options={RANGES} value={range} onChange={setRange} />
      <Text className="mt-2 text-xs text-fg-muted">Upcoming includes anything happening today.</Text>
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        onSelect: () => navigation.navigate('PostRead', { kind: 'event', row }),
        title: row.title,
        subtitle: row.description || undefined,
        meta: `${longDate(row.event_date)} · ${eventAudience(row)}`,
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
