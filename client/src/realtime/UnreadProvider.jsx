import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useSocket } from './SocketProvider';

// The unread-message count behind the Messages nav badge.
//
// WHY THIS EXISTS AS A PROVIDER rather than living in Shell: the count is
// server-derived, and the moment it changes most visibly is when a teacher
// OPENS a thread and the thread page issues PATCH /read-all/:userId. The badge
// is in Shell; the thread is a route inside Shell's <Outlet />. Without a
// shared signal the thread has no way to tell the badge that the server has
// changed, so the badge could only ever be right on a full page load — which
// is exactly the defect found in browser review on 2026-09-07.
//
// THE FIX IS A SIGNAL, NOT A LOCAL DECREMENT. `refresh()` re-reads the count
// from the server; nothing anywhere subtracts from it. A badge maintained in
// client state while the server still holds those rows unread is convention
// 5b's defect — the same one as the attendance RECORDED column, one component
// further out.
//
// Refetches on: mount, any `new_message` socket event, and an explicit
// refresh() from a page that has just changed read state.

const UnreadContext = createContext({ unread: 0, refresh: () => {} });

export function useUnread() {
  return useContext(UnreadContext);
}

export default function UnreadProvider({ enabled, children }) {
  const { subscribe } = useSocket();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    // `enabled` is false for a role whose Messages page is not built — no
    // request is made for a count that could not be displayed anyway. See the
    // badge rule in CLAUDE.md convention 6.
    if (!enabled) {
      setUnread(0);
      return Promise.resolve();
    }
    return api
      .get('/messages/conversations', { unwrap: 'conversations' })
      .then((rows) => setUnread(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0)))
      .catch(() => {
        // A failed count is not worth a page-level error — the Messages page
        // itself reports properly if the endpoint is unreachable.
        setUnread(0);
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh, subscribe]);

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
