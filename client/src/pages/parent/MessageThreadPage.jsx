import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import { dateTime } from '../../format/date';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ErrorAlert from '../../components/ErrorAlert';
import { controlClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import ReloadButton from '../../components/ReloadButton';
import { cardClass } from '../../components/buttonClass';
import { shouldSendOnEnter } from '../../components/enterToSend';
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
//
// NO ENTRANCE, AND NOTHING MOVES WHEN A MESSAGE ARRIVES (feat/ui-refresh).
// `load()` runs on every socket message and puts the page through its
// loading state, so an entrance on this page would replay each time someone
// writes — motion on arrival, which this app does not have. The root is a
// plain div.
//
// RELOAD is `load` itself, in the conversation's header: the same request a
// socket message triggers, with the same merge — the earlier pages already
// on screen, the unsent draft and a blocked composer all survive it.

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
    // One send at a time, whichever way it was asked for (Send or Enter).
    if (sending) return;
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
      {/* A 44px-tall target with the shared keyboard outline; the arrow is
          decoration. */}
      <Link
        to="/parent/messages"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          <i className="fa-solid fa-arrow-left" />
        </span>
        All conversations
      </Link>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <div className={cardClass}>
        {/* Who the conversation is with, and its Reload. The circle is
            initials — a message row carries the other person's name and role
            but no photo. */}
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3 sm:px-5">
          <Avatar name={other?.name} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-serif text-base font-bold text-fg">{other?.name || 'Conversation'}</h2>
            {other?.role ? <p className="text-xs capitalize text-fg-muted">{other.role}</p> : null}
          </div>
          <ReloadButton onReload={load} loading={loading} label="Reload conversation" compact />
        </div>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {hasMore ? (
            <div className="flex justify-center">
              <Button size="sm" onClick={loadEarlier} disabled={loadingEarlier}>
                {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
              </Button>
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
                  {/* The bubble keeps its own tokens and its own radius. Up
                      to 85% of the row on a phone, 75% from `sm`; a long
                      unbroken string wraps inside it rather than widening the
                      thread. */}
                  <div
                    className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[75%] ${
                      mine ? 'bg-bubble-mine text-bubble-mine-fg' : 'bg-bubble-theirs text-bubble-theirs-fg'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[0.6875rem] tabular-nums ${mine ? 'text-bubble-mine-meta' : 'text-bubble-theirs-meta'}`}>
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

        <form onSubmit={send} className="border-t border-edge px-4 py-3 sm:px-5">
          {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}

          {blockedReason ? (
            <p className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
              <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
                <i className="fa-solid fa-circle-info" />
              </span>
              <span className="min-w-0">{blockedReason} You can still read this conversation.</span>
            </p>
          ) : (
            // The composer: the shared control (44px minimum, the shared
            // focus ring) beside a 44px Send. The field's accessible name is
            // its aria-label — a placeholder is not a label.
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                aria-label="Write a message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends through the form, exactly as Send does;
                  // Shift+Enter is a new line (§26).
                  if (!shouldSendOnEnter(e, { sending, draft })) return;
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }}
                placeholder="Write a message…"
                className={`${controlClass} min-w-0 flex-1`}
              />
              <Button
                type="submit"
                variant="primary"
                icon="fa-paper-plane"
                loading={sending}
                disabled={sending || !draft.trim()}
                className="shrink-0"
              >
                Send
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
