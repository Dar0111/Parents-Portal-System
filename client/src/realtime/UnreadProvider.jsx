import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { createTickets } from '../api/tickets';
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
//
// THE ROWS ARE HANDED ON, NOT RE-FETCHED (feat/message-toast, 2026-10-02).
// The new-message toast needs the sender's name and THE SERVER'S unread
// count for that person; both are in the rows this provider already reads on
// every `new_message`. `subscribeConversations(fn)` passes each successful
// read's rows to `fn` — no second request, and no count made here.
//
// ONLY THE NEWEST REPLY IS APPLIED (feat/look-fixes, 2026-10-05). A thread that
// marks messages read calls refresh() in the same moment as this provider's
// own socket refresh, so two reads overlap; an older reply landing last left
// the badge saying 1 while the Messages list, read after, showed nothing
// unread. Every read takes a ticket (api/tickets.js), and a reply whose
// ticket is no longer the latest is dropped — count, rows and failure alike.
// The count is still the server's; nothing is decremented here.

const UnreadContext = createContext({ unread: 0, refresh: () => {}, subscribeConversations: () => () => {} });

export function useUnread() {
  return useContext(UnreadContext);
}

export default function UnreadProvider({ enabled, children }) {
  const { subscribe } = useSocket();
  const [unread, setUnread] = useState(0);
  const rowListenersRef = useRef(new Set());
  const [tickets] = useState(createTickets);

  const refresh = useCallback(() => {
    // `enabled` is false for a role whose Messages page is not built — no
    // request is made for a count that could not be displayed anyway. See the
    // badge rule in CLAUDE.md convention 6.
    if (!enabled) {
      setUnread(0);
      return Promise.resolve();
    }
    const ticket = tickets.take();
    return api
      .get('/messages/conversations', { unwrap: 'conversations' })
      .then((rows) => {
        if (!tickets.isLatest(ticket)) return; // a newer read has started
        setUnread(rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0));
        for (const fn of rowListenersRef.current) fn(rows);
      })
      .catch(() => {
        // A failed count is not worth a page-level error — the Messages page
        // itself reports properly if the endpoint is unreachable.
        if (tickets.isLatest(ticket)) setUnread(0);
      });
  }, [enabled, tickets]);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh, subscribe]);

  const subscribeConversations = useCallback((fn) => {
    rowListenersRef.current.add(fn);
    return () => rowListenersRef.current.delete(fn);
  }, []);

  const value = useMemo(() => ({ unread, refresh, subscribeConversations }), [unread, refresh, subscribeConversations]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
