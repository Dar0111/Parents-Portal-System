import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import DataList from '../../components/DataList';
import SectionHeader from '../../components/SectionHeader';
import { timestampDay } from '../../format/date';

// TEACHER → MEMOS — READ ONLY, and that is the whole design: every memo
// write is authorize('admin'), so a compose control here would fail every
// time. The page says so plainly. Posted by is attribution only; memos have
// no targeting columns, so there is nothing to filter and one empty branch
// (§5f). A static card: a teacher does not own a memo and the endpoint has
// no GET /:id — the row is the whole record, so there is nothing to open.
//
// THE SECTION HEADER (feat/ui-refresh) is the web's: the list's title, the
// page's one explanation as the sentence under it, and Reload — `load(0)`,
// the request pull-to-refresh and Try again already make, back on the first
// page.
export default function MemosScreen() {
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
    <View className="mb-4">
      <SectionHeader
        title="Posted memos"
        description="Memos are posted by the school administration and go to everyone. Teachers read them here; to reach your own class, use Announcements."
        onReload={() => load(0)}
        reloading={loading || refreshing}
        reloadLabel="Reload memos"
      />
    </View>
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({ title: row.title, subtitle: row.content, meta: `${row.posted_by_name} · ${timestampDay(row.created_at)}` })}
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
