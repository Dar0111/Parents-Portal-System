// The client's copy of the contact-number rule — the same normalisation and
// check as server/utils/contactRule.js: optional, but if given, exactly 11
// digits starting with 09 after spaces and dashes are stripped. Every form
// that writes a contact number renders `contactRuleHint()` and validates
// with `contactError()`; none carries a hardcoded "11" or "09". The server
// decides — its 400 carries field "contact_number" — and stores digits only.

export function normalizeContact(value) {
  return String(value ?? '').replace(/[\s-]/g, '').trim();
}

export function contactRuleHint() {
  return 'Optional. 11 digits starting with 09, for example 0917 123 4567 — spaces and dashes are fine.';
}

export function contactIsValid(value) {
  const digits = normalizeContact(value);
  return digits === '' || /^09\d{9}$/.test(digits);
}

// null when valid or empty, else the message.
export function contactError(value) {
  return contactIsValid(value) ? null : 'Contact number must be 11 digits starting with 09 (for example 09171234567).';
}
