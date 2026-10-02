// THE PHONE'S ALERT FOR A NEW-MESSAGE TOAST (fix round on feat/message-toast,
// 2026-10-02; MOBILE_CONVENTIONS M22). Phone-only — the web plays its tone
// through realtime/messageTone.js and has no vibration.
//
// Pure: `play` and `vibrate` are passed in, so proof-message-toast drives it
// with fakes. The host passes the expo-audio player's play — through the
// silent-mode gate below — and React Native's Vibration. `play` may return a
// promise; the vibration never waits for it.
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

// THE SILENT-MODE GATE (fix round B9, 2026-10-02). expo-audio refuses
// `play()` on Android while the ringer is silent or vibrate-only — but only
// once `setAudioModeAsync({ playsInSilentMode: false })` has RESOLVED; its
// native default is `true`. So the tone never plays before the mode is set:
//
//   createAudioModeGate(setMode, { onError })
//     ready()  the ONE promise of the mode (true = set, false = failed). The
//              first call starts it; every later call returns the same
//              promise, so after the first time there is no extra wait.
//              A failure reports through `onError` and is RETRIED ONCE, by
//              the next ready() — the next alert. A second failure stays
//              false: no more tries, and no tone for this session.
//
//   createGatedPlay(gate, playNow)
//     an async `play` for alertOnToast: awaits the gate, then plays only
//     when the mode is set. Never throws and never rejects.
//
// DND is NOT covered: expo-audio reads the ringer mode, never the
// interruption filter (KNOWN_ISSUES; M22).
export function createAudioModeGate(setMode, { onError } = {}) {
  let promise = null;
  let failures = 0;
  const attempt = () => {
    promise = Promise.resolve()
      .then(() => setMode())
      .then(
        () => true,
        (error) => {
          failures += 1;
          if (typeof onError === 'function') {
            try {
              onError(error);
            } catch {
              // A report that fails changes nothing.
            }
          }
          // One retry, on the next alert; after that the answer stays false.
          if (failures <= 1) promise = null;
          return false;
        }
      );
    return promise;
  };
  return { ready: () => promise ?? attempt() };
}

export function createGatedPlay(gate, playNow) {
  return async function playWhenModeIsSet() {
    try {
      const modeSet = await gate.ready();
      if (modeSet) playNow();
    } catch {
      // The tone failed: silent, by design.
    }
  };
}

export function alertOnToast(changed, { enabled, play, vibrate }) {
  const result = { played: false, vibrated: false };
  if (!changed || !enabled) return result;
  try {
    const pending = play();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
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
