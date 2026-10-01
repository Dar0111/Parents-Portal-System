// PROOF — feat/message-toast (2026-10-02): the new-message toast.
//
// Two parts:
//   1. realtime/messageToast.js (pure, mirrored to the phone) driven directly:
//      the words, the server's count, never my own, never in that
//      conversation, the newest sender replacing, and NEVER THE BODY — the
//      conversations row the toast reads carries `last_message_body`, so
//      every case below has one, and none of it may reach the output.
//   2. The toast RENDERED (MessageToastView): the live region is mounted
//      while empty, the label, View and Dismiss as named buttons, no body.
//
// WHAT IT CANNOT: the socket, the 5-second timer, hover / focus pausing, a
// click on View through the leave guard — the owner check with two accounts.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-message-toast.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-message-toast.js

import { renderToStaticMarkup } from 'react-dom/server';
import { MessageToastView } from '../src/realtime/MessageToast.jsx';
import fs from 'node:fs';
import path from 'node:path';
import {
  TONE,
  TOAST_MS,
  createToastStore,
  nextToast,
  otherIdFromPath,
  otherIdFromRoute,
  rowFor,
  toastLabel,
} from '../src/realtime/messageToast.js';
import { createTonePlayer } from '../src/realtime/messageTone.js';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

const SECRET = 'SECRET-BODY-7f3a';
// The shape GET /api/messages/conversations returns (messages.js:124-131),
// body included, because the real row carries it.
const ANA = { other_user_id: 3, other_user_name: 'Ashley Geguiera', other_user_profile_pic: null, last_message_body: SECRET, unread_count: 1 };
const ANA3 = { ...ANA, unread_count: 3 };
const LIG = { other_user_id: 647, other_user_name: 'Ligaya Halimbawa', other_user_profile_pic: null, last_message_body: SECRET, unread_count: 1 };
const SELF = 2;
const noBody = (value) => !JSON.stringify(value ?? null).includes(SECRET);

console.log('The words');
assert(toastLabel('Ashley Geguiera', 1) === 'New message from Ashley Geguiera', 'one: "New message from <name>"');
assert(toastLabel('Ashley Geguiera', 3) === '3 new messages from Ashley Geguiera', 'several: "<n> new messages from <name>"');
assert(TOAST_MS === 5000, 'five seconds');

console.log('The row and the open conversation');
assert(rowFor([LIG, ANA], '3') === ANA && rowFor([LIG], 3) === null && rowFor(null, 3) === null, 'rowFor finds that person by id, string or number; null otherwise');
assert(otherIdFromPath('/teacher/messages/3') === 3 && otherIdFromPath('/parent/messages/647/') === 647, 'a thread URL names the OTHER person (teacher and parent)');
assert(
  otherIdFromPath('/teacher/messages') === null && otherIdFromPath('/admin/messages/3') === null && otherIdFromPath('/teacher/grades') === null,
  'the list page, admin and every other page are not a conversation'
);
const threadState = {
  index: 0,
  routes: [{ name: 'Home', state: { index: 1, routes: [{ name: 'Main' }, { name: 'MessageThread', params: { otherId: 3, name: 'Ashley' } }] } }],
};
const behindState = {
  index: 0,
  routes: [{ name: 'Home', state: { index: 0, routes: [{ name: 'Main' }, { name: 'MessageThread', params: { otherId: 3 } }] } }],
};
assert(otherIdFromRoute(threadState) === 3, 'phone: the FOCUSED MessageThread names the other person');
assert(otherIdFromRoute(behindState) === null, 'phone: a thread lower in the stack, not focused, is not "in that conversation"');

console.log('The decisions');
const base = { selfId: SELF, viewingOtherId: null };
const first = nextToast(null, { ...base, senderId: 3, row: ANA });
assert(first.changed && first.toast.label === 'New message from Ashley Geguiera' && first.toast.senderId === 3, 'a message from Ashley shows "New message from Ashley Geguiera"');
const own = nextToast(first.toast, { ...base, senderId: SELF, row: { ...ANA, other_user_id: SELF } });
assert(!own.changed && own.toast === first.toast, 'never for my own message — the toast on screen is left exactly as it was');
const inThread = nextToast(null, { ...base, senderId: 3, viewingOtherId: 3, row: ANA });
assert(!inThread.changed && inThread.toast === null, 'never while I am in that conversation');
const otherThread = nextToast(null, { ...base, senderId: 3, viewingOtherId: 647, row: ANA });
assert(otherThread.changed, "in SOMEONE ELSE's conversation it still shows");
const more = nextToast(first.toast, { ...base, senderId: 3, row: ANA3 });
assert(more.changed && more.toast.count === 3 && more.toast.label === '3 new messages from Ashley Geguiera', 'the same person again: one toast, the SERVER\'s count (3)');
const replaced = nextToast(more.toast, { ...base, senderId: 647, row: LIG });
assert(replaced.changed && replaced.toast.senderId === 647 && replaced.toast.label === 'New message from Ligaya Halimbawa', 'a different person replaces it — never a stack');
assert(!nextToast(null, { ...base, senderId: 3, row: { ...ANA, unread_count: 0 } }).changed, 'already read (unread 0): nothing');
assert(!nextToast(null, { ...base, senderId: 3, row: null }).changed && !nextToast(null, { ...base, senderId: 3, row: { ...ANA, other_user_name: ' ' } }).changed, 'no row, or no name: nothing — never "from undefined"');
assert([first, more, replaced, otherThread].every((r) => noBody(r.toast)), 'NO PART OF THE BODY in any toast, though every row carried one');

console.log('Rendered');
const empty = renderToStaticMarkup(<MessageToastView toast={null} />);
assert(/role="status"/.test(empty) && /aria-live="polite"/.test(empty), 'the live region is mounted while EMPTY (announced when text arrives)');
assert(!/<button/.test(empty), 'and holds nothing until there is a toast');
const shown = renderToStaticMarkup(<MessageToastView toast={more.toast} />);
assert(shown.includes('3 new messages from Ashley Geguiera'), 'the label is on screen');
assert(/<button[^>]*>View<\/button>/.test(shown), 'View is a button');
assert(/<span class="sr-only">Dismiss<\/span>/.test(shown) && /fa-xmark/.test(shown), 'the close button is named "Dismiss"');
assert(!shown.includes(SECRET), 'no body in the markup');
assert(/bg-surface/.test(shown) && /border-edge/.test(shown) && /bg-primary/.test(shown), 'tokens only — it follows any restyle');

// ---- The fix round (2026-10-02): the tone, and a toast that is never stale ----

// A fake AudioContext that records what the tone does with it.
function fakeAudio({ resumeRejects = false, ctorThrows = false } = {}) {
  const log = { made: 0, resumes: 0, starts: 0, freqs: [], gains: [], ramps: [], startAt: [], stopAt: [] };
  class FakeContext {
    constructor() {
      if (ctorThrows) throw new Error('no audio here');
      log.made += 1;
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      log.resumes += 1;
      return resumeRejects ? Promise.reject(new Error('autoplay policy')) : Promise.resolve();
    }
    createOscillator() {
      return {
        type: '',
        frequency: { setValueAtTime: (v) => log.freqs.push(v) },
        connect() {},
        start: (t) => {
          log.starts += 1;
          log.startAt.push(t);
        },
        stop: (t) => log.stopAt.push(t),
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: (v, t) => log.ramps.push(['set', v, t]),
          linearRampToValueAtTime: (v, t) => log.ramps.push(['linear', v, t]),
          exponentialRampToValueAtTime: (v, t) => log.ramps.push(['exponential', v, t]),
        },
        connect() {},
      };
    }
  }
  return { log, Ctor: FakeContext };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

console.log('The tone (one AudioContext, on a show or an update only)');
assert(
  TONE.totalMs === 400 && TONE.attackMs === 3 && TONE.floor === 0.0001 && TONE.stopPadMs === 20 &&
    JSON.stringify(TONE.voices) ===
      JSON.stringify([
        { freqHz: 1047, startMs: 0, durationMs: 150, peak: 0.22 },
        { freqHz: 784, startMs: 100, durationMs: 300, peak: 0.22 },
      ]),
  'TONE is "two-tone down": 1047 Hz 0–150 ms and 784 Hz 100–400 ms, peak 0.22, 3 ms attack, floor 0.0001 (shared with the phone)'
);
{
  const audio = fakeAudio();
  const tone = createTonePlayer(() => audio.Ctor);
  const shown = [];
  const store = createToastStore((t) => shown.push(t));
  // What the host does on every conversations re-read: decide, then sound on a change.
  const deliver = (ctx) => {
    const changed = store.receive({ ...base, ...ctx });
    if (changed) tone.play();
    return changed;
  };
  assert(audio.log.made === 0, 'no AudioContext until the first tone (created lazily)');
  deliver({ senderId: 3, row: ANA }); // show
  deliver({ senderId: 3, row: ANA3 }); // same-sender update
  deliver({ senderId: 647, row: LIG }); // replace
  deliver({ senderId: SELF, row: { ...LIG, other_user_id: SELF } }); // own: skip
  deliver({ senderId: 3, viewingOtherId: 3, row: ANA3 }); // open conversation: skip
  await flush();
  assert(audio.log.starts === 6, 'a tone on the show, the update and the replace — three tones of two voices, no more', `${audio.log.starts}`);
  assert(audio.log.made === 1, 'ONE AudioContext, reused for every tone', `${audio.log.made}`);
  assert(audio.log.resumes === 3, 'resume() before every tone');
  const oneTone = audio.log.ramps.slice(0, 6);
  assert(
    JSON.stringify(audio.log.freqs.slice(0, 2)) === '[1047,784]' &&
      JSON.stringify(oneTone) ===
        JSON.stringify([
          ['set', 0.0001, 0],
          ['linear', 0.22, 0.003],
          ['exponential', 0.0001, 0.15],
          ['set', 0.0001, 0.1],
          ['linear', 0.22, 0.10300000000000001],
          ['exponential', 0.0001, 0.4],
        ]),
    'each tone: 1047 Hz then 784 Hz, each from 0.0001 a LINEAR rise to 0.22 in 3 ms, then an EXPONENTIAL decay to 0.0001 at its end'
  );
  assert(
    JSON.stringify(audio.log.startAt.slice(0, 2)) === '[0,0.1]' && Math.abs(audio.log.stopAt[0] - 0.17) < 1e-9 && Math.abs(audio.log.stopAt[1] - 0.42) < 1e-9,
    'voice 1 starts at 0 and stops at 170 ms, voice 2 starts at 100 ms and stops at 420 ms (end + 20 ms)'
  );
}
{
  const blocked = fakeAudio({ resumeRejects: true });
  const tone = createTonePlayer(() => blocked.Ctor);
  let threw = false;
  try {
    tone.play();
  } catch {
    threw = true;
  }
  await flush();
  assert(!threw && blocked.log.starts === 0, 'autoplay refused (resume rejects): silent, nothing thrown');
  const broken = fakeAudio({ ctorThrows: true });
  const none = createTonePlayer(() => broken.Ctor);
  const noAudio = createTonePlayer(() => null);
  let thrown = false;
  let results = [];
  try {
    results = [none.play(), noAudio.play()];
  } catch {
    thrown = true;
  }
  assert(!thrown && results.every((r) => r === false), 'a constructor that throws, or no Web Audio at all: false, never a throw');
  const store = createToastStore(() => {});
  const changed = store.receive({ ...base, senderId: 3, row: ANA });
  if (changed) none.play();
  assert(changed && store.get().label === 'New message from Ashley Geguiera', 'with the audio broken, the toast still shows');
}

console.log('The toast is never stale (× close, expiry)');
{
  const seen = [];
  const store = createToastStore((t) => seen.push(t));
  store.receive({ ...base, senderId: 3, row: ANA3 });
  assert(store.get()?.count === 3, 'shown: 3 new messages');
  store.clear(); // ×
  assert(store.get() === null && seen[seen.length - 1] === null, '× clears the store AND tells the host');
  const again = store.receive({ ...base, senderId: 3, row: ANA });
  assert(again && store.get().label === 'New message from Ashley Geguiera', 'after ×, the next message from the same person shows again: "New message from Ashley Geguiera"');
  store.clear(); // the 5 s expiry calls the same clear()
  const later = store.receive({ ...base, senderId: 3, row: ANA3 });
  assert(later && store.get().label === '3 new messages from Ashley Geguiera', 'after the expiry, the server count as before: "3 new messages from Ashley Geguiera"');
}

console.log('Admin never mounts the toast (source text, Shell.jsx)');
const shell = fs.readFileSync(path.resolve('src/layout/Shell.jsx'), 'utf8');
assert(/\{messagesBuilt \? <MessageToast \/> : null\}/.test(shell), 'Shell mounts MessageToast only where Messages is built — no toast, no tone for admin');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
