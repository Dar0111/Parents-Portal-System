// PROOF — fix round on feat/message-toast (2026-10-02): Enter sends, Shift+Enter
// is a new line, on the web's two Messages thread pages (FRONTEND §26).
//
// components/enterToSend.js is pure, so this drives it directly with event
// shapes; then, SOURCE TEXT said plainly, it reads both thread pages to check
// the wiring a render cannot show: the textarea's onKeyDown asks the helper and
// submits the FORM (the same onSubmit={send} as the Send button), and send()
// refuses a second send while one is in flight.
//
// BUILD 1 FOLLOW-UP (2026-10-05): a plain Enter never types a new line —
// `enterKeyAction` answers 'send', 'block' or null — driven directly, and both
// key handlers modelled on a fake event that records preventDefault, with
// the OLD handler as the negative control (its held-Enter repeats typed blank
// lines). The wiring regex follows the new onKeyDown.
//
// WHAT IT CANNOT: a real key press, an IME on a real keyboard — the owner
// check (type "Hello", press Enter; Shift+Enter; an empty Enter; hold Enter).
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-enter-to-send.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-enter-to-send.js

import fs from 'node:fs';
import path from 'node:path';
import { enterKeyAction, shouldSendOnEnter } from '../src/components/enterToSend.js';

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

const key = (over = {}) => ({ key: 'Enter', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, keyCode: 13, ...over });
const ready = { sending: false, draft: 'Hello' };

console.log('The key');
assert(shouldSendOnEnter(key(), ready) === true, 'Enter with text sends');
assert(shouldSendOnEnter(key({ shiftKey: true }), ready) === false, 'Shift+Enter does not send (a new line)');
assert(
  [{ ctrlKey: true }, { altKey: true }, { metaKey: true }].every((m) => shouldSendOnEnter(key(m), ready) === false),
  'Ctrl / Alt / Meta+Enter do not send — only a plain Enter'
);
assert(shouldSendOnEnter(key({ key: 'a', keyCode: 65 }), ready) === false, 'another key does not send');

console.log('An IME composition');
assert(shouldSendOnEnter(key({ isComposing: true }), ready) === false, 'isComposing: Enter confirms the word, it does not send');
assert(shouldSendOnEnter(key({ nativeEvent: { isComposing: true } }), ready) === false, "React's synthetic event: the native isComposing is read too");
assert(shouldSendOnEnter(key({ keyCode: 229 }), ready) === false, 'keyCode 229 (a composing keyboard) does not send');

console.log('The same guards as the Send button');
assert(shouldSendOnEnter(key(), { sending: false, draft: '' }) === false, 'an empty field: nothing');
assert(shouldSendOnEnter(key(), { sending: false, draft: '  \n\t ' }) === false, 'spaces and new lines only: nothing');
assert(shouldSendOnEnter(key(), { sending: true, draft: 'Hello' }) === false, 'while a send is in flight: nothing (no double send)');
const matrix = [];
for (const draft of ['', '   ', 'Hi', ' Hi ']) {
  for (const sending of [false, true]) {
    const buttonDisabled = sending || !draft.trim();
    matrix.push(shouldSendOnEnter(key(), { sending, draft }) === !buttonDisabled);
  }
}
assert(matrix.every(Boolean), 'across every state, Enter sends exactly when the Send button is enabled (`sending || !draft.trim()`)');

console.log('A plain Enter never types a new line (build 1 follow-up)');
assert(enterKeyAction(key(), ready) === 'send', "Enter with text: 'send'");
assert(enterKeyAction(key({ repeat: true }), ready) === 'block', "a held Enter's repeat: 'block' — no send, no new line");
assert(enterKeyAction(key(), { sending: false, draft: '' }) === 'block' && enterKeyAction(key(), { sending: false, draft: ' \n ' }) === 'block', "an empty or blank box: 'block'");
assert(enterKeyAction(key(), { sending: true, draft: 'Hello' }) === 'block', "a send in flight: 'block'");
assert(enterKeyAction(key({ shiftKey: true }), ready) === null && enterKeyAction(key({ shiftKey: true, repeat: true }), ready) === null, 'Shift+Enter, held or not: null — the browser types the new line');
assert(
  [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }, { key: 'a', keyCode: 65 }].every((m) => enterKeyAction(key(m), ready) === null),
  'a modifier, an IME composition or another key: null — left to the browser'
);
// The two handlers, on a fake event that records preventDefault: the new one
// (the pages' onKeyDown) and the OLD one, which prevented the newline only
// when it sent.
function press(over, state, handler) {
  const e = { ...key(over), prevented: false, submitted: false, preventDefault() { this.prevented = true; } };
  handler(e, state);
  return e;
}
function newHandler(e, state) {
  const action = enterKeyAction(e, state);
  if (!action) return;
  e.preventDefault();
  if (action === 'send') e.submitted = true;
}
function oldHandler(e, state) {
  if (!shouldSendOnEnter(e, state)) return;
  e.preventDefault();
  e.submitted = true;
}
const heldNew = press({ repeat: true }, { sending: false, draft: '' }, newHandler);
assert(heldNew.prevented && !heldNew.submitted, 'a held repeat over the emptied box: the newline is prevented, nothing is sent');
const heldOld = press({ repeat: true }, { sending: false, draft: '' }, oldHandler);
assert(!heldOld.prevented, 'NEGATIVE CONTROL: the old handler let that repeat type a new line — the blank lines the owner saw');
const shiftNew = press({ shiftKey: true, repeat: true }, ready, newHandler);
assert(!shiftNew.prevented && !shiftNew.submitted, 'a held Shift+Enter still types its new lines');
const sendNew = press({}, ready, newHandler);
assert(sendNew.prevented && sendNew.submitted, 'a plain Enter with text: prevented and submitted');

console.log('Source text — both thread pages (read as files, not rendered)');
for (const who of ['teacher', 'parent']) {
  const src = fs.readFileSync(path.resolve(`src/pages/${who}/MessageThreadPage.jsx`), 'utf8');
  const wired =
    /import \{ enterKeyAction \} from '\.\.\/\.\.\/components\/enterToSend';/.test(src) &&
    /onKeyDown=\{\(e\) => \{[\s\S]*?const action = enterKeyAction\(e, \{ sending, draft \}\);\s*if \(!action\) return;\s*e\.preventDefault\(\);\s*if \(action === 'send'\) e\.currentTarget\.form\?\.requestSubmit\(\);/.test(src);
  assert(wired, `${who}: the textarea's Enter submits the FORM (onSubmit={send}, the Send button's own path), and prevents the new line on every plain Enter`);
  assert(/async function send\(event\) \{\s*event\.preventDefault\(\);[\s\S]{0,120}?if \(sending\) return;/.test(src), `${who}: send() refuses while a send is in flight`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
