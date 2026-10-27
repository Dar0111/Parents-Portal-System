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

console.log('\nRootNavigator — consent, then the contact, then the password, then home (source; feat/first-signin)');
const root = src('navigation/RootNavigator.jsx');
// The pre-first-signin order (the forced change, then consent): gone.
const ORDER =
  /\) : user\.must_change_password \? \(\n\s+<Stack\.Screen name="ForcedPasswordChange" component=\{ForcedPasswordChangeScreen\} \/>\n\s+\) : user\.policy_pending \? \(\n\s+<Stack\.Screen name="PolicyConsent" component=\{PolicyConsentScreen\} \/>\n\s+\) : \(/;
assert(!ORDER.test(root), 'the old order (the forced change first) is gone from RootNavigator');
// The new one: ONE nextStep() from the mirrored auth/accountSteps.js, each
// step mounting only its own screen, in the server's order.
const STEPS_ORDER =
  /\) : step === 'consent' \? \(\n\s+<Stack\.Screen name="PolicyConsent" component=\{PolicyConsentScreen\} \/>\n\s+\) : step === 'contact' \? \(\n\s+<Stack\.Screen name="ConfirmContact" component=\{ConfirmContactScreen\} \/>\n\s+\) : step === 'password' \? \(\n\s+<Stack\.Screen name="ForcedPasswordChange" component=\{ForcedPasswordChangeScreen\} \/>\n\s+\) : \(/;
assert(
  STEPS_ORDER.test(root) && /import \{ nextStep \} from '\.\.\/auth\/accountSteps';/.test(root) && /const step = nextStep\(user\);/.test(root),
  'only the step screen while a step is left: consent, then ConfirmContact, then the new password'
);
const contactFirst = root.replace("step === 'consent' ? (", "step === '__x' ? (").replace("step === 'contact' ? (", "step === 'consent' ? (").replace("step === '__x' ? (", "step === 'contact' ? (");
assert(!STEPS_ORDER.test(contactFirst), 'control: the same check fails with consent and the contact swapped');
const swapped = root
  .replace('user.must_change_password ? (', 'user.__A__ ? (')
  .replace('user.policy_pending ? (', 'user.must_change_password ? (')
  .replace('user.__A__ ? (', 'user.policy_pending ? (');
// The pre-first-signin swap finds nothing to move: the lines it swapped are gone.
assert(swapped === root, 'the old two-gate lines are gone, so the old swap changes nothing');
const signedInRule = (text) => /const signedIn = Boolean\(user\) && !step;/.test(text) && /if \(!signedIn\) return tree;/.test(text);
assert(signedInRule(root), 'no socket and no count requests until ALL THREE steps are past (the providers wrap only a signed-in tree)');
assert(
  !signedInRule(root.replace('const signedIn = Boolean(user) && !step;', 'const signedIn = Boolean(user);')),
  'control: a rule that ignores the steps fails it'
);
const backGuard = src('screens/ConfirmContactScreen.jsx');
assert(
  /BackHandler\.addEventListener\('hardwareBackPress', \(\) => true\)/.test(backGuard) && /useFocusEffect\(/.test(backGuard),
  'ConfirmContact consumes the Android back button while focused — it cannot leave the step'
);
assert(
  !/BackHandler/.test(src('screens/ForgotPasswordScreen.jsx')),
  'control: a screen that may go back (Forgot password) has no such guard'
);
assert(
  /api\.put\('\/auth\/first-password', \{ new_password: newPassword \}/.test(src('screens/ForcedPasswordChangeScreen.jsx')) &&
    !/change-password|Temporary password/.test(src('screens/ForcedPasswordChangeScreen.jsx')),
  'the new-password screen writes PUT /auth/first-password, with no temporary-password field'
);

console.log('\nThe consent screen (source)');
const consent = src('screens/PolicyConsentScreen.jsx');
assert((consent.match(/<Tick checked=\{ticked\.(privacy_notice|terms_of_use|child)\}/g) || []).length === 3, 'three ticks: the notice, the terms, the child');
assert(/accessibilityRole="checkbox"\n\s+accessibilityState=\{\{ checked, disabled \}\}/.test(consent), 'each tick is announced as a checkbox with its state');
assert(/style=\{TICK_ROW\}/.test(consent) && /const TICK_ROW = \{ minHeight: 48 \};/.test(consent), 'each tick row is a 48dp target');
// Every tick SHOWN (feat/staff-acceptance): all three for a parent; the
// notice and the terms for staff, who have no child tick.
const everyTickShown = (text) =>
  /const isParent = user\?\.role === 'parent';/.test(text) &&
  /const ready = Boolean\(documents\) && ticked\.privacy_notice && ticked\.terms_of_use && \(!isParent \|\| ticked\.child\);/.test(text) &&
  /disabled=\{!ready\} onPress=\{accept\}/.test(text);
assert(everyTickShown(consent), 'Accept works only with every tick shown: all three for a parent, the notice and the terms for staff');
assert(
  !everyTickShown(consent.replace('(!isParent || ticked.child)', 'ticked.child')),
  'control: a rule that asks every role for the child tick fails it'
);
assert(
  /As the parent or legal guardian of \{childName \|\| 'my child'\}, I consent, on my child’s behalf,/.test(consent) &&
    /const childName = user\?\.student_first_name \? String\(user\.student_first_name\) : null;/.test(consent),
  "the third tick names the child by FIRST NAME from /auth/me"
);
assert(!/login_id|\blrn\b/i.test(consent.replace(/\/\/.*$/gm, '')), 'no login id and no LRN anywhere in the screen\'s code');
assert(/login_id/i.test('login_id'), 'control: the same pattern finds one');
// The versions it SHOWED, and the child tick from a parent only — staff send
// the versions alone (feat/staff-acceptance).
const sendsWhatItShowed = (text) =>
  /const body = isParent \? \{ versions, on_behalf_of_child: true \} : \{ versions \};/.test(text) &&
  /api\.post\('\/policy\/accept', body, \{ unwrap: 'policy_pending' \}\)/.test(text) &&
  /Object\.fromEntries\(documents\.map\(\(d\) => \[d\.document, d\.version\]\)\)/.test(text);
assert(sendsWhatItShowed(consent), 'it sends the versions it SHOWED, and the child tick for a parent only');
assert(
  !sendsWhatItShowed(consent.replace('isParent ? { versions, on_behalf_of_child: true } : { versions }', '{ versions, on_behalf_of_child: true }')),
  'control: a body that sends the child tick for every role fails it'
);
assert(/if \(err\?\.response\?\.status === 409\) reload\(\);/.test(consent), 'a 409 (a document changed meanwhile) reloads the documents and clears the ticks');
assert(/await refresh\(\);/.test(consent) && !/navigation\.navigate|navigate\(/.test(consent), 'the exit is the re-read — RootNavigator routes home, the screen navigates nowhere');
assert(/<Pressable onPress=\{logout\}[^>]*>\n\s+<Text[^>]*>Sign out<\/Text>/.test(consent), 'Sign out is always there');
assert(
  /import Skeleton, \{ SkeletonBar \} from '\.\.\/components\/Skeleton';/.test(consent) && /const phase = useSkeleton\(loading\);/.test(consent),
  "loading is Build 2's skeleton"
);

console.log('\nSettings → Security & policy (source)');
// THE WORDS (fix round PF4): the draft the principal will approve, the web's
// word for word. Whitespace is folded, because a JSX line may wrap.
const flat = consent.replace(/\s+/g, ' ');
assert(
  flat.includes("I have read and accept the {titleOf('privacy_notice') || 'Data Privacy Notice'}.") &&
    flat.includes("I have read and agree to the {titleOf('terms_of_use') || 'Terms of Use'}.") &&
    flat.includes(
      "As the parent or legal guardian of {childName || 'my child'}, I consent, on my child’s behalf, to the processing of my child’s personal data for the purposes in the notice."
    ),
  'the three ticks say the principal’s draft, word for word'
);
assert(/'I agree and continue'/.test(consent) && !/Accept and continue/.test(consent), 'the button says "I agree and continue"');
const declineThenSignOut = (text) => {
  const at = text.indexOf('Declining ends portal use only; your child’s school records stay as they are.');
  const out = text.search(/onPress=\{logout\}[^>]*>\s*<Text[^>]*>Sign out<\/Text>/);
  return at > 0 && out > at;
};
assert(declineThenSignOut(flat), 'the line about declining sits above a plain "Sign out"');
assert(!declineThenSignOut(flat.replace('Declining ends', 'Leaving ends')), 'control: without that line, the same check fails');

const security = src('screens/settings/SecurityPolicyScreen.jsx');
assert(/Accepted on \$\{timestampDay\(at, \{ style: 'long' \}\)\}/.test(security) && /import \{ timestampDay \} from '\.\.\/\.\.\/format\/date';/.test(security), 'the accepted date is the mirrored Manila-day formatter, never computed here');
assert(
  /\{at \? `Accepted on \$\{timestampDay\(at, \{ style: 'long' \}\)\}` : 'Not accepted yet'\}/.test(security) &&
    /\) : null\}/.test(security) &&
    !/Version /.test(security) &&
    !/ · /.test(security),
  'a parent sees a date or "Not accepted yet"; staff see neither, with no version and no separator'
);
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
// feat/account-create (2026-10-21): the PARENT's own email and number are gone
// from the enrol screen's parent phase, and the Create teacher screen carries
// neither field — the holder confirms one at the first sign-in (M26).
const enrolScreen = src('screens/teacher/EnrollScreen.jsx');
assert(!/parent\.(email|contact_number)/.test(enrolScreen) && !/label="(Email|Contact number)"/.test(enrolScreen), "the PARENT's own email and number are gone from the enrol screen as well (feat/account-create)");
const createTeacher = src('screens/admin/CreateTeacherScreen.jsx');
assert(!/form\.(email|contact_number)/.test(createTeacher) && !/label="(Email|Contact number)"/.test(createTeacher), 'Create teacher carries no Email and no Contact number field (feat/account-create)');
assert(/parent\.(email|contact_number)/.test('if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();') && /label="(Email|Contact number)"/.test('<FormField label="Contact number" />'), 'control: the patterns catch the old body line and the old field');

// STAFF ACCEPT TOO (feat/staff-acceptance, 2026-10-11), as on the web: the
// child's tick is rendered for a parent only, the intro drops "for your child"
// for staff, and the line above Sign out is the owner's sentence for staff.
// Source text, said plainly (M7); each check with a control.
console.log('\nStaff — two ticks, no child tick, their own intro and decline line:');
const childTickParentOnly = (text) => /\{isParent \? \(\s*<Tick checked=\{ticked\.child\}/.test(text);
assert(childTickParentOnly(consent), "the child's tick is rendered for a parent only");
assert(
  !childTickParentOnly(consent.replace(/\{isParent \? \(\s*(<Tick checked=\{ticked\.child\})/, '{($1')),
  'control: a child tick rendered for every role fails it'
);
assert(
  flat.includes('please read the school’s Data Privacy Notice and Terms of Use, then accept them.`') &&
    flat.includes('please read the school’s Data Privacy Notice and Terms of Use, then accept them for yourself and for your child.`'),
  'the intro: "then accept them." for staff, "…for yourself and for your child." for a parent'
);
const staffDecline = (text) =>
  /isParent \? 'Declining ends portal use only; your child’s school records stay as they are\.' : 'Declining ends portal use only\.'/.test(text);
assert(staffDecline(flat), 'the line above Sign out: the parent\'s sentence for a parent, exactly "Declining ends portal use only." for staff');
assert(
  !staffDecline(flat.replace(" : 'Declining ends portal use only.'", " : 'Declining ends portal use only; your child’s school records stay as they are.'")),
  "control: staff shown the parent's sentence fails it"
);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
