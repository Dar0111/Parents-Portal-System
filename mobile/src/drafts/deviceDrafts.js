import { decodeDraft, draftKey, encodeDraft, isDraftKey } from './draftCore';

// FORM DRAFTS ON THE PHONE — the storage half (feat/form-drafts, 2026-10-04).
//
// PURE: the storage is passed in (AsyncStorage in the app, a fake in
// scripts/proof-form-drafts.mjs), so this file imports nothing native and a
// proof can load it in Node — api/client.js's shape. A draft lives on the
// device until the server confirms the submit, a confirmed Discard draft or a
// deliberate logout; a killed app keeps it, and the form brings it back when
// it is opened again (no reopening on launch — MOBILE M25). Every call
// swallows a storage failure: then nothing is kept and nothing claims it was.
//
// The phone stores no OPEN flag: nothing reopens on its own.
export function createDeviceDrafts(storage) {
  function keyOf(target) {
    try {
      return draftKey(target);
    } catch {
      return null;
    }
  }

  async function load({ userId, form, context }) {
    const key = keyOf({ userId, form, context });
    if (!key) return null;
    try {
      return decodeDraft(await storage.getItem(key), form);
    } catch {
      return null;
    }
  }

  // Writes the draft, or removes it when there is nothing worth keeping (the
  // values equal what the form opened with). Resolves to whether one is kept.
  async function save({ userId, form, context, values, base = null, fromThread = null }) {
    const key = keyOf({ userId, form, context });
    if (!key) return false;
    const text = encodeDraft({ form, values, base, open: false, fromThread, savedAt: Date.now() });
    try {
      if (text === null) {
        await storage.removeItem(key);
        return false;
      }
      await storage.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }

  async function clear({ userId, form, context }) {
    const key = keyOf({ userId, form, context });
    if (!key) return;
    try {
      await storage.removeItem(key);
    } catch {
      // a store that cannot be written holds nothing we would show
    }
  }

  // A deliberate logout: every draft on the device, whoever's and whatever
  // version. A 401 does NOT call this.
  async function clearAll() {
    try {
      const keys = await storage.getAllKeys();
      const drafts = keys.filter(isDraftKey);
      if (drafts.length) await storage.multiRemove(drafts);
    } catch {
      // nothing more to do
    }
  }

  return { load, save, clear, clearAll };
}
