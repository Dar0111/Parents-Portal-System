// The class record's request shape, and nothing else.
//
// ---------------------------------------------------------------------------
// WHY THIS IS ITS OWN FILE (2026-09-22, after defect 8)
// ---------------------------------------------------------------------------
// The grid addresses a cell by its column's TYPE AND NUMBER, because a column
// that does not exist yet has no id. The payload builder was still doing
// Number(field) on "WW-2" — NaN, which JSON.stringify writes as null — so
// every new score typed into an existing column was refused by the server.
//
// Every server suite passed while that was true, because they all build their
// request bodies by hand and none of them ever produced the shape the grid
// produces. That is the gap this file closes: it has NO React and NO axios
// import, so a plain Node test can require it, feed it grid state, and send
// the result to the real API.
//
// KEEP IT PURE. The moment this imports a hook, a component or the axios
// client, the server suite can no longer load it and the gap reopens without
// anything failing.

// THE GRID IS A FIXED FRAME, not a list of whatever slots exist.
// Written / Oral Works 1-5 and Performance Tasks 1-3 are always on screen,
// which is what the school's E-Class Record looks like and what makes a blank
// column an invitation to use it rather than a missing feature.
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

// A cell's draft key. One learner, one slot.
export const cellKey = (studentId, slotId) => `${studentId}:${slotId}`;
// A Summative draft key. One learner, one field.
export const examKey = (studentId, field) => `${studentId}:${field}`;

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

// Grid state in, the exact PUT body out. Returns null when nothing has
// changed, which is what makes "Save" disabled on a clean page.
export function buildClassRecordPayload({ server, draft, slotDraft, examMaxDraft, key }) {
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
  // SENT WITH EVERY SAVE THAT CARRIES AN EXAM SCORE, edited or not, and that
  // is the fix for a real defect: the header showed 30/30/40 because ANOTHER
  // learner's row had those maxima, but a learner who had none stored was
  // refused with "ST1: a score needs a max, and this learner has none stored
  // yet". The value was on screen and the client simply never sent it. A
  // maximum the teacher can see is a maximum the save must apply.
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

    // THE FIELD IS A SLOT KEY ("WW-2"), NOT AN ID. This is defect 8: the line
    // here used to be Number(field), from before phantom columns, when a cell
    // was addressed by the slot's database id.
    const slot = frame.find((s) => slotKey(s.type, s.slot_no) === field);
    if (!slot) continue;

    const stored = slot.id ? learner.scores[slot.id] : undefined;
    const storedValue = stored === undefined ? null : stored;
    if (parsed.value === storedValue) continue; // typed back to stored

    // A slot created in THIS SAME SAVE has no id yet — the teacher set a
    // phantom column's highest possible score and typed a score into it
    // before pressing Save once. The server creates slots before entries in
    // the same transaction, so it can resolve the column itself: the score
    // names its type and number instead, and the id is used when there is one.
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

  // ...AND the maxima go unconditionally whenever any entry carries an exam
  // score, even if the header was never touched.
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
}
