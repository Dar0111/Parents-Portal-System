// PROOF — Admin → Users' pure half (Stage 5 branch 4, M17). Drives
// `admin/users/logic.js`: the login-id mask (§5c), the filter params, the
// row's actions (own account, the toggle between active and inactive only),
// the create-teacher checks in the web's order, and the review's refusal and
// words. What it cannot: the temporary password's popup, the screen-capture
// block, AppState — the phone (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-admin-users.mjs
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const L = await import('../src/screens/admin/users/logic.js');

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

console.log('maskLoginId — a parent\'s login id is a learner\'s LRN (§5c)');
assert(L.maskLoginId({ role: 'parent', login_id: '136893260001' }) === '••••0001', 'a parent shows the last four only');
assert(L.maskLoginId({ role: 'parent', login_id: '1234' }) === '••••', 'a short parent id is hidden outright');
assert(L.maskLoginId({ role: 'teacher', login_id: 'TCH-001' }) === 'TCH-001' && L.maskLoginId({ role: 'admin', login_id: 'ADMIN001' }) === 'ADMIN001', 'staff ids stay whole');

console.log('filters');
assert(JSON.stringify(L.userListParams({ role: 'teacher', status: '', search: 'Santos' })) === '{"role":"teacher","search":"Santos"}', 'an empty filter is not sent');
assert(!L.canResetUsers(L.EMPTY_FILTERS) && L.directoryEmpty(L.EMPTY_FILTERS).title === 'No users yet' && L.directoryEmpty({ role: 'admin' }).showReset, 'two empty branches from the applied values (§5f)');

console.log('rowActions');
const me = 1;
const self = L.rowActions({ id: 1, status: 'active' }, me);
assert(!self.reset && self.toggle === null && self.selfNote === 'You cannot deactivate yourself', 'your own active account: no Reset, no Deactivate, the note instead');
assert(L.rowActions({ id: 9, status: 'active' }, me).toggle === 'inactive' && L.rowActions({ id: 9, status: 'inactive' }, me).toggle === 'active', 'another account toggles between active and inactive');
assert(L.rowActions({ id: 9, status: 'pending' }, me).toggle === null && L.rowActions({ id: 9, status: 'rejected' }, me).toggle === null, 'pending and rejected are the review\'s, not a toggle');

console.log('create teacher — the web\'s order');
const blank = { login_id: '', password: '', name: '', email: '', contact_number: '' };
assert(L.createTeacherProblem(blank).message === 'login_id, password, and name are required.', 'the required fields first');
assert(L.createTeacherProblem({ ...blank, login_id: 'TCH-TMP-01', name: 'Test', password: 'short' }).field === 'password', 'a weak password lands on the password field');
assert(L.createTeacherProblem({ ...blank, login_id: 'TCH-TMP-01', name: 'Test', password: 'Teacher2026', contact_number: '12' }).field === 'contact_number', 'a bad contact number lands on its field');
const body = L.createTeacherBody({ login_id: ' TCH-TMP-01 ', name: ' Test ', password: 'Teacher2026', email: ' ', contact_number: '' });
assert(body.login_id === 'TCH-TMP-01' && body.name === 'Test' && body.email === undefined && body.contact_number === undefined, 'trimmed, and blank optionals are left out, never sent empty');

console.log('review');
assert(L.reviewProblem('reject', '  ') === 'Rejection reason is required.' && L.reviewProblem('approve', '') === null, 'a rejection needs a reason; an approval does not');
assert(L.reviewConfirmText('approve') === 'Approve this parent account?' && L.reviewDoneText('reject') === 'Parent account rejected.', 'the confirmation and the result use the web\'s words');

console.log(`\nproof-admin-users: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
