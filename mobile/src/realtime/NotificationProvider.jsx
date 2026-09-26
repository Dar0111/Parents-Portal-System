import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useSocket } from './SocketProvider';

// The bell's unread counts — the web's NotificationProvider, plus a refetch
// on every socket (re)connect. A SIBLING of UnreadProvider, not a
// replacement: Messages keep their own count and nothing anywhere adds the
// two together (§10). `counts` is keyed by NAV SECTION as
// GET /api/notifications/unread-counts returns it; `total` exceeds the sum
// of a parent's badged sections because grades ring the bell and are never
// badged — correct, not a bug.
const EMPTY = { total: 0, announcements: 0, memos: 0, events: 0, excuse_letters: 0, users: 0, grades: 0 };

const NotificationContext = createContext({ counts: EMPTY, refresh: () => Promise.resolve() });

export function useNotifications() {
  return useContext(NotificationContext);
}

export default function NotificationProvider({ enabled = true, children }) {
  const { subscribeNotifications, subscribeConnect } = useSocket();
  const [counts, setCounts] = useState(EMPTY);

  const refresh = useCallback(() => {
    if (!enabled) {
      setCounts(EMPTY);
      return Promise.resolve();
    }
    return api
      .get('/notifications/unread-counts', { unwrap: 'counts' })
      .then((next) => setCounts({ ...EMPTY, ...next }))
      .catch(() => {
        // Zero is the honest fallback: no dot rather than a stale one.
        setCounts(EMPTY);
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
    const offCounts = subscribeNotifications(refresh);
    const offConnect = subscribeConnect(refresh);
    return () => {
      offCounts();
      offConnect();
    };
  }, [refresh, subscribeNotifications, subscribeConnect]);

  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
