import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import GradeValue, { GradeLegend } from '../../format/grade';
import TermValue from '../../format/TermValue';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher grades — viewing + encoding, one page. The teacher does not choose
// a mode; grading_mode comes from GET /api/grading-modes keyed on the
// selected class's grade_level (unwrap 'grading_mode', an OBJECT —
// { grade_level, school_year, mode }). Read .mode. Do not flatten. Do not
// default to 'numerical' — a missing config is 409, a pending load is a
// spinner. The report card still supplies the subject list and term grid
// (GET /grades/student/:id); it is no longer the mode source.
//
// Scope, read from the route file rather than assumed:
//   VIEW   teacher_assignments, grade+section, any subject (wide)
//   ENCODE teacher_assignments, teacher+subject+grade_level+section (narrow)
//   Adviser is deliberately unused. Reusing useTeacherTargets would offer
//   TCH-002 Grade 5 - Masigasig, a class it cannot grade — that hook is
//   assigned-OR-adviser; this page is assignments-only. Class list comes
//   from GET /students (which IS the wider union), then a report-card 404
//   is "not the subject teacher" (notSubjectTeacher). That 404 is not
//   encode-scope memory and can coexist with a loaded-empty assignments
//   array. Do not "fix" that by calling the hook.
//
// Encode-scope is predicted from GET /assignments (own rows, no teacher_id).
// Match is grade_level + section + subject_id together. Four states:
// not-loaded, error, loaded [], loaded rows. A failed call is never []
// and never suffixes "(not yours)" — that would turn a network failure
// into a permissions fact. A loaded [] (TCH-002) is a genuine empty list.
//
// ensureShell still creates the shell row encoding writes into (or
// returns the existing recorded row, or recovers a 409). It does not
// discover encode scope. An existing grade_id skips POST because the
// row is already there, not because scope is unknown.
//
// No client-side Initial Grade preview. A "if you save now, IG would be…"
// number is a copy of gradeComputation.js that would drift the first time
// DepEd changes anything, of a value that reaches the SF9 and decides
// promotion. Trust the round-trip; GradeValue renders what the server
// stored.
//
// The term value (number, letter, Pending, N/A) is TermValue from
// format/TermValue.jsx — extracted 2026-09-14 when Admin → Grades became the
// third copy; this page's TermCell and Parent → Grades' TermDisplay were
// identical. Still not a fifth state on GradeValue.
//
// No lock control. PATCH /:id/lock is admin-only and 403s at middleware
// ("Access denied.") for a teacher. Do not render a button that cannot
// work. A locked row shows StatusBadge and disables inputs. Admin →
// Grades (2026-09-14) is where a grade gets locked — and this page's
// "can no longer be edited" line does not say why or who can unlock it
// (KNOWN ISSUES; its own dispatch).
//
// §5e: encoding is repeatable (null clears an exam pair; DELETE component
// recomputes; clearing any required input clears a Grade 1 letter along with
// the Initial Grade, because the letter is computed from them and is not a
// value a teacher sets). No confirmation. Confirmation would not undo a
// wrongly-created shell — DELETE /api/grades/:id is admin-only; a teacher
// cannot remove a shell they created by mistake.
//
// No unsaved-changes warning. Every score is its own request (Add score
// writes immediately; exam scores save on their own button). There is no
// accumulated draft — only unsubmitted keystrokes, which is seconds. A
// warning that fires on every logout regardless of form state is one a
// teacher stops reading, and then a real warning elsewhere goes unread
// too. Attendance IS a bulk submit and is the page that would warrant
// this; recorded as an open question there, not work here.
//
// §5b: `recorded` (GET /grades) and `detail` (GET /:id) are stored state.
// Drafts are form state. Input handlers never write the recorded maps.
//
// §5c: LRN is shown on the roster (teacher acting on that student). It
// does not go in a URL, a query string, or an error message. This page
// has no :studentId route.
//
// FIXTURE RULE (reworded 2026-09-22). Do not encode on Marwin — the parent
// all-Pending demo depends on his card staying empty. For Nino: **never
// modify his 5 seeded rows** (Mathematics terms 1-3, Reading and Literacy
// terms 1-2 — grade ids 1-5, the legacy letters with no components), but
// **fixtures on his EMPTY subjects are allowed** and were used for the
// Grade 1 computed-letter browser check. A verification constraint, not a
// UI filter — nothing in this file enforces it.

const REPORT_UNWRAP = [
  'student',
  'school_year',
  'grading_mode',
  'subjects',
  'general_average',
  'general_average_descriptor',
];

// DETAIL_UNWRAP and examSectionLabel moved to the class record with the
// encoding they served. This page reads the report card, not one grade.

function classKeyOf(student) {
  return `${student.grade_level}|${student.section}`;
}

function classesFromStudents(students) {
  const map = new Map();
  for (const student of students) {
    const key = classKeyOf(student);
    if (!map.has(key)) {
      map.set(key, { key, grade_level: student.grade_level, section: student.section });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.grade_level !== b.grade_level) return a.grade_level - b.grade_level;
    return String(a.section).localeCompare(String(b.section));
  });
}

function isLocked(row) {
  return Boolean(row?.is_locked);
}

// parsePair and parseScoreMax went with the encode panel. The class record
// has its own parseCell — one rule, stricter, because the server now refuses
// a decimal score outright.

const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm font-medium text-fg-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:text-fg-faint';

export default function TeacherGradesPage() {
  usePageTitle('Grades');

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState(null);

  const [schoolYear, setSchoolYear] = useState(null);
  const [term, setTerm] = useState(1);
  const [classKey, setClassKey] = useState(null);

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [notSubjectTeacher, setNotSubjectTeacher] = useState(false);

  const [subjectId, setSubjectId] = useState(null);

  // Own assignment rows. null = not loaded (or failed — see assignmentsError).
  // [] = loaded empty. Never treat a failed call as [].
  const [assignments, setAssignments] = useState(null);
  const [assignmentsError, setAssignmentsError] = useState(null);

  const [gradingMode, setGradingMode] = useState(null);
  const [gradingModeLoading, setGradingModeLoading] = useState(false);
  const [gradingModeError, setGradingModeError] = useState(null);

  // student_id -> grade row from GET /grades. The ONLY writer is
  // loadRecorded(). Roster "Recorded" columns read this, never drafts.
  const [recorded, setRecorded] = useState(new Map());
  const [recordedLoading, setRecordedLoading] = useState(false);
  const [recordedError, setRecordedError] = useState(null);

  // THIS PAGE NO LONGER WRITES ANYTHING (CR2, 2026-09-22), so it carries no
  // draft state, no saving flag and no FormStatus. Every piece of that went
  // with the encode panel. What is left reads: `recorded` for the roster's
  // stored columns, `report` for the subject list and term grid.
  //
  // `showSaveError` survives under a different job — it is the one place a
  // failed READ is surfaced, which is why it is a plain error setter now
  // rather than half of a success/failure XOR.

  const classes = useMemo(() => classesFromStudents(students), [students]);
  const selectedClass = useMemo(
    () => classes.find((c) => c.key === classKey) || null,
    [classes, classKey]
  );
  const roster = useMemo(
    () => (classKey ? students.filter((s) => classKeyOf(s) === classKey) : []),
    [students, classKey]
  );

  const subjects = report?.subjects ?? [];
  const mode = gradingMode?.mode ?? null;
  const year = report?.school_year || schoolYear;
  const selectedSubject = subjects.find((s) => s.subject_id === subjectId) || null;
  const assignmentsLoaded = Array.isArray(assignments);

  const canEncodeSubject = useCallback(
    (id) => {
      if (!assignmentsLoaded || !selectedClass || id == null) return false;
      return assignments.some(
        (row) =>
          Number(row.grade_level) === Number(selectedClass.grade_level) &&
          String(row.section) === String(selectedClass.section) &&
          Number(row.subject_id) === Number(id)
      );
    },
    [assignments, assignmentsLoaded, selectedClass]
  );

  const canEncode = canEncodeSubject(subjectId);
  const subjectUnassigned = assignmentsLoaded && subjectId != null && !canEncode;

  // The assignment row behind the current class + subject, so the Class
  // record link can open on the class already chosen here rather than
  // making the teacher pick it a second time.
  const currentAssignment = useMemo(() => {
    if (!assignmentsLoaded || !selectedClass || subjectId == null) return null;
    return (
      assignments.find(
        (row) =>
          Number(row.grade_level) === Number(selectedClass.grade_level) &&
          String(row.section) === String(selectedClass.section) &&
          Number(row.subject_id) === Number(subjectId)
      ) || null
    );
  }, [assignments, assignmentsLoaded, selectedClass, subjectId]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      // C2: the roster is a COMPLETE set (a subject teacher with six sections
      // is ~210 students, over one page), so fetchAll pages through it.
      const [rows, settings] = await Promise.all([
        fetchAll('/students', { unwrap: 'students', params: { status: 'active' } }),
        api.get('/settings', { unwrap: 'settings' }),
      ]);
      setStudents(rows);
      setSchoolYear(settings.academic_year || null);
      const fromSettings = Number(settings.current_term);
      if (fromSettings === 1 || fromSettings === 2 || fromSettings === 3) {
        setTerm(fromSettings);
      }
      const nextClasses = classesFromStudents(rows);
      setClassKey((current) => {
        if (current && nextClasses.some((c) => c.key === current)) return current;
        return nextClasses[0]?.key ?? null;
      });
    } catch (err) {
      setStudentsError(extractError(err));
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const loadAssignments = useCallback(async () => {
    setAssignmentsError(null);
    try {
      const rows = await fetchAll('/assignments', { unwrap: 'assignments' });
      setAssignments(rows);
    } catch (err) {
      setAssignmentsError(
        `Could not load your subject assignments. ${extractError(err)}`
      );
      setAssignments(null);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // closePanel and handleEncodeError went with the encode panel. Nothing on
  // this page opens, closes or writes any more — the class record does.
  // `no-undef`, enabled on 2026-09-22, is what caught them still calling
  // deleted setters after the panel was removed; the previous lint run would
  // have shipped the page silently broken, exactly as it did once before.

  const classGradeLevel = selectedClass?.grade_level ?? null;

  // Mode from GET /grading-modes, keyed on the class grade_level. No roster
  // student. Do not default a missing row to numerical.
  useEffect(() => {
    let cancelled = false;

    setGradingMode(null);
    setGradingModeError(null);

    if (classGradeLevel == null) {
      setGradingModeLoading(false);
      return undefined;
    }

    setGradingModeLoading(true);
    api
      .get('/grading-modes', {
        unwrap: 'grading_mode',
        params: { grade_level: classGradeLevel },
      })
      .then((row) => {
        if (cancelled) return;
        setGradingMode(row);
      })
      .catch((err) => {
        if (cancelled) return;
        setGradingModeError(extractError(err));
        setGradingMode(null);
      })
      .finally(() => {
        if (!cancelled) setGradingModeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [classGradeLevel]);

  // Subject list + term grid from ONE roster student. Mode is no longer
  // taken from this payload. An empty roster never reaches this — there is
  // no student id to ask. Copy for that case names the empty class.
  useEffect(() => {
    let cancelled = false;

    setReport(null);
    setReportError(null);
    setNotSubjectTeacher(false);
    setSubjectId(null);
    setRecorded(new Map());
    setRecordedError(null);

    if (!classKey) return undefined;
    const classRoster = students.filter((s) => classKeyOf(s) === classKey);
    if (!classRoster.length) return undefined;

    const probeId = classRoster[0].id;
    setReportLoading(true);

    api
      .get(`/grades/student/${probeId}`, { unwrap: REPORT_UNWRAP })
      .then((card) => {
        if (cancelled) return;
        setReport(card);
        setSubjectId(card.subjects[0]?.subject_id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          setNotSubjectTeacher(true);
          setReport(null);
        } else {
          setReportError(extractError(err));
          setReport(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [classKey, students]);

  const loadRecorded = useCallback(async () => {
    if (!subjectId || !term || !year || !roster.length) {
      setRecorded(new Map());
      return;
    }

    setRecordedLoading(true);
    setRecordedError(null);
    try {
      // C2: the recorded map must cover EVERY row for this subject/term across
      // the teacher's scope, not the first page of them.
      const rows = await fetchAll('/grades', {
        unwrap: 'grades',
        params: { subject_id: subjectId, term, school_year: year },
      });
      const inRoster = new Set(roster.map((s) => s.id));
      const map = new Map();
      for (const row of rows) {
        if (inRoster.has(row.student_id)) map.set(row.student_id, row);
      }
      setRecorded(map);
    } catch (err) {
      setRecordedError(extractError(err));
      setRecorded(new Map());
    } finally {
      setRecordedLoading(false);
    }
  }, [subjectId, term, year, roster]);

  useEffect(() => {
    loadRecorded();
  }, [loadRecorded]);

  // ENCODING LEFT THIS PAGE (CR2, 2026-09-22).
  //
  // openEncode, ensureShell, afterWrite, saveExam, addComponent, saveEdit and
  // deleteComponent are gone with the per-learner EncodePanel they drove.
  // Recording one quiz for forty learners through that modal was up to eighty
  // requests; the class record does it in one save, and two encode paths
  // writing the same data is the "do not build a second composer" problem the
  // Class Board decision already settled once.
  //
  // WHAT STAYS HERE is the report-card VIEW: the class picker, the subject and
  // term filters, and the roster with each learner's stored term grade. That
  // is a read, and it is still the fastest way to see where a class stands.
  // The Actions column links to the class record with this class and term
  // already chosen.
  //
  // `recorded` is still loaded and still the only writer of the roster's
  // stored columns (§5b) — it simply has no drafts to be confused with any
  // more.

  const columns = [
      {
        key: 'name',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name} ${row.first_name}`,
        render: (row) => (
          <span className="font-medium text-fg">
            {row.last_name}, {row.first_name}
          </span>
        ),
      },
      {
        key: 'lrn',
        header: 'LRN',
        sortable: true,
      },
      {
        key: 'recorded',
        header: mode === 'descriptive' ? 'Letter' : 'Term Grade',
        align: 'right',
        sortValue: (row) => {
          const stored = recorded.get(row.id);
          return mode === 'descriptive' ? stored?.descriptive_grade : stored?.term_grade;
        },
        render: (row) => {
          const stored = recorded.get(row.id);
          if (mode === 'descriptive') {
            return (
              <TermValue
                entry={{
                  descriptive_grade: stored?.descriptive_grade ?? null,
                  descriptor: null,
                }}
                mode={mode}
              />
            );
          }
          // `whole` — a Term Grade is an integer. The Initial Grade column
          // immediately below keeps two decimals, deliberately: it is the
          // pre-transmutation figure and is not a whole number.
          return <GradeValue value={stored?.term_grade ?? null} mode={mode} whole />;
        },
      },
      // THE INITIAL GRADE COLUMN NOW SHOWS IN BOTH MODES (2026-09-22). It was
      // numerical-only because a Grade 1 row genuinely had no Initial Grade —
      // the letter was typed, nothing computed it. Now the letter IS computed
      // from one, and a teacher who encoded the scores may see the number
      // behind the letter. A parent never does; that is Key Stage 1 policy
      // and it is enforced on the parent screens, not here.
      //
      // `mode="numerical"` on the VALUE, in both modes, on purpose: an
      // Initial Grade is a number whichever mode the row is in, and a null
      // one is Pending — the score is not in yet — never "N/A".
      {
        key: 'initial_grade',
        header: 'Initial Grade',
        align: 'right',
        sortValue: (row) => recorded.get(row.id)?.initial_grade,
        render: (row) => (
          <GradeValue value={recorded.get(row.id)?.initial_grade ?? null} mode="numerical" />
        ),
      },
      {
        key: 'lock',
        header: 'Status',
        render: (row) =>
          isLocked(recorded.get(row.id)) ? <StatusBadge status="locked" /> : null,
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        // The action is the same for every learner now — the class record is
        // per CLASS, not per row — so the row itself is unused here.
        render: () => {
          if (!assignmentsLoaded) {
            return (
              <button type="button" className={btnSecondary} disabled>
                Record
              </button>
            );
          }
          if (!canEncode) {
            return <span className="text-xs text-fg-muted">Not yours</span>;
          }
          // ENCODING LEFT THIS PAGE (CR2, 2026-09-22). The per-learner panel
          // that used to open here is gone: one quiz for forty learners was
          // up to eighty requests through it. This page keeps the report-card
          // VIEW and hands encoding to the class record, which records the
          // whole class in one save.
          //
          // The link carries the assignment and term so the grid opens on
          // the class already chosen here, rather than making the teacher
          // pick it twice.
          return (
            <Link
              to={`/teacher/class-record?assignment=${encodeURIComponent(currentAssignment?.id ?? '')}&term=${term}`}
              className={btnSecondary}
            >
              Class record
            </Link>
          );
        },
      },
    ];

  if (studentsError) {
    return <ErrorAlert message={studentsError} onRetry={loadStudents} />;
  }

  if (studentsLoading) {
    return <LoadingSpinner className="py-16" label="Loading your classes…" />;
  }

  if (!classes.length) {
    return (
      <EmptyState
        icon="fa-chart-simple"
        title="No students in your classes yet"
        message="Grades appear here once students are enrolled in a class you teach."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-edge bg-surface p-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg-secondary">Class</p>
          {classes.length === 1 ? (
            <p className="py-2 text-sm font-semibold text-fg">
              Grade {selectedClass?.grade_level} - {selectedClass?.section}
            </p>
          ) : (
            <FormField
              label={null}
              as="select"
              className={filterSelectClass}
              value={classKey ?? ''}
              onChange={(e) => setClassKey(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.key} value={c.key}>
                  Grade {c.grade_level} - {c.section}
                </option>
              ))}
            </FormField>
          )}
        </div>

        {report && subjects.length ? (
          <>
            <FormField
              label="Subject"
              as="select"
              className={filterSelectClass}
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(Number(e.target.value))}
            >
              {subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name}
                  {assignmentsLoaded && !canEncodeSubject(s.subject_id) ? ' (not yours)' : ''}
                </option>
              ))}
            </FormField>

            <FormField
              label="Term"
              as="select"
              className={filterSelectClass}
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
              <option value={3}>Term 3</option>
            </FormField>
          </>
        ) : null}
      </div>

      {report && subjects.length && assignmentsLoaded ? (
        <p className="text-sm text-fg-body">
          You can view every subject on this class card. You can encode the ones
          you are assigned to teach — those are unmarked in the list. A subject
          marked “(not yours)” cannot be encoded from here.
        </p>
      ) : null}

      {assignmentsError ? (
        <ErrorAlert
          message={assignmentsError}
          onRetry={loadAssignments}
        />
      ) : null}

      {gradingModeError ? <ErrorAlert message={gradingModeError} /> : null}

      {subjectUnassigned ? (
        <ErrorAlert
          message={`You are not assigned to teach ${selectedSubject?.subject_name || 'this subject'} for this class. Pick a subject you teach to encode.`}
        />
      ) : null}

      {reportError ? <ErrorAlert message={reportError} /> : null}

      {reportLoading || gradingModeLoading ? (
        <LoadingSpinner className="py-16" label="Loading subjects…" />
      ) : !roster.length ? (
        <EmptyState
          icon="fa-user-graduate"
          title="This class has no students"
          message="There is nothing to grade until students are enrolled in this section."
        />
      ) : notSubjectTeacher ? (
        <EmptyState
          icon="fa-chalkboard-user"
          title="Grades are the subject teacher's job"
          message="You can see this class as its adviser, but encoding grades is limited to teachers assigned to a subject here."
        />
      ) : gradingModeError ? (
        null
      ) : report && mode ? (
        <>
          <DataTable
            columns={columns}
            rows={roster}
            loading={recordedLoading}
            error={recordedError}
            onRetry={loadRecorded}
            emptyIcon="fa-user-graduate"
            emptyTitle="This class has no students"
            emptyMessage="There is nothing to grade until students are enrolled in this section."
          />
          <GradeLegend pending notApplicable={mode === 'descriptive'} />

        </>
      ) : null}
    </div>
  );
}

