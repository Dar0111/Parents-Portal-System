// Admin → Assignments & advisers, the page's pure half (Module 11): no React,
// no request of its own, so scripts/ssr-assignments.jsx can drive every rule
// and word here directly. FRONTEND §37.

export const GRADE_LEVELS = [1, 2, 3, 4, 5, 6];

export function classLabel(gradeLevel, section) {
  return `Grade ${gradeLevel} - ${section}`;
}

export function teacherLabel(teacher) {
  return teacher.status === 'active' ? teacher.name : `${teacher.name} (inactive)`;
}

// One teacher's rows, in the order the API sent them: grade, section, then the
// school's printed subject order.
export function assignmentsOf(rows, teacherId) {
  return rows.filter((row) => Number(row.teacher_id) === Number(teacherId));
}

// A pair is one subject in one section. `section` is a citext-like column
// (portal.ci), so a case variant is the same pair to the server's unique key.
function pairKey(subjectId, section) {
  return `${Number(subjectId)}|${String(section).toLowerCase()}`;
}

// Everyone else holding the same subject in the same class (the owner's Q4:
// allowed, and shown). The unique key includes teacher_id, so two teachers on
// one class is a state the server accepts.
export function alsoTaughtBy(rows, row) {
  const key = pairKey(row.subject_id, row.section);
  return rows
    .filter((other) => Number(other.teacher_id) !== Number(row.teacher_id) && pairKey(other.subject_id, other.section) === key)
    .map((other) => other.teacher_name);
}

// The form's cross product, split into what would be added and what the
// teacher already holds. One form covers every pattern the school uses: one
// assignment, every subject of a class, one subject across sections, or
// several subjects across sections. `subjects` are rows, `sections` are names.
export function splitPairs({ rows, teacherId, subjects, sections }) {
  const held = new Set(assignmentsOf(rows, teacherId).map((row) => pairKey(row.subject_id, row.section)));
  const toAdd = [];
  const alreadyHeld = [];
  for (const subject of subjects) {
    for (const section of sections) {
      const pair = { subject_id: subject.id, subject_name: subject.name, grade_level: subject.grade_level, section };
      (held.has(pairKey(subject.id, section)) ? alreadyHeld : toAdd).push(pair);
    }
  }
  return { toAdd, alreadyHeld };
}

// The one 409 that means "already assigned". POST /assignments has a second
// 409 — academic_year not configured — which is a real failure, so the status
// alone cannot decide this.
export function isDuplicateRefusal(status, message) {
  return status === 409 && /already assigned/i.test(String(message));
}

// ONE AT A TIME, on purpose, and every pair is tried. Each POST stands alone
// (one row, one audit entry) and a repeat is refused rather than doubled, so a
// failed pair never undoes the others and running the form again is safe.
// `post(pair)` makes the request; `messageOf(err)` reads the API's own words.
export async function runPairs(pairs, post, messageOf) {
  const outcome = { added: 0, already: 0, failures: [] };
  for (const pair of pairs) {
    try {
      await post(pair);
      outcome.added += 1;
    } catch (err) {
      const message = messageOf(err);
      if (isDuplicateRefusal(err?.response?.status, message)) outcome.already += 1;
      else outcome.failures.push({ pair, message });
    }
  }
  return outcome;
}

export function resultLine({ added, already, failures }) {
  return `Added ${added}. Already assigned: ${already}. Failed: ${failures.length}.`;
}

// The result line, then each failure in the API's own wording (§2).
export function resultText(outcome) {
  const reasons = outcome.failures.map(
    ({ pair, message }) => `${pair.subject_name}, ${classLabel(pair.grade_level, pair.section)}: ${message}`
  );
  return [resultLine(outcome), ...reasons].join(' ');
}

export function addButtonLabel(count) {
  if (count === 0) return 'Add assignments';
  return count === 1 ? 'Add 1 assignment' : `Add ${count} assignments`;
}

export function removeSentence(row) {
  return `${row.teacher_name} will no longer be able to record ${row.subject_name} grades for ${classLabel(
    row.grade_level,
    row.section
  )}. Grades already recorded are kept.`;
}

// Allowed by the server, and only worth a hint: a teacher may advise several
// sections. `sectionId` is the one being changed, so it never counts.
export function alsoAdvisesSentence(sections, teacherId, sectionId) {
  const others = sections.filter(
    (section) => Number(section.adviser_id) === Number(teacherId) && Number(section.id) !== Number(sectionId)
  );
  if (!others.length) return null;
  return `Also advises ${others.map((section) => classLabel(section.grade_level, section.name)).join(', ')}.`;
}

// Letters waiting in one class, counted from GET /excuse-letters?status=Pending,
// whose rows carry the learner's grade_level and section.
export function pendingLettersIn(letters, section) {
  return letters.filter(
    (letter) =>
      Number(letter.grade_level) === Number(section.grade_level) &&
      String(letter.section).toLowerCase() === String(section.name).toLowerCase()
  ).length;
}

// WARN, NEVER BLOCK (the owner's Q3): an adviser who leaves must not hold the
// admin up. Each sentence is what the code does (§5i). With no adviser, review
// has no screen: a subject teacher is refused and the admin has no Excuse
// Letters page. A new adviser finds the letters in their list, but the
// excuse_submitted row belongs to the old adviser, so nothing tells them
// (the owner's Q5, KNOWN_ISSUES).
export function adviserWarning(count, nextName) {
  if (!count) return null;
  const one = count === 1;
  const waiting = one
    ? '1 excuse letter from this class is waiting for review.'
    : `${count} excuse letters from this class are waiting for review.`;
  if (!nextName) {
    return `${waiting} Nobody can review ${one ? 'it' : 'them'} until this class has an adviser.`;
  }
  return `${waiting} ${one ? 'It' : 'They'} will be in ${nextName}'s Excuse Letters list, but ${nextName} will not be notified.`;
}
