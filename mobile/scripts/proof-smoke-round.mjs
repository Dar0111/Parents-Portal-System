// PROOF — the smoke-gate fix round on the phone (fix/smoke-round, 2026-10-13;
// the owner's findings F4–F6). Run from mobile/:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-smoke-round.mjs
//
// What it proves, each source check with a NEGATIVE CONTROL that must fail:
//   - F5: the mirrored src/format/componentLabel.js DRIVEN on every row shape
//     (the web proof holds the same strings) and byte-equal to the web's; the
//     breakdown screen names a row with it, never the bare row.label;
//   - F4: the slot screen names the Summative composite (ST1 30% + ST2 30% +
//     TE 40%) instead of a summed maximum, and a Summative part's live line is
//     "ST PS …" with no raw total — Written Works and Performance Tasks keep
//     theirs;
//   - F6: the reset screen pops back to Login carrying the server's own
//     sentence, and Login shows it on FOCUS (popTo returns to a screen that is
//     already mounted), clears it from the params, and drops it on a sign-in.
// Cannot prove a real reset, a tap or what the emulator draws — the owner's
// check.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentLabel } from '../src/format/componentLabel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(here, '..');
const read = (rel) => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}
function proved(label, holds, real, ...controls) {
  assert(Boolean(holds(real)) && controls.every((c) => !holds(c)), label);
}

// ---------------------------------------------------------------- F5
console.log('F5 — a breakdown row is named the way the class record names it');
const ww1 = { slot_id: 11, slot_type: 'WW', slot_no: 1, slot_name: null, label: null, display_label: 'Written Work 1' };
assert(componentLabel(ww1) === 'WW1', 'an unnamed grid column is its code: WW1');
assert(componentLabel({ ...ww1, slot_type: 'PT', slot_no: 2, display_label: 'Performance Task 2' }) === 'PT2', 'PT2');
assert(componentLabel({ ...ww1, slot_name: '  Long quiz ', display_label: 'Long quiz' }) === 'WW1 · Long quiz', 'a named column: the code, then the trimmed name');
assert(componentLabel({ ...ww1, slot_name: '   ' }) === 'WW1', 'a blank name is no name');
assert(
  componentLabel({ slot_id: null, slot_type: null, slot_no: null, slot_name: null, label: 'Quiz 3', display_label: 'Quiz 3' }) === 'Quiz 3',
  'a legacy row (no slot) keeps the label it was written with'
);
assert(componentLabel({ slot_id: null, label: null, display_label: 'Written Work' }) === 'Written Work', "a legacy row with no label: the server's display_label");
assert(componentLabel(null) === '' && componentLabel({}) === '', 'nothing → an empty string');
assert(componentLabel({ ...ww1, label: 'stale' }) === 'WW1', "a grid row's code wins over any stored label");
const mirror = read('src/format/componentLabel.js');
const web = fs.readFileSync(path.join(MOBILE, '..', 'client', 'src', 'format', 'componentLabel.js'), 'utf8').replace(/\r\n/g, '\n');
proved('the module is byte-equal to the web\'s (a mirror)', (s) => s === web, mirror, `${mirror}\n`);
const breakdown = read('src/screens/parent/GradeBreakdownScreen.jsx');
proved(
  'the breakdown screen names a row with componentLabel(row), never the bare row.label',
  (s) => s.includes("import { componentLabel } from '../../format/componentLabel';") && s.includes('{componentLabel(row)}') && !s.includes('{row.label}'),
  breakdown,
  breakdown.replace('{componentLabel(row)}', '{row.label}')
);
proved(
  'the Examinations rows keep ST1 / ST2 / TE',
  (s) => s.includes("label: 'ST1'") && s.includes("label: 'ST2'") && s.includes("label: 'TE'"),
  breakdown,
  breakdown.replace("label: 'ST2'", "label: 'Summative 2'")
);

// ---------------------------------------------------------------- F4
console.log('F4 — a Summative part names its composite, not a summed maximum');
const slot = read('src/screens/teacher/SlotScreen.jsx');
proved(
  "the group line: a Summative part reads '<group>: ST1 30% + ST2 30% + TE 40% · weight N%'",
  (s) =>
    s.includes('? `${groupName}: ST1 30% + ST2 30% + TE 40% · weight ${server.weights?.[group] ?? \'—\'}%`') &&
    s.includes(': `${groupName} highest possible: ${groupHps?.[group] ?? \'—\'} · weight ${server.weights?.[group] ?? \'—\'}%`') &&
    /\{isExam\s*\?\s*`\$\{groupName\}: ST1 30%/.test(s),
  slot,
  slot.replace('`${groupName}: ST1 30% + ST2 30% + TE 40% · weight', '`${groupName} highest possible: ${groupHps?.[group] ?? \'—\'} · weight')
);
proved(
  "a Summative part's live line is 'ST PS …' with no raw total; WW and PT keep '<WW|PT> total x/y · PS'",
  (s) => /\{isExam\s*\?\s*'ST PS '\s*:\s*`\$\{group\.toUpperCase\(\)\} total /.test(s) && !/EX total/.test(s),
  slot,
  slot.replace("? 'ST PS '", '? `${group.toUpperCase()} total ${total} · PS `'),
  `${slot}\n// EX total`
);

// ---------------------------------------------------------------- F6
console.log('F6 — Login confirms a password reset');
const forgot = read('src/screens/ForgotPasswordScreen.jsx');
proved(
  "the reset pops back to Login with the server's own sentence",
  (s) => /const message = await api\.post\(\s*'\/auth\/reset-password'/.test(s) && s.includes("navigation.popTo('Login', { notice: message });"),
  forgot,
  forgot.replace("navigation.popTo('Login', { notice: message });", "navigation.popTo('Login');"),
  forgot.replace("navigation.popTo('Login', { notice: message });", "navigation.navigate('Login', { notice: message });")
);
const login = read('src/screens/LoginScreen.jsx');
proved(
  'Login reads the notice on FOCUS, shows it and clears it from the params at once',
  (s) =>
    s.includes('export default function LoginScreen({ navigation, route })') &&
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(incomingNotice\) \{\s*setNotice\(incomingNotice\);\s*setError\(''\);\s*navigation\.setParams\(\{ notice: null \}\);/.test(s) &&
    s.includes('const incomingNotice = route?.params?.notice;'),
  login,
  login.replace('navigation.setParams({ notice: null });', ''),
  login.replace("const [notice, setNotice] = useState('');", "const [notice, setNotice] = useState(() => route?.params?.notice || '');").replace(/useFocusEffect\(\s*useCallback/, 'useEffect(useCallback')
);
proved(
  'it renders as the success FormStatus, first in the card, and a sign-in clears it',
  (s) =>
    s.includes('{notice ? <FormStatus status={ok(notice)} className="mb-4" /> : null}') &&
    s.indexOf('{notice ? <FormStatus') > s.indexOf('Sign in to continue.') &&
    /setError\(''\);\s*setNotice\(''\);\s*setSubmitting\(true\);/.test(s),
  login,
  login.replace("setNotice('');\n    setSubmitting(true);", 'setSubmitting(true);'),
  login.replace('{notice ? <FormStatus status={ok(notice)} className="mb-4" /> : null}', '')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
