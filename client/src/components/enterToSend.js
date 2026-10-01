// ENTER SENDS, SHIFT+ENTER IS A NEW LINE (fix round on feat/message-toast,
// 2026-10-02; FRONTEND_CONVENTIONS §26). Web only — the phone keeps its
// Send button.
//
// Pure, so ssr-enter-to-send drives it directly. The two Messages thread
// pages call it from the textarea's onKeyDown; when it says yes they call
// `form.requestSubmit()`, which fires the SAME `onSubmit={send}` the Send
// button fires — the same empty / whitespace guard, the same error handling,
// the same blocked state. Nothing here sends anything.
//
// IT REFUSES EXACTLY WHEN THE SEND BUTTON IS DISABLED (`sending ||
// !draft.trim()`), so Enter can never send what the button could not, and
// never twice while a send is in flight.
//
// NOT DURING AN IME COMPOSITION: on a phone keyboard or an input method,
// Enter can confirm a word rather than mean "send". `isComposing` (and the
// legacy keyCode 229 some browsers still report) is that case.
//
// Only a PLAIN Enter sends: Shift+Enter keeps the browser's new line, and
// Ctrl / Alt / Meta+Enter are left alone.
export function shouldSendOnEnter(event, { sending, draft }) {
  if (!event || event.key !== 'Enter') return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return false;
  if (sending) return false;
  return typeof draft === 'string' && draft.trim().length > 0;
}
