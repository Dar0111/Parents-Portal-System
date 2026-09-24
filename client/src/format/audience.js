// Who a post is for, in ONE wording, for STAFF.
//
// Before this there were four renderings of the same fact, in four files,
// and a teacher and an admin discussing one announcement read different
// words for it:
//
//   teacher column/card   "School-wide"  "Grade 6 - Malikhain"  "Grade 6 (whole grade)"
//   teacher EVENTS card   "School-wide"  "Grade 6"              — the section DROPPED
//   admin (all 3 sites)   "Everyone at the school"  "All of Grade 6"  "Grade 6 - Malikhain"
//
// The events card was not a wording variant, it was a DATA one: it printed
// only the grade, so a post aimed at one class and a post aimed at the whole
// grade looked identical on a phone.
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
// The three cases come from the target columns' nullness, never from
// `user.grade_level` — that rule is older than this file and outlives it.
export function staffAudienceLabel(row) {
  if (row.target_grade === null || row.target_grade === undefined) return 'School-wide';
  if (!row.target_section) return `Grade ${row.target_grade} (whole grade)`;
  return `Grade ${row.target_grade} - ${row.target_section}`;
}
