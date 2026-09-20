import { useMemo, useState } from 'react';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import GradeValue from '../../format/grade';
import TermValue from '../../format/TermValue';

// The parent's report card, shaped like the school's printed Learner's
// Performance Report (DV3, 2026-09-20). PRESENTATIONAL ONLY — it never
// fetches; the page owns the request and hands down `report`, `loading`,
// `error` and `onRetry`, exactly as a page owns DataTable's state (§5).
// Loading, error and empty render INSIDE this frame for the same reason they
// do in DataTable: so no caller has to re-implement the three-state dance.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT DataTable
// ---------------------------------------------------------------------------
// Three reasons, and the first is the one that matters:
//
//   1. THE PRINTED ORDER IS THE POINT. This card is meant to be read beside
//      the paper the school hands out. DataTable sorts, and a sortable report
//      card is not a smaller feature than this one — it is a different, wrong
//      document, because re-ordering the learning areas stops it matching.
//   2. The general-average row is IN the table and emphasised. DataTable sorts
//      every row it is given, so a summary row would sort alongside the
//      subjects it summarises (this page used to keep it outside the table for
//      exactly that reason).
//   3. Below `sm` this is term tabs plus a list — pick a term, see the
//      subjects — which is the opposite shape from DV1's `renderCard`, one
//      card per subject carrying all three terms.
//
// Being presentational is also what makes the SSR proof possible: every state
// below is reachable by passing props, with no effects and no requests.
//
// ---------------------------------------------------------------------------
// NO VERDICTS (§4), AND ONE PLACE THAT NEARLY BECAME ONE
// ---------------------------------------------------------------------------
// `descriptor` from the API is `{ descriptor, remarks }` where remarks is
// 'Passed' or 'Failed'. Only `descriptor` is ever read here, and DV3 removed
// even that from the numerical rows: the band word now appears ONCE, on the
// general average, with the legend below carrying the scale. No colour is
// keyed on a band either — tinting "Emerging" red is a verdict written in CSS.
// Grade 1 keeps letter + descriptor per cell, because a bare letter means
// nothing without its word.

// ---------------------------------------------------------------------------
// THE PRINTED SUBJECT ORDER
// ---------------------------------------------------------------------------
// `subjects` has exactly three columns — id, name, grade_level — and NO
// display-order column, so the API can only sort by name and the card was
// alphabetical by accident of the query.
//
// Grades 4-6: the SF9's own eight printed rows, transcribed in
// docs/GRADING_SPEC.md §6c and in seed.sql's Grade 4 block. That is the order
// off the report card itself.
//
// GRADE 1 IS PROVISIONAL. The school's printed order for Key Stage 1 has
// never been recorded; the only sequence this repo holds for Grade 1 is its
// CLASS PROGRAM, which is a timetable. It is used here because an observed
// school artifact beats alphabetical-by-accident, not because it is
// confirmed — see OPEN QUESTIONS. Grades 2, 3 and 5 are deliberately absent:
// no printed order is known for them, and inventing one would be worse than
// the alphabetical fallback they get instead.
//
// REVISIT TRIGGER: Expo. A second report card cannot import this constant, so
// the moment a mobile card exists the order belongs in `subjects.display_order`
// and comes down with the payload. Queued with the pre-Stage-5 server fixes.
const PRINTED_ORDER = {
  1: ['Makabansa', 'Mathematics', 'GMRC', 'Language', 'Reading'],
  4: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
  5: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
  6: ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'],
};

// A subject the printed order does not name keeps the server's own ordering
// and is APPENDED, never dropped: a learning area added to the curriculum
// must appear on the card the day it is added, even if this constant has not
// been updated for it yet. Array#sort is stable, so the unlisted tail stays in
// the alphabetical order the API sent.
function orderSubjects(subjects, gradeLevel) {
  const printed = PRINTED_ORDER[gradeLevel];
  if (!printed) return subjects;
  const rank = (name) => {
    const index = printed.indexOf(name);
    return index === -1 ? printed.length : index;
  };
  return [...subjects].sort((a, b) => rank(a.subject_name) - rank(b.subject_name));
}

// ---------------------------------------------------------------------------
// TERM STATUS — COUNTED, never computed
// ---------------------------------------------------------------------------
// "Recorded" means the same thing here as it does in routes/dashboard.js: a
// subject's term carries a value. A shell row from POST /api/grades has
// neither column set and is correctly not counted — it is a row, not a grade.
// This is counting, not grade arithmetic, so it does not cross the line that
// keeps every computed grade on the server.
//
// The dashboard's own summary cannot be reused for this: it reports only the
// LATEST term with anything in it, and the line this feeds has to describe all
// three.
function hasValue(entry, mode) {
  if (!entry) return false;
  return mode === 'descriptive' ? entry.descriptive_grade != null : entry.term_grade != null;
}

function termStatuses(subjects, mode) {
  return [1, 2, 3].map((term) => {
    const recorded = subjects.filter((subject) => hasValue(subject.terms?.[term], mode)).length;
    return {
      term,
      recorded,
      total: subjects.length,
      state: recorded === 0 ? 'none' : recorded === subjects.length ? 'full' : 'partial',
    };
  });
}

// "Term 2 and 3", "Terms 1, 2 and 3", "Term 3" — an English list, because the
// alternative ("Term 2, 3") reads like a typo on a page parents read once.
function joinTerms(terms) {
  if (terms.length === 1) return `Term ${terms[0]}`;
  const head = terms.slice(0, -1).join(', ');
  return `Terms ${head} and ${terms[terms.length - 1]}`;
}

function StatusLine({ statuses }) {
  const latest = [...statuses].reverse().find((status) => status.recorded > 0) || null;
  const missing = statuses.filter((status) => status.state === 'none').map((status) => status.term);

  if (!latest) {
    return (
      <div className="sm:text-right">
        <StatusBadge status="pending" tone="neutral" label="No grades recorded yet" />
      </div>
    );
  }

  // Green ONLY at full coverage — the rule the dashboards already follow. A
  // partial term is neutral, not amber: nothing is wrong, it is simply the
  // middle of a term.
  const label =
    latest.state === 'full'
      ? `Term ${latest.term} recorded`
      : `Term ${latest.term} partly recorded (${latest.recorded} of ${latest.total})`;

  return (
    <div className="sm:text-right">
      <StatusBadge status="recorded" tone={latest.state === 'full' ? 'success' : 'neutral'} label={label} />
      {missing.length ? (
        <p className="mt-1 text-xs text-fg-muted">{joinTerms(missing)} not yet recorded</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE DESCRIPTOR LEGENDS
// ---------------------------------------------------------------------------
// The school's printed scale, as a constant, because no endpoint exposes the
// bands. AUTHORITY: server/utils/gradeComputation.js — qualitativeDescriptor()
// for the numerical bands and DESCRIPTIVE_GRADE_MEANINGS for the letters.
// Verified equal to both on 2026-09-20. This legend never DECIDES a
// descriptor; every descriptor rendered on this card is the server's own.
const NUMERICAL_LEGEND = [
  ['90 - 100', 'Advancing'],
  ['80 - 89', 'Benchmarking'],
  ['75 - 79', 'Connecting'],
  ['65 - 74', 'Developing'],
  ['Below 65', 'Emerging'],
];

const DESCRIPTIVE_LEGEND = [
  ['A', 'Advancing'],
  ['B', 'Benchmarking'],
  ['C', 'Connecting'],
  ['D', 'Developing'],
  ['E', 'Emerging'],
];

function Legend({ mode }) {
  const rows = mode === 'descriptive' ? DESCRIPTIVE_LEGEND : NUMERICAL_LEGEND;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-body">Performance descriptors</h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([band, word]) => (
          <div key={band} className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 tabular-nums text-fg-muted">{band}</dt>
            <dd className="text-fg-secondary">{word}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "READING THIS REPORT"
// ---------------------------------------------------------------------------
// §5i: every sentence here is a claim about what the server does, so every
// sentence was checked against the handler.
//
//   "all three examination scores"  -> exPercentage() returns null unless
//                                      ST1, ST2 and TE are all present, and
//                                      initialGrade() returns null without EX.
//   "the transmutation table"       -> recomputeGrade() looks the Initial
//                                      Grade up in transmutation_table and
//                                      STORES the result as term_grade.
//   "all three terms"               -> computeFinalGrade()
//   "that term recorded"            -> computeTermAverages(), which is null
//                                      unless EVERY subject has that term
//   "every learning area"           -> computeGeneralAverage()
//   "no numerical final grade"      -> both short-circuit on mode
//   "select any grade"              -> only rendered when a grade_id exists
//
// THE GENERAL-AVERAGE SENTENCE IS TWO SENTENCES (browser check, 2026-09-20).
// One line said "the general average appears once every learning area has a
// final grade", which describes computeGeneralAverage and was silently also
// claiming to describe the three term cells beside it — a different rule, one
// level down. Two rules, two sentences.
//
// THE TRANSMUTATION LINE is the one piece of copy here that exists because of
// something the card deliberately does NOT show. Initial Grade and the weights
// stay hidden (CLAUDE.md, Parent grade breakdown), so a parent who adds up the
// raw scores in the modal gets 88% and reads 90.00 on the card with nothing to
// explain the gap. Naming the transmutation table closes that without putting
// the number that raises "why isn't this 90?" on screen. It is NOT on the
// descriptive layout: nothing is transmuted there.
//
// Nothing here explains HOW a Grade 1 letter is arrived at. That is still an
// open school question, and the sentence that used to guess at it was removed
// from the breakdown modal on 2026-09-12. Silence is the honest state.
function ReadingNote({ mode, canOpen }) {
  const lines =
    mode === 'descriptive'
      ? [
          'This grade level uses descriptive grading (A to E), so there is no numerical final grade and no general average.',
          'A term shows "Pending" until a letter has been recorded for it.',
        ]
      : [
          'A term shows "Pending" until its grade can be computed — Written Works, Performance Tasks and all three examination scores must be recorded first.',
          'Term grades follow the DepEd transmutation table, so a term grade is not the same as the percentage of the scores below.',
          'The final grade for a learning area appears once all three terms are recorded.',
          "A term's general average appears once every learning area has that term recorded.",
          'The final general average appears once every learning area has a final grade.',
        ];

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-body">Reading this report</h3>
      <ul className="mt-2 space-y-1 text-sm text-fg-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {/* ONE sentence, true of BOTH layouts. This footer sits outside the
            table/term-view switch, so it is in the DOM and read aloud on both;
            the old wording said "select a term", which is a cell click on the
            wide layout and a segment PLUS a subject row on the narrow one.
            Per-layout copy would mean two nodes, one always hidden, and a
            second place for the wording to drift. */}
        {canOpen ? <li>Select any grade to see the scores behind it.</li> : null}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ONE TERM'S VALUE, AND THE TAP TARGET
// ---------------------------------------------------------------------------
// A cell is a button ONLY when the term has a grade_id. A Pending cell is not
// a button and must not fire a request — there is nothing behind it to open.
function TermCell({ entry, mode, onOpen, label }) {
  const inner = <TermValue entry={entry} mode={mode} />;
  if (!entry?.grade_id || !onOpen) return inner;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="-mx-1 rounded px-1 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-accent"
    >
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------------------
// THE TABLE (from 36rem of CONTAINER width up — see the crossover note below)
// ---------------------------------------------------------------------------
// The horizontal scroller stays, at every width, for the reason recorded in
// DataTable: containing a too-wide table requires a scrollport, and the page
// must never scroll sideways (DV1's 200%-zoom regression). No `wrap-anywhere`
// anywhere — default wrapping breaks at spaces only, so "Mathematics" and a
// grade cannot be split.
// The rounding lives on the cells that paint, not on a frame with
// `overflow-hidden` — DV1 removed that, and a scrollport frame is what broke
// the sticky header. `first:`/`last:` are on the shared class so the corner is
// right whichever column happens to be last (descriptive mode has no Final).
const TH =
  'whitespace-nowrap bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-body first:rounded-tl-xl last:rounded-tr-xl';

//
// IN DESCRIPTIVE MODE THE FINAL-GRADE COLUMN IS NOT RENDERED AT ALL, rather
// than filled with a placeholder. §3 forbids a bare dash, and "— N/A" five
// times over is a column of noise for something that does not apply to this
// grade level at all; the sentence in "Reading this report" says it once. Same
// for the general-average row, and for the Final segment on a phone.
function DesktopTable({ subjects, mode, termAverages, generalAverage, generalAverageDescriptor, onOpenTerm }) {
  const showFinal = mode !== 'descriptive';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {showFinal
            ? 'Grades by learning area and term, with the final grade for each learning area.'
            : 'Descriptive grades by learning area and term.'}
        </caption>
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className={`${TH} text-left`}>
              Learning area
            </th>
            {[1, 2, 3].map((term) => (
              <th key={term} scope="col" className={`${TH} text-right`}>
                Term {term}
              </th>
            ))}
            {showFinal ? (
              <th scope="col" className={`${TH} text-right`}>
                Final grade
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {subjects.map((subject) => (
            <tr key={subject.subject_id} className="border-b border-edge-soft hover:bg-surface-subtle">
              <th scope="row" className="px-4 py-2.5 text-left font-normal text-fg">
                {subject.subject_name}
              </th>
              {[1, 2, 3].map((term) => (
                <td key={term} className="whitespace-nowrap px-4 py-2.5 text-right">
                  <TermCell
                    entry={subject.terms?.[term]}
                    mode={mode}
                    label={`${subject.subject_name}, term ${term} — see the scores behind this grade`}
                    onOpen={
                      onOpenTerm
                        ? () => onOpenTerm(subject.terms?.[term], subject.subject_name, term)
                        : undefined
                    }
                  />
                </td>
              ))}
              {showFinal ? (
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <GradeValue value={subject.final_grade} mode={mode} />
                </td>
              ) : null}
            </tr>
          ))}

          {/* The general-average row lives INSIDE the table, which is the
              whole reason this is not DataTable — see the header. It is
              rendered only in numerical mode: an average of letters is not a
              number, and the sentence in "Reading this report" says so
              instead of printing a row of N/A. */}
          {showFinal ? (
            <tr className="bg-brand-soft font-semibold text-fg">
              <th scope="row" className="px-4 py-3 text-left">
                General average
              </th>
              {[1, 2, 3].map((term) => (
                <td key={term} className="whitespace-nowrap px-4 py-3 text-right">
                  <GradeValue value={termAverages?.[term] ?? null} mode={mode} />
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <GradeValue value={generalAverage} mode={mode} />
                {generalAverageDescriptor ? (
                  <div className="text-xs font-normal text-fg-muted">{generalAverageDescriptor.descriptor}</div>
                ) : null}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE TERM VIEW (below 36rem of container width)
// ---------------------------------------------------------------------------
// Buttons with `aria-pressed` inside a labelled group — NOT role="tablist".
// The three existing segmented controls in this codebase are built this way
// (PasswordField, AccountInfoSection, the gallery's theme preview), every
// segment stays in the normal Tab order, and there is no roving tabindex to
// get wrong. Claiming the tabs role without implementing its arrow-key
// contract would be worse than not claiming it.
//
// "Final" is a fourth segment on purpose: the table above has a Final grade
// column, and a phone that silently drops a column is a different report. When
// term 3 is empty every row there reads Pending, which is the true state.
const SEGMENTS = [
  { key: '1', label: 'Term 1' },
  { key: '2', label: 'Term 2' },
  { key: '3', label: 'Term 3' },
  { key: 'final', label: 'Final' },
];

function TermView({
  subjects,
  mode,
  statuses,
  termAverages,
  generalAverage,
  generalAverageDescriptor,
  onOpenTerm,
}) {
  // Opens on the latest term that has anything in it — the most useful
  // default, and derivable at render, so it needs no effect and SSR proves it.
  const initial = useMemo(() => {
    const latest = [...statuses].reverse().find((status) => status.recorded > 0);
    return latest ? String(latest.term) : '1';
  }, [statuses]);
  const [selected, setSelected] = useState(initial);

  const showFinal = mode !== 'descriptive';
  const segments = showFinal ? SEGMENTS : SEGMENTS.filter((segment) => segment.key !== 'final');
  const isFinal = showFinal && selected === 'final';
  const term = isFinal ? null : Number(selected);

  return (
    <div className="p-4">
      <div role="group" aria-label="Term" className="flex flex-wrap gap-2">
        {segments.map((segment) => {
          const active = selected === segment.key;
          return (
            <button
              key={segment.key}
              type="button"
              onClick={() => setSelected(segment.key)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-accent ${
                active
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-edge-strong bg-surface text-fg-body hover:bg-surface-muted'
              }`}
            >
              {segment.label}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 divide-y divide-edge-soft">
        {subjects.map((subject) => {
          const entry = isFinal ? null : subject.terms?.[term];
          const openable = Boolean(entry?.grade_id) && Boolean(onOpenTerm);
          const value = isFinal ? (
            <GradeValue value={subject.final_grade} mode={mode} />
          ) : (
            <TermValue entry={entry} mode={mode} />
          );

          const body = (
            <>
              <span className="min-w-0 text-left text-sm text-fg">{subject.subject_name}</span>
              <span className="shrink-0 text-right">{value}</span>
            </>
          );

          return (
            <li key={subject.subject_id}>
              {openable ? (
                <button
                  type="button"
                  onClick={() => onOpenTerm(entry, subject.subject_name, term)}
                  aria-label={`${subject.subject_name}, term ${term} — see the scores behind this grade`}
                  className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-accent"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-baseline justify-between gap-3 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {showFinal ? (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-brand-soft px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-body">
            {isFinal ? 'General average' : `General average, term ${term}`}
          </span>
          <span className="text-base font-semibold text-fg">
            <GradeValue value={isFinal ? generalAverage : termAverages?.[term] ?? null} mode={mode} />
          </span>
          {isFinal && generalAverageDescriptor ? (
            <span className="w-full text-xs text-fg-muted">{generalAverageDescriptor.descriptor}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE CARD
// ---------------------------------------------------------------------------
// `schoolName` is passed in rather than read here: it comes from
// GET /api/settings, it is allowed to be missing (a failed settings read must
// not take the card down with it), and this component stays free of requests.
// `adviser` is the same — null renders "Not yet assigned", because 20 of 23
// sections genuinely have no adviser and a blank line would read as a bug.
export default function ReportCard({
  report,
  schoolName,
  adviser,
  loading,
  error,
  onRetry,
  onOpenTerm,
  emptyIcon,
  emptyTitle,
  emptyMessage,
}) {
  // ---------------------------------------------------------------------
  // THE CROSSOVER IS MEASURED ON THIS CARD, NOT ON THE WINDOW (DV3 review,
  // 2026-09-21). `@container` makes the frame a size container; the two
  // layouts below switch on `@min-[36rem]` instead of `sm:`.
  // ---------------------------------------------------------------------
  // The browser check found the full five-column table rendering at 200%
  // zoom on a 1366px window — viewport ~683px, so `sm:` (640px) was met —
  // inside a container of roughly 394px, where it scrolled sideways and the
  // Learning area column scrolled out with it, leaving rows unlabelled.
  //
  // NO VIEWPORT BREAKPOINT CAN BE RIGHT HERE, because the container is not
  // monotonic in the viewport. Shell reveals its 240px sidebar at the SAME
  // `sm`, and <main> goes from p-4 to p-6 there:
  //
  //     viewport 639px -> no sidebar, 32px padding -> 607px of card
  //     viewport 640px -> sidebar + 48px padding   -> 351px of card
  //
  // Crossing `sm` upward CUTS the card from 607px to 351px, so the table
  // switched on at the one width where its container was narrowest it would
  // ever be. Raising the breakpoint moves that cliff; it does not remove it.
  //
  // 36rem = 576px, against a measured-by-arithmetic minimum of ~558px for
  // the widest realistic row: the four `nowrap` headers (~144 + 80×3 + 120
  // with px-4 either side) against body cells of "Panlipunan" (~107) and
  // "— Pending" (~98 each). 30rem was considered and is too low — at 480px
  // the table still overflows and the reported defect returns in a narrower
  // window. The estimate is arithmetic, not a measurement, and the trade is
  // deliberately asymmetric: too low reproduces the defect, too high shows a
  // layout that works. `overflow-x-auto` stays either way, so a wrong guess
  // degrades to a scroller rather than to breakage.
  //
  // DELIBERATE INCONSISTENCY: every DataTable page still crosses over on
  // `sm:` viewport width. This card is a fixed-width document with a known
  // minimum, which is what makes a container threshold meaningful for it.
  // A future browser check must MEASURE THE CARD, not the window — a
  // container query does not move with the responsive-mode width readout.
  const frame = '@container rounded-xl border border-edge bg-surface';

  const student = report?.student ?? null;
  const mode = report?.grading_mode ?? 'numerical';
  const subjects = useMemo(
    () => orderSubjects(report?.subjects ?? [], student?.grade_level),
    [report?.subjects, student?.grade_level]
  );
  const statuses = useMemo(() => termStatuses(subjects, mode), [subjects, mode]);
  const canOpen = subjects.some((subject) => [1, 2, 3].some((term) => subject.terms?.[term]?.grade_id));

  const header = (
    <div className="border-b border-edge px-4 py-4 sm:flex sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">Learner&rsquo;s Performance Report</h2>
        {schoolName ? <p className="text-sm text-fg-secondary">{schoolName}</p> : null}
        {report?.school_year ? (
          <p className="text-xs text-fg-muted">School year {report.school_year}</p>
        ) : null}
      </div>
      {report && subjects.length ? (
        <div className="mt-3 sm:mt-0">
          <StatusLine statuses={statuses} />
        </div>
      ) : null}
    </div>
  );

  // The info row is part of the document, so it renders whenever the payload
  // exists — including on an all-Pending card, which is the normal state for
  // most of the school year. NO LRN anywhere (§5c): `student` is
  // { id, first_name, last_name, grade_level, section } and has none in it.
  const info = student ? (
    <dl className="grid gap-x-6 gap-y-2 border-b border-edge px-4 py-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs uppercase tracking-wider text-fg-muted">Learner</dt>
        <dd className="text-fg">
          {student.first_name} {student.last_name}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-fg-muted">Grade &amp; section</dt>
        <dd className="text-fg">
          Grade {student.grade_level} - {student.section}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-fg-muted">Adviser</dt>
        <dd className={adviser ? 'text-fg' : 'text-fg-muted'}>{adviser || 'Not yet assigned'}</dd>
      </div>
    </dl>
  ) : null;

  if (error) {
    return (
      <div className={frame}>
        {header}
        <div className="p-4">
          <ErrorAlert message={error} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={frame}>
        {header}
        <LoadingSpinner className="py-12" />
      </div>
    );
  }

  if (!report || !subjects.length) {
    return (
      <div className={frame}>
        {header}
        <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className={frame}>
      {header}
      {info}

      <div className="hidden @min-[36rem]:block">
        <DesktopTable
          subjects={subjects}
          mode={mode}
          termAverages={report.term_averages}
          generalAverage={report.general_average}
          generalAverageDescriptor={report.general_average_descriptor}
          onOpenTerm={onOpenTerm}
        />
      </div>

      <div className="@min-[36rem]:hidden">
        <TermView
          subjects={subjects}
          mode={mode}
          statuses={statuses}
          termAverages={report.term_averages}
          generalAverage={report.general_average}
          generalAverageDescriptor={report.general_average_descriptor}
          onOpenTerm={onOpenTerm}
        />
      </div>

      <div className="space-y-4 border-t border-edge px-4 py-4">
        <Legend mode={mode} />
        <ReadingNote mode={mode} canOpen={canOpen} />
      </div>
    </div>
  );
}
