// PROOF — fix/leave-guard (2026-10-01): the leave guard for the exits that
// are BUTTONS, not links — Log out on the user card and a notification row on
// the web, and on the phone every drawer item, the account card, the bell and
// Logout. layout/leaveGuard.js is the decision and it is pure, so this drives
// it directly: who runs the exit, how many times, and when nothing asks.
//
// WHAT IT CANNOT: a real click. Log out and the bell are buttons inside the
// Shell, and renderToStaticMarkup fires no events — that is the owner check
// (type a score, press Log out, expect "Leave without saving?").
//
// The phone runs the SAME module (a mirror, lint:mirrors) through
// mobile/scripts/proof-leave-guard.mjs.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-leave-guard.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-leave-guard.js

import { hasLeaveGuard, requestLeave, setLeaveGuard } from '../src/layout/leaveGuard.js';

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

// A stand-in page dialog: records each question and hands back the exit it
// was given, so the test can answer Stay (do nothing) or Leave (call it).
function dialog() {
  const asked = [];
  return { asked, ask: (proceed) => asked.push(proceed) };
}

console.log('No page has unsaved work');
{
  let runs = 0;
  assert(!hasLeaveGuard(), 'nothing is registered at start');
  const result = requestLeave(() => {
    runs += 1;
  });
  assert(result === 'proceeded' && runs === 1, 'the exit runs at once, exactly once — Log out logs out as before', `${result}/${runs}`);
}

console.log('A dirty page registers its dialog');
{
  const page = dialog();
  const release = setLeaveGuard(page.ask);
  let runs = 0;
  const result = requestLeave(() => {
    runs += 1;
  });
  assert(hasLeaveGuard(), 'the guard is registered while dirty');
  assert(result === 'asked' && page.asked.length === 1, 'the exit ASKS instead of running');
  assert(runs === 0, 'nothing has run while the question is open');

  // Stay: the dialog closes without calling the exit.
  assert(runs === 0, 'Stay (or Escape, or the backdrop) runs nothing');

  // Leave and discard: the dialog calls the exit — twice, to prove "once".
  page.asked[0]?.();
  page.asked[0]?.();
  assert(page.asked.length === 1 && runs === 1, 'Leave and discard runs the exit exactly once, even if called twice', `${runs}`);

  release();
  assert(!hasLeaveGuard(), 'the cleanup (saved, or unmounted) unregisters');
  let after = 0;
  requestLeave(() => {
    after += 1;
  });
  assert(after === 1, 'after cleanup an exit runs at once again');
}

console.log('StrictMode and replacement');
{
  const page = dialog();
  const first = setLeaveGuard(page.ask);
  first();
  const second = setLeaveGuard(page.ask);
  assert(hasLeaveGuard(), 'register, clean up, register again (StrictMode) leaves exactly one guard');
  requestLeave(() => {});
  assert(page.asked.length === 1, 'and it asks once, not twice');
  second();

  const a = dialog();
  const b = dialog();
  const releaseA = setLeaveGuard(a.ask);
  const releaseB = setLeaveGuard(b.ask);
  requestLeave(() => {});
  assert(b.asked.length === 1 && a.asked.length === 0, 'a second registration replaces the first — one slot, the latest page');
  releaseA();
  assert(hasLeaveGuard(), "a STALE cleanup (A's) does not clear B's guard");
  releaseB();
  assert(!hasLeaveGuard(), "B's own cleanup does");
}

console.log('Inputs that are not dialogs');
{
  const release = setLeaveGuard(null);
  let runs = 0;
  requestLeave(() => {
    runs += 1;
  });
  assert(!hasLeaveGuard() && runs === 1, 'registering null is no guard — the exit runs at once');
  release();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
