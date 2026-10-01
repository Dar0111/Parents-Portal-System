// THE PHONE'S ALERT FOR A NEW-MESSAGE TOAST (fix round on feat/message-toast,
// 2026-10-02; MOBILE_CONVENTIONS M22). Phone-only — the web plays its tone
// through realtime/messageTone.js and has no vibration.
//
// Pure: `play` and `vibrate` are passed in, so proof-message-toast drives it
// with fakes. The host passes the expo-audio player's play and React Native's
// Vibration.
//
//   changed  createToastStore().receive(...) — true is exactly a toast SHOW or
//            UPDATE (same-sender count, or a different sender replacing); a
//            skip (my own message, the open conversation, nothing unread)
//            is false and alerts nothing.
//   enabled  the role has a Messages screen; an admin never alerts.
//
// THE SOUND IS TRIED FIRST AND MAY FAIL SILENTLY: a player that is not
// loaded, or throws, must not stop the vibration or the toast. One alert per
// show / update — no repeats.
export const VIBRATE_MS = 150;

export function alertOnToast(changed, { enabled, play, vibrate }) {
  const result = { played: false, vibrated: false };
  if (!changed || !enabled) return result;
  try {
    play();
    result.played = true;
  } catch {
    // The tone failed: silent, by design.
  }
  try {
    vibrate(VIBRATE_MS);
    result.vibrated = true;
  } catch {
    // A phone that cannot vibrate still shows the toast.
  }
  return result;
}
