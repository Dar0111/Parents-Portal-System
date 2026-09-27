// PROOF — the class record's leave guard on the phone (Stage 5 branch 3,
// MOBILE_CONVENTIONS M13). Drives the VERBATIM `classRecord/backGuard.js`
// through every transition the slot screen reports, plus the phone's action
// map: `push` and `back` are the web's history moves and do nothing here,
// `ask` is the prompt, and `usePreventRemove` is armed exactly while
// `state.armed` is true. What it cannot: the native Alert — the phone.
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-back-guard.mjs
import { INITIAL_GUARD, transition } from '../src/screens/teacher/classRecord/backGuard.js';

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

// What the slot screen DOES with each action — the only phone-specific part.
const PHONE = { push: 'nothing', back: 'nothing', ask: 'prompt', none: 'nothing' };
function run(events) {
  let state = INITIAL_GUARD;
  const trace = [];
  for (const event of events) {
    const next = transition(state, event);
    state = next.state;
    trace.push({ event, action: next.action, phone: PHONE[next.action], armed: state.armed, asking: state.asking });
  }
  return { state, trace };
}

console.log('a clean screen');
assert(!INITIAL_GUARD.armed && !INITIAL_GUARD.asking, 'starts unarmed: Back leaves with no prompt');
assert(run(['pop']).trace[0].phone === 'nothing', 'a removal on a clean screen is let through');

console.log('dirty → Back → Stay → Back → Leave');
const { trace } = run(['dirty', 'pop', 'stay', 'pop', 'leave']);
assert(trace[0].action === 'push' && trace[0].phone === 'nothing' && trace[0].armed, 'the first edit arms the guard (usePreventRemove on); push does nothing on a phone');
assert(trace[1].action === 'ask' && trace[1].phone === 'prompt' && trace[1].asking, 'Back while armed → the prompt');
assert(trace[2].action === 'push' && trace[2].armed && !trace[2].asking, 'Stay re-arms');
assert(trace[3].phone === 'prompt', 'a second Back asks again');
assert(trace[4].action === 'back' && !trace[4].armed && !trace[4].asking, 'Leave disarms; the screen then dispatches the removal itself');

console.log('idempotent and inert where it must be');
assert(run(['dirty', 'dirty']).trace[1].action === 'none', 'a second "dirty" while armed is none — one guard, never two');
assert(run(['stay']).trace[0].action === 'none' && run(['leave']).trace[0].action === 'none', 'Stay or Leave with no question open do nothing');

console.log('a save');
const saved = run(['dirty', 'clean']);
assert(saved.trace[1].action === 'back' && saved.trace[1].phone === 'nothing' && !saved.state.armed, 'clean after a save disarms with no navigation on a phone');
assert(run(['dirty', 'pop', 'clean']).trace[2].action === 'none', 'clean while the question is open changes nothing (the prompt decides)');

console.log(`\nproof-back-guard: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
