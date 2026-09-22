import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import useClassRecord, { buildSlotFrame, slotKey, parseCell } from './classRecord/useClassRecord';
import Cell from './classRecord/Cell';
import SlotHeader from './classRecord/SlotHeader';

// Teacher → Grades IS the class record (CR2, 2026-09-22). The DepEd E-Class
// Record shape: learners as rows, assessment slots as columns, one Save for
// the class. It replaced the per-learner encode panel — one quiz for forty
// learners was up to eighty requests through that modal — and since the
// review it is the ONLY teacher grades screen. The per-learner cross-subject
// view returns as the adviser class summary (CR3).
//
// ---------------------------------------------------------------------------
// NO GRADE ARITHMETIC HAPPENS HERE. NONE.
// ---------------------------------------------------------------------------
// Every number on screen came from the server: the last GET, or a `dry_run`
// PUT that runs the real save inside a transaction and rolls it back. That
// includes Total, PS and WS — a Total this file summed could disagree with
// the PS beside it by a rounding step, and two figures that should agree and
// do not is the hardest kind of wrong number to explain to a teacher.
//
// ---------------------------------------------------------------------------
// WHY NOT DataTable (§5)
// ---------------------------------------------------------------------------
// Same exemption as the report card, different reason: this is a MATRIX, not
// a list of records. Every cell is a form control, the columns are the
// class's own assessments, and sorting would scramble a document read
// alongside paper. It still owns loading, error and empty inside its own
// frame, which is the part of §5 that is about the page.
//
// ---------------------------------------------------------------------------
// THE STICKY LEARNER COLUMN (decided here; precedent for DV1b)
// ---------------------------------------------------------------------------
// `sticky left-0` on the first cell of every row, INSIDE the horizontal
// scroller. §5a-i closed the sticky HEADER on a real conflict — it needs the
// page as its scrollport while containing a too-wide table needs the wrapper
// to be one. A sticky COLUMN resolves `left` against that same horizontal
// scroller, which §5a-i kept, so the conflict does not arise.
//
// The cost that section names is paid here: EVERY sticky cell paints its own
// opaque background and repeats the hover and locked variants, or the
// scrolled columns show through it.
//
// No `renderCard` fallback. One card per learner holding nine score boxes is
// a form, not a card, and §5a-iii's one-interactive-element rule makes it
// unrepresentable anyway.

const TERMS = [1, 2, 3];
const EXAM_FIELDS = ['st1', 'st2', 'te'];
const NO_SLOTS = [];

// Every teacher's own assignment rows — subject AND class in one request.
//
// GET /assignments with no teacher_id returns the caller's rows, which is
// exactly the encode scope. Building both dropdowns FROM it means an
// unassigned subject can never appear: the "(not yours)" option the old page
// had to render, and the red error it caused on load, are structurally
// impossible rather than filtered out.
//
// It also covers all three ways the school assigns teaching, with no special
// case: a departmentalized Key Stage 2 teacher holding two subjects across
// several sections, a teacher who takes every subject in one section, and a
// teacher with both. The rows say who teaches what where; the dropdowns just
// group them.
function useAssignments() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAll('/assignments', { unwrap: 'assignments' })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // SUBJECTS A-Z, and that is a stated limitation rather than a choice:
  // `subjects` has no display_order column, so the school's printed order
  // cannot be honoured here. The only printed order this repo holds is a
  // client constant on the parent report card, covering Grades 1 and 4-6
  // with Grade 1 marked provisional — importing it would give that document
  // two masters. Revisit when subjects.display_order lands (pre-Stage-5).
  const subjects = useMemo(() => {
    if (!rows) return [];
    const byId = new Map();
    for (const row of rows) {
      if (!byId.has(row.subject_id)) byId.set(row.subject_id, { id: row.subject_id, name: row.subject_name });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // The sections where this teacher teaches THAT subject — grade ascending,
  // then section A-Z.
  const classesFor = useCallback(
    (subjectId) => {
      if (!rows || subjectId == null) return [];
      return rows
        .filter((row) => Number(row.subject_id) === Number(subjectId))
        .map((row) => ({ id: row.id, grade_level: row.grade_level, section: row.section }))
        .sort((a, b) => a.grade_level - b.grade_level || String(a.section).localeCompare(String(b.section)));
    },
    [rows]
  );

  return { rows, subjects, classesFor, error, loading: rows === null && !error };
}

export default function ClassRecordPage() {
  usePageTitle('Grades');

  const [params, setParams] = useSearchParams();
  const { rows: assignments, subjects, classesFor, error: assignmentsError, loading: assignmentsLoading } =
    useAssignments();

  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings', { unwrap: 'settings' })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(extractError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // SUBJECT, then CLASS, then TERM — the order a teacher thinks in. Each
  // falls back to the first of what is available rather than to nothing, so
  // the page opens on a real class instead of an empty prompt.
  const subjectParam = params.get('subject');
  const subjectId = useMemo(() => {
    if (!subjects.length) return null;
    const asked = subjects.find((s) => String(s.id) === String(subjectParam));
    return (asked || subjects[0]).id;
  }, [subjects, subjectParam]);

  const classes = useMemo(() => classesFor(subjectId), [classesFor, subjectId]);
  const assignmentParam = params.get('assignment');
  const selectedClass = useMemo(() => {
    if (!classes.length) return null;
    const asked = classes.find((c) => String(c.id) === String(assignmentParam));
    // Auto-selected when there is exactly one — and the fallback to the
    // first also covers the case where the URL still names a class from the
    // previously chosen subject.
    return asked || classes[0];
  }, [classes, assignmentParam]);

  const termParam = Number(params.get('term'));
  const term = TERMS.includes(termParam) ? termParam : Number(settings?.current_term) || 1;

  const classKey = useMemo(() => {
    if (!selectedClass || !settings?.academic_year || subjectId == null) return null;
    return {
      subject_id: subjectId,
      grade_level: selectedClass.grade_level,
      section: selectedClass.section,
      term,
      school_year: settings.academic_year,
    };
  }, [selectedClass, subjectId, term, settings]);

  const record = useClassRecord(classKey);
  const {
    server,
    draft,
    setDraft,
    slotDraft,
    setSlotDraft,
    examMaxDraft,
    setExamMaxDraft,
    preview,
    previewing,
    previewError,
  } = record;

  const [status, setStatus] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    // Changing the subject invalidates the class: its sections are a
    // different set. Dropping it lets selectedClass fall back to the first
    // section of the new subject rather than showing a stale one.
    if (name === 'subject') next.delete('assignment');
    setParams(next);
  }

  // ---- the unsaved-changes guard ----
  // ONLY while dirty. CLAUDE.md is explicit that Teacher → Grades had no
  // guard BECAUSE every score was its own request, and that a blanket
  // beforeunload is the thing not to build — one that fires when nothing is
  // dirty is one people learn to dismiss. This page is a bulk submit of up
  // to several hundred values, which is the case that was said to warrant it.
  useEffect(() => {
    if (!record.dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [record.dirty]);

  // THE FIXED FRAME: WW 1-5 and PT 1-3, always, with the server's rows
  // merged on. A position with no row is a phantom — greyed, disabled,
  // "Set HPS" — and its row is created only when a maximum is first set.
  const frame = useMemo(() => buildSlotFrame(server?.slots || NO_SLOTS), [server]);
  const wwSlots = useMemo(() => frame.filter((s) => s.type === 'WW'), [frame]);
  const ptSlots = useMemo(() => frame.filter((s) => s.type === 'PT'), [frame]);
  const descriptive = server?.grading_mode === 'descriptive';

  const scoredCounts = useMemo(() => {
    const counts = {};
    for (const learner of server?.learners || []) {
      for (const slotId of Object.keys(learner.scores)) {
        counts[slotId] = (counts[slotId] || 0) + 1;
      }
    }
    return counts;
  }, [server]);

  const grid = useMemo(() => {
    const cols = [
      ...wwSlots.map((s) => slotKey(s.type, s.slot_no)),
      ...ptSlots.map((s) => slotKey(s.type, s.slot_no)),
      ...EXAM_FIELDS.map((f) => `${f}_score`),
    ];
    return { rows: (server?.learners || []).map((l) => l.student_id), cols };
  }, [server, wwSlots, ptSlots]);

  // A cell is addressed by the slot's TYPE AND NUMBER, not its id, so a
  // phantom column is typeable the moment its maximum is set — before the
  // page has re-read and learned the new row's id.
  const cellFieldFor = (slot) => slotKey(slot.type, slot.slot_no);

  const valueFor = useCallback(
    (learner, field, slot) => {
      const k = `${learner.student_id}:${field}`;
      if (draft[k] !== undefined) return draft[k];
      if (field.endsWith('_score')) {
        const stored = learner[`ex_${field.replace('_score', '')}`];
        return stored === null || stored === undefined ? '' : String(stored);
      }
      const stored = slot?.id ? learner.scores[slot.id] : undefined;
      return stored === undefined ? '' : String(stored);
    },
    [draft]
  );

  const setCell = useCallback(
    (learnerId, field, value) => setDraft((d) => ({ ...d, [`${learnerId}:${field}`]: value })),
    [setDraft]
  );

  const slotMax = useCallback(
    (slot) => {
      const d = slotDraft[slotKey(slot.type, slot.slot_no)];
      if (d?.max_score !== undefined) return d.max_score === '' ? null : Number(d.max_score);
      return slot.max_score;
    },
    [slotDraft]
  );

  const examMaxValue = (part) =>
    examMaxDraft[part] !== undefined
      ? examMaxDraft[part]
      : server?.exam_max?.[part] === null || server?.exam_max?.[part] === undefined
        ? ''
        : String(server.exam_max[part]);

  // ---- everything the Save confirmation must name, gathered once ----
  const pending = useMemo(() => {
    if (!server) return { hpsChanges: [], aboveMax: [], invalid: [] };

    const hpsChanges = [];
    for (const slot of frame) {
      const next = slotMax(slot);
      if (next !== slot.max_score && slot.max_score !== null && next !== null) {
        hpsChanges.push({
          slot,
          from: slot.max_score,
          to: next,
          count: slot.id ? scoredCounts[slot.id] || 0 : 0,
        });
      }
    }

    const aboveMax = [];
    const invalid = [];
    for (const learner of server.learners) {
      for (const slot of frame) {
        const raw = valueFor(learner, cellFieldFor(slot), slot);
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
  }, [server, frame, slotMax, scoredCounts, valueFor]);

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
    // ONE confirmation listing everything that needs acknowledging in a
    // single read (§5e names the decision back). A save with nothing to
    // acknowledge gets no dialog — the endpoint absorbs a repeat.
    if (pending.hpsChanges.length > 0 || pending.aboveMax.length > 0) setConfirmOpen(true);
    else doSave();
  }

  const canEncode = Boolean(server?.can_encode);
  const weights = server?.weights;

  // GROUP HEADERS carry the weight, and it comes from the payload — NEVER a
  // hardcoded 20/50/30. MAPEH and EPP are 20/60/20 and Grade 1 is 30/50/20,
  // so a constant here would be wrong for a third of the curriculum.
  const groupLabel = (name, weight) => `${name} · ${weight}%`;

  const th = 'bg-surface-subtle px-2 py-2 text-xs font-semibold uppercase tracking-wider text-fg-body';
  const totalTh = `${th} whitespace-nowrap text-right`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">Grades</h1>
        <p className="text-sm text-fg-muted">
          Record every learner&rsquo;s scores for one subject and term, then save the whole class at once.
        </p>
      </div>

      {assignmentsError ? <ErrorAlert message={assignmentsError} /> : null}
      {settingsError ? <ErrorAlert message={settingsError} /> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-3">
        <FormField
          label="Subject"
          as="select"
          className={filterSelectClass}
          value={subjectId ?? ''}
          disabled={assignmentsLoading || !subjects.length}
          onChange={(e) => setParam('subject', e.target.value)}
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </FormField>

        <FormField
          label="Class"
          as="select"
          className={filterSelectClass}
          value={selectedClass ? String(selectedClass.id) : ''}
          disabled={assignmentsLoading || classes.length <= 1}
          onChange={(e) => setParam('assignment', e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              Grade {c.grade_level} - {c.section}
            </option>
          ))}
        </FormField>

        <FormField
          label="Term"
          as="select"
          className={filterSelectClass}
          value={String(term)}
          onChange={(e) => setParam('term', e.target.value)}
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>
              Term {t}
            </option>
          ))}
        </FormField>
      </div>

      {assignmentsLoading || (record.loading && !server) ? (
        <LoadingSpinner className="py-16" label="Loading the class record…" />
      ) : assignments && assignments.length === 0 ? (
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
              values stay, marked stale — a dry run failing usually means the
              real save will too, and Save surfaces that properly. */}
          {previewError ? (
            <div className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-fg">
              Live totals are out of date — {previewError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-edge">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {server.subject.name}, Grade {server.grade_level} - {server.section}, term {server.term}: every
                learner&rsquo;s scores for each assessment, with the totals the server computed.
              </caption>
              <thead>
                <tr className="border-b border-edge">
                  <th scope="col" className={`sticky left-0 z-10 ${th} text-left`} rowSpan={2}>
                    Learner
                  </th>
                  <th scope="colgroup" colSpan={wwSlots.length + 3} className={`${th} border-l border-edge text-center`}>
                    {groupLabel('Written / Oral Works', weights?.ww ?? '—')}
                  </th>
                  <th scope="colgroup" colSpan={ptSlots.length + 3} className={`${th} border-l border-edge text-center`}>
                    {groupLabel('Performance Tasks', weights?.pt ?? '—')}
                  </th>
                  <th
                    scope="colgroup"
                    colSpan={EXAM_FIELDS.length + 3}
                    className={`${th} border-l border-edge text-center`}
                  >
                    {groupLabel(
                      descriptive ? 'Summative' : 'Summative Tests & Term Exam',
                      weights?.ex ?? '—'
                    )}
                  </th>
                  <th scope="colgroup" colSpan={2} className={`${th} border-l border-edge text-center`}>
                    Grade
                  </th>
                </tr>

                <tr className="border-b border-edge">
                  {wwSlots.map((slot, i) => (
                    <th
                      key={slotKey(slot.type, slot.slot_no)}
                      scope="col"
                      className={`bg-surface-subtle px-1 py-2 align-top ${i === 0 ? 'border-l border-edge' : ''}`}
                    >
                      <SlotHeader
                        slot={slot}
                        draft={slotDraft[slotKey(slot.type, slot.slot_no)]}
                        canEncode={canEncode}
                        scoredCount={slot.id ? scoredCounts[slot.id] || 0 : 0}
                        onDraft={(d) => setSlotDraft((s) => ({ ...s, [slotKey(slot.type, slot.slot_no)]: d }))}
                      />
                    </th>
                  ))}
                  <th scope="col" className={totalTh}>Total</th>
                  <th scope="col" className={totalTh}>PS</th>
                  <th scope="col" className={totalTh}>WS</th>

                  {ptSlots.map((slot, i) => (
                    <th
                      key={slotKey(slot.type, slot.slot_no)}
                      scope="col"
                      className={`bg-surface-subtle px-1 py-2 align-top ${i === 0 ? 'border-l border-edge' : ''}`}
                    >
                      <SlotHeader
                        slot={slot}
                        draft={slotDraft[slotKey(slot.type, slot.slot_no)]}
                        canEncode={canEncode}
                        scoredCount={slot.id ? scoredCounts[slot.id] || 0 : 0}
                        onDraft={(d) => setSlotDraft((s) => ({ ...s, [slotKey(slot.type, slot.slot_no)]: d }))}
                      />
                    </th>
                  ))}
                  <th scope="col" className={totalTh}>Total</th>
                  <th scope="col" className={totalTh}>PS</th>
                  <th scope="col" className={totalTh}>WS</th>

                  {/* THE SUMMATIVE MAXIMA SIT IN THIS HEADER ROW, like a
                      slot's, because a Summative is one paper sat by the
                      whole class. They are stored per learner (three columns
                      on `grades`), so the save fans this one value out to
                      every active learner — including one with no score and
                      no grade row yet, who would otherwise be refused their
                      first mark for having no maximum. */}
                  {EXAM_FIELDS.map((f, i) => (
                    <th
                      key={f}
                      scope="col"
                      className={`bg-surface-subtle px-1 py-2 align-top ${i === 0 ? 'border-l border-edge' : ''}`}
                    >
                      <div className="flex w-[4.5rem] flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-fg-body">{f.toUpperCase()}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${f.toUpperCase()} highest possible score for the class`}
                          title={`${f.toUpperCase()} highest possible score — applies to every learner`}
                          className="w-14 rounded-md border border-edge-strong bg-surface px-1 py-0.5 text-center text-xs tabular-nums text-fg-muted disabled:bg-surface-subtle"
                          value={examMaxValue(f)}
                          disabled={!canEncode}
                          onChange={(e) => setExamMaxDraft((d) => ({ ...d, [f]: e.target.value }))}
                        />
                        {server.exam_max_mixed?.[f] ? (
                          <span className="text-[0.6rem] leading-tight text-warning-fg" title="Learners in this class do not all have the same maximum for this part.">
                            mixed
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th scope="col" className={totalTh}>Total</th>
                  <th scope="col" className={totalTh}>PS</th>
                  <th scope="col" className={totalTh}>WS</th>

                  <th scope="col" className={`${totalTh} border-l border-edge`}>Initial</th>
                  <th scope="col" className={totalTh}>{descriptive ? 'Letter' : 'Term'}</th>
                </tr>
              </thead>

              <tbody>
                {server.learners.map((learner) => {
                  const live = preview?.get(learner.student_id);
                  // The preview wins while fresh, the stored read is the
                  // fallback. Both are the server's answers — this is a
                  // choice between two of them, never a computation.
                  const computed = live || learner;
                  const stale = previewing || Boolean(previewError);
                  const rowDisabled = !canEncode || learner.is_locked;

                  const scoreCell = (slot, first) => {
                    const field = cellFieldFor(slot);
                    const max = slotMax(slot);
                    const raw = valueFor(learner, field, slot);
                    const parsed = parseCell(raw);
                    return (
                      <td key={field} className={`px-1 py-1.5 text-center ${first ? 'border-l border-edge' : ''}`}>
                        <Cell
                          studentId={learner.student_id}
                          field={field}
                          value={raw}
                          grid={grid}
                          disabled={rowDisabled || max === null}
                          dirty={draft[`${learner.student_id}:${field}`] !== undefined}
                          aboveMax={parsed.value !== null && max !== null && parsed.value > max}
                          hint={`${learner.name} — ${slot.display_label}${max === null ? ' (not in use)' : ` (out of ${max})`}`}
                          onChange={(v) => setCell(learner.student_id, field, v)}
                        />
                      </td>
                    );
                  };

                  const totals = (group) => (
                    <Fragment key={`${group}-totals`}>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg-body">
                        {computed[`${group}_total`] === null || computed[`${group}_total`] === undefined ? (
                          <GradeValue value={null} mode="numerical" />
                        ) : (
                          `${computed[`${group}_total`]}/${computed[`${group}_total_max`]}`
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        <GradeValue value={computed[`${group}_percentage`]} mode="numerical" />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        <GradeValue value={computed[`${group}_weighted`]} mode="numerical" />
                      </td>
                    </Fragment>
                  );

                  return (
                    <tr key={learner.student_id} className="group border-b border-edge-soft hover:bg-surface-subtle">
                      {/* THE STICKY CELL PAINTS ITS OWN BACKGROUND, hover and
                          locked variants included. Inheriting them from the
                          row would leave it transparent and the scrolled
                          columns would show through. */}
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
                            {learner.legacy_components} score{learner.legacy_components === 1 ? '' : 's'} recorded
                            before this grid — counted, not shown
                          </span>
                        ) : null}
                      </th>

                      {wwSlots.map((slot, i) => scoreCell(slot, i === 0))}
                      {totals('ww')}
                      {ptSlots.map((slot, i) => scoreCell(slot, i === 0))}
                      {totals('pt')}

                      {EXAM_FIELDS.map((f, i) => (
                        <td key={f} className={`px-1 py-1.5 text-center ${i === 0 ? 'border-l border-edge' : ''}`}>
                          <Cell
                            studentId={learner.student_id}
                            field={`${f}_score`}
                            value={valueFor(learner, `${f}_score`)}
                            grid={grid}
                            disabled={rowDisabled}
                            dirty={draft[`${learner.student_id}:${f}_score`] !== undefined}
                            hint={`${learner.name} — ${f.toUpperCase()}`}
                            onChange={(v) => setCell(learner.student_id, `${f}_score`, v)}
                          />
                        </td>
                      ))}
                      {totals('ex')}

                      <td
                        className={`whitespace-nowrap border-l border-edge px-2 py-1.5 text-right tabular-nums ${stale ? 'opacity-60' : ''}`}
                      >
                        {/* A TEACHER MAY SEE THE INITIAL GRADE — they encoded
                            the scores behind it. A parent never does. */}
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
                  <li key={slotKey(c.slot.type, c.slot.slot_no)}>
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
