// PROOF — feat/look-fixes on the phone (build 1, 2026-10-05; MOBILE M23 /
// FRONTEND §27f). Drives the pure `navigation/drawerOpen.js` with the nested
// state React Navigation really builds, and `buttonStyles()` directly; reads
// the screens as SOURCE TEXT, said plainly, for the rest.
//
// THE FIX ROUND (2026-10-05) adds: C1 through `readingNoteLines` and C2's
// text; the thread's send guard (source, with a negative control); the admin
// Grades sections Retry, pull and refocus (source); the mirrored tickets
// (pure) and their use in UnreadProvider (source).
//
// WHAT IT CANNOT: the toast actually hidden behind an open drawer, the Apply
// label actually readable in Dark, a list keeping Search's focus when results
// go empty, Next moving the caret, two real taps on Send, the sections
// coming back after a real outage — the owner's phone check.
//
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-look-fixes.mjs
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { drawerOpenInState } = await import('../src/navigation/drawerOpen.js');
const { buttonStyles, cardClass } = await import('../src/components/buttonStyles.js');

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

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '..', 'src', p), 'utf8').replace(/\r\n/g, '\n');

// The shapes RootNavigator → AppShell → RoleDrawer build: Home is the root
// stack's screen, AppShell's stack holds Main (the drawer) and pushed screens.
const drawerState = (history = [], extra = {}) => ({
  type: 'drawer',
  index: 0,
  default: 'closed',
  routes: [{ name: '/teacher' }, { name: '/teacher/messages' }],
  history: [{ type: 'route', key: 'a' }, ...history],
  ...extra,
});
const onMain = (drawer) => ({
  type: 'stack',
  index: 0,
  routes: [{ name: 'Home', state: { type: 'stack', index: 0, routes: [{ name: 'Main', state: drawer }] } }],
});

console.log('the toast is hidden while the drawer is open (pure)');
assert(drawerOpenInState(onMain(drawerState())) === false, 'no drawer entry in history: closed');
assert(drawerOpenInState(onMain(drawerState([{ type: 'drawer', status: 'open' }]))) === true, 'a drawer entry saying open: open');
assert(drawerOpenInState(onMain(drawerState([{ type: 'drawer', status: 'open' }, { type: 'drawer', status: 'closed' }]))) === false, 'the NEWEST drawer entry wins: closed');
assert(drawerOpenInState(onMain(drawerState([], { default: 'open' }))) === true, 'no entry: the navigator default decides (the router’s own rule)');
const pushed = {
  type: 'stack',
  index: 0,
  routes: [{ name: 'Home', state: { type: 'stack', index: 1, routes: [{ name: 'Main', state: drawerState([{ type: 'drawer', status: 'open' }]) }, { name: 'MessageThread', params: { otherId: 3 } }] } }],
};
assert(drawerOpenInState(pushed) === false, 'a screen pushed over Main is focused: no drawer on the path, the toast shows');
assert(drawerOpenInState(undefined) === false && drawerOpenInState({ routes: [] }) === false, 'no state yet: closed, never a throw');
const toast = src('realtime/MessageToast.jsx');
assert(/const drawerOpen = useNavigationState\(\(state\) => drawerOpenInState\(state\)\);/.test(toast) && /\{toast && !drawerOpen \? \(/.test(toast), 'MessageToast reads it and renders nothing while the drawer is open');
assert(/const timer = setTimeout\(\(\) => store\.clear\(\), TOAST_MS\);[\s\S]{0,80}\}, \[toast, store\]\);/.test(toast), 'the 5 s timer is unchanged — it keeps running while hidden');

console.log('the constant button borders (pure)');
const variants = ['primary', 'secondary', 'ghost', 'danger', 'danger-outline', 'success'];
const looks = Object.fromEntries(variants.map((v) => [v, buttonStyles({ variant: v })]));
assert(variants.every((v) => / rounded-lg border /.test(` ${looks[v].box} `)), 'every variant is rounded-lg with a 1dp border');
assert(/border-primary/.test(looks.primary.box) && /border-danger-solid/.test(looks.danger.box) && /border-success-solid/.test(looks.success.box) && /border-transparent/.test(looks.ghost.box), 'the filled variants border in their fill colour, ghost in transparent');
assert(buttonStyles({ variant: 'primary' }).minHeight === 48 && buttonStyles({ size: 'sm' }).minHeight === 44 && buttonStyles({ size: 'lg' }).minHeight === 52, 'the heights are unchanged: 48 / 44 / 52dp');
assert(cardClass === 'rounded-xl border border-edge bg-surface', 'the card is the container corner, hairline, nothing else');

console.log('Apply remounts instead of restyling (source)');
const filter = src('components/FilterActions.jsx');
assert(/key=\{dirty \? 'apply-dirty' : 'apply-clean'\}/.test(filter), 'the Apply Pressable is keyed by its state');

console.log('DataList is one FlatList in every state (source)');
const list = src('components/DataList.jsx');
assert((list.match(/<FlatList/g) || []).length === 1 && !/<ScrollView/.test(list) && !/import \{[^}]*ScrollView/.test(list), 'one FlatList, no ScrollView branch — the header is never remounted');
assert(/ListEmptyComponent=\{emptyContent\}/.test(list) && /ListHeaderComponent=\{header\}/.test(list), 'loading, error and empty are the list’s empty content under the same header');
assert(/const footerError = rows\.length && error \? <ErrorAlert message=\{error\} onRetry=\{onRetry\} \/> : null;/.test(list), 'an error with rows on screen renders in the footer, and the rows stay');

console.log('the flagged admin screens (source)');
const users = src('screens/admin/UsersScreen.jsx');
assert(/pending\.length === 0 && !loading && !error \?/.test(users), 'Users: no "nothing waiting" over a failed read');
assert(/if \(loadingMorePending\) return;/.test(users) && /loading=\{loadingMorePending\} onPress=\{loadMorePending\}/.test(users), 'Users: one pending page at a time, with the button busy');
const attendance = src('screens/admin/AttendanceScreen.jsx');
assert(!/<View className="flex-row gap-2">\s*<DateField/.test(attendance) && /<DateField label="From"[^\n]*clearable \/>\n\s*<DateField label="To"/.test(attendance), 'Attendance: From and To are stacked');
assert(/\{rows\.length\} of \{page\?\.total \?\? rows\.length\} record\{\(page\?\.total \?\? rows\.length\) === 1 \? '' : 's'\}/.test(attendance), 'Attendance: "N of T records", T the API’s page.total (approved copy)');
const students = src('screens/admin/StudentsScreen.jsx');
assert(!/SectionHeader/.test(students), 'Students: the second "Students" title is gone (approved copy)');
const ann = src('screens/admin/AnnouncementsScreen.jsx');
assert(/function switchKind\(next\) \{\n\s+if \(next === kind\) return;\n\s+setRows\(\[\]\);/.test(ann) && /onChange=\{switchKind\}/.test(ann), 'Announcements: switching to Memos clears the old rows first');
const grades = src('screens/admin/GradesScreen.jsx');
assert(/mode === 'descriptive' \? \(\s*<Text className="text-xs text-fg-muted">\s*Final <TermValue entry=\{\{ descriptive_grade: subject\.final_grade, descriptor: subject\.final_grade_descriptor \}\}/.test(grades), 'Grades: a descriptive Final is the letter (TermValue), not "— N/A"');
assert(/\{mode !== 'descriptive' \? \(\s*<View className=\{`\$\{cardClass\} flex-row flex-wrap items-baseline/.test(grades), 'Grades: no General Average on a descriptive card (Grade 1); Grades 2–3 keep it');
assert(/<ErrorAlert message=\{studentsError\} onRetry=\{\(\) => setStudentsAttempt\(\(n\) => n \+ 1\)\} \/>/.test(grades), 'Grades: the learner list has its own retry');

console.log('Login: Next moves to the password (source)');
const login = src('screens/LoginScreen.jsx');
assert(/returnKeyType="next"\s+submitBehavior="submit"\s+onSubmitEditing=\{\(\) => passwordRef\.current\?\.focus\(\)\}/.test(login) && /inputRef=\{passwordRef\}/.test(login), 'the login id’s Next focuses the password field and keeps the keyboard');

console.log('the shapes on the phone (source)');
assert(/rounded-md border px-2\.5/.test(src('components/StatusBadge.jsx')), 'a status badge is a tag (rounded-md), not a pill');
assert(/overflow-hidden rounded-lg border px-4/.test(src('components/Segmented.jsx')), 'a segment is a control (rounded-lg), not a pill');
assert(/rounded-lg border bg-surface px-4 py-3\.5/.test(src('components/FormField.jsx')), 'an input is a control (rounded-lg)');

// ------------------------------------------------ the build 1 fix round
// (2026-10-05) — the owner's device-check findings 2, 5, 6 and 7.

console.log('fix round 2 — C1 and C2, the descriptive Final copy (pure + source)');
const { readingNoteLines } = await import('../src/screens/parent/reportCard/logic.js');
const C1 = 'The final letter for a learning area is worked out from the scores of all three terms, so it appears once every term has its scores recorded.';
const descriptiveNote = readingNoteLines('descriptive');
assert(descriptiveNote.includes(C1) && !descriptiveNote.some((line) => line.includes('appears once all three terms are recorded')), "C1: the report card's Final sentence needs every term's SCORES");
const gradesFix = src('screens/admin/GradesScreen.jsx');
assert(/mode === 'descriptive' \? '; “— N\/A” means it does not apply to this grade level; a final letter needs every term\\'s scores recorded' : ''/.test(gradesFix), 'C2: admin Grades says, on a descriptive card only, that a final letter needs every term’s scores');

console.log('fix round 5 — one send at a time (source)');
const thread = src('screens/parent/MessageThreadScreen.jsx');
const sendAt = thread.indexOf('async function send()');
const sendFn = thread.slice(sendAt, sendAt + 1000);
const PHONE_GUARD = /if \(sendingRef\.current \|\| sending\) return;[\s\S]*?sendingRef\.current = true;[\s\S]*?await api\.post\([\s\S]*?finally \{\s*sendingRef\.current = false;/;
assert(sendAt > 0 && PHONE_GUARD.test(sendFn), 'the thread send() is guarded by a REF — checked first, set before the POST, cleared in finally');
assert(!PHONE_GUARD.test(sendFn.replace('sendingRef.current || ', '')), 'NEGATIVE CONTROL: with the ref check taken out, the guard assertion fails');

console.log('fix round 6 — admin Grades reads its sections again (source)');
assert(/<ErrorAlert message=\{sectionsError\} onRetry=\{\(\) => setSectionsAttempt\(\(n\) => n \+ 1\)\} \/>/.test(gradesFix) && /\}, \[sectionsAttempt\]\);/.test(gradesFix), 'Grades: a failed sections read shows in the Section row with Retry, the effect keyed by sectionsAttempt');
assert((gradesFix.match(/if \(sectionsFailed\.current\) setSectionsAttempt\(\(n\) => n \+ 1\);/g) || []).length === 2, 'Grades: a pull and coming back to the screen read the sections again while they are failed');

console.log('fix round 7 — the newest unread reply wins (pure + source)');
const { createTickets } = await import('../src/api/tickets.js');
const tickets = createTickets();
const older = tickets.take();
const newer = tickets.take();
assert(!tickets.isLatest(older) && tickets.isLatest(newer), 'tickets: the older read is no longer the latest');
const unreadSrc = src('realtime/UnreadProvider.jsx');
assert(/import \{ createTickets \} from '\.\.\/api\/tickets';/.test(unreadSrc) && /const ticket = tickets\.take\(\);/.test(unreadSrc) && /if \(!tickets\.isLatest\(ticket\)\) return; \/\/ a newer read has started\n\s+setUnread\(rows\.reduce/.test(unreadSrc) && /if \(tickets\.isLatest\(ticket\)\) setUnread\(0\);/.test(unreadSrc), 'UnreadProvider: a reply that is no longer the newest is dropped — count, rows and failure alike');

console.log(`\nproof-look-fixes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
