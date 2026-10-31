import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import FormField, { filterSelectClass } from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';
import {
  GRADE_LEVELS,
  addButtonLabel,
  adviserWarning,
  alsoAdvisesSentence,
  alsoTaughtBy,
  assignmentsOf,
  classLabel,
  pendingLettersIn,
  removeSentence,
  resultText,
  runPairs,
  splitPairs,
  teacherLabel,
} from './assignments';

// Admin → Assignments & advisers (Module 11, the owner's SCOPE DECISION of
// 2026-10-31, after the panel asked for departmentalized subject teachers).
// Web only, like Backup & Restore. FRONTEND §37.
//
// TWO WRITES AND NOTHING ELSE: teacher_assignments (who records grades for
// which subject in which class) and sections.adviser_id (who advises the
// class). Attendance, excuse review and enrolment stay the adviser's.
//
// NO ENDPOINT OF ITS OWN. Every read and write existed before this page, and
// the Add form's several pairs are several POSTs (assignments.js runPairs).
//
// EVERY LIST IS FETCHED WHOLE and filtered here, so its query never changes
// and neither table needs a `queryKey`. §5b: each table renders from its last
// successful read and `useRead` is the only writer; a write re-reads.
//
// §5e: Remove names the decision back, because DELETE has no undo and the
// admin should see that grades stay. An add has an undo (Remove), and a repeat
// is refused rather than doubled, so it asks nothing. Setting an adviser
// absorbs a repeat, so its own dialog is the only step, and that dialog
// carries the warning about waiting letters (the owner's Q3: warn, never block).

const CHECK_CLASS =
  'mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

const EMPTY_FORM = { grade: '', subjectIds: [], sections: [] };

async function readAssignments() {
  return fetchAll('/assignments', { unwrap: 'assignments' });
}

// Inactive teachers stay in the picker: their rows can still be removed.
async function readTeachers() {
  return fetchAll('/users', { unwrap: 'users', params: { role: 'teacher', sort: 'name' } });
}

async function readSubjects() {
  return api.get('/subjects', { unwrap: 'subjects' });
}

async function readSections() {
  const settings = await api.get('/settings', { unwrap: 'settings' });
  return api.get('/sections', { unwrap: 'sections', params: { school_year: settings.academic_year } });
}

// `load` sets state only in its reply's callbacks, so the effect sets nothing
// synchronously (react(set-state-in-effect)); a caller re-reading goes through
// `reload`, which marks the list busy first.
function useRead(read) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      read().then(
        (data) => {
          setRows(data);
          setError(null);
          setLoading(false);
        },
        (err) => {
          setError(extractError(err));
          setRows([]);
          setLoading(false);
        }
      ),
    [read]
  );

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return load();
  }, [load]);

  return { rows, loading, error, reload };
}

// One "pick several" list. `All` ticks every option; it is a real checkbox so
// the keyboard and a screen reader get it for free.
function CheckGroup({ legend, allLabel, options, selected, disabled, onChange }) {
  const allOn = options.length > 0 && options.every((option) => selected.includes(option.value));

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <fieldset className="min-w-0 space-y-1">
      <legend className="text-sm font-semibold text-fg-secondary">{legend}</legend>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-semibold text-fg-body">
        <input
          type="checkbox"
          className={CHECK_CLASS}
          checked={allOn}
          disabled={disabled}
          onChange={() => onChange(allOn ? [] : options.map((option) => option.value))}
        />
        <span>{allLabel}</span>
      </label>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg-body">
          <input
            type="checkbox"
            className={CHECK_CLASS}
            checked={selected.includes(option.value)}
            disabled={disabled}
            onChange={() => toggle(option.value)}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function AssignmentsPage() {
  usePageTitle('Assignments & advisers');

  const assignments = useRead(readAssignments);
  const teachers = useRead(readTeachers);
  const subjects = useRead(readSubjects);
  const sections = useRead(readSections);

  const [teacherId, setTeacherId] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  // Keyed by the list it describes (§7c): writing a key replaces the object.
  const [status, setStatus] = useState({});

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState(null);
  // A ref, not only `adding`: a second press in the same tick must not start
  // a second run.
  const addingRef = useRef(false);

  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeStatus, setRemoveStatus] = useState(null);

  const [advising, setAdvising] = useState(null);
  const [adviserChoice, setAdviserChoice] = useState('');
  const [adviserBusy, setAdviserBusy] = useState(false);
  const [adviserStatus, setAdviserStatus] = useState(null);
  // null while the read is out; 'failed' when it could not be read.
  const [pending, setPending] = useState(null);
  const pendingRead = useRef(0);

  const teacher = useMemo(
    () => teachers.rows.find((row) => String(row.id) === String(teacherId)) || null,
    [teachers.rows, teacherId]
  );
  const teacherRows = useMemo(
    () => (teacher ? assignmentsOf(assignments.rows, teacher.id) : []),
    [assignments.rows, teacher]
  );
  const activeTeachers = useMemo(() => teachers.rows.filter((row) => row.status === 'active'), [teachers.rows]);

  const shownSections = useMemo(
    () =>
      gradeFilter ? sections.rows.filter((row) => Number(row.grade_level) === Number(gradeFilter)) : sections.rows,
    [sections.rows, gradeFilter]
  );

  // ---- add ----
  const formSubjects = useMemo(
    () => subjects.rows.filter((row) => Number(row.grade_level) === Number(form.grade)),
    [subjects.rows, form.grade]
  );
  const formSections = useMemo(
    () => sections.rows.filter((row) => Number(row.grade_level) === Number(form.grade)),
    [sections.rows, form.grade]
  );
  const pairs = useMemo(
    () =>
      splitPairs({
        rows: assignments.rows,
        teacherId,
        subjects: formSubjects.filter((row) => form.subjectIds.includes(row.id)),
        sections: form.sections,
      }),
    [assignments.rows, teacherId, formSubjects, form.subjectIds, form.sections]
  );

  function openAdd() {
    setForm(EMPTY_FORM);
    setAddStatus(null);
    setAddOpen(true);
  }

  function closeAdd() {
    if (!addingRef.current) setAddOpen(false);
  }

  async function submitAdd(event) {
    event.preventDefault();
    if (addingRef.current || !pairs.toAdd.length) return;
    addingRef.current = true;
    setAdding(true);
    setAddStatus(null);
    const outcome = await runPairs(
      pairs.toAdd,
      ({ subject_id, section }) =>
        api.post('/assignments', { teacher_id: teacher.id, subject_id, section }, { unwrap: 'assignment' }),
      extractError
    );
    await assignments.reload();
    addingRef.current = false;
    setAdding(false);
    // A failure keeps the dialog open: what was added now reads as held, so
    // pressing Add again retries only what failed.
    if (outcome.failures.length) {
      setAddStatus(fail(resultText(outcome)));
      return;
    }
    setStatus({ assignments: ok(resultText(outcome)) });
    setAddOpen(false);
  }

  // ---- remove ----
  function openRemove(row) {
    setRemoveStatus(null);
    setRemoving(row);
  }

  async function confirmRemove() {
    setRemoveBusy(true);
    setRemoveStatus(null);
    try {
      await api.delete(`/assignments/${removing.id}`, { unwrap: 'message' });
      setRemoving(null);
      setStatus({ assignments: ok('Assignment removed.') });
      await assignments.reload();
    } catch (err) {
      setRemoveStatus(fail(extractError(err)));
    } finally {
      setRemoveBusy(false);
    }
  }

  // ---- set adviser ----
  function openAdviser(section) {
    setAdviserStatus(null);
    setAdviserChoice(section.adviser_id == null ? '' : String(section.adviser_id));
    setPending(null);
    setAdvising(section);
    // Read when the dialog opens, so the count is today's. A newer dialog
    // outruns an older read.
    const readId = pendingRead.current + 1;
    pendingRead.current = readId;
    fetchAll('/excuse-letters', { unwrap: 'excuse_letters', params: { status: 'Pending' } }).then(
      (letters) => {
        if (pendingRead.current === readId) setPending(pendingLettersIn(letters, section));
      },
      () => {
        if (pendingRead.current === readId) setPending('failed');
      }
    );
  }

  const adviserChanged = advising !== null && adviserChoice !== (advising.adviser_id == null ? '' : String(advising.adviser_id));
  const chosenAdviser = teachers.rows.find((row) => String(row.id) === adviserChoice) || null;

  async function submitAdviser(event) {
    event.preventDefault();
    if (!adviserChanged || pending === null) return;
    setAdviserBusy(true);
    setAdviserStatus(null);
    try {
      await api.patch(
        `/sections/${advising.id}/adviser`,
        { adviser_id: adviserChoice === '' ? null : Number(adviserChoice) },
        { unwrap: 'section' }
      );
      setAdvising(null);
      setStatus({ advisers: ok('Section adviser updated.') });
      await sections.reload();
    } catch (err) {
      setAdviserStatus(fail(extractError(err)));
    } finally {
      setAdviserBusy(false);
    }
  }

  // A current adviser who has since been deactivated stays visible and marked:
  // the row is still the truth, and clearing it still works.
  function adviserName(section) {
    if (section.adviser_id == null) return null;
    const row = teachers.rows.find((t) => Number(t.id) === Number(section.adviser_id));
    return row ? teacherLabel(row) : section.adviser_name;
  }

  const assignmentColumns = [
    { key: 'subject_name', header: 'Subject', sortable: true, render: (row) => row.subject_name },
    {
      key: 'class',
      header: 'Class',
      sortable: true,
      sortValue: (row) => `${row.grade_level}-${row.section}`,
      nowrap: true,
      render: (row) => classLabel(row.grade_level, row.section),
    },
    {
      key: 'also',
      header: 'Also taught by',
      render: (row) => alsoTaughtBy(assignments.rows, row).join(', ') || null,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      nowrap: true,
      render: (row) => (
        <Button size="sm" variant="danger-outline" onClick={() => openRemove(row)}>
          Remove
        </Button>
      ),
    },
  ];

  const sectionColumns = [
    {
      key: 'class',
      header: 'Class',
      sortable: true,
      sortValue: (row) => `${row.grade_level}-${row.name}`,
      nowrap: true,
      render: (row) => classLabel(row.grade_level, row.name),
    },
    { key: 'student_count', header: 'Learners', sortable: true, align: 'right', render: (row) => row.student_count },
    {
      key: 'adviser',
      header: 'Adviser',
      sortable: true,
      sortValue: (row) => adviserName(row),
      render: (row) => adviserName(row) || <span className="text-fg-muted">No adviser</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      nowrap: true,
      render: (row) => (
        <Button size="sm" onClick={() => openAdviser(row)}>
          Change
        </Button>
      ),
    },
  ];

  // §5f: one branch per cause. The header's Add button is never repeated here.
  let assignmentsEmpty = { icon: 'fa-chalkboard-user', title: 'Choose a teacher', message: 'Their subjects and classes appear here.' };
  if (teacher?.status === 'active') {
    assignmentsEmpty = {
      icon: 'fa-chalkboard-user',
      title: 'No assignments yet',
      message: `Use Add assignment to give ${teacher.name} a subject and a class.`,
    };
  } else if (teacher) {
    assignmentsEmpty = {
      icon: 'fa-user-slash',
      title: 'No assignments',
      message: 'This account is inactive, so nothing can be added.',
    };
  }

  const warning = !adviserChanged || pending === 'failed' ? null : adviserWarning(pending, chosenAdviser?.name);
  const alsoAdvises = adviserChanged && adviserChoice ? alsoAdvisesSentence(sections.rows, adviserChoice, advising.id) : null;

  return (
    <>
      <Reveal className="space-y-8">
        <section className="space-y-3">
          <SectionHeader
            title="Teaching assignments"
            description={
              <span className="block max-w-prose">
                An assignment lets a teacher record grades for one subject in one class. Attendance and excuse
                letters stay with the class adviser.
              </span>
            }
            actions={
              <Button variant="primary" icon="fa-plus" disabled={teacher?.status !== 'active'} onClick={openAdd}>
                Add assignment
              </Button>
            }
          />

          <div className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
            <FormField
              label="Teacher"
              as="select"
              className={filterSelectClass}
              value={teacherId}
              disabled={teachers.loading || Boolean(teachers.error)}
              onChange={(e) => {
                setTeacherId(e.target.value);
                setStatus({});
              }}
            >
              <option value="">Choose a teacher</option>
              {teachers.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {teacherLabel(row)}
                </option>
              ))}
            </FormField>
          </div>

          <FormStatus status={status.assignments} />

          <DataTable
            columns={assignmentColumns}
            rows={teacherRows}
            loading={assignments.loading || teachers.loading}
            error={assignments.error || teachers.error}
            onRetry={() => {
              assignments.reload();
              teachers.reload();
            }}
            renderCard={(row) => {
              const also = alsoTaughtBy(assignments.rows, row).join(', ');
              return {
                title: row.subject_name,
                subtitle: classLabel(row.grade_level, row.section),
                meta: also ? `Also taught by ${also}` : null,
                actions: assignmentColumns[assignmentColumns.length - 1].render(row),
              };
            }}
            emptyIcon={assignmentsEmpty.icon}
            emptyTitle={assignmentsEmpty.title}
            emptyMessage={assignmentsEmpty.message}
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Section advisers"
            description={
              <span className="block max-w-prose">
                The adviser records attendance, reviews excuse letters and enrols learners for the class.
              </span>
            }
          />

          <div className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
            <FormField
              label="Grade"
              as="select"
              className={filterSelectClass}
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
            >
              <option value="">All grades</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={String(g)}>
                  Grade {g}
                </option>
              ))}
            </FormField>
          </div>

          <FormStatus status={status.advisers} />

          <DataTable
            columns={sectionColumns}
            rows={shownSections}
            loading={sections.loading || teachers.loading}
            error={sections.error || teachers.error}
            onRetry={() => {
              sections.reload();
              teachers.reload();
            }}
            renderCard={(row) => ({
              title: classLabel(row.grade_level, row.name),
              subtitle: adviserName(row) || 'No adviser',
              meta: `Learners: ${row.student_count}`,
              actions: sectionColumns[sectionColumns.length - 1].render(row),
            })}
            emptyIcon="fa-chalkboard-user"
            emptyTitle="No sections"
            emptyMessage={gradeFilter ? `Grade ${gradeFilter} has no sections this school year.` : 'No sections exist for this school year.'}
          />
        </section>
      </Reveal>

      <Modal
        open={addOpen}
        onClose={closeAdd}
        closeOnBackdrop={!adding}
        title={teacher ? `Add assignment for ${teacher.name}` : 'Add assignment'}
        size="lg"
        footer={
          <>
            <Button onClick={closeAdd} disabled={adding}>
              Close
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="add-assignment-form"
              disabled={!pairs.toAdd.length}
              loading={adding}
            >
              {addButtonLabel(pairs.toAdd.length)}
            </Button>
          </>
        }
      >
        <form id="add-assignment-form" onSubmit={submitAdd} className="space-y-4">
          {subjects.error ? <FormStatus status={fail(subjects.error)} /> : null}
          <FormField
            label="Grade"
            as="select"
            value={form.grade}
            disabled={adding}
            onChange={(e) => setForm({ ...EMPTY_FORM, grade: e.target.value })}
          >
            <option value="">Choose a grade</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={String(g)}>
                Grade {g}
              </option>
            ))}
          </FormField>

          {form.grade ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckGroup
                legend="Subjects"
                allLabel="All subjects"
                options={formSubjects.map((row) => ({ value: row.id, label: row.name }))}
                selected={form.subjectIds}
                disabled={adding}
                onChange={(subjectIds) => setForm((prev) => ({ ...prev, subjectIds }))}
              />
              <CheckGroup
                legend="Sections"
                allLabel="All sections"
                options={formSections.map((row) => ({ value: row.name, label: row.name }))}
                selected={form.sections}
                disabled={adding}
                onChange={(picked) => setForm((prev) => ({ ...prev, sections: picked }))}
              />
            </div>
          ) : null}

          {pairs.alreadyHeld.length ? (
            <p className="text-sm text-fg-muted">
              Already assigned:{' '}
              {pairs.alreadyHeld
                .map((pair) => `${pair.subject_name} in ${classLabel(pair.grade_level, pair.section)}`)
                .join(', ')}
              .
            </p>
          ) : null}

          <FormStatus status={addStatus} />
        </form>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => (removeBusy ? null : setRemoving(null))}
        closeOnBackdrop={!removeBusy}
        title="Remove this assignment?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRemove} loading={removeBusy}>
              Remove assignment
            </Button>
          </>
        }
      >
        {removing ? <p className="break-words text-sm text-fg-secondary">{removeSentence(removing)}</p> : null}
        <FormStatus status={removeStatus} className="mt-4" />
      </Modal>

      <Modal
        open={Boolean(advising)}
        onClose={() => (adviserBusy ? null : setAdvising(null))}
        closeOnBackdrop={!adviserBusy}
        title={advising ? `Adviser of ${classLabel(advising.grade_level, advising.name)}` : 'Adviser'}
        size="md"
        footer={
          <>
            <Button onClick={() => setAdvising(null)} disabled={adviserBusy}>
              Close
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="set-adviser-form"
              disabled={!adviserChanged || pending === null}
              loading={adviserBusy}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="set-adviser-form" onSubmit={submitAdviser} className="space-y-4">
          <FormField
            label="Adviser"
            as="select"
            value={adviserChoice}
            disabled={adviserBusy}
            onChange={(e) => setAdviserChoice(e.target.value)}
          >
            <option value="">No adviser</option>
            {/* Only an active teacher can be chosen. A current adviser who was
                deactivated stays listed, marked, so the select tells the truth. */}
            {advising && advising.adviser_id != null && !activeTeachers.some((t) => t.id === advising.adviser_id) ? (
              <option value={String(advising.adviser_id)}>{adviserName(advising)}</option>
            ) : null}
            {activeTeachers.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.name}
              </option>
            ))}
          </FormField>

          {alsoAdvises ? <p className="text-sm text-fg-muted">{alsoAdvises}</p> : null}

          {warning ? (
            <p className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
              <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
              <span className="min-w-0 flex-1">{warning}</span>
            </p>
          ) : null}

          {adviserChanged && pending === 'failed' ? (
            <p className="text-sm text-fg-muted">Waiting excuse letters could not be checked.</p>
          ) : null}

          <FormStatus status={adviserStatus} />
        </form>
      </Modal>
    </>
  );
}
