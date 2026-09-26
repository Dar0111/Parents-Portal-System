import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useSocket } from './SocketProvider';

// The unread-message count behind the Messages drawer badge — the web's
// UnreadProvider with one addition: it also refetches on every socket
// (re)connect, because a phone that was in the background may have missed a
// `new_message`. THE FIX IS A SIGNAL, NOT A LOCAL DECREMENT (§5b, §10):
// nothing here subtracts; `refresh()` re-reads the server.
const UnreadContext = createContext({ unread: 0, refresh: () => Promise.resolve() });

export function useUnread() {
  return useContext(UnreadContext);
}

export default function UnreadProvider({ enabled, children }) {
  const { subscribe, subscribeConnect } = useSocket();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    // `enabled` is false for a role whose Messages screen is not built — no
    // request is made for a count that could not be displayed (§6).
    if (!enabled) {
      setUnread(0);
      return Promise.resolve();
    }
    return api
      .get('/messages/conversations', { unwrap: 'conversations' })
      .then((rows) => setUnread(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0)))
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

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
