import { useCallback } from 'react';
import api from '../api/client';
import { useNotifications } from './NotificationProvider';

// A VISIT CLEARS THE BADGE on the phone (fix/f3-badges, 2026-10-22 — the
// smoke gate's F3, the owner's decision; the web's realtime/useVisitClear.js
// is the same request, MOBILE M31 says where the phone differs).
//
// A drawer screen stays mounted, so a visit is not a mount here: it is EVERY
// FOCUS and EVERY PULL whose first-page load SUCCEEDED. The screen's `load`
// resolves true on success and false on failure, and the screen hands that
// to the function this returns — `load(0).then(visited)` — so a failed load
// clears nothing. Loading more (a later page) is not a visit.
//
// The server decides what the section covers — the information rows that
// badge counted, never a call to act (routes/notifications.js VISIT_CLEAR) —
// and the counts are re-read, never adjusted here (§10). A failed clear is
// silent: the badge stays, and the bell still clears each row.
//
// Teacher → Excuse Letters and Admin → Users do not call it: their badges
// count only calls to act, which clear on the decision (§10).
export default function useVisitClear(section) {
  const { refresh } = useNotifications();
  return useCallback(
    (loaded) => {
      if (loaded !== true) return;
      api
        .patch('/notifications/read-all', { section }, { unwrap: 'updated' })
        .then(() => refresh())
        .catch(() => {
          // The visit's point is the screen; a failed clear must not touch it.
        });
    },
    [section, refresh]
  );
}
