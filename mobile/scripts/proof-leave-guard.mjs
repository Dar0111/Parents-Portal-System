// PROOF — the leave guard on the phone (fix/leave-guard, 2026-10-01).
//
// Two parts:
//   1. BEHAVIOUR: navigation/leaveGuard.js — the web's module, a mirror
//      (lint:mirrors) — driven the way the phone's exits use it: a drawer
//      item, the account card, the bell and Logout call requestLeave(); the
//      focused, dirty Attendance screen registers its Alert.
//   2. SOURCE TEXT, said plainly: AttendanceScreen.jsx is read as a file and
//      checked for the three things a render cannot show here — it registers
//      while FOCUSED (useFocusEffect), "Leave and discard" resets the marks
//      BEFORE the exit runs, and hardware Back asks. React Native cannot be
//      rendered in Node; the press itself is the phone check.
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-leave-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLeaveGuard, requestLeave, setLeaveGuard } from '../src/navigation/leaveGuard.js';

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

// A stand-in for the screen's Alert: records the order of what happens.
function screen() {
  const events = [];
  const asked = [];
  const ask = (proceed) => {
    events.push('alert');
    asked.push(proceed);
  };
  // What "Leave and discard" does on the Attendance screen: reset, then exit.
  const leave = (i = 0) => {
    events.push('reset marks');
    asked[i]?.();
  };
  return { events, asked, ask, leave };
}

console.log('a clean screen — every exit runs at once');
{
  const done = [];
  for (const exit of ['drawer item', 'account card', 'bell', 'logout']) {
    const r = requestLeave(() => done.push(exit));
    assert(r === 'proceeded', `${exit}: proceeds with no Alert`);
  }
  assert(done.length === 4, 'all four exits ran, once each');
}

console.log('the Attendance screen, focused and dirty');
{
  const s = screen();
  const release = setLeaveGuard(s.ask);
  const done = [];
  const r = requestLeave(() => {
    s.events.push('navigate to Students');
    done.push(1);
  });
  assert(r === 'asked' && s.events[0] === 'alert', 'a drawer item ASKS ("Leave without saving?")');
  assert(done.length === 0, 'Stay on this page: nothing runs, the marks stay');
  s.leave();
  assert(done.length === 1, 'Leave and discard: the exit runs once');
  assert(
    s.events.join(' > ') === 'alert > reset marks > navigate to Students',
    'the marks are reset BEFORE the exit runs'
  );
  s.asked[0]?.();
  assert(done.length === 1, 'a second press of Leave does not run the exit twice');
  release();
  assert(!hasLeaveGuard(), 'blur or a save releases the guard');
}

console.log('Logout passes the function itself');
{
  const s = screen();
  const release = setLeaveGuard(s.ask);
  let loggedOut = 0;
  const logout = () => {
    loggedOut += 1;
  };
  requestLeave(logout);
  assert(loggedOut === 0 && s.asked.length === 1, 'requestLeave(logout) asks, and does not log out yet');
  s.leave();
  assert(loggedOut === 1, 'Leave and discard logs out');
  release();
}

console.log('source text — AttendanceScreen.jsx (read as a file, not rendered)');
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'src', 'screens', 'teacher', 'AttendanceScreen.jsx'), 'utf8');
assert(/const PROMPT_TITLE = 'Leave without saving\?';/.test(src), 'the title is "Leave without saving?" — one title on every bulk screen');
assert(/useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(unsaved === 0\) return undefined;/.test(src), 'it registers only while FOCUSED and dirty');
assert(/setLeaveGuard\(ask\)/.test(src), 'it registers its own Alert with setLeaveGuard');
// Whitespace-tolerant: the destructive button whose onPress resets the marks
// and only then calls proceed().
const RESET_THEN_PROCEED = /text: 'Leave and discard',\s*style: 'destructive',\s*onPress: \(\) => \{\s*setMarks\([^;]*\);\s*proceed\(\);\s*\}/;
assert(RESET_THEN_PROCEED.test(src), 'its Leave and discard calls setMarks(...) BEFORE proceed()');
assert(/addEventListener\('hardwareBackPress'/.test(src) && /ask\(\(\) => navigation\.goBack\(\)\)/.test(src), 'hardware Back asks, then goes back');
assert(/if \(drawerStatus === 'open'\) return false;/.test(src), 'an open drawer is left to close itself on Back');

console.log(`\nproof-leave-guard: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
