// PROOF — the new-message toast on the phone (feat/message-toast,
// 2026-10-02; MOBILE_CONVENTIONS M22). Drives the MIRRORED
// realtime/messageToast.js the way the phone uses it: the decisions, never
// the body, and "in that conversation" read from a REAL nested navigation
// state — the root stack's Home → AppShell's stack → the drawer or the
// MessageThread screen with params.otherId.
//
// WHAT IT CANNOT: the socket, the Alert-free toast on screen, the timer, the
// announcement, View through the leave guard — the phone check.
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-message-toast.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TONE, createToastStore, nextToast, otherIdFromRoute, rowFor, toastLabel } from '../src/realtime/messageToast.js';
import { VIBRATE_MS, alertOnToast } from '../src/realtime/toastAlert.js';
import { SAMPLE_RATE, TONE_PATH, buildToneWav } from './make-message-tone.mjs';

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

const SECRET = 'SECRET-BODY-91c2';
const row = (id, name, unread) => ({ other_user_id: id, other_user_name: name, other_user_profile_pic: null, last_message_body: SECRET, unread_count: unread });
const SELF = 2;

// The shapes React Navigation really builds here (RootNavigator → AppShell →
// RoleDrawer): Home is the root stack's screen; Main holds the drawer.
const drawer = (focused) => ({
  type: 'drawer',
  index: 1,
  routes: [{ name: '/teacher' }, { name: focused }],
});
const stateOn = (stackRoutes, stackIndex) => ({
  type: 'stack',
  index: 0,
  routes: [{ name: 'Home', state: { type: 'stack', index: stackIndex, routes: stackRoutes } }],
});

console.log('in that conversation — read from the navigation state');
const inThread = stateOn([{ name: 'Main', state: drawer('/teacher/messages') }, { name: 'MessageThread', params: { otherId: 3, name: 'Ashley' } }], 1);
assert(otherIdFromRoute(inThread) === 3, 'the FOCUSED MessageThread (Home → stack → thread) is the other person, 3');
const onList = stateOn([{ name: 'Main', state: drawer('/teacher/messages') }], 0);
assert(otherIdFromRoute(onList) === null, 'the Messages list in the drawer is not a conversation');
const behind = stateOn([{ name: 'Main', state: drawer('/teacher/attendance') }, { name: 'MessageThread', params: { otherId: 3 } }], 0);
assert(otherIdFromRoute(behind) === null, 'a thread lower in the stack is not focused — not "in that conversation"');
assert(otherIdFromRoute(undefined) === null && otherIdFromRoute({ routes: [] }) === null, 'no state: null, never a throw');

console.log('the decisions, through the mirror');
const base = { selfId: SELF, viewingOtherId: null };
const a = nextToast(null, { ...base, senderId: 3, row: rowFor([row(3, 'Ashley Geguiera', 1)], 3) });
assert(a.changed && a.toast.label === 'New message from Ashley Geguiera', '"New message from <name>"');
assert(!nextToast(a.toast, { ...base, senderId: SELF, row: row(SELF, 'Me', 1) }).changed, 'never for my own message');
assert(!nextToast(null, { ...base, viewingOtherId: otherIdFromRoute(inThread), senderId: 3, row: row(3, 'Ashley Geguiera', 1) }).changed, 'never while that conversation is the focused screen');
const b = nextToast(a.toast, { ...base, senderId: 3, row: row(3, 'Ashley Geguiera', 2) });
assert(b.changed && b.toast.label === '2 new messages from Ashley Geguiera', 'the same person: one toast with the server\'s count');
const c = nextToast(b.toast, { ...base, senderId: 647, row: row(647, 'Ligaya Halimbawa', 1) });
assert(c.changed && c.toast.senderId === 647, 'another person replaces it');
assert(toastLabel('X', 5) === '5 new messages from X', 'the words for several');
assert([a, b, c].every((r) => !JSON.stringify(r.toast).includes(SECRET)), 'no part of the body, though every row carried one');

// ---- The fix round (2026-10-02): the tone and the vibration ----

console.log('the alert — tone AND vibration, on a show or an update only');
assert(VIBRATE_MS === 150, 'the vibration is 150 ms');
{
  const calls = { play: 0, vibrate: [] };
  const fakes = { enabled: true, play: () => (calls.play += 1), vibrate: (ms) => calls.vibrate.push(ms) };
  const store = createToastStore(() => {});
  const deliver = (ctx) => alertOnToast(store.receive({ ...base, ...ctx }), fakes);
  deliver({ senderId: 3, row: row(3, 'Ashley Geguiera', 1) });
  assert(calls.play === 1 && calls.vibrate.length === 1 && calls.vibrate[0] === 150, 'a show: one tone, one 150 ms vibration');
  deliver({ senderId: 3, row: row(3, 'Ashley Geguiera', 2) });
  assert(calls.play === 2 && calls.vibrate.length === 2, 'a same-sender update: both again');
  deliver({ senderId: 647, row: row(647, 'Ligaya Halimbawa', 1) });
  assert(calls.play === 3 && calls.vibrate.length === 3, 'a replace: both again');
  deliver({ senderId: SELF, row: row(SELF, 'Me', 1) });
  deliver({ senderId: 3, viewingOtherId: 3, row: row(3, 'Ashley Geguiera', 3) });
  assert(calls.play === 3 && calls.vibrate.length === 3, 'my own message, or the open conversation: neither');
  const admin = alertOnToast(true, { ...fakes, enabled: false });
  assert(!admin.played && !admin.vibrated && calls.play === 3, 'admin (no Messages screen): neither, even on a change');
}
{
  const vibrated = [];
  const store = createToastStore(() => {});
  let threw = false;
  let result = null;
  try {
    result = alertOnToast(store.receive({ ...base, senderId: 3, row: row(3, 'Ashley Geguiera', 1) }), {
      enabled: true,
      play: () => {
        throw new Error('player not loaded');
      },
      vibrate: (ms) => vibrated.push(ms),
    });
  } catch {
    threw = true;
  }
  assert(!threw && result && !result.played && result.vibrated && vibrated[0] === 150, 'the tone fails: no throw, and the phone still vibrates');
  assert(store.get()?.label === 'New message from Ashley Geguiera', 'and the toast still shows');
}

console.log('the tone file — generated from the mirrored TONE');
const here = path.dirname(fileURLToPath(import.meta.url));
const wav = fs.existsSync(TONE_PATH) ? fs.readFileSync(TONE_PATH) : null;
assert(wav !== null && path.relative(path.join(here, '..'), TONE_PATH).split(path.sep).join('/') === 'assets/sounds/message-tone.wav', 'assets/sounds/message-tone.wav exists, bundled with the app');
assert(
  wav && wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE' && wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16 && wav.readUInt32LE(24) === SAMPLE_RATE,
  'a PCM WAV: mono, 16-bit, 22 050 Hz'
);
const dataBytes = wav ? wav.readUInt32LE(40) : 0;
assert(
  wav && wav.length === 17684 && dataBytes === 17640 && (dataBytes / 2 / SAMPLE_RATE) * 1000 === 400,
  '17 684 bytes: 44 + 2 × 8 820 samples — exactly 400 ms at 22 050 Hz'
);
let loudest = 0;
for (let i = 44; wav && i < wav.length; i += 2) loudest = Math.max(loudest, Math.abs(wav.readInt16LE(i)));
assert(wav && loudest / 32767 <= 0.44 && loudest < 32767, `the loudest sample is ${(loudest / 32767).toFixed(4)} of full scale — at most 0.44 (two voices of 0.22), no clipping`);
assert(
  TONE.totalMs === 400 && TONE.attackMs === 3 && TONE.floor === 0.0001 &&
    TONE.voices.length === 2 && TONE.voices[0].freqHz === 1047 && TONE.voices[1].freqHz === 784 && TONE.voices.every((v) => v.peak === 0.22),
  'TONE is "two-tone down" — 1047 Hz 0–150 ms, 784 Hz 100–400 ms, peak 0.22, 3 ms attack — the web\'s numbers'
);
assert(wav && Buffer.compare(wav, buildToneWav(TONE).bytes) === 0, 'the WAV is byte for byte what the script makes from TONE (linear attack, exponential decay, voices summed)');

console.log('source text — MessageToast.jsx and app.json (read as files)');
const toastSrc = fs.readFileSync(path.join(here, '..', 'src', 'realtime', 'MessageToast.jsx'), 'utf8');
assert(/import \{ setAudioModeAsync, useAudioPlayer \} from 'expo-audio';/.test(toastSrc), 'the player is expo-audio\'s useAudioPlayer');
assert(/import messageTone from '\.\.\/\.\.\/assets\/sounds\/message-tone\.wav';/.test(toastSrc) && !/https?:\/\//.test(toastSrc), 'the tone is the local asset — no URL anywhere in the file');
assert(
  /setAudioModeAsync\(\{ interruptionMode: 'duckOthers', shouldPlayInBackground: false, playsInSilentMode: false \}\)/.test(toastSrc) && !/interruptionModeAndroid/.test(toastSrc),
  'the audio mode DUCKS other apps, no background playback, no deprecated interruptionModeAndroid'
);
const appJson = JSON.parse(fs.readFileSync(path.join(here, '..', 'app.json'), 'utf8'));
const plugins = appJson?.expo?.plugins || [];
assert(!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-audio'), 'app.json has NO expo-audio config plugin (deliberately not configured)');

console.log(`\nproof-message-toast: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
