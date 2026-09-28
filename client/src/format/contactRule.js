// The client's copy of the contact-number rule — the same normalisation and
// check as server/utils/contactRule.js: optional, but if given, a Philippine
// mobile number in one of three forms — 09XXXXXXXXX, +639XXXXXXXXX or
// 639XXXXXXXXX — after spaces and dashes are stripped (widened for SMS,
// 2026-09-29). Every form that writes a contact number renders
// `contactRuleHint()` and validates with `contactError()`; none carries a
// hardcoded "11" or "09". The server decides — its 400 carries field
// "contact_number" — and stores the one form, 09XXXXXXXXX.

export function normalizeContact(value) {
  const compact = String(value ?? '').replace(/[\s-]/g, '').trim();
  if (/^\+639\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^639\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  return compact;
}

export function contactRuleHint() {
  return 'Optional. A Philippine mobile number, for example 0917 123 4567 or +63 917 123 4567 — spaces and dashes are fine.';
}

export function contactIsValid(value) {
  const digits = normalizeContact(value);
  return digits === '' || /^09\d{9}$/.test(digits);
}

// null when valid or empty, else the message.
export function contactError(value) {
  return contactIsValid(value)
    ? null
    : 'Contact number must be a Philippine mobile number: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (for example 0917 123 4567).';
}
