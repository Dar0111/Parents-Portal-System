// PROOF — pre-Stage-5 #5b: the Back-button sentinel's state machine.
//
// The browser history is the one thing this proof cannot touch, so the
// machine is pure and the proof drives every transition the page can report,
// asserting the ACTION the page must perform each time. The real Back press
// is the browser check (edit → Back → Stay; Back → Leave; Save → Back leaves
// at once; an in-app link still asks).
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-back-guard.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-back-guard.js

import { INITIAL_GUARD, transition } from '../src/pages/teacher/classRecord/backGuard.js';

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

// Runs a sequence of events from the initial state and returns the actions.
function run(events) {
  let state = INITIAL_GUARD;
  const actions = [];
  for (const event of events) {
    const next = transition(state, event);
    state = next.state;
    actions.push(next.action);
  }
  return { state, actions };
}

console.log('\nThe six transitions:');

// 1. first edit arms the sentinel
{
  const { state, actions } = run(['dirty']);
  assert(actions[0] === 'push' && state.armed, 'the first edit pushes the sentinel (dirty → push)');
}
// 2. Back while dirty asks
{
  const { state, actions } = run(['dirty', 'pop']);
  assert(actions[1] === 'ask' && state.asking && !state.armed, 'a pop while armed asks (pop → ask), the sentinel now consumed');
}
// 3. Stay re-arms
{
  const { state, actions } = run(['dirty', 'pop', 'stay']);
  assert(actions[2] === 'push' && state.armed && !state.asking, 'Stay re-pushes the sentinel (stay → push)');
}
// 4. Leave backs once more
{
  const { state, actions } = run(['dirty', 'pop', 'leave']);
  assert(actions[2] === 'back' && !state.armed && !state.asking, 'Leave goes back once more, past the real previous entry (leave → back)');
}
// 5. clean consumes the sentinel silently
{
  const { state, actions } = run(['dirty', 'clean']);
  assert(actions[1] === 'back' && !state.armed, 'a save or discard consumes the sentinel with one back (clean → back)');
}
// 6. a pop while clean does nothing — including the pop the machine's own back() causes
{
  const { actions } = run(['dirty', 'clean', 'pop']);
  assert(actions[2] === 'none', 'the pop caused by that back() is ignored (pop while clean → none)');
  const fresh = run(['pop']);
  assert(fresh.actions[0] === 'none' && !fresh.state.asking, 'a pop on a never-dirty page is none — the page does not ask');
}

console.log('\nNegative controls:');

// ONE sentinel under StrictMode's double-invoked effect: two dirty events push once.
{
  const { actions } = run(['dirty', 'dirty']);
  assert(actions[0] === 'push' && actions[1] === 'none', 'NEGATIVE CONTROL: a second dirty event pushes NOTHING — one sentinel, never two');
}
// clean on a never-armed page must not issue a back() — that would leave the page.
{
  const { actions } = run(['clean']);
  assert(actions[0] === 'none', 'NEGATIVE CONTROL: clean with no sentinel is none — it must never back() off a clean page');
}
// Stay / Leave when nothing is being asked are no-ops.
{
  const { actions } = run(['stay', 'leave']);
  assert(actions[0] === 'none' && actions[1] === 'none', 'Stay and Leave outside a question are none');
}
// after Leave, the pop the browser fires for the real navigation is none
{
  const { actions } = run(['dirty', 'pop', 'leave', 'pop']);
  assert(actions[3] === 'none', 'the pop that follows Leave is none — the router, not the guard, handles that one');
}
// the machine never mutates the state it was given
{
  const before = { armed: true, asking: false };
  transition(before, 'pop');
  assert(before.armed === true && before.asking === false, 'transition returns a new state and never mutates its input');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
