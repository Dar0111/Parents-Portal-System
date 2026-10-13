// BULK GRADE LOCKS — the words both screens show and the request they send
// (fix/grade-locks, 2026-10-13; the owner's Finding 1). Admin → Grades on the
// web (GradeLocksModal.jsx) and the phone (GradeLocksScreen.jsx) read every
// sentence from here, so the two cannot drift: MIRRORED byte for byte to
// mobile/src/format/gradeLocks.js and held equal by `npm run lint:mirrors`.
//
// PURE: no imports, no Date, no DOM. The SSR proof and the phone proof drive
// it directly with the server's own response shape (POST /api/grades/locks).
//
// NEVER AN LRN. A skipped row is "Last, First · Grade G - Section · …"; the
// server sends no LRN, and nothing here would print one if it did.

export const LOCK_TERM_LABEL = 'Lock or unlock a term';

// The keys the screens unwrap from POST /api/grades/locks (§1: an unwrap list
// is the line to change when the endpoint gains a field).
export const LOCKS_UNWRAP = [
  'dry_run',
  'lock',
  'scope',
  'learners',
  'learners_ready',
  'learners_changed',
  'records_changed',
  'records_already',
  'skipped',
];

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
const records = (n) => count(n, 'grade record', 'grade records');
const learnersOf = (n) => count(n, 'learner', 'learners');

// "Grade 6 - Malikhain" · "Grade 6" · "the whole school".
export function scopeLabel(scope) {
  if (scope?.grade_level && scope?.section) return `Grade ${scope.grade_level} - ${scope.section}`;
  if (scope?.grade_level) return `Grade ${scope.grade_level}`;
  return 'the whole school';
}

// The preview's heading: "Grade 6 - Malikhain · Term 2 · SY 2026-2027".
export function scopeHeading(scope) {
  const where = scope?.grade_level ? scopeLabel(scope) : 'Whole school';
  return `${where} · Term ${scope.term} · SY ${scope.school_year}`;
}

// What the action does, said exactly as the server does it (§5i).
export function introFor(lock) {
  return lock
    ? 'Locks every grade for each learner who has a grade in every subject this term. A learner with any subject still Pending is skipped and listed — nothing of theirs is locked.'
    : 'Unlocks every locked grade for this term and scope, complete or not.';
}

// The preview's sentences, in order. `kind` is 'count', 'nothing' or
// 'skipped' (the line that introduces the list) so a screen can style it; the
// text is the copy.
export function previewLines(result) {
  const { lock, scope, learners, records_changed: toChange } = result;
  if (learners === 0) return [{ kind: 'nothing', text: `There are no active learners in ${scopeLabel(scope)}.` }];
  const lines = [];
  if (lock) {
    const ready = result.learners_ready;
    const already = result.records_already;
    lines.push({ kind: 'count', text: `Ready: ${ready} of ${learnersOf(learners)} — every subject graded.` });
    if (toChange > 0) lines.push({ kind: 'count', text: `To lock: ${records(toChange)}.` });
    if (already > 0) lines.push({ kind: 'count', text: `Already locked: ${records(already)}.` });
    if (toChange === 0) {
      lines.push({
        kind: 'nothing',
        text:
          ready === 0
            ? `Nothing to lock — no learner here has every subject graded for Term ${scope.term} yet.`
            : `Nothing to lock — every ready learner's Term ${scope.term} grades are already locked.`,
      });
    }
    if (result.skipped.length > 0) {
      lines.push({ kind: 'skipped', text: `Skipped: ${learnersOf(result.skipped.length)} — still Pending in at least one subject:` });
    }
  } else if (toChange > 0) {
    lines.push({ kind: 'count', text: `To unlock: ${records(toChange)} for ${learnersOf(result.learners_changed)}.` });
  } else {
    lines.push({ kind: 'nothing', text: `Nothing to unlock — no Term ${scope.term} grade is locked in ${scopeLabel(scope)}.` });
  }
  return lines;
}

// One skipped learner: "Conde, Marwin · Grade 6 - Malikhain · 8 of 8 subjects
// still Pending". Name, class and counts only.
export function skippedRow(row) {
  return `${row.name} · Grade ${row.grade_level} - ${row.section} · ${row.pending} of ${count(row.subjects, 'subject', 'subjects')} still Pending`;
}

// The one write: "Lock 8 grade records" / "Unlock 1 grade record".
export function applyLabel(lock, n) {
  return `${lock ? 'Lock' : 'Unlock'} ${records(n)}`;
}

// The result line, from the APPLIED answer — not the preview's, which can be
// stale by then.
export function resultLine(result) {
  const { lock, scope, records_changed: changed } = result;
  if (changed === 0) return 'No grade record changed — the grades changed since the preview. Preview again.';
  const where = `${scopeLabel(scope)}, Term ${scope.term}`;
  const head = `${lock ? 'Locked' : 'Unlocked'} ${records(changed)} for ${learnersOf(result.learners_changed)} — ${where}.`;
  return lock && result.skipped.length > 0 ? `${head} ${learnersOf(result.skipped.length)} skipped.` : head;
}

// The request body from the controls' values (strings, as a select gives
// them): an empty grade is the whole school, a section only with a grade.
export function locksBody({ action, term, grade, section }, dryRun) {
  const body = { lock: action === 'lock', term: Number(term), dry_run: dryRun };
  if (grade) {
    body.grade_level = Number(grade);
    if (section) body.section = section;
  }
  return body;
}
