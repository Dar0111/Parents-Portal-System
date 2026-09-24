import { longDate } from '../../../format/date';

// The teacher's excuse-letter card, below `sm`.
//
// EXTRACTED IN UI-B WITH NO BEHAVIOUR CHANGE. It is here for the same reason
// as the parent's: it is a CONDITIONAL card, and a conditional card is what a
// source-text assertion cannot check (§17d). `scripts/ssr-cards.jsx` renders
// it both ways — reviewable and not — through the real `DataTable`.
//
// RECORD CARD (DV1b-a). The learner leads, the absence date and class sit in
// meta, the reason is the subtitle, and the status is the badge — each fact
// once.
//
// `onSelect` ONLY when this teacher may actually review, and unlike the
// parent's card that gate is CORRECT and stays. The two look like the same
// shape and are not:
//
//   parent  — the card opens a READING view, which exists for every letter,
//             so gating it hid the decline reason on a phone (DV1b-b).
//   teacher — the card opens the REVIEW modal, which is the page's only
//             modal. A letter this teacher may not review has nothing to
//             open, and the API answers 403 to a non-adviser, so offering the
//             tap would be a dead end.
//
// A CARD IS TAPPABLE WHEN THERE IS SOMETHING TO READ, NOT SOMETHING TO DO —
// and here there is nothing to read, because this page has no read-only view
// of a letter at ANY width. `details` and `teacher_remarks` render only
// inside the review modal, so an Approved or Declined letter cannot be
// re-read even on desktop. That is a real gap, it is NOT this card's to fix,
// and it is a `docs/KNOWN_ISSUES.md` row rather than a silent one.
//
// THE LONG DATE FORM, like every other card (UI-C1b): there is no Date
// column beside a card to borrow context from. `absence_date` is a DATE
// column, delivered as the literal "2026-09-25", so this is string surgery
// (§5a-iv).
//
// `canReview` stays on the page: it closes over `advisorySections`, and its
// caveat — the client matches grade_level + section NAME while the server
// decides on students.section_id — belongs beside the state it reads.
export default function teacherLetterCard(row, { canReview, onReview }) {
  return {
    onSelect: canReview(row) ? () => onReview(row) : undefined,
    avatar: `${row.first_name} ${row.last_name}`,
    title: `${row.last_name}, ${row.first_name}`,
    subtitle: row.reason,
    meta: `${longDate(row.absence_date)} · Grade ${row.grade_level} - ${row.section}`,
    status: row.status,
  };
}
