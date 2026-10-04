// LATEST REPLY WINS (feat/look-fixes, 2026-10-05) — PURE, so a proof can drive
// it with fake requests that resolve out of order.
//
// Two requests to the same endpoint can answer in either order. Whoever
// writes the reply to state must drop a reply that is no longer the newest,
// or the older answer lands last and the screen shows it. Every request takes
// a ticket before it starts; when its reply arrives it applies it only if its
// ticket is still the latest.
//
// The pattern is the class record's live preview (`previewTicket`,
// pages/teacher/classRecord/useClassRecord.js), which has always had it. This
// module gives it to two readers that did not: the class record's LOAD, and
// UnreadProvider's re-read behind the Messages badge.
//
//   const [tickets] = useState(createTickets);
//   const ticket = tickets.take();
//   const data = await api.get(...);
//   if (!tickets.isLatest(ticket)) return;   // a newer request has started
export function createTickets() {
  let latest = 0;
  return {
    take() {
      latest += 1;
      return latest;
    },
    isLatest(ticket) {
      return ticket === latest;
    },
  };
}
