import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import { cardClass } from '../../components/buttonClass';
import GradeValue, { GradeLegend } from '../../format/grade';
import TermValue from '../../format/TermValue';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

// Admin grades — Figure 5 process 1.9 ("show all students grades"). VIEW, plus
// the LOCK toggle. Darryl decided 2026-09-14.
//
// LOCK — surfaced. PATCH /api/grades/:id/lock is admin-only and has no other
// path; Teacher → Grades has no lock control (it 403s at middleware for a
// teacher). Without this page nobody could ever lock a grade. It is a boolean
// and reversible — one click back.
//
// WHAT LOCKING DOES, read from routes/grades.js, not assumed:
// preflightGradeWrite() refuses every score and letter write on a locked row
// (403 "This grade is locked and can no longer be edited.") — add, correct and
// remove a WW/PT score, the exam scores, the Grade 1 letter — with NO role
// exception, so admin writes are refused too. DELETE /:id refuses a locked row
// as well. Reads are not filtered: parents and teachers see the grade exactly
// as it is. So the copy says "no change by anyone, and no delete, until
// unlocked" — never "frozen" or "final", since an unlock is one click.
//
// DELETE — deliberately NOT surfaced. DELETE /api/grades/:id is also
// admin-only with no other path, and it is irreversible, a grade reaches the
// SF9, and no need for it has been named — a wrong grade is EDITED by the
// teacher, not deleted. If a need appears it can be added; a deleted grade
// cannot be recovered. Do not add a Delete button as an "obvious" omission.
//
// SHAPE: pick a student (grade → section → student), see their report card —
// the Parent → Grades shape (GET /grades/student/:id, six-key unwrap). GET /
// has no class filter and no limit, so it is not called. Nothing loads until
// a student is chosen.
//
// LOCK LIVES IN A MODAL, not as buttons in the 24-cell grid: a stray click in
// a grid would lock a grade under a teacher's hands. One deliberate step, not
// a confirmation dialog (§5e — reversible). The modal reads its cell from the
// report card (grade_id, term_grade, descriptive_grade, is_locked) — no
// GET /:id and no copy of Parent's component breakdown.
//
// A term with no grade row has no grade_id (buildTermEntry returns null), so
// there is nothing to lock: that cell is not a button. A Pending cell whose
// row exists (a shell, or partly scored) has an id and can be locked — the
// handler has no completeness gate.
//
// §5b: `report` is written only by loadReport(). After a successful PATCH the
// card reloads and the modal re-reads its cell from the reloaded card.
//
// NO VERDICTS (convention 4). Numbers, letters, Pending and N/A through
// GradeValue / TermValue, plus the Final Grade descriptor as Parent → Grades
// shows it. Never `remarks` ("Passed"), never a colour keyed on the band,
// never a class rank or "at risk". The absence is deliberate.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header,
// the picker card, the lock's result, then the chosen learner: a header
// card, the report card, the General Average. The lock dialog sits BESIDE
// the entrance wrapper, never inside it: Modal renders inline, and a wrapper
// mid-tween carries a transform (motion/motion.js).

const REPORT_UNWRAP = [
  'student',
  'school_year',
  'grading_mode',
  'subjects',
  'general_average',
  'general_average_descriptor',
];

export default function AdminGradesPage() {
  usePageTitle('Grades');

  const [sections, setSections] = useState([]);
  const [sectionsError, setSectionsError] = useState(null);
  const [sectionsAttempt, setSectionsAttempt] = useState(0);
  const [grade, setGrade] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [studentId, setStudentId] = useState('');

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(null);
  const [studentsAttempt, setStudentsAttempt] = useState(0);

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  // The tapped cell, by position. The entry itself is always re-read from
  // `report`, so after a reload the modal shows the stored lock state (§5b).
  const [selected, setSelected] = useState(null); // { subjectId, subjectName, term }
  const [lockSaving, setLockSaving] = useState(false);
  // Keyed status. `lock` renders INSIDE the modal under its action row (the
  // Lock/Unlock button is there); `card` is the confirmation that outlives
  // the modal and belongs above the report card it describes. See FormStatus.
  const [status, setStatus] = useState({});

  // THE SECTIONS READ SAYS WHEN IT FAILED (build 1 fix round, 2026-10-05), as
  // on the phone. It used to swallow a failure into an empty list, so a
  // picked grade offered no sections and nothing said why. A failure keeps
  // the last good list and sets the error, shown under the pickers with
  // Retry; `sectionsAttempt` is the effect's key.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (cancelled) return;
        setSections(rows);
        setSectionsError(null);
      })
      .catch((err) => {
        if (!cancelled) setSectionsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sectionsAttempt]);

  // status=all: an inactive student still has grades.
  useEffect(() => {
    if (!grade || !sectionName) {
      setStudents([]);
      setStudentsError(null);
      return undefined;
    }
    let cancelled = false;
    setStudentsLoading(true);
    setStudentsError(null);
    api
      .get('/students', { unwrap: 'students', params: { grade_level: grade, section: sectionName, status: 'all' } })
      .then((rows) => {
        if (!cancelled) setStudents(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setStudentsError(extractError(err));
          setStudents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `studentsAttempt`: the learner list's Retry reads it again (build 1 fix
    // round), the phone's key.
  }, [grade, sectionName, studentsAttempt]);

  const loadReport = useCallback(async () => {
    if (!studentId) {
      setReport(null);
      setReportError(null);
      return;
    }
    setReportLoading(true);
    setReportError(null);
    try {
      setReport(await api.get(`/grades/student/${studentId}`, { unwrap: REPORT_UNWRAP }));
    } catch (err) {
      setReportError(extractError(err));
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const sectionOptions = useMemo(
    () =>
      grade
        ? sections
            .filter((s) => Number(s.grade_level) === Number(grade))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [sections, grade]
  );

  const mode = report?.grading_mode ?? 'numerical';
  const subjects = useMemo(() => report?.subjects ?? [], [report]);
  const student = report?.student ?? null;

  const noGradesYet =
    subjects.length > 0 && subjects.every((s) => !s.terms[1] && !s.terms[2] && !s.terms[3]);

  const selectedEntry = useMemo(() => {
    if (!selected) return null;
    const subject = subjects.find((s) => s.subject_id === selected.subjectId);
    return subject?.terms[selected.term] ?? null;
  }, [selected, subjects]);

  function openCell(subject, term) {
    setStatus({});
    setSelected({ subjectId: subject.subject_id, subjectName: subject.subject_name, term });
  }

  function closeCell() {
    if (lockSaving) return;
    setSelected(null);
    setStatus({});
  }

  async function toggleLock() {
    if (!selectedEntry?.grade_id) return;
    const next = !selectedEntry.is_locked;
    setLockSaving(true);
    setStatus({});
    try {
      await api.patch(`/grades/${selectedEntry.grade_id}/lock`, { is_locked: next }, { unwrap: 'grade' });
      setStatus({
        card: ok(`${selected.subjectName}, Term ${selected.term} ${next ? 'locked' : 'unlocked'}.`),
      });
      await loadReport();
    } catch (err) {
      setStatus({ lock: fail(extractError(err)) });
    } finally {
      setLockSaving(false);
    }
  }

  function termColumn(term) {
    return {
      key: `term${term}`,
      header: `Term ${term}`,
      align: 'right',
      render: (row) => {
        const entry = row.terms[term];
        const value = (
          <span className="inline-flex items-center gap-1.5">
            <TermValue entry={entry} mode={mode} />
            {/* The lock is the only sign a grade is locked in this grid, so
                it takes a text colour, not a decoration's. */}
            {entry?.is_locked ? (
              <i className="fa-solid fa-lock text-xs text-fg-muted" title="Locked" aria-label="Locked" />
            ) : null}
          </span>
        );
        // No grade row, no id — nothing to lock, so not a button.
        if (!entry?.grade_id) return value;
        // A 36px target with the shared keyboard outline. The table is shown
        // from `sm` up only (the card below it has no lock control), so this
        // is a pointer's target; the negative margins give the height back,
        // so a row with buttons is no taller than one without.
        return (
          <button
            type="button"
            onClick={() => openCell(row, term)}
            className="-mx-2 -my-1.5 inline-flex min-h-9 items-center justify-end rounded-lg px-2 text-right transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
          >
            {value}
          </button>
        );
      },
    };
  }

  const columns = [
    { key: 'subject_name', header: 'Subject', sortable: true },
    termColumn(1),
    termColumn(2),
    termColumn(3),
    {
      key: 'final_grade',
      header: 'Final Grade',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.final_grade,
      render: (row) => (
        <div className="whitespace-nowrap">
          {/* `whole` — a Final Grade is an integer. The General Average at
              the foot of this page keeps two decimals and is untouched.
              TWO RENDERERS (feat/look-fixes), the parent card's rule: Grade 1's
              Final is a LETTER, and GradeValue prints a letter as "— N/A", so
              descriptive mode goes through TermValue with its descriptor. */}
          {mode === 'descriptive' ? (
            <TermValue entry={{ descriptive_grade: row.final_grade, descriptor: row.final_grade_descriptor }} mode={mode} />
          ) : (
            <>
              <GradeValue value={row.final_grade} mode={mode} whole />
              {row.final_grade_descriptor ? (
                <div className="text-xs text-fg-muted">{row.final_grade_descriptor.descriptor}</div>
              ) : null}
            </>
          )}
        </div>
      ),
    },
  ];

  const chosenSection = sectionOptions.find((s) => s.name === sectionName) || null;

  return (
    <div>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* No description: the prompt below already says how to pick, and
              an empty state never has to be repeated by a header. */}
          <SectionHeader title="Report card" />

          {/* THE PICKER CARD. Three selects that act on change — there is no
              Apply here, because each choice narrows the next. */}
          <div className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
            <FormField
              label="Grade"
              as="select"
              className={filterSelectClass}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setSectionName('');
                setStudentId('');
                setSelected(null);
              }}
            >
              <option value="">Pick a grade</option>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={String(g)}>
                  Grade {g}
                </option>
              ))}
            </FormField>
            <FormField
              label="Section"
              as="select"
              className={filterSelectClass}
              value={sectionName}
              disabled={!grade}
              onChange={(e) => {
                setSectionName(e.target.value);
                setStudentId('');
                setSelected(null);
              }}
            >
              <option value="">{grade ? 'Pick a section' : 'Pick a grade first'}</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </FormField>
            <FormField
              label="Student"
              as="select"
              className={filterSelectClass}
              value={studentId}
              disabled={!sectionName || studentsLoading || students.length === 0}
              onChange={(e) => {
                setStudentId(e.target.value);
                setSelected(null);
                setStatus({});
              }}
            >
              <option value="">
                {!sectionName ? 'Pick a section first' : studentsLoading ? 'Loading…' : 'Pick a student'}
              </option>
              {students.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.last_name}, {s.first_name}
                  {s.status === 'inactive' ? ' (inactive)' : ''}
                </option>
              ))}
            </FormField>
          </div>

          <FormStatus status={status.card} />

          {grade && sectionsError ? (
            <ErrorAlert message={sectionsError} onRetry={() => setSectionsAttempt((n) => n + 1)} />
          ) : null}
          {studentsError ? <ErrorAlert message={studentsError} onRetry={() => setStudentsAttempt((n) => n + 1)} /> : null}

          {!studentId ? (
            // In the frame the report card will take, so the page keeps its
            // shape when a student is picked.
            <div className={cardClass}>
              {sectionName && !studentsLoading && !studentsError && students.length === 0 ? (
                <EmptyState
                  icon="fa-user-graduate"
                  title={`Grade ${grade} - ${sectionName} has no students`}
                  message={
                    chosenSection && Number(chosenSection.student_count) === 0
                      ? 'No student is enrolled in this section, so there is no report card to show.'
                      : 'No students were returned for this section.'
                  }
                />
              ) : (
                <EmptyState
                  icon="fa-magnifying-glass"
                  title="Pick a student to see their report card"
                  message="Choose a grade, then a section, then a student."
                />
              )}
            </div>
          ) : (
            <>
              {/* THE LEARNER'S HEADER CARD: whose card this is, before the
                  card. An <h3> — the section's <h2> is "Report card" above,
                  and the page's one <h1> is the top bar's. The initials are
                  the learner's name; a learner has no photo (§25). */}
              {student ? (
                <div className={`${cardClass} flex flex-wrap items-center gap-4 p-5`}>
                  <Avatar name={`${student.first_name} ${student.last_name}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-xl font-bold text-fg">
                      {student.first_name} {student.last_name}
                    </h3>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      Grade {student.grade_level} · {student.section} · School year {report.school_year}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                {/* An all-Pending card is the normal early state, not an empty
                    state: replacing it would hide the subject list (Parent →
                    Grades' reasoning). A line above it instead. */}
                {noGradesYet ? (
                  <p className="text-sm font-semibold text-fg-secondary">
                    No grades have been recorded for this student yet.
                  </p>
                ) : null}

                <p className="text-sm text-fg-muted">
                  Select a term grade to lock or unlock it. A term with nothing recorded has no grade to lock.
                </p>
              </div>

              <div>
                <DataTable
                  // GRADE-ROW CARD (DV1b-a), and THE ONE CARD IN THE SYSTEM THAT
                  // CARRIES JSX — stated here because the contract says a card
                  // returns DATA, never JSX, and this is a deliberate exception
                  // rather than an oversight.
                  //
                  // The reason that rule exists is to make a button-inside-a-link
                  // unrepresentable (§5a-iii). `GradeValue` and `TermValue` are
                  // read-only renderers with no interactive element, so they
                  // cannot create that hazard. The alternative would be to format
                  // a grade by hand here, which breaks the STRONGER rule that one
                  // renderer draws every grade-bearing value in the system (§3) —
                  // and would quietly reintroduce the "87.5 vs 87.50" defect DV4
                  // just fixed one component away.
                  //
                  // Static card: locking is an admin action but it lives in the
                  // row's own control on the table, and this page has no detail
                  // route, so neither `to` nor `onSelect` is passed.
                  renderCard={(row) => ({
                    title: row.subject_name,
                    subtitle: (
                      <span className="inline-flex flex-wrap items-center gap-x-3">
                        {[1, 2, 3].map((t) => (
                          <span key={t}>
                            T{t} <TermValue entry={row.terms[t]} mode={mode} />
                          </span>
                        ))}
                      </span>
                    ),
                    meta: (
                      <span>
                        Final{' '}
                        {mode === 'descriptive' ? (
                          <TermValue entry={{ descriptive_grade: row.final_grade, descriptor: row.final_grade_descriptor }} mode={mode} />
                        ) : (
                          <GradeValue value={row.final_grade} mode={mode} whole />
                        )}
                      </span>
                    ),
                  })}
                  columns={columns}
                  rows={subjects}
                  keyField="subject_id"
                  loading={reportLoading}
                  queryKey={[studentId]}
                  error={reportError}
                  onRetry={loadReport}
                  emptyIcon="fa-book"
                  emptyTitle={
                    student
                      ? `No subjects are set up for Grade ${student.grade_level} yet`
                      : 'No subjects are set up for this grade level yet'
                  }
                  emptyMessage="A grade level needs its subject list before a report card can exist."
                />
                {subjects.length ? <GradeLegend pending notApplicable={mode === 'descriptive'} /> : null}
              </div>

              {/* THE GENERAL AVERAGE, as the card's one figure. The SIZE is on
                  the wrapper, never on GradeValue (§3) — two decimals, the
                  server's own number, and no word beside it but the server's
                  descriptor. NOT ON A DESCRIPTIVE CARD (feat/look-fixes): Grade
                  1 has no general average at all (§5a-v, the parent card's
                  rule); Grades 2–3 are numerical and keep it. */}
              {report && subjects.length && mode !== 'descriptive' ? (
                <div className={`${cardClass} flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    General Average
                  </span>
                  <span className="text-xl font-bold tabular-nums text-fg">
                    <GradeValue value={report.general_average} mode={mode} />
                  </span>
                  {report.general_average_descriptor ? (
                    <span className="text-xs text-fg-muted">{report.general_average_descriptor.descriptor}</span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </Reveal>

      <Modal
        open={Boolean(selected)}
        onClose={closeCell}
        closeOnBackdrop={!lockSaving}
        title={selected ? `${selected.subjectName} · Term ${selected.term}` : ''}
        size="sm"
        footer={
          // The neutral way out, then the one filled action. `loading` is the
          // old `disabled={lockSaving}` plus its spinner, in one prop.
          <>
            <Button onClick={closeCell} disabled={lockSaving}>
              Close
            </Button>
            {selectedEntry?.grade_id ? (
              <Button
                variant="primary"
                icon={selectedEntry.is_locked ? 'fa-lock-open' : 'fa-lock'}
                onClick={toggleLock}
                loading={lockSaving}
              >
                {selectedEntry.is_locked ? 'Unlock grade' : 'Lock grade'}
              </Button>
            ) : null}
          </>
        }
      >
        <FormStatus status={status.lock} className="mb-4" />
        {selectedEntry ? (
          <div className="space-y-4">
            {/* The cell as it is stored: its value and its lock state, in one
                tile, above the sentence that says what locking does. */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
              <span className="text-lg font-bold text-fg">
                <TermValue entry={selectedEntry} mode={mode} />
              </span>
              <StatusBadge status={selectedEntry.is_locked ? 'locked' : 'unlocked'} />
            </div>
            {/* §5i: exactly what preflightGradeWrite and DELETE /:id enforce. */}
            <p className="text-sm text-fg-body">
              Locking stops every change to this grade&apos;s scores or letter — by teachers and by
              admins — and stops it from being deleted, until it is unlocked here. Parents and
              teachers still see it exactly as it is; the teacher sees it marked Locked.
            </p>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">This term no longer has a grade record.</p>
        )}
      </Modal>
    </div>
  );
}
