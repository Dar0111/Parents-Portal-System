import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import DataList from '../../components/DataList';
import SectionHeader from '../../components/SectionHeader';
import Segmented from '../../components/Segmented';
import Text from '../../components/Text';
import { longDate, todayLocalDateString } from '../../format/date';
import { eventAudience } from './PostReadScreen';

// PARENT → EVENTS. Upcoming asks the endpoint for `from=today` AND
// `sort=event_date&order=asc` explicitly — the default is DESC, right for the
// full list and wrong for "what is next" (§12). The range is a bounded
// control and auto-applies (§21). Three empty branches (§5f).
//
// RELOAD (feat/ui-refresh) is `load(0)` — the same request with the range
// that is applied now; the range is not reset.
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
          <Button size="sm" onPress={() => setRange('all')}>
            Show past events
          </Button>
        ),
      };
    }
    return { icon: 'fa-calendar-days', title: 'No events yet', message: 'School events will appear here once they are posted.' };
  })();

  // The section's title and Reload, then the range in its own card: the two
  // pills fit a 360dp phone side by side, and the caption under them says
  // what "Upcoming" includes.
  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader title="School events" onReload={() => load(0)} reloading={loading || refreshing} reloadLabel="Reload events" />
      <View className={`${cardClass} p-4`}>
        <Segmented label="Show" options={RANGES} value={range} onChange={setRange} />
        <Text className="mt-3 text-xs text-fg-muted">Upcoming includes anything happening today.</Text>
      </View>
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
