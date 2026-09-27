import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import { dateTime } from '../../format/date';
import { useSocket } from '../../realtime/SocketProvider';
import { useUnread } from '../../realtime/UnreadProvider';
import { useTheme } from '../../theme/ThemeProvider';

// THE THREAD — the web's MessageThreadPage. It WRITES ON OPEN: read-all
// when anything is unread, then the badge REFETCHES (never decrements,
// §10). "Load earlier" is the web's button with the web's wording (decision
// 5), paging by `before=<message_id>` — an offset would skip or repeat a row
// once a live message arrives. A 403 on send is a reason, not a logout
// (§2): the composer is replaced by the sentence and the thread stays
// readable. `dateTime` is the one place the time of day is the point.
export default function MessageThreadScreen({ navigation, route }) {
  const otherId = Number(route.params.otherId);
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { refresh: refreshUnread } = useUnread();
  const { tokens } = useTheme();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scrollRef = useRef(null);
  const messagesRef = useRef([]);
  const loadedForRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const other = useMemo(() => {
    const row = messages.find((m) => m.sender_id === otherId || m.receiver_id === otherId);
    if (!row) return null;
    return row.sender_id === otherId ? { name: row.sender_name, role: row.sender_role } : { name: row.receiver_name, role: row.receiver_role };
  }, [messages, otherId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: other?.name || route.params.name || 'Conversation' });
  }, [navigation, other?.name, route.params.name]);

  const load = useCallback(async () => {
    setLoading((was) => was && messagesRef.current.length === 0);
    setError(null);
    try {
      const result = await api.get(`/messages/with/${otherId}`, { unwrap: ['messages', 'page'] });
      const rows = result.messages;
      const previous = loadedForRef.current === otherId ? messagesRef.current : [];
      const oldestInTail = rows[0]?.id;
      const kept = oldestInTail === undefined ? [] : previous.filter((m) => m.id < oldestInTail);
      loadedForRef.current = otherId;
      setMessages([...kept, ...rows]);
      if (!kept.length) setHasMore(Boolean(result.page?.has_more));
      if (rows.some((m) => m.receiver_id === user?.id && !m.read_status)) {
        await api.patch(`/messages/read-all/${otherId}`, {}, { unwrap: 'count' });
        await refreshUnread();
      }
    } catch (err) {
      setError(extractError(err));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [otherId, user?.id, refreshUnread]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((message) => {
        if (message.sender_id === otherId || message.receiver_id === otherId) load();
      }),
    [subscribe, otherId, load]
  );

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function loadEarlier() {
    const oldest = messages[0]?.id;
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    setError(null);
    try {
      const result = await api.get(`/messages/with/${otherId}`, { unwrap: ['messages', 'page'], params: { before: oldest } });
      setMessages((prev) => [...result.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(Boolean(result.page?.has_more));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const sent = await api.post('/messages', { receiver_id: otherId, body: draft.trim() }, { unwrap: 'data' });
      setMessages((rows) => [...rows, sent]);
      setDraft('');
    } catch (err) {
      const message = extractError(err);
      if (err?.response?.status === 403) setBlockedReason(message);
      else setSendError(message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingSpinner className="py-16" label="Loading conversation…" />;

  return (
    // `padding` ON ANDROID TOO (re-check 2 finding, 2026-09-27): with
    // edge-to-edge, Android no longer resizes the window for the keyboard, so
    // the composer sat behind it. The frame's bottom inset and this padding
    // add up to exactly the keyboard's height (M11).
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      {error ? (
        <View className="p-4">
          <ErrorAlert message={error} onRetry={load} />
        </View>
      ) : null}
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-3 px-4 py-4" keyboardShouldPersistTaps="handled">
        {hasMore ? (
          <View className="items-center">
            <Pressable
              onPress={loadEarlier}
              disabled={loadingEarlier}
              accessibilityRole="button"
              className={`rounded-lg border border-edge-strong bg-surface px-3 py-1 ${loadingEarlier ? 'opacity-60' : ''}`}
            >
              <Text className="text-xs font-medium text-fg-body">{loadingEarlier ? 'Loading…' : 'Load earlier messages'}</Text>
            </Pressable>
          </View>
        ) : null}
        {messages.length === 0 ? (
          <Text className="py-8 text-center text-sm text-fg-muted">No messages in this conversation yet. Send the first one below.</Text>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <View key={m.id} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
                <View className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? 'bg-bubble-mine' : 'bg-bubble-theirs'}`}>
                  <Text className={`text-sm ${mine ? 'text-bubble-mine-fg' : 'text-bubble-theirs-fg'}`}>{m.body}</Text>
                  <Text className={`mt-1 text-[11px] ${mine ? 'text-bubble-mine-meta' : 'text-bubble-theirs-meta'}`}>{dateTime(m.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <View className="border-t border-edge bg-surface px-4 py-3">
        {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}
        {blockedReason ? (
          <View className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2">
            <Text className="text-sm text-warning-strong">{blockedReason} You can still read this conversation.</Text>
          </View>
        ) : (
          <View className="flex-row items-end gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message…"
              placeholderTextColor={tokens['fg-muted']}
              multiline
              accessibilityLabel="Message"
              className="max-h-32 min-h-11 flex-1 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-base text-fg"
            />
            <Pressable
              onPress={send}
              disabled={sending || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: sending || !draft.trim(), busy: sending }}
              className={`h-11 items-center justify-center rounded-lg bg-primary px-4 ${sending || !draft.trim() ? 'opacity-60' : ''}`}
            >
              <Text className="text-sm font-medium text-primary-fg">Send</Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
