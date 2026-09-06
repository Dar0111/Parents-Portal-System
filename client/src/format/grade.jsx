// One shared renderer for every grade-bearing value in the system — the grades
// list, the report card, Initial Grade, Final Grade, General Average.
//
// WHY THIS IS SHARED, not a per-column choice: NULL in a grade column means
// "not yet computable", never "zero" and never "missing". Rendered as a blank
// cell, a parent reads it as their child's grade having disappeared. Left to
// each page, the grades list, the report card and the General Average would
// each invent their own wording and colour for the same thing.
//
// Four states, kept distinguishable at a glance:
//
//   a number (including 0)  ->  "0.00" / "88.05", normal weight
//   null, numerical mode    ->  "— Pending"
//   null, descriptive mode  ->  "— N/A"
//   a failed request        ->  never reaches here; DataTable's error state
//                               owns the whole frame, so a dead request can
//                               never be mistaken for a null value
//
// THE LABEL IS INLINE TEXT, NOT ONLY A TOOLTIP. Tooltips are hover-only and do
// not exist on touch, and the report card is the screen parents are most
// likely to read on a phone — exactly the audience most likely to misread a
// bare dash as a lost grade. The tooltip is kept as well, carrying the longer
// explanation for desktop; it just is not the only carrier of the meaning.
//
// TRADE-OFF, stated because it is real: an inline word costs roughly 55-70px
// of column width, which is material in a dense table (three terms plus a
// Final Grade column). The cheaper alternative — a bare dash plus one legend
// line under the table — was rejected because it breaks the moment a single
// table contains both null reasons, which a teacher's cross-grade-level list
// can. "Pending" and "N/A" are kept short for the same reason. Where width is
// truly tight, <GradeLegend /> can accompany the table; it supplements the
// inline labels rather than replacing them.

const PENDING = {
  short: 'Pending',
  title:
    'Not yet computable — Written Works, Performance Tasks and Examinations must all be recorded first.',
};

const NOT_APPLICABLE = {
  short: 'N/A',
  title: 'Not applicable — this grade level uses descriptive grading (A–E), not a numerical grade.',
};

// `mode` comes from the API's own `grading_mode` field, never inferred from
// the null itself: "null because incomplete" and "null because inapplicable"
// are indistinguishable from the value alone.
function reasonFor(mode) {
  return mode === 'descriptive' ? NOT_APPLICABLE : PENDING;
}

// mysql2 returns DECIMAL columns as strings ("90.00"), so a grade can arrive
// as either a string or a number. Normalising here means the two never render
// differently for the same underlying value.
// Not exported yet: nothing outside this file needs the string without the
// markup. When something does (a CSV export, a chart label), move this into a
// plain format/grade.js and import it from both — same reasoning as
// StatusBadge's toneForStatus.
function formatGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return null;
  return asNumber.toFixed(2);
}

export default function GradeValue({ value, mode, className = '' }) {
  const formatted = formatGrade(value);

  if (formatted !== null) {
    return <span className={`tabular-nums text-slate-900 ${className}`}>{formatted}</span>;
  }

  const reason = reasonFor(mode);

  return (
    <span className={`whitespace-nowrap text-slate-400 ${className}`} title={reason.title}>
      <span aria-hidden="true">—</span>{' '}
      <span className="text-xs italic">{reason.short}</span>
    </span>
  );
}

// Optional companion for a table that shows grades. Renders only the meanings
// actually present, so a purely numerical table does not explain descriptive
// grading to someone who will never see it.
export function GradeLegend({ pending = true, notApplicable = false, className = '' }) {
  if (!pending && !notApplicable) return null;

  return (
    <p className={`mt-2 text-xs text-slate-500 ${className}`}>
      {pending ? (
        <span className="mr-4">
          <span className="italic">Pending</span> — not yet computable; all components must be
          recorded first.
        </span>
      ) : null}
      {notApplicable ? (
        <span>
          <span className="italic">N/A</span> — not applicable; this grade level uses descriptive
          grading (A–E).
        </span>
      ) : null}
    </p>
  );
}
