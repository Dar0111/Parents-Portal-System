import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import api, { listParams, PAGE_SIZE } from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import DataList from '../../components/DataList';
import SectionHeader from '../../components/SectionHeader';
import { timestampDay } from '../../format/date';
import { useSocket } from '../../realtime/SocketProvider';

// PARENT → MESSAGES: one card per conversation, the unread count in the
// meta line (the server's number on the row, §10), New message under the
// section's header, the list re-read on every `new_message` and on return
// from a thread (read-all changed the rows). `last_message_at` is
// `created_at` renamed — a TIMESTAMP — so it goes through timestampDay
// (§5a-iv).
//
// THE SECTION HEADER (feat/ui-refresh) carries the list's title and its
// Reload — `load(0)`, the request pull-to-refresh and "Try again" already
// make, and the one a socket message triggers, asked for by hand. New message
// is this screen's one filled action, on its own row under the header: beside
// the title and Reload it would leave the one word "Conversations" too little
// room at a larger text size.
export default function MessagesScreen({ navigation }) {
  const { subscribe } = useSocket();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (offset, { pull = false, quiet = false } = {}) => {
    if (offset === 0) {
      if (pull) setRefreshing(true);
      else if (!quiet) setLoading(true);
    } else setLoadingMore(true);
    setError(null);
    try {
      const result = await api.get('/messages/conversations', { unwrap: ['conversations', 'page'], params: listParams({ offset }) });
      setRows((prev) => (offset === 0 ? result.conversations : [...prev, ...result.conversations]));
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

  useEffect(() => subscribe(() => load(0, { quiet: true })), [subscribe, load]);

  useFocusEffect(
    useCallback(() => {
      load(0, { quiet: true });
    }, [load])
  );

  const header = (
    <View className="mb-4 gap-4">
      <SectionHeader title="Conversations" onReload={() => load(0)} reloading={loading || refreshing} reloadLabel="Reload conversations" />
      <Button variant="primary" icon="fa-plus" className="self-end" onPress={() => navigation.navigate('NewMessage')}>
        New message
      </Button>
    </View>
  );

  return (
    <DataList
      rows={rows}
      keyField="other_user_id"
      renderCard={(row) => ({
        onSelect: () => navigation.navigate('MessageThread', { otherId: row.other_user_id, name: row.other_user_name }),
        avatar: row.other_user_name,
        avatarPhoto: row.other_user_profile_pic,
        title: row.other_user_name,
        subtitle: row.last_message_body,
        meta: `${timestampDay(row.last_message_at)}${Number(row.unread_count) > 0 ? ` · ${row.unread_count} unread` : ''}`,
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
      empty={{ icon: 'fa-comments', title: 'No messages yet', message: 'Use New message to start a conversation.' }}
    />
  );
}
