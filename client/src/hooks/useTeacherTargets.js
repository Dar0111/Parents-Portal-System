import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../auth/AuthContext';

// Where a teacher is allowed to post.
//
// WHY THIS IS A HOOK AND NOT A DUPLICATED HELPER — the codebase's own
// extract-at-three precedent (utils/dateFormat.js at three; the school_year
// validator and titleCase still duplicated at two) is about copying a VALUE.
// This makes network calls and derives state from them. Two duplicated
// fetch-and-derive implementations drift in a way a duplicated one-line
// titleCase structurally cannot: one page adds a request, fixes an edge case,
// or changes a filter, and the other silently keeps offering a stale target
// set. So this is extracted at two, and the rule is not broken — it does not
// apply to this shape.
//
// TWO REQUESTS — this hook has not switched to GET /api/assignments
// (NOW POSSIBLE, 2026-09-08). It still reconstructs:
//   1. GET /api/sections   -> filter adviser_id === me   -> sections I advise
//   2. GET /api/students   -> distinct (grade, section)  -> sections I can see
// (2)'s scope predicate is exactly "assigned OR adviser", which is the same
// union the write gates use, so it is very nearly sufficient on its own; (1) is
// what covers an advisory section whose students are not visible for any other
// reason. The union is the answer.
//
// KNOWN GAP, recorded rather than worked around: a section with ZERO students
// is invisible to (2), so a teacher assigned to an empty section is not offered
// it even though POST would accept the post. Acceptable today because a section
// with no learners has no parents to announce to — the post would have no
// audience, so it is a gap with no victim. Switching this hook to
// GET /api/assignments is what closes that hole; the endpoint exists.
//
// DO NOT REUSE THIS HOOK FOR GRADES OR CONTRIBUTIONS. Both are the
// assignments-only modules; this hook is assigned-OR-adviser. Grades view
// and encode are teacher_assignments only — sections.adviser_id is
// deliberately unused there, and CLAUDE.md says widening it would be
// inventing school policy. Contributions writes (`teacherHasGradeAssignment`
// in routes/contributions.js) are also assignments-only, grade-level, no
// adviser clause — content.js writes WERE widened; this one was not.
// Whether a fee SHOULD include the adviser is a school question (a fee is
// money; DepEd Order 19 s. 2008), not a consistency patch. Do not widen it.
// TCH-002 is the proof for both: this hook offers Grade 5 - Masigasig
// (advisory); GET /api/grades/student/:id for that section's student
// answers 404, and POST /api/contributions for Grade 5 answers 403.
// Teacher → Grades builds its class list from GET /students alone, then
// treats a report-card 404 as "not the subject teacher." Teacher →
// Contributions builds compose grades from GET /students too (too wide —
// TCH-002 sees Jea) and lets Post be the assignment check. The next page
// that reaches for "where may this teacher act" must read the route's own
// scope, not assume this union.

export default function useTeacherTargets() {
  const { user } = useAuth();

  const [sections, setSections] = useState([]); // [{ grade_level, name }]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;

    Promise.all([
      api.get('/sections', { unwrap: 'sections' }),
      api.get('/students', { unwrap: 'students' }),
    ])
      .then(([allSections, students]) => {
        if (cancelled) return;

        const byKey = new Map();
        for (const s of allSections) {
          if (s.adviser_id === user.id) {
            byKey.set(`${s.grade_level}|${s.name}`, { grade_level: s.grade_level, name: s.name });
          }
        }
        for (const st of students) {
          byKey.set(`${st.grade_level}|${st.section}`, {
            grade_level: st.grade_level,
            name: st.section,
          });
        }

        setSections(
          [...byKey.values()].sort(
            (a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name)
          )
        );
      })
      .catch(() => {
        // A failure here costs the target list, not the page. Compose hides
        // itself when there are no targets, and the server would refuse a bad
        // target anyway — so this is not surfaced as a page-level error.
        if (!cancelled) setSections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Events target a GRADE, not a section (the events table has no
  // target_section column), so the same source collapses to distinct grades.
  const grades = useMemo(
    () => [...new Set(sections.map((s) => s.grade_level))].sort((a, b) => a - b),
    [sections]
  );

  return { sections, grades, loading };
}
