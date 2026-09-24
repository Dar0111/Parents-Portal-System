// Who a post is for, in ONE wording, for STAFF.
//
// Before this there were four renderings of the same fact, in four files,
// and a teacher and an admin discussing one announcement read different
// words for it:
//
//   teacher ANNOUNCEMENTS  "School-wide"  "Grade 6 - Malikhain"  "Grade 6 (whole grade)"
//   teacher EVENTS         "School-wide"  "Grade 6"
//   admin (all 3 sites)    "Everyone at the school"  "All of Grade 6"  "Grade 6 - Malikhain"
//
// The events pair was NOT a variant — see `hasSections` below. Only the
// admin row was, and it disagreed with admin's own prose.
//
// "SCHOOL-WIDE" WINS ON EVIDENCE, NOT TASTE. It was already the cross-role
// word in PROSE — both teacher pages' empty states say "School-wide posts
// from the admin…" and admin's own filter copy says "School-wide posts are
// not included in this filter." Admin's badge was the outlier against
// admin's own sentences.
//
// THE PARENT WORDING IS NOT THIS AND MUST NOT BECOME IT.
// `parent/AnnouncementsPage.jsx` and `parent/EventsPage.jsx` keep their own
// three labels — "For everyone at the school" / "For your child's year
// level" / "For your child's class" — deliberately written to their reader,
// saying nothing about WHICH grade, which is the point. A parent does not
// need the routing model; staff do.
//
// NOT THIS EITHER: admin's compose-form options ("Everyone at the school",
// "One whole grade"). A form describes an ACTION you are about to take; this
// describes a post that exists. Different job, different voice.
//
// TWO SHAPES, NOT ONE, and `hasSections` is the honest way to say so.
//
// `announcements` has a `target_section` column; **`events` does not** —
// only `target_grade` (`schema.sql`, and `routes/content.js` says it three
// times: :147, :562, :591). So an event cannot be aimed at one class, and
// "(whole grade)" on an event would contrast with something that can never
// exist. Callers for events pass `{ hasSections: false }` and get two cases;
// announcements get all three.
//
// The alternative — one unconditional wording — was tried first and is what
// produced a false claim in a commit message: it made every targeted event
// read "Grade 1 (whole grade)" against no alternative. A parameter that
// states the difference beats a label that pretends there is none.
//
// The cases come from the target columns' nullness, never from
// `user.grade_level` — that rule is older than this file and outlives it.
export function staffAudienceLabel(row, { hasSections = true } = {}) {
  if (row.target_grade === null || row.target_grade === undefined) return 'School-wide';
  if (!hasSections) return `Grade ${row.target_grade}`;
  if (!row.target_section) return `Grade ${row.target_grade} (whole grade)`;
  return `Grade ${row.target_grade} - ${row.target_section}`;
}
