import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import api from '../api/client';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import Button from '../components/Button';
import DataList from '../components/DataList';
import ErrorAlert from '../components/ErrorAlert';
import SectionHeader from '../components/SectionHeader';
import { linkParams, linkToRoute } from '../navigation/routes';
import { useNotifications } from '../realtime/NotificationProvider';

// THE NOTIFICATIONS SCREEN — the web's bell panel as a screen (decision 4).
// Same rows, same page size, same two writes. Opening a row marks it read
// (a repeat is absorbed, §5e), asks the provider to REFETCH the counts —
// never subtracts one — and navigates by the row's `link` through
// routes.js: a built drawer route by its path, else the role's home.
//
// THE LIST'S HEADER (feat/ui-refresh, 2026-10-02) is one SectionHeader: the
// unread line — the provider's count, as before — is its title, and on the
// right sits "Mark all as read". A failed "Mark all as read" says so under
// the header, beside the control that caused it (§7c).
const PAGE_SIZE = 8;

// Relative time, kept local as on the web: this is about a TIMESTAMP and
// the bell is its only caller. Extracted at the second.
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const { counts, refresh } = useNotifications();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async (nextOffset, { refreshingPull = false } = {}) => {
    if (nextOffset === 0) {
      if (refreshingPull) setRefreshing(true);
      else setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');
    try {
      const { notifications, page } = await api.get(`/notifications?limit=${PAGE_SIZE}&offset=${nextOffset}`, {
        unwrap: ['notifications', 'page'],
      });
      setRows((prev) => (nextOffset === 0 ? notifications : [...prev, ...notifications]));
      setOffset(nextOffset);
      setHasMore(Boolean(page?.has_more));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  async function openRow(row) {
    setActionError('');
    try {
      if (!row.read_at) {
        await api.patch(`/notifications/${row.id}/read`, {}, { unwrap: 'notification' });
        refresh();
      }
    } catch {
      // Opening still proceeds; the row stays unread and the next read will
      // absorb the repeat.
    }
    const route = linkToRoute(row.link, user?.role);
    // A link's query goes to the screen as its `preset`, keyed by the moment
    // of the press so a still-mounted screen takes it again — the admin
    // dashboard's shape (fix round F3). B1 fix round, 2026-10-22.
    const params = linkParams(row.link, user?.role);
    // popTo, not navigate: navigate pushes a second drawer (M16).
    navigation.popTo('Main', params ? { screen: route, params: { preset: { ...params, key: Date.now() } } } : { screen: route });
  }

  async function markAllRead() {
    setActionError('');
    try {
      await api.patch('/notifications/read-all', {}, { unwrap: 'updated' });
      refresh();
      load(0);
    } catch (err) {
      setActionError(extractError(err));
    }
  }

  const header = (
    <View className="mb-4 gap-3">
      <SectionHeader
        title={counts.total > 0 ? `${counts.total} unread` : 'Nothing unread'}
        actions={
          counts.total > 0 ? (
            <Button variant="secondary" size="sm" onPress={markAllRead}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      <ErrorAlert message={actionError} />
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        unread: !row.read_at,
        title: row.title,
        subtitle: row.body,
        meta: relativeTime(row.created_at),
        onSelect: () => openRow(row),
        accessibilityLabel: `${row.read_at ? '' : 'Unread. '}${row.title}. ${row.body}`,
      })}
      loading={loading}
      error={error}
      onRetry={() => load(0)}
      refreshing={refreshing}
      onRefresh={() => load(0, { refreshingPull: true })}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => load(offset + PAGE_SIZE)}
      loadMoreLabel="Show older"
      header={header}
      empty={{ icon: 'fa-bell', title: 'No notifications yet.' }}
    />
  );
}
