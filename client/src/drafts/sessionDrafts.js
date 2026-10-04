import { contextOfKey, decodeDraft, draftKey, encodeDraft, isDraftKey, userKeyPrefix } from './draftCore';

// FORM DRAFTS ON THE WEB — sessionStorage (feat/form-drafts, 2026-10-04).
//
// sessionStorage, not localStorage: a draft survives a reload and a
// navigation inside this tab, and ends when the tab closes — which is what
// the notice says (draftCore.js DRAFT_COPY). Every access is wrapped: a
// private window, blocked site data or a full quota THROWS, and then nothing
// is kept and nothing claims it was.
//
// `createDraftStore(getStorage)` takes the storage as a function so a proof
// can hand it a fake; the app uses the `sessionDrafts` instance below.
export function createDraftStore(getStorage) {
  function storage() {
    try {
      return getStorage() || null;
    } catch {
      return null;
    }
  }

  function read(key) {
    try {
      return storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      storage()?.removeItem(key);
    } catch {
      // nothing to do: a storage that cannot be read holds no draft we show
    }
  }

  function keys() {
    try {
      const s = storage();
      if (!s) return [];
      const out = [];
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    } catch {
      return [];
    }
  }

  return { read, write, remove, keys };
}

export const sessionDrafts = createDraftStore(() => (typeof window === 'undefined' ? null : window.sessionStorage));

// One form's draft, decoded — or null. Never throws (a bad key reads as none).
export function loadDraft({ userId, form, context }, store = sessionDrafts) {
  let key;
  try {
    key = draftKey({ userId, form, context });
  } catch {
    return null;
  }
  return decodeDraft(store.read(key), form);
}

// Writes the draft, or removes it when there is nothing worth keeping (the
// values equal what the form opened with). Returns whether a draft is now
// stored.
export function saveDraft({ userId, form, context, values, base = null, open = false, fromThread = null }, store = sessionDrafts) {
  let key;
  try {
    key = draftKey({ userId, form, context });
  } catch {
    return false;
  }
  const text = encodeDraft({ form, values, base, open, fromThread, savedAt: Date.now() });
  if (text === null) {
    store.remove(key);
    return false;
  }
  return store.write(key, text);
}

// Marks a stored draft as closed (the form was closed, the draft kept), so a
// reload does not reopen it.
export function closeDraft({ userId, form, context }, store = sessionDrafts) {
  const record = loadDraft({ userId, form, context }, store);
  if (!record || !record.open) return;
  saveDraft({ userId, form, context, values: record.values, base: record.base, open: false, fromThread: record.fromThread }, store);
}

export function clearDraft({ userId, form, context }, store = sessionDrafts) {
  try {
    store.remove(draftKey({ userId, form, context }));
  } catch {
    // a key that cannot be built names no stored draft
  }
}

// This user's drafts of `form` that were OPEN when last saved — the forms a
// reload should bring back — newest first.
export function findOpenDrafts({ userId, form }, store = sessionDrafts) {
  let prefix;
  try {
    prefix = userKeyPrefix(userId);
  } catch {
    return [];
  }
  return store
    .keys()
    .filter((k) => k.startsWith(prefix))
    .map((k) => ({ context: contextOfKey(k, userId, form), raw: store.read(k) }))
    .filter((d) => d.context !== null)
    .map((d) => ({ context: d.context, record: decodeDraft(d.raw, form) }))
    .filter((d) => d.record && d.record.open)
    .sort((a, b) => b.record.savedAt - a.record.savedAt);
}

// A deliberate logout: every draft in this tab, whoever's and whatever
// version, is removed. A 401 does NOT call this — a session that expired
// keeps its drafts for the same account to sign back in to.
export function clearAllDrafts(store = sessionDrafts) {
  store
    .keys()
    .filter(isDraftKey)
    .forEach((k) => store.remove(k));
}
