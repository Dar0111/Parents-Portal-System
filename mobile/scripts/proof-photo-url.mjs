// PROOF — profile photos on the phone (feat/profile-photos, 2026-09-30,
// MOBILE_CONVENTIONS M21). Drives the verbatim format/photoUrl.js mirror
// against the phone's own API base (api/client.js, which imports only axios),
// and reads four source files for the owner's rules. Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-photo-url.mjs
//
// What it proves: the address is '<origin>/uploads/avatars/<name>' built from
// EXPO_PUBLIC_API_URL's base, and anything but 32 lowercase hex + '.jpg' —
// a path, a login-id-shaped name, a query — is refused; the photo library
// is the only source (no camera call anywhere in mobile/src); the uploaded
// file's name is a fixed word, never an account value; the user avatars
// (drawer card, record cards, Account information) pass the photo and the
// learner cards do not. Negative controls on the camera and file-name scans.
// What it CANNOT prove: a photo drawing, a failed load falling back to the
// initials, the picker, the multipart upload over the hotspot — the phone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE_URL } from '../src/api/client.js';
import { photoUrl } from '../src/format/photoUrl.js';

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
const SRC = path.join(here, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const GOOD = 'abcdef0123456789abcdef0123456789.jpg';

console.log('the address, from the phone’s own API base');
const origin = API_BASE_URL.replace(/\/+$/, '').replace(/\/api$/, '');
assert(photoUrl(GOOD, API_BASE_URL) === `${origin}/uploads/avatars/${GOOD}`, `built from API_BASE_URL (${origin}/uploads/avatars/<name>)`);
assert(photoUrl(GOOD, 'http://192.168.43.10:5000/api') === `http://192.168.43.10:5000/uploads/avatars/${GOOD}`, 'a hotspot LAN base');
assert(photoUrl(GOOD, 'http://192.168.43.10:5000/api/') === `http://192.168.43.10:5000/uploads/avatars/${GOOD}`, 'with a trailing slash');
for (const [name, label] of [
  [null, 'no photo'],
  ['', 'an empty string'],
  ['ABCDEF0123456789ABCDEF0123456789.jpg', 'upper-case hex'],
  ['abcdef0123456789abcdef012345678.jpg', '31 characters'],
  ['abcdef0123456789abcdef0123456789.png', 'another extension'],
  ['../../server/.env', 'a path'],
  ['100000000009.jpg', 'a login-id-shaped name'],
  [`${GOOD}#x`, 'a fragment'],
]) {
  assert(photoUrl(name, API_BASE_URL) === null, `refuses ${label}`);
}
assert(photoUrl(GOOD, '') === null, 'no base → null (initials)');

console.log('the photo library only — never the camera');
const camera = (src) => /launchCameraAsync|requestCameraPermissionsAsync|useCameraPermissions/.test(src);
const allSrc = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(entry.name)) allSrc.push([path.relative(SRC, p), fs.readFileSync(p, 'utf8')]);
  }
})(SRC);
assert(allSrc.length > 50, `scanned every source file under mobile/src (${allSrc.length})`);
assert(!allSrc.some(([, src]) => camera(src)), 'no camera call anywhere in mobile/src');
assert(camera('await ImagePicker.launchCameraAsync({})'), 'NEGATIVE CONTROL: a camera call IS caught by the same check');
const account = read('screens/settings/AccountInfoScreen.jsx');
assert(/launchImageLibraryAsync\(\{[^}]*mediaTypes: \['images'\][^}]*allowsEditing: true[^}]*aspect: \[1, 1\]/s.test(account), 'Account information opens the library: images only, a square crop');

console.log('the uploaded file’s name is a fixed word');
const appendLine = (src) => (src.match(/form\.append\('photo',[^\n]*/) || [''])[0];
const fixedName = (line) => /name: [^,]*'photo\.(jpg|png|webp)'/.test(line) && !/user\?*\.|login_id|asset\.fileName|\bname\b\s*\}/.test(line.replace(/name: /, ''));
const line = appendLine(account);
assert(line.length > 0, 'the FormData append is found');
assert(fixedName(line), 'the name sent is photo.jpg / .png / .webp — nothing from the account or the picked file');
assert(
  !fixedName("form.append('photo', { uri: asset.uri, name: asset.fileName || `${user.login_id}.jpg`, type });"),
  'NEGATIVE CONTROL: a name built from the account or the picked file is caught'
);

console.log('which avatars carry a photo');
assert(/<Avatar name=\{name\} photo=\{user\?\.profile_pic\} \/>/.test(read('navigation/DrawerContent.jsx')), 'the drawer’s user card passes the signed-in user’s photo');
assert(/<Avatar name=\{card\.avatar\} photo=\{card\.avatarPhoto\} \/>/.test(read('components/RecordCard.jsx')), 'RecordCard passes card.avatarPhoto');
assert(/<Avatar name=\{user\?\.name\} photo=\{user\?\.profile_pic\}/.test(account), 'Account information shows the large avatar with the photo');
for (const rel of ['screens/parent/MessagesScreen.jsx', 'screens/teacher/MessagesScreen.jsx']) {
  assert(/avatarPhoto: row\.other_user_profile_pic/.test(read(rel)), `${rel}: the conversation card carries the other person’s photo`);
}
assert((read('screens/admin/UsersScreen.jsx').match(/avatarPhoto: row\.profile_pic/g) || []).length === 2, 'admin Users: both lists (pending and directory) carry the photo');
const learnerCards = allSrc.filter(([, src]) => /avatar: `\$\{row\.first_name\} \$\{row\.last_name\}`/.test(src));
assert(learnerCards.length >= 4 && learnerCards.every(([, src]) => !/avatarPhoto/.test(src)), `learner cards (${learnerCards.length}) never carry a photo — students have none`);

console.log(`\nproof-photo-url: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
