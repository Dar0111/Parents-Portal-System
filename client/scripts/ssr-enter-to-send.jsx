// PROOF — fix round on feat/message-toast (2026-10-02): Enter sends, Shift+Enter
// is a new line, on the web's two Messages thread pages (FRONTEND §26).
//
// components/enterToSend.js is pure, so this drives it directly with event
// shapes; then, SOURCE TEXT said plainly, it reads both thread pages to check
// the wiring a render cannot show: the textarea's onKeyDown asks the helper and
// submits the FORM (the same onSubmit={send} as the Send button), and send()
// refuses a second send while one is in flight.
//
// WHAT IT CANNOT: a real key press, an IME on a real keyboard — the owner
// check (type "Hello", press Enter; Shift+Enter; an empty Enter).
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-enter-to-send.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-enter-to-send.js

import fs from 'node:fs';
import path from 'node:path';
import { shouldSendOnEnter } from '../src/components/enterToSend.js';

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

console.log('Source text — both thread pages (read as files, not rendered)');
for (const who of ['teacher', 'parent']) {
  const src = fs.readFileSync(path.resolve(`src/pages/${who}/MessageThreadPage.jsx`), 'utf8');
  const wired =
    /import \{ shouldSendOnEnter \} from '\.\.\/\.\.\/components\/enterToSend';/.test(src) &&
    /onKeyDown=\{\(e\) => \{[\s\S]*?if \(!shouldSendOnEnter\(e, \{ sending, draft \}\)\) return;\s*e\.preventDefault\(\);\s*e\.currentTarget\.form\?\.requestSubmit\(\);/.test(src);
  assert(wired, `${who}: the textarea's Enter submits the FORM (onSubmit={send}, the Send button's own path)`);
  assert(/async function send\(event\) \{\s*event\.preventDefault\(\);[\s\S]{0,120}?if \(sending\) return;/.test(src), `${who}: send() refuses while a send is in flight`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
