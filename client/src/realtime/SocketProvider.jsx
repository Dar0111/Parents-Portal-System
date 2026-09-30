import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { TOKEN_KEY } from '../api/axios';
import { SOCKET_ORIGIN } from '../api/apiBase';
import { useAuth } from '../auth/AuthContext';

// The one Socket.io connection for the whole app.
//
// A CONTEXT, not a per-page hook: a teacher reading the Students page should
// still have their unread badge update, and a hook would mean one connection
// per mounting page. Mounted inside Shell, so it exists exactly while a user
// is logged in and rendering the app chrome.
//
// WHAT THE SERVER ACTUALLY DOES (server/socket.js, routes/messages.js):
//   - authenticates the CONNECTION, once, from handshake.auth.token, and
//     re-reads users.status from the DB — a deactivated account never gets a
//     live socket
//   - auto-joins room `user:<id>`; there is NO join event to call
//   - emits exactly one event, `new_message`, to the RECIPIENT's room only —
//     never to the sender, never a broadcast
//   - no socket event accepts a write; REST is the only way in
//
// SO THE SOCKET IS A LATENCY OPTIMISATION, NOT THE DELIVERY MECHANISM. A
// message to an offline recipient is simply not emitted — the room is empty
// and the emit is a no-op — but nothing is lost, because POST /api/messages
// persisted it before emitting. The recipient sees it on their next fetch.
//
// DEGRADATION — see CLAUDE.md convention 5g. When the connection is down we
// SAY SO and fall back to explicit refresh. We do not poll. Polling would burn
// requests to disguise a state the user should simply know about, and a
// channel that looks live while silently delivering nothing is worse in a
// parent-teacher context than one that admits it is paused.

const SocketContext = createContext({
  connected: false,
  subscribe: () => () => {},
  subscribeNotifications: () => () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export default function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);

  // Listeners are kept in a ref so subscribing does not re-create the socket,
  // and so a page mounting/unmounting never disturbs the connection itself.
  const listenersRef = useRef(new Set());
  // A SECOND set, for `notification_counts` (N2, 2026-09-19). Deliberately a
  // separate set rather than an event name passed to subscribe(): making
  // subscribe() generic would change a signature UnreadProvider already uses,
  // for no gain today, and the two channels mean different things — one
  // carries a message, the other carries nothing at all and means "refetch".
  const notifListenersRef = useRef(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return undefined;

    // The HTTP server root, not the /api mount — from the one API-base
    // decision in api/apiBase.js (feat/lan-web), so the socket always talks
    // to the same host as every request.
    const socket = io(SOCKET_ORIGIN, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('new_message', (message) => {
      for (const fn of listenersRef.current) fn(message);
    });

    // Carries NO payload, on purpose (server/utils/notify.js says so at the
    // emit): it means "the server changed your notifications, go and read the
    // counts again". Nothing here computes a count from a pushed value — that
    // is convention 5b one component out, and the defect UnreadProvider's own
    // header records from 2026-09-07.
    socket.on('notification_counts', () => {
      for (const fn of notifListenersRef.current) fn();
    });

    return () => {
      // Logout clears `user`, which lands here — the socket is torn down rather
      // than left open and authenticated after the session ends.
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id]);

  const value = useMemo(
    () => ({
      connected,
      // Returns an unsubscribe function. Pages use this rather than touching
      // the socket, so no page can accidentally emit or re-listen globally.
      subscribe(fn) {
        listenersRef.current.add(fn);
        return () => listenersRef.current.delete(fn);
      },
      // The same contract for the notifications channel. `fn` takes no
      // argument — there is nothing to hand it.
      subscribeNotifications(fn) {
        notifListenersRef.current.add(fn);
        return () => notifListenersRef.current.delete(fn);
      },
    }),
    [connected]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
