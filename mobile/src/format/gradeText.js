import { formatWholeGrade } from './scorePair';

// THE PURE HALF OF THE WEB'S format/grade.jsx (§3), so a proof can drive it
// and both RN renderers (GradeValue, TermValue) share one implementation.
// NULL in a grade column means "not yet computable" — not missing, not
// zero — and the pending-vs-N/A split comes from the API's own
// `grading_mode`, never inferred from the null.
//
//   a number, default        -> "0.00" / "88.05" / "87.50"
//   a number, `whole`        -> "87" / "89.5"   (String(Number(x)), never toFixed(0))
//   null, numerical mode     -> { reason: 'Pending' }
//   null, descriptive mode   -> { reason: 'N/A' }
export const PENDING = {
  short: 'Pending',
  title: 'Not yet computable — Written Works, Performance Tasks and Examinations must all be recorded first.',
};
export const NOT_APPLICABLE = {
  short: 'N/A',
  title: 'Not applicable — this grade level uses descriptive grading (A–E), not a numerical grade.',
};

export function reasonFor(mode) {
  return mode === 'descriptive' ? NOT_APPLICABLE : PENDING;
}

export function formatGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return null;
  return asNumber.toFixed(2);
}

// { text } for a real value, { reason } for a null — one of the two, never both.
export function gradeText(value, mode, whole = false) {
  const formatted = whole ? formatWholeGrade(value) : formatGrade(value);
  if (formatted !== null) return { text: formatted, reason: null };
  return { text: null, reason: reasonFor(mode) };
}
