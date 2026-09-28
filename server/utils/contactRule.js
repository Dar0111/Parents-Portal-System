// The contact-number rule (Darryl, 2026-09-18; widened 2026-09-29 for SMS):
// optional everywhere it is written, but if given it must be a Philippine
// mobile number, and it is STORED IN ONE FORM ONLY: 09XXXXXXXXX (11 digits).
//
// Accepted input forms, after spaces and dashes are stripped:
//   09XXXXXXXXX      stored as is
//   +639XXXXXXXXX    the international form → 0 + the last ten digits
//   639XXXXXXXXX     the same without the plus → 0 + the last ten digits
// Anything else — letters, another country code, a digit short — is refused
// with CONTACT_RULE_MESSAGE rather than guessed at.
//
// ONE MODULE decides, for every write site: PUT /auth/contact,
// POST /users/teachers, POST /users/parents, PUT /users/:id, POST /students,
// PUT /students/:id. So storage, comparison (a number re-typed in another form
// is NOT a change) and display all see the one stored form. Lookups and rate
// limits never key on the number at all — they key on login_id, user id and
// IP — so they cannot see two forms of it either.
//
// E.164 (+639XXXXXXXXX) exists only at the moment of sending: toE164() is
// called by utils/smsTransport.js and nothing else. The client mirrors the
// normalisation and the check (client/src/format/contactRule.js, copied to
// mobile/) for its hints; this file decides.

const CONTACT_RULE_MESSAGE =
  'Contact number must be a Philippine mobile number: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (for example 0917 123 4567).';

const STORED = /^09\d{9}$/;

// Strips spaces and dashes, then folds the two international forms onto the
// stored one. A value that matches neither is returned compacted, so the
// validator can refuse it.
function normalizeContact(value) {
  const compact = String(value ?? '').replace(/[\s-]/g, '').trim();
  if (/^\+639\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^639\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  return compact;
}

// Takes the raw body value. Returns { value, error }:
//   value  the stored-form string, or null for empty/absent
//   error  null, or the message to send with field "contact_number"
function validateContact(raw) {
  if (raw === undefined || raw === null) return { value: null, error: null };
  const value = normalizeContact(raw);
  if (value === '') return { value: null, error: null };
  if (!STORED.test(value)) return { value: null, error: CONTACT_RULE_MESSAGE };
  return { value, error: null };
}

// The send-time form. null for anything that is not a valid stored number,
// so a caller cannot text a value the rule would have refused.
function toE164(value) {
  const stored = normalizeContact(value);
  return STORED.test(stored) ? `+63${stored.slice(1)}` : null;
}

module.exports = { CONTACT_RULE_MESSAGE, normalizeContact, validateContact, toE164 };
