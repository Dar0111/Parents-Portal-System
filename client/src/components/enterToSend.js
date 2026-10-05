// ENTER SENDS, SHIFT+ENTER IS A NEW LINE (fix round on feat/message-toast,
// 2026-10-02; FRONTEND_CONVENTIONS §26). Web only — the phone keeps its
// Send button.
//
// Pure, so ssr-enter-to-send drives it directly. The two Messages thread
// pages call `enterKeyAction` from the textarea's onKeyDown; on 'send' they
// call `form.requestSubmit()`, which fires the SAME `onSubmit={send}` the Send
// button fires — the same empty / whitespace guard, the same error handling,
// the same blocked state. Nothing here sends anything.
//
// IT SENDS EXACTLY WHEN THE SEND BUTTON IS ENABLED (`sending ||
// !draft.trim()` disables it), so Enter can never send what the button could
// not, and never twice while a send is in flight.
//
// NOT DURING AN IME COMPOSITION: on a phone keyboard or an input method,
// Enter can confirm a word rather than mean "send". `isComposing` (and the
// legacy keyCode 229 some browsers still report) is that case, and it is left
// to the browser.
//
// Only a PLAIN Enter is ours: Shift+Enter keeps the browser's new line — held
// or not — and Ctrl / Alt / Meta+Enter are left alone.
//
// A PLAIN ENTER NEVER TYPES A NEW LINE (build 1 follow-up, 2026-10-05). It
// sends when it may; otherwise — a held key's auto-repeat (`repeat`), a send
// in flight, nothing but spaces — it does NOTHING, the newline included. The
// owner held Enter on "Test 8": the first press sent, and the repeats, refused
// as sends but not prevented, typed blank lines into the emptied box, which
// then came back after a reload as an empty "Draft restored". So the answer
// has three values, not two:
//
//   'send'   prevent the newline, submit the form
//   'block'  prevent the newline, nothing else
//   null     not ours — the browser does what it does (Shift+Enter, a
//            modifier, an IME composition, any other key)
export function enterKeyAction(event, { sending, draft }) {
  if (!event || event.key !== 'Enter') return null;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return null;
  if (event.repeat || sending) return 'block';
  return typeof draft === 'string' && draft.trim().length > 0 ? 'send' : 'block';
}

// Whether a key press sends — `enterKeyAction`'s 'send', kept for the proof's
// matrix against the Send button.
export function shouldSendOnEnter(event, state) {
  return enterKeyAction(event, state) === 'send';
}
