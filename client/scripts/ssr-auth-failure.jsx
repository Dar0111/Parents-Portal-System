// PROOF — pre-Stage-5 #4 (b): a failed /auth/me keeps the session unless the
// server said 401.
//
// An SSR render cannot fire a request, so the effect path (the token still in
// localStorage after a refresh during an outage) is the BROWSER CHECK
// (DevTools → Network → Offline → refresh). What CAN be proved is the
// decision the effect delegates to — `classifyAuthFailure`, a pure function
// driven here with the shapes axios actually produces — and the panel that
// replaces the logout, rendered and read.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-auth-failure.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-auth-failure.js

import { renderToStaticMarkup } from 'react-dom/server';
import { classifyAuthFailure } from '../src/auth/authFailure.js';
import AuthUnavailable from '../src/auth/AuthUnavailable.jsx';

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

console.log('\nclassifyAuthFailure — the four shapes axios produces:');

// 1. The server answered 401: the ONLY dead-session signal.
assert(
  classifyAuthFailure({ response: { status: 401, data: { success: false, message: 'Invalid or expired token.' } } }) ===
    'unauthenticated',
  'a 401 response is unauthenticated (log out)'
);
// 2. The server answered, but with a 5xx — it is up and broken, the session is not known to be dead.
assert(
  classifyAuthFailure({ response: { status: 503, data: { success: false, message: 'Database unreachable.' } } }) ===
    'unavailable',
  'a 503 response is unavailable (keep the token)'
);
// 3. No response at all — ECONNREFUSED / offline / CORS: axios sets `request` and no `response`.
assert(
  classifyAuthFailure({ request: {}, code: 'ERR_NETWORK', message: 'Network Error' }) === 'unavailable',
  'no response (ERR_NETWORK) is unavailable (keep the token)'
);
// 4. A hung request that a timeout cut — same shape, different code.
assert(
  classifyAuthFailure({ request: {}, code: 'ECONNABORTED', message: 'timeout of 0ms exceeded' }) === 'unavailable',
  'a timeout (ECONNABORTED) is unavailable (keep the token)'
);
// NEGATIVE CONTROLS — the one mistake this function must never make in
// either direction.
assert(classifyAuthFailure({ response: { status: 401 } }) !== 'unavailable', 'NEGATIVE CONTROL: a 401 is never "keep"');
assert(
  classifyAuthFailure({ response: { status: 403, data: { code: 'MUST_CHANGE_PASSWORD' } } }) === 'unavailable',
  'a 403 is NOT a logout — a forced password change is a flag on the row, and §2 says a 403 never redirects'
);
assert(classifyAuthFailure(undefined) === 'unavailable', 'an undefined error (a thrown client bug) keeps the token rather than guessing at a logout');

console.log('\nAuthUnavailable — the panel that replaces the logout:');
const html = renderToStaticMarkup(
  <AuthUnavailable message="Cannot reach the server. Check that the API is running." onRetry={() => {}} />
);
// React escapes the apostrophe in static markup (&#x27;), so the check is
// tolerant of either spelling rather than of neither.
assert(/Can(?:'|&#x27;|&#39;)t reach the school server/.test(html), 'names the condition');
assert(html.includes('Your session is kept'), 'says the session is kept — the whole point');
assert(html.includes('Cannot reach the server. Check that the API is running.'), 'the reason is the API/offline wording, unrewritten (§2)');
assert(/role="alert"/.test(html), 'the reason is a role="alert" (ErrorAlert)');
assert(/<button[^>]*>Try again<\/button>/.test(html), 'offers Try again as a real button');
assert(!/log ?in|sign ?in/i.test(html), 'NEGATIVE CONTROL: no "log in" / "sign in" wording — the copy must not undo the fix');
assert(!/href=/.test(html), 'NEGATIVE CONTROL: no link away — retry happens in place');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
