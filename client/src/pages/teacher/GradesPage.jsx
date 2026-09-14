import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import GradeValue, { GradeLegend } from '../../format/grade';
import TermValue from '../../format/TermValue';
import { todayLocalDateString } from '../../format/date';
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
// §5e: encoding is repeatable (null clears a letter or exam pair; DELETE
// component recomputes). No confirmation. Confirmation would not undo a
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
// Do not encode on Marwin (parent all-Pending demo) or Nino (demo
// letters). That is a verification constraint, not a UI filter.

const REPORT_UNWRAP = [
  'student',
  'school_year',
  'grading_mode',
  'subjects',
  'general_average',
  'general_average_descriptor',
];

const DETAIL_UNWRAP = ['grade', 'grade_components', 'descriptor'];

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

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

function isEncodeRefusal(err) {
  const message = err?.response?.data?.message;
  return (
    err?.response?.status === 403 &&
    typeof message === 'string' &&
    message.startsWith('You are not assigned to teach')
  );
}

function isLocked(row) {
  return Boolean(row?.is_locked);
}

function emptyComponentDraft() {
  return { type: 'WW', label: '', score: '', max_score: '', date_recorded: todayLocalDateString() };
}

function examDraftFromGrade(grade) {
  const field = (value) => (value === null || value === undefined ? '' : String(value));
  return {
    st1_score: field(grade?.ex_st1),
    st1_max: field(grade?.ex_st1_max),
    st2_score: field(grade?.ex_st2),
    st2_max: field(grade?.ex_st2_max),
    te_score: field(grade?.ex_te),
    te_max: field(grade?.ex_te_max),
  };
}

function parsePair(scoreStr, maxStr) {
  const scoreEmpty = scoreStr === '' || scoreStr == null;
  const maxEmpty = maxStr === '' || maxStr == null;
  if (scoreEmpty && maxEmpty) return { score: null, max: null };
  if (scoreEmpty || maxEmpty) {
    return { error: 'Score and max must both be filled, or both empty to clear.' };
  }
  const score = Number(scoreStr);
  const max = Number(maxStr);
  if (!Number.isFinite(score) || score < 0) return { error: 'Score must be 0 or greater.' };
  if (!Number.isFinite(max) || max <= 0) return { error: 'Max must be greater than 0.' };
  return { score, max };
}

function parseScoreMax(scoreStr, maxStr) {
  const score = Number(scoreStr);
  const max = Number(maxStr);
  if (scoreStr === '' || !Number.isFinite(score) || score < 0) {
    return { error: 'Score must be 0 or greater.' };
  }
  if (maxStr === '' || !Number.isFinite(max) || max <= 0) {
    return { error: 'Max must be greater than 0.' };
  }
  return { score, max };
}

const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300';
const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400';
const btnDanger =
  'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400';

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

  const [encodingStudent, setEncodingStudent] = useState(null);
  const [shellLoading, setShellLoading] = useState(false);

  // GET /:id payload. The ONLY writer is loadDetail() (and the reset on
  // close). Component lists, stored exam pairs, stored letter, stored IG/TG
  // in the panel all read this.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [examDraft, setExamDraft] = useState(() => examDraftFromGrade(null));
  const [letterDraft, setLetterDraft] = useState('');
  const [newComponent, setNewComponent] = useState(emptyComponentDraft);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({ label: '', score: '', max_score: '', date_recorded: '' });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  // One outcome on screen. Two flags internally, XOR at render: error
  // wins. Every writer of either flag clears the other, including
  // validation early-returns. Splitting them under exam vs add-score is
  // the same bug in a different shape.
  function clearSaveFeedback() {
    setSaveError(null);
    setSaveMessage(null);
  }
  function showSaveError(message) {
    setSaveMessage(null);
    setSaveError(message);
  }
  function showSaveSuccess(message) {
    setSaveError(null);
    setSaveMessage(message);
  }

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

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const [rows, settings] = await Promise.all([
        api.get('/students', { unwrap: 'students', params: { status: 'active' } }),
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
      const rows = await api.get('/assignments', { unwrap: 'assignments' });
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

  const closePanel = useCallback(() => {
    setEncodingStudent(null);
    setDetail(null);
    setExamDraft(examDraftFromGrade(null));
    setLetterDraft('');
    setNewComponent(emptyComponentDraft());
    setEditId(null);
    setShellLoading(false);
    setDetailLoading(false);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

  const handleEncodeError = useCallback(
    (err) => {
      if (isEncodeRefusal(err)) {
        closePanel();
      }
      showSaveError(extractError(err));
      return isEncodeRefusal(err);
    },
    [closePanel]
  );

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

    closePanel();
    setReport(null);
    setReportError(null);
    setNotSubjectTeacher(false);
    setSubjectId(null);
    setRecorded(new Map());
    setRecordedError(null);
    setSaveError(null);
    setSaveMessage(null);

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
  }, [classKey, students, closePanel]);

  const loadRecorded = useCallback(async () => {
    if (!subjectId || !term || !year || !roster.length) {
      setRecorded(new Map());
      return;
    }

    setRecordedLoading(true);
    setRecordedError(null);
    try {
      const rows = await api.get('/grades', {
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

  const loadDetail = useCallback(async (gradeId) => {
    setDetailLoading(true);
    try {
      const payload = await api.get(`/grades/${gradeId}`, { unwrap: DETAIL_UNWRAP });
      setDetail(payload);
      setExamDraft(examDraftFromGrade(payload.grade));
      setLetterDraft(payload.grade.descriptive_grade || '');
      setNewComponent(emptyComponentDraft());
      setEditId(null);
      return payload;
    } catch (err) {
      showSaveError(extractError(err));
      setDetail(null);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function ensureShell(student) {
    const existing = recorded.get(student.id);
    // Existing row: the shell is already there. Scope was decided from
    // GET /assignments before this click, not by this POST.
    if (existing?.id) return existing;

    try {
      return await api.post(
        '/grades',
        { student_id: student.id, subject_id: subjectId, term, school_year: year },
        { unwrap: 'grade' }
      );
    } catch (err) {
      if (isEncodeRefusal(err)) {
        showSaveError(extractError(err));
        return null;
      }
      if (err?.response?.status === 409) {
        const rows = await api.get('/grades', {
          unwrap: 'grades',
          params: { student_id: student.id, subject_id: subjectId, term, school_year: year },
        });
        return rows[0] || null;
      }
      showSaveError(extractError(err));
      return null;
    }
  }

  async function openEncode(student) {
    if (!canEncode) return;
    clearSaveFeedback();
    setShellLoading(true);
    try {
      const shell = await ensureShell(student);
      if (!shell) return;
      setEncodingStudent(student);
      await loadRecorded();
      await loadDetail(shell.id);
    } finally {
      setShellLoading(false);
    }
  }

  async function afterWrite() {
    const gradeId = detail?.grade?.id;
    await loadRecorded();
    if (gradeId) await loadDetail(gradeId);
  }

  async function saveLetter() {
    const gradeId = detail?.grade?.id;
    if (!gradeId) return;
    setSaving(true);
    clearSaveFeedback();
    try {
      await api.patch(
        `/grades/${gradeId}/descriptive`,
        { descriptive_grade: letterDraft === '' ? null : letterDraft },
        { unwrap: 'grade' }
      );
      showSaveSuccess('Letter saved.');
      await afterWrite();
    } catch (err) {
      handleEncodeError(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveExam() {
    const gradeId = detail?.grade?.id;
    if (!gradeId) return;
    const st1 = parsePair(examDraft.st1_score, examDraft.st1_max);
    const st2 = parsePair(examDraft.st2_score, examDraft.st2_max);
    const te = parsePair(examDraft.te_score, examDraft.te_max);
    const firstError = st1.error || st2.error || te.error;
    if (firstError) {
      showSaveError(firstError);
      return;
    }
    setSaving(true);
    clearSaveFeedback();
    try {
      await api.patch(
        `/grades/${gradeId}/exam`,
        {
          st1_score: st1.score,
          st1_max: st1.max,
          st2_score: st2.score,
          st2_max: st2.max,
          te_score: te.score,
          te_max: te.max,
        },
        { unwrap: 'grade' }
      );
      showSaveSuccess('Exam scores saved.');
      await afterWrite();
    } catch (err) {
      handleEncodeError(err);
    } finally {
      setSaving(false);
    }
  }

  async function addComponent() {
    const gradeId = detail?.grade?.id;
    if (!gradeId) return;
    if (!newComponent.label.trim()) {
      showSaveError('Label is required.');
      return;
    }
    const parsed = parseScoreMax(newComponent.score, newComponent.max_score);
    if (parsed.error) {
      showSaveError(parsed.error);
      return;
    }
    setSaving(true);
    clearSaveFeedback();
    try {
      await api.post(
        `/grades/${gradeId}/components`,
        {
          type: newComponent.type,
          label: newComponent.label.trim(),
          score: parsed.score,
          max_score: parsed.max,
          date_recorded: newComponent.date_recorded || null,
        },
        { unwrap: ['component', 'grade'] }
      );
      showSaveSuccess('Score added.');
      setNewComponent(emptyComponentDraft());
      await afterWrite();
    } catch (err) {
      handleEncodeError(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    const gradeId = detail?.grade?.id;
    if (!gradeId || editId == null) return;
    if (!editDraft.label.trim()) {
      showSaveError('Label is required.');
      return;
    }
    const parsed = parseScoreMax(editDraft.score, editDraft.max_score);
    if (parsed.error) {
      showSaveError(parsed.error);
      return;
    }
    setSaving(true);
    clearSaveFeedback();
    try {
      await api.put(
        `/grades/${gradeId}/components/${editId}`,
        {
          label: editDraft.label.trim(),
          score: parsed.score,
          max_score: parsed.max,
          date_recorded: editDraft.date_recorded ? editDraft.date_recorded : null,
        },
        { unwrap: ['component', 'grade'] }
      );
      showSaveSuccess('Score updated.');
      setEditId(null);
      await afterWrite();
    } catch (err) {
      handleEncodeError(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteComponent(componentId) {
    const gradeId = detail?.grade?.id;
    if (!gradeId) return;
    setSaving(true);
    clearSaveFeedback();
    try {
      await api.delete(`/grades/${gradeId}/components/${componentId}`, { unwrap: 'grade' });
      showSaveSuccess('Score removed.');
      if (editId === componentId) setEditId(null);
      await afterWrite();
    } catch (err) {
      handleEncodeError(err);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
      {
        key: 'name',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name} ${row.first_name}`,
        render: (row) => (
          <span className="font-medium text-slate-900">
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
          return <GradeValue value={stored?.term_grade ?? null} mode={mode} />;
        },
      },
      ...(mode === 'numerical'
        ? [
            {
              key: 'initial_grade',
              header: 'Initial Grade',
              align: 'right',
              sortValue: (row) => recorded.get(row.id)?.initial_grade,
              render: (row) => (
                <GradeValue value={recorded.get(row.id)?.initial_grade ?? null} mode={mode} />
              ),
            },
          ]
        : []),
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
        render: (row) => {
          if (!assignmentsLoaded) {
            return (
              <button type="button" className={btnSecondary} disabled>
                Record
              </button>
            );
          }
          if (!canEncode) {
            return <span className="text-xs text-slate-400">Not yours</span>;
          }
          const stored = recorded.get(row.id);
          const locked = isLocked(stored);
          const open = encodingStudent?.id === row.id;
          if (locked) {
            return (
              <button type="button" className={btnSecondary} onClick={() => openEncode(row)}>
                View
              </button>
            );
          }
          return (
            <button
              type="button"
              className={open ? btnSecondary : btnPrimary}
              disabled={shellLoading}
              onClick={() => (open ? closePanel() : openEncode(row))}
            >
              {open ? 'Close' : stored ? 'Edit' : 'Record'}
            </button>
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
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Class</p>
          {classes.length === 1 ? (
            <p className="py-2 text-sm font-semibold text-slate-900">
              Grade {selectedClass?.grade_level} - {selectedClass?.section}
            </p>
          ) : (
            <FormField
              label={null}
              as="select"
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
              value={subjectId ?? ''}
              onChange={(e) => {
                closePanel();
                setSubjectId(Number(e.target.value));
              }}
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
              value={term}
              onChange={(e) => {
                closePanel();
                setTerm(Number(e.target.value));
              }}
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
              <option value={3}>Term 3</option>
            </FormField>
          </>
        ) : null}
      </div>

      {report && subjects.length && assignmentsLoaded ? (
        <p className="text-sm text-slate-600">
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
      ) : saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-500" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
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

          {encodingStudent ? (
            <EncodePanel
              student={encodingStudent}
              mode={mode}
              subjectName={selectedSubject?.subject_name}
              term={term}
              locked={isLocked(detail?.grade) || isLocked(recorded.get(encodingStudent.id))}
              loading={shellLoading || detailLoading}
              detail={detail}
              examDraft={examDraft}
              setExamDraft={setExamDraft}
              letterDraft={letterDraft}
              setLetterDraft={setLetterDraft}
              newComponent={newComponent}
              setNewComponent={setNewComponent}
              editId={editId}
              setEditId={setEditId}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              saving={saving}
              onSaveLetter={saveLetter}
              onSaveExam={saveExam}
              onAddComponent={addComponent}
              onSaveEdit={saveEdit}
              onDeleteComponent={deleteComponent}
              onClose={closePanel}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function scoreMaxLabel(score, max) {
  if (score === null || score === undefined || max === null || max === undefined) {
    return null;
  }
  return `${score}/${max}`;
}

function ComponentList({ title, rows, locked, editId, editDraft, setEditId, setEditDraft, saving, onSaveEdit, onDelete }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500">
        No {title} recorded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {rows.map((row) => {
        const editing = editId === row.id;
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            {editing ? (
              <>
                <FormField
                  label="Label"
                  className="min-w-[10rem] flex-1"
                  value={editDraft.label}
                  onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                  disabled={saving}
                />
                <FormField
                  label="Score"
                  type="number"
                  className="w-24"
                  value={editDraft.score}
                  onChange={(e) => setEditDraft((d) => ({ ...d, score: e.target.value }))}
                  disabled={saving}
                />
                <FormField
                  label="Max"
                  type="number"
                  className="w-24"
                  value={editDraft.max_score}
                  onChange={(e) => setEditDraft((d) => ({ ...d, max_score: e.target.value }))}
                  disabled={saving}
                />
                <FormField
                  label="Date"
                  type="date"
                  className="w-40"
                  value={editDraft.date_recorded}
                  onChange={(e) => setEditDraft((d) => ({ ...d, date_recorded: e.target.value }))}
                  disabled={saving}
                />
                <button type="button" className={btnPrimary} disabled={saving} onClick={onSaveEdit}>
                  Save
                </button>
                <button type="button" className={btnSecondary} disabled={saving} onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm text-slate-800">{row.label}</span>
                <span className="tabular-nums text-sm text-slate-700">
                  {scoreMaxLabel(row.score, row.max_score)}
                </span>
                {row.date_recorded ? (
                  <span className="text-xs text-slate-500">{row.date_recorded}</span>
                ) : null}
                {locked ? null : (
                  <>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={saving}
                      onClick={() => {
                        setEditId(row.id);
                        setEditDraft({
                          label: row.label || '',
                          score: row.score === null || row.score === undefined ? '' : String(row.score),
                          max_score:
                            row.max_score === null || row.max_score === undefined ? '' : String(row.max_score),
                          date_recorded: row.date_recorded || '',
                        });
                      }}
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      disabled={saving}
                      onClick={() => onDelete(row.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EncodePanel({
  student,
  mode,
  subjectName,
  term,
  locked,
  loading,
  detail,
  examDraft,
  setExamDraft,
  letterDraft,
  setLetterDraft,
  newComponent,
  setNewComponent,
  editId,
  setEditId,
  editDraft,
  setEditDraft,
  saving,
  onSaveLetter,
  onSaveExam,
  onAddComponent,
  onSaveEdit,
  onDeleteComponent,
  onClose,
}) {
  const grade = detail?.grade;
  const components = detail?.grade_components || [];
  const ww = components.filter((c) => c.type === 'WW');
  const pt = components.filter((c) => c.type === 'PT');

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {student.last_name}, {student.first_name}
          </h2>
          <p className="text-sm text-slate-500">
            {subjectName} · Term {term}
            {locked ? (
              <span className="ml-2 inline-block align-middle">
                <StatusBadge status="locked" />
              </span>
            ) : null}
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? (
        <LoadingSpinner className="py-10" label="Opening grade record…" />
      ) : !grade ? (
        <p className="text-sm text-slate-500">Could not open this grade record.</p>
      ) : mode === 'descriptive' ? (
        <div className="max-w-xs space-y-4">
          <p className="text-sm text-slate-600">
            Recorded letter:{' '}
            <TermValue
              entry={{
                descriptive_grade: grade.descriptive_grade,
                descriptor: detail.descriptor,
              }}
              mode={mode}
            />
          </p>
          <FormField
            label="Letter"
            as="select"
            value={letterDraft}
            disabled={locked || saving}
            onChange={(e) => setLetterDraft(e.target.value)}
          >
            <option value="">— Clear —</option>
            {LETTERS.map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </FormField>
          {locked ? (
            <p className="text-sm text-slate-500">This grade is locked and can no longer be edited.</p>
          ) : (
            <button type="button" className={btnPrimary} disabled={saving} onClick={onSaveLetter}>
              Save letter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-6 text-sm">
            <p>
              <span className="text-slate-500">Initial Grade </span>
              <GradeValue value={grade.initial_grade} mode={mode} />
            </p>
            <p>
              <span className="text-slate-500">Term Grade </span>
              <GradeValue value={grade.term_grade} mode={mode} />
            </p>
            {detail.descriptor?.descriptor ? (
              <p className="text-slate-500">{detail.descriptor.descriptor}</p>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            Initial Grade appears after Written Works, Performance Tasks, and all
            three exam parts are recorded. The number comes from the server after
            you save — this screen does not preview it.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Written Works</h3>
              <ComponentList
                title="Written Works"
                rows={ww}
                locked={locked}
                editId={editId}
                editDraft={editDraft}
                setEditId={setEditId}
                setEditDraft={setEditDraft}
                saving={saving}
                onSaveEdit={onSaveEdit}
                onDelete={onDeleteComponent}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Performance Tasks</h3>
              <ComponentList
                title="Performance Tasks"
                rows={pt}
                locked={locked}
                editId={editId}
                editDraft={editDraft}
                setEditId={setEditId}
                setEditDraft={setEditDraft}
                saving={saving}
                onSaveEdit={onSaveEdit}
                onDelete={onDeleteComponent}
              />
            </div>
          </div>

          {locked ? null : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <FormField
                label="Type"
                as="select"
                value={newComponent.type}
                disabled={saving}
                onChange={(e) => setNewComponent((d) => ({ ...d, type: e.target.value }))}
              >
                <option value="WW">Written Work</option>
                <option value="PT">Performance Task</option>
              </FormField>
              <FormField
                label="Label"
                className="lg:col-span-2"
                value={newComponent.label}
                disabled={saving}
                onChange={(e) => setNewComponent((d) => ({ ...d, label: e.target.value }))}
              />
              <FormField
                label="Score"
                type="number"
                value={newComponent.score}
                disabled={saving}
                onChange={(e) => setNewComponent((d) => ({ ...d, score: e.target.value }))}
              />
              <FormField
                label="Max"
                type="number"
                value={newComponent.max_score}
                disabled={saving}
                onChange={(e) => setNewComponent((d) => ({ ...d, max_score: e.target.value }))}
              />
              <FormField
                label="Date"
                type="date"
                value={newComponent.date_recorded}
                disabled={saving}
                onChange={(e) => setNewComponent((d) => ({ ...d, date_recorded: e.target.value }))}
              />
              <div className="flex items-end">
                <button type="button" className={btnPrimary} disabled={saving} onClick={onAddComponent}>
                  Add score
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Examinations</h3>
            <div className="overflow-x-auto">
              <table className="w-full max-w-xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Part</th>
                    <th className="py-2 pr-3">Recorded</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'st1', label: 'ST1', score: grade.ex_st1, max: grade.ex_st1_max, dScore: 'st1_score', dMax: 'st1_max' },
                    { key: 'st2', label: 'ST2', score: grade.ex_st2, max: grade.ex_st2_max, dScore: 'st2_score', dMax: 'st2_max' },
                    { key: 'te', label: 'TE', score: grade.ex_te, max: grade.ex_te_max, dScore: 'te_score', dMax: 'te_max' },
                  ].map((part) => (
                    <tr key={part.key} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{part.label}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">
                        {scoreMaxLabel(part.score, part.max) || (
                          <span className="text-slate-400">Not recorded</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                          value={examDraft[part.dScore]}
                          disabled={locked || saving}
                          onChange={(e) =>
                            setExamDraft((d) => ({ ...d, [part.dScore]: e.target.value }))
                          }
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                          value={examDraft[part.dMax]}
                          disabled={locked || saving}
                          onChange={(e) =>
                            setExamDraft((d) => ({ ...d, [part.dMax]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {locked ? (
              <p className="mt-3 text-sm text-slate-500">This grade is locked and can no longer be edited.</p>
            ) : (
              <button type="button" className={`${btnPrimary} mt-3`} disabled={saving} onClick={onSaveExam}>
                Save exam
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
