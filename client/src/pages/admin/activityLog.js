// THE ACTIVITY LOG PAGE'S PURE PARTS (feat/activity-log, B2) — the default
// range, the request's parameters, the empty-state sentence and the download's
// file name. Kept out of the page so scripts/ssr-activity-log.jsx can drive
// each one; web only (the phone has no Activity log), so not a mirror.
//
// THE WORDS FOR AN ACTION ARE THE SERVER'S (server/utils/activityActions.js):
// the page reads them from GET /api/activity-logs/actions and every row
// carries its `action_label`. Nothing here spells one.

import { lastNDays, shortDate } from '../../format/date';

// The last 7 days, today included (the owner's Q3).
export const RANGE_DAYS = 7;

// The Action select holds an action code, or a whole group as `group:<key>`.
// A code is lower-case letters and underscores, so it never contains ':'.
export const GROUP_PREFIX = 'group:';

export const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
  { value: 'deleted', label: 'Deleted account' },
];

const ROLE_WORDS = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

// Display casing only (§5d) — the stored role stays as it is.
export function roleWord(role) {
  return ROLE_WORDS[role] || null;
}

// `today` is a parameter so a proof can fix it; the page passes nothing and
// gets the device's today, as every date input here does.
export function defaultFilters(today) {
  const days = lastNDays(RANGE_DAYS, today);
  return { from: days[0], to: days[days.length - 1], role: '', action: '' };
}

// GET /api/activity-logs and /export take the same filters. An empty value is
// not sent; a whole group goes as `group`, one code as `action`.
export function filtersToParams(applied) {
  const params = {};
  if (applied.from) params.from = applied.from;
  if (applied.to) params.to = applied.to;
  if (applied.role) params.role = applied.role;
  if (applied.action.startsWith(GROUP_PREFIX)) params.group = applied.action.slice(GROUP_PREFIX.length);
  else if (applied.action) params.action = applied.action;
  return params;
}

// The label of what the Action select holds, from the server's catalogue —
// the code itself when the catalogue has not loaded or does not know it.
export function scopeLabel(groups, value) {
  if (value.startsWith(GROUP_PREFIX)) {
    const key = value.slice(GROUP_PREFIX.length);
    return groups.find((g) => g.key === key)?.label || key;
  }
  for (const g of groups) {
    const found = g.actions.find((a) => a.code === value);
    if (found) return found.label;
  }
  return value;
}

// THE EMPTY STATE'S SENTENCE (§5f, the owner's C2), built from the applied
// values alone. Labels are verb phrases, so an action is quoted and counted in
// "entries"; a group is not quoted; a role is "<role> accounts".
//   No "Signed in" entries for teacher accounts from 17 Oct 2026 to 23 Oct 2026.
//   No Attendance entries for teacher accounts from … to ….
//   Nothing recorded for teacher accounts from … to ….
// One bound cleared reads "since <from>" or "up to <to>".
export function emptyCopy(applied, groups) {
  let subject = 'Nothing recorded';
  if (applied.action.startsWith(GROUP_PREFIX)) subject = `No ${scopeLabel(groups, applied.action)} entries`;
  else if (applied.action) subject = `No "${scopeLabel(groups, applied.action)}" entries`;
  const who = applied.role ? ` for ${applied.role} accounts` : '';
  let when = '';
  if (applied.from && applied.to) when = ` from ${shortDate(applied.from)} to ${shortDate(applied.to)}`;
  else if (applied.from) when = ` since ${shortDate(applied.from)}`;
  else if (applied.to) when = ` up to ${shortDate(applied.to)}`;
  return `${subject}${who}${when}.`;
}

// The file name the server put in Content-Disposition (exposed through CORS
// since B2, the owner's Q9.4) — its one source. A plain name only: anything
// with a path separator falls back.
export function downloadFileName(disposition, fallback = 'activity-log.csv') {
  const match = /filename="([^"]+)"/.exec(String(disposition || ''));
  const name = match ? match[1] : '';
  return name && !/[\\/]/.test(name) ? name : fallback;
}
