import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import GradeValue from '../../format/grade';
import TermValue from '../../format/TermValue';
import { usePageTitle } from '../../layout/usePageTitle';
import useClassRecord, { cellKey, examKey, parseCell } from './classRecord/useClassRecord';
import Cell from './classRecord/Cell';
import SlotHeader from './classRecord/SlotHeader';

// Teacher → Class record (CR2, 2026-09-22). The DepEd E-Class Record shape:
// learners as rows, assessment slots as columns, one Save for the class.
// It replaces the per-learner encode panel that used to live on Teacher →
// Grades — one quiz for forty learners was up to eighty requests through
// that modal.
//
// ---------------------------------------------------------------------------
// NO GRADE ARITHMETIC HAPPENS HERE. NONE.
// ---------------------------------------------------------------------------
// Every number on screen came from the server: either the last GET, or a
// `dry_run` PUT that runs the real save inside a transaction and rolls it
// back. That is the only reason live totals are possible without a second
// implementation of gradeComputation.js in the client — the thing CLAUDE.md
// has refused since the first encode screen, because a copy drifts the first
// time DepEd changes anything, and the value it would drift on decides
// promotion and prints on the SF9.
//
// The consequence to keep in mind while reading: a Total is `— Pending`
// until the server says otherwise, never a number this file added up.
//
// ---------------------------------------------------------------------------
// WHY NOT DataTable (§5)
// ---------------------------------------------------------------------------
// Same exemption as the report card, for a different reason: this is a
// MATRIX, not a list of records. Every cell is a form control, the column
// set is the class's own assessments, and sorting it would scramble a
// document teachers read alongside paper. It still owns loading, error and
// empty inside its own frame, which is the part of §5 that is about the page
// rather than the component.
//
// ---------------------------------------------------------------------------
// THE STICKY LEARNER COLUMN (decided here, 2026-09-22)
// ---------------------------------------------------------------------------
// `sticky left-0` on the first cell of every row, INSIDE the horizontal
// scroller. §5a-i closed the sticky HEADER because it needs the page as its
// scrollport while containing a too-wide table needs the wrapper to be one —
// a real conflict. A sticky COLUMN resolves `left` against that same
// horizontal scroller, the thing §5a-i kept, so the conflict does not arise.
//
// The cost that section names is real and is paid here: EVERY sticky cell
// carries its own opaque background, repainted on hover and on a locked row,
// or the scrolled content shows through it. That is why the learner cell
// sets `bg-surface` itself and repeats the hover and locked variants rather
// than inheriting them from the row.
//
// No `renderCard` fallback below the crossover. One card per learner holding
// nine score boxes is a form, not a card, and §5a-iii's rule that a card has
// exactly one interactive element makes it unrepresentable anyway.

const TERMS = [1, 2, 3];

// Module constants, not values rebuilt per render: both are read inside
// useMemo dependency lists, and an array literal in the component body is a
// new reference every render, which makes every memo that names it useless.
const EXAM_FIELDS = ['st1', 'st2', 'te'];
const NO_SLOTS = [];

function useClassOptions() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ENCODE SCOPE, from GET /assignments — the teacher's own rows. NOT
        // useTeacherTargets, whose union is assigned OR adviser and would
        // offer a class this page cannot write to (the same warning Teacher →
        // Grades carries).
        const rows = await fetchAll('/assignments', { unwrap: 'assignments' });
        if (cancelled) return;
        setClasses(rows);
        const subjectIds = [...new Set(rows.map((r) => r.subject_id))];
        setSubjects(subjectIds);
      } catch (err) {
        if (!cancelled) setError(extractError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { classes, subjects, loading, error };
}

export default function ClassRecordPage() {
  usePageTitle('Class record');

  const [params, setParams] = useSearchParams();
  const { classes, loading: classesLoading, error: classesError } = useClassOptions();

  const [schoolYear, setSchoolYear] = useState(null);
  const [settingsError, setSettingsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((settings) => {
        if (!cancelled) setSchoolYear(settings.academic_year);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assignmentId = params.get('assignment');
  const term = Number(params.get('term')) || 1;

  const selected = useMemo(() => {
    if (!classes.length) return null;
    const byId = classes.find((c) => String(c.id) === String(assignmentId));
    return byId || classes[0];
  }, [classes, assignmentId]);

  const classKey = useMemo(() => {
    if (!selected || !schoolYear) return null;
    return {
      subject_id: selected.subject_id,
      grade_level: selected.grade_level,
      section: selected.section,
      term,
      school_year: schoolYear,
    };
  }, [selected, term, schoolYear]);

  const record = useClassRecord(classKey);
  const { server, draft, setDraft, slotDraft, setSlotDraft, preview, previewing, previewError } = record;

  const [status, setStatus] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ---- the unsaved-changes guard ----
  // ONLY while dirty. CLAUDE.md is explicit that Teacher → Grades has no
  // guard BECAUSE every score there is its own request, and that a blanket
  // beforeunload is the thing not to build — one that fires when nothing is
  // dirty is one people learn to dismiss, and then a real one goes unread.
  // This page is a bulk submit of up to several hundred values, which is the
  // case that was always said to warrant it.
  useEffect(() => {
    if (!record.dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [record.dirty]);

  const slots = server?.slots || NO_SLOTS;
  const wwSlots = useMemo(() => slots.filter((s) => s.type === 'WW'), [slots]);
  const ptSlots = useMemo(() => slots.filter((s) => s.type === 'PT'), [slots]);
  const descriptive = server?.grading_mode === 'descriptive';

  // How many learners hold a score in each slot — the count the slot Modal
  // shows before anyone tries to clear a highest possible score.
  const scoredCounts = useMemo(() => {
    const counts = {};
    for (const slot of slots) counts[slot.id] = 0;
    for (const learner of server?.learners || []) {
      for (const slotId of Object.keys(learner.scores)) {
        if (counts[slotId] !== undefined) counts[slotId] += 1;
      }
    }
    return counts;
  }, [server, slots]);

  const examFields = EXAM_FIELDS;

  // The navigable order, handed to every Cell so the keyboard model does not
  // have to know what a slot or a Summative part is.
  const grid = useMemo(() => {
    const cols = [
      ...wwSlots.map((s) => String(s.id)),
      ...ptSlots.map((s) => String(s.id)),
      ...EXAM_FIELDS.map((f) => `${f}_score`),
    ];
    return { rows: (server?.learners || []).map((l) => l.student_id), cols };
  }, [server, wwSlots, ptSlots]);

  const valueFor = useCallback(
    (learner, field) => {
      const k = `${learner.student_id}:${field}`;
      if (draft[k] !== undefined) return draft[k];
      if (field.startsWith('st') || field.startsWith('te')) {
        const stored = learner[`ex_${field.replace('_score', '').replace('_max', '')}${field.endsWith('_max') ? '_max' : ''}`];
        return stored === null || stored === undefined ? '' : String(stored);
      }
      const stored = learner.scores[field];
      return stored === undefined ? '' : String(stored);
    },
    [draft]
  );

  const setCell = useCallback(
    (learnerId, field, value) => {
      setDraft((d) => ({ ...d, [`${learnerId}:${field}`]: value }));
    },
    [setDraft]
  );

  const slotMax = useCallback(
    (slot) => {
      const d = slotDraft[slot.id];
      if (d?.max_score !== undefined) return d.max_score === '' ? null : Number(d.max_score);
      return slot.max_score;
    },
    [slotDraft]
  );

  // ---- everything the Save confirmation has to name, gathered once ----
  const pending = useMemo(() => {
    if (!server) return { hpsChanges: [], aboveMax: [], invalid: [] };

    const hpsChanges = [];
    for (const slot of slots) {
      const next = slotMax(slot);
      if (next !== slot.max_score && slot.max_score !== null && next !== null) {
        hpsChanges.push({ slot, from: slot.max_score, to: next, count: scoredCounts[slot.id] || 0 });
      }
    }

    const aboveMax = [];
    const invalid = [];
    for (const learner of server.learners) {
      for (const slot of slots) {
        const raw = valueFor(learner, String(slot.id));
        const parsed = parseCell(raw);
        if (parsed.error) {
          invalid.push({ learner, label: slot.display_label });
          continue;
        }
        const max = slotMax(slot);
        if (parsed.value !== null && max !== null && parsed.value > max) {
          aboveMax.push({ learner, label: slot.display_label, score: parsed.value, max });
        }
      }
    }
    return { hpsChanges, aboveMax, invalid };
  }, [server, slots, slotMax, scoredCounts, valueFor]);

  async function doSave() {
    setConfirmOpen(false);
    const result = await record.save();
    if (result.nothing) {
      setStatus({ save: ok('Nothing to save — no changes yet.') });
      return;
    }
    setStatus(result.ok ? { save: ok('Class record saved.') } : { save: fail(result.message) });
  }

  function onSaveClick() {
    // ONE confirmation, listing everything that needs acknowledging in a
    // single read (§5e names the specific decision back). If there is nothing
    // to acknowledge, there is nothing to confirm: a save that changes only
    // scores within their maxima is absorbed by the endpoint and gets no
    // dialog, the same rule attendance follows.
    const needsConfirm = pending.hpsChanges.length > 0 || pending.aboveMax.length > 0;
    if (needsConfirm) setConfirmOpen(true);
    else doSave();
  }

  const canEncode = Boolean(server?.can_encode);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Class record</h1>
          <p className="text-sm text-fg-muted">
            Record every learner&rsquo;s scores for one subject and term, then save the whole class at once.
          </p>
        </div>
        <Link
          to="/teacher/grades"
          className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body hover:bg-surface-subtle"
        >
          Back to Grades
        </Link>
      </div>

      {classesError ? <ErrorAlert message={classesError} /> : null}
      {settingsError ? <ErrorAlert message={settingsError} /> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-3">
        <FormField
          label="Class"
          as="select"
          className={filterSelectClass}
          value={selected ? String(selected.id) : ''}
          disabled={classesLoading || !classes.length}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('assignment', e.target.value);
            setParams(next);
          }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject_name} — Grade {c.grade_level} - {c.section}
            </option>
          ))}
        </FormField>

        <FormField
          label="Term"
          as="select"
          className={filterSelectClass}
          value={String(term)}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('term', e.target.value);
            setParams(next);
          }}
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>
              Term {t}
            </option>
          ))}
        </FormField>
      </div>

      {classesLoading || record.loading ? (
        <LoadingSpinner className="py-16" label="Loading the class record…" />
      ) : classes.length === 0 ? (
        <EmptyState
          icon="fa-chalkboard-user"
          title="No classes assigned to you"
          message="A class record needs a subject you are assigned to teach. Ask an admin to add the assignment."
        />
      ) : record.error ? (
        <ErrorAlert message={record.error} onRetry={record.reload} />
      ) : !server ? null : (
        <>
          {!canEncode ? (
            <p className="rounded-lg border border-edge bg-surface-subtle px-3 py-2 text-sm text-fg-muted">
              You can see this class record but not change it — you are not the assigned teacher for{' '}
              {server.subject.name} in Grade {server.grade_level} - {server.section}.
            </p>
          ) : null}

          {/* A FAILED PREVIEW NEVER BLOCKS TYPING OR SAVING. The last good
              values stay on screen, marked stale — the dry run failing
              usually means the real save will too, and the Save button
              surfaces that properly when it is pressed. */}
          {previewError ? (
            <div className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-fg">
              Live totals are out of date — {previewError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-edge">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {server.subject.name}, Grade {server.grade_level} - {server.section}, term {server.term}: every
                learner&rsquo;s scores for each assessment.
              </caption>
              <thead>
                <tr className="border-b border-edge">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-surface-subtle px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-fg-body"
                  >
                    Learner
                  </th>
                  {wwSlots.map((slot) => (
                    <th key={slot.id} scope="col" className="bg-surface-subtle px-1 py-2 align-top">
                      <SlotHeader
                        slot={slot}
                        draft={slotDraft[slot.id]}
                        canEncode={canEncode}
                        scoredCount={scoredCounts[slot.id] || 0}
                        onDraft={(d) => setSlotDraft((s) => ({ ...s, [slot.id]: d }))}
                      />
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase text-fg-body">
                    WW %
                  </th>
                  {ptSlots.map((slot) => (
                    <th key={slot.id} scope="col" className="bg-surface-subtle px-1 py-2 align-top">
                      <SlotHeader
                        slot={slot}
                        draft={slotDraft[slot.id]}
                        canEncode={canEncode}
                        scoredCount={scoredCounts[slot.id] || 0}
                        onDraft={(d) => setSlotDraft((s) => ({ ...s, [slot.id]: d }))}
                      />
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase text-fg-body">
                    PT %
                  </th>
                  {examFields.map((f) => (
                    <th key={f} scope="col" className="whitespace-nowrap bg-surface-subtle px-1 py-2 text-xs font-semibold uppercase text-fg-body">
                      {f.toUpperCase()}
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase text-fg-body">
                    {descriptive ? 'Summative %' : 'EX %'}
                  </th>
                  <th scope="col" className="whitespace-nowrap bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase text-fg-body">
                    Initial
                  </th>
                  <th scope="col" className="whitespace-nowrap bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase text-fg-body">
                    {descriptive ? 'Letter' : 'Term grade'}
                  </th>
                </tr>
              </thead>

              <tbody>
                {server.learners.map((learner) => {
                  const live = preview?.get(learner.student_id);
                  // The preview wins while it is fresh; the stored read is
                  // the fallback. Both come from the server — this is a
                  // choice between two server answers, never a computation.
                  const computed = live || learner;
                  const stale = previewing || Boolean(previewError);
                  const rowDisabled = !canEncode || learner.is_locked;

                  return (
                    <tr key={learner.student_id} className="group border-b border-edge-soft hover:bg-surface-subtle">
                      {/* THE STICKY CELL PAINTS ITS OWN BACKGROUND, including
                          the hover and locked variants. Inheriting them from
                          the row would leave it transparent and the scrolled
                          columns would show through it. */}
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-left font-normal text-fg ${
                          learner.is_locked ? 'bg-surface-muted' : 'bg-surface group-hover:bg-surface-subtle'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {learner.name}
                          {learner.is_locked ? <StatusBadge status="locked" /> : null}
                        </span>
                        {learner.legacy_components > 0 ? (
                          <span className="block text-[0.65rem] text-fg-muted">
                            {learner.legacy_components} score{learner.legacy_components === 1 ? '' : 's'} recorded before
                            this grid — counted, not shown
                          </span>
                        ) : null}
                      </th>

                      {[...wwSlots, ...ptSlots].map((slot, index) => {
                        const isFirstPt = index === wwSlots.length;
                        const max = slotMax(slot);
                        const raw = valueFor(learner, String(slot.id));
                        const parsed = parseCell(raw);
                        return (
                          <Fragment key={slot.id}>
                            {isFirstPt ? (
                              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                                <GradeValue value={computed.ww_percentage} mode="numerical" />
                              </td>
                            ) : null}
                            <td className="px-1 py-1.5 text-center">
                              <Cell
                                studentId={learner.student_id}
                                field={String(slot.id)}
                                value={raw}
                                grid={grid}
                                disabled={rowDisabled || max === null}
                                dirty={draft[cellKey(learner.student_id, slot.id)] !== undefined}
                                aboveMax={parsed.value !== null && max !== null && parsed.value > max}
                                hint={`${learner.name} — ${slot.display_label}${max === null ? ' (not in use)' : ` (out of ${max})`}`}
                                onChange={(v) => setCell(learner.student_id, String(slot.id), v)}
                              />
                            </td>
                          </Fragment>
                        );
                      })}

                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        <GradeValue value={computed.pt_percentage} mode="numerical" />
                      </td>

                      {examFields.map((f) => (
                        <td key={f} className="px-1 py-1.5 text-center">
                          <Cell
                            studentId={learner.student_id}
                            field={`${f}_score`}
                            value={valueFor(learner, `${f}_score`)}
                            grid={grid}
                            disabled={rowDisabled}
                            dirty={draft[examKey(learner.student_id, `${f}_score`)] !== undefined}
                            hint={`${learner.name} — ${f.toUpperCase()}`}
                            onChange={(v) => setCell(learner.student_id, `${f}_score`, v)}
                          />
                        </td>
                      ))}

                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        <GradeValue value={computed.ex_percentage} mode="numerical" />
                      </td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${stale ? 'opacity-60' : ''}`}>
                        {/* A TEACHER MAY SEE THE INITIAL GRADE — they
                            encoded the scores it comes from. A parent never
                            does; that is enforced on the parent screens. */}
                        <GradeValue value={computed.initial_grade} mode="numerical" />
                      </td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right font-medium ${stale ? 'opacity-60' : ''}`}>
                        {descriptive ? (
                          <TermValue
                            entry={{ descriptive_grade: computed.descriptive_grade, descriptor: null }}
                            mode="descriptive"
                          />
                        ) : (
                          <GradeValue value={computed.term_grade} mode="numerical" whole />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {server.learners.length === 0 ? (
            <EmptyState
              icon="fa-user-group"
              title="No active learners in this class"
              message={`Grade ${server.grade_level} - ${server.section} has no active learners, so there is nothing to record yet.`}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
              disabled={!canEncode || record.saving || !record.dirty}
              onClick={onSaveClick}
            >
              {record.saving ? 'Saving…' : 'Save all'}
            </button>
            {previewing ? <span className="text-xs text-fg-muted">calculating…</span> : null}
            {record.dirty && !record.saving ? (
              <span className="text-xs text-fg-muted">You have unsaved changes.</span>
            ) : null}
            {pending.invalid.length > 0 ? (
              <span className="text-xs text-danger-fg">
                {pending.invalid.length} cell{pending.invalid.length === 1 ? '' : 's'} need a whole number.
              </span>
            ) : null}
          </div>

          <FormStatus status={status.save} />
        </>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Save the class record?" size="md">
        <div className="space-y-4 text-sm text-fg-body">
          {pending.hpsChanges.length > 0 ? (
            <div>
              <h3 className="font-semibold text-fg">Highest possible scores change</h3>
              <ul className="mt-1 space-y-1 text-fg-muted">
                {pending.hpsChanges.map((c) => (
                  <li key={c.slot.id}>
                    {c.slot.display_label}: {c.from} → {c.to}. This recomputes {c.count}{' '}
                    {c.count === 1 ? 'learner who already has' : 'learners who already have'} a score in it.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pending.aboveMax.length > 0 ? (
            <div>
              <h3 className="font-semibold text-fg">
                {pending.aboveMax.length} score{pending.aboveMax.length === 1 ? ' is' : 's are'} above the highest
                possible score
              </h3>
              <ul className="mt-1 space-y-1 text-fg-muted">
                {pending.aboveMax.map((a) => (
                  <li key={`${a.learner.student_id}-${a.label}`}>
                    {a.learner.name} — {a.label}: {a.score}/{a.max}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-fg-muted">
                These are saved as typed. Bonus points are allowed and are not capped.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body hover:bg-surface-subtle"
              onClick={() => setConfirmOpen(false)}
            >
              Go back
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
              onClick={doSave}
            >
              Save all
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
