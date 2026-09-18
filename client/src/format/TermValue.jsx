import GradeValue from './grade';

// One term's grade value — a number, a descriptive letter, Pending or N/A.
// Extracted 2026-09-14 when Admin → Grades became the THIRD copy; Parent →
// Grades (as TermDisplay) and Teacher → Grades (as TermCell) held identical
// bodies and both files said "Extract at three". Each page keeps its own
// WRAPPER (Parent's click-to-open button, the admin lock marker); only the
// value rendering lives here.
//
// Not a fifth state on GradeValue. GradeValue's header names four states — a
// number, null-numerical, null-descriptive, and error — and a DESCRIPTIVE
// LETTER IS NOT ONE OF THEM: formatGrade('A') gives Number('A') -> NaN -> null,
// so a real Grade 1 letter would render as "— N/A" on the one value that does
// apply. The letter is handled here, and format/grade.jsx is left untouched.
//
// `mode` names the REASON a null renders, not the grade level a student is at.
// An unrecorded descriptive letter is "not yet recorded", which is Pending, so
// 'numerical' is the correct GradeValue argument for that cell even though the
// student is descriptive-mode.
const NULL_IS_PENDING = 'numerical';

export default function TermValue({ entry, mode }) {
  if (mode === 'descriptive') {
    if (!entry?.descriptive_grade) {
      return <GradeValue value={null} mode={NULL_IS_PENDING} />;
    }
    return (
      <span className="whitespace-nowrap">
        <span className="font-medium text-fg">{entry.descriptive_grade}</span>
        {entry.descriptor ? (
          <span className="ml-1.5 text-xs text-fg-muted">{entry.descriptor.descriptor}</span>
        ) : null}
      </span>
    );
  }

  // `mode` is the API's own grading_mode, never inferred from the null itself:
  // "null because incomplete" and "null because inapplicable" are
  // indistinguishable from the value alone.
  return <GradeValue value={entry?.term_grade} mode={mode} />;
}
