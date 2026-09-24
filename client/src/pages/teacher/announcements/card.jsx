import { staffAudienceLabel } from '../../../format/audience';
import { timestampDay } from '../../../format/date';

// The teacher's announcement card, below `sm`.
//
// A module so the proof can RENDER it rather than regex the page (§17b,
// §17d) — the audience label is now shared with two other surfaces, and a
// source-text assertion would prove only that the import was typed.
//
// NO PRIMARY ACTION, deliberately. Edit and Delete are two peers, so the
// card is static with its actions underneath and shows no chevron (§5a-iii):
// a card that looks tappable and is not is worse than one that never claimed
// to be. `actions` renders here precisely BECAUSE there is no `to` or
// `onSelect` — pass one of those and the actions vanish silently (§17d).
//
// `actions` stays on the page: it closes over `user`, `openEdit` and
// `openDelete`, and JSX in a card is the one thing the contract does allow
// in that slot.
// The date goes through `timestampDay` (UI-C1a). UI-C2 deliberately left the
// old `.slice(0, 10)` here so the card would not read differently from the
// table beside it; this is the dispatch that changes both at once — and the
// slice was not merely inconsistent, it showed the PREVIOUS day for anything
// posted before 08:00 PH, because `created_at` is a TIMESTAMP serialised as
// a UTC instant (`format/date.js`).
export default function teacherAnnouncementCard(row, { actions }) {
  return {
    title: row.title,
    subtitle: row.content,
    meta: `${staffAudienceLabel(row)} · ${timestampDay(row.created_at)}`,
    actions,
  };
}
