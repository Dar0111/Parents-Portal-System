import { useEffect, useRef } from 'react';
import api from '../api/axios';
import { useNotifications } from './NotificationProvider';

// A VISIT CLEARS THE BADGE (fix/f3-badges, 2026-10-22 — the smoke gate's F3,
// the owner's decision). A badged page passes its section and whether its
// list has LOADED; the first time it has, this sends
// PATCH /api/notifications/read-all { section } and re-reads the counts.
//
// - ONCE PER MOUNT: a navigation to the page, a browser reload, or a Retry
//   that succeeds after a failed first load. A filter or page change on the
//   same mount is not a visit.
// - A FAILED LOAD CLEARS NOTHING: `loaded` stays false until a load succeeds.
// - THE SERVER DECIDES what the section covers — the information rows that
//   badge counted, never a call to act (routes/notifications.js VISIT_CLEAR) —
//   so the page sends only its section's name.
// - THE COUNT STAYS THE SERVER'S (§10): nothing is subtracted here; the
//   badges and the bell move when refresh() reads /unread-counts again.
// - A FAILED CLEAR IS SILENT: the badge stays, and the bell still clears each
//   row, as before.
//
// Teacher → Excuse Letters and Admin → Users do not call it: their badges
// count only calls to act, which clear on the decision (§10).
export default function useVisitClear(section, loaded) {
  const { refresh } = useNotifications();
  const sent = useRef(false);

  useEffect(() => {
    if (!loaded || sent.current) return;
    sent.current = true;
    api
      .patch('/notifications/read-all', { section }, { unwrap: 'updated' })
      .then(() => refresh())
      .catch(() => {
        // The visit's point is the page; a failed clear must not touch it.
      });
  }, [section, loaded, refresh]);
}
