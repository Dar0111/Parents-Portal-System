import { useCallback, useEffect, useState } from 'react';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import DataList from '../../components/DataList';
import SectionHeader from '../../components/SectionHeader';
import { timestampDay } from '../../format/date';
import { announcementAudience } from './PostReadScreen';

// PARENT → ANNOUNCEMENTS: the paged list as cards (the web's own
// renderCard data), "Show more" against page.has_more, pull-to-refresh, the
// reading screen. Two empty branches, keyed on the linked state (§5f).
//
// RELOAD (feat/ui-refresh) is `load(0)` — the request pull-to-refresh and
// "Try again" already make, from the section's header. The header rides in
// DataList's `header`, so it scrolls with the list and keeps its gutter.
export default function AnnouncementsScreen({ navigation }) {
  const { user } = useAuth();
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
      const result = await api.get('/announcements', { unwrap: ['announcements', 'page'], params: listParams({ offset }) });
      setRows((prev) => (offset === 0 ? result.announcements : [...prev, ...result.announcements]));
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

  const empty =
    user?.student_id == null
      ? {
          icon: 'fa-link-slash',
          title: "Your account isn't linked to a student record yet",
          message: "Ask the school office to link your account so you can see posts for your child's class.",
        }
      : { icon: 'fa-bullhorn', title: 'No announcements yet', message: "Posts from the school and from your child's teacher appear here." };

  const header = (
    <SectionHeader
      title="Posted announcements"
      onReload={() => load(0)}
      reloading={loading || refreshing}
      reloadLabel="Reload announcements"
      className="mb-4"
    />
  );

  return (
    <DataList
      rows={rows}
      renderCard={(row) => ({
        onSelect: () => navigation.navigate('PostRead', { kind: 'announcement', row }),
        title: row.title,
        subtitle: row.content,
        meta: `${announcementAudience(row)} · ${timestampDay(row.created_at)}`,
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
