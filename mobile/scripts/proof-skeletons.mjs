// PROOF — build 2, feat/dashboards-look (2026-10-07), commit 1 on the phone:
// skeleton loading tier 1 and the re-read rule (the owner's decisions 1, 5, 6
// and 7, decision 1 as narrowed the same day).
//
// What it drives directly (pure): hooks/useSkeleton.js `skeletonPhase` — the
// web's file byte for byte (lint:mirrors) — and useCard.js's `startRead` /
// `cardView`, with a negative control that is the old one-flag view.
// What it reads as SOURCE TEXT, said plainly: Skeleton.jsx (the progressbar
// and its label, hidden shapes, opacity 0 during the wait, and — since the
// fix round, F6 — the native-driver SWEEP, three passes, never under reduced
// motion; the sweep's band per bar is proved in proof-build2-fixes), DataList (the skeleton only
// with nothing on screen; kept rows take no touches, leave the screen
// reader, and grey after 300 ms; the header stays live), the dashboard Card,
// the three dashboards' pull indicator, the teacher banners' `refresh`, and
// the report card. React Native does not render under Node, so nothing here
// is rendered.
//
// WHAT IT CANNOT: the 300 ms, the sweep, the fill on the device, TalkBack,
// a real pull — the owner's phone check (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-skeletons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { SKELETON_DELAY_MS, skeletonPhase } = await import('../src/hooks/useSkeleton.js');
const { cardView, startRead } = await import('../src/screens/dashboards/useCard.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');
const src = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n/g, '\n');

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

console.log('when a skeleton shows (pure)');
assert(SKELETON_DELAY_MS === 300, 'the wait is 300 ms');
assert(skeletonPhase({ loading: true, elapsedMs: 299 }) === 'wait' && skeletonPhase({ loading: true, elapsedMs: 300 }) === 'skeleton', 'nothing painted under 300 ms, the skeleton from 300 ms');
assert(skeletonPhase({ loading: false, elapsedMs: 9000 }) === 'off', 'off the moment loading ends — no minimum display time');

console.log('the same query keeps its answer; a new query starts from nothing (pure)');
const loaded = { key: '[3]', data: { total: 2 }, error: null, loading: false, answered: true };
const again = cardView(startRead(loaded, '[3]'), '[3]');
assert(again.refreshing && !again.loading && again.data === loaded.data, 'a re-read (focus, pull): the answer stays, `refreshing`, no skeleton');
const moved = cardView(loaded, '[4]');
assert(moved.loading && moved.data === null && !moved.refreshing, 'a new query: `loading`, and the old answer is never shown for it');
const failedRead = { key: '[3]', data: null, error: 'Network Error', loading: false, answered: false };
assert(cardView(startRead(failedRead, '[3]'), '[3]').loading, 'Retry after an error has nothing to keep: `loading`');
const oldView = (s) => ({ loading: s.loading });
assert(oldView(startRead(loaded, '[3]')).loading === true, 'NEGATIVE CONTROL: the old single flag reads a same-query re-read as `loading` — the placeholder over the answer');

console.log('the skeleton region (source)');
const skeleton = src('components/Skeleton.jsx');
assert(/accessibilityRole="progressbar" accessibilityLabel=\{label\}/.test(skeleton) && /label = 'Loading…'/.test(skeleton), 'a progressbar with the spinner’s own label, as LoadingSpinner is (decision 7)');
assert(/importantForAccessibility="no-hide-descendants"\s+accessibilityElementsHidden/.test(skeleton), 'the shapes are hidden from the screen reader');
// Three checks changed in place by the fix round (F6, 2026-10-08), same
// count: the pulse became a sweep.
assert(/style=\{\{ opacity: painted \? 1 : 0 \}\}/.test(skeleton), 'during the wait the shapes are laid out at opacity 0 — the height is held, nothing is painted');
assert(/const sweeping = painted && motion;/.test(skeleton) && /const motion = useMotionAllowed\(\);/.test(skeleton), 'the sweep runs only when motion is allowed — never under reduce motion, never while the OS has not answered');
assert(/const PASSES = 3;/.test(skeleton) && /\{ iterations: PASSES \}/.test(skeleton) && /useNativeDriver: true/.test(skeleton), 'three passes, on the native driver — never on without end');
assert(/const FILL = 'bg-edge';/.test(skeleton), 'the `edge` token — no new token');

console.log('DataList (source)');
const list = src('components/DataList.jsx');
assert(/if \(firstLoad\) emptyContent = <ListSkeleton phase=\{skeleton\}(?: avatar=\{skeletonAvatar\})? \/>;/.test(list) && !/LoadingSpinner/.test(list), 'nothing on screen: the skeleton, as the list’s empty content (the header stays mounted)');
assert(/const busy = loading && shown\.length > 0;/.test(list), 'rows on screen while loading are KEPT');
const KEEP = /pointerEvents: busy \? 'none' : 'auto',\n\s+importantForAccessibility: busy \? 'no-hide-descendants' : 'auto',\n\s+accessibilityElementsHidden: busy,\n\s+style: dimmed \? BUSY_DIM : undefined,/;
assert(KEEP.test(list), '…and made safe: no touches, out of the screen reader’s reach, greyed once dimmed');
assert(/const dimmed = useSkeleton\(busy\) === 'skeleton';/.test(list) && /const BUSY_DIM = \{ opacity: 0\.6 \};/.test(list), 'greyed only after the same 300 ms — a fast re-read does not flash');
const WRAP = /renderItem=\{\(\{ item \}\) => \(\n\s+<View \{\.\.\.keep\}>\n\s+<RecordCard card=\{renderCard\(item\)\} \/>\n\s+<\/View>\n\s+\)\}/;
assert(WRAP.test(list), 'EVERY card is inside the keep wrapper — a stale card cannot be opened while the list reloads');
assert(!WRAP.test(list.replace('<View {...keep}>', '<View>')), 'NEGATIVE CONTROL: without the keep props on the wrapper the assertion fails');
assert(/<View className="mt-4 gap-3" \{\.\.\.keep\}>/.test(list), 'the footer (Show more, Retry) is kept the same way');
assert(/ListHeaderComponent=\{header\}/.test(list) && !/<View \{\.\.\.keep\}>\s*\{header\}/.test(list), 'the header is NOT made inert — its filters stay usable while the list loads');
assert(/extraData=\{busy \? \(dimmed \? 'dimmed' : 'busy'\) : 'idle'\}/.test(list), 'FlatList re-renders its cells when the list starts or stops loading');

console.log('the dashboard Card (source)');
const card = src('screens/dashboards/Card.jsx');
assert(/<Skeleton phase=\{phase\}>\n\s+<Shape \/>\n\s+<\/Skeleton>/.test(card) && !/LoadingSpinner/.test(card), 'loading: the skeleton in the card’s shape, no spinner');
assert(['figure', 'lead', 'list', 'counts', 'facts'].every((s) => new RegExp(`\\n  ${s}: \\(\\) =>`).test(card)), 'five shapes: figure, lead, list, the admin’s counts (commit 2), facts');
assert(/pointerEvents=\{refreshing \? 'none' : 'auto'\}\n\s+accessibilityState=\{refreshing \? \{ busy: true \} : undefined\}/.test(card), 'a re-read: the answer stays, takes no touches, and is marked busy');

console.log('the three dashboards: a pull shows the indicator while the cards re-read (source)');
for (const role of ['admin', 'teacher', 'parent']) {
  const screen = src(`screens/${role}/DashboardScreen.jsx`);
  assert(
    /refreshing=\{pulled && rereading\} onRefresh=\{onPull\}/.test(screen) && !/refreshing=\{false\}/.test(screen),
    `${role}: the native indicator follows the pull’s re-read (it was refreshing={false})`
  );
  assert(/setPulled\(false\);\n\s+reloadAll\(\);/.test(screen) && /setPulled\(true\);\n\s+reloadAll\(\);/.test(screen), `${role}: a focus re-read stays quiet; a pull shows it`);
}
const teacher = src('screens/teacher/DashboardScreen.jsx');
assert(/\[section\.id, today\],\n\s+\{ refresh: tick \}/.test(teacher) && !/\[section\.id, today, tick\]/.test(teacher), 'teacher: a banner’s tick is a same-query `refresh`, not a dep — the banner keeps its answer instead of "Checking…" on every return');

console.log('the report card (source)');
const report = src('screens/parent/ReportCardView.jsx');
assert(/else if \(loading\) body = <ReportSkeleton phase=\{skeleton\} mode=\{report\?\.grading_mode\} \/>;/.test(report) && !/LoadingSpinner/.test(report), 'loading: the report card’s skeleton under the real title band');
assert(/\{mode !== 'descriptive' \? <SkeletonBar round="rounded-xl" className="mt-4 h-12 w-full" \/> : null\}/.test(report), 'no general-average box on a Key Stage 1 card’s skeleton');

console.log(`\nproof-skeletons: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
