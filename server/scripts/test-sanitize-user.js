/**
 * Unit test for utils/sanitizeUser.js — tests the function directly, not
 * through HTTP. No current endpoint produces a row with an aliased password
 * column (creator_password, sender_password, etc.), so an HTTP-level test
 * would only appear to check the fix; this exercises the actual gap the
 * Messages module will trigger (JOIN users twice, for sender and receiver).
 *
 * Usage: npm run test:sanitize
 */
const { sanitizeUser } = require('../utils/sanitizeUser');

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nsanitizeUser unit tests\n');

const plainPassword = sanitizeUser({ id: 1, login_id: 'ADMIN001', password: '$2a$10$hash' });
assert(!('password' in plainPassword), 'Strips the literal "password" key');
assert(plainPassword.id === 1 && plainPassword.login_id === 'ADMIN001', 'Leaves other fields untouched');

// The actual gap this fix closes: a JOIN aliasing the hash to a different
// name. Messages will JOIN users twice — sender and receiver — this is
// exactly that shape.
const aliased = sanitizeUser({
  id: 5,
  name: 'Test Teacher',
  creator_password: '$2a$10$creatorhash',
});
assert(!('creator_password' in aliased), 'Strips an aliased key (creator_password) — the actual JOIN gap');
assert(aliased.id === 5 && aliased.name === 'Test Teacher', 'Leaves other fields untouched on the aliased case');

const multipleAliases = sanitizeUser({
  id: 1,
  sender_id: 2,
  sender_name: 'Sender',
  sender_password: '$2a$10$senderhash',
  receiver_id: 3,
  receiver_name: 'Receiver',
  receiver_password: '$2a$10$receiverhash',
});
assert(
  !('sender_password' in multipleAliases) && !('receiver_password' in multipleAliases),
  'Strips multiple differently-aliased password keys in the same row (the Messages shape)'
);
assert(
  multipleAliases.sender_name === 'Sender' && multipleAliases.receiver_name === 'Receiver',
  'Leaves both non-password fields from a double JOIN untouched'
);

const caseVariants = sanitizeUser({
  id: 1,
  PASSWORD: 'x',
  Password_Hash: 'y',
  u2Password: 'z',
});
assert(
  !('PASSWORD' in caseVariants) && !('Password_Hash' in caseVariants) && !('u2Password' in caseVariants),
  'Strips regardless of case (PASSWORD, Password_Hash, u2Password)'
);

const noPasswordField = sanitizeUser({ id: 1, name: 'No password column here' });
assert(Object.keys(noPasswordField).length === 2, 'A row with no password-like key is returned unchanged');

const nullish = sanitizeUser(null);
assert(nullish === null, 'null input returns null rather than throwing');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
