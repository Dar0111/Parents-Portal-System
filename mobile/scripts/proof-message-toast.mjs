// PROOF — the new-message toast on the phone (feat/message-toast,
// 2026-10-02; MOBILE_CONVENTIONS M22). Drives the MIRRORED
// realtime/messageToast.js the way the phone uses it: the decisions, never
// the body, and "in that conversation" read from a REAL nested navigation
// state — the root stack's Home → AppShell's stack → the drawer or the
// MessageThread screen with params.otherId.
//
// WHAT IT CANNOT: the socket, the Alert-free toast on screen, the timer, the
// announcement, View through the leave guard, and whether the phone's ringer
// really silences the tone — the phone check. It DOES prove the order the
// silent-mode gate depends on: no tone before the audio mode has resolved.
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-message-toast.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TONE, createToastStore, nextToast, otherIdFromRoute, rowFor, toastLabel } from '../src/realtime/messageToast.js';
import { VIBRATE_MS, alertOnToast, createAudioModeGate, createGatedPlay } from '../src/realtime/toastAlert.js';
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
  assert(!admin.played && !admin.vibrated && calls.play === 3, 'a role with no Messages screen (none since 2026-10-05; the admin has one now): neither, even on a change');
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

// ---- Fix round B9 (2026-10-02): the silent-mode gate ----

console.log('the silent-mode gate — no tone before the audio mode has resolved');
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason));
const flush = () => new Promise((resolve) => setImmediate(resolve));
{
  let release;
  let modeCalls = 0;
  const gate = createAudioModeGate(() => {
    modeCalls += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  let tones = 0;
  const vibrations = [];
  const fakes = { enabled: true, play: createGatedPlay(gate, () => (tones += 1)), vibrate: (ms) => vibrations.push(ms) };
  gate.ready(); // the host starts it on mount
  alertOnToast(true, fakes);
  await flush();
  assert(tones === 0 && vibrations.length === 1, 'the mode is still pending: NO tone yet — and the vibration did not wait');
  release();
  await flush();
  assert(tones === 1, 'the mode resolved: the waiting tone plays');
  alertOnToast(true, fakes);
  await flush();
  assert(tones === 2 && modeCalls === 1, 'the next alert: the same promise — the mode is set ONCE, no second call');
}
{
  let modeCalls = 0;
  const errors = [];
  const gate = createAudioModeGate(
    () => {
      modeCalls += 1;
      return modeCalls === 1 ? Promise.reject(new Error('mode refused')) : Promise.resolve();
    },
    { onError: (error) => errors.push(error.message) }
  );
  let tones = 0;
  const vibrations = [];
  const fakes = { enabled: true, play: createGatedPlay(gate, () => (tones += 1)), vibrate: (ms) => vibrations.push(ms) };
  gate.ready(); // on mount — rejected
  await flush();
  assert(errors.length === 1 && errors[0] === 'mode refused' && tones === 0, 'a rejected mode is reported once, and nothing plays');
  alertOnToast(true, fakes);
  await flush();
  assert(modeCalls === 2 && tones === 1 && vibrations.length === 1, 'the next alert RETRIES the mode; it resolves, and that alert has its tone');
}
{
  let modeCalls = 0;
  const errors = [];
  const gate = createAudioModeGate(
    () => {
      modeCalls += 1;
      return Promise.reject(new Error(`refused ${modeCalls}`));
    },
    { onError: (error) => errors.push(error.message) }
  );
  let tones = 0;
  const vibrations = [];
  const fakes = { enabled: true, play: createGatedPlay(gate, () => (tones += 1)), vibrate: (ms) => vibrations.push(ms) };
  for (let i = 0; i < 3; i += 1) {
    alertOnToast(true, fakes);
    await flush();
  }
  assert(modeCalls === 2 && errors.length === 2, 'a mode that keeps failing is tried TWICE in all (once + one retry), never a third time');
  assert(tones === 0 && vibrations.length === 3, 'with no mode there is no tone — every alert still vibrates');
}
{
  const gate = createAudioModeGate(() => {
    throw new Error('expo-audio missing');
  }, {
    onError: () => {
      throw new Error('the report itself failed');
    },
  });
  const play = createGatedPlay(gate, () => {
    throw new Error('player not loaded');
  });
  let threw = false;
  let result = null;
  let settled = 'pending';
  try {
    result = alertOnToast(true, { enabled: true, play, vibrate: () => {} });
    play().then(
      () => (settled = 'resolved'),
      () => (settled = 'rejected')
    );
  } catch {
    threw = true;
  }
  await flush();
  const okGate = createAudioModeGate(() => Promise.resolve());
  const throwingPlay = createGatedPlay(okGate, () => {
    throw new Error('player not loaded');
  });
  let settled2 = 'pending';
  throwingPlay().then(
    () => (settled2 = 'resolved'),
    () => (settled2 = 'rejected')
  );
  await flush();
  assert(!threw && result?.vibrated && settled === 'resolved' && settled2 === 'resolved', 'a throwing mode, report or player: play never throws and never rejects');
  assert(unhandled.length === 0, 'and no unhandled rejection anywhere in this proof');
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
  wav && wav.length === 15920 && dataBytes === 15876 && (dataBytes / 2 / SAMPLE_RATE) * 1000 === 360,
  '15 920 bytes: 44 + 2 × 7 938 samples — exactly 360 ms at 22 050 Hz'
);
let loudest = 0;
for (let i = 44; wav && i < wav.length; i += 2) loudest = Math.max(loudest, Math.abs(wav.readInt16LE(i)));
assert(wav && loudest / 32767 <= 0.26 && loudest < 32767, `the loudest sample is ${(loudest / 32767).toFixed(4)} of full scale — at most 0.26 (a note and its octave, 0.125 each), no clipping`);
assert(
  TONE.totalMs === 360 && TONE.attackMs === 6 && TONE.floor === 0.0001 &&
    TONE.voices.length === 4 && TONE.voices[0].freqHz === 587 && TONE.voices[1].freqHz === 880 && TONE.voices.every((v) => v.peak === 0.125),
  'TONE is "two-note rise" — 587 Hz 0–140 ms, 880 Hz 80–360 ms, each with its octave, peak 0.125, 6 ms attack — the web\'s numbers'
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
assert(
  /^const audioMode = createAudioModeGate\(\s*\(\) => setAudioModeAsync\(/m.test(toastSrc) &&
    /createGatedPlay\(audioMode, /.test(toastSrc) &&
    /play: playTone,/.test(toastSrc) &&
    (toastSrc.match(/setAudioModeAsync\(/g) || []).length === 1,
  'the mode is ONE module-level gate; the tone plays only through createGatedPlay(audioMode, …)'
);
assert(
  /if \(__DEV__\) console\.warn\('\[message-tone\] /.test(toastSrc) && (toastSrc.match(/console\./g) || []).length === 1,
  'the failure is reported by one console.warn, inside `if (__DEV__)`'
);
const appJson = JSON.parse(fs.readFileSync(path.join(here, '..', 'app.json'), 'utf8'));
const plugins = appJson?.expo?.plugins || [];
assert(!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === 'expo-audio'), 'app.json has NO expo-audio config plugin (deliberately not configured)');

// THE LIVE UPDATES STRIP WAITS FOR A REAL FAILURE (fix/socket-handshake fix
// round, R4, 2026-10-11): the MIRRORED realtime/liveState.js driven directly,
// and the phone's two hosts read as source. Each check takes a rule
// { initial, reduce, strip }. CONTROLS: the rule before the fix (the strip
// whenever the socket was not connected, from the first render), a rule that
// ignores a lost connection, and the pre-fix LiveStatus guard.
console.log('\nThe Live updates strip — none before the first connect; shown on a real failure:');
const live = await import('../src/realtime/liveState.js');
const runLive = (rule, events) => events.reduce(rule.reduce, rule.initial);
const FIXED_RULE = { initial: live.INITIAL_LIVE_STATE, reduce: live.nextLiveState, strip: (s) => s === 'paused' };
const noStripWhilePending = (rule) => !rule.strip(rule.initial) && !rule.strip(runLive(rule, ['connect']));
const stripOnFailure = (rule) =>
  rule.strip(runLive(rule, ['connect_error'])) &&
  rule.strip(runLive(rule, ['connect', 'disconnect'])) &&
  rule.strip(runLive(rule, ['grace'])) &&
  !rule.strip(runLive(rule, ['connect', 'disconnect', 'connect'])) &&
  !rule.strip(runLive(rule, ['connect', 'grace']));
assert(noStripWhilePending(FIXED_RULE), 'no strip while the first connect is pending, nor once it connects');
assert(stripOnFailure(FIXED_RULE), 'the strip after a failed attempt, a lost connection (the background drop) or the grace; gone on the reconnect');
assert(live.FIRST_CONNECT_GRACE_MS >= 1000 && live.FIRST_CONNECT_GRACE_MS <= 5000, 'the grace is a few seconds');
const BEFORE_FIX_RULE = {
  initial: 'disconnected',
  reduce: (s, e) => (e === 'connect' ? 'live' : e === 'grace' ? s : 'disconnected'),
  strip: (s) => s !== 'live',
};
assert(!noStripWhilePending(BEFORE_FIX_RULE), 'negative control: the rule before the fix shows the strip before the first connect');
const IGNORES_LOSS = { ...FIXED_RULE, reduce: (s, e) => (e === 'disconnect' ? s : live.nextLiveState(s, e)) };
assert(!stripOnFailure(IGNORES_LOSS), 'negative control: a rule that ignores a lost connection fails the failure check');
const providerSrc = fs.readFileSync(path.join(here, '..', 'src', 'realtime', 'SocketProvider.jsx'), 'utf8');
const stripSrc = fs.readFileSync(path.join(here, '..', 'src', 'realtime', 'LiveStatus.jsx'), 'utf8');
const hostsWired = (p, s) =>
  /setTimeout\(\(\) => dispatchLive\('grace'\), FIRST_CONNECT_GRACE_MS\)/.test(p) &&
  /socket\.on\('connect', \(\) => \{\s*dispatchLive\('connect'\);/.test(p) &&
  ['disconnect', 'connect_error'].every((e) => p.includes(`socket.on('${e}', () => dispatchLive('${e}'))`)) &&
  /clearTimeout\(grace\)/.test(p) &&
  /dispatchLive\('reset'\)/.test(p) &&
  /if \(!paused\) return null;/.test(s) &&
  !/if \(connected\) return null;/.test(s);
assert(hostsWired(providerSrc, stripSrc), 'SocketProvider feeds the rule its three events and the grace; LiveStatus shows the strip on paused only');
assert(
  !hostsWired(providerSrc, stripSrc.replace('if (!paused) return null;', 'if (connected) return null;')),
  'negative control: the pre-fix LiveStatus guard fails it'
);

console.log(`\nproof-message-toast: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
