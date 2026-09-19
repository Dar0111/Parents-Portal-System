import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useSocket } from './SocketProvider';

// The bell's unread counts, and the signal that refreshes them. N2, 2026-09-19.
//
// A SIBLING OF UnreadProvider, NOT A REPLACEMENT. Messages keep their own
// count, from GET /messages/conversations, feeding the Messages nav badge
// exactly as before. Nothing here touches that number and nothing anywhere
// adds the two together: the bell total DELIBERATELY excludes messages,
// because messages.read_status already is per-item read state and a second
// store for one fact means two places to mark read and two chances to
// disagree. If the bell ever needs to mention messages, the fix is to read
// them from the same endpoint, not to sum two providers.
//
// EVERY COUNT COMES FROM THE SERVER. The socket event carries no payload; it
// means "refetch". Nothing here increments on an arrival or decrements on a
// read — that is convention 5b one component out, and it is the defect
// UnreadProvider's header records from 2026-09-07, where a badge kept in
// client state disagreed with the rows the server still held unread.
//
// `counts` is keyed by NAV SECTION, as GET /api/notifications/unread-counts
// returns it: { total, announcements, memos, events, excuse_letters, users,
// grades }. `total` is larger than the sum of the badged sections for a
// parent, and that is correct rather than a bug: grades are counted in the
// bell and are deliberately never badged in the sidebar (Darryl, 2026-09-19).

const EMPTY = { total: 0, announcements: 0, memos: 0, events: 0, excuse_letters: 0, users: 0, grades: 0 };

const NotificationContext = createContext({ counts: EMPTY, refresh: () => {} });

export function useNotifications() {
  return useContext(NotificationContext);
}

export default function NotificationProvider({ enabled = true, children }) {
  const { subscribeNotifications } = useSocket();
  const [counts, setCounts] = useState(EMPTY);

  const refresh = useCallback(() => {
    // `enabled` mirrors UnreadProvider's gate: a role with nothing to show
    // makes no request. Today every role has a bell, so this is always true —
    // it exists so that a future role without one does not fetch a count it
    // cannot display, which is the rule convention 6 states for badges.
    if (!enabled) {
      setCounts(EMPTY);
      return Promise.resolve();
    }
    return api
      .get('/notifications/unread-counts', { unwrap: 'counts' })
      .then((next) => setCounts({ ...EMPTY, ...next }))
      .catch(() => {
        // A failed count is not worth a page-level error — the dropdown
        // reports properly when the list itself cannot be read. Falling back
        // to zero is the honest state: it shows no dot rather than a stale
        // one.
        setCounts(EMPTY);
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
    return subscribeNotifications(refresh);
  }, [refresh, subscribeNotifications]);

  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
