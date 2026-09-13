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
// TWO CONSUMERS: AnnouncementsPage (sections) and EventsPage (grades).
//
// TWO REQUESTS — the union is still assigned OR adviser. This is NOT
// assignments-only.
//   1. GET /api/sections     -> filter adviser_id === me  -> sections I advise
//   2. GET /api/assignments  -> distinct (grade, section) -> sections I teach
// Leg 1 stays because GET /assignments has no adviser rows. TCH-002
// (adviser of Masigasig, zero assignments) still gets that section from (1).
// GET /assignments returns one row per subject; three subjects in one class
// collapse to one { grade_level, name } via the same Map key as before
// (`${grade}|${section}`).
//
// WHAT THIS CLOSED: a section with ZERO students, or whose students are all
// INACTIVE, was invisible to the old leg 2. GET /students defaults to
// active-only (this hook never sent ?status=), so an assigned teacher was
// not offered a class the API would accept — same hole, two causes, and the
// header used to name only the empty one. Both are visible now because
// assignments do not depend on the roster.
// A section with no (active) students has no parents to reach; that is a
// compose-copy question on AnnouncementsPage, not a fetch one. Events
// cannot show that proof: they are grade-wide, and a second empty Grade 6
// assignment does not add a grade TCH-001 already has via Malikhain.
//
// DO NOT REUSE THIS HOOK FOR GRADES. Grades is assignments-only; this hook
// is assigned-OR-adviser. The warning is about SCOPE, not about which
// endpoint either one happens to call — it stays true after the next
// endpoint change too.
//
// Grades view and encode are teacher_assignments only — sections.adviser_id
// is deliberately unused there, and CLAUDE.md says widening it would be
// inventing school policy. Teacher → Grades (2026-09-12) reads
// GET /assignments directly for encode-scope and GET /grading-modes for
// mode. It does NOT use this hook. Same assignments endpoint, different
// grant: Grades needs subject-specific rows; this hook collapses them to a
// section list and unions the adviser. Reusing the hook would still offer
// TCH-002 Masigasig, which Grades cannot encode.
//
// TCH-002 is the proof: this hook offers Grade 5 - Masigasig (advisory), and
// GET /api/grades/student/:id for that section's student answers 404. The
// next page that reaches for "where may this teacher act" must read the
// route's own scope, not assume this union. (Contributions was a second
// assignments-only module until it was removed on 2026-09-13; losing that
// example does not weaken the rule. The rule is about scope, not about how
// many modules share it.)

export default function useTeacherTargets() {
  const { user } = useAuth();

  const [sections, setSections] = useState([]); // [{ grade_level, name }]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;

    Promise.all([
      api.get('/sections', { unwrap: 'sections' }),
      api.get('/assignments', { unwrap: 'assignments' }),
    ])
      .then(([allSections, assignments]) => {
        if (cancelled) return;

        const byKey = new Map();
        for (const s of allSections) {
          if (s.adviser_id === user.id) {
            byKey.set(`${s.grade_level}|${s.name}`, { grade_level: s.grade_level, name: s.name });
          }
        }
        for (const row of assignments) {
          byKey.set(`${row.grade_level}|${row.section}`, {
            grade_level: row.grade_level,
            name: row.section,
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
