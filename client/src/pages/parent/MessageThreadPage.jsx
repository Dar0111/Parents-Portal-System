import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import { dateTime } from '../../format/date';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../auth/AuthContext';
import { useSocket } from '../../realtime/SocketProvider';
import { useUnread } from '../../realtime/UnreadProvider';
import { usePageTitle } from '../../layout/usePageTitle';

// One conversation. Copied from Teacher → MessageThreadPage with the back
// link pointed at /parent/messages. Extract when Admin is the third copy —
// the socket / unread-refresh / 403-composer logic is identical and must
// not drift, but this dispatch does not touch the teacher file.
//
// NO OPTIMISTIC APPEND — convention 5b. The composer holds an unsent draft;
// `messages` holds ONLY server-returned rows.
//
// HISTORY SURVIVES A SCOPE CHANGE, NEW MESSAGES DO NOT. GET /with/:userId
// is participant-scoped; POST re-checks canMessage(). A 403 disables send
// and keeps the history. :userId is users.id, never an LRN (§5c).

export default function ParentMessageThreadPage() {
  const { userId } = useParams();
  const otherId = Number(userId);
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { refresh: refreshUnread } = useUnread();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);

  const bottomRef = useRef(null);

  // C3 (2026-09-19): the thread pages on a cursor. load() fetches the TAIL
  // (the newest page) and merges it over what is already on screen, so a
  // socket-triggered reload never discards pages the user scrolled back to;
  // loadEarlier() asks for the page before the oldest row on screen.
  // messagesRef mirrors `messages` for the merge; loadedForRef says which
  // thread it belongs to, so a thread change starts from nothing.
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const messagesRef = useRef([]);
  const loadedForRef = useRef(null);
  const lastIdRef = useRef(null);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const other = useMemo(() => {
    const row = messages.find((m) => m.sender_id === otherId || m.receiver_id === otherId);
    if (!row) return null;
    return row.sender_id === otherId
      ? { name: row.sender_name, role: row.sender_role }
      : { name: row.receiver_name, role: row.receiver_role };
  }, [messages, otherId]);

  usePageTitle(other ? other.name : 'Conversation');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(`/messages/with/${otherId}`, { unwrap: ['messages', 'page'] });
      const rows = result.messages;
      const previous = loadedForRef.current === otherId ? messagesRef.current : [];
      const oldestInTail = rows[0]?.id;
      const kept = oldestInTail === undefined ? [] : previous.filter((m) => m.id < oldestInTail);
      loadedForRef.current = otherId;
      setMessages([...kept, ...rows]);
      // has_more describes the tail; once earlier pages are on screen the
      // value from loadEarlier() is the current one.
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

  // Scroll to the bottom only when the NEWEST message changed — a page
  // prepended by loadEarlier() leaves the last id alone and must not yank
  // the reader back down.
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  async function loadEarlier() {
    const oldest = messages[0]?.id;
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    setError(null);
    try {
      const result = await api.get(`/messages/with/${otherId}`, {
        unwrap: ['messages', 'page'],
        params: { before: oldest },
      });
      setMessages((prev) => [...result.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(Boolean(result.page?.has_more));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!draft.trim()) return;

    setSending(true);
    setSendError(null);
    try {
      const sent = await api.post(
        '/messages',
        { receiver_id: otherId, body: draft.trim() },
        { unwrap: 'data' }
      );
      setMessages((rows) => [...rows, sent]);
      setDraft('');
    } catch (err) {
      const message = extractError(err);
      if (err?.response?.status === 403) {
        setBlockedReason(message);
      } else {
        setSendError(message);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingSpinner className="py-16" label="Loading conversation…" />;

  return (
    <div className="space-y-4">
      <Link
        to="/parent/messages"
        className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg"
      >
        <i className="fa-solid fa-arrow-left" />
        All conversations
      </Link>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <div className="rounded-xl border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-3">
          <p className="font-semibold text-fg">{other?.name || 'Conversation'}</p>
          {other?.role ? <p className="text-xs text-fg-muted">{other.role}</p> : null}
        </div>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 py-4">
          {hasMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadEarlier}
                disabled={loadingEarlier}
                className="rounded-lg border border-edge-strong bg-surface px-3 py-1 text-xs font-medium text-fg-body transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              No messages in this conversation yet. Send the first one below.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? 'bg-bubble-mine text-bubble-mine-fg' : 'bg-bubble-theirs text-bubble-theirs-fg'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[0.6875rem] ${mine ? 'text-bubble-mine-meta' : 'text-bubble-theirs-meta'}`}>
                      {/* `dateTime`, the ONE place the time of day is the
                          point. The old slice printed the UTC instant as if
                          it were local: a message sent at 07:00 PH read
                          "2026-09-24 23:00" — wrong day AND wrong hour. */}
                      {dateTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="border-t border-edge px-5 py-3">
          {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}

          {blockedReason ? (
            <p className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-strong">
              {blockedReason} You can still read this conversation.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                className="block w-full rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-fg shadow-sm transition placeholder:text-fg-muted focus:border-focus-edge focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
              >
                {sending ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Send
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
