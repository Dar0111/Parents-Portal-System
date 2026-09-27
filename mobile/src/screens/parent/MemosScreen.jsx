import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import DataList from '../../components/DataList';
import { timestampDay } from '../../format/date';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

// PARENT → MEMOS. No audience label on a memo row: memos have no targeting
// columns, so the fact is true of the whole page and is said once above it.
// One empty branch (§5f).
export default function MemosScreen({ navigation }) {
  const { tokens } = useTheme();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (offset, { pull = false } = {}) => {
    if (offset === 0) {
      if (pull) setRefreshing(true);
      else setLoading(true);
    } else setLoadingMore(true);
    setError(null);
    try {
      const result = await api.get('/memos', { unwrap: ['memos', 'page'], params: listParams({ offset }) });
      setRows((prev) => (offset === 0 ? result.memos : [...prev, ...result.memos]));
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      if (offset === 0) setRows([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const header = (
    <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-edge bg-surface px-4 py-3">
      <Icon name="fa-circle-info" size={13} color={tokens['fg-faint']} style={{ marginTop: 3 }} />
      <Text className="flex-1 text-sm text-fg-body">Memos come from the school administration and go to everyone.</Text>
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        onSelect: () => navigation.navigate('PostRead', { kind: 'memo', row }),
        title: row.title,
        subtitle: row.content,
        meta: timestampDay(row.created_at),
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
      empty={{ icon: 'fa-file-lines', title: 'No memos yet', message: 'Memos from the school administration will appear here.' }}
    />
  );
}
