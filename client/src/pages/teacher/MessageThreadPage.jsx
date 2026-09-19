import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../auth/AuthContext';
import { useSocket } from '../../realtime/SocketProvider';
import { useUnread } from '../../realtime/UnreadProvider';
import { usePageTitle } from '../../layout/usePageTitle';

// One conversation.
//
// NO OPTIMISTIC APPEND — convention 5b in its messaging shape. The composer
// holds an unsent draft in its own state; `messages` holds ONLY server-returned
// rows. A sent message appears after the POST resolves, using the row the API
// returned. Appending optimistically would put an unsent message into the list
// that renders stored messages, and a failed POST would leave a message on
// screen that does not exist — which in a parent-teacher channel is the one
// failure that cannot be tolerated.
//
// HISTORY SURVIVES A SCOPE CHANGE, NEW MESSAGES DO NOT. GET /with/:userId is
// participant-scoped and deliberately NOT re-checked against canMessage(), so a
// thread stays readable after a teacher's assignment changes — but POST would
// 403. When that happens the composer is disabled with the server's own reason
// and the history stays. That asymmetry is intentional in the API.
//
// ANNOUNCE TO A CLASS sits on this thread, not the list. The list has no draft
// and no section — a button there would be a second door into the empty compose
// that already exists. Draft only; never the last incoming message.
//
// NAMING THE CLASS comes from GET /messages/contacts (2026-09-13), the only
// messages endpoint that carries the child's class — GET /with/:userId and
// GET /conversations still carry none. The row for otherId is fetched once per
// thread in its own effect, NOT inside load(): load() re-runs on every socket
// message for this thread, so a contacts call there would refetch once per
// incoming message. The contacts call never touches loading/error — the thread
// must render if contacts fails.
//
// Named ONLY when the row is a parent row with student_name and a class. Every
// other case falls back to "Announce to a class" with no target: contacts not
// loaded yet, contacts failed, a teacher/admin thread (class null), or no row
// at all — a deactivated parent, or scope changed and the history is still
// readable. Do not preselect a class for a parent you can no longer reach.
//
// The target is trusted by construction: contacts' parent rows and
// useTeacherTargets both derive from teacher_assignments grade+section and
// sections.adviser_id, and PUT /students refuses the class change that would
// split them. The client PRESELECTS; it does not authorize — Announcements
// re-validates against its own target list and the server decides on POST.
// Do not reconstruct the class by matching student_name to GET /students — two
// students can share a name.

export default function MessageThreadPage() {
  const { userId } = useParams();
  const otherId = Number(userId);
  const navigate = useNavigate();
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

  // forId !== otherId is the "not loaded" state, so the effect below never
  // sets state synchronously on a thread change.
  const [contactInfo, setContactInfo] = useState({ forId: null, failed: false, row: null });

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

      // Clearing unread is a REQUEST, never a local decrement — the server owns
      // the count, and a client-side number that drifts from read_status is the
      // same defect as the attendance RECORDED column (convention 5b).
      if (rows.some((m) => m.receiver_id === user?.id && !m.read_status)) {
        await api.patch(`/messages/read-all/${otherId}`, {}, { unwrap: 'count' });
        // Tell the badge in Shell that the SERVER changed. Without this signal
        // the badge could only ever be right on a full page load — the defect
        // found in browser review. It re-reads the count; nothing decrements
        // it locally (convention 5b).
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

  // Only react to messages belonging to THIS thread; anything else is the
  // conversation list's business.
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

  // Its own effect keyed on otherId — see the header for why not inside load().
  useEffect(() => {
    let cancelled = false;
    api
      .get('/messages/contacts', { unwrap: 'contacts' })
      .then((rows) => {
        if (cancelled) return;
        setContactInfo({
          forId: otherId,
          failed: false,
          row: rows.find((c) => c.id === otherId) || null,
        });
      })
      .catch(() => {
        // Not surfaced: the unnamed button is the honest fallback, and a
        // contacts failure must not read as the conversation being broken.
        if (!cancelled) setContactInfo({ forId: otherId, failed: true, row: null });
      });
    return () => {
      cancelled = true;
    };
  }, [otherId]);

  const contactRow = contactInfo.forId === otherId ? contactInfo.row : null;
  const announceClass =
    contactRow?.student_name && contactRow.student_grade_level != null && contactRow.student_section
      ? {
          key: `${contactRow.student_grade_level}|${contactRow.student_section}`,
          label: `Grade ${contactRow.student_grade_level} - ${contactRow.student_section}`,
        }
      : null;
  // §5i: the named hint is only shown when Announcements will open with that
  // section selected. The last sentence stays in both — it is what stops a
  // teacher believing the announcement answers this parent.
  const announceHint = announceClass
    ? `Opens an announcement to ${announceClass.label}, already selected. Every parent in that section will see it. This conversation will not.`
    : 'Opens a class announcement. Every parent in the section you pick will see it. This conversation will not.';

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
      // The row the SERVER returned, appended after it confirmed.
      setMessages((rows) => [...rows, sent]);
      setDraft('');
    } catch (err) {
      const message = extractError(err);
      if (err?.response?.status === 403) {
        // canMessage() refused: this pairing is no longer permitted. History
        // stays readable; only sending stops.
        setBlockedReason(message);
      } else {
        // Draft is preserved deliberately — a teacher should not retype a
        // message because the network blipped.
        setSendError(message);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingSpinner className="py-16" label="Loading conversation…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/teacher/messages"
          className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg"
        >
          <i className="fa-solid fa-arrow-left" />
          All conversations
        </Link>
        <button
          type="button"
          title={announceHint}
          onClick={() =>
            navigate('/teacher/announcements', {
              state: {
                compose: announceClass
                  ? { content: draft.trim(), target: announceClass.key }
                  : { content: draft.trim() },
              },
            })
          }
          className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-secondary transition hover:bg-surface-muted"
        >
          {announceClass ? `Announce to ${announceClass.label}` : 'Announce to a class'}
        </button>
      </div>
      {/* Visible, not only the title tooltip: hover does not exist on touch,
          and "This conversation will not" is the sentence that stops a
          teacher believing they replied to the parent (§3's rule). */}
      <p className="-mt-2 text-right text-xs text-fg-muted">{announceHint}</p>

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
                      {String(m.created_at).slice(0, 16).replace('T', ' ')}
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
