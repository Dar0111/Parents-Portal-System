import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import DataList from '../../components/DataList';
import SectionHeader from '../../components/SectionHeader';
import { timestampDay } from '../../format/date';
import useVisitClear from '../../realtime/useVisitClear';

// PARENT → MEMOS. No audience label on a memo row: memos have no targeting
// columns, so the fact is true of the whole page and is said once above it —
// as the section's own description since feat/ui-refresh, where it was a note
// card before. One empty branch (§5f).
export default function MemosScreen({ navigation }) {
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
      return true;
    } catch (err) {
      setError(extractError(err));
      if (offset === 0) setRows([]);
      return false;
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  // EVERY FOCUS RE-READS, as Admin → Announcements does (fix/f3-badges): a
  // drawer screen stays mounted, so a visit is a focus, and a visit whose
  // first page loads clears the badge (realtime/useVisitClear.js). The first
  // focus is the mount, so there is no mount load of its own.
  const visited = useVisitClear('memos');
  useFocusEffect(
    useCallback(() => {
      load(0).then(visited);
    }, [load, visited])
  );

  const header = (
    <SectionHeader
      title="Posted memos"
      description="Memos come from the school administration and go to everyone."
      className="mb-4"
    />
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
      onRetry={() => load(0).then(visited)}
      refreshing={refreshing}
      onRefresh={() => load(0, { pull: true }).then(visited)}
      hasMore={Boolean(page?.has_more)}
      loadingMore={loadingMore}
      onLoadMore={() => load(rows.length || PAGE_SIZE)}
      header={header}
      empty={{ icon: 'fa-file-lines', title: 'No memos yet', message: 'Memos from the school administration will appear here.' }}
    />
  );
}
