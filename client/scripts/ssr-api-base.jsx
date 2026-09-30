// THE API BASE proof (feat/lan-web, 2026-10-01).
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-api-base.jsx
// --outDir .ssr-tmp && node .ssr-tmp/ssr-api-base.js`.
//
// Drives api/apiBase.js's pure `resolveApiBase(envValue, location)`:
// VITE_API_BASE_URL wins when set; blank falls through; with no env the base
// is the PAGE's own protocol + host on port 5000 — `localhost:3000` gives
// EXACTLY today's `http://localhost:5000/api`, a LAN IP gives that IP; no page
// (Node) gives the old default. Then the consumers: the axios instance's
// baseURL IS the module's API_BASE_URL, the socket origin is it minus `/api`,
// and a rendered Avatar builds its photo address from it. Negative controls:
// the resolver this replaced (env || localhost) and one that ignores the env
// are each caught by the same checks.
//
// PRINTS NO BASE VALUE: an SSR build reads client/.env, and a .env value is
// never printed — the module constants are compared, not shown.
import { renderToStaticMarkup } from 'react-dom/server';
import api from '../src/api/axios.js';
import { API_BASE_URL, SOCKET_ORIGIN, resolveApiBase } from '../src/api/apiBase.js';
import Avatar from '../src/components/Avatar.jsx';
import { photoUrl } from '../src/format/photoUrl.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}`);
  }
}

const page = (href) => {
  const u = new URL(href);
  return { protocol: u.protocol, hostname: u.hostname };
};
const TODAY = 'http://localhost:5000/api';
const LOCAL = page('http://localhost:3000/teacher');
const LAN = page('http://192.168.137.1:3000/parent');

// The cases every resolver must pass; run against the real one and the two
// mutants below.
function cases(resolve) {
  return [
    [resolve('http://10.0.0.9:5000/api', LAN) === 'http://10.0.0.9:5000/api', 'VITE_API_BASE_URL set → it wins over the page'],
    [resolve('  http://10.0.0.9:5000/api  ', LOCAL) === 'http://10.0.0.9:5000/api', 'a set value is trimmed'],
    [resolve('   ', LAN) === 'http://192.168.137.1:5000/api', 'a BLANK value falls through to the page'],
    [resolve(undefined, LOCAL) === TODAY, 'no env, the page at localhost:3000 → EXACTLY today’s http://localhost:5000/api'],
    [resolve(undefined, page('http://127.0.0.1:3000/')) === 'http://127.0.0.1:5000/api', 'no env, 127.0.0.1 → 127.0.0.1:5000'],
    [resolve(undefined, LAN) === 'http://192.168.137.1:5000/api', 'no env, a phone’s Chrome at the LAN IP → that IP, port 5000'],
    [resolve(undefined, page('https://portal.example:3000/')) === 'https://portal.example:5000/api', 'an https page keeps https'],
    [resolve(undefined, null) === TODAY, 'no page at all (Node) → the old default'],
    [resolve(undefined, page('file:///C:/x.html')) === TODAY, 'a file: page → the old default'],
  ];
}

console.log('resolveApiBase:\n');
for (const [ok, label] of cases(resolveApiBase)) assert(ok, label);

console.log('\nnegative controls — the same checks must catch a wrong resolver:\n');
const oldResolver = (env) => env || TODAY; // what axios.js and SocketProvider did before
const ignoresEnv = (_env, loc) => resolveApiBase(undefined, loc);
const failedOld = cases(oldResolver).filter(([ok]) => !ok).map(([, l]) => l);
const failedIgnore = cases(ignoresEnv).filter(([ok]) => !ok).map(([, l]) => l);
assert(failedOld.some((l) => /LAN IP/.test(l)), `the old env-or-localhost resolver fails the LAN case (${failedOld.length} caught)`);
assert(failedIgnore.some((l) => /wins over the page/.test(l)), `a resolver that ignores the env fails "env wins" (${failedIgnore.length} caught)`);

console.log('\nthe consumers use the ONE decision:\n');
assert(typeof API_BASE_URL === 'string' && /\/api\/?$/.test(API_BASE_URL), 'API_BASE_URL is a URL ending in /api');
assert(api.defaults.baseURL === API_BASE_URL, 'the axios instance’s baseURL IS API_BASE_URL');
assert(SOCKET_ORIGIN === API_BASE_URL.replace(/\/api\/?$/, '') && !SOCKET_ORIGIN.endsWith('/api'), 'the socket origin is the same host without /api');
const GOOD = '0123456789abcdef0123456789abcdef.jpg';
const markup = renderToStaticMarkup(<Avatar name="Maria Santos" photo={GOOD} />);
const expected = photoUrl(GOOD, API_BASE_URL);
assert(expected !== null && markup.includes(`src="${expected}"`), 'a rendered Avatar’s photo address is built from API_BASE_URL');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
