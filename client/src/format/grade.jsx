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

// `formatWholeGrade` lives in `./scorePair.js` (UI-A, 2026-09-23) — a plain
// module, because this file's exports are components and a function export
// beside them trips `react(only-export-components)`. The whole-number rule is
// shared with a raw score pair and there is exactly one implementation of it.
import { formatWholeGrade } from './scorePair';

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

// `whole` is opt-in, so every call site that does not pass it keeps two
// decimals. That is deliberate: the sites that must change are the six term
// and final grades, and leaving the general averages and Initial Grades
// untouched is what proves they were not caught by accident.
//
// THE VALUE BRANCH'S COLOUR WAS A DEFAULT, NOT A HARDCODE (UI-A item 7,
// 2026-09-23): `className || 'text-fg'` — a caller that named a colour got
// ONLY that colour; one that named none got `text-fg`. Since UI-D (below) it
// sets no colour at all: the code is `tabular-nums ${className}`.
//
// WHAT THE DEFECT ACTUALLY WAS: the class was unconditional, so DV4's navy
// parent hero had to pass `className="text-primary-fg"` and ended up with TWO
// colour utilities on one element, neither more specific. It rendered
// correctly only because Tailwind happened to emit `.text-primary-fg` LATER
// in the stylesheet, and DV4 had to add an assertion against the BUILT css to
// stop a reorder hiding the number again. With the default conditional, the
// losing class is never emitted at all, so there is no race left to guard.
//
// AND IT IS NOW PURE INHERITANCE (UI-D, 2026-09-25). The default existed for
// one reason: nothing in this app set a base text colour — no rule on `body`,
// `#root` or in `@layer base` — so "inherit" resolved to the browser default,
// black, and the grade-heavy screens that build their own tables
// (`parent/ReportCard.jsx`, `teacher/ClassSummaryPage.jsx`,
// `teacher/ClassRecordPage.jsx`) would have rendered black on a dark surface:
// DV4's F1 again, pointed the other way. `index.css` sets
// `body { color: var(--color-fg) }` as of UI-D, so that reason is spent and
// the element sets no colour at all.
//
// ONE CALL SITE CHANGES COLOUR, AND IT IS A DELIBERATE ACCEPTANCE.
// Inheritance resolves against the nearest COLOURED ancestor, which is not
// always `body`: inside `DataTable` it is the `<td>`, and that sets
// `text-fg-secondary`. So a grade rendered in a DataTable column —
// `admin/GradesPage.jsx`'s Final Grade — moves from `fg` to `fg-secondary`.
// Kept rather than pinned back with an explicit `text-fg` (Darryl,
// 2026-09-25): every other cell in that table is `fg-secondary`, and a grade
// that disagreed with the cells beside it would be the odder result. The
// bespoke tables have no coloured ancestor between the cell and `body`, so
// they get `fg` exactly as before.
//
// The NULL branch keeps `text-fg-muted` unconditionally, and that is not an
// oversight: "— Pending" is muted because it is a statement about absence,
// not because of where it sits. A caller still overrides it via `className`,
// and that branch keeps the order dependence the value branch just lost —
// stated rather than hidden, since no caller needs it today.
export default function GradeValue({ value, mode, whole = false, className = '' }) {
  const formatted = whole ? formatWholeGrade(value) : formatGrade(value);

  if (formatted !== null) {
    return <span className={`tabular-nums ${className}`}>{formatted}</span>;
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
