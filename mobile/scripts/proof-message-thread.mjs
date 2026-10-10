// PROOF — feat/shared-messages on the phone (2026-10-11; MOBILE M27, FRONTEND
// §30): the thread screen (screens/parent/MessageThreadScreen.jsx, every
// role's) keeps three rules the web's thread already had.
//   1. A thread with unread messages opens at its NEWEST message, however long
//      read-all and the badge refresh take: nothing is consumed until the list
//      is on screen holding this thread's messages.
//   2. "Load earlier messages" keeps the reader's place: the list goes to its
//      end only when the newest message changes (or the thread first opens).
//   3. A failed re-read keeps the messages on screen.
// And nothing else moved: the composer, Announce, the draft, pull to refresh,
// the 403.
//
// SOURCE TEXT, said plainly — the phone has no render proof (M7). Each rule
// has a negative control: the old code put back in memory must fail it. What
// it cannot show is a real list on a real phone — the owner's device check.
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-message-thread.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}`);
  }
}

const screen = src('src/screens/parent/MessageThreadScreen.jsx');

// The effect that moves the list: from the `useEffect(` that holds the one
// scrollToEnd to the end of its dependency list.
function moveEffect(s) {
  const at = s.indexOf('scrollToEnd');
  if (at < 0) return '';
  const start = s.lastIndexOf('useEffect(', at);
  const end = s.indexOf(']);', at);
  return start < 0 || end < 0 ? '' : s.slice(start, end + 3);
}

// load(): from its useCallback to its dependency list.
function loadFn(s) {
  const start = s.indexOf('const load = useCallback(');
  const end = s.indexOf('}, [otherId, user?.id, refreshUnread]);', start);
  return start < 0 || end < 0 ? '' : s.slice(start, end);
}

const GUARD = 'if (loading || loadedForRef.current !== otherId || !scrollRef.current) return;';
const NEWEST = 'if (!opening && lastId === lastIdRef.current) return;';

function waitsForTheList(s) {
  const e = moveEffect(s);
  const guard = e.indexOf(GUARD);
  const consume = e.indexOf('lastIdRef.current = lastId;');
  return guard > 0 && consume > guard && /\}, \[messages, loading, otherId\]\);$/.test(e);
}

function movesOnlyOnANewNewest(s) {
  const e = moveEffect(s);
  const newest = e.indexOf(NEWEST);
  const move = e.indexOf('scrollToEnd');
  return (
    newest > 0 &&
    move > newest &&
    /const opening = positionedForRef\.current !== otherId;/.test(e) &&
    (s.match(/scrollToEnd/g) || []).length === 1 &&
    !/\[messages\.length\]/.test(s)
  );
}

function keepsOnAFailedReRead(s) {
  const l = loadFn(s);
  const at = l.indexOf('} catch (err) {');
  const caught = at < 0 ? '' : l.slice(at, l.indexOf('} finally {', at));
  return /if \(loadedForRef\.current !== otherId\) setMessages\(\[\]\);/.test(caught) && !/^\s*setMessages\(\[\]\);/m.test(caught);
}

// The code these rules replaced, as it stood on main 456bba8.
const OLD_EFFECT = `useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);`;
const withOldEffect = screen.replace(moveEffect(screen), OLD_EFFECT);

console.log('Rule 1 — a thread with unread messages opens at its newest message');
const readAt = loadFn(screen).indexOf('await api.patch(`/messages/read-all/${otherId}`');
assert(readAt > 0 && loadFn(screen).indexOf('setLoading(false)') > readAt, 'the race it guards against is real: load() awaits read-all before the spinner clears');
assert(waitsForTheList(screen), 'the move consumes nothing until the list is mounted with THIS thread, and runs again when loading ends');
assert(!waitsForTheList(withOldEffect), 'NEGATIVE CONTROL: the old effect (50 ms after any change in the count) fails it');
assert(!waitsForTheList(screen.replace(GUARD, '')), 'NEGATIVE CONTROL: without the guard (the web F1 shape) it fails');

console.log('Rule 2 — "Load earlier messages" keeps the reader\'s place');
assert(movesOnlyOnANewNewest(screen), 'the list goes to its end on open and when the newest message changes — nowhere else');
assert(!/scrollToEnd/.test(screen.slice(screen.indexOf('async function loadEarlier()'), screen.indexOf('async function send()'))), 'loadEarlier() never moves the list');
assert(!movesOnlyOnANewNewest(screen.replace(NEWEST, '')), 'NEGATIVE CONTROL: without the newest-id check it fails');
assert(!movesOnlyOnANewNewest(withOldEffect), 'NEGATIVE CONTROL: the old effect keyed on messages.length fails it');

console.log('Rule 3 — a failed re-read keeps the messages');
assert(keepsOnAFailedReRead(screen), 'the catch empties the list only for a thread that never loaded');
const oldCatch = screen.replace('if (loadedForRef.current !== otherId) setMessages([]);', 'setMessages([]);');
assert(!keepsOnAFailedReRead(oldCatch), 'NEGATIVE CONTROL: the old catch (always empty the list) fails it');

console.log('Nothing else moved');
assert(/refreshControl=\{<RefreshControl refreshing=\{refreshing\} onRefresh=\{pullToRefresh\}/.test(screen), 'pull to refresh is load() with its own flag, as before');
assert(/const showAnnounce = isTeacher && \(other\?\.role \|\| contactRow\?\.role\) === 'parent';/.test(screen), "Announce: a teacher, on a parent's thread only");
assert(/if \(err\?\.response\?\.status === 403\) setBlockedReason\(message\);/.test(screen), 'a 403 still replaces the composer with the reason');
assert(/useDeviceDraft\(\{/.test(screen) && /onRestore: restoreDraft/.test(screen), 'the draft is still the device draft, restored on open');
assert(/if \(sendingRef\.current \|\| sending\) return;/.test(screen), 'one send at a time, as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
