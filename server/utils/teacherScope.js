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

// ---------------------------------------------------------------------------
// THE SAME ADVISER RULE, FOR CALLERS THAT HOLD A CLASS KEY INSTEAD OF A
// STUDENT ROW (CR3, 2026-09-22)
// ---------------------------------------------------------------------------
// This is the adviser leg above, keyed on (grade_level, section) rather than
// on s.section_id. It exists because the fragment above CANNOT reach
// routes/grades.js, and the reason is exactly the one the extraction history
// records: shape decides reuse, not subject matter.
//
// Every grades caller passes a CLASS — teacherCanViewGrade(teacherId,
// gradeLevel, section) — and two of them (the class record's GET and PUT) have
// no student in hand at all. Rewriting them to go through `students` was tried
// on paper and rejected: it would make "can this teacher see this class?"
// return false for an EMPTY class, so a teacher with a real
// teacher_assignments row could not open a section before its learners were
// enrolled. That is a regression, and a silent one.
//
// THE TWO MUST BE CHANGED TOGETHER, and they are in one file so that is one
// edit rather than a hunt. They agree by construction on real data:
// POST /api/students resolves section_id from (grade_level, section) and never
// inserts NULL, so a student's section_id row always carries the same
// grade_level + name the VARCHARs hold. The divergence they are allowed is the
// empty-class case above, where there is no student to key on at all.
//
// `sections.name` is the section VARCHAR — the same match routes/content.js
// makes (grade_level + name), which is NOT a section_id read. This keeps the
// count of `section_id` READERS at four, per CLAUDE.md's sections-table rule.
//
// Takes THREE bound params, in order: grade_level, section, teacher id. Unlike
// teacherViewScopeParams() these are NOT interchangeable, so there is no
// helper — a swap here is a type error at the database, not a silent no-op.
//
//   `... WHERE ${TEACHER_ADVISES_CLASS_SQL} LIMIT 1`, [gradeLevel, section, teacherId]
//
// DO NOT reuse this as a WRITE gate either. Grade ENCODE authority is the
// subject teacher's (teacher_assignments on all four columns) and widening it
// to advisers would invent school policy — see CLAUDE.md, BLOCKED / RESOLVED →
// Grades module.
const TEACHER_ADVISES_CLASS_SQL = `(
      EXISTS (
        SELECT 1 FROM sections sec
        WHERE sec.grade_level = ? AND sec.name = ? AND sec.adviser_id = ?
      )
    )`;

module.exports = { TEACHER_VIEW_SCOPE_SQL, teacherViewScopeParams, TEACHER_ADVISES_CLASS_SQL };
