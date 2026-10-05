// PROOF — form drafts on the phone (feat/form-drafts, 2026-10-04;
// MOBILE_CONVENTIONS M25). Drives the MIRRORED drafts/draftCore.js and the
// pure drafts/deviceDrafts.js over a FAKE AsyncStorage: the key carries only
// numeric ids, only allow-listed fields are kept, the size limit, save /
// restore / clear, another account's draft never read, logout's clear-all
// leaving every other key alone, and a storage that rejects never throwing.
// Then the source: logout clears, the 401 listener does not; the four compose
// screens say Close; an announcement from a thread clears that thread's draft.
// Build 1 follow-up (2026-10-05): the blank-draft rule — the phone hook's copy
// held byte-equal to the web's, its flush and restore read as source, and the
// storage alone as the negative control.
//
// WHAT IT CANNOT: the hook's debounce, AppState, a killed app, the Alerts —
// the phone check (M7).
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-form-drafts.mjs
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const core = await import('../src/drafts/draftCore.js');
const { createDeviceDrafts } = await import('../src/drafts/deviceDrafts.js');
const { DRAFT_COPY, DRAFT_PREFIX, decodeDraft, draftKey, encodeDraft, threadContext } = core;

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
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// AsyncStorage's five calls the store uses, over a Map.
function fakeAsyncStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => {
      map.set(k, String(v));
    },
    removeItem: async (k) => {
      map.delete(k);
    },
    getAllKeys: async () => [...map.keys()],
    multiRemove: async (keys) => {
      keys.forEach((k) => map.delete(k));
    },
  };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..');
const src = (p) => fs.readFileSync(path.join(MOBILE, 'src', p), 'utf8').replace(/\r\n/g, '\n');
const LRN = '136893000001';

console.log('the key — numeric ids only (the mirrored core)');
assert(draftKey({ userId: 7, form: 'message', context: 'thread-3' }) === 'pp.draft.v1.7.message.thread-3', 'control: user 7, message, thread-3');
assert(throws(() => draftKey({ userId: 'TCH-001', form: 'excuse', context: 'new' })), 'a login-id-shaped user id THROWS');
assert(throws(() => draftKey({ userId: 7, form: 'message', context: `thread-${LRN}` })), 'an LRN-shaped context THROWS');
assert(throws(() => draftKey({ userId: 7, form: 'message', context: 'thread-Ashley' })), 'a name in the context THROWS');
assert(threadContext(LRN) === null && threadContext('TCH-001') === null, 'no thread context from an LRN or a login id');

console.log('save, restore, clear — over a fake AsyncStorage');
{
  const fake = fakeAsyncStorage({ 'pp.theme': 'dark' });
  const drafts = createDeviceDrafts(fake);
  const target = { userId: 7, form: 'excuse', context: 'new' };
  assert((await drafts.save({ ...target, values: { reason: 'Fever', password: 'hunter2', lrn: LRN } })) === true, 'saved');
  const stored = fake.map.get(draftKey(target));
  assert(!stored.includes('hunter2') && !stored.includes(LRN), 'a password and an LRN field are dropped on save');
  const back = await drafts.load(target);
  assert(back?.values.reason === 'Fever', 'restored when the form opens again');
  assert(back.open === false, 'the phone stores no open flag: nothing reopens on launch');
  assert((await drafts.save({ ...target, values: {} })) === false && !fake.map.has(draftKey(target)), 'emptied back to the opening values: the stored draft is removed');
  await drafts.save({ ...target, values: { reason: 'Fever' } });
  await drafts.clear(target);
  assert((await drafts.load(target)) === null, 'Discard draft / a confirmed submit removes it');
  assert(fake.map.get('pp.theme') === 'dark', 'other keys are untouched');
}

console.log('edit drafts and the opening values');
{
  const fake = fakeAsyncStorage();
  const drafts = createDeviceDrafts(fake);
  const opening = { title: 'Fair', event_date: '2026-10-20', description: 'Bring water', target_grade: '6' };
  const target = { userId: 7, form: 'event', context: 'edit-41' };
  assert((await drafts.save({ ...target, values: { ...opening }, base: opening })) === false, 'what the form opened with alone is not a draft');
  await drafts.save({ ...target, values: { ...opening, title: 'Fair (moved)' }, base: opening });
  const r = await drafts.load(target);
  assert(r?.base?.title === 'Fair' && !core.itemChangedSince('event', r, opening), 'the base snapshot is kept; the item unchanged — no "changed" notice');
  assert(core.itemChangedSince('event', r, { ...opening, description: 'Bring water and a hat' }), 'the item changed since — the "item changed" notice');
}

console.log('the size limit');
{
  const fake = fakeAsyncStorage();
  const drafts = createDeviceDrafts(fake);
  const ok = await drafts.save({ userId: 7, form: 'memo', context: 'new', values: { content: 'a'.repeat(10000) } });
  assert(ok === true, 'control: a full 10 000-character memo is kept');
  const big = await drafts.save({ userId: 7, form: 'memo', context: 'new', values: { content: '\u0001'.repeat(10000) } });
  assert(big === false && !fake.map.has(draftKey({ userId: 7, form: 'memo', context: 'new' })), 'a record above 32 000 characters is not written — and the smaller one is removed, not left stale');
}

console.log('a stored record that is not this version or this form');
{
  const good = encodeDraft({ form: 'message', values: { body: 'Hi' } });
  assert(decodeDraft(good, 'message')?.values.body === 'Hi', 'control: reads back');
  assert(decodeDraft(good.replace('"v":1', '"v":2'), 'message') === null, 'another version: none');
  assert(decodeDraft(good, 'memo') === null, 'another form: none');
  const extra = JSON.stringify({ v: 1, form: 'message', savedAt: 1, open: false, values: { body: 'x', login_id: 'TCH-001' }, base: null, fromThread: null });
  assert(decodeDraft(extra, 'message') === null, 'a field outside the list: none');
}

console.log('another account, and logout');
{
  const fake = fakeAsyncStorage({ 'pp.theme': 'light', 'pp.navGroups': '{}' });
  const drafts = createDeviceDrafts(fake);
  await drafts.save({ userId: 7, form: 'message', context: 'thread-3', values: { body: 'mine' } });
  await drafts.save({ userId: 8, form: 'message', context: 'thread-3', values: { body: 'theirs' } });
  fake.map.set(`${DRAFT_PREFIX}v0.7.message.thread-3`, 'an older version');
  assert((await drafts.load({ userId: 7, form: 'message', context: 'thread-3' }))?.values.body === 'mine', 'user 7 reads only their own draft for that conversation');
  await drafts.clearAll();
  assert([...fake.map.keys()].every((k) => !k.startsWith(DRAFT_PREFIX)), 'logout removes every pp.draft.* key — every account, every version');
  assert(fake.map.get('pp.theme') === 'light' && fake.map.get('pp.navGroups') === '{}', 'control: logout leaves the theme and the drawer groups alone');
}

console.log('a storage that rejects');
{
  const reject = async () => {
    throw new Error('storage full');
  };
  const drafts = createDeviceDrafts({ getItem: reject, setItem: reject, removeItem: reject, getAllKeys: reject, multiRemove: reject });
  const target = { userId: 7, form: 'excuse', context: 'new' };
  let threw = false;
  let results;
  try {
    results = [await drafts.save({ ...target, values: { reason: 'x' } }), await drafts.load(target), await drafts.clear(target), await drafts.clearAll()];
  } catch {
    threw = true;
  }
  assert(!threw && results[0] === false && results[1] === null, 'nothing kept, nothing claimed, nothing thrown');
  assert((await createDeviceDrafts(fakeAsyncStorage()).load({ userId: 'TCH-001', form: 'excuse', context: 'new' })) === null, 'a bad key reads as none, never a throw');
}

console.log('the phone copy');
assert(
  DRAFT_COPY.restoredPhoneForm === 'Draft restored. It is kept on this phone until you submit it, discard it or log out.' &&
    DRAFT_COPY.restoredPhoneMessage === 'Draft restored. It is kept on this phone until you send it, discard it or log out.',
  'the two phone notices, word for word'
);
const notice = src('components/DraftNotice.jsx');
assert(
  notice.includes('DRAFT_COPY.restoredPhoneForm') && notice.includes('DRAFT_COPY.restoredPhoneMessage') && notice.includes('DRAFT_COPY.itemChanged') && !notice.includes('restoredWeb'),
  'DraftNotice shows the phone notices, never the browser-tab ones'
);
assert(/Alert\.alert\(DRAFT_COPY\.discardTitle, DRAFT_COPY\.discardBody/.test(notice) && /style: 'destructive', onPress: onDiscard/.test(notice), 'Discard asks first: "Discard this draft?", and only the destructive button discards');

console.log('logout clears, the 401 listener does not (source)');
const auth = src('auth/AuthContext.jsx');
const logoutBody = auth.slice(auth.indexOf('async function logout()'), auth.indexOf('}', auth.indexOf('async function logout()')));
assert(logoutBody.includes('await deviceDrafts.clearAll()'), 'logout() awaits deviceDrafts.clearAll()');
assert(auth.split('clearAll(').length - 1 === 1, 'and nothing else in AuthContext clears drafts');
assert(!/draft/i.test(src('api/client.js')), 'api/client.js — where a 401 is detected — never touches a draft');

console.log('the four compose screens and the hand-off (source)');
const screens = ['screens/parent/ExcuseLetterComposeScreen.jsx', 'screens/teacher/AnnouncementComposeScreen.jsx', 'screens/teacher/EventComposeScreen.jsx', 'screens/admin/PostComposeScreen.jsx'];
assert(
  screens.every((s) => /\n\s+Close\n/.test(src(s)) && !/\n\s+Cancel\n/.test(src(s))),
  'each says Close, none says Cancel'
);
assert(screens.every((s) => /draft\.submitted\(/.test(src(s))), 'each removes its draft only after the server confirmed (draft.submitted)');
const ann = src('screens/teacher/AnnouncementComposeScreen.jsx');
assert(/if \(!editing && fromThread\) deviceDrafts\.clear\(\{ userId, form: 'message', context: threadContext\(fromThread\) \}\)/.test(ann), 'an announcement from a conversation clears that conversation’s draft once it posts');
const thread = src('screens/parent/MessageThreadScreen.jsx');
assert(/fromThread: otherId/.test(thread) && /active: draftFor === otherId && !blockedReason/.test(thread), 'the thread passes its id on Announce, and a blocked thread keeps (never writes over) its draft');

// ------------------------------------------------ build 1 follow-up
// (2026-10-05): text that is empty after trimming is not a draft.
console.log('a blank form is not a draft (source, the web rule held equal)');
const phoneHook = src('drafts/useDraft.js');
const webHook = fs.readFileSync(path.resolve(MOBILE, '..', 'client', 'src', 'drafts', 'useDraft.js'), 'utf8').replace(/\r\n/g, '\n');
const RULE = /export const DRAFT_TEXT_FIELDS = Object\.freeze\(\{[\s\S]*?\n\}\);\n\nexport function isBlankDraft\(form, values\) \{[\s\S]*?\n\}\n/;
const phoneRule = phoneHook.match(RULE)?.[0];
const webRule = webHook.match(RULE)?.[0];
assert(Boolean(phoneRule) && phoneRule === webRule, 'the phone hook holds the web’s rule byte for byte — the same five forms, the same text fields (ssr-form-drafts drives it)');
assert(/if \(!p\) return;\s*if \(isBlankDraft\(p\.form, p\.values\)\) deviceDrafts\.clear\(p\);\s*else deviceDrafts\.save\(p\);/.test(phoneHook), 'a blank form is never saved: its key is cleared instead');
assert(/const record = stored && isBlankDraft\(form, stored\.values\) \? null : stored;\s*if \(stored && !record\) deviceDrafts\.clear\(\{ userId, form, context \}\);\s*restoreRef\.current\?\.\(record,/.test(phoneHook), 'a blank draft kept from before is not restored or noticed (the form gets null) and is removed');
{
  // NEGATIVE CONTROL: the storage layer alone keeps a blank message and
  // hands it back — the defect the hook's rule stops before it gets here.
  const fake = fakeAsyncStorage();
  const drafts = createDeviceDrafts(fake);
  const target = { userId: 7, form: 'message', context: 'thread-2' };
  const kept = (await drafts.save({ ...target, values: { body: '\n\n' } })) && (await drafts.load(target))?.values.body === '\n\n';
  assert(kept, 'NEGATIVE CONTROL: without the rule, blank lines are stored and come back');
}

console.log(`\nproof-form-drafts: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
