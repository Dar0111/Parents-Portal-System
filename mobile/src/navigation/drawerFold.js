// THE DRAWER'S PURE DECISIONS (feat/nav-drawer-groups, 2026-09-30) — which
// groups are folded, and what the user card says. Imports nothing, so
// scripts/proof-drawer.mjs can load it under Node; DrawerContent does the
// storage and the rendering.
//
// FOLDING IS PHONE-ONLY (Darryl, 2026-09-30, decision 1). The web sidebar has
// the room and its rail cannot fold, so navGroups.js — a mirror — knows
// nothing about it; this file is the phone's own.
//
// THE FOLD STATE IS REMEMBERED ON THE DEVICE (decision 2), key `pp.navGroups`
// in AsyncStorage, per role: `{ "teacher": ["Communicate"] }` lists the
// FOLDED labels, so a group nobody touched — or one added later — is open.
// Anything unreadable reads as `{}`: every group open, never a hidden page.
//
// THE GROUP HOLDING THE ACTIVE PAGE IS ALWAYS OPEN, decided at render and
// NEVER WRITTEN BACK. Leaving that page restores exactly what the user chose;
// a fold of the active group is still stored and takes effect once the user
// is elsewhere. The unlabelled group (an item navGroups.js does not name)
// has no header to tap, so it is never folded either.

export const NAV_GROUPS_KEY = 'pp.navGroups';

// The stored JSON, as `{ role: [label, ...] }` — every value an array of
// strings, anything else dropped.
export function parseFolded(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [role, labels] of Object.entries(value)) {
    if (Array.isArray(labels)) out[role] = labels.filter((l) => typeof l === 'string');
  }
  return out;
}

export function foldedFor(stored, role) {
  return (stored && Array.isArray(stored[role]) && stored[role]) || [];
}

// A new stored object with `label` flipped for `role`; the other roles are
// kept as they were.
export function toggleFolded(stored, role, label) {
  const folded = foldedFor(stored, role);
  const next = folded.includes(label) ? folded.filter((l) => l !== label) : [...folded, label];
  return { ...(stored || {}), [role]: next };
}

// The label of the group holding the active drawer screen (its name IS the
// nav path), or null when the active page sits on top, at the bottom, or in
// no group at all.
export function activeGroupLabel(groups, activeName) {
  const hit = groups.find((g) => g.items.some((item) => item.to === activeName));
  return hit ? hit.label : null;
}

export function isGroupOpen(label, folded, activeLabel) {
  if (!label) return true;
  if (label === activeLabel) return true;
  return !folded.includes(label);
}

// THE USER CARD'S TWO LINES — the web's UserCard rule, on the phone.
// A PARENT'S CARD NEVER SHOWS THE LOGIN ID (§5c): their login_id IS the
// child's LRN, and that includes the name fallback. Staff login ids
// (TCH-001, ADMIN001) are shown, as on the web.
const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

export function userCardLines(user) {
  const role = ROLE_LABEL[user?.role] || user?.role || '';
  const parent = user?.role === 'parent';
  const detail = parent ? role : [role, user?.login_id].filter(Boolean).join(' · ');
  const name = user?.name || (parent ? '' : user?.login_id) || '';
  return { name, detail };
}
