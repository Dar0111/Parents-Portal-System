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

// A TERM GRADE and a FINAL GRADE are whole numbers (2026-09-22). The school's
// Summary of Grades and DO 015 both print them that way, and since the
// rounding fix the server stores them that way too — a Term Grade comes out
// of transmutation_table (an INT column) and computeFinalGrade now rounds to
// a whole number. Two decimals on screen made a correct 89 read as 89.00.
//
// THIS IS NOT toFixed(0), AND THE DIFFERENCE MATTERS. From SY 2027-2028 the
// transmutation table has no rows, recomputeGrade falls back to
// term_grade = the Initial Grade, and Initial Grades carry two decimals. A
// stored 89.5 under toFixed(0) would display as "90" — a number the database
// does not hold. So this renders the integer only when the value IS integral
// and otherwise shows what is actually stored:
//
//     "87.00" -> "87"        89 -> "89"        89.5 -> "89.5"
//
// The same reasoning rules out Math.round for display. Rounding is the
// server's job and it has already happened; the client's job is to not add
// decimals that are not there, never to remove ones that are.
//
// General Average and Initial Grade keep formatGrade above — the general
// average is 721/8 = 90.13 on the school's own sheet, so two decimals there
// is the correct answer, not an oversight. Two precisions one level apart is
// a real distinction in the school's records.
// `String(Number(x))` is the whole implementation: Number("87.00") is 87 and
// String(87) is "87", while String(89.5) is "89.5". No branch on
// Number.isInteger is needed — JavaScript's own number-to-string already
// drops trailing zeros and keeps real decimals, which is exactly the rule.
function formatWholeGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return null;
  return String(asNumber);
}

// A RAW SCORE PAIR — "46/50" — is neither of the two above, and it lives here
// because it is the same rule one level down (UI-A item 6, 2026-09-23).
//
// Every score a teacher types is a WHOLE number since CR0, and the columns are
// still DECIMAL(5,2), so mysql2 hands back "46.00" and the parent breakdown
// printed "46.00/50.00" — two dead decimals on the one screen parents read.
// It reuses formatWholeGrade per side rather than reimplementing it: the rule
// that 42.5 must stay 42.5 is the same rule, and a legacy row can still hold
// one. Rounding here would be the same defect toFixed(0) would have been.
//
// FOUR CASES, and the two null ones are different statements:
//
//   46 / 50     -> "46/50"
//   null / 50   -> "Pending"  — the slot is USED and this learner has no score
//   46 / null   -> null       — an unused slot; the caller renders NOTHING
//   null / null -> null       — nothing recorded; the caller says so
//
// `max === null` returning null rather than "46/?" is deliberate: an unused
// slot has no denominator to print, and a score without one is not a fact a
// parent can read. GRADING_SPEC §6e is the same distinction on the server —
// USED is the highest possible score, not the row.
//
// The pending case is a SENTINEL rather than a bare string so the call site
// cannot drift from it by retyping the word.
export const SCORE_PENDING = 'pending';

export function formatScorePair(score, max) {
  const maxText = formatWholeGrade(max);
  if (maxText === null) return null;
  const scoreText = formatWholeGrade(score);
  if (scoreText === null) return SCORE_PENDING;
  return `${scoreText}/${maxText}`;
}

// `whole` is opt-in, so every call site that does not pass it keeps two
// decimals. That is deliberate: the sites that must change are the six term
// and final grades, and leaving the general averages and Initial Grades
// untouched is what proves they were not caught by accident.
//
// THE VALUE BRANCH'S COLOUR IS A DEFAULT, NOT A HARDCODE (UI-A item 7,
// 2026-09-23). `className || 'text-fg'` — a caller that names a colour gets
// ONLY that colour; a caller that names none gets `text-fg` exactly as before.
//
// WHAT THE DEFECT ACTUALLY WAS: the class was unconditional, so DV4's navy
// parent hero had to pass `className="text-primary-fg"` and ended up with TWO
// colour utilities on one element, neither more specific. It rendered
// correctly only because Tailwind happened to emit `.text-primary-fg` LATER
// in the stylesheet, and DV4 had to add an assertion against the BUILT css to
// stop a reorder hiding the number again. With the default conditional, the
// losing class is never emitted at all, so there is no race left to guard.
//
// AND WHY NOT SIMPLY DROP IT AND INHERIT, which is the obvious reading:
// nothing in this app sets a base text colour — no rule on `body`, `#root` or
// in `@layer base` — so "inherit" resolves to the browser default, black.
// Inside `DataTable` that is survivable (its `<td>` sets `text-fg-secondary`),
// but the three grade-heavy screens build their own tables and set no colour
// at all: `parent/ReportCard.jsx`'s `<table className="w-full
// border-collapse text-sm">`, `teacher/ClassSummaryPage.jsx`'s, and
// `teacher/ClassRecordPage.jsx`'s score cells. Black on a dark surface is
// DV4's F1 again, pointed the other way. Pure inheritance becomes correct the
// day a base colour exists; until then the default is what makes it safe.
//
// The NULL branch keeps `text-fg-muted` unconditionally, and that is not an
// oversight: "— Pending" is muted because it is a statement about absence,
// not because of where it sits. A caller still overrides it via `className`,
// and that branch keeps the order dependence the value branch just lost —
// stated rather than hidden, since no caller needs it today.
export default function GradeValue({ value, mode, whole = false, className = '' }) {
  const formatted = whole ? formatWholeGrade(value) : formatGrade(value);

  if (formatted !== null) {
    return <span className={`tabular-nums ${className || 'text-fg'}`}>{formatted}</span>;
  }

  const reason = reasonFor(mode);

  return (
    <span className={`whitespace-nowrap text-fg-muted ${className}`} title={reason.title}>
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
    <p className={`mt-2 text-xs text-fg-muted ${className}`}>
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
