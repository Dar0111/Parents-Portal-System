import { staffAudienceLabel } from '../../../format/audience';

// The teacher's event card, below `sm`.
//
// THIS CARD LOST DATA, not just wording. It rendered
// `row.target_grade === null ? 'School-wide' : \`Grade ${row.target_grade}\``
// — the SECTION was dropped entirely, so an event for one class and an event
// for a whole grade were indistinguishable on a phone. `staffAudienceLabel`
// restores it, and that is why this file exists rather than a find-replace.
//
// The date leads and the audience follows it: for an event, WHEN is the fact
// being scanned for. Date formatting itself is UI-C1's dispatch, so
// `event_date` is passed through exactly as before (§5a-iv: a page formats a
// date, it never computes one).
//
// Static card, actions underneath, no chevron — Edit and Delete are two
// peers (§5a-iii), and `actions` only renders because there is no `to` or
// `onSelect` beside it (§17d).
export default function teacherEventCard(row, { actions }) {
  return {
    title: row.title,
    subtitle: row.description || undefined,
    meta: `${row.event_date} · ${staffAudienceLabel(row)}`,
    actions,
  };
}
