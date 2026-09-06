// Teacher READ scope, shared. A teacher may SEE a student if they are assigned
// to teach that student's class (teacher_assignments) OR they are the adviser
// of that student's section (sections.adviser_id).
//
// WHY IT EXISTS: attendance and excuse-letter review both scope on
// sections.adviser_id, while the read paths in students.js and excuses.js
// scoped on teacher_assignments alone. An adviser with no assignment rows could
// therefore record attendance for a student they could not list, and was the
// sole permitted reviewer of an excuse-letter queue they could not see. Both
// were fixed 2026-09-06 by widening reads; this is the shared predicate.
// It applies the decision Stage G3 settled for Grades: read scope is wider than
// write authority.
//
// THE ADVISER LEG MATCHES s.section_id — the same column attendance and the
// excuse-review check use — so "students I can list", "students I can record
// attendance for" and "letters I may review" are the same set BY CONSTRUCTION
// rather than three definitions that happen to agree. Accepted consequence: a
// student whose section_id is NULL is invisible to an adviser-only teacher,
// mirroring a blind spot attendance already has.
//
// USAGE: the fragment assumes the students table is aliased `s` and is
// in scope. It takes TWO bound params, both the teacher's user id — use
// teacherViewScopeParams() rather than writing them out, since the hazard is
// the COUNT (passing one where two are needed shifts every later placeholder),
// not the order (both values are identical, so a swap is undetectable and
// harmless).
//
//   conditions.push(TEACHER_VIEW_SCOPE_SQL);
//   params.push(...teacherViewScopeParams(req.user.id));
//
//   `... WHERE s.id = ? AND ${TEACHER_VIEW_SCOPE_SQL} LIMIT 1`,
//   [id, ...teacherViewScopeParams(req.user.id)]
//
// DO NOT reuse this as a WRITE gate. students.js keeps PUT/POST on
// teacher_assignments alone; excuses.js keeps review on its adviser check.
// Widening reads must not make more records writable.
//
// EXTRACTION HISTORY, kept because the prediction was wrong in an instructive
// way: students.js and excuses.js each carried a local copy with a twin comment
// naming routes/content.js as the third occurrence that would trigger
// extraction. content.js turned out NOT to be a third copy at all — its scoping
// runs on announcements.target_grade / events.target_grade, columns on the
// content tables, with no students row in the query to alias `s` against, so
// this fragment cannot reach it and content.js needed its own differently
// shaped adviser clause (a sections lookup by grade + name). The real third
// occurrence was routes/messages.js's canMessage(), whose two direction checks
// both reduce to "is this teacher connected to this student" — exactly what
// this expresses. Lesson worth keeping: a predicted extraction trigger is a
// guess about a file's shape, and shape is what decides reuse, not subject
// matter.
const TEACHER_VIEW_SCOPE_SQL = `(
      EXISTS (
        SELECT 1 FROM teacher_assignments ta
        WHERE ta.teacher_id = ? AND ta.grade_level = s.grade_level AND ta.section = s.section
      )
      OR EXISTS (
        SELECT 1 FROM sections sec
        WHERE sec.id = s.section_id AND sec.adviser_id = ?
      )
    )`;

function teacherViewScopeParams(teacherId) {
  return [teacherId, teacherId];
}

module.exports = { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams };
