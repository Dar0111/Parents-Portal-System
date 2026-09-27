// The attendance roster's pure logic (DV1b-b).
//
// WHY ITS OWN FILE, and it is the `buildPayload.js` reason again (§13e): this
// is BEHAVIOUR, not markup — the clear rule, the no-overwrite fill, the counts
// — and a proof has to be able to import and drive it. `renderToStaticMarkup`
// cannot click a button, so asserting any of it through a render is
// impossible.
//
// It also keeps the page's lint clean: exporting non-components from a file
// that exports components trips `react(only-export-components)`, five times
// over, which would have moved the oxlint baseline for no reason anyone would
// remember six weeks from now.
//
// NO React, NO imports. That is what makes it importable from anywhere.

// The order the school reads them in — Present first because it is the common
// case, then the three exceptions. Not alphabetical.
export const STATUS_ORDER = ['Present', 'Late', 'Absent', 'Excused'];

export const ROW_STATE_LABEL = {
  recorded: 'Recorded',
  changed: 'Changed · not saved',
  unmarked: 'Not marked yet',
};

// THREE ROW STATES, and the distinction between the first two is §5b's.
// `recorded` is the database's answer from the last successful read; `marks`
// is what the teacher has typed. They are separate pieces of state precisely
// so this line can tell them apart — a column claiming to show stored state
// must never derive from the object the inputs write to.
export function rowState(id, marks, recorded) {
  const mark = marks[id] || '';
  const stored = recorded.get(id) || '';
  if (mark !== stored) return 'changed';
  if (stored) return 'recorded';
  return 'unmarked';
}

// A SAVED MARK CANNOT BE CLEARED, only changed. Tapping the selected button
// again clears it ONLY while the mark is unsaved.
//
// The reason is the API, not taste. `POST /api/attendance/bulk` takes only the
// rows in `entries`, and the page omits unmarked rows from that array
// entirely — so "clearing" a recorded row would send nothing for it, leave the
// stored row exactly as it was, and leave the screen claiming a state the
// database does not hold. Deleting a recorded mark needs a server change, and
// until there is one this refuses rather than lies.
export function pickStatus(marks, recorded, id, status) {
  const current = marks[id] || '';
  if (current !== status) return { ...marks, [id]: status };
  if (recorded.get(id)) return marks; // saved — a no-op, never a clear
  return { ...marks, [id]: '' };
}

// Marks only rows that have NO mark yet. It NEVER overwrites, so a teacher who
// has already marked the three absences can fill in the rest with one tap
// without undoing that work. Nothing is saved until Save.
export function markRestPresent(roster, marks) {
  const next = { ...marks };
  for (const s of roster) if (!next[s.id]) next[s.id] = 'Present';
  return next;
}

// COUNTS ONLY, never a rate. Parent → Attendance owns the percentage and its
// rounding; a second implementation here would be a number the two screens
// could disagree on, and this is an encode screen rather than a report.
export function rosterCounts(roster, marks) {
  const counts = { total: roster.length, marked: 0, Present: 0, Late: 0, Absent: 0, Excused: 0 };
  for (const s of roster) {
    const m = marks[s.id];
    if (!m) continue;
    counts.marked += 1;
    if (counts[m] !== undefined) counts[m] += 1;
  }
  return counts;
}

// How many rows differ from what is stored — the phone save bar's figure.
export function unsavedCount(roster, marks, recorded) {
  return roster.filter((s) => rowState(s.id, marks, recorded) === 'changed').length;
}
