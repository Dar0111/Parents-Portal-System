// PROOF — feat/form-drafts (2026-10-04): what a form draft keeps, under which
// key, and when it goes (FRONTEND_CONVENTIONS §28).
//
// Three parts:
//   1. drafts/draftCore.js (pure, mirrored to the phone) driven directly: the
//      key carries only numeric ids — a login id, an LRN or a name THROWS —
//      only allow-listed fields are kept, each cut to its cap, a record over
//      32 000 characters is not written, and a stored record of another
//      version, another form or with a field outside the list reads as none.
//   2. drafts/sessionDrafts.js over a FAKE sessionStorage: save, restore, the
//      open flag a reload reopens on, Close, Discard, a confirmed submit,
//      another account's keys never read, logout's clear-all leaving every
//      other key alone, and a storage that throws never throwing.
//   3. components/DraftNotice.jsx RENDERED with the approved copy, and the
//      source of AuthContext / api/axios.js: a deliberate logout clears the
//      drafts, a 401 does not.
//   4. (build 1 follow-up, 2026-10-05) drafts/useDraft.js's `isBlankDraft`
//      driven directly — a form whose every text field is empty after
//      trimming is not a draft — with the storage layer alone as the negative
//      control, and the hook's flush / close and both thread pages' restore
//      read as source.
//
// WHAT IT CANNOT: the 500 ms debounce, pagehide, a real reload reopening a
// modal, the hand-off question — the owner's browser check.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-form-drafts.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-form-drafts.js

import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import DraftNotice from '../src/components/DraftNotice.jsx';
import {
  DRAFT_COPY,
  DRAFT_PREFIX,
  MAX_DRAFT_CHARS,
  decodeDraft,
  draftKey,
  editContext,
  encodeDraft,
  itemChangedSince,
  pickAllowed,
  threadContext,
} from '../src/drafts/draftCore.js';
import { clearAllDrafts, clearDraft, closeDraft, createDraftStore, findOpenDrafts, loadDraft, saveDraft } from '../src/drafts/sessionDrafts.js';
import { DRAFT_TEXT_FIELDS, isBlankDraft } from '../src/drafts/useDraft.js';

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
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// A sessionStorage stand-in: the five members the store uses.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const LRN = '136893000001';

console.log('The key — numeric ids only');
assert(draftKey({ userId: 7, form: 'excuse', context: 'new' }) === 'pp.draft.v1.7.excuse.new', 'control: user 7, excuse, new → pp.draft.v1.7.excuse.new');
assert(editContext(12) === 'edit-12' && threadContext(3) === 'thread-3', 'edit-<id> and thread-<id> from numeric ids');
assert(editContext('TCH-001') === null && threadContext(0) === null && threadContext(LRN) === null, 'a login id, 0 and an LRN make no context');
assert(throws(() => draftKey({ userId: 'TCH-001', form: 'excuse', context: 'new' })), 'a login-id-shaped user id THROWS');
assert(throws(() => draftKey({ userId: Number(LRN), form: 'excuse', context: 'new' })), 'an LRN as a numeric user id THROWS (above INT UNSIGNED)');
assert(throws(() => draftKey({ userId: 7, form: 'message', context: `thread-${LRN}` })), 'an LRN-shaped context THROWS');
assert(throws(() => draftKey({ userId: 7, form: 'message', context: 'thread-Ashley' })), 'a name in the context THROWS');
assert(throws(() => draftKey({ userId: 7, form: 'password', context: 'new' })), 'an unknown form THROWS');

console.log('Only allow-listed fields, each cut to its cap');
{
  const text = encodeDraft({ form: 'excuse', values: { reason: 'Fever', password: 'hunter2', login_id: 'TCH-001', lrn: LRN } });
  assert(typeof text === 'string' && text.includes('Fever'), 'control: the typed reason is kept');
  assert(!text.includes('hunter2') && !text.includes('TCH-001') && !text.includes(LRN), 'a password, a login id and an LRN field are dropped on save');
  const bad = JSON.stringify({ v: 1, form: 'excuse', savedAt: 1, open: false, values: { reason: 'x', password: 'y' }, base: null, fromThread: null });
  assert(decodeDraft(bad, 'excuse') === null, 'a stored record carrying a field outside the list reads as none');
  const badBase = JSON.stringify({ v: 1, form: 'excuse', savedAt: 1, open: false, values: { reason: 'x' }, base: { login_id: 'TCH-001' }, fromThread: null });
  assert(decodeDraft(badBase, 'excuse') === null, '…and so does one whose base carries one');
  assert(pickAllowed('announcement', { title: 'x'.repeat(500) }).title.length === 200, 'a title is cut to its 200-character cap');
}

console.log('The size limit');
{
  const plain = encodeDraft({ form: 'adminAnnouncement', values: { content: 'a'.repeat(10000) } });
  assert(typeof plain === 'string' && plain.length <= MAX_DRAFT_CHARS, 'control: a full 10 000-character message is kept');
  const escaped = encodeDraft({ form: 'adminAnnouncement', values: { content: '\u0001'.repeat(10000) } });
  assert(escaped === null, `a record that encodes above ${MAX_DRAFT_CHARS} characters is not written`);
}

console.log('A stored record that is not this version or this form');
{
  const good = encodeDraft({ form: 'memo', values: { title: 'Reminder' } });
  assert(decodeDraft(good, 'memo')?.values.title === 'Reminder', 'control: a memo draft reads back as a memo');
  assert(decodeDraft(good, 'excuse') === null, 'read as another form: none');
  assert(decodeDraft(good.replace('"v":1', '"v":2'), 'memo') === null, 'another version: none');
  assert(decodeDraft('{not json', 'memo') === null && decodeDraft(null, 'memo') === null, 'corrupt or missing: none, never a throw');
}

console.log('Nothing typed, nothing kept');
{
  const base = { title: 'Fair', content: 'Body', category: '', target: '6|Malikhain' };
  assert(encodeDraft({ form: 'announcement', values: { ...base }, base }) === null, 'values equal to what the form opened with: not a draft');
  assert(typeof encodeDraft({ form: 'announcement', values: { ...base, title: 'Fair!' }, base }) === 'string', 'control: one character changed is a draft');
}

console.log('Save, restore, Close, Discard, submit — over a fake sessionStorage');
{
  const fake = fakeStorage({ 'pp.theme': 'dark' });
  const store = createDraftStore(() => fake);
  const target = { userId: 7, form: 'excuse', context: 'new' };
  assert(saveDraft({ ...target, values: { reason: 'Fever' }, open: true }, store) === true, 'saved');
  const back = loadDraft(target, store);
  assert(back?.values.reason === 'Fever' && back.open === true, 'restored with the open flag a reload reopens on');
  assert(findOpenDrafts({ userId: 7, form: 'excuse' }, store).length === 1, 'a reload finds it open');
  closeDraft(target, store);
  assert(loadDraft(target, store)?.values.reason === 'Fever' && findOpenDrafts({ userId: 7, form: 'excuse' }, store).length === 0, 'Close keeps the draft and a reload no longer reopens it');
  saveDraft({ ...target, values: {}, open: true }, store);
  assert(loadDraft(target, store) === null, 'emptied back to the opening values: the stored draft is removed');
  saveDraft({ ...target, values: { reason: 'Fever' }, open: true }, store);
  clearDraft(target, store);
  assert(loadDraft(target, store) === null, 'Discard draft / a confirmed submit removes it');
  assert(fake.map.get('pp.theme') === 'dark', 'other keys are untouched');
}

console.log('Edit drafts — the item changed since');
{
  const base = { title: 'Fair', content: 'Body' };
  const text = encodeDraft({ form: 'memo', values: { title: 'Fair (moved)', content: 'Body' }, base });
  const record = decodeDraft(text, 'memo');
  assert(itemChangedSince('memo', record, base) === false, 'control: the item as the draft began — no notice');
  assert(itemChangedSince('memo', record, { ...base, content: 'Edited by someone else' }) === true, 'the item changed since: the "item changed" notice');
  assert(itemChangedSince('memo', decodeDraft(encodeDraft({ form: 'memo', values: { title: 'x' } }), 'memo'), base) === false, 'a create draft has no base: never "changed"');
}

console.log('The thread hand-off');
{
  const r = decodeDraft(encodeDraft({ form: 'announcement', values: { content: 'Hi' }, fromThread: 3 }), 'announcement');
  assert(r?.fromThread === 3, 'fromThread keeps the conversation’s numeric id, to clear its draft on post');
  const s = decodeDraft(encodeDraft({ form: 'announcement', values: { content: 'Hi' }, fromThread: 'TCH-001' }), 'announcement');
  assert(s?.fromThread === null, 'a login id is never kept as fromThread');
}

console.log('Another account, and logout');
{
  const fake = fakeStorage({ 'pp.theme': 'light', 'pp.navGroups': '{}' });
  const store = createDraftStore(() => fake);
  saveDraft({ userId: 7, form: 'message', context: 'thread-3', values: { body: 'mine' }, open: true }, store);
  saveDraft({ userId: 8, form: 'message', context: 'thread-3', values: { body: 'theirs' }, open: true }, store);
  fake.setItem(`${DRAFT_PREFIX}v0.7.message.thread-3`, 'an older version');
  assert(loadDraft({ userId: 7, form: 'message', context: 'thread-3' }, store)?.values.body === 'mine', 'user 7 reads their own draft');
  const open7 = findOpenDrafts({ userId: 7, form: 'message' }, store);
  assert(open7.length === 1 && open7[0].record.values.body === 'mine', 'another account’s draft is never read');
  clearAllDrafts(store);
  assert([...fake.map.keys()].every((k) => !k.startsWith(DRAFT_PREFIX)), 'logout removes every pp.draft.* key — every account, every version');
  assert(fake.map.get('pp.theme') === 'light' && fake.map.get('pp.navGroups') === '{}', 'control: logout leaves the theme and the nav groups alone');
}

console.log('A storage that throws');
{
  const broken = {
    get length() {
      throw new Error('blocked');
    },
    key: () => {
      throw new Error('blocked');
    },
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  const a = createDraftStore(() => broken);
  const b = createDraftStore(() => {
    throw new Error('private window');
  });
  const target = { userId: 7, form: 'excuse', context: 'new' };
  const ok = [a, b].every(
    (s) =>
      !throws(() => saveDraft({ ...target, values: { reason: 'x' } }, s)) &&
      saveDraft({ ...target, values: { reason: 'x' } }, s) === false &&
      loadDraft(target, s) === null &&
      findOpenDrafts({ userId: 7, form: 'excuse' }, s).length === 0 &&
      !throws(() => clearAllDrafts(s)) &&
      !throws(() => clearDraft(target, s))
  );
  assert(ok, 'a throwing storage and a storage that cannot be reached: nothing kept, nothing thrown');
}

console.log('The approved copy');
assert(
  DRAFT_COPY.restoredWebForm === 'Draft restored. It is kept in this browser tab until you submit it, discard it or log out, or close the tab.' &&
    DRAFT_COPY.restoredWebMessage === 'Draft restored. It is kept in this browser tab until you send it, discard it or log out, or close the tab.' &&
    DRAFT_COPY.restoredPhoneForm === 'Draft restored. It is kept on this phone until you submit it, discard it or log out.' &&
    DRAFT_COPY.restoredPhoneMessage === 'Draft restored. It is kept on this phone until you send it, discard it or log out.',
  'the four notices, word for word'
);
assert(DRAFT_COPY.itemChanged === 'Draft restored. This item was changed after your draft was saved — submitting replaces those changes.', 'the item-changed notice');
assert(
  DRAFT_COPY.discardTitle === 'Discard this draft?' &&
    DRAFT_COPY.discardBody === 'The text you typed will be deleted. This cannot be undone.' &&
    DRAFT_COPY.discardKeep === 'Keep draft' &&
    DRAFT_COPY.discardConfirm === 'Discard draft',
  'the Discard confirm'
);
assert(
  DRAFT_COPY.replaceTitle === 'Replace your saved announcement draft with this message?' &&
    DRAFT_COPY.replaceKeep === 'Keep saved draft' &&
    DRAFT_COPY.replaceUse === 'Use this message' &&
    DRAFT_COPY.handoffStillInThread === "Your message draft is below. It is also still in the conversation's message box.",
  'the hand-off question and notice'
);

console.log('DraftNotice rendered');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
const formHtml = renderToStaticMarkup(<DraftNotice onDiscard={() => {}} />);
assert(formHtml.includes(esc(DRAFT_COPY.restoredWebForm)) && formHtml.includes('role="status"'), 'a form: the tab notice in a role="status" box');
assert(/<button[^>]*>[^<]*Discard draft/.test(formHtml) || formHtml.includes('>Discard draft<'), 'one named button: Discard draft');
assert(!formHtml.includes(esc(DRAFT_COPY.restoredWebMessage)), 'control: the form notice is not the message notice');
const msgHtml = renderToStaticMarkup(<DraftNotice kind="message" onDiscard={() => {}} />);
assert(msgHtml.includes(esc(DRAFT_COPY.restoredWebMessage)), 'a message: "until you send it"');
const changedHtml = renderToStaticMarkup(<DraftNotice changed onDiscard={() => {}} />);
assert(changedHtml.includes(esc(DRAFT_COPY.itemChanged)) && !changedHtml.includes(esc(DRAFT_COPY.restoredWebForm)), 'an edit whose item changed: that notice instead');

console.log('Logout clears, a 401 does not (source text)');
const auth = fs.readFileSync(path.resolve('src/auth/AuthContext.jsx'), 'utf8');
const logoutBody = auth.slice(auth.indexOf('function logout()'), auth.indexOf('}', auth.indexOf('function logout()')));
assert(logoutBody.includes('clearAllDrafts()'), 'AuthContext.logout() calls clearAllDrafts()');
assert(auth.split('clearAllDrafts(').length - 1 === 1, 'and nothing else in AuthContext does');
const axiosSrc = fs.readFileSync(path.resolve('src/api/axios.js'), 'utf8');
assert(/401/.test(axiosSrc) && !/draft/i.test(axiosSrc), 'api/axios.js — the 401 path — never touches a draft');

// ------------------------------------------------ build 1 follow-up
// (2026-10-05): text that is empty after trimming is not a draft.
console.log('A blank form is not a draft (pure + source)');
assert(isBlankDraft('message', { body: '\n\n  \t' }) === true && isBlankDraft('message', { body: 'Hi' }) === false, 'a message of new lines and spaces is blank; one word is not');
assert(isBlankDraft('announcement', { target: '6|Malikhain', title: ' ', content: '\n', category: '' }) === true, 'an announcement with only its section picked and blank text is blank — every TEXT field counts, the picker does not');
assert(isBlankDraft('announcement', { target: '', title: 'Fair', content: '', category: '' }) === false, 'one text field with words: a draft');
assert(isBlankDraft('excuse', { absence_date: '2026-10-05', reason: '  ', details: '' }) === true, 'an excuse letter with only a date picked is blank');
assert(isBlankDraft('event', { title: '', event_date: '2026-10-10', description: ' ', target_grade: '6' }) === true && isBlankDraft('memo', { title: '', content: ' x ' }) === false, 'an event of pickers only is blank; a memo with a word is not');
assert(Object.keys(DRAFT_TEXT_FIELDS).sort().join() === 'announcement,event,excuse,memo,message', 'the rule names all five Phase 1 forms');
{
  // NEGATIVE CONTROL: the storage layer alone keeps a blank message — saved,
  // and read back as a restorable draft. That is the defect the hook's rule
  // stops before it gets here.
  const fake = fakeStorage();
  const store = createDraftStore(() => fake);
  const target = { userId: 7, form: 'message', context: 'thread-2' };
  assert(saveDraft({ ...target, values: { body: '\n\n' } }, store) === true && loadDraft(target, store)?.values.body === '\n\n', 'NEGATIVE CONTROL: without the rule, blank lines are stored and come back');
}
const hookSrc = fs.readFileSync(path.resolve('src/drafts/useDraft.js'), 'utf8').replace(/\r\n/g, '\n');
assert(/if \(!p\) return;\s*if \(isBlankDraft\(p\.form, p\.values\)\) clearDraft\(p\);\s*else saveDraft\(p\);/.test(hookSrc), 'the web hook clears the key instead of saving a blank form (every write goes through flush)');
assert(/if \(stored && isBlankDraft\(form, stored\.values\)\) clearDraft\(\{ userId, form, context \}\);\s*else closeDraft\(\{ userId, form, context \}\);/.test(hookSrc), 'closing a form removes a blank draft kept from before, instead of keeping it closed');
for (const who of ['teacher', 'parent']) {
  const page = fs.readFileSync(path.resolve(`src/pages/${who}/MessageThreadPage.jsx`), 'utf8');
  assert(/const body = record \? record\.values\.body : '';\s*return typeof body === 'string' && body\.trim\(\) \? body : '';/.test(page), `${who} thread: a blank kept message is neither restored nor announced as "Draft restored"`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
