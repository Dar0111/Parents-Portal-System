import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import GradeValue, { GradeLegend } from '../../format/grade';
import TermValue from '../../format/TermValue';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent report card — READ ONLY, and the first feature page to consume
// GradeValue (convention 3). Every absence below is deliberate.
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
// TWO READS. The card is GET /api/grades/student/:studentId (six-key unwrap).
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

function TermCell({ entry, mode, onOpen }) {
  const inner = <TermValue entry={entry} mode={mode} />;
  if (!entry?.grade_id || !onOpen) return inner;
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="-mx-1 rounded px-1 text-right hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      {inner}
    </button>
  );
}

function ScorePair({ score, max }) {
  if (score == null && max == null) {
    return <span className="text-sm text-slate-400">Not yet recorded</span>;
  }
  return (
    <span className="tabular-nums text-sm text-slate-900">
      {score}/{max}
    </span>
  );
}

function ComponentList({ title, rows, empty }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{row.label}</p>
                {row.date_recorded ? (
                  <p className="text-xs text-slate-400">{row.date_recorded}</p>
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

function ExamList({ grade }) {
  const lines = [
    { key: 'st1', label: 'ST1', score: grade?.ex_st1, max: grade?.ex_st1_max },
    { key: 'st2', label: 'ST2', score: grade?.ex_st2, max: grade?.ex_st2_max },
    { key: 'te', label: 'TE', score: grade?.ex_te, max: grade?.ex_te_max },
  ];
  const anyRecorded = lines.some((line) => line.score != null || line.max != null);

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">Examinations</h3>
      {!anyRecorded ? (
        <p className="mt-1 text-sm text-slate-500">No examination scores recorded yet</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <p className="text-sm text-slate-800">{line.label}</p>
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
          UNCONFIRMED (OPEN QUESTIONS: manual A–E vs a computation;
          DO 015 defines no IG-to-letter mapping). A sentence stating
          that assumption as fact was removed 2026-09-12 and must not
          be re-added in any form — including a hedged or tooltip
          version — without a school answer.
        */}
        {/* Hedge: GET /:id still ran. If informational WW/PT/EX ever land
            on a descriptive row, show them. Do not render empty sections
            — the write path 400s numerical encodes on descriptive mode,
            so empty tables would say "scores missing" about something
            that cannot have scores (§5f / §5i). */}
        {hasRecordedBreakdown ? (
          <div className="space-y-4 border-t border-slate-100 pt-3">
            {ww.length > 0 ? (
              <ComponentList title="Written Works" rows={ww} empty="" />
            ) : null}
            {pt.length > 0 ? (
              <ComponentList title="Performance Tasks" rows={pt} empty="" />
            ) : null}
            {hasExam ? <ExamList grade={grade} /> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <GradeValue value={grade.term_grade} mode={mode} />
        {detail.descriptor?.descriptor ? (
          <span className="ml-1.5 text-xs text-slate-500">{detail.descriptor.descriptor}</span>
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
      <ExamList grade={grade} />
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
      // Six keys, not five. This endpoint has no `grade`/`grades` wrapper at
      // all — six flat top-level keys — and dropping
      // general_average_descriptor would silence the missing-key guard on a
      // field this page renders. The array form's guard uses hasOwnProperty,
      // so general_average: null (the state for most of the school year)
      // passes rather than throwing.
      setReport(
        await api.get(`/grades/student/${studentId}`, {
          unwrap: [
            'student',
            'school_year',
            'grading_mode',
            'subjects',
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
  const subjects = report?.subjects ?? [];

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

  const columns = useMemo(
    () => [
      { key: 'subject_name', header: 'Subject', sortable: true },
      {
        key: 'term1',
        header: 'Term 1',
        align: 'right',
        render: (row) => (
          <TermCell
            entry={row.terms[1]}
            mode={mode}
            onOpen={(entry) => openTerm(entry, row.subject_name, 1)}
          />
        ),
      },
      {
        key: 'term2',
        header: 'Term 2',
        align: 'right',
        render: (row) => (
          <TermCell
            entry={row.terms[2]}
            mode={mode}
            onOpen={(entry) => openTerm(entry, row.subject_name, 2)}
          />
        ),
      },
      {
        key: 'term3',
        header: 'Term 3',
        align: 'right',
        render: (row) => (
          <TermCell
            entry={row.terms[3]}
            mode={mode}
            onOpen={(entry) => openTerm(entry, row.subject_name, 3)}
          />
        ),
      },
      {
        key: 'final_grade',
        header: 'Final Grade',
        align: 'right',
        // Subject and Final Grade are the only sortable columns. "Sort by
        // Term 2" is not a question a parent has, and three more sort
        // affordances on an eight-row table is clutter — the inconsistency is
        // deliberate, not an oversight.
        //
        // sortValue reads row.final_grade so DataTable's nulls-last rule
        // actually runs on the real value rather than on rendered markup.
        // Worth knowing: nulls-FIRST-on-descending was a real bug in that
        // comparator, and sorting Final Grade descending to find best marks is
        // the exact case it broke.
        sortable: true,
        sortValue: (row) => row.final_grade,
        render: (row) => (
          <div className="whitespace-nowrap">
            <GradeValue value={row.final_grade} mode={mode} />
            {row.final_grade_descriptor ? (
              <div className="text-xs text-slate-500">{row.final_grade_descriptor.descriptor}</div>
            ) : null}
          </div>
        ),
      },
    ],
    [mode, openTerm]
  );

  return (
    <div className="space-y-4">
      {/* Header from the report payload only — see the file header on why not
          from useAuth(). A name is not an identifier; no LRN, no login_id, and
          the numeric student.id is not shown either. */}
      {student ? (
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {student.first_name} {student.last_name}
          </h2>
          <p className="text-xs text-slate-500">
            Grade {student.grade_level} · {student.section} · School year {report.school_year}
          </p>
        </div>
      ) : null}

      <div>
        <DataTable
          columns={columns}
          rows={subjects}
          keyField="subject_id"
          loading={loading}
          error={error}
          onRetry={load}
          emptyIcon={empty.icon}
          emptyTitle={empty.title}
          emptyMessage={empty.message}
        />

        {/* Both flags come from the API's own grading_mode, never from inspecting
            a null. A numerical report card can only ever show Pending. A
            descriptive one can show both: an unrecorded letter is Pending,
            while Final Grade and General Average are genuinely N/A, since
            computeFinalGrade and computeGeneralAverage short-circuit on
            mode !== 'numerical' before looking at any data. */}
        {subjects.length ? (
          <GradeLegend pending notApplicable={mode === 'descriptive'} />
        ) : null}
      </div>

      {/* General Average appears ONCE, outside the table — not as a row and
          not as a column. The reason is mechanical rather than aesthetic:
          DataTable sorts every row it is given, so a "General Average" row
          would sort alongside the subjects it summarises, landing under G
          alphabetically or drifting into the middle of a grade sort.
          It is null until EVERY subject has a Final Grade — deliberately not a
          running average, the same rule as Final Grade and Initial Grade. A
          partial average determines promotion and prints on the SF9, so a
          parent seeing one in October would reasonably treat it as settled. */}
      {report && subjects.length ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            General Average
          </span>
          <span className="text-base">
            <GradeValue value={report.general_average} mode={mode} />
          </span>
          {report.general_average_descriptor ? (
            <span className="text-xs text-slate-500">
              {report.general_average_descriptor.descriptor}
            </span>
          ) : null}
        </div>
      ) : null}

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
