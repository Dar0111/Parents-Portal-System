// PROFILE PHOTO render proof (feat/profile-photos, 2026-09-30).
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-avatar.jsx --outDir
// .ssr-tmp && node .ssr-tmp/ssr-avatar.js`.
//
// What it proves, by RENDERING the real components and calling the real
// helper: format/photoUrl.js builds '<origin>/uploads/avatars/<name>' from the
// API base and REFUSES anything but 32 lowercase hex + '.jpg' (so a stray or
// hostile value never becomes a request, and a login-id-shaped name is not a
// photo); Avatar renders an <img alt="" aria-hidden> for a good name and the
// initials for none or a bad one — the bad name nowhere in the markup;
// PersonCell and a DataTable card carry the photo through `photo` /
// `avatarPhoto`. Controls both ways: the good name IS in the markup, a card
// WITHOUT avatarPhoto has no <img>.
//
// What it CANNOT prove, said so a green run is not over-read: the fallback
// on a load error. `onError` is an event, and renderToStaticMarkup fires
// none — the browser check removes a file by hand and watches the initials
// come back.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Avatar, { PersonCell } from '../src/components/Avatar.jsx';
import DataTable from '../src/components/DataTable.jsx';
import { photoUrl } from '../src/format/photoUrl.js';
import { API_BASE_URL } from '../src/api/apiBase.js';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

const GOOD = '0123456789abcdef0123456789abcdef.jpg';
const BASE = 'http://localhost:5000/api';

console.log('photoUrl — the address, and what it refuses:\n');
assert(photoUrl(GOOD, BASE) === `http://localhost:5000/uploads/avatars/${GOOD}`, 'the API base loses /api; the photo sits under /uploads/avatars');
assert(photoUrl(GOOD, 'http://192.168.1.5:5000/api/') === `http://192.168.1.5:5000/uploads/avatars/${GOOD}`, 'a trailing slash on the base is fine (the phone’s LAN address)');
assert(photoUrl(GOOD, 'http://localhost:5000') === `http://localhost:5000/uploads/avatars/${GOOD}`, 'a base without /api is used as the origin');
assert(photoUrl(GOOD, '/api') === `/uploads/avatars/${GOOD}`, 'a relative base gives a relative address');
const refused = [
  [null, 'null (no photo)'],
  ['', 'an empty string'],
  [GOOD.toUpperCase(), 'upper-case hex'],
  [GOOD.slice(1), '31 hex characters'],
  [GOOD.replace('.jpg', '.png'), 'another extension'],
  ['../../server/.env', 'a path'],
  ['100000000009.jpg', 'a login-id-shaped name'],
  [`${GOOD}?x=1`, 'a query string'],
  [42, 'a number'],
];
for (const [name, label] of refused) assert(photoUrl(name, BASE) === null, `refuses ${label}`);
assert(photoUrl(GOOD, '') === null && photoUrl(GOOD, undefined) === null, 'no base → null');

console.log('\nAvatar:\n');
const withPhoto = render(<Avatar name="Maria Santos" photo={GOOD} />);
assert(/<img\b/.test(withPhoto), 'a good name renders an <img>');
const expectedSrc = photoUrl(GOOD, API_BASE_URL);
assert(expectedSrc !== null && withPhoto.includes(`src="${expectedSrc}"`), 'CONTROL: its src is the built address (the name reaches the markup)');
assert(/alt=""/.test(withPhoto) && /aria-hidden="true"/.test(withPhoto), 'alt="" and aria-hidden — the name is beside it as text');
assert(/rounded-full/.test(withPhoto) && /object-cover/.test(withPhoto), 'a round, cropped image');
assert(!/>MS</.test(withPhoto), 'no initials when the photo shows');

const noPhoto = render(<Avatar name="Maria Santos" photo={null} />);
assert(!/<img\b/.test(noPhoto) && />MS</.test(noPhoto), 'no photo → the initials, no <img>');

const badName = '../../server/.env';
const bad = render(<Avatar name="Maria Santos" photo={badName} />);
assert(!/<img\b/.test(bad) && />MS</.test(bad), 'a bad name → the initials');
assert(!bad.includes('server/.env') && !bad.includes('.env'), 'NEGATIVE CONTROL: the bad value is nowhere in the markup');

const lrnShaped = render(<Avatar name="Ligaya Halimbawa" photo="100000000009.jpg" />);
assert(!/<img\b/.test(lrnShaped) && !lrnShaped.includes('100000000009'), 'a login-id-shaped value is not a photo and never reaches the markup');

assert(render(<Avatar name="" photo={null} />) === '', 'no name and no photo → nothing at all');
assert(/<img\b/.test(render(<Avatar name="" photo={GOOD} />)), 'a photo with no name still shows');

const large = render(<Avatar name="Maria Santos" photo={GOOD} size="lg" />);
const largeInitials = render(<Avatar name="Maria Santos" size="lg" />);
assert(/\bh-20\b/.test(large) && /\bw-20\b/.test(large) && !/h-\[2\.375rem\]/.test(large), 'size="lg" is 5rem, the row size is not also applied');
assert(/\bh-20\b/.test(largeInitials) && /\btext-xl\b/.test(largeInitials), 'lg initials are 5rem with larger letters');
assert(/h-\[2\.375rem\]/.test(noPhoto) && /\btext-xs\b/.test(noPhoto), 'the default stays the row size');

console.log('\nPersonCell and a DataTable card:\n');
const cell = render(<PersonCell name="Maria Santos" secondary="You" photo={GOOD} />);
assert(/<img\b/.test(cell) && cell.includes('Maria Santos') && cell.includes('You'), 'PersonCell: the photo, the name, the second line');
const cellNone = render(<PersonCell name="Maria Santos" secondary="You" />);
assert(!/<img\b/.test(cellNone) && />MS</.test(cellNone), 'PersonCell without a photo: initials (every existing caller)');

const rows = [
  { id: 1, name: 'Maria Santos', pic: GOOD },
  { id: 2, name: 'Jose Rizal', pic: null },
];
const table = render(
  <DataTable
    columns={[{ key: 'name', header: 'Name', render: (r) => r.name }]}
    rows={rows}
    rowKey={(r) => r.id}
    renderCard={(r) => ({ avatar: r.name, avatarPhoto: r.pic, title: r.name })}
  />
);
const imgs = table.match(/<img\b[^>]*>/g) || [];
assert(imgs.length === 1 && imgs[0].includes(GOOD), 'the card with avatarPhoto shows the photo — exactly one <img> in the list');
assert(/>JR</.test(table), 'CONTROL: the card without one shows initials');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
