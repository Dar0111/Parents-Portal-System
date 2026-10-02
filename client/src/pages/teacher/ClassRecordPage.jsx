import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { filterSelectClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import ScrollCue from '../../components/ScrollCue';
import { listLabels } from '../../components/scrollCueState';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import { todayLocalDateString } from '../../format/date';
import GradeValue from '../../format/grade';
import { currentTerm } from '../../format/schoolCalendar';
import TermValue from '../../format/TermValue';
import { usePageTitle } from '../../layout/usePageTitle';
import useClassRecord, { buildSlotFrame, slotKey, parseCell } from './classRecord/useClassRecord';
import { INITIAL_GUARD, transition as guardTransition } from './classRecord/backGuard';
import { setLeaveGuard } from '../../layout/leaveGuard';
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

  // SUBJECTS IN THE SCHOOL'S PRINTED ORDER (CR3a, 2026-09-22) — the A-Z sort
  // that used to be here is gone, and it was always a stated limitation
  // rather than a choice. `GET /assignments` now defaults to
  // `ta.grade_level, ta.section, s.display_order IS NULL, s.display_order,
  // s.name`, so the rows arrive ordered and a Map preserves first-insertion
  // order. Do not re-sort: that would put this dropdown back in disagreement
  // with the report card and the adviser summary, which is exactly what
  // moving the order into the database fixed.
  const subjects = useMemo(() => {
    if (!rows) return [];
    const byId = new Map();
    for (const row of rows) {
      if (!byId.has(row.subject_id)) byId.set(row.subject_id, { id: row.subject_id, name: row.subject_name });
    }
    return [...byId.values()];
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

  // THE TERM IS PINNED FOR THE LIFE OF THE PAGE (pre-Stage-5 #7, 2026-09-26).
  // The default comes from the school calendar, not a setting — and it is
  // derived ONCE, in a lazy initialiser, then written into the URL with
  // `replace` (no history entry) before the Back sentinel could arm. Derived
  // on every render, a grid open across midnight on 15 September would re-key
  // itself to Term 2 and reload with the drafts orphaned; pinned in the URL,
  // a save at 00:01 still writes Term 1 rows because the term is in the
  // payload, not re-read. The sentinel pushes `location.href`, which by then
  // carries `?term=`, so a Stay after a Back lands on the same term.
  const [pinnedTerm] = useState(() => currentTerm(todayLocalDateString()));
  const termParam = Number(params.get('term'));
  const term = TERMS.includes(termParam) ? termParam : pinnedTerm;

  useEffect(() => {
    if (TERMS.includes(Number(params.get('term')))) return;
    const next = new URLSearchParams(params);
    next.set('term', String(pinnedTerm));
    setParams(next, { replace: true });
  }, [params, setParams, pinnedTerm]);

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
    previewGroupHps,
    previewSlots,
    previewing,
    previewError,
  } = record;

  const [status, setStatus] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // A SUBJECT, CLASS OR TERM CHANGE RELOADS THE RECORD, and the reload clears
  // every draft (useClassRecord: "a fresh read is a new truth"). With unsaved
  // scores that was a silent discard (fix/leave-guard, 2026-10-01), so while
  // dirty it waits on the same leave modal as a link. The select is controlled
  // by the URL, so until "Leave and discard" it simply keeps showing the old
  // value.
  function setParam(name, value) {
    const apply = () => {
      const next = new URLSearchParams(params);
      next.set(name, value);
      // Changing the subject invalidates the class: its sections are a
      // different set. Dropping it lets selectedClass fall back to the first
      // section of the new subject rather than showing a stale one.
      if (name === 'subject') next.delete('assignment');
      setParams(next);
    };
    if (record.dirty) {
      setPendingHref(() => apply);
      return;
    }
    apply();
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

  // IN-APP NAVIGATION NEEDS ITS OWN BLOCK — `beforeunload` covers a reload
  // and a closed tab, and nothing else. Clicking Dashboard in the sidebar is
  // a router transition the browser never sees, so with only the listener
  // above a teacher lost a class's worth of typing with no warning at all
  // (browser check, 2026-09-22).
  //
  // NOT `useBlocker`, and this is worth recording: react-router 7 has it,
  // but it throws "useBlocker must be used within a data router" — this app
  // mounts <BrowserRouter> with JSX routes, not createBrowserRouter. The
  // first version of this fix used it and the SSR proof caught the throw;
  // in a browser the whole page would have been blank on mount. Converting
  // the app to a data router to gain a guard on one screen is a routing
  // rewrite, not a fix.
  //
  // So: intercept the CLICK, in the capture phase, before the router sees
  // it. Only a same-origin link to a different path, only while dirty, and
  // only a plain left click — a modified click is the user deliberately
  // opening a new tab, which loses nothing.
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState(null);

  useEffect(() => {
    if (!record.dirty) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank') return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      event.preventDefault();
      setPendingHref(url.pathname + url.search);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [record.dirty]);

  // THE BACK BUTTON IS A THIRD PATH (pre-Stage-5 #5b, 2026-09-26): a history
  // pop is not a click and not an unload, so the two guards above never saw
  // it. classRecord/backGuard.js is the decision — a pure machine a proof
  // drives — and this is the only place its actions touch the browser:
  // 'push' arms a sentinel entry on the page's own URL, 'back' consumes one,
  // 'ask' opens the same leave modal with pendingHref = 'BACK'. The ref holds
  // the machine's state because popstate handlers must see the latest value
  // without re-subscribing. Two effects: one keyed on `dirty` (which can only
  // yield push / back / none — no state is set here, so it is not a setState-
  // in-effect), one popstate listener for the lifetime of the page.
  const guardRef = useRef(INITIAL_GUARD);
  const applyGuardHistory = (action) => {
    if (action === 'push') window.history.pushState({ ppSentinel: true }, '', window.location.href);
    else if (action === 'back') window.history.back();
  };

  useEffect(() => {
    const next = guardTransition(guardRef.current, record.dirty ? 'dirty' : 'clean');
    guardRef.current = next.state;
    applyGuardHistory(next.action);
  }, [record.dirty]);

  useEffect(() => {
    const onPop = () => {
      const next = guardTransition(guardRef.current, 'pop');
      guardRef.current = next.state;
      if (next.action === 'ask') setPendingHref('BACK');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // THE EXITS THAT ARE BUTTONS (fix/leave-guard, 2026-10-01): Log out and a
  // notification row call requestLeave() in layout/leaveGuard.js, which opens
  // THIS modal while the record is dirty. pendingHref then holds the exit as a
  // function (set through the updater form, or React would call it), exactly
  // as a select change does above.
  useEffect(() => {
    if (!record.dirty) return undefined;
    return setLeaveGuard((proceed) => setPendingHref(() => proceed));
  }, [record.dirty]);

  // The leave modal's two answers, for every path (a link, the Back button, a
  // select change, or a button exit). Stay after a Back re-arms the sentinel;
  // Leave after a Back goes back once more, to the real previous entry. A link
  // leaves as before; a function is the exit itself and runs.
  function dismissLeave() {
    if (pendingHref === 'BACK') {
      const next = guardTransition(guardRef.current, 'stay');
      guardRef.current = next.state;
      applyGuardHistory(next.action);
    }
    setPendingHref(null);
  }
  function confirmLeave() {
    const href = pendingHref;
    setPendingHref(null);
    if (href === 'BACK') {
      const next = guardTransition(guardRef.current, 'leave');
      guardRef.current = next.state;
      applyGuardHistory(next.action);
    } else if (typeof href === 'function') {
      href();
    } else if (href) {
      navigate(href);
    }
  }

  // THE FIXED FRAME: WW 1-5 and PT 1-3, always, with the server's rows
  // merged on. A position with no row is a phantom — greyed, disabled,
  // "Set HPS" — and its row is created only when a maximum is first set.
  // THE PREVIEW'S SLOTS WIN WHILE THERE IS ONE, exactly as the preview's
  // learner values do. The header's Highest-possible line reads from the
  // same answer as the rows beneath it, so the two can never disagree —
  // which they did: opening a column left the header at 30 while the
  // learners were already computed against 40.
  const frame = useMemo(
    () => buildSlotFrame(previewSlots || server?.slots || NO_SLOTS),
    [previewSlots, server]
  );
  const groupHps = previewGroupHps || server?.group_hps;
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

  // RELOAD (feat/ui-refresh) IS `record.reload` — useClassRecord's own load(),
  // the same GET for the subject, class and term in the URL. A fresh read
  // clears every draft ("a fresh read is a new truth"), so WHILE ANYTHING IS
  // UNSAVED THE BUTTON IS DISABLED and its hint says why — it must never be a
  // silent discard, and the leave dialog's sentence does not describe a reload
  // (§5i). Also disabled while a save is in flight (the save re-reads itself)
  // and while a dry run is — a preview that lands after a fresh read would
  // describe the old one. Not offered at all until there is a class to read.
  //
  // It clears the save result first: "Class record saved." describes the
  // action before this one, and beside a fresh read it would be taken for the
  // reload's own outcome (§7c).
  //
  // WHILE THE RELOAD IS IN FLIGHT THE GRID IS NOT ON SCREEN — the loading card
  // is, exactly as on the first read. The button being disabled while dirty
  // covers what was typed BEFORE the click; this covers what would be typed
  // AFTER it: load() clears every draft when its reply lands, so a score
  // typed into a grid left live during the request would vanish with nothing
  // said. `reloading` is set and cleared by this handler alone (never in an
  // effect), so a save's own re-read and a subject / class / term change
  // behave exactly as they did.
  const [reloading, setReloading] = useState(false);
  const reloadBlocked = record.dirty || record.saving || previewing;
  async function reloadRecord() {
    setStatus({});
    setReloading(true);
    try {
      // load() keeps its own failure in `record.error` and never rejects.
      await record.reload();
    } finally {
      setReloading(false);
    }
  }

  // NO ENTRANCE AND NO TWEEN ON THIS PAGE (feat/ui-refresh, motion/motion.js):
  // the root is a plain <div>, never <Reveal>. The grid is typed into cell
  // after cell, its stale cells dim and return on every debounced keystroke,
  // and both dialogs render inline — nothing here may move, and no ancestor
  // may carry a transform.
  return (
    <div className="space-y-6">
      {assignmentsError ? <ErrorAlert message={assignmentsError} /> : null}
      {settingsError ? <ErrorAlert message={settingsError} /> : null}

      {/* THE HEADER GROUP: the section's title with Reload, and the card that
          chooses WHICH record. The record itself is the group below. */}
      <div className="space-y-3">
        {/* NO <h1> HERE. `Shell`'s header already renders this page's <h1>
            from `nav.js`, so this one made "Grades" the word twice, stacked,
            and gave the document TWO top-level headings — a screen reader
            announces two page titles. Found by the smoke sweep, which fails
            on an <h1> count other than one. The subtitle stays, as the
            section's description: it says something the nav label cannot. */}
        <SectionHeader
          title="Class record"
          description="Record every learner’s scores for one subject and term, then save the whole class at once."
          onReload={classKey ? reloadRecord : null}
          reloading={record.loading || reloading}
          reloadDisabled={reloadBlocked}
          reloadHint={record.dirty ? 'Save or discard your changes before reloading.' : ''}
          reloadLabel="Reload class record"
        />

        {/* Subject, then class, then term. One card, the three selects at the
            shared filter width. */}
        <div className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
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
      </div>

      {assignmentsLoading || (record.loading && !server) || reloading ? (
        <div className={cardClass}>
          <LoadingSpinner className="py-16" label="Loading the class record…" />
        </div>
      ) : assignments && assignments.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon="fa-chalkboard-user"
            title="No classes assigned to you"
            message="A class record needs a subject you are assigned to teach. Ask an admin to add the assignment."
          />
        </div>
      ) : record.error ? (
        <ErrorAlert message={record.error} onRetry={record.reload} />
      ) : !server ? null : (
        // THE RECORD GROUP — notices, the grid, the save bar and its result,
        // 12px apart. A <div> where a fragment used to be, so the children
        // keep their place in the file and gain a rhythm of their own.
        <div className="space-y-3">
          {!canEncode ? (
            <p className="flex items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3 text-sm text-fg-body">
              <i aria-hidden="true" className="fa-solid fa-eye mt-0.5 text-fg-faint" />
              <span className="min-w-0 flex-1">
                You can see this class record but not change it — you are not the assigned teacher for{' '}
                {server.subject.name} in Grade {server.grade_level} - {server.section}.
              </span>
            </p>
          ) : null}

          {/* A FAILED PREVIEW NEVER BLOCKS TYPING OR SAVING. The last good
              values stay, marked stale — a dry run failing usually means the
              real save will too, and Save surfaces that properly. Amber, not
              red: nothing has failed that the teacher must stop for. */}
          {previewError ? (
            <div className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
              <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
              <span className="min-w-0 flex-1">Live totals are out of date — {previewError}</span>
            </div>
          ) : null}

          {/* THE SAME CUE AS THE CLASS SUMMARY, AND IT IS NEEDED MORE HERE
              (UI-D-2). This grid has more columns than the summary and the
              same silence: the pinned Learner column made the table usable
              while scrolled, and nothing ever said it scrolled. A cue built
              only for the summary would have been the narrower fix.

              It names the GROUPS rather than counting columns — see the
              `data-group` note in the header row. */}
          <ScrollCue
            ariaLabel="Class record, scrolls sideways"
            // The frame goes on the WHOLE cue, not the scroller, so the hint
            // sits inside the card exactly as it does on the class summary —
            // where the border comes from a wrapper in the page.
            //
            // `cardClass` (feat/ui-refresh): the same surface as every card
            // and table frame. NO `overflow-hidden` on it — that would clip
            // the scroller's keyboard outline, and on paper the columns the
            // print block releases. The two header cells that sit at the
            // frame's top corners round themselves instead (below).
            className={cardClass}
            measureCells={(el) =>
              Array.from(el.querySelectorAll('thead tr:first-child th[data-group]')).map((cell) => ({
                right: cell.offsetLeft + cell.offsetWidth,
                label: cell.dataset.group,
              }))
            }
            describe={({ hiddenLabels }) =>
              // "Scroll", not "Swipe" (UI-7): the web is read with a mouse
              // too; the phone app keeps "Swipe".
              hiddenLabels.length ? `Scroll for ${listLabels(hiddenLabels)} →` : null
            }
          >
            <table className="print-sheet-table w-full border-collapse text-sm">
              <caption className="sr-only">
                {server.subject.name}, Grade {server.grade_level} - {server.section}, term {server.term}: every
                learner&rsquo;s scores for each assessment, with the totals the server computed.
              </caption>
              <thead>
                <tr className="border-b border-edge">
                  {/* `rounded-tl-2xl` here and `rounded-tr-2xl` on the Grade
                      group are the FRAME's radius (`cardClass`): on a window
                      wide enough that no hint line sits above the table,
                      these two cells are the frame's top corners, and a
                      square background would paint over its curve. A radius
                      changes no measurement — the cell is the same box. */}
                  <th scope="col" className={`sticky left-0 z-10 rounded-tl-2xl ${th} text-left`} rowSpan={2}>
                    Learner
                  </th>
                  {/* `data-group` carries the BARE name for `ScrollCue`'s
                      hint (UI-D-2). The visible label is
                      `groupLabel(name, weight)` — "Performance Tasks · 50%" —
                      and a sentence reading "Scroll for Performance Tasks ·
                      50% and Grade" is not a sentence. The attribute keeps
                      the two apart without a second constant to drift.

                      NAMES, NOT A COUNT, and that is the difference from the
                      class summary. These columns are assessment slots inside
                      ONE subject, so "7 more assessments" tells a teacher
                      nothing; "Summative and Grade" tells them exactly what
                      they have not seen. */}
                  {/* LEFT-ALIGNED, NOT CENTRED (fix/polish, 2026-09-26). A
                      group spans up to eight 4.5rem columns — 576px — so a
                      centred label sat ~288px into its group, past the
                      right edge of a 390px viewport that also holds the
                      pinned Learner column: at scroll start no group name
                      was on screen at all. At the group's left edge the
                      name is visible the moment its first column is. */}
                  <th
                    scope="colgroup"
                    colSpan={wwSlots.length + 3}
                    data-group="Written / Oral Works"
                    className={`${th} border-l border-edge text-left`}
                  >
                    {groupLabel('Written / Oral Works', weights?.ww ?? '—')}
                  </th>
                  <th
                    scope="colgroup"
                    colSpan={ptSlots.length + 3}
                    data-group="Performance Tasks"
                    className={`${th} border-l border-edge text-left`}
                  >
                    {groupLabel('Performance Tasks', weights?.pt ?? '—')}
                  </th>
                  <th
                    scope="colgroup"
                    colSpan={EXAM_FIELDS.length + 3}
                    data-group={descriptive ? 'Summative' : 'Summative Tests & Term Exam'}
                    className={`${th} border-l border-edge text-left`}
                  >
                    {groupLabel(
                      descriptive ? 'Summative' : 'Summative Tests & Term Exam',
                      weights?.ex ?? '—'
                    )}
                  </th>
                  <th
                    scope="colgroup"
                    colSpan={2}
                    data-group="Grade"
                    className={`${th} rounded-tr-2xl border-l border-edge text-left`}
                  >
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
                  {/* THE GROUP CODE ON EVERY SUMMARY COLUMN (fix/smoke-gate).
                      Three groups each end in Total / PS / WS, and the group
                      name above is one cell that scrolls under the pinned
                      Learner column, so a bare "PS" stopped saying whose.
                      Measured: only "WW Total" widens (76 → 82px) and the
                      table grows 1845 → 1850px inside its own scroller. */}
                  <th scope="col" className={totalTh}>WW Total</th>
                  <th scope="col" className={totalTh}>WW PS</th>
                  <th scope="col" className={totalTh}>WW WS</th>

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
                  <th scope="col" className={totalTh}>PT Total</th>
                  <th scope="col" className={totalTh}>PT PS</th>
                  <th scope="col" className={totalTh}>PT WS</th>

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
                          autoComplete="off"
                          name={`exam-hps-${f}`}
                          // The same box as SlotHeader's maximum beside it:
                          // same width, padding and text, so the header row
                          // keeps its measured height. The outline is the
                          // shared keyboard focus.
                          className="w-14 rounded-lg border border-edge-strong bg-surface px-1 py-0.5 text-center text-xs tabular-nums text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:bg-surface-subtle"
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
                  {/* "ST", by decision (2026-09-26) — the group's own codes
                      are ST1 / ST2 / TE, and ST is the one they share. */}
                  <th scope="col" className={totalTh}>ST Total</th>
                  <th scope="col" className={totalTh}>ST PS</th>
                  <th scope="col" className={totalTh}>ST WS</th>

                  <th scope="col" className={`${totalTh} border-l border-edge`}>Initial</th>
                  <th scope="col" className={totalTh}>{descriptive ? 'Letter' : 'Term'}</th>
                </tr>
              </thead>

              <tbody>
                {/* THE HPS ROW, the line the school's E-Class Record prints
                    before any learner. Every value comes from the payload:
                    TOTAL is the sum of the USED slots' maxima, PS is 100.00
                    by definition, WS is the group's weight. Nothing here is
                    summed in this file. */}
                <tr className="border-b border-edge bg-surface-subtle text-xs text-fg-muted">
                  <th scope="row" className="sticky left-0 z-10 bg-surface-subtle px-3 py-1.5 text-left font-semibold uppercase tracking-wider">
                    Highest possible
                  </th>
                  {[
                    ['ww', wwSlots],
                    ['pt', ptSlots],
                    ['ex', EXAM_FIELDS],
                  ].map(([group, cols]) => (
                    <Fragment key={`hps-${group}`}>
                      {cols.map((_, i) => (
                        <td key={`hps-${group}-${i}`} className={i === 0 ? 'border-l border-edge' : ''} />
                      ))}
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">
                        {groupHps?.[group] ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        {groupHps?.[group] === null || groupHps?.[group] === undefined ? '—' : '100.00'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        {weights?.[group] === undefined ? '—' : `${weights[group]}`}
                      </td>
                    </Fragment>
                  ))}
                  <td className="border-l border-edge" />
                  <td />
                </tr>

                {server.learners.map((learner, rowIndex) => {
                  const lastRow = rowIndex === server.learners.length - 1;
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
                      {/* THE RAW SUM ALONE — "35", not "35/30". The
                          denominator is the HPS row above, printed once for
                          the class, exactly as the school's own record does
                          it. Repeating it on every line is what made the
                          group three columns wide for no information. */}
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg-body">
                        {computed[`${group}_total`] === null || computed[`${group}_total`] === undefined ? (
                          <GradeValue value={null} mode="numerical" />
                        ) : (
                          computed[`${group}_total`]
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
                    // `last:border-b-0`: the last learner's row ends at the
                    // frame's own bottom edge, so its hairline would be a
                    // second line directly above the frame's (the class
                    // summary's rows do the same).
                    <tr
                      key={learner.student_id}
                      className="group border-b border-edge-soft last:border-b-0 hover:bg-surface-subtle"
                    >
                      {/* THE STICKY CELL PAINTS ITS OWN BACKGROUND, hover and
                          locked variants included. Inheriting them from the
                          row would leave it transparent and the scrolled
                          columns would show through.

                          `rounded-bl-2xl` on the LAST row's is the frame's
                          radius again (see the Learner header): this opaque
                          cell is the frame's bottom-left corner, and a square
                          background would paint over its curve. No
                          measurement changes — the cell is the same box. */}
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-left font-normal text-fg ${
                          learner.is_locked ? 'bg-surface-muted' : 'bg-surface group-hover:bg-surface-subtle'
                        } ${lastRow ? 'rounded-bl-2xl' : ''}`}
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
          </ScrollCue>

          {server.learners.length === 0 ? (
            <div className={cardClass}>
              <EmptyState
                icon="fa-user-group"
                title="No active learners in this class"
                message={`Grade ${server.grade_level} - ${server.section} has no active learners, so there is nothing to record yet.`}
              />
            </div>
          ) : null}

          {/* THE SAVE BAR: one card under the grid, the page's one filled
              button first and what it is waiting on beside it. NOT pinned to
              the bottom of the window, deliberately: Enter walks down a
              column, the browser scrolls the focused cell to the window's
              edge, and a pinned bar would sit on top of the cell being typed
              into. */}
          <div className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-2 p-4`}>
            <Button
              variant="primary"
              disabled={!canEncode || record.saving || !record.dirty}
              onClick={onSaveClick}
            >
              {record.saving ? 'Saving…' : 'Save all'}
            </Button>
            {previewing ? <span className="text-xs text-fg-muted">calculating…</span> : null}
            {record.dirty && !record.saving ? (
              <span className="text-sm text-fg-body">You have unsaved changes.</span>
            ) : null}
            {pending.invalid.length > 0 ? (
              <span className="text-sm font-semibold text-danger-text">
                {pending.invalid.length} cell{pending.invalid.length === 1 ? '' : 's'} need a whole number.
              </span>
            ) : null}
          </div>

          <FormStatus status={status.save} />
        </div>
      )}

      {/* The in-app half of the unsaved-changes guard — and, since #5b, the
          Back button's too (pendingHref === 'BACK'). A real choice, held
          open while the router transition waits — a notice after the fact
          would arrive with the drafts already gone. Closing the modal any
          other way (Escape, the backdrop) counts as Stay.

          STAY IS THE FILLED BUTTON, as it always was: the safe answer is the
          prominent one and the discarding one is outlined in red beside it.
          Both sit in the dialog's footer. */}
      <Modal
        open={pendingHref !== null}
        onClose={dismissLeave}
        title="Leave without saving?"
        size="sm"
        footer={
          <>
            <Button variant="primary" onClick={dismissLeave}>
              Stay on this page
            </Button>
            <Button variant="danger-outline" onClick={confirmLeave}>
              Leave and discard
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-body">
          You have unsaved scores in this class record. Leaving or changing the subject, class or term now discards
          them — nothing has been sent to the server yet.
        </p>
      </Modal>

      {/* ONE confirmation, two possible things to acknowledge — each in its
          own panel so they read as two facts, not one paragraph. The second
          is amber: a score above its maximum is allowed, and is something to
          check, never an error (§4). */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Save the class record?"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button variant="primary" onClick={doSave}>
              Save all
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-fg-body">
          {pending.hpsChanges.length > 0 ? (
            <div className="rounded-xl border border-edge bg-surface-subtle p-4">
              <h3 className="font-semibold text-fg">Highest possible scores change</h3>
              <ul className="mt-2 space-y-1 tabular-nums text-fg-body">
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
            <div className="rounded-xl border border-warning-edge bg-warning-soft p-4">
              <h3 className="font-semibold text-warning-strong">
                {pending.aboveMax.length} score{pending.aboveMax.length === 1 ? ' is' : 's are'} above the highest
                possible score
              </h3>
              <ul className="mt-2 space-y-1 tabular-nums text-warning-strong">
                {pending.aboveMax.map((a) => (
                  <li key={`${a.learner.student_id}-${a.label}`}>
                    {a.learner.name} — {a.label}: {a.score}/{a.max}
                  </li>
                ))}
              </ul>
              {/* The school answered on 2026-09-23: it DOES award bonus
                  points, for event participation, added to Performance
                  Tasks. So the copy may now name a bonus, which it could not
                  while the question was open — the earlier wording avoided
                  it deliberately, because "bonus points are allowed" was a
                  policy statement nobody had made (§5i).

                  THE BEHAVIOUR DID NOT CHANGE and the copy still describes
                  it exactly: a score above the highest possible score is
                  saved as typed, flagged here and never blocked or clamped,
                  matching gradeComputation.js. What changed is that the
                  teacher is now told which of the two readings — a bonus or
                  a typing mistake — the school actually recognises. */}
              <p className="mt-2 text-sm text-warning-strong">
                Scores above the highest possible score are saved as typed. Check that each is a
                bonus, not a typing mistake.
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
