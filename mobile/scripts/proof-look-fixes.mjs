// PROOF — feat/look-fixes on the phone (build 1, 2026-10-05; MOBILE M23 /
// FRONTEND §27f). Drives the pure `navigation/drawerOpen.js` with the nested
// state React Navigation really builds, and `buttonStyles()` directly; reads
// the screens as SOURCE TEXT, said plainly, for the rest.
//
// WHAT IT CANNOT: the toast actually hidden behind an open drawer, the Apply
// label actually readable in Dark, a list keeping Search's focus when results
// go empty, Next moving the caret — the owner's phone check.
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

console.log(`\nproof-look-fixes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
