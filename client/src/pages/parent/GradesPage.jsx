import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import { shortDate } from '../../format/date';
import GradeValue from '../../format/grade';
import { SCORE_PENDING, formatScorePair } from '../../format/scorePair';
import TermValue from '../../format/TermValue';
import ReportCard from './ReportCard';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent report card — READ ONLY, and the first feature page to consume
// GradeValue (convention 3). Every absence below is deliberate.
//
// DV3 (2026-09-20) rebuilt the document itself into `ReportCard.jsx` — the
// printed order, the in-table general-average row, the descriptor legend and
// the phone's term view all live there, and this file is now the request
// layer plus the breakdown modal. The reasoning for leaving DataTable is in
// that file's header; what did NOT change is everything below, which is why
// it is still written down here.
//
// NO WRITES OF ANY KIND. All seven write endpoints on /api/grades are
// authorize('teacher','admin') or authorize('admin'), so a parent never
// reaches a handler — the middleware answers 403 "Access denied." first, a
// generic refusal with no reason in it. That is precisely why none of them may
// be offered on screen: a scope refusal at least explains itself, a role
// refusal does not. Same anti-dead-end rule as the Students page's absent Edit
// button. Interactive elements: DataTable's two sort headers, and a term cell
// that has a grade_id (opens the breakdown modal). Pending / null terms are
// not buttons and must not fire a request.
//
// TWO READS. The card is GET /api/grades/student/:studentId (seven-key unwrap).
// GET / is still not called: it returns bare grade rows with no subject-
// coverage overlay, so a subject with zero grade rows would vanish. GET /:id
// is called only when a parent taps a term that already has a grade_id —
// team product decision 2026-09-11 (transparency: where a mark came from),
// not a school-visit answer. The school has still not been asked. If they
// later forbid raw scores, this modal goes; the endpoint stays. Unwrap
// ['grade', 'grade_components', 'descriptor']. Modal, not a :id route
// (convention 5c — no LRN, and grade_id is not a shareable destination).
//
// THE CHILD ID COMES FROM useAuth() AND IS USED FOR THE PATH, NOTHING ELSE.
// /auth/me also returns login_id, student_first_name, student_last_name,
// grade_level and section — none of them are read here. There is no lrn
// key (a parent's login_id IS the child's LRN). The header is sourced
// from the report payload's own `student` object instead, and that is what
// makes convention 5c STRUCTURAL rather than a matter of remembering: that
// object is exactly { id, first_name, last_name, grade_level, section } with
// NO lrn in it to leak. A parent's login_id IS their child's LRN, so it is
// half of a live credential. Nothing puts it on screen, in the URL, or in an
// error string — and the route is /parent/grades with no :id at all, because a
// parent has exactly one child.
//
// TWO MORE READS, BOTH DELIBERATELY NON-BLOCKING (DV3). The school name comes
// from GET /api/settings (`authenticate` only — every role may read the
// allow-listed keys) rather than a second hardcoded copy of the string on
// Login.jsx, which has to hardcode it because it runs before there is a token.
// The adviser's name comes from GET /api/sections?grade_level=…, matched on
// the section NAME and school year, because the report card payload has no
// adviser in it. NEITHER failure may take the card down: each has its own
// state and renders as absent, because a report card without a school name is
// still a report card, and an ErrorAlert about /settings over a page of real
// grades would be a lie about what failed.
//
// NO FILTERS. student_id is fixed (naming another child is 403 — a control
// whose only other value is a refusal is not a filter); subject_id and term
// would filter eight visible rows, which is what the eye already does, and
// this endpoint does not accept term anyway. school_year IS accepted and
// defaults to system_settings.academic_year, but the seed holds exactly one
// year and no endpoint anywhere lists the years that exist — so a picker is
// either a free-text box that mostly generates 400s or a hardcoded list that
// invents data. REVISIT TRIGGER: a second school_year in `grades`, or an
// endpoint that exposes the available years.
//
// NO VERDICTS (convention 4). qualitativeDescriptor() returns
// { descriptor, remarks } where remarks is 'Passed' or 'Failed'. Only
// `descriptor` is rendered — never `remarks`, in any form: not as text, not
// through StatusBadge (which this file does not import), and never as a colour
// keyed on the band, since tinting "Emerging" red is a verdict expressed in
// CSS. The band word itself is DepEd's own SF9 vocabulary and a deterministic
// restatement of the number, not a judgement the system formed;
// routes/grades.js quotes GRADING_SPEC §6b directly — "the parent dashboard
// should show the numeric grade AND the descriptor". The modal follows the
// same rule. Initial Grade and component weights are deliberately omitted:
// IG is not on this card, and showing it would introduce the exact number
// that raises "why isn't this 90?" (transmutation). The modal answers where
// the scores came from, not how DepEd turns them into a term grade.
//
// is_locked is on every term entry and is NOT rendered. A parent cannot act on
// it, and it reads either as "final" — a promise the system should not make,
// since an admin can unlock — or as "hidden from you", which is false.

// The value inside a term cell (number, letter, Pending, N/A) is TermValue in
// format/TermValue.jsx — extracted 2026-09-14 when Admin → Grades became the
// third copy (this page's TermDisplay and Teacher → Grades' TermCell were
// identical). That file carries the FINDING C note on why a descriptive letter
// is handled outside GradeValue. This page keeps only its own wrapper below.

const DETAIL_UNWRAP = ['grade', 'grade_components', 'descriptor'];

// The raw scores behind a term grade. THE FORMATTING IS NOT HERE — it is
// `formatScorePair` in `format/scorePair.js`, beside `formatWholeGrade`, since
// "46.00" and "46" is the same rule as a Term Grade's and belongs in the same
// file rather than being reimplemented next to the markup that shows it.
//
// This printed "46.00/50.00" until UI-A (2026-09-23): every stored score has
// been a whole number since CR0 while the columns stayed DECIMAL(5,2), so
// mysql2's strings reached the screen verbatim — on the one grades screen
// parents read.
export function ScorePair({ score, max }) {
  if (score == null && max == null) {
    return <span className="text-sm text-fg-muted">Not yet recorded</span>;
  }

  const pair = formatScorePair(score, max);

  // No highest possible score means the slot is UNUSED, and an unused slot
  // has no denominator to print. Rendering nothing is the honest answer;
  // "46/?" would invent one.
  if (pair === null) return null;

  // Used, but this learner has no score for it — which is exactly the case
  // that must not read as a zero.
  if (pair === SCORE_PENDING) {
    return <span className="text-sm text-fg-muted">Pending</span>;
  }

  return <span className="tabular-nums text-sm text-fg">{pair}</span>;
}

function ComponentList({ title, rows, empty }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-edge-soft">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm text-fg-secondary">{row.label}</p>
                {/* SHORT, not long, and the brief did not name this site:
                    it is a per-row secondary line in a dense list of
                    assessments, which is a table row's shape rather than a
                    reading view's. `date_recorded` is a DATE column
                    (schema.sql:319), so this is string surgery on the
                    literal "2026-09-25" — nothing parsed, nothing shifted
                    (§5a-iv). */}
                {row.date_recorded ? (
                  <p className="text-xs text-fg-muted">{shortDate(row.date_recorded)}</p>
                ) : null}
              </div>
              <ScorePair score={row.score} max={row.max_score} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Grade 1 calls the same three columns Summative, not Examinations — the
// school's word for Key Stage 1. Same ex_st1 / ex_st2 / ex_te values; only
// the heading and the empty line differ, and they are derived from one flag
// so they cannot disagree with each other.
function ExamList({ grade, mode }) {
  const summative = mode === 'descriptive';
  const title = summative ? 'Summative' : 'Examinations';
  const lines = [
    { key: 'st1', label: 'ST1', score: grade?.ex_st1, max: grade?.ex_st1_max },
    { key: 'st2', label: 'ST2', score: grade?.ex_st2, max: grade?.ex_st2_max },
    { key: 'te', label: 'TE', score: grade?.ex_te, max: grade?.ex_te_max },
  ];
  const anyRecorded = lines.some((line) => line.score != null || line.max != null);

  return (
    <section>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {!anyRecorded ? (
        <p className="mt-1 text-sm text-fg-muted">
          No {summative ? 'summative' : 'examination'} scores recorded yet
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-edge-soft">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <p className="text-sm text-fg-secondary">{line.label}</p>
              <ScorePair score={line.score} max={line.max} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BreakdownBody({ mode, detail }) {
  const grade = detail.grade;
  const components = detail.grade_components || [];
  const ww = components.filter((row) => row.type === 'WW');
  const pt = components.filter((row) => row.type === 'PT');
  const hasExam =
    grade.ex_st1 != null ||
    grade.ex_st2 != null ||
    grade.ex_te != null ||
    grade.ex_st1_max != null ||
    grade.ex_st2_max != null ||
    grade.ex_te_max != null;
  const hasRecordedBreakdown = ww.length > 0 || pt.length > 0 || hasExam;

  if (mode === 'descriptive') {
    return (
      <div className="space-y-3">
        <div>
          <TermValue
            entry={{
              descriptive_grade: grade.descriptive_grade,
              descriptor: detail.descriptor,
            }}
            mode="descriptive"
          />
        </div>
        {/*
          NO NUMBER BESIDE THE LETTER. A Grade 1 row now carries a real
          `initial_grade` — the letter is computed from it — and this payload
          contains that number, because GET /:id returns the whole grade row.
          Key Stage 1 reports letters to parents and not the score behind
          them, so it is deliberately not rendered here, and nothing in this
          branch may print it: not as a subtitle, not as a tooltip, not as
          "out of 100". A teacher sees it on the encode screen; a parent does
          not see it anywhere.

          Nor does anything here explain HOW the letter is produced. The rule
          exists now (GRADING_SPEC §6a) and naming a threshold would put the
          number on screen through the copy. The sentence removed on
          2026-09-12 stays removed, for a different reason than before.
        */}
        {/* The WW / PT / Summative scores are what this modal is FOR — the
            same question a Grade 6 parent asks, "where did this come from".
            Since 2026-09-22 a Grade 1 row really has them, so this is the
            normal path rather than the hedge it used to be. */}
        {hasRecordedBreakdown ? (
          <div className="space-y-4 border-t border-edge-soft pt-3">
            {ww.length > 0 ? (
              <ComponentList title="Written Works" rows={ww} empty="" />
            ) : null}
            {pt.length > 0 ? (
              <ComponentList title="Performance Tasks" rows={pt} empty="" />
            ) : null}
            {hasExam ? <ExamList grade={grade} mode={mode} /> : null}
          </div>
        ) : (
          // THIS BRANCH IS NOW THE LEGACY CASE ONLY, and the copy changed with
          // it (2026-09-22). It used to describe every Grade 1 row: numerical
          // encodes against a descriptive row were 400, so no Grade 1 grade
          // could have component scores at all. That is no longer true, and
          // "not recorded for this grade level" would now be a false claim
          // about the write path (§5i) on any row encoded from today on.
          //
          // What reaches it instead is a row carrying a letter that was typed
          // before the rule changed — in the seed, Nino's five. Those keep
          // their letters and have no scores behind them, ever. The sentence
          // says that about the ROW, not about the grade level.
          //
          // Found in the browser check (2026-09-20) and still the reason this
          // says something rather than suppressing the modal: with no
          // components the dialog showed the letter and its descriptor —
          // exactly what the cell the parent tapped already showed — which
          // degrades without error but reads as broken.
          <p className="border-t border-edge-soft pt-3 text-sm text-fg-muted">
            This grade was recorded before scores were kept for this learning area, so there is nothing to show
            behind it.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {/* The modal header. `whole` so it reads "90 Advancing", matching the
            cell the parent tapped to open it — the two must not disagree. */}
        <GradeValue value={grade.term_grade} mode={mode} whole />
        {detail.descriptor?.descriptor ? (
          <span className="ml-1.5 text-xs text-fg-muted">{detail.descriptor.descriptor}</span>
        ) : null}
      </div>
      <ComponentList
        title="Written Works"
        rows={ww}
        empty="No written works recorded yet"
      />
      <ComponentList
        title="Performance Tasks"
        rows={pt}
        empty="No performance tasks recorded yet"
      />
      <ExamList grade={grade} mode={mode} />
    </div>
  );
}

export default function ParentGradesPage() {
  usePageTitle('Grades');
  const { user } = useAuth();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Card cells render from `report` only (last successful student GET).
  // Modal body renders from `detail` only (last successful GET /:id).
  // selected is the tap target from the CARD — header source even when
  // the fetch fails, so a 404 cannot show another term's scores under
  // this subject's name (§5b).
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const detailSeq = useRef(0);

  // Their own state, never merged into `report` — §5b's rule one level out:
  // these describe what came back from two OTHER endpoints, and folding them
  // into the report object would make a failed settings read look like a
  // property of the grades payload.
  const [schoolName, setSchoolName] = useState(null);
  const [adviser, setAdviser] = useState(null);

  const studentId = user?.student_id ?? null;

  // UNLIKE the parent content pages, this one SKIPS the request when the
  // account has no student_id — and the difference is real, not drift.
  // Announcements/Memos/Events always fetch because their endpoints take no
  // student id at all: the server derives the child, so skipping would hide
  // real posts behind a stale AuthContext. Here the child id goes IN the path
  // I construct, and parseId(null) answers 400 "Invalid student id." — a
  // developer-facing string that would surface in an ErrorAlert as though the
  // app were broken. There is no request that could succeed, so skipping hides
  // nothing.
  //
  // loading is cleared in the SAME turn as the skip. Leaving the initial
  // loading=true hanging would park the page on a spinner forever.
  const load = useCallback(async () => {
    if (studentId == null) {
      setReport(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // This endpoint has no `grade`/`grades` wrapper at all — seven flat
      // top-level keys — and dropping general_average_descriptor would
      // silence the missing-key guard on a field this page renders. The array
      // form's guard uses hasOwnProperty, so general_average: null (the state
      // for most of the school year) passes rather than throwing.
      setReport(
        await api.get(`/grades/student/${studentId}`, {
          // SEVEN keys, not six. `term_averages` was missing here for the
          // whole of the first DV3 build and the browser check found it: the
          // general-average row read "— Pending" in all four columns while the
          // API was returning {"1":87.5,...} correctly. The interceptor copies
          // ONLY the named keys (api/axios.js), so an UNNAMED key is not an
          // error — it is silently undefined, and undefined renders as
          // Pending, which is a plausible-looking value rather than a visible
          // break. The missing-key guard protects a renamed key, never a
          // forgotten one; this list is the only thing that binds the page to
          // what ReportCard reads off `report`.
          unwrap: [
            'student',
            'school_year',
            'grading_mode',
            'subjects',
            'term_averages',
            'general_average',
            'general_average_descriptor',
          ],
        })
      );
    } catch (err) {
      setError(extractError(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Swallowed on purpose, and this is the one place in the client that does
  // it: there is no user action to retry and nothing the parent could do
  // about it, so the card renders without the school's name rather than
  // sending someone to the office over a heading.
  useEffect(() => {
    let live = true;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((settings) => {
        if (live) setSchoolName(settings?.school_name ?? null);
      })
      .catch(() => {
        if (live) setSchoolName(null);
      });
    return () => {
      live = false;
    };
  }, []);

  // Depends on the report, because the grade level and the section name only
  // arrive with it. Matched on BOTH name and school year: `sections` is keyed
  // by school_year, so a second year would otherwise produce two "Malikhain"
  // rows and this would silently take the first.
  const gradeLevel = report?.student?.grade_level ?? null;
  const sectionName = report?.student?.section ?? null;
  const schoolYear = report?.school_year ?? null;

  // No synchronous setState in the no-report branch: it would be a second
  // render for nothing, and a stale adviser is unreachable anyway — the info
  // row that carries it only renders when `report.student` exists, and a
  // parent has exactly one child, so the name can never move to another
  // learner. The only writer is the fetch below.
  useEffect(() => {
    if (gradeLevel == null || !sectionName) return undefined;
    let live = true;
    api
      .get(`/sections?grade_level=${gradeLevel}`, { unwrap: 'sections' })
      .then((sections) => {
        if (!live) return;
        const match = sections.find(
          (section) => section.name === sectionName && (!schoolYear || section.school_year === schoolYear)
        );
        setAdviser(match?.adviser_name ?? null);
      })
      .catch(() => {
        if (live) setAdviser(null);
      });
    return () => {
      live = false;
    };
  }, [gradeLevel, sectionName, schoolYear]);

  const openTerm = useCallback(async (entry, subjectName, term) => {
    if (!entry?.grade_id) return;
    const seq = ++detailSeq.current;
    setSelected({ gradeId: entry.grade_id, subjectName, term });
    // Clear BEFORE the fetch. A failed open that kept the previous term's
    // components would put one subject's scores under another's header —
    // §5b in its worst form.
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const data = await api.get(`/grades/${entry.grade_id}`, { unwrap: DETAIL_UNWRAP });
      if (detailSeq.current !== seq) return;
      setDetail(data);
    } catch (err) {
      if (detailSeq.current !== seq) return;
      setDetailError(extractError(err));
    } finally {
      if (detailSeq.current === seq) setDetailLoading(false);
    }
  }, []);

  const closeBreakdown = useCallback(() => {
    detailSeq.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const retryDetail = useCallback(() => {
    if (!selected) return;
    openTerm({ grade_id: selected.gradeId }, selected.subjectName, selected.term);
  }, [openTerm, selected]);

  const student = report?.student ?? null;
  const mode = report?.grading_mode ?? 'numerical';

  // Empty-state copy derived from the cause that produced it (convention 5f),
  // and the finding here is that the USUAL branch is structurally unreachable:
  // `subjects` is selected from the subjects table by grade_level, and the
  // seeded curriculum is 5/5/6/8/8/8 for Grades 1-6, so for any linked parent
  // at any seeded grade level this table always has rows. A "no grades yet"
  // empty state would therefore be dead code that, if it ever DID fire, would
  // hide a real all-Pending report card — the worst possible failure for the
  // one screen this module exists to produce. An all-null report card is the
  // normal state today and renders as eight rows of "— Pending", NOT as an
  // empty state.
  //
  // Four causes, one branch each: unlinked account (here); request failed
  // (DataTable's error frame, which covers the 409 naming a missing
  // grading_mode_configs row and has a real actionable message); loaded with
  // every term null (the table); and loaded with zero subjects (below), whose
  // copy names curriculum configuration because that is the only thing that
  // could produce it. No reset is offered in either branch — there is no
  // filter for a reset to change.
  const empty =
    studentId == null
      ? {
          icon: 'fa-link-slash',
          title: "Your account isn't linked to a student record yet",
          message:
            "Ask the school office to link your account so you can see your child's report card.",
        }
      : {
          icon: 'fa-book',
          title: student
            ? `No subjects are set up for Grade ${student.grade_level} yet`
            : 'No subjects are set up for this grade level yet',
          message:
            "The school office sets up the subject list for each grade level. Your child's grades appear here once it exists.",
        };

  // THE SORT CONTROLS ARE GONE, and that is the DV3 decision, not an
  // oversight. This page used to sort on Subject and Final Grade. A report
  // card is read beside the paper one, so its order is the school's printed
  // order and re-ordering it produces a different document, not a filtered
  // one. `final_grade_descriptor` went with them (D2): the band word now
  // appears once, on the general average, with the legend carrying the scale.
  return (
    <div className="space-y-4">
      {/* Everything on the card comes from the report payload — see the file
          header on why not from useAuth(). A name is not an identifier; no
          LRN, no login_id, and the numeric student.id is not shown either. */}
      <ReportCard
        report={report}
        schoolName={schoolName}
        adviser={adviser}
        loading={loading}
        error={error}
        onRetry={load}
        onOpenTerm={openTerm}
        emptyIcon={empty.icon}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
      />

      <Modal
        open={Boolean(selected)}
        onClose={closeBreakdown}
        title={selected ? `${selected.subjectName} · Term ${selected.term}` : 'Grade'}
        size="lg"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {detailLoading ? <LoadingSpinner size="sm" label="Loading scores…" /> : null}
          {detailError ? <ErrorAlert message={detailError} onRetry={retryDetail} /> : null}
          {detail ? <BreakdownBody mode={mode} detail={detail} /> : null}
        </div>
      </Modal>
    </div>
  );
}
