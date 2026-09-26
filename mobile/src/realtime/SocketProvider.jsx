import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { SOCKET_ORIGIN } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import * as tokenStore from '../auth/tokenStore';

// THE ONE SOCKET, on the phone (MOBILE_CONVENTIONS M10). Same contract as
// client/src/realtime/SocketProvider.jsx — the server authenticates the
// CONNECTION once from handshake.auth.token, joins `user:<id>`, emits two
// events to that room and accepts no writes; the socket is a latency
// optimisation, never the delivery path (§5g). No polling fallback.
//
// THREE THINGS A PHONE NEEDS THAT A BROWSER TAB DOES NOT:
//   1. `auth` is a FUNCTION, evaluated on every (re)connect, so a session
//      that came back through applyToken reconnects with the fresh token
//      rather than the one the first handshake used.
//   2. Android drops idle sockets in the background. An AppState listener
//      calls connect() on return to the foreground; socket.io's own
//      reconnection (infinite, backed off) covers the rest.
//   3. A reconnect may have MISSED a `notification_counts`. `subscribeConnect`
//      lets the two count providers refetch on every connect — a refetch,
//      never a count computed here (§10).
const SocketContext = createContext({
  connected: false,
  subscribe: () => () => {},
  subscribeNotifications: () => () => {},
  subscribeConnect: () => () => {},
  reconnect: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export default function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef(new Set());
  const notifListenersRef = useRef(new Set());
  const connectListenersRef = useRef(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    if (!tokenStore.get()) return undefined;

    const socket = io(SOCKET_ORIGIN, {
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      for (const fn of connectListenersRef.current) fn();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('new_message', (message) => {
      for (const fn of listenersRef.current) fn(message);
    });
    // Carries NO payload, on purpose: it means "re-read the counts".
    socket.on('notification_counts', () => {
      for (const fn of notifListenersRef.current) fn();
    });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !socket.connected) socket.connect();
    });

    return () => {
      appState.remove();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id]);

  const value = useMemo(
    () => ({
      connected,
      subscribe(fn) {
        listenersRef.current.add(fn);
        return () => listenersRef.current.delete(fn);
      },
      subscribeNotifications(fn) {
        notifListenersRef.current.add(fn);
        return () => notifListenersRef.current.delete(fn);
      },
      subscribeConnect(fn) {
        connectListenersRef.current.add(fn);
        return () => connectListenersRef.current.delete(fn);
      },
      reconnect() {
        const socket = socketRef.current;
        if (socket && !socket.connected) socket.connect();
      },
    }),
    [connected]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
