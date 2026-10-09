// PROOF — the privacy build on the phone (feat/privacy, 2026-10-10; MOBILE
// M26): the consent screen, Settings → Security & policy, and the four learner
// fields that are no longer collected.
//
// What it DRIVES (pure, imported): the mirrored Settings tab list (tabs.js).
// What it reads as SOURCE TEXT, said plainly — React Native does not render
// under Node: RootNavigator's order (the forced change, then consent, then
// home) and the realtime providers staying unmounted until both are past;
// the consent screen's three ticks, the child's first name, the versions it
// sends, the 409 reload and the exit by `refresh()`; the Settings row and its
// screen; the Manila-day dates; and the four retired fields gone from the
// enrol screen and both student records. Each source check carries a control.
//
// WHAT IT CANNOT: a real sign-in landing on the consent screen, a real tick
// and accept, the skeleton's 300 ms — the owner's phone check (M7). Run from
// `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-privacy.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { settingsTabsForRole } = await import('../src/screens/settings/tabs.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');
const src = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
  }
}

console.log('\nThe Settings row, every role (pure — the mirrored tabs.js)');
for (const role of ['parent', 'teacher', 'admin']) {
  const tabs = settingsTabsForRole(role);
  const i = tabs.findIndex((t) => t.to === 'security');
  assert(
    i > 0 && tabs[i].label === 'Security & policy' && tabs[i].icon === 'fa-shield-halved' && tabs[i - 1].to === 'password',
    `${role}: "Security & policy" (fa-shield-halved), right after Change password`
  );
}
const settings = src('screens/settings/SettingsScreen.jsx');
assert(/'Security & policy': 'SecurityPolicy',/.test(settings), 'the row opens a screen (not dimmed as "not on the phone yet")');
const shell = src('navigation/AppShell.jsx');
assert(
  /<Stack\.Screen name="SecurityPolicy" component=\{SecurityPolicyScreen\} options=\{\{ title: 'Security & policy' \}\} \/>/.test(shell) &&
    /import SecurityPolicyScreen from '\.\.\/screens\/settings\/SecurityPolicyScreen';/.test(shell),
  'AppShell registers SecurityPolicy with its title'
);
assert(/'fa-shield-halved': faShieldHalved,/.test(src('icons.js')), 'the icon is mapped (an unmapped name throws in DEV)');

console.log('\nRootNavigator — the forced change, then consent, then home (source)');
const root = src('navigation/RootNavigator.jsx');
const ORDER =
  /\) : user\.must_change_password \? \(\n\s+<Stack\.Screen name="ForcedPasswordChange" component=\{ForcedPasswordChangeScreen\} \/>\n\s+\) : user\.policy_pending \? \(\n\s+<Stack\.Screen name="PolicyConsent" component=\{PolicyConsentScreen\} \/>\n\s+\) : \(/;
assert(ORDER.test(root), 'only the consent screen while policy_pending — and only after the forced change');
const swapped = root
  .replace('user.must_change_password ? (', 'user.__A__ ? (')
  .replace('user.policy_pending ? (', 'user.must_change_password ? (')
  .replace('user.__A__ ? (', 'user.policy_pending ? (');
assert(!ORDER.test(swapped), 'control: the same check fails with the two gates swapped');
assert(
  /const signedIn = Boolean\(user\) && !user\.must_change_password && !user\.policy_pending;/.test(root) && /if \(!signedIn\) return tree;/.test(root),
  'no socket and no count requests until BOTH gates are past (the providers wrap only a signed-in tree)'
);

console.log('\nThe consent screen (source)');
const consent = src('screens/PolicyConsentScreen.jsx');
assert((consent.match(/<Tick checked=\{ticked\.(privacy_notice|terms_of_use|child)\}/g) || []).length === 3, 'three ticks: the notice, the terms, the child');
assert(/accessibilityRole="checkbox"\n\s+accessibilityState=\{\{ checked, disabled \}\}/.test(consent), 'each tick is announced as a checkbox with its state');
assert(/style=\{TICK_ROW\}/.test(consent) && /const TICK_ROW = \{ minHeight: 48 \};/.test(consent), 'each tick row is a 48dp target');
assert(
  /const ready = Boolean\(documents\) && ticked\.privacy_notice && ticked\.terms_of_use && ticked\.child;/.test(consent) &&
    /disabled=\{!ready\} onPress=\{accept\}/.test(consent),
  'Accept works only with all three ticked'
);
assert(
  /I accept both on behalf of my child\{childName \? `, \$\{childName\}` : ''\}\./.test(consent) &&
    /const childName = user\?\.student_first_name \? String\(user\.student_first_name\) : null;/.test(consent),
  "the third tick names the child by FIRST NAME from /auth/me"
);
assert(!/login_id|\blrn\b/i.test(consent.replace(/\/\/.*$/gm, '')), 'no login id and no LRN anywhere in the screen\'s code');
assert(/login_id/i.test('login_id'), 'control: the same pattern finds one');
assert(
  /api\.post\('\/policy\/accept', \{ versions, on_behalf_of_child: true \}, \{ unwrap: 'policy_pending' \}\)/.test(consent) &&
    /Object\.fromEntries\(documents\.map\(\(d\) => \[d\.document, d\.version\]\)\)/.test(consent),
  'it sends the versions it SHOWED, and the child tick'
);
assert(/if \(err\?\.response\?\.status === 409\) reload\(\);/.test(consent), 'a 409 (a document changed meanwhile) reloads the documents and clears the ticks');
assert(/await refresh\(\);/.test(consent) && !/navigation\.navigate|navigate\(/.test(consent), 'the exit is the re-read — RootNavigator routes home, the screen navigates nowhere');
assert(/<Pressable onPress=\{logout\}[^>]*>\n\s+<Text[^>]*>Sign out instead<\/Text>/.test(consent), 'Sign out is always there');
assert(
  /import Skeleton, \{ SkeletonBar \} from '\.\.\/components\/Skeleton';/.test(consent) && /const phase = useSkeleton\(loading\);/.test(consent),
  "loading is Build 2's skeleton"
);

console.log('\nSettings → Security & policy (source)');
const security = src('screens/settings/SecurityPolicyScreen.jsx');
assert(/Accepted on \$\{timestampDay\(at, \{ style: 'long' \}\)\}/.test(security) && /import \{ timestampDay \} from '\.\.\/\.\.\/format\/date';/.test(security), 'the accepted date is the mirrored Manila-day formatter, never computed here');
assert(/required \? \(at \? /.test(security) && /: ' · Not accepted yet'\) : ''/.test(security), 'a parent sees a date or "Not accepted yet"; staff see neither');
assert(/Parents accept them before using the portal\./.test(security), "staff are told parents accept them");
assert(/<RefreshControl refreshing=\{refreshing\} onRefresh=\{reread\}/.test(security), 'pull-to-refresh keeps what is on screen (M23)');
assert(/const phase = useSkeleton\(loading\);/.test(security), "a first load shows Build 2's skeleton");

console.log('\nThe four retired learner fields are gone (source)');
const RETIRED = /\b(enroll|draft|student)\.(birthday|gender|address|contact_number)\b|label="(Birthday|Gender|Address)"|>Contact details</;
for (const p of ['screens/teacher/EnrollScreen.jsx', 'screens/teacher/StudentDetailScreen.jsx', 'screens/admin/StudentDetailScreen.jsx']) {
  const hit = src(p).match(RETIRED);
  assert(!hit, `${p}: no learner birthday, gender, address or contact number${hit ? ` (found ${hit[0]})` : ''}`);
}
assert(
  RETIRED.test('<Field label="Birthday" value={student.birthday ? longDate(student.birthday) : null} />') &&
    RETIRED.test('<CardTitle icon="fa-address-book">Contact details</CardTitle>'),
  'control: the pattern catches the old field and the old card'
);
assert(/parent\.contact_number/.test(src('screens/teacher/EnrollScreen.jsx')), "the PARENT's own number stays on the enrol screen — the guardian's, not the learner's");

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
