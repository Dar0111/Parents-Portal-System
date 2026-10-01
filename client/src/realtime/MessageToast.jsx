import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import { requestLeave } from '../layout/leaveGuard';
import { useSocket } from './SocketProvider';
import { useUnread } from './UnreadProvider';
import { TOAST_MS, createToastStore, otherIdFromPath, rowFor } from './messageToast';
import { createTonePlayer } from './messageTone';

// THE NEW-MESSAGE TOAST, web (feat/message-toast, 2026-10-02; FRONTEND §26).
//
// WHAT IT SHOWS: "New message from <name>" (or "<n> new messages from
// <name>") with View and a close button — never any part of the body. The
// decisions are messageToast.js (pure, mirrored to the phone); this file only
// renders them and runs the 5-second timer.
//
// WHERE THE NAME AND COUNT COME FROM: the live `new_message` event carries
// no name, so this remembers WHO sent it (sender_id only) and waits for the
// Unread provider's re-read of GET /messages/conversations — which every
// `new_message` already triggers — then takes that person's row: their name
// and the SERVER's unread count (§10: never client arithmetic). No second
// request, no server change, no notifications row: the bell stays
// message-free.
//
// TOKENS AND EXISTING PIECES ONLY (bg-surface, border-edge, text-fg, the
// primary small button, Avatar), so a restyle reaches it with no edit here.
//
// THE TONE (fix round, 2026-10-02): one short tone on a toast SHOW or UPDATE
// — never for a skip — through realtime/messageTone.js (Web Audio, one
// lazily created AudioContext, silent if the browser refuses). No mute
// setting and no new UI.

// The toast itself. Presentational, so the SSR proof can render it.
// `role="status"` sits on a box that is ALWAYS mounted, empty when there is
// no toast: a live region that appears already holding its text is not
// announced (the item 5b lesson, §21).
export function MessageToastView({ toast, onView, onDismiss, onPause, onResume }) {
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-[35] w-80 max-w-[calc(100vw-2rem)] sm:right-6">
      <div role="status" aria-live="polite">
        {toast ? (
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-edge bg-surface p-3 shadow-lg"
            onMouseEnter={onPause}
            onMouseLeave={onResume}
            onFocus={onPause}
            onBlur={onResume}
          >
            <Avatar name={toast.name} photo={toast.photo} />
            <p className="min-w-0 flex-1 text-sm font-medium text-fg">{toast.label}</p>
            <button
              type="button"
              onClick={onView}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
            >
              View
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded-lg p-1.5 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark" />
              <span className="sr-only">Dismiss</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The host: one per Shell, mounted only for a role whose Messages page is
// built (teacher, parent) — an admin gets no toast, because a notification
// must be openable (§10) and admin has no Messages page.
export default function MessageToast() {
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { subscribeConversations } = useUnread();
  const navigate = useNavigate();
  const location = useLocation();

  const [toast, setToast] = useState(null);
  const [paused, setPaused] = useState(false);
  // THE TOAST'S ONE HOME (fix round): every change — show, update, replace,
  // ×, the 5 s expiry, View — goes through this store, so the toast each
  // decision reads is never stale. `setToast` only mirrors it for rendering.
  const [store] = useState(() => createToastStore(setToast));
  // ONE tone player, so ONE AudioContext, created lazily on the first tone.
  const [tone] = useState(() => createTonePlayer());

  // Read inside socket / fetch callbacks, so they are refs, kept current by
  // effects that set no state.
  const pendingRef = useRef(null);
  const pathRef = useRef(location.pathname);
  const selfRef = useRef(user?.id);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    selfRef.current = user?.id;
  }, [user?.id]);

  // 1. A message arrived: remember who sent it — the sender's id, never the
  // body. The newest sender wins (owner rule 4).
  useEffect(
    () =>
      subscribe((message) => {
        pendingRef.current = message?.sender_id ?? null;
      }),
    [subscribe]
  );

  // 2. The Unread provider's re-read landed: decide from that person's row.
  useEffect(
    () =>
      subscribeConversations((rows) => {
        const senderId = pendingRef.current;
        if (senderId == null) return;
        pendingRef.current = null;
        // Decided OUTSIDE a setState updater, so the tone sounds once — React
        // may call an updater twice. `changed` is exactly a show or an update.
        const changed = store.receive({
          senderId,
          selfId: selfRef.current,
          viewingOtherId: otherIdFromPath(pathRef.current),
          row: rowFor(rows, senderId),
        });
        if (changed) tone.play();
      }),
    [subscribeConversations, store, tone]
  );

  // 3. The timer: 5 s, paused while hovered or focused, started again by
  // every new toast object (same sender with a new count, or a new sender).
  useEffect(() => {
    if (!toast || paused) return undefined;
    const timer = setTimeout(() => store.clear(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, paused, store]);

  const dismiss = useCallback(() => {
    store.clear();
    setPaused(false);
  }, [store]);

  // View goes to that conversation THROUGH the unsaved-changes guard
  // (layout/leaveGuard.js): on Grades or Attendance with unsaved work it asks
  // "Leave without saving?" first.
  const view = useCallback(() => {
    if (!toast) return;
    const path = `/${user?.role}/messages/${toast.senderId}`;
    requestLeave(() => {
      store.clear();
      setPaused(false);
      navigate(path);
    });
  }, [toast, user?.role, navigate, store]);

  return (
    <MessageToastView
      toast={toast}
      onView={view}
      onDismiss={dismiss}
      onPause={() => setPaused(true)}
      onResume={() => setPaused(false)}
    />
  );
}
