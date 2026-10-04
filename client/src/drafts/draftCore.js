// FORM DRAFTS — THE PURE CORE (feat/form-drafts, 2026-10-04). Mirrored byte for
// byte to mobile/src/drafts/draftCore.js (`npm run lint:mirrors` proves it);
// a divergence is a new file, never an edit to one side.
//
// A draft is what someone typed into one Phase 1 form — an excuse letter, a
// message, an announcement, a memo, an event — kept so a reload (the web) or
// a killed app (the phone) does not throw it away. Storage is the platform's
// (sessionStorage on the web, AsyncStorage on the phone); everything that
// decides WHAT is kept, UNDER WHICH KEY and WHEN it is valid lives here, so
// both platforms decide it identically and a proof can drive it in Node.
//
// THE KEY CARRIES NO IDENTIFIER A PERSON CAN READ (§5c). It is the numeric
// user id, the form's name and a context — `new`, `edit-<item id>` or
// `thread-<the other person's numeric user id>` — under a version prefix.
// Anything else THROWS: a login id, an LRN (12 digits, longer than any row id)
// or a name can never become part of a key.
//
// ONLY ALLOW-LISTED FIELDS ARE KEPT. Each form names its fields and a length
// cap; a field outside the list — a password, a login id, an LRN column — is
// dropped on save and refused on read. No Phase 1 form has one; the list is
// the guarantee that none ever slips in.

export const DRAFT_VERSION = 1;
export const DRAFT_PREFIX = 'pp.draft.';

// How long after the last keystroke a draft is written.
export const SAVE_DELAY_MS = 500;

// The largest encoded draft that is written at all. Above it nothing is
// saved, and nothing claims it was — the notice only appears on a restore.
export const MAX_DRAFT_CHARS = 32000;

// The longest numeric id a key accepts: an INT UNSIGNED. A 12-digit LRN is
// above it, so even a number cannot smuggle one in.
const MAX_ID = 4294967295;

const LONG_TEXT = 10000;

// Per form: the fields kept, each with its length cap (the form's own
// `maxLength` where it has one).
export const DRAFT_FORMS = Object.freeze({
  excuse: Object.freeze({ absence_date: 10, reason: LONG_TEXT, details: LONG_TEXT }),
  message: Object.freeze({ body: LONG_TEXT }),
  announcement: Object.freeze({ target: 120, title: 200, content: LONG_TEXT, category: 50 }),
  adminAnnouncement: Object.freeze({ audience: 20, grade: 20, section: 120, title: 200, content: LONG_TEXT, category: 50 }),
  memo: Object.freeze({ title: 200, content: LONG_TEXT }),
  event: Object.freeze({ title: 200, event_date: 10, description: LONG_TEXT, target_grade: 20 }),
});

// The words, one definition for both platforms. Each notice says WHERE the
// draft is kept and UNTIL WHEN (§5i): the web's lives in this browser tab and
// ends with it; the phone's lives on the device until submit, discard or log
// out. A 401 keeps a draft, so it is not in the list.
export const DRAFT_COPY = Object.freeze({
  restoredWebForm: 'Draft restored. It is kept in this browser tab until you submit it, discard it or log out, or close the tab.',
  restoredWebMessage: 'Draft restored. It is kept in this browser tab until you send it, discard it or log out, or close the tab.',
  restoredPhoneForm: 'Draft restored. It is kept on this phone until you submit it, discard it or log out.',
  restoredPhoneMessage: 'Draft restored. It is kept on this phone until you send it, discard it or log out.',
  itemChanged: 'Draft restored. This item was changed after your draft was saved — submitting replaces those changes.',
  discardAction: 'Discard draft',
  discardTitle: 'Discard this draft?',
  discardBody: 'The text you typed will be deleted. This cannot be undone.',
  discardKeep: 'Keep draft',
  discardConfirm: 'Discard draft',
  replaceTitle: 'Replace your saved announcement draft with this message?',
  replaceKeep: 'Keep saved draft',
  replaceUse: 'Use this message',
  handoffStillInThread: "Your message draft is below. It is also still in the conversation's message box.",
});

function isId(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_ID;
}

function isForm(form) {
  return typeof form === 'string' && Object.prototype.hasOwnProperty.call(DRAFT_FORMS, form);
}

const CONTEXT = /^(?:new|edit-([1-9]\d{0,9})|thread-([1-9]\d{0,9}))$/;

function isContext(context) {
  if (typeof context !== 'string') return false;
  const m = CONTEXT.exec(context);
  if (!m) return false;
  const id = m[1] || m[2];
  return id === undefined || Number(id) <= MAX_ID;
}

// The context for an edit of item `id`, or null when `id` is not a row id.
export function editContext(id) {
  const n = Number(id);
  return isId(n) ? `edit-${n}` : null;
}

// The context for the conversation with user `otherId`, or null.
export function threadContext(otherId) {
  const n = Number(otherId);
  return isId(n) ? `thread-${n}` : null;
}

// The storage key. THROWS on anything that is not a numeric user id, a known
// form and a well-formed context.
export function draftKey({ userId, form, context }) {
  if (!isId(userId)) throw new Error('draftKey: userId must be a numeric user id');
  if (!isForm(form)) throw new Error('draftKey: unknown form');
  if (!isContext(context)) throw new Error('draftKey: context must be new, edit-<id> or thread-<id>');
  return `${DRAFT_PREFIX}v${DRAFT_VERSION}.${userId}.${form}.${context}`;
}

// The prefix every key of this user's current-version drafts starts with.
export function userKeyPrefix(userId) {
  if (!isId(userId)) throw new Error('userKeyPrefix: userId must be a numeric user id');
  return `${DRAFT_PREFIX}v${DRAFT_VERSION}.${userId}.`;
}

// Is `key` a draft key at all (any version, any user)? Logout clears these.
export function isDraftKey(key) {
  return typeof key === 'string' && key.startsWith(DRAFT_PREFIX);
}

// The context part of one of this user's keys for `form`, or null.
export function contextOfKey(key, userId, form) {
  if (typeof key !== 'string' || !isId(userId) || !isForm(form)) return null;
  const head = `${userKeyPrefix(userId)}${form}.`;
  if (!key.startsWith(head)) return null;
  const context = key.slice(head.length);
  return isContext(context) ? context : null;
}

// Only the allowed fields, as strings, each cut to its cap. Anything else —
// another key, an object, a function — is dropped.
export function pickAllowed(form, values) {
  const fields = DRAFT_FORMS[form];
  const out = {};
  if (!fields) return out;
  for (const name of Object.keys(fields)) {
    const raw = values && Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '';
    const text = typeof raw === 'string' ? raw : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
    out[name] = text.slice(0, fields[name]);
  }
  return out;
}

// Do two value sets say the same thing, field by field, for this form?
export function sameValues(form, a, b) {
  const x = pickAllowed(form, a);
  const y = pickAllowed(form, b);
  return Object.keys(x).every((name) => x[name] === y[name]);
}

// The record to store, as a string — or null when there is nothing worth
// keeping (the values still equal what the form opened with) or it is too
// large. `fromThread` is the other person's numeric id when an announcement
// was started from a conversation; it is kept so that conversation's draft can
// be cleared when the announcement posts.
export function encodeDraft({ form, values, base = null, open = false, fromThread = null, savedAt = 0 }) {
  if (!isForm(form)) return null;
  const kept = pickAllowed(form, values);
  const opening = base ? pickAllowed(form, base) : pickAllowed(form, {});
  if (sameValues(form, kept, opening)) return null;
  const record = {
    v: DRAFT_VERSION,
    form,
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    open: Boolean(open),
    values: kept,
    base: base ? opening : null,
    fromThread: isId(Number(fromThread)) && fromThread !== null ? Number(fromThread) : null,
  };
  const text = JSON.stringify(record);
  return text.length > MAX_DRAFT_CHARS ? null : text;
}

// The stored record back, validated — or null for anything that is not a
// draft of this version and this form, or that carries a field outside the
// form's list.
export function decodeDraft(raw, form) {
  if (typeof raw !== 'string' || !isForm(form)) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record || typeof record !== 'object' || record.v !== DRAFT_VERSION || record.form !== form) return null;
  if (!record.values || typeof record.values !== 'object') return null;
  const fields = DRAFT_FORMS[form];
  const allowed = (obj) => Object.keys(obj).every((name) => Object.prototype.hasOwnProperty.call(fields, name));
  if (!allowed(record.values)) return null;
  if (record.base !== null && (typeof record.base !== 'object' || !allowed(record.base))) return null;
  return {
    values: pickAllowed(form, record.values),
    base: record.base ? pickAllowed(form, record.base) : null,
    open: record.open === true,
    savedAt: Number.isFinite(record.savedAt) ? record.savedAt : 0,
    fromThread: isId(record.fromThread) ? record.fromThread : null,
  };
}

// For an edit draft: has the item changed since the draft began? True when
// the item's current fields differ from the snapshot the draft was started
// on — then the notice says so (DRAFT_COPY.itemChanged).
export function itemChangedSince(form, record, current) {
  if (!record || !record.base) return false;
  return !sameValues(form, record.base, current);
}
