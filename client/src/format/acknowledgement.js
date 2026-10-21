// GRADE ACKNOWLEDGEMENTS — the words every screen shows
// (feat/grade-acknowledgement, 2026-10-21; the owner's Q7 texts). The parent's
// report card, the adviser's class summary and learner card, and Admin →
// Grades read every sentence from here, web and phone, so the screens cannot
// drift: MIRRORED byte for byte to mobile/src/format/acknowledgement.js and
// held equal by `npm run lint:mirrors`.
//
// PURE: no imports, no Date, no DOM. A date arrives here ALREADY FORMATTED
// (format/date.js timestampDay, through Asia/Manila), so nothing in this file
// parses one — §5a-iv's one home for date maths stays one.
//
// WHAT A TERM'S ENTRY IS. `GET /grades/student/:id` carries
// `acknowledgements`: { "1": { locked, acknowledged_at, by_name }, "2", "3" },
// always all three. `locked` is the server's "every subject of the term is
// locked with a value" (the bulk lock's own test); `acknowledged_at` the
// parent's confirmation, or null. A term that is not locked has nothing to
// confirm and no card.
//
// NEVER A VERDICT (§4) and never a number: these sentences say a term is
// final and whether it has been seen — not what the grades are.

export const ACKNOWLEDGEMENTS_KEY = 'acknowledgements';

export const TERMS = [1, 2, 3];

// The locked terms, in order — the cards the report card shows.
export function lockedTerms(acknowledgements) {
  return TERMS.filter((term) => Boolean(acknowledgements?.[term]?.locked));
}

// How many of the learners on a class sheet have confirmed this term.
export function confirmedCount(learners) {
  return (learners || []).filter((learner) => Boolean(learner?.acknowledged?.acknowledged_at)).length;
}

// ---------------------------------------------------------------------------
// The parent's report card
// ---------------------------------------------------------------------------

// The card's title: "Term 1 grades are final."
export function termFinalTitle(term) {
  return `Term ${term} grades are final.`;
}

// Under the title, until the parent confirms. No lock DATE: nothing records
// when a term was locked, so the sentence names none (§5i).
export const TERM_FINAL_BODY = 'The school has locked them. Please confirm that you have seen them.';

// The one action.
export const CONFIRM_BUTTON = 'I have seen these grades';

// The confirmation step (§5e: the write cannot be undone, so the dialog
// names the decision back).
export function confirmDialog(term) {
  return {
    title: `Confirm Term ${term} grades?`,
    body: `This tells the adviser and the school that you have seen your child's Term ${term} grades. It cannot be undone.`,
    cancel: 'Go back',
    confirm: 'Yes, I have seen them',
  };
}

// After: "You confirmed Term 1 on 21 October 2026."
export function confirmedLine(term, when) {
  return `You confirmed Term ${term} on ${when}.`;
}

// ---------------------------------------------------------------------------
// Someone else reading the learner's card — the adviser's drill-through
// ---------------------------------------------------------------------------

export function confirmedReaderLine(when) {
  return when ? `Confirmed by the parent on ${when}.` : 'The parent has not confirmed yet.';
}

// ---------------------------------------------------------------------------
// The adviser's class summary — the "Confirmed" column
// ---------------------------------------------------------------------------

export const CONFIRMED_HEADER = 'Confirmed';

// Under the header: "3 of 25 learners".
export function confirmedCountLine(confirmed, total) {
  return `${confirmed} of ${total} ${total === 1 ? 'learner' : 'learners'}`;
}

// One learner's cell. `when` is the formatted date, or null. The kinds let a
// screen style the three states apart; the text is the copy. "—" is the
// learner whose term is not locked: nothing to confirm, not a grade value,
// so §3's rule for a grade-bearing cell does not apply — the cell carries an
// accessible name saying so.
export const NOT_LOCKED_LABEL = 'Not locked yet';

export function confirmedCell(learner, when) {
  if (learner?.acknowledged?.acknowledged_at && when) return { kind: 'date', text: when };
  if (learner?.term_locked) return { kind: 'pending', text: 'Not yet' };
  return { kind: 'none', text: '—' };
}

// ---------------------------------------------------------------------------
// Admin → Grades
// ---------------------------------------------------------------------------

// Under the learner's header card, one line per confirmed term:
// "Term 1 · Confirmed 21 October 2026".
export function adminConfirmedLine(term, when) {
  return `Term ${term} · Confirmed ${when}`;
}

// In the lock dialog, when the term the cell belongs to has been confirmed.
export function unlockClearsSentence(when) {
  return `The parent confirmed these grades on ${when}. Unlocking clears that confirmation, and the parent is asked again after a relock.`;
}
