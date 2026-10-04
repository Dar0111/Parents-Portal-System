import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../api/axios';
import extractError from '../../../api/extractError';
import { createTickets } from '../../../api/tickets';
import {
  WW_SLOTS,
  PT_SLOTS,
  slotKey,
  cellKey,
  examKey,
  buildSlotFrame,
  parseCell,
  buildClassRecordPayload,
} from './buildPayload';

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
// Re-exported so the page and the cell keep one import site. The definitions
// live in buildPayload.js, which has NO React and NO axios import — that is
// what lets a plain Node test load the request builder and drive it with
// grid state (defect 8: every server suite passed while the grid's own
// request shape was broken, because they all build bodies by hand).
export { WW_SLOTS, PT_SLOTS, slotKey, cellKey, examKey, buildSlotFrame, parseCell };

const DEBOUNCE_MS = 400;

export default function useClassRecord(classKey) {
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState({});
  const [slotDraft, setSlotDraft] = useState({});
  const [examMaxDraft, setExamMaxDraft] = useState({});

  const [preview, setPreview] = useState(null);
  // The header's Highest-possible line and the slot list, as the dry run
  // computes them — so the header cannot disagree with the learners below it.
  const [previewGroupHps, setPreviewGroupHps] = useState(null);
  const [previewSlots, setPreviewSlots] = useState(null);
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

  // THE LOAD TAKES A TICKET TOO (feat/look-fixes, 2026-10-05; api/tickets.js):
  // switching subject or term quickly starts a second read before the first
  // answers, and the older reply must not land last and put the wrong class
  // on screen. A reply — data, failure, or the end of loading — is applied
  // only while its ticket is the latest. The preview above keeps its own.
  const [loadTickets] = useState(createTickets);

  const load = useCallback(async () => {
    if (!keyReady) return;
    const ticket = loadTickets.take();
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
      if (!loadTickets.isLatest(ticket)) return; // a newer load has started
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
      if (!loadTickets.isLatest(ticket)) return;
      setError(extractError(err));
      setServer(null);
    } finally {
      if (loadTickets.isLatest(ticket)) setLoading(false);
    }
    // `key` whole, not its five fields: the page builds it with useMemo, so
    // it is already stable, and naming the fields individually made the
    // compiler's inferred dependency disagree with the written one.
  }, [key, keyReady, loadTickets]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- what the teacher has changed, as the API's own request shape ----
  // Built from the drafts every time rather than accumulated, so undoing a
  // change back to its stored value genuinely un-dirties the cell.
  // THE REQUEST SHAPE LIVES IN buildPayload.js, which imports neither React
  // nor axios — so test:class-record can load the very same function, feed
  // it grid state and send the result to the real API. That is the gap
  // defect 8 fell through: every server suite built its bodies by hand and
  // none of them ever produced what the grid produces.
  const buildPayload = useCallback(
    () => buildClassRecordPayload({ server, draft, slotDraft, examMaxDraft, key }),
    [server, draft, slotDraft, examMaxDraft, key]
  );

  // ---- the live preview ----
  const runPreview = useCallback(
    async (payload) => {
      const ticket = previewTicket.current + 1;
      previewTicket.current = ticket;
      setPreviewing(true);
      try {
        const data = await api.put(
          '/grades/class-record',
          { ...payload, dry_run: true },
          // group_hps and slots too, not just the learner rows: the header's
          // Highest-possible line has to move with them. It did not, so
          // opening a column left the header saying 30 while the learners
          // beneath were already computed against 40.
          { unwrap: ['results', 'group_hps', 'slots'] }
        );
        if (previewTicket.current !== ticket) return; // a newer run has since started
        setPreview(new Map(data.results.map((row) => [row.student_id, row])));
        setPreviewGroupHps(data.group_hps);
        setPreviewSlots(data.slots);
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
      setPreviewGroupHps(null);
      setPreviewSlots(null);
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
    previewGroupHps,
    previewSlots,
    previewing,
    previewError,
    dirty,
    saving,
    save,
    buildPayload,
  };
}
