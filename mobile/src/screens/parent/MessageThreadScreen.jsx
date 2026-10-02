import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import ReloadButton from '../../components/ReloadButton';
import Text from '../../components/Text';
import { dateTime } from '../../format/date';
import Icon from '../../icons';
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
//
// ONE THREAD SCREEN FOR BOTH ROLES (branch 3). The teacher's thread adds
// exactly one thing, "Announce to a class", and it is ROLE-GATED here rather
// than a second thread file: the button opens the ONE composer
// (AnnouncementCompose) with the UNSENT DRAFT — never the last incoming
// message — and a target only when the contacts row for this thread is a
// parent row carrying the child's class. GET /messages/contacts is the one
// messages endpoint with a class, fetched ONCE per thread in its own effect
// (load() re-runs on every socket message). The client PRESELECTS; the
// composer re-validates and the server decides. "This conversation will
// not" is the sentence that stops a teacher believing they replied.
//
// THE LOOK (feat/ui-refresh), as the web's thread: a bar that says who the
// conversation is with and holds its Reload, the bubbles on their own tokens
// with the message at reading size, and a composer whose field and Send are
// both 48dp (set in dp — M19; the field through a plain style object, never a
// style function — M20). The circle is initials: a message row carries the
// other person's name but no photo.
//
// NO ENTRANCE, AND NOTHING MOVES WHEN A MESSAGE ARRIVES. `load()` runs on
// every socket message, so motion here would be motion on arrival, which
// this app does not have.
//
// RELOAD is `load` itself — the same request a socket message triggers, with
// the same merge: the earlier pages already on screen, the unsent draft and a
// blocked composer all survive it. `load` keeps the thread on screen while it
// re-reads (only the first read shows the full-screen spinner), so the button
// carries its own busy flag, set in its own handler.
export default function MessageThreadScreen({ navigation, route }) {
  const otherId = Number(route.params.otherId);
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const [contactInfo, setContactInfo] = useState({ forId: null, row: null });
  const { subscribe } = useSocket();
  const { refresh: refreshUnread } = useUnread();
  const { tokens } = useTheme();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
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

  // Teacher only: the contacts row for this thread, once per thread, never
  // inside load(). A failure is not surfaced — the unnamed button is the
  // honest fallback, and the thread must render if contacts fails.
  useEffect(() => {
    if (!isTeacher) return undefined;
    let cancelled = false;
    api
      .get('/messages/contacts', { unwrap: 'contacts' })
      .then((rows) => {
        if (!cancelled) setContactInfo({ forId: otherId, row: rows.find((c) => c.id === otherId) || null });
      })
      .catch(() => {
        if (!cancelled) setContactInfo({ forId: otherId, row: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isTeacher, otherId]);

  const contactRow = contactInfo.forId === otherId ? contactInfo.row : null;
  const announceClass =
    contactRow?.student_name && contactRow.student_grade_level != null && contactRow.student_section
      ? { key: `${contactRow.student_grade_level}|${contactRow.student_section}`, label: `Grade ${contactRow.student_grade_level} - ${contactRow.student_section}` }
      : null;
  const announceHint = announceClass
    ? `Opens an announcement to ${announceClass.label}, already selected. Every parent in that section will see it. This conversation will not.`
    : 'Opens a class announcement. Every parent in the section you pick will see it. This conversation will not.';

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

  // The Reload button's own handler: `load()` as it is, with a busy flag
  // around it for the button alone.
  async function reload() {
    setReloading(true);
    try {
      await load();
    } finally {
      setReloading(false);
    }
  }

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
      {/* WHO THE CONVERSATION IS WITH, and its Reload. The teacher's one
          extra, "Announce to a class", sits under it in the same bar. */}
      <View className="gap-2 border-b border-edge bg-surface px-4 py-2">
        <View className="flex-row items-center gap-3">
          <Avatar name={other?.name || route.params.name} />
          <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-base text-fg">
            {other?.name || route.params.name || 'Conversation'}
          </Text>
          <ReloadButton onReload={reload} loading={reloading} label="Reload conversation" />
        </View>
        {isTeacher ? (
          <View className="gap-1">
            <Button
              size="sm"
              className="self-end"
              accessibilityHint={announceHint}
              onPress={() =>
                navigation.navigate(
                  'AnnouncementCompose',
                  announceClass ? { content: draft.trim(), target: announceClass.key } : { content: draft.trim() }
                )
              }
            >
              {announceClass ? `Announce to ${announceClass.label}` : 'Announce to a class'}
            </Button>
            {/* Visible, not a tooltip: touch has no hover, and "This
                conversation will not" is the sentence that matters. */}
            <Text className="text-right text-xs text-fg-muted">{announceHint}</Text>
          </View>
        ) : null}
      </View>
      {error ? (
        <View className="p-4">
          <ErrorAlert message={error} onRetry={load} />
        </View>
      ) : null}
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-3 px-4 py-4" keyboardShouldPersistTaps="handled">
        {hasMore ? (
          <View className="items-center">
            <Button size="sm" onPress={loadEarlier} disabled={loadingEarlier} loading={loadingEarlier}>
              {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </Button>
          </View>
        ) : null}
        {messages.length === 0 ? (
          <Text className="py-8 text-center text-sm text-fg-muted">No messages in this conversation yet. Send the first one below.</Text>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <View key={m.id} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
                {/* The bubble keeps its own tokens and its own radius; whose
                    it is shows by its side of the thread as well as its
                    colour. */}
                <View className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? 'bg-bubble-mine' : 'bg-bubble-theirs'}`}>
                  <Text className={`text-base ${mine ? 'text-bubble-mine-fg' : 'text-bubble-theirs-fg'}`}>{m.body}</Text>
                  <Text className={`mt-1 text-xs ${mine ? 'text-bubble-mine-meta' : 'text-bubble-theirs-meta'}`} style={{ fontVariant: ['tabular-nums'] }}>
                    {dateTime(m.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <View className="border-t border-edge bg-surface px-4 py-3">
        {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}
        {blockedReason ? (
          <View className="flex-row items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3">
            <Icon name="fa-circle-info" size={16} color={tokens['warning-icon']} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm text-warning-strong">{blockedReason} You can still read this conversation.</Text>
          </View>
        ) : (
          // The composer: the field and Send are both 48dp. The field grows
          // with the draft up to its cap, and Send stays level with its last
          // line. The field's accessible name is its label, not its
          // placeholder.
          <View className="flex-row items-end gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message…"
              placeholderTextColor={tokens['fg-muted']}
              multiline
              accessibilityLabel="Message"
              className="max-h-32 min-w-0 flex-1 rounded-xl border border-edge-strong bg-surface px-4 py-3 font-sans text-base text-fg"
              style={{ minHeight: 48 }}
            />
            <Button
              variant="primary"
              icon="fa-paper-plane"
              onPress={send}
              disabled={sending || !draft.trim()}
              loading={sending}
              accessibilityLabel="Send"
            >
              Send
            </Button>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
