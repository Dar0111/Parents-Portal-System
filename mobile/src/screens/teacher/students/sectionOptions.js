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
// key on the grade level too, or two classes collapse into one option.
//
// THE VALUE AND THE LABEL ARE TWO DIFFERENT THINGS (UI-C1b).
//
//   value — the bare section name, because that is what the filter compares
//           against `row.section` and what `GET /students` takes as
//           `?section=`. It must NOT gain the grade prefix.
//   label — "Grade 6 - Malikhain", the same wording every other surface in
//           the app uses for a class.
//
// The bare name alone was not wrong, it was incomplete: a teacher across two
// grades saw "Malikhain" and "Masigasig" with nothing to say which grade
// either belonged to, while the Grade & section column beside it named both
// in full (browser check, 2026-09-24). Uniqueness makes the bare name a
// correct KEY; it does not make it a readable LABEL.
//
// ORDERED BY GRADE, THEN BY NAME — which is what the labels read as, so the
// list cannot be sorted one way and read another. A section whose grade is
// missing from both sources keeps the bare name as its label and sorts last.
export function sectionOptions(classOptions, students) {
  const byName = new Map();
  const add = (row) => {
    if (!row || !row.section) return;
    if (!byName.has(row.section)) {
      byName.set(row.section, { value: row.section, grade_level: row.grade_level ?? null });
      return;
    }
    // First non-null grade wins: the two sources are the same classes seen
    // from different angles, so a row that carries the grade fills in for
    // one that does not.
    const seen = byName.get(row.section);
    if (seen.grade_level == null && row.grade_level != null) seen.grade_level = row.grade_level;
  };
  for (const c of classOptions || []) add(c);
  for (const s of students || []) add(s);

  return [...byName.values()]
    .sort((a, b) => {
      const ga = a.grade_level == null ? Infinity : Number(a.grade_level);
      const gb = b.grade_level == null ? Infinity : Number(b.grade_level);
      if (ga !== gb) return ga - gb;
      return a.value.localeCompare(b.value);
    })
    .map((s) => ({
      value: s.value,
      label: s.grade_level == null ? s.value : `Grade ${s.grade_level} - ${s.value}`,
    }));
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
