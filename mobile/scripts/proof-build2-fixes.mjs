// PROOF — the build 2 fix round on the phone (feat/dashboards-look,
// 2026-10-08): F1–F4, F6 and F8 from the owner's device check.
//
// What it DRIVES (pure, imported): `hazardSlot` (F1 — the notice, the held
// space while loading with the email unconfirmed, or nothing), the count rows'
// presets and `presetFilters` (F3 — each count's preset is the WHERE it
// counts; Users takes only a role and a status it offers).
// What it reads as SOURCE TEXT, said plainly: the admin dashboard (F1's
// notice and its held space, F2's "Users", F3's press carrying the preset),
// Users taking the preset during render (F3), DataList's avatar circle and
// its three consumers (F4), the sweep in Skeleton.jsx (F6), and the
// dashboard Card's keys (F8) — RED on the old code (a negative control that
// is the old `Lines` over the System widths) and green on the fix. React
// Native does not render under Node.
//
// WHAT IT CANNOT: the jump on a real load, the sweep moving, a real tap into
// Users, LogBox staying quiet — the owner's phone re-check (M7). Run from
// `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-build2-fixes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { CARD_LINKS, COUNT_PRESETS, countRows, hazardSlot, presetFilters } = await import('../src/screens/admin/dashboard/logic.js');
const { ROLE_FILTERS, STATUS_FILTERS } = await import('../src/screens/admin/users/logic.js');

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

console.log('F1 — the lockout notice: compact, and its space held while the dashboard loads');
const flagged = { hazard: { single_unverified_admin: true } };
assert(hazardSlot(flagged, { loading: false, emailConfirmed: false }) === 'notice', 'the server says hazard: the notice');
assert(hazardSlot(null, { loading: true, emailConfirmed: false }) === 'reserve', 'loading with the email unconfirmed: the space is held (the notice laid out invisible)');
assert(hazardSlot(null, { loading: true, emailConfirmed: true }) === 'none', 'email confirmed: nothing held — the warning cannot be true');
assert(hazardSlot({ hazard: { single_unverified_admin: false } }, { loading: false, emailConfirmed: false }) === 'none', 'answered with no hazard: nothing');
assert(hazardSlot(flagged, { loading: true, emailConfirmed: true }) === 'notice', 'the server\'s flag always wins');
const dash = src('screens/admin/DashboardScreen.jsx');
assert(/style=\{reserved \? \{ opacity: 0 \} : undefined\}\n\s+pointerEvents=\{reserved \? 'none' : 'auto'\}\n\s+importantForAccessibility=\{reserved \? 'no-hide-descendants' : 'auto'\}\n\s+accessibilityElementsHidden=\{reserved\}/.test(dash), 'the held notice is the SAME notice at opacity 0, untouchable and hidden from the screen reader — so its height is the notice\'s own');
assert(/hazardSlot\(d, \{ loading: summary\.loading, emailConfirmed: Boolean\(user\?\.email_verified_at\) \}\)/.test(dash), 'the slot reads the server flag, the dashboard\'s loading and the session\'s email state');
assert(/accessibilityState=\{\{ expanded: open \}\} onPress=\{\(\) => setOpen\(\(o\) => !o\)\}>\n\s+Why this matters/.test(dash) && /\{open \? <Text className="mt-2 text-sm text-fg-body">\{HAZARD_EXPLANATION\}<\/Text> : null\}/.test(dash), 'the explanation is behind "Why this matters", announced as expanded or not');
assert(dash.includes('a second admin account cannot be created from inside the app') && /accessibilityRole="link" onPress=\{onConfirm\}>\n\s+Confirm your email/.test(dash), '…word for word, and "Confirm your email" is one tap away (§5i)');

console.log('F2 — the counts card is "Users"');
assert(/title="Users"\n\s+icon="fa-users"/.test(dash) && !/title="People"/.test(dash), 'titled "Users"; "People" is gone');
assert(countRows({}).map((r) => r.label).join(',') === 'Students,Teachers,Parents', 'the three counts keep their names');

console.log('F3 — Teachers and Parents open Users already filtered to what they count');
const rows = countRows({ students: 4, teachers: 3, active_parents: 2 });
assert(rows[0].preset === null && rows[0].link === CARD_LINKS.students, 'Students → Students, no preset (its default is the count\'s WHERE)');
assert(rows[1].preset === COUNT_PRESETS.teachers && rows[1].preset.role === 'teacher' && rows[1].preset.status === '', 'Teachers → Users at Role = Teacher, any status (the server counts every teacher account)');
assert(rows[2].preset === COUNT_PRESETS.parents && rows[2].preset.role === 'parent' && rows[2].preset.status === 'active', 'Parents → Users at Role = Parent + Status = Active (the server counts active parents)');
const roles = ROLE_FILTERS.map((f) => f.key);
const statuses = STATUS_FILTERS.map((f) => f.key);
assert(JSON.stringify(presetFilters(rows[2].preset, roles, statuses)) === JSON.stringify({ role: 'parent', status: 'active', search: '' }), 'Users opens on the preset: the role, the status, an empty search');
assert(presetFilters({ role: 'superuser', status: 'x' }, roles, statuses) === null && presetFilters(null, roles, statuses) === null, 'a role or status Users does not offer is dropped; no preset is no preset');
assert(JSON.stringify(presetFilters({ role: 'teacher', status: 'bogus', search: 'FORGED-MARKER' }, roles, statuses)) === JSON.stringify({ role: 'teacher', status: '', search: '' }), 'only role and status are ever taken — never a search, a login id or an LRN (§5c)');
assert(/navigation\.navigate\(row\.link, row\.preset \? \{ preset: \{ \.\.\.row\.preset, key: Date\.now\(\) \} \} : undefined\)/.test(dash), 'the press carries the preset and the moment of the press as its key (source)');
const users = src('screens/admin/UsersScreen.jsx');
const TAKE = /if \(preset && preset\.key !== presetSeen\) \{\n\s+setPresetSeen\(preset\.key\);\n\s+const next = presetFilters\(preset, PRESET_ROLES, PRESET_STATUSES\);\n\s+if \(next\) \{\n\s+setRole\(next\.role\);\n\s+setStatus\(next\.status\);\n\s+setSearch\(''\);\n\s+setApplied\(next\);/;
assert(TAKE.test(users), 'Users takes a NEW preset during render — the draft AND the applied filters — so the first read is filtered and nothing shows as unapplied (source)');
assert(users.indexOf('setApplied(next)') < users.indexOf('const draftFilters'), '…before the draft is compared, and before any effect reads');

console.log('F4 — an avatar circle in the skeleton where the cards have one');
const list = src('components/DataList.jsx');
assert(/\{avatar \? <SkeletonCircle size=\{SKELETON_AVATAR\} \/> : null\}/.test(list) && /const SKELETON_AVATAR = 38;/.test(list), 'with `skeletonAvatar`, each card placeholder leads with a 38dp circle — RecordCard\'s Avatar');
assert(/emptyContent = <ListSkeleton phase=\{skeleton\} avatar=\{skeletonAvatar\} \/>/.test(list) && /skeletonAvatar = false,/.test(list), 'off unless the screen says so');
const consumers = ['screens/admin/UsersScreen.jsx', 'screens/admin/StudentsScreen.jsx', 'screens/teacher/StudentsScreen.jsx'];
assert(consumers.every((c) => /<DataList\n\s+rows=\{\w+\}\n\s+skeletonAvatar\n/.test(src(c))), 'Users and both Students screens say so (the other avatar lists wait for option 1)');

console.log('F6 — the sweep');
const skeleton = src('components/Skeleton.jsx');
assert(/import Svg, \{ Defs, LinearGradient, Rect, Stop \} from 'react-native-svg';/.test(skeleton), 'built from what is installed: react-native-svg\'s gradient (no new package)');
assert(/Animated\.subtract\(sweep\.x, left\)/.test(skeleton) && /ref\.current\.measureLayout\(region,/.test(skeleton), 'ONE band: each bar measures where it sits in the region and shows its slice of the same band');
assert(/className=\{`overflow-hidden \$\{FILL\} \$\{className\}`\}/.test(skeleton), '…clipped to the bar, so the gaps stay clean');
assert(/const PASSES = 3;/.test(skeleton) && /const PASS_MS = 1500;/.test(skeleton) && /Animated\.loop\(pass, \{ iterations: PASSES \}\)/.test(skeleton), 'three passes of 1.5 s, then still');
assert(/toValue: width, duration: PASS_MS, easing: Easing\.inOut\(Easing\.quad\), useNativeDriver: true/.test(skeleton), 'from off the left edge to the region\'s width, on the native driver');
assert(/const sweeping = painted && motion;/.test(skeleton) && /\{sweep\?\.sweeping && translateX \?/.test(skeleton), 'no band at all under reduce motion, or before the OS has answered');
assert(/band: dark \? tokens\['edge-strong'\] : tokens\.surface/.test(skeleton) && !/#[0-9a-fA-F]{3,8}\b/.test(skeleton), 'a light band from the theme\'s own tokens — `surface` in light, `edge-strong` in dark; no colour literal');

console.log('F8 — skeleton lists are keyed by position');
// Every `[…].map((w, i) => (<Tag key={…}` and `list.map((w) => (<Tag key={…}`.
const MAP = /(\[[^\]]*\]|\b\w+)\.map\(\(\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)\s*=>\s*\(?\s*<[\w.]+[^>]*?\bkey=\{([^}]+)\}/g;
const byValue = (text) => [...text.matchAll(MAP)].filter((m) => m[4].trim() === m[2]);
// The widths each `<Lines widths={[…]} />` passes in a file.
const linesCalls = (text) => [...text.matchAll(/<Lines widths=\{\[([^\]]*)\]\} \/>/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((w) => w[1]));
const repeats = (widths) => widths.filter((w, i) => widths.indexOf(w) !== i);
const card = src('screens/dashboards/Card.jsx');
assert([...card.matchAll(MAP)].length >= 2 && byValue(card).length === 0, 'the phone Card keys every skeleton list by position — `Lines` and the counts shape');
assert(linesCalls(card).some((w) => repeats(w).length > 0), '…and that matters: a shape still passes a width twice (the System shape\'s `w-1/2`)');
// NEGATIVE CONTROL — the code the owner's phone ran (d442bf4), verbatim.
const OLD = "function Lines({ widths }) {\n  return (\n    <View className=\"mt-3 gap-2 border-t border-edge-soft pt-3\">\n      {widths.map((w) => (\n        <View key={w} className=\"h-5 justify-center\">";
const OLD_CALL = "<Lines widths={['w-1/2', 'w-2/5', 'w-3/4', 'w-1/2']} />";
assert(byValue(OLD).length === 1 && repeats(linesCalls(OLD_CALL)[0]).join() === 'w-1/2', 'NEGATIVE CONTROL: the old `Lines` keys by width over widths that repeat `w-1/2` — two siblings, one key: RED, LogBox\'s "Console Error"');
const list2 = src('components/DataList.jsx');
assert(byValue(list2).length === 0, 'DataList\'s skeleton cards are keyed by position too');

console.log(`\nproof-build2-fixes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
