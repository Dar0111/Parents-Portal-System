import { useEffect, useMemo, useState } from 'react';
import api, { fetchAll } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Where a teacher is allowed to post — the web's hooks/useTeacherTargets.js
// over the phone's api module. NOT a mirror pair: the one line that differs
// is the import (`../api/client` for `../api/axios`), so check-mirrors would
// name it on line 2 every run; the body below is the web's, unchanged.
//
// TWO REQUESTS — the union is assigned OR adviser. This is NOT assignments-only.
//   1. GET /api/sections     -> filter adviser_id === me  -> sections I advise
//   2. GET /api/assignments  -> distinct (grade, section) -> sections I teach
// Leg 1 stays because GET /assignments has no adviser rows. TCH-002
// (adviser of Masigasig, zero assignments) still gets that section from (1).
//
// DO NOT REUSE THIS HOOK FOR GRADES. Grades is assignments-only; this hook
// is assigned-OR-adviser. The warning is about SCOPE, not about which
// endpoint either one happens to call. Teacher → Students' Enroll picker and
// class filter do not use it either (their own rules, in that screen).
export default function useTeacherTargets() {
  const { user } = useAuth();

  const [sections, setSections] = useState([]); // [{ grade_level, name }]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;

    // GET /sections is reference data (23 rows, not paginated). GET
    // /assignments is paginated, and this hook needs EVERY row of the
    // teacher's own scope (C2) — fetchAll pages through, never the first 50.
    Promise.all([
      api.get('/sections', { unwrap: 'sections' }),
      fetchAll('/assignments', { unwrap: 'assignments' }),
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

// The key both content screens and the thread use for a section target —
// the web's `keyOf`, exported so the thread and Announcements agree by
// construction rather than by two template strings.
export function keyOf(section) {
  return `${section.grade_level}|${section.name}`;
}
