import { isWeekend, lastNDays, longDate, monthName, todayLocalDateString } from '../../../format/date';

// THE PURE HALF OF THE WEB'S ParentDashboard.jsx, lifted into a module so
// scripts/proof-parent-dashboard.mjs can drive it (§17b). Every function is
// the web's, byte for byte in logic; only the file moved. Rules carried:
// Late counts as present (the school's, never DepEd's); the weekly strip
// has THREE states told apart by kind, never colour alone; the hero's
// descriptor is `.descriptor` only, never the object, never `remarks`.

export function classLabel(user) {
  if (user?.grade_level == null && !user?.section) return null;
  return `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '');
}

export function childName(user) {
  const name = `${user?.student_first_name || ''} ${user?.student_last_name || ''}`.trim();
  return name || null;
}

export function childInitials(user) {
  const first = (user?.student_first_name || '').trim().charAt(0);
  const last = (user?.student_last_name || '').trim().charAt(0);
  return `${first}${last}`.toUpperCase();
}

export function recordedDays(summary) {
  const n = (key) => {
    const value = Number(summary?.[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  const total = n('total');
  if (total <= 0) return null;
  return { present: n('Present') + n('Late'), absent: n('Absent'), late: n('Late'), total };
}

export function firstOfMonth(today = todayLocalDateString()) {
  return `${today.slice(0, 7)}-01`;
}

export const STATUS_INITIAL = { Present: 'P', Absent: 'A', Late: 'L', Excused: 'E' };

export function weekStrip(rows, end) {
  const byDate = new Map();
  for (const row of rows || []) byDate.set(String(row.date).slice(0, 10), row.status);
  return lastNDays(7, end).map((date) => {
    const status = byDate.get(date) || null;
    if (status) return { date, kind: 'recorded', status };
    if (isWeekend(date)) return { date, kind: 'weekend', status: null };
    return { date, kind: 'unrecorded', status: null };
  });
}

// The Key Stage 1 hero column: one pill per recorded letter for the current
// term, and the count of subjects with no letter yet — a fact, not the
// "N of M" progress figure §12 refuses for Key Stage 1.
export function letterTerm(subjects, currentTerm) {
  if (!Array.isArray(subjects)) return null;
  const pills = subjects
    .map((s) => ({
      name: s.subject_name,
      letter: s.terms?.[currentTerm]?.descriptive_grade ?? null,
      descriptor: s.terms?.[currentTerm]?.descriptor?.descriptor ?? null,
    }))
    .filter((p) => p.letter);
  return pills.length ? { term: currentTerm, pills, missing: subjects.length - pills.length } : null;
}

// The numerical hero column: the CURRENT term's average from the report
// card, and the server's band word for it — a STRING, flattened here, so a
// renderer that receives the object refuses it rather than printing
// "[object Object]" (§19f).
export function heroGrades(grades, card, currentTerm) {
  if (grades?.descriptive) return grades;
  const descriptor = card?.term_average_descriptors?.[currentTerm]?.descriptor ?? null;
  if (descriptor !== null && typeof descriptor !== 'string') {
    throw new TypeError('heroGrades: term_average_descriptors[term].descriptor must be a string');
  }
  return {
    ...grades,
    average: card?.term_averages?.[currentTerm] ?? null,
    descriptor,
  };
}

// THE LEAD LINES (feat/ui-polish f2, 2026-09-30). Every card opens on a
// number or the next action, as Stat's `{ value, caption }`; the web's
// dashboards build the same words inline. `null` means the card keeps its own
// empty copy. Values are STRINGS, so a 0 is printed rather than dropped.

// Grades — THE WEB'S CARD (Darryl, 2026-09-30: the phone follows the web
// parent dashboard). Until complete, ONE normal-size line — "1 of 8 subjects
// recorded · Term 2" — not a large count; once complete, the average (raw, for
// GradeValue) with its caption, as the web's Stat. Key Stage 1 has no lead:
// §12 refuses "N of M" for something with no defined progress. Never a
// partial average.
export function gradesLead(grades) {
  if (!grades || grades.unavailable || grades.descriptive || !grades.term) return null;
  if (grades.complete) return { average: grades.general_average, caption: `General average · Term ${grades.term}` };
  return { line: `${grades.subjects_recorded} of ${grades.subjects_total} subjects recorded · Term ${grades.term}` };
}

// Attendance, the LARGE card: this month's absences, named by month. `days`
// is recordedDays(); nothing recorded is not "0 absences".
export function attendanceLead(days, today = todayLocalDateString()) {
  if (!days) return null;
  const month = monthName(Number(today.slice(5, 7)));
  return { value: String(days.absent), caption: `${days.absent === 1 ? 'absence' : 'absences'} in ${month}` };
}

// Messages: the unread COUNT is UnreadProvider's (§10), never a list length.
// Shown at 0 once a conversation exists; with none, the empty copy stays.
export function unreadLead(unread, hasConversation = true) {
  const n = Number(unread) || 0;
  if (n === 0 && !hasConversation) return null;
  return { value: String(n), caption: n === 1 ? 'unread message' : 'unread messages' };
}

// Excuse letters — THE WEB'S CARD: the latest letter's status for the small
// StatusBadge and its absence date for "Absence on <date>"; none → null, and
// the card says "No excuse letters." No large status, no "Submit a letter".
export function letterLead(letter) {
  if (!letter) return null;
  return { status: letter.status, absenceDate: letter.absence_date };
}

// Announcements & memos: the bell's own count for the two sections the
// sidebar badge adds (§10) — posts carry no read state of their own.
export function postsLead(counts) {
  const n = (Number(counts?.announcements) || 0) + (Number(counts?.memos) || 0);
  return { value: String(n), caption: 'unread' };
}

// Upcoming events: the next one leads; the card lists the rest below it.
export function nextEventLead(events) {
  const first = Array.isArray(events) ? events[0] : null;
  if (!first) return null;
  return { value: first.title, caption: `Next event · ${longDate(first.event_date)}` };
}
