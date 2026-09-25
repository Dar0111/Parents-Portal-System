// The email rule (pre-Stage-5 #4, 2026-09-25): optional everywhere it is
// written, but if given it must look like an address the mailer can deliver
// to — one @, no whitespace, a domain with at least one dot, ASCII only —
// and it is stored TRIMMED, never re-cased. The local part of an address is
// case-sensitive by the letter of the RFC, nothing here compares two emails,
// and PUT /users/:id un-verifies an address on ANY change (`<=>`), so folding
// case would turn "the same address typed differently" into a lost
// verification. Same shape as utils/contactRule.js: { value, error }.
//
// One module for every write site: POST /users/teachers, POST /users/parents,
// PUT /users/:id. PUT /auth/contact deliberately excludes email (identity,
// routes/auth.js), and settings has no email key yet — the school email
// field (pre-Stage-5 (f)) should validate through this same function.
//
// What is REJECTED, and why each is a refusal rather than a repair:
//   - internal whitespace          "ana reyes@x.com"   — never an address
//   - no @, or two @                                   — never an address
//   - a domain with no dot         "user@localhost"    — not routable from here
//   - a bare TLD / empty label     "user@.com"         — never an address
//   - anything non-ASCII                                — the transport does no
//                                                        IDN/punycode; accepting
//                                                        it would store what it
//                                                        cannot send to
//   - longer than 100 characters                        — users.email VARCHAR(100)
// Every seeded address (the four @chfes.edu.ph, the three parent
// @email.com) passes, so nothing existing is invalidated.

const EMAIL_RULE_MESSAGE = 'Email must look like name@example.com.';
const EMAIL_MAX_LENGTH = 100;

// Deliberately plain: a local part of the usual characters, then labels of
// letters/digits/hyphens separated by dots, at least two labels. Not a full
// RFC 5322 grammar — quoted local parts and IP-literal domains are refused,
// and no school account will ever carry one.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// Takes the raw body value. Returns { value, error }:
//   value  the trimmed address to store, or null for empty/absent
//   error  null, or the message to send with field "email"
function validateEmail(raw) {
  if (raw === undefined || raw === null) return { value: null, error: null };
  const value = String(raw).trim();
  if (value === '') return { value: null, error: null };
  if (value.length > EMAIL_MAX_LENGTH) return { value: null, error: EMAIL_RULE_MESSAGE };
  if (!EMAIL_PATTERN.test(value)) return { value: null, error: EMAIL_RULE_MESSAGE };
  return { value, error: null };
}

module.exports = { EMAIL_RULE_MESSAGE, EMAIL_MAX_LENGTH, validateEmail };
