import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../api/client';
import extractError from '../../../api/extractError';
import { buildClassRecordPayload } from './buildPayload';

// THE CLASS RECORD'S DATA LAYER ON THE PHONE — the web's
// classRecord/useClassRecord.js over the phone's api module (not a mirror:
// its imports differ). The same three pieces of state that must not be
// merged (§5b): `server` (the last successful GET, written only by load),
// the drafts (what the teacher typed), and `preview` (what the SERVER says
// the drafts would compute to, from a dry run). Every number on screen came
// from the server — the phone does no grade arithmetic.
//
// ONE SLOT AT A TIME is the SCREEN's rule, not this hook's: the slot screen
// only ever writes drafts for its own column, so the payload the verbatim
// `buildClassRecordPayload` builds carries that one slot, its scores and —
// for a Summative part — the class-wide maxima. The request shape is the
// web's by construction; `proof:one-slot` drives it with one-slot drafts.
//
// THE DRY RUN IS THE PREVIEW (the working agreement's line): typing an HPS or
// a score sends `PUT /grades/class-record` with `dry_run: true` after a
// 400 ms pause — nothing is written, nobody is notified. SAVE WRITES: the
// server creates the slot, a component per typed score and a `grades` row
// for each learner scored; a row for EVERY active learner only when the
// save carries Summative maxima (measured 2026-09-28, M13).
//
// The unwrap list is the contract (§1): a key the screen reads and this list
// forgets is silently undefined.
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

const DEBOUNCE_MS = 400;

export default function useSlotRecord(classKey) {
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState({});
  const [slotDraft, setSlotDraft] = useState({});
  const [examMaxDraft, setExamMaxDraft] = useState({});

  const [preview, setPreview] = useState(null);
  const [previewGroupHps, setPreviewGroupHps] = useState(null);
  const [previewSlots, setPreviewSlots] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [saving, setSaving] = useState(false);

  // A monotonic ticket: a slow dry-run reply never overwrites a newer one.
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
        params: { subject_id: key.subject_id, grade_level: key.grade_level, section: key.section, term: key.term, school_year: key.school_year },
      });
      setServer(data);
      // A fresh read is a new truth: drafts and preview describe the old one.
      setDraft({});
      setSlotDraft({});
      setExamMaxDraft({});
      setPreview(null);
      setPreviewGroupHps(null);
      setPreviewSlots(null);
      setPreviewError(null);
    } catch (err) {
      setError(extractError(err));
      setServer(null);
    } finally {
      setLoading(false);
    }
  }, [key, keyReady]);

  useEffect(() => {
    load();
  }, [load]);

  const buildPayload = useCallback(() => buildClassRecordPayload({ server, draft, slotDraft, examMaxDraft, key }), [server, draft, slotDraft, examMaxDraft, key]);

  const runPreview = useCallback(async (payload) => {
    const ticket = previewTicket.current + 1;
    previewTicket.current = ticket;
    setPreviewing(true);
    try {
      const data = await api.put('/grades/class-record', { ...payload, dry_run: true }, { unwrap: ['results', 'group_hps', 'slots'] });
      if (previewTicket.current !== ticket) return;
      setPreview(new Map(data.results.map((row) => [row.student_id, row])));
      setPreviewGroupHps(data.group_hps);
      setPreviewSlots(data.slots);
      setPreviewError(null);
    } catch (err) {
      if (previewTicket.current !== ticket) return;
      // The last good preview stays on screen, marked stale by the screen.
      setPreviewError(extractError(err));
    } finally {
      if (previewTicket.current === ticket) setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    if (!server || !server.can_encode) return undefined;
    const payload = buildPayload();
    if (!payload) {
      setPreview(null);
      setPreviewGroupHps(null);
      setPreviewSlots(null);
      setPreviewError(null);
      return undefined;
    }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runPreview(payload), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [server, buildPayload, runPreview]);

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
    previewGroupHps,
    previewSlots,
    previewing,
    previewError,
    dirty,
    saving,
    save,
  };
}
