import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import { ThreadSkeleton } from '../../components/SkeletonShapes';
import Text from '../../components/Text';
import { threadContext } from '../../drafts/draftCore';
import { useDeviceDraft } from '../../drafts/useDraft';
import { dateTime } from '../../format/date';
import useSkeleton from '../../hooks/useSkeleton';
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
// ONE THREAD SCREEN FOR EVERY ROLE (branch 3; the admin since 2026-10-05).
// The teacher's thread adds exactly one thing, "Announce to a class", and it
// is ROLE-GATED here rather than a second thread file — on a PARENT'S thread
// only, never a teacher's or the admin's: the button opens the ONE composer
// (AnnouncementCompose) with the UNSENT DRAFT — never the last incoming
// message — and a target only when the contacts row for this thread is a
// parent row carrying the child's class. GET /messages/contacts is the one
// messages endpoint with a class, fetched ONCE per thread in its own effect
// (load() re-runs on every socket message). The client PRESELECTS; the
// composer re-validates and the server decides. "This conversation will
// not" is the sentence that stops a teacher believing they replied.
//
// THE LOOK (feat/ui-refresh), as the web's thread: a bar that says who the
// conversation is with, the bubbles on their own tokens
// with the message at reading size, and a composer whose field and Send are
// both 48dp (set in dp — M19; the field through a plain style object, never a
// style function — M20). The circle is initials: a message row carries the
// other person's name but no photo.
//
// NO ENTRANCE, AND NOTHING MOVES WHEN A MESSAGE ARRIVES. `load()` runs on
// every socket message, so motion here would be motion on arrival, which
// this app does not have.
//
// PULL TO REFRESH (on the messages) is `load` itself — the same request a
// socket message triggers, with the same merge: the earlier pages already on
// screen, the unsent draft and a blocked composer all survive it. `load`
// keeps the thread on screen while it re-reads (only the first read shows the
// full-screen spinner), so the pull carries its own busy flag.
//
// THE COMPOSER KEEPS A DRAFT PER CONVERSATION ON THIS PHONE (feat/form-drafts,
// 2026-10-04; MOBILE M25) under this account's numeric id and the other
// person's (`thread-<id>`). It survives a killed app, a failed send and every
// re-read; it comes back when this conversation opens again, with the notice;
// it is removed when the server confirms a send, on a confirmed Discard draft
// and on logout. A blocked conversation (403) keeps it. "Announce to" hands
// the text on with this conversation's id (`fromThread`); the announcement
// clears this draft once it posts.
const MESSAGE_BASE = Object.freeze({ body: '' });

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  // THE IN-FLIGHT GUARD (build 1 fix round, 2026-10-05), the web's: set the
  // moment a send starts, cleared when it settles. `sending` is state and
  // drives the button, but two taps before the next render would both read it
  // as false; a ref cannot be stale.
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);

  // The draft. A changed `otherId` (the screen reused for another
  // conversation) empties the box here, in render, before that
  // conversation's own draft is read — never one conversation's text in
  // another's box.
  const [draftFor, setDraftFor] = useState(otherId);
  const [draft, setDraft] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  if (draftFor !== otherId) {
    setDraftFor(otherId);
    setDraft('');
    setDraftRestored(false);
  }
  const composerValues = useMemo(() => ({ body: draft }), [draft]);
  const restoreDraft = useCallback((record) => {
    if (!record) return;
    setDraft(record.values.body);
    setDraftRestored(true);
  }, []);
  const messageDraft = useDeviceDraft({
    userId: user?.id ?? null,
    form: 'message',
    context: threadContext(otherId),
    values: composerValues,
    base: MESSAGE_BASE,
    active: draftFor === otherId && !blockedReason,
    onRestore: restoreDraft,
  });
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const scrollRef = useRef(null);
  const messagesRef = useRef([]);
  const loadedForRef = useRef(null);
  // Where the list was last put at its end (feat/shared-messages): the newest
  // message's id then, and the thread it belonged to. The pending move is a
  // ref so a later render that decides NOT to move cannot cancel it.
  const lastIdRef = useRef(null);
  const positionedForRef = useRef(null);
  const toEndTimerRef = useRef(null);

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

  // "ANNOUNCE TO A CLASS" IS FOR A TEACHER ON A PARENT'S THREAD ONLY
  // (2026-10-05, the web's rule): a thread with another teacher or with the
  // admin has no class behind it. The role comes from a message that names
  // the other person, else from their contacts row; until one has loaded the
  // button stays away rather than flashing on a thread that is not a
  // parent's.
  const showAnnounce = isTeacher && (other?.role || contactRow?.role) === 'parent';

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
      // A failed RE-READ keeps the messages (the error shows above them, with
      // its Try again); only a thread that never loaded is left empty — the
      // web's rule (feat/shared-messages).
      if (loadedForRef.current !== otherId) setMessages([]);
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

  // THE LIST GOES TO ITS END ONLY WHEN THE NEWEST MESSAGE CHANGES, AND NEVER
  // BEFORE IT IS ON SCREEN (feat/shared-messages, 2026-10-11; the web's rule,
  // FRONTEND §30). It used to move 50 ms after ANY change in the number of
  // messages, which did two wrong things:
  //   - a thread with unread messages keeps the full-screen spinner up while
  //     read-all and the badge refresh are awaited, so the move often fired
  //     with no list mounted, and nothing moved it once the list appeared —
  //     the thread opened at its OLDEST message (the web's F1, 2026-10-06);
  //   - "Load earlier messages" adds rows, so it threw the reader to the end.
  // Now nothing is consumed until the list is mounted and holds THIS thread's
  // messages; the first time it does (open, or another thread on the reused
  // screen) the list goes to the end, and after that only a new newest
  // message — one that arrived, or my own send — moves it.
  useEffect(() => {
    if (loading || loadedForRef.current !== otherId || !scrollRef.current) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const opening = positionedForRef.current !== otherId;
    if (!opening && lastId === lastIdRef.current) return;
    positionedForRef.current = otherId;
    lastIdRef.current = lastId;
    // 50 ms, as before: the new rows are laid out first.
    clearTimeout(toEndTimerRef.current);
    toEndTimerRef.current = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [messages, loading, otherId]);

  useEffect(() => () => clearTimeout(toEndTimerRef.current), []);

  // The pull's own handler: `load()` as it is, with a busy flag around it for
  // the pull spinner alone.
  async function pullToRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
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
    if (sendingRef.current || sending) return;
    const body = draft.trim();
    if (!body) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const sent = await api.post('/messages', { receiver_id: otherId, body }, { unwrap: 'data' });
      setMessages((rows) => [...rows, sent]);
      // The server confirmed: the draft goes.
      messageDraft.submitted(composerValues);
      setDraft('');
      setDraftRestored(false);
    } catch (err) {
      const message = extractError(err);
      if (err?.response?.status === 403) setBlockedReason(message);
      else setSendError(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  // After "Discard this draft?" was confirmed (DraftNotice's Alert).
  function discardDraft() {
    messageDraft.discard();
    setDraft('');
    setDraftRestored(false);
  }

  // THE SKELETON, NOT A SPINNER (feat/skeleton-tier2-phone): the bar, the
  // bubbles and the box, on the same `loading` — a first load or an empty
  // thread, never a re-read. The list is not mounted while it shows, so the
  // positioning effect above waits for it exactly as it waited for the spinner.
  const phase = useSkeleton(loading);
  if (loading) return <ThreadSkeleton phase={phase} />;

  return (
    // `padding` ON ANDROID TOO (re-check 2 finding, 2026-09-27): with
    // edge-to-edge, Android no longer resizes the window for the keyboard, so
    // the composer sat behind it. The frame's bottom inset and this padding
    // add up to exactly the keyboard's height (M11).
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-page">
      {/* WHO THE CONVERSATION IS WITH. The teacher's one extra, "Announce to
          a class", sits under it in the same bar — on a parent's thread
          only. */}
      <View className="gap-2 border-b border-edge bg-surface px-4 py-2">
        <View className="flex-row items-center gap-3">
          <Avatar name={other?.name || route.params.name} />
          <Text accessibilityRole="header" className="min-w-0 flex-1 font-serif text-base text-fg">
            {other?.name || route.params.name || 'Conversation'}
          </Text>
        </View>
        {showAnnounce ? (
          <View className="gap-1">
            <Button
              size="sm"
              className="self-end"
              accessibilityHint={announceHint}
              onPress={() =>
                navigation.navigate(
                  'AnnouncementCompose',
                  announceClass
                    ? { content: draft.trim(), target: announceClass.key, fromThread: otherId }
                    : { content: draft.trim(), fromThread: otherId }
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
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
      >
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
        {draftRestored && draft && !blockedReason ? <DraftNotice kind="message" onDiscard={discardDraft} className="mb-3" /> : null}
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
