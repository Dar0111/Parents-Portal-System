import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { useSocket } from './SocketProvider';

// The unread-message count behind the Messages drawer badge — the web's
// UnreadProvider with one addition: it also refetches on every socket
// (re)connect, because a phone that was in the background may have missed a
// `new_message`. THE FIX IS A SIGNAL, NOT A LOCAL DECREMENT (§5b, §10):
// nothing here subtracts; `refresh()` re-reads the server.
//
// THE ROWS ARE HANDED ON, NOT RE-FETCHED (feat/message-toast, 2026-10-02),
// exactly as on the web: `subscribeConversations(fn)` passes each successful
// read's rows to the new-message toast, which takes the sender's name and the
// server's unread count from them (M22).
const UnreadContext = createContext({
  unread: 0,
  refresh: () => Promise.resolve(),
  subscribeConversations: () => () => {},
});

export function useUnread() {
  return useContext(UnreadContext);
}

export default function UnreadProvider({ enabled, children }) {
  const { subscribe, subscribeConnect } = useSocket();
  const [unread, setUnread] = useState(0);
  const rowListenersRef = useRef(new Set());

  const refresh = useCallback(() => {
    // `enabled` is false for a role whose Messages screen is not built — no
    // request is made for a count that could not be displayed (§6).
    if (!enabled) {
      setUnread(0);
      return Promise.resolve();
    }
    return api
      .get('/messages/conversations', { unwrap: 'conversations' })
      .then((rows) => {
        setUnread(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0));
        for (const fn of rowListenersRef.current) fn(rows);
      })
      .catch(() => {
        setUnread(0);
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
    const offMessage = subscribe(refresh);
    const offConnect = subscribeConnect(refresh);
    return () => {
      offMessage();
      offConnect();
    };
  }, [refresh, subscribe, subscribeConnect]);

  const subscribeConversations = useCallback((fn) => {
    rowListenersRef.current.add(fn);
    return () => rowListenersRef.current.delete(fn);
  }, []);

  const value = useMemo(() => ({ unread, refresh, subscribeConversations }), [unread, refresh, subscribeConversations]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
