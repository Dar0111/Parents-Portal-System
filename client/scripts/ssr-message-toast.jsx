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
import {
  TOAST_MS,
  nextToast,
  otherIdFromPath,
  otherIdFromRoute,
  rowFor,
  toastLabel,
} from '../src/realtime/messageToast.js';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
