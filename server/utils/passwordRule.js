// The one password rule, applied wherever a password is SET: PUT /auth/
// change-password (new_password), POST /users/teachers and POST /users/parents
// (password). It is never applied where a password is CHECKED — login and the
// restore step-up compare against the stored hash and nothing else — so every
// account that predates the rule keeps working until it next sets a password.
//
// Darryl, 2026-09-18: at least 8 characters AND at least one number. No forced
// change, no new column, no new screen. The client mirrors these two checks
// as a live checklist (client/src/format/passwordRule.js); this file is what
// actually decides.
//
// The message is identical at all three set-points on purpose, and the
// handler that rejects also names the field it rejected (`field`), so a
// client can put the message under the right input instead of a shared slot.

const MIN_LENGTH = 8;

const PASSWORD_RULE_MESSAGE = `Password must be at least ${MIN_LENGTH} characters and include at least one number.`;

// Returns null when the value satisfies the rule, otherwise the message to
// send. Accepts anything the body might carry; a non-string never passes.
function validateNewPassword(value) {
  if (typeof value !== 'string') return PASSWORD_RULE_MESSAGE;
  if (value.length < MIN_LENGTH) return PASSWORD_RULE_MESSAGE;
  if (!/\d/.test(value)) return PASSWORD_RULE_MESSAGE;
  return null;
}

module.exports = { MIN_LENGTH, PASSWORD_RULE_MESSAGE, validateNewPassword };
