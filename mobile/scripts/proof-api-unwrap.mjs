// PROOF — the api client's pure parts, driven without a request (Stage 5
// scaffold, 2026-09-27). `src/api/client.js` imports only axios, so Node can
// load it; the request interceptor's token provider and the 401 listener are
// injected by files this proof never imports. Run from `mobile/`:
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-api-unwrap.mjs
//
// What it cannot prove, said here so a green run is not over-read: the
// interceptors themselves firing (that needs a request — the phone check),
// and SecureStore (native). It proves the CONTRACT the web's axios.js states:
// unwrap is mandatory, a missing key throws naming what was missing and what
// came back, the array form copies only the keys it is given, raw returns the
// response, and only a 401 off /auth/login ends a session.
import { endsSession, listParams, logoutReasonFor, readBody, SOCKET_ORIGIN, API_BASE_URL } from '../src/api/client.js';

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
function throwsWith(fn, fragment) {
  try {
    fn();
    return false;
  } catch (err) {
    return String(err.message).includes(fragment);
  }
}

console.log('readBody — unwrap');
assert(readBody({ unwrap: 'students', url: '/students' }, { success: true, students: [1, 2] }).value.length === 2, 'string unwrap returns the named value');
const multi = readBody({ unwrap: ['grade', 'descriptor'], url: '/grades/7' }, { success: true, grade: { id: 7 }, descriptor: null, grade_components: [] }).value;
assert(multi.grade.id === 7 && multi.descriptor === null, 'array unwrap returns the named keys');
assert(!('grade_components' in multi), 'array unwrap COPIES ONLY THE KEYS NAMED — a forgotten key is silently absent (DV3, the term_averages lesson)');
assert(readBody({ raw: true, url: '/health' }, { anything: 1 }).raw === true, 'raw returns the response, not a value');

console.log('readBody — refusals');
assert(throwsWith(() => readBody({ url: '/students' }, { students: [] }), 'must pass { unwrap'), 'no unwrap and no raw throws');
assert(
  throwsWith(() => readBody({ unwrap: 'students', url: '/students' }, { success: true, rows: [] }), 'expected key(s) [students]') &&
    throwsWith(() => readBody({ unwrap: 'students', url: '/students' }, { success: true, rows: [] }), 'got [success, rows]'),
  'a missing key throws naming what was missing AND what came back'
);
assert(throwsWith(() => readBody({ unwrap: 'user', url: '/auth/me' }, null), 'got [nothing]'), 'a null body throws with "nothing"');
assert(throwsWith(() => readBody({ unwrap: ['token', 'user'], url: '/auth/login' }, { token: 'x' }), 'expected key(s) [user]'), 'array form names only the keys that are missing');

console.log('the 401 rule');
assert(endsSession(401, '/students') === true, '401 on an ordinary request ends the session');
assert(endsSession(401, '/auth/login') === false, '401 on /auth/login does NOT (a wrong password stays on the form)');
assert(endsSession(403, '/grades/7/lock') === false, 'a 403 never ends a session (§2)');
assert(endsSession(503, '/auth/me') === false, 'a 503 never ends a session (fix/auth-503)');
assert(endsSession(undefined, '/students') === false, 'no response never ends a session');

console.log('the logout reason');
assert(logoutReasonFor('Account is not active.') === 'Account is not active.', 'a human-readable 401 passes through');
assert(logoutReasonFor('Session invalidated by a database restore. Please log in again.').startsWith('Session invalidated'), 'the restore 401 passes through');
assert(logoutReasonFor('Invalid or expired token.') === 'Your session has ended. Please log in again.', 'a token-shaped 401 becomes the one sentence');
assert(logoutReasonFor(undefined) === 'Your session has ended. Please log in again.', 'no message becomes the one sentence');

console.log('pagination helpers and the base URL');
assert(JSON.stringify(listParams()) === JSON.stringify({ limit: 50, offset: 0 }), 'listParams default is limit 50, offset 0, no sort');
assert(listParams({ offset: 50, sort: { key: 'name', dir: 'desc' } }).order === 'desc', 'listParams passes sort and order');
assert(listParams({ sort: { key: 'name', dir: 'sideways' } }).order === 'asc', 'an unknown direction is asc');
assert(SOCKET_ORIGIN === API_BASE_URL.replace(/\/api\/?$/, ''), 'the socket origin is the API base without /api');

console.log(`\nproof-api-unwrap: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
