import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { SAVE_DELAY_MS, draftKey, sameValues } from './draftCore';
import { createDeviceDrafts } from './deviceDrafts';

// FORM DRAFTS ON THE PHONE — the hook (feat/form-drafts, 2026-10-04; MOBILE
// M25). AsyncStorage is the store the app already uses for `pp.theme`; no new
// package.
export const deviceDrafts = createDeviceDrafts(AsyncStorage);

// TEXT THAT IS EMPTY AFTER TRIMMING IS NOT A DRAFT (build 1 follow-up,
// 2026-10-05), the web hook's rule (client/src/drafts/useDraft.js, the same
// list): a form whose every TEXT field is empty after trimming is never saved,
// a draft stored under its key is cleared, and a blank one kept from before
// is neither restored nor announced — the form gets null, as when nothing was
// kept. A picker or a date is not typed text.
export const DRAFT_TEXT_FIELDS = Object.freeze({
  excuse: Object.freeze(['reason', 'details']),
  message: Object.freeze(['body']),
  announcement: Object.freeze(['title', 'content', 'category']),
  memo: Object.freeze(['title', 'content']),
  event: Object.freeze(['title', 'description']),
});

export function isBlankDraft(form, values) {
  const fields = DRAFT_TEXT_FIELDS[form];
  if (!fields) return false;
  if (!values) return true;
  return fields.every((field) => typeof values[field] !== 'string' || values[field].trim() === '');
}

function keyOf(target) {
  try {
    return draftKey(target);
  } catch {
    return null;
  }
}

// One form's draft on this phone.
//
//   - READ ONCE per key, when the form opens: `onRestore(record, { saveNow })`
//     is called with the kept draft, or with null when there is none — the
//     form decides what to show (a compose screen ignores null; a thread
//     empties its box). `saveNow` writes what the form holds at once (the
//     hand-off's "Use this message", which replaces a saved draft).
//   - WRITTEN SAVE_DELAY_MS after the last change, but only after that read
//     has answered — so the form's opening values can never overwrite a kept
//     draft before it is restored. When the read finds nothing, what the form
//     already holds (a thread's hand-off text) is written then. A pending
//     write is flushed at once when the app leaves the foreground (AppState)
//     and when the screen unmounts (Close, Back), so a killed app a moment
//     after typing still keeps it.
//
//   discard()          a confirmed Discard draft: the draft is removed.
//   submitted(values)  the server confirmed: the draft is removed, and the
//                      values just sent are not written again on unmount.
//
// The hook sets no React state of its own; `onRestore` runs after an await.
export function useDeviceDraft({ userId, form, context, values, base = null, active = true, fromThread = null, onRestore }) {
  const timer = useRef(null);
  const pending = useRef(null);
  const suppressed = useRef(null);
  const readyKey = useRef(null);
  const restoreRef = useRef(onRestore);
  const latest = useRef(null);
  const key = userId && context ? keyOf({ userId, form, context }) : null;

  // The newest render's inputs, for writes started outside a render (the
  // read's answer, an Alert's button). Declared first, so it is current
  // before the effects below run.
  useEffect(() => {
    restoreRef.current = onRestore;
    latest.current = { key, userId, form, context, values, base, fromThread, active };
  });

  // A blank form is not saved: its key is cleared instead (the rule above).
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (isBlankDraft(p.form, p.values)) deviceDrafts.clear(p);
    else deviceDrafts.save(p);
  }, []);

  const schedule = useCallback(() => {
    const l = latest.current;
    if (!l || !l.active || !l.key || readyKey.current !== l.key) return;
    // Another conversation's write still waiting: write it now, under its key.
    if (pending.current && pending.current.key !== l.key) flush();
    if (suppressed.current && suppressed.current.key === l.key && sameValues(l.form, suppressed.current.values, l.values)) return;
    suppressed.current = null;
    pending.current = { key: l.key, userId: l.userId, form: l.form, context: l.context, values: l.values, base: l.base, fromThread: l.fromThread };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    readyKey.current = null;
    deviceDrafts.load({ userId, form, context }).then((stored) => {
      if (cancelled) return;
      readyKey.current = key;
      // A blank draft kept from before the rule: not restored, not noticed,
      // and removed.
      const record = stored && isBlankDraft(form, stored.values) ? null : stored;
      if (stored && !record) deviceDrafts.clear({ userId, form, context });
      restoreRef.current?.(record, {
        saveNow: () => {
          schedule();
          flush();
        },
      });
      if (!record) schedule();
    });
    return () => {
      cancelled = true;
    };
  }, [key, userId, form, context, schedule, flush]);

  useEffect(() => {
    schedule();
  }, [active, key, values, base, fromThread, schedule]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => {
      sub.remove();
      flush();
    };
  }, [flush]);

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    if (userId && context) deviceDrafts.clear({ userId, form, context });
  }, [userId, form, context]);

  const submitted = useCallback(
    (sentValues) => {
      clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      if (!key) return;
      deviceDrafts.clear({ userId, form, context });
      suppressed.current = { key, values: sentValues };
    },
    [key, userId, form, context]
  );

  return { discard, submitted };
}
