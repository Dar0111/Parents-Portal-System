import { staffAudienceLabel } from '../../../format/audience';

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
// The date is UNCHANGED here on purpose — `.slice(0, 10)` off the raw
// `created_at`, exactly as the page did it. Formatting every date in the app
// is UI-C1's whole dispatch, and doing one of them early would leave this
// card reading "24 Sep 2026" beside a table still reading "2026-09-24".
export default function teacherAnnouncementCard(row, { actions }) {
  return {
    title: row.title,
    subtitle: row.content,
    meta: `${staffAudienceLabel(row)} · ${String(row.created_at).slice(0, 10)}`,
    actions,
  };
}
