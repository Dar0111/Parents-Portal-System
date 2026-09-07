import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import GradeValue, { GradeLegend } from '../../format/grade';
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
// button. The only interactive elements on this page are DataTable's two sort
// headers.
//
// ONE REQUEST, ONE ENDPOINT: GET /api/grades/student/:studentId. The other two
// GETs are deliberately not called. GET / returns bare grade rows with no
// subject-coverage overlay, so a subject with zero grade rows would simply not
// appear — the exact confusion this endpoint was built to remove, since it
// selects from `subjects` by grade_level and overlays whatever grades exist.
// GET /:id (which DOES exist and is correctly parent-scoped) would give the
// WW/PT component breakdown, and that is deferred: whether a parent should see
// individual raw assessment scores rather than the term grade the SF9 prints
// is a SCHOOL POLICY QUESTION NOBODY HAS ASKED, and building it would answer
// it by shipping. The follow-up stays cheap — grade_id is already on every
// term entry in this payload, so it needs no new endpoint and no lookup.
//
// THE CHILD ID COMES FROM useAuth() AND IS USED FOR THE PATH, NOTHING ELSE.
// /auth/me also returns lrn, login_id, student_first_name, student_last_name,
// grade_level and section — none of them are read here. The header is sourced
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
// should show the numeric grade AND the descriptor".
//
// is_locked is on every term entry and is NOT rendered. A parent cannot act on
// it, and it reads either as "final" — a promise the system should not make,
// since an admin can unlock — or as "hidden from you", which is false.

// mode names the REASON a null renders, not the grade level a student is at.
// An unrecorded descriptive letter is "not yet recorded", which is Pending, so
// 'numerical' is the correct argument for that cell even though the student is
// descriptive-mode.
//
// FINDING C, recorded rather than fixed: GradeValue's own header names four
// states — a number, null-numerical, null-descriptive, and error — and A
// DESCRIPTIVE LETTER IS NOT ONE OF THEM. formatGrade('A') gives Number('A') ->
// NaN -> null, so a real Grade 1 term grade of A would render as "— N/A", the
// string meaning "this doesn't apply", on the one value that does. That is
// outside GradeValue's stated contract rather than a bug inside it, so the
// letter is handled locally here and format/grade.jsx is left untouched. Close
// the gap in GradeValue the day a descriptive page is actually built.
//
// THE DESCRIPTIVE BRANCH BELOW IS UNVERIFIED. No Grade 1 student exists in the
// seed, so no descriptive report card can be produced without a fixture chain
// of student + parent user + approval + descriptive grade rows. It is written
// from the handler's shape, not exercised. Do not record it as verified: an
// entry claiming "verified" when the fixture could not fail is worse than no
// entry (same discipline as the ?status=all audit item).
const NULL_IS_PENDING = 'numerical';

function TermCell({ entry, mode }) {
  if (mode === 'descriptive') {
    if (!entry?.descriptive_grade) {
      return <GradeValue value={null} mode={NULL_IS_PENDING} />;
    }
    return (
      <span className="whitespace-nowrap">
        <span className="font-medium text-slate-900">{entry.descriptive_grade}</span>
        {entry.descriptor ? (
          <span className="ml-1.5 text-xs text-slate-500">{entry.descriptor.descriptor}</span>
        ) : null}
      </span>
    );
  }

  // `mode` is the API's own grading_mode, never inferred from the null itself:
  // "null because incomplete" and "null because inapplicable" are
  // indistinguishable from the value alone.
  return <GradeValue value={entry?.term_grade} mode={mode} />;
}

export default function ParentGradesPage() {
  usePageTitle('Grades');
  const { user } = useAuth();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        render: (row) => <TermCell entry={row.terms[1]} mode={mode} />,
      },
      {
        key: 'term2',
        header: 'Term 2',
        align: 'right',
        render: (row) => <TermCell entry={row.terms[2]} mode={mode} />,
      },
      {
        key: 'term3',
        header: 'Term 3',
        align: 'right',
        render: (row) => <TermCell entry={row.terms[3]} mode={mode} />,
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
    [mode]
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

        {/* Both flags come from the API's grading_mode, never from inspecting
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
    </div>
  );
}
