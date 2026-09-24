// The Section filter's options on Teacher → Students.
//
// Its own module so a proof can drive it (§17b): the three cases that matter
// are all about WHICH TEACHER is looking, and a page that fetches its own
// data cannot be asked that question through a render (§14e).
//
// NO React, NO imports — that is what makes it importable from anywhere.
//
// THE UNION IS THE WHOLE POINT, and it is not the same source Enroll uses.
//
//   assignments  — complete, but ASSIGNMENTS ONLY. An adviser who holds no
//                  subject assignments has none, and that account exists in
//                  the seed: the teacher who advises Grade 5 - Masigasig
//                  teaches nothing. From assignments alone their filter
//                  would be empty while their student list is not.
//   loaded rows  — cover the advisory section, because those learners ARE
//                  on screen. Incomplete by construction: the list pages at
//                  50, so a section whose learners all sit on a later page
//                  contributes nothing until that page loads.
//
// That incompleteness is acceptable for a FILTER, which only narrows what is
// already visible, and is NOT acceptable for a write — which is why Enroll
// still reads `classOptions` (assignments) alone and the page header still
// says not to reconstruct a write scope from `GET /students`.
//
// KEYED ON THE SECTION NAME ALONE, which is safe only because section names
// are unique across the school — all 23 distinct, checked against the
// database before this was built. If that ever stops being true this must
// carry the grade level too, or two classes collapse into one option.
export function sectionOptions(classOptions, students) {
  const names = new Set();
  for (const c of classOptions || []) if (c.section) names.add(c.section);
  for (const s of students || []) if (s.section) names.add(s.section);
  return [...names].sort((a, b) => a.localeCompare(b));
}

// ONE SECTION MEANS NO FILTER. A teacher with a single section has nothing
// to choose between, and a select offering one option is a control that
// cannot change anything — worse than absent, because it invites a click.
//
// On the seeded data this is every teacher, so the filter is invisible until
// somebody actually teaches across two sections. That is the intended
// behaviour and it is also why the control cannot be seen without a fixture.
export function showSectionFilter(options) {
  return (options || []).length > 1;
}
