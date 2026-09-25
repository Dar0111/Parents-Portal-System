import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import FormField, { filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScrollCue from '../../components/ScrollCue';
import { timestampDay, todayLocalDateString } from '../../format/date';
import GradeValue from '../../format/grade';
import { currentTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
import { usePageTitle } from '../../layout/usePageTitle';
import { useAuth } from '../../auth/AuthContext';

// Teacher → Class summary — the adviser's Summary of Grades (CR3).
//
// One learner per row, every subject across the row, the General Average at
// the end. This is the sheet an adviser compiles from the subject teachers'
// class records, and it is READ-ONLY: the adviser is not the encoder. Encode
// authority is the subject teacher's, and the class record (Teacher → Grades)
// is where encoding happens.
//
// ---------------------------------------------------------------------------
// NO GRADE ARITHMETIC HAPPENS HERE, INCLUDING THE GENERAL AVERAGE
// ---------------------------------------------------------------------------
// Every number on screen came from `GET /api/grades/class-summary`. The
// General Average in particular is computed server-side, through the same
// helpers the parent report card uses, so a learner's figure here and on
// their own card cannot disagree in the last digit. Averaging the row in this
// file would be a second implementation of a DepEd rule — the exact thing the
// class record refuses to do for Initial Grades.
//
// ---------------------------------------------------------------------------
// WHY NOT DataTable (§5)
// ---------------------------------------------------------------------------
// Same exemption as the report card and the class record: this is a MATRIX,
// not a list of records. Its columns are the class's own learning areas in the
// school's printed order (CR3a), and sorting the rows would produce a
// different document rather than a filtered one. **No `renderCard` below
// `sm`** either — one card per learner destroys the cross-subject comparison
// that is the whole reason this sheet exists; it scrolls sideways instead,
// with the learner column pinned.
//
// ---------------------------------------------------------------------------
// WHICH SECTION, AND WHY GET /api/sections
// ---------------------------------------------------------------------------
// There is no "sections I advise" endpoint, and none was added: GET
// /api/sections is `authenticate`-only and already returns `adviser_id` per
// section, so the filter is `adviser_id === user.id` over a list of 23. A new
// endpoint for a client-side filter over two dozen rows would be a server
// change to save one predicate.
//
// A teacher who advises nothing gets the explained empty state rather than a
// hidden nav item: `nav.js` has three states — built, blocked, unbuilt (§6) —
// and none of them means "exists but not for you". Inventing a fourth for one
// page would be a real convention change; a page that explains itself is not.

const TERMS = [1, 2, 3];

// The completeness line under each subject header. COUNTED, NEVER CONCLUDED
// (§4): it says how many learners have a mark, never whether the class is
// behind. "Complete" is a statement about the count reaching the class size,
// not a verdict on anyone.
function Completeness({ entry }) {
  if (!entry || entry.total === 0) return null;
  const pending = entry.total - entry.recorded;
  return (
    <div className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-fg-muted">
      {pending === 0 ? 'Complete' : `${pending} pending`}
    </div>
  );
}

// THE MATRIX IS PRESENTATIONAL AND EXPORTED, for the same reason ReportCard
// is: a component that fetches its own data cannot be proved by
// `renderToStaticMarkup`, which runs no effects and would only ever render the
// spinner (§5h). Splitting the table out makes every state below reachable by
// passing props — the Pending cell, the absent General Average column on a
// Key Stage 1 payload, the sticky column — so the SSR proof asserts the real
// markup instead of asserting that a loading state loads.
//
// It takes `data` exactly as the API returns it. No defaulting, no
// normalising: if a key is missing the proof should show that, not paper over
// it.
export function ClassSummaryTable({ data }) {
  const subjects = data?.subjects ?? [];
  const learners = data?.learners ?? [];
  const showGeneralAverage = data?.show_general_average === true;
  const isFinal = data?.show_final === true;

  const completenessBySubject = new Map();
  for (const entry of data?.completeness ?? []) completenessBySubject.set(entry.subject_id, entry);

  // Sticky cells need an OPAQUE background of their own, repainted on hover,
  // or the scrolled columns show through them (§13c). That is the cost §5
  // named for a sticky column and it is paid per cell, which is why this is a
  // per-page decision and not a DataTable default.
  const stickyCell =
    'sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2 text-left font-normal group-hover:bg-surface-subtle';

  return (
    // `ScrollCue` owns the scroller now (UI-D-2) — it applies
    // `print-sheet-scroller` itself, so the print behaviour §18c describes is
    // unchanged: `overflow-x-auto` and `min-w-max` are both released on
    // paper, which is what stopped five of eight subjects going missing.
    //
    // THE COUNT IS THE WORDING HERE because these columns are learning areas
    // and a number is the useful answer: a teacher who is told "6 more
    // subjects" knows what they have not seen. The class record names its
    // groups instead, for the opposite reason (`components/scrollCueState.js`).
    //
    // The cells measured are the ONE header row's, which is every column:
    // learner, each learning area, and the Average. `offsetLeft +
    // offsetWidth` is measured against the scroller's own content box, so a
    // page scrolled vertically cannot shift it.
    <ScrollCue
      ariaLabel="Class summary, scrolls sideways"
      measureCells={(el) =>
        Array.from(el.querySelectorAll('thead tr:last-child th')).map((th) => ({
          right: th.offsetLeft + th.offsetWidth,
        }))
      }
      describe={({ hiddenCount }) => {
        if (hiddenCount < 1) return null;
        // The Average is the last column, so when anything is hidden it is
        // among them — name it rather than folding it into the count, since
        // "7 more subjects" would be wrong by one and the Average is the
        // column a teacher is most likely to be looking for.
        const subjectsHidden = showGeneralAverage ? hiddenCount - 1 : hiddenCount;
        if (showGeneralAverage && subjectsHidden < 1) return 'Swipe for the Average →';
        const noun = subjectsHidden === 1 ? 'subject' : 'subjects';
        return showGeneralAverage
          ? `Swipe for ${subjectsHidden} more ${noun} and the Average →`
          : `Swipe for ${subjectsHidden} more ${noun} →`;
      }}
    >
      <table className="print-sheet-table w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge bg-surface-subtle text-xs uppercase tracking-wider text-fg-muted">
            <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-surface-subtle px-3 py-2 text-left">
              Learner
            </th>
            {subjects.map((subject) => (
              <th key={subject.id} scope="col" className="whitespace-nowrap px-3 py-2 text-center align-top">
                {subject.name}
                {!isFinal && <Completeness entry={completenessBySubject.get(subject.id)} />}
              </th>
            ))}
            {showGeneralAverage && (
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-center align-top">
                {isFinal ? 'General Average' : 'Average'}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {learners.map((learner) => (
            <tr key={learner.student_id} className="group border-b border-edge last:border-0 hover:bg-surface-subtle">
              <th scope="row" className={stickyCell}>
                {/* The internal student id, never the LRN (§5c). A name is not
                    an identifier, and this is a teacher surface, but the rule
                    is about what goes in the URL. */}
                <Link
                  to={`/teacher/class-summary/${learner.student_id}`}
                  className="rounded text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {learner.last_name}, {learner.first_name}
                </Link>
              </th>
              {subjects.map((subject, index) => {
                const cell = learner.cells?.[index];
                return (
                  <td key={subject.id} className="whitespace-nowrap px-3 py-2 text-center tabular-nums">
                    {/* TermValue, NOT GradeValue directly — and the SSR proof
                        is what caught the difference. A descriptive LETTER is
                        not one of GradeValue's four states:
                        formatGrade('A') is Number('A') -> NaN -> null, so
                        every Grade 1 cell would have rendered "— N/A" on the
                        one value that does apply. TermValue exists for
                        exactly that, and it also sets `whole` once for every
                        term cell in the system so they cannot drift.
                        A null is Pending in BOTH modes here: an unrecorded
                        letter is "not yet recorded", not "inapplicable". */}
                    <TermValue
                      entry={
                        data?.grading_mode === 'descriptive'
                          ? { descriptive_grade: cell?.value ?? null }
                          : { term_grade: cell?.value ?? null }
                      }
                      mode={data?.grading_mode}
                    />
                  </td>
                );
              })}
              {showGeneralAverage && (
                <td className="whitespace-nowrap px-3 py-2 text-center font-semibold tabular-nums">
                  {/* TWO DECIMALS, not `whole`: the General Average is the one
                      figure on this sheet that keeps them (GRADING_SPEC §4a —
                      721/8 prints as 90.13). */}
                  <GradeValue value={learner.general_average ?? null} mode={data?.grading_mode} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollCue>
  );
}

// Exported for the same reason: the proof asserts the copy a teacher who
// advises nothing actually sees.
export function NoAdvisoryState() {
  return (
    <EmptyState
      icon="fa-table-list"
      title="Class summary is for class advisers"
      message="You are not assigned as an adviser of any section. An admin assigns advisers; your subject classes are under Grades."
    />
  );
}

export default function ClassSummaryPage() {
  usePageTitle('Class summary');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  // THE "PRINTED" DATE IS STATE, NOT A RENDER-TIME READ (UI-D).
  //
  // The first version called `timestampDay(Date.now())` straight in the JSX
  // and oxlint's `react(purity)` rule refused it — correctly. `Date.now()` in
  // a render body is an impure read: the value changes on every re-render, so
  // the same component can produce two different documents from the same
  // props. A lazy `useState` initialiser runs once instead.
  //
  // AND `beforeprint` REFRESHES IT, which is not belt-and-braces — it is what
  // makes the line true. A teacher who leaves this tab open overnight and
  // prints in the morning would otherwise hand out a sheet dated yesterday,
  // and a wrong date on a record the school keeps is worse than no date.
  // Safari fires no `beforeprint`, which is exactly why the lazy initialiser
  // supplies a real value rather than an empty string.
  const [printedAt, setPrintedAt] = useState(() => timestampDay(Date.now(), { style: 'long' }));
  useEffect(() => {
    const refresh = () => setPrintedAt(timestampDay(Date.now(), { style: 'long' }));
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);

  const [settings, setSettings] = useState(null);
  const [sections, setSections] = useState(null);
  const [sectionsError, setSectionsError] = useState(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        // A missing settings read must not take the page down: it only
        // supplies the school's name for the print masthead (the term comes
        // from the school calendar since pre-Stage-5 #7, not from here). The
        // summary request carries no school_year, so the server uses its own
        // academic_year — one source, not this one.
        if (!cancelled) setSettings({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setSections(rows);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The sections THIS teacher advises. An admin opening the page sees every
  // section — the endpoint authorises them and the summary does too, so
  // hiding it here would be the client inventing a narrower rule than the API.
  const advised = useMemo(() => {
    if (!sections) return null;
    if (user?.role === 'admin') return sections;
    return sections.filter((s) => Number(s.adviser_id) === Number(user?.id));
  }, [sections, user]);

  const sectionParam = params.get('section');
  const selected = useMemo(() => {
    if (!advised || advised.length === 0) return null;
    const asked = advised.find((s) => String(s.id) === String(sectionParam));
    return asked || advised[0];
  }, [advised, sectionParam]);

  // THE TERM IS PINNED FOR THE LIFE OF THE PAGE (pre-Stage-5 #7): the default
  // comes from the school calendar, derived ONCE in a lazy initialiser and
  // written into the URL with `replace` — the same discipline as the class
  // record, so a sheet open across a term boundary does not change under the
  // teacher. 'final' is a URL-only value; nothing defaults to it.
  const [pinnedTerm] = useState(() => currentTerm(todayLocalDateString()));
  const termParam = params.get('term');
  const term = useMemo(() => {
    if (termParam === 'final') return 'final';
    const n = Number(termParam);
    if (TERMS.includes(n)) return n;
    return pinnedTerm;
  }, [termParam, pinnedTerm]);

  useEffect(() => {
    const asked = params.get('term');
    if (asked === 'final' || TERMS.includes(Number(asked))) return;
    const next = new URLSearchParams(params);
    next.set('term', String(pinnedTerm));
    setParams(next, { replace: true });
  }, [params, setParams, pinnedTerm]);

  const load = useCallback(() => {
    if (!selected) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      grade_level: String(selected.grade_level),
      section: selected.name,
      term: String(term),
    });
    api
      .get(`/grades/class-summary?${query}`, {
        // EVERY KEY THE PAGE READS IS NAMED. The array form copies only what
        // is listed, so a key left out is silently `undefined` and renders as
        // a plausible empty value rather than an error (§1 — DV3 lost
        // `term_averages` this way for a week). When the endpoint gains a
        // field, this list is the line to change.
        unwrap: [
          'section',
          'school_year',
          'term',
          'grading_mode',
          'show_final',
          'show_general_average',
          'subjects',
          'learners',
          'completeness',
        ],
      })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractError(err));
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, term]);

  useEffect(() => load(), [load]);

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    setParams(next);
  }

  // ---- the two states that are not the table ----

  if (sectionsError) {
    return (
      <div className="space-y-4">
        <Header />
        <ErrorAlert message={sectionsError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (advised === null) {
    return (
      <div className="space-y-4">
        <Header />
        <LoadingSpinner label="Loading your classes…" />
      </div>
    );
  }

  if (advised.length === 0) {
    return (
      <div className="space-y-4">
        <Header />
        <NoAdvisoryState />
      </div>
    );
  }

  const learners = data?.learners ?? [];

  return (
    <div className="space-y-4">
      {/* LANDSCAPE FOR THIS PAGE ONLY (UI-D). `@page` is a DOCUMENT-level
          rule — it cannot be nested under a class or an ancestor selector —
          so there is no way to scope one from `index.css`. The two options
          are a NAMED page (`@page summary` + `page: summary`), which Firefox
          does not support, or inserting the rule only while this route is
          mounted. This is the second: React mounts and unmounts the <style>
          with the page, so the report card at /teacher/class-summary/:id
          stays portrait with nothing to clean up.

          COVERAGE, stated rather than assumed: `size` in `@page` works in
          Chrome and Edge, and in Firefox from 122. SAFARI IGNORES IT — the
          reader picks orientation in the print dialog. That is survivable
          precisely because the print block also releases `min-w-max`, so a
          portrait sheet comes out cramped rather than clipped. */}
      <style media="print">{'@page { size: landscape; margin: 10mm; }'}</style>

      {/* THE PRINTED SHEET'S MASTHEAD. On screen the Shell supplies the
          school and the page name; print hides the Shell, so a printout
          would otherwise be an unlabelled grid of letters. `print-only`,
          because on screen every one of these facts is already visible in
          the header, the Class select and the line below it. */}
      <div className="print-only mb-3 border-b border-edge pb-2">
        <p className="text-base font-semibold">
          {settings?.school_name || 'Captain H. Francisco Elementary School'}
        </p>
        <p className="text-sm">
          Summary of Grades
          {data?.school_year ? ` · School year ${data.school_year}` : ''}
          {' · '}
          {data?.show_final === true ? 'Final' : `Term ${term}`}
        </p>
        <p className="text-sm">
          {selected ? `Grade ${selected.grade_level} - ${selected.name}` : ''}
          {data?.section?.adviser_name ? ` · Adviser: ${data.section.adviser_name}` : ''}
        </p>
        {/* The instant is formatted by `format/date.js`, never computed here
            (§5a-iv), and it resolves through Asia/Manila — the date a school
            record belongs to is a fact about the school, not about the
            machine the printout came off. */}
        <p className="text-xs">Printed {printedAt}</p>
      </div>

      <Header />

      {/* The filters choose WHICH sheet to print; on the sheet itself they
          are chrome. Per-page `print:hidden` rather than a blanket rule in
          `index.css`, because which controls are noise is a per-page
          judgment — the report card's term links are not. */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {advised.length > 1 && (
          <FormField label="Class" as="select" value={String(selected?.id ?? '')} onChange={(e) => setParam('section', e.target.value)} className={filterSelectClass}>
            {advised.map((s) => (
              <option key={s.id} value={s.id}>
                Grade {s.grade_level} - {s.name}
              </option>
            ))}
          </FormField>
        )}
        <FormField label="Term" as="select" value={String(term)} onChange={(e) => setParam('term', e.target.value)} className={filterSelectClass}>
          {TERMS.map((t) => (
            <option key={t} value={t}>
              Term {t}
            </option>
          ))}
          <option value="final">Final</option>
        </FormField>
      </div>

      {advised.length === 1 && selected && (
        /* `print:hidden` — the masthead above already carries the class and
           the adviser, and printing both would say each twice (UI-D). */
        <p className="text-sm text-fg-muted print:hidden">
          Grade {selected.grade_level} - {selected.name}
          {data?.section?.adviser_name ? ` · Adviser: ${data.section.adviser_name}` : ''}
        </p>
      )}

      <div className="rounded-xl border border-edge bg-surface">
        {error ? (
          <div className="p-4">
            <ErrorAlert message={error} onRetry={load} />
          </div>
        ) : loading ? (
          <div className="p-6">
            <LoadingSpinner label="Loading the class summary…" />
          </div>
        ) : learners.length === 0 ? (
          <EmptyState
            icon="fa-user-graduate"
            title="No learners in this class yet"
            message="Learners appear here once they are enrolled in this section."
          />
        ) : (
          <ClassSummaryTable data={data} />
        )}
      </div>

      {/* A statement about who may EDIT this screen. Paper cannot be edited,
          so it says nothing to a reader holding the sheet (UI-D). */}
      <p className="text-xs text-fg-muted print:hidden">
        Read-only. Grades are encoded by each subject&apos;s teacher under Grades.
      </p>
    </div>
  );
}

function Header() {
  return (
    // NO <h1>: Shell renders this page's from `nav.js`, and a second one
    // made "Class summary" appear twice and gave the document two top-level
    // headings. The subtitle stays — it is not in the nav label.
    // `print:hidden`: on paper the masthead names the sheet, and a standing
    // description of the screen is chrome (UI-D).
    <p className="text-sm text-fg-muted print:hidden">
      Every learner in your advisory section, across every learning area.
    </p>
  );
}
