import { calendarDaysAgo, calendarDaysAgoLabel } from '../../../format/date';

// THE PURE HALF OF THE WEB'S AdminDashboard.jsx (Stage 5 branch 4), lifted so
// scripts/proof-admin-dashboard.mjs can drive it. `backupAge` is the web's
// function with one change the proof needs: `now` is a parameter, as it is on
// `calendarDaysAgo` itself, so a proof can pin the clock.
//
// NEVER RED (§12, the web's spec): green at or under a week, amber beyond it
// or when there is no backup. A stale backup is a prompt, not a failure.
// CALENDAR DAYS in Manila, never elapsed hours (UI-C1b): a backup at 23:00
// read at 01:00 is "yesterday", not "today".
export function backupAge(createdAt, now = Date.now()) {
  if (!createdAt) return { tone: 'warning', label: 'No backup yet' };
  const days = calendarDaysAgo(createdAt, now);
  if (days === null) return { tone: 'warning', label: 'No backup yet' };
  return { tone: days <= 7 ? 'success' : 'warning', label: `Last backup ${calendarDaysAgoLabel(createdAt, now)}` };
}

// EACH COUNT OPENS THE LIST WHOSE WHERE IT REPEATS (the web's rule: a card
// reading 42 that opens a list of 37 is a bug report). The phone's routes are
// drawer paths. BACKUP & RESTORE IS WEB ONLY (Darryl, fixed): the System card
// shows the last backup and links to School settings, never to backups.
export const CARD_LINKS = Object.freeze({
  students: '/admin/students',
  teachers: '/admin/users',
  parents: '/admin/users',
  pending: '/admin/users',
  system: '/admin/settings',
});

// THE PEOPLE CARD'S THREE COUNTS (build 2, feat/dashboards-look, 2026-10-07
// — the owner's Part C and decision 3): Students, Teachers and Parents share
// ONE card, and each count is its own link — the one exception to "the whole
// card is the link" (§15e), because the three open different lists. Each
// opens the list whose WHERE it repeats (CARD_LINKS above); Teachers and
// Parents both open Users, which takes no role from a link. The web's words.
export function countRows(totals) {
  const n = (value) => String(Number(value) || 0);
  return [
    { key: 'students', label: 'Students', value: n(totals?.students), caption: 'on the roll', link: CARD_LINKS.students },
    { key: 'teachers', label: 'Teachers', value: n(totals?.teachers), caption: 'teacher accounts', link: CARD_LINKS.teachers },
    { key: 'parents', label: 'Parents', value: n(totals?.active_parents), caption: 'active parent accounts', link: CARD_LINKS.parents },
  ];
}

// The lockout hazard (§12): shown only while the server says the one admin
// has no confirmed email; it clears itself, names no account, and is amber,
// never red — a state that COULD strand you is a warning.
export function showLockoutHazard(dashboard) {
  return dashboard?.hazard?.single_unverified_admin === true;
}

// The waiting card is amber only when something waits.
export function pendingTone(count) {
  return Number(count) > 0 ? 'warning' : 'default';
}

// THE LEAD LINE of the EMPHASISED card (feat/ui-polish f2, 2026-09-30):
// Stat's `{ value, caption }`, the web's words, shown at 0 too. It is first on
// the screen and the bigger number — on one column, that is the emphasis.
export function pendingLead(count) {
  const n = Number(count) || 0;
  return { value: String(n), caption: n === 1 ? 'parent account waiting' : 'parent accounts waiting' };
}
