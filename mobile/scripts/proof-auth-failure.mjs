// PROOF — §22 on the phone: what a failed /auth/me means, driven with the
// four error shapes axios produces (Stage 5 scaffold, 2026-09-27). The module
// is a verbatim copy of the web's (check-mirrors proves that); this proof
// says the copy still answers the same way under Node, which is what the
// mobile AuthContext relies on. Run from `mobile/`:
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-auth-failure.mjs
//
// It cannot render AuthUnavailable (no RN under Node) — that screen's copy
// ("Your session is kept", no "log in" wording) is the phone check.
import { classifyAuthFailure } from '../src/auth/authFailure.js';

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

const with401 = { response: { status: 401, data: { success: false, message: 'Invalid or expired token.' } } };
const with503 = { response: { status: 503, data: { success: false, message: 'Database unreachable.' } } };
const with403 = { response: { status: 403, data: { success: false, message: 'Access denied.' } } };
const network = { code: 'ERR_NETWORK', request: {} };
const timeout = { code: 'ECONNABORTED', request: {} };

console.log('the four shapes');
assert(classifyAuthFailure(with401) === 'unauthenticated', '401 → unauthenticated (logout)');
assert(classifyAuthFailure(with503) === 'unavailable', '503 → unavailable (token kept)');
assert(classifyAuthFailure(network) === 'unavailable', 'no response (ERR_NETWORK) → unavailable');
assert(classifyAuthFailure(timeout) === 'unavailable', 'the 15 s timeout (ECONNABORTED) → unavailable');

console.log('negative controls');
assert(classifyAuthFailure(with401) !== 'unavailable', 'a 401 is never "keep"');
assert(classifyAuthFailure(with403) === 'unavailable', 'a 403 is never a logout (§2)');
assert(classifyAuthFailure(undefined) === 'unavailable', 'undefined keeps the token');
assert(classifyAuthFailure({ response: {} }) === 'unavailable', 'a response with no status keeps the token');

console.log(`\nproof-auth-failure: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
