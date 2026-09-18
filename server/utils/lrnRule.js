// The LRN rule: a DepEd Learner Reference Number is exactly 12 digits.
// Applied ONLY where an LRN is CREATED — POST /students. PUT /students/:id
// never changes an LRN, login never validates one (a parent's login_id IS the
// child's LRN, compared as a string), and POST /users/parents only looks a
// student up by it. So the three seeded students (8, 7 and 7 digits) and any
// row created before 2026-09-18 keep working untouched; only a NEW student
// must carry a real 12-digit LRN.
//
// Found the hard way: student 154 was enrolled as "Test Student" — twelve
// characters with a space, which fit VARCHAR(12) — and that string became a
// parent login id. The client mirrors this check (client/src/format/lrnRule.js);
// this file decides.

const LRN_LENGTH = 12;
const LRN_RULE_MESSAGE = `LRN must be exactly ${LRN_LENGTH} digits.`;

// Returns null when `value` is a valid LRN, otherwise the message to send.
function validateLrn(value) {
  if (typeof value !== 'string') return LRN_RULE_MESSAGE;
  return /^\d{12}$/.test(value.trim()) ? null : LRN_RULE_MESSAGE;
}

module.exports = { LRN_LENGTH, LRN_RULE_MESSAGE, validateLrn };
