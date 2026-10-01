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
import { nextToast, otherIdFromRoute, rowFor, toastLabel } from '../src/realtime/messageToast.js';

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

console.log(`\nproof-message-toast: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
