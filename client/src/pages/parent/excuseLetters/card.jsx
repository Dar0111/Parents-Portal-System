// The parent's excuse-letter card, below `sm`.
//
// WHY ITS OWN MODULE: it is a conditional card, and a conditional card is
// exactly what a source-text assertion cannot check (§17d). DV1b-b's proof
// asserted that this card's `actions` prop was WRITTEN and reported it as
// working; `DataTable` never rendered it, and the browser check is what
// caught that. A function in a module can be imported and rendered through
// the real `Card`, which is what `scripts/ssr-cards.jsx` does. Same reason as
// `teacher/attendance/columns.jsx` and `classRecord/buildPayload.js` (§17b).
//
// EVERY CARD OPENS THE READING VIEW, whatever the letter's status, and that
// is the rule the page exists to keep. DV1b-a gated `onSelect` on `Pending`,
// so a DECLINED letter became a static card with no route into the reading
// modal — and that modal is the ONLY place the adviser's remarks are
// rendered. The one thing a parent most needs after a decline was reachable
// on desktop, where the Reason cell is a button, and nowhere at all on a
// phone.
//
// A CARD IS TAPPABLE WHEN THERE IS SOMETHING TO READ, NOT SOMETHING TO DO.
// The teacher's card is gated and stays gated — a teacher outside the
// section gets a 403, so a tap really is a dead end. A parent is never out of
// scope on their own child's letter.
//
// AND EDIT IS NOT HERE. DV1b-b moved it to `actions`, reported that as done,
// and it never rendered: `DataTable`'s `Card` renders `actions` only on its
// static branch — no `to`, no `onSelect` — because a button beside a primary
// action would be a button inside one (§5a-iii). The prop was inert for a
// whole dispatch. Edit lives inside the reading view, still Pending only,
// which is where it already was and where one tap now reaches it.
//
// No LRN and no `login_id` (§5c) — there is none in the payload to leak.
export default function parentLetterCard(row, { onRead }) {
  return {
    onSelect: () => onRead(row),
    title: `Absence on ${row.absence_date}`,
    subtitle: row.reason,
    status: row.status,
  };
}
