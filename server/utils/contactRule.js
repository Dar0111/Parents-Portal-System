// The contact-number rule (Darryl, 2026-09-18): optional everywhere it is
// written, but if given it must be a Philippine mobile number — exactly 11
// digits starting with 09 — and it is STORED AS DIGITS ONLY. Spaces and
// dashes are stripped before validating, so "0917 123 4567" and
// "0917-123-4567" are accepted and saved as 09171234567.
//
// One module for every write site: PUT /auth/contact, POST /users/teachers,
// POST /users/parents, PUT /users/:id, POST /students, PUT /students/:id. The
// client mirrors the normalisation and the check (client/src/format/
// contactRule.js) for its hints; this file decides. Every live row already
// satisfied the rule on 2026-09-18 (all seven users' numbers; students held
// none), so nothing existing is invalidated.

const CONTACT_RULE_MESSAGE = 'Contact number must be 11 digits starting with 09 (for example 09171234567).';

// Strips spaces and dashes only — a "+63" prefix or letters stay, and then
// fail validation, because guessing at them would be inventing a rule.
function normalizeContact(value) {
  return String(value ?? '').replace(/[\s-]/g, '').trim();
}

// Takes the raw body value. Returns { value, error }:
//   value  the digits-only string to store, or null for empty/absent
//   error  null, or the message to send with field "contact_number"
function validateContact(raw) {
  if (raw === undefined || raw === null) return { value: null, error: null };
  const value = normalizeContact(raw);
  if (value === '') return { value: null, error: null };
  if (!/^09\d{9}$/.test(value)) return { value: null, error: CONTACT_RULE_MESSAGE };
  return { value, error: null };
}

module.exports = { CONTACT_RULE_MESSAGE, normalizeContact, validateContact };
