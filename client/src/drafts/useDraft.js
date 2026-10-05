import { useCallback, useEffect, useRef } from 'react';
import { SAVE_DELAY_MS, draftKey, sameValues } from './draftCore';
import { clearDraft, closeDraft, loadDraft, saveDraft } from './sessionDrafts';

// TEXT THAT IS EMPTY AFTER TRIMMING IS NOT A DRAFT (build 1 follow-up,
// 2026-10-05). The owner held Enter on a sent message; the repeats typed blank
// lines into the emptied box, they were saved, and a reload announced "Draft
// restored" over an empty-looking box. So a form whose every TEXT field is
// empty after trimming is never saved, and whatever is stored under its key
// goes. The text fields per form — a picker or a date (an announcement's
// target, an excuse letter's absence date, an event's date and grade) is not
// typed text, so a picked date alone is not a draft. The phone's hook
// (mobile/src/drafts/useDraft.js) holds the same list.
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

// FORM DRAFTS ON THE WEB — the autosave hook (feat/form-drafts, 2026-10-04).
//
// While `active` (the modal is open, the composer is on screen), every change
// to `values` is written SAVE_DELAY_MS after the last one, marked OPEN so a
// reload brings the form back. A pending write is flushed at once when the
// page is hidden or left (`pagehide`, `visibilitychange`) and when the
// component unmounts, so a reload a moment after typing still keeps it.
//
// The hook never sets React state — it only writes storage — so it adds no
// effect that re-renders anything. Restoring a draft is the form's own job
// (it knows when its list and its targets have loaded).
//
//   close()      the form is closing: the draft is KEPT, marked closed.
//   discard()    the person confirmed Discard draft: the draft is removed.
//   submitted()  the server confirmed the write: the draft is removed, and
//                the values just sent are not written again as the form
//                closes or empties.
export function useDraftAutosave({ userId, form, context, values, base = null, active, fromThread = null }) {
  const timer = useRef(null);
  const pending = useRef(null);
  const suppressed = useRef(null);

  // A blank form is not saved: its key is cleared instead (the rule above).
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (isBlankDraft(p.form, p.values)) clearDraft(p);
    else saveDraft(p);
  }, []);

  useEffect(() => {
    if (!active || !userId || !context) return;
    let key;
    try {
      key = draftKey({ userId, form, context });
    } catch {
      return;
    }
    // Another form's or another conversation's write still waiting: write it
    // now, under its own key, before this one takes its place.
    if (pending.current && pending.current.key !== key) flush();
    if (suppressed.current && suppressed.current.key === key && sameValues(form, suppressed.current.values, values)) return;
    suppressed.current = null;
    pending.current = { key, userId, form, context, values, base, open: true, fromThread };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [active, userId, form, context, values, base, fromThread, flush]);

  useEffect(() => {
    function onPageHide() {
      flush();
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') flush();
    }
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  const close = useCallback(() => {
    if (pending.current) {
      pending.current = { ...pending.current, open: false };
      flush();
      return;
    }
    if (!userId || !context) return;
    // A blank draft stored before the rule is removed, not kept as closed.
    const stored = loadDraft({ userId, form, context });
    if (stored && isBlankDraft(form, stored.values)) clearDraft({ userId, form, context });
    else closeDraft({ userId, form, context });
  }, [userId, form, context, flush]);

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    if (userId && context) clearDraft({ userId, form, context });
  }, [userId, form, context]);

  const submitted = useCallback(
    (sentValues) => {
      clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      if (!userId || !context) return;
      clearDraft({ userId, form, context });
      try {
        suppressed.current = { key: draftKey({ userId, form, context }), values: sentValues };
      } catch {
        suppressed.current = null;
      }
    },
    [userId, form, context]
  );

  return { close, discard, submitted };
}
