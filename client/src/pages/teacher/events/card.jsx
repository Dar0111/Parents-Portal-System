import { staffAudienceLabel } from '../../../format/audience';

// The teacher's event card, below `sm`.
//
// `hasSections: false`, AND THAT IS THE WHOLE POINT OF THIS FILE.
// **The `events` table has no `target_section` column** — only
// `target_grade` (`database/schema.sql`, and `server/routes/content.js`
// states it at :147, :562 and :591). An event cannot be aimed at one class,
// so it has two audiences and not three, and "(whole grade)" here would
// contrast with something that can never exist.
//
// CORRECTION, recorded because it shipped: UI-C2's plan and its first commit
// claimed this card "dropped the section", making a whole-grade event and a
// one-class event look alike. **That was false** — there is no section to
// drop, and the old `Grade ${row.target_grade}` was correct and complete.
// The plan asserted it without reading the schema; posting an event with
// `target_section` is how it was caught, the field coming back null.
//
// So the label is shared with Announcements and admin, and the DIFFERENCE
// between the two content types is stated in the call rather than hidden by
// a wording that fits neither.
//
// The date leads and the audience follows: for an event, WHEN is the fact
// being scanned for. Date formatting is UI-C1's dispatch, so `event_date`
// passes through exactly as before (§5a-iv).
//
// Static card, actions underneath, no chevron — Edit and Delete are two
// peers (§5a-iii), and `actions` only renders because there is no `to` or
// `onSelect` beside it (§17d).
export default function teacherEventCard(row, { actions }) {
  return {
    title: row.title,
    subtitle: row.description || undefined,
    meta: `${row.event_date} · ${staffAudienceLabel(row, { hasSections: false })}`,
    actions,
  };
}
