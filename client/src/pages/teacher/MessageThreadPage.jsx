import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import { dateTime } from '../../format/date';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import { controlClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import { enterKeyAction } from '../../components/enterToSend';
import { useAuth } from '../../auth/AuthContext';
import { threadContext } from '../../drafts/draftCore';
import { loadDraft } from '../../drafts/sessionDrafts';
import { useDraftAutosave } from '../../drafts/useDraft';
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
//
// NO ENTRANCE, AND NOTHING MOVES WHEN A MESSAGE ARRIVES (feat/ui-refresh,
// 2026-10-02) — the same decision as the parent's thread. `load()` runs on
// every socket message and puts the page through its loading state, so an
// entrance on this page would replay each time someone writes: motion on
// arrival, which this app does not have. The root is a plain div.

// The composer's draft is the `message` form's only field.
const MESSAGE_BASE = Object.freeze({ body: '' });

// What this account kept for the conversation with `otherId`, or ''. Text
// that is empty after trimming is not a draft (build 1 follow-up): it is
// neither restored nor announced as "Draft restored".
function keptMessage(myId, otherId) {
  const record = loadDraft({ userId: myId, form: 'message', context: threadContext(otherId) });
  const body = record ? record.values.body : '';
  return typeof body === 'string' && body.trim() ? body : '';
}

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

  const [sending, setSending] = useState(false);
  // THE IN-FLIGHT GUARD (build 1 fix round, 2026-10-05): set the moment a send
  // starts, cleared when it settles. `sending` is state and drives the button,
  // but two submits before the next render would both read it as false; a
  // ref cannot be stale, so one send at a time holds for Enter and Send alike.
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState(null);
  const [blockedReason, setBlockedReason] = useState(null);

  // THE COMPOSER KEEPS A DRAFT PER CONVERSATION (feat/form-drafts, 2026-10-04;
  // FRONTEND §28) — the parent thread's rules: kept in this tab under this
  // account's numeric id and the other person's (`thread-<id>`); it survives
  // a reload, a failed send and the spinner swap; it is removed on a
  // confirmed send, a confirmed Discard draft and logout; a blocked
  // conversation keeps it. The page instance is reused across :userId, so
  // the composer switches to that conversation's own draft here, in render.
  // "Announce to" hands the text on with this conversation's id
  // (`fromThread`); the announcement clears this draft once it posts.
  const myId = user?.id ?? null;
  const [draftFor, setDraftFor] = useState(otherId);
  const [draft, setDraft] = useState(() => keptMessage(myId, otherId));
  const [draftRestored, setDraftRestored] = useState(() => keptMessage(myId, otherId) !== '');
  if (draftFor !== otherId) {
    const kept = keptMessage(myId, otherId);
    setDraftFor(otherId);
    setDraft(kept);
    setDraftRestored(kept !== '');
  }
  const composerValues = useMemo(() => ({ body: draft }), [draft]);
  const messageDraft = useDraftAutosave({
    userId: myId,
    form: 'message',
    context: threadContext(otherId),
    values: composerValues,
    base: MESSAGE_BASE,
    active: draftFor === otherId && !blockedReason,
  });

  // The message LIST, not a marker at its end: the list scrolls itself
  // (finding #11, below). And the composer, so a send by the Send button
  // hands the focus back to it.
  const listRef = useRef(null);
  const composerRef = useRef(null);
  const sentIdRef = useRef(null);

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

  // THE OTHER PERSON, from a message that CARRIES their name (feat/look-fixes).
  // A just-sent message is the POST's row, which has no names; in a new thread
  // it was the only row, so `other.name` was undefined and the header fell
  // back to the nav's "Messages". Only a row with the name counts now.
  const other = useMemo(() => {
    const row = messages.find((m) => (m.sender_id === otherId && m.sender_name) || (m.receiver_id === otherId && m.receiver_name));
    if (!row) return null;
    return row.sender_id === otherId
      ? { name: row.sender_name, role: row.sender_role }
      : { name: row.receiver_name, role: row.receiver_role };
  }, [messages, otherId]);

  // A NEW THREAD IS TITLED WITH THE PERSON'S NAME (owner-approved copy): the
  // New-message picker hands the contact's name over in router state, so the
  // header names them before the first message exists. Router state, never
  // the URL (§5c: the URL carries users.id only).
  const location = useLocation();
  const pickedName = typeof location.state?.name === 'string' && location.state.name ? location.state.name : null;

  usePageTitle(other?.name || pickedName || 'Conversation');

  const load = useCallback(async () => {
    // THE SPINNER IS FOR A THREAD'S FIRST LOAD ONLY (feat/look-fixes): this
    // runs on every incoming message, and swapping the whole page to the
    // spinner each time blinked the thread out and took focus from the
    // composer. Now it shows while this thread has never loaded, or while it
    // is empty — the phone's rule (MessageThreadScreen) — and a re-read keeps
    // the list on screen.
    setLoading(loadedForRef.current !== otherId || messagesRef.current.length === 0);
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
      // A failed RE-READ keeps the list (the error shows above it, with its
      // Retry); only a thread that never loaded is left empty.
      if (loadedForRef.current !== otherId) setMessages([]);
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
  //
  // THE LIST SCROLLS ITSELF, NEVER THE PAGE (finding #11, 2026-10-05). This
  // was `scrollIntoView({ block: 'end' })` on a marker at the list's end,
  // which scrolls EVERY scrollable ancestor — the document too — to line the
  // marker up with the bottom of the window, so after a send by Enter the
  // page jumped and the composer under the list left the view. Setting the
  // list's own scrollTop moves only the 28rem list.
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
      // My own send, now on screen: the composer gets the focus back (a
      // click on Send leaves it on the button, which is disabled mid-send),
      // and `preventScroll` keeps that from moving the page either.
      if (lastId !== null && lastId === sentIdRef.current) {
        sentIdRef.current = null;
        composerRef.current?.focus({ preventScroll: true });
      }
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
  // "ANNOUNCE TO A CLASS" IS FOR A PARENT'S THREAD ONLY (2026-10-05). It
  // exists to stop a teacher answering one parent by hand when the whole
  // class needs the answer; a thread with another teacher or with the admin
  // has no class behind it. The role comes from a message that names the
  // other person, else from their contacts row; while neither has loaded the
  // button stays away rather than flashing on a thread that is not a
  // parent's.
  const otherIsParent = (other?.role || contactRow?.role) === 'parent';
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
    // One send at a time, whichever way it was asked for (Send or Enter).
    if (sending) return;
    if (sendingRef.current) return;
    const body = draft.trim();
    if (!body) return;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const sent = await api.post(
        '/messages',
        { receiver_id: otherId, body },
        { unwrap: 'data' }
      );
      // The row the SERVER returned, appended after it confirmed.
      sentIdRef.current = sent.id;
      setMessages((rows) => [...rows, sent]);
      // The server confirmed: the draft goes (Send and Enter alike).
      messageDraft.submitted(composerValues);
      setDraft('');
      setDraftRestored(false);
    } catch (err) {
      const message = extractError(err);
      if (err?.response?.status === 403) {
        // canMessage() refused: this pairing is no longer permitted. History
        // stays readable; only sending stops.
        setBlockedReason(message);
      } else {
        // Draft is preserved deliberately — a teacher should not retype a
        // message because the network blipped. Back to the composer,
        // without moving the page.
        setSendError(message);
        composerRef.current?.focus({ preventScroll: true });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  // After the inline "Discard this draft?" was confirmed (DraftNotice).
  function discardDraft() {
    messageDraft.discard();
    setDraft('');
    setDraftRestored(false);
  }

  if (loading) return <LoadingSpinner className="py-16" label="Loading conversation…" />;

  return (
    <div className="space-y-4">
      {/* The way back, and the way out to an announcement, with the sentence
          that says what that button does NOT do kept directly under it. */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* A 44px-tall target with the shared keyboard outline; the arrow
              is decoration. */}
          <Link
            to="/teacher/messages"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
          >
            <span aria-hidden="true" className="flex items-center justify-center">
              <i className="fa-solid fa-arrow-left" />
            </span>
            All conversations
          </Link>
          {otherIsParent ? (
            <Button
              icon="fa-bullhorn"
              title={announceHint}
              onClick={() =>
                navigate('/teacher/announcements', {
                  state: {
                    compose: announceClass
                      ? { content: draft.trim(), target: announceClass.key, fromThread: otherId }
                      : { content: draft.trim(), fromThread: otherId },
                  },
                })
              }
            >
              {announceClass ? `Announce to ${announceClass.label}` : 'Announce to a class'}
            </Button>
          ) : null}
        </div>
        {/* Visible, not only the title tooltip: hover does not exist on touch,
            and "This conversation will not" is the sentence that stops a
            teacher believing they replied to the parent (§3's rule). Under
            the button it explains: right-aligned from `sm`, where the button
            sits on the right; left-aligned on a phone, where the button has
            wrapped to the left. It goes with the button. */}
        {otherIsParent ? <p className="text-xs text-fg-muted sm:text-right">{announceHint}</p> : null}
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <div className={cardClass}>
        {/* Who the conversation is with. The circle is initials — a message
            row carries the other person's name and role but no photo. The
            role is re-cased for display only (§5d). A NEW thread names them
            from the picker until a message carries the name (build 1 fix
            round), as the page title already did; the role line waits for
            that message. */}
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3 sm:px-5">
          <Avatar name={other?.name || pickedName} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-serif text-base font-bold text-fg">{other?.name || pickedName || 'Conversation'}</h2>
            {other?.role ? <p className="text-xs capitalize text-fg-muted">{other.role}</p> : null}
          </div>
        </div>

        <div ref={listRef} className="max-h-[28rem] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
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
                      {/* `dateTime` — the one place the time of day matters.
                          The old slice printed the UTC instant as if it were
                          local: 07:00 PH read "2026-09-24 23:00", wrong day
                          and wrong hour. */}
                      {dateTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={send} className="border-t border-edge px-4 py-3 sm:px-5">
          {sendError ? <ErrorAlert message={sendError} className="mb-3" /> : null}
          {draftRestored && draft && !blockedReason ? (
            <DraftNotice kind="message" onDiscard={discardDraft} className="mb-3" />
          ) : null}

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
                ref={composerRef}
                rows={2}
                aria-label="Write a message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends through the form, exactly as Send does, and
                  // never types a new line — a held key, an empty box or a
                  // send in flight does nothing; Shift+Enter is the new line
                  // (§26).
                  const action = enterKeyAction(e, { sending, draft });
                  if (!action) return;
                  e.preventDefault();
                  if (action === 'send') e.currentTarget.form?.requestSubmit();
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
