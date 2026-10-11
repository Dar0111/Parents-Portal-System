import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { SOCKET_ORIGIN } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import * as tokenStore from '../auth/tokenStore';
import { FIRST_CONNECT_GRACE_MS, INITIAL_LIVE_STATE, nextLiveState } from './liveState';

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
//
// `paused` — what LiveStatus shows the strip on — means a real failure: a
// failed attempt, a lost connection, or no first connect within the grace
// (realtime/liveState.js, mirrored; the R4 fix round). Never the moment
// before the first connect.
const SocketContext = createContext({
  connected: false,
  paused: false,
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
  const [liveState, dispatchLive] = useReducer(nextLiveState, INITIAL_LIVE_STATE);
  const listenersRef = useRef(new Set());
  const notifListenersRef = useRef(new Set());
  const connectListenersRef = useRef(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;

    // The first connect gets FIRST_CONNECT_GRACE_MS before the strip shows;
    // a failed attempt or a lost connection shows it at once.
    const grace = setTimeout(() => dispatchLive('grace'), FIRST_CONNECT_GRACE_MS);

    if (!tokenStore.get()) {
      return () => {
        clearTimeout(grace);
        dispatchLive('reset');
      };
    }

    const socket = io(SOCKET_ORIGIN, {
      auth: (cb) => cb({ token: tokenStore.get() }),
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatchLive('connect');
      for (const fn of connectListenersRef.current) fn();
    });
    socket.on('disconnect', () => dispatchLive('disconnect'));
    socket.on('connect_error', () => dispatchLive('connect_error'));

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
      clearTimeout(grace);
      appState.remove();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      dispatchLive('reset');
    };
  }, [user?.id]);

  const connected = liveState === 'live';
  const paused = liveState === 'paused';

  const value = useMemo(
    () => ({
      connected,
      paused,
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
    [connected, paused]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
