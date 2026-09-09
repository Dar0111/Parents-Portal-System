import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
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
      const rows = await api.get(`/messages/with/${otherId}`, { unwrap: 'messages' });
      setMessages(rows);

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
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

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
        className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <i className="fa-solid fa-arrow-left" />
        All conversations
      </Link>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <p className="font-semibold text-slate-900">{other?.name || 'Conversation'}</p>
          {other?.role ? <p className="text-xs text-slate-500">{other.role}</p> : null}
        </div>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No messages in this conversation yet. Send the first one below.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[11px] ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                      {String(m.created_at).slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="border-t border-slate-200 px-5 py-3">
          {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}

          {blockedReason ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {blockedReason} You can still read this conversation.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
