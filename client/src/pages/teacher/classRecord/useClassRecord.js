import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../api/axios';
import extractError from '../../../api/extractError';

// The class record's data layer: the read, the dirty state, the live dry-run
// preview, and the save. Kept out of the page so the page is layout and this
// is the part with the ordering hazards in it.
//
// ---------------------------------------------------------------------------
// THREE PIECES OF STATE, AND THEY MUST NOT BE MERGED (§5b)
// ---------------------------------------------------------------------------
//   `server`   the last successful GET. The ONLY writer is load().
//   `draft`    what the teacher has typed and not yet saved.
//   `preview`  what the SERVER says those drafts would compute to.
//
// A column showing stored state never derives from form state, and the
// computed columns here are the sharpest version of that rule: they are the
// numbers a parent will see. `preview` exists precisely so the grid can show
// live results WITHOUT the client ever doing grade arithmetic — every number
// on screen came from the server, either from the last read or from a dry
// run. There is no third path.
//
// ---------------------------------------------------------------------------
// THE UNWRAP LIST IS THE CONTRACT (§1)
// ---------------------------------------------------------------------------
// The interceptor copies ONLY the keys named here, so a key the page reads
// but this list forgets is silently `undefined` — it renders as a plausible
// empty value, not as an error. That is exactly how DV3 shipped a report card
// whose general-average row read "Pending" for a week. When the endpoint
// gains a field, THIS is the line to change.
const RECORD_UNWRAP = [
  'subject',
  'grade_level',
  'section',
  'term',
  'school_year',
  'grading_mode',
  'weights',
  'can_encode',
  'exam_max',
  'exam_max_mixed',
  'group_hps',
  'slots',
  'learners',
];

// THE GRID IS A FIXED FRAME, not a list of whatever slots exist.
// Written / Oral Works 1-5 and Performance Tasks 1-3 are always on screen,
// which is what the school's E-Class Record looks like and what makes a
// blank column an invitation to use it rather than a missing feature.
//
// A position the server has no row for is a PHANTOM: greyed, cells disabled,
// "Set HPS" in place of the maximum — identical on screen to a slot that
// exists with no maximum, because both mean the same thing. The row is
// created only when its highest possible score is first set, so eight empty
// rows per class per term are never written.
export const WW_SLOTS = 5;
export const PT_SLOTS = 3;

// Slot drafts are keyed by TYPE AND NUMBER, never by id: a phantom has no id
// yet, and keying on one would make the very first edit to an unused column
// unrepresentable.
export const slotKey = (type, slotNo) => `${type}-${slotNo}`;

// The fixed frame, with the server's rows merged onto it.
export function buildSlotFrame(serverSlots) {
  const byKey = new Map((serverSlots || []).map((s) => [slotKey(s.type, s.slot_no), s]));
  const frame = [];
  for (const [type, count] of [
    ['WW', WW_SLOTS],
    ['PT', PT_SLOTS],
  ]) {
    for (let slotNo = 1; slotNo <= count; slotNo += 1) {
      const existing = byKey.get(slotKey(type, slotNo));
      frame.push(
        existing || {
          id: null,
          type,
          slot_no: slotNo,
          name: null,
          display_label: `${type === 'WW' ? 'Written Work' : 'Performance Task'} ${slotNo}`,
          short_label: String(slotNo),
          max_score: null,
          in_use: false,
        }
      );
    }
  }
  return frame;
}

const DEBOUNCE_MS = 400;

// A cell's draft key. One learner, one slot.
export const cellKey = (studentId, slotId) => `${studentId}:${slotId}`;
// A Summative draft key. One learner, one field.
export const examKey = (studentId, field) => `${studentId}:${field}`;

// '' means "cleared" and is sent as an explicit null; anything else must be a
// whole number, which the server enforces and this mirrors so a bad keystroke
// is marked before a request is spent on it.
export function parseCell(raw) {
  if (raw === '' || raw === null || raw === undefined) return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: 'Not a number' };
  if (n < 0) return { error: 'Must be 0 or more' };
  if (!Number.isInteger(n)) return { error: 'Whole numbers only' };
  return { value: n };
}

export default function useClassRecord(classKey) {
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState({});
  const [slotDraft, setSlotDraft] = useState({});
  const [examMaxDraft, setExamMaxDraft] = useState({});

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const [saving, setSaving] = useState(false);

  // MONOTONIC REQUEST ID. AbortController cancels in flight, but a response
  // already in the buffer still resolves — so abort alone cannot guarantee a
  // slow reply never overwrites a newer one. This can: every dry run takes a
  // ticket, and a reply whose ticket is not the latest is dropped on the
  // floor. Without it, a 900ms reply to the teacher's third keystroke lands
  // after the 100ms reply to their fifth and the grid shows the wrong totals
  // with nothing on screen to say so.
  const previewTicket = useRef(0);
  const debounceTimer = useRef(null);

  const key = classKey;
  const keyReady = Boolean(key?.subject_id && key?.grade_level && key?.section && key?.term && key?.school_year);

  const load = useCallback(async () => {
    if (!keyReady) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/grades/class-record', {
        unwrap: RECORD_UNWRAP,
        params: {
          subject_id: key.subject_id,
          grade_level: key.grade_level,
          section: key.section,
          term: key.term,
          school_year: key.school_year,
        },
      });
      setServer(data);
      // A fresh read is a new truth: drafts and preview describe the old one.
      setDraft({});
      setSlotDraft({});
      setExamMaxDraft({});
      setPreview(null);
      setPreviewError(null);
    } catch (err) {
      setError(extractError(err));
      setServer(null);
    } finally {
      setLoading(false);
    }
    // `key` whole, not its five fields: the page builds it with useMemo, so
    // it is already stable, and naming the fields individually made the
    // compiler's inferred dependency disagree with the written one.
  }, [key, keyReady]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- what the teacher has changed, as the API's own request shape ----
  // Built from the drafts every time rather than accumulated, so undoing a
  // change back to its stored value genuinely un-dirties the cell.
  // NOT YET EXTRACTED AS A PURE EXPORTED FUNCTION. That is the right shape
  // and it is what would let a server-side suite drive this with plain data
  // and assert the exact request body — the gap that let defect 8 through.
  // It needs a file both sides can import, which is a declared SCOPE
  // EXPANSION; see the dispatch report. Left inline deliberately rather
  // than half-moved.
  const buildPayload = useCallback(() => {
    if (!server) return null;

    // Over the FIXED FRAME, not the server's rows, so an edit to a phantom
    // column is representable — that edit is exactly what creates it.
    const frame = buildSlotFrame(server.slots);
    const slots = [];
    for (const slot of frame) {
      const d = slotDraft[slotKey(slot.type, slot.slot_no)];
      if (!d) continue;
      const nextMax = d.max_score === undefined || d.max_score === '' ? null : Number(d.max_score);
      const nextName = d.name === undefined ? slot.name : d.name;
      const maxChanged = nextMax !== slot.max_score;
      const nameChanged = (nextName || null) !== (slot.name || null);
      if (maxChanged || nameChanged) {
        slots.push({ type: slot.type, slot_no: slot.slot_no, max_score: nextMax, name: nextName });
      }
    }

    // The class-wide Summative maxima.
    //
    // SENT WITH EVERY SAVE THAT CARRIES AN EXAM SCORE, edited or not, and
    // that is the fix for a real defect: the header showed 30/30/40 because
    // ANOTHER learner's row had those maxima, but a learner who had none
    // stored was refused with "ST1: a score needs a max, and this learner
    // has none stored yet". The value was on screen and the client simply
    // never sent it. A maximum the teacher can see is a maximum the save
    // must apply.
    //
    // Resolved from the draft if edited, otherwise from what the class
    // already agrees on — so it is the number in the header either way.
    const examMax = {};
    const resolveExamMax = (part) => {
      const raw = examMaxDraft[part];
      const value = raw === undefined ? server.exam_max?.[part] : raw === '' ? null : Number(raw);
      return value !== null && value !== undefined && Number.isInteger(value) && value > 0 ? value : null;
    };
    for (const part of ['st1', 'st2', 'te']) {
      const next = resolveExamMax(part);
      if (next === null) continue;
      if (examMaxDraft[part] !== undefined && next !== server.exam_max?.[part]) examMax[part] = next;
    }

    const byStudent = new Map();
    const entryFor = (studentId) => {
      if (!byStudent.has(studentId)) byStudent.set(studentId, { student_id: studentId, scores: [] });
      return byStudent.get(studentId);
    };

    for (const [k, raw] of Object.entries(draft)) {
      const [studentIdStr, field] = k.split(':');
      const studentId = Number(studentIdStr);
      const learner = server.learners.find((l) => l.student_id === studentId);
      if (!learner || learner.is_locked) continue;

      const parsed = parseCell(raw);
      if (parsed.error) continue; // a bad keystroke is marked, never sent

      if (field.startsWith('ex_') || field.endsWith('_score') || field.endsWith('_max')) {
        entryFor(studentId)[field] = parsed.value;
        continue;
      }

      // THE FIELD IS A SLOT KEY ("WW-2"), NOT AN ID, and this line used to
      // do Number(field) — from before phantom slots, when a cell was
      // addressed by the slot's database id. Number("WW-2") is NaN,
      // JSON.stringify turns NaN into null, and the server answered "Each
      // score needs a valid slot_id" for every new score typed into an
      // existing column. The cell addressing changed and the payload
      // builder did not follow it.
      const slot = frame.find((s) => slotKey(s.type, s.slot_no) === field);
      if (!slot) continue;

      const stored = slot.id ? learner.scores[slot.id] : undefined;
      const storedValue = stored === undefined ? null : stored;
      if (parsed.value === storedValue) continue; // typed back to stored

      // A slot created in THIS SAME SAVE has no id yet — the teacher set a
      // phantom column's highest possible score and typed a score into it
      // before pressing Save once. The server creates slots before entries
      // in the same transaction, so it can resolve the column itself: the
      // score names its type and number instead, and the id is used
      // whenever there is one.
      entryFor(studentId).scores.push(
        slot.id
          ? { slot_id: slot.id, score: parsed.value }
          : { type: slot.type, slot_no: slot.slot_no, score: parsed.value }
      );
    }

    // An entry with nothing in it is noise in the request and in the log.
    const entries = [...byStudent.values()].filter(
      (e) => e.scores.length > 0 || Object.keys(e).some((k) => k !== 'student_id' && k !== 'scores')
    );

    // ...AND unconditionally whenever any entry carries an exam score, even
    // if the header was never touched. Without this the save reaches a
    // learner with no stored maximum and is refused for a value that is
    // visibly on screen.
    const touchesExam = entries.some((e) =>
      ['st1_score', 'st2_score', 'te_score'].some((f) => e[f] !== undefined && e[f] !== null)
    );
    if (touchesExam) {
      for (const part of ['st1', 'st2', 'te']) {
        if (examMax[part] !== undefined) continue;
        const resolved = resolveExamMax(part);
        if (resolved !== null) examMax[part] = resolved;
      }
    }

    const hasExamMax = Object.keys(examMax).length > 0;
    if (!slots.length && !entries.length && !hasExamMax) return null;
    return { ...key, slots, entries, ...(hasExamMax ? { exam_max: examMax } : {}) };
  }, [server, draft, slotDraft, examMaxDraft, key]);

  // ---- the live preview ----
  const runPreview = useCallback(
    async (payload) => {
      const ticket = previewTicket.current + 1;
      previewTicket.current = ticket;
      setPreviewing(true);
      try {
        const data = await api.put('/grades/class-record', { ...payload, dry_run: true }, { unwrap: 'results' });
        if (previewTicket.current !== ticket) return; // a newer run has since started
        setPreview(new Map(data.map((row) => [row.student_id, row])));
        setPreviewError(null);
      } catch (err) {
        if (previewTicket.current !== ticket) return;
        // THE LAST GOOD PREVIEW STAYS ON SCREEN, marked stale by the page.
        // Blanking it would move the layout under someone who is typing, and
        // the values were true for the keystroke before this one.
        setPreviewError(extractError(err));
      } finally {
        if (previewTicket.current === ticket) setPreviewing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!server || !server.can_encode) return undefined;
    const payload = buildPayload();
    if (!payload) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runPreview(payload), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [server, buildPayload, runPreview]);

  // ---- the save ----
  const save = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return { ok: true, nothing: true };
    setSaving(true);
    try {
      await api.put('/grades/class-record', payload, { unwrap: 'results' });
      await load();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: extractError(err) };
    } finally {
      setSaving(false);
    }
  }, [buildPayload, load]);

  const dirty = Boolean(buildPayload());

  return {
    server,
    loading,
    error,
    reload: load,
    draft,
    setDraft,
    slotDraft,
    setSlotDraft,
    examMaxDraft,
    setExamMaxDraft,
    preview,
    previewing,
    previewError,
    dirty,
    saving,
    save,
    buildPayload,
  };
}
