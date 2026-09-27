// The client's copy of the LRN rule — exactly 12 digits, the same check
// server/utils/lrnRule.js enforces on POST /students. Single source for the
// rule's words on the client: the enroll wizard renders `lrnRuleHint()` and
// `lrnError()`, never a hardcoded "12". The server decides; its 400 carries
// field "lrn" and the page shows that message under the field.
//
// Only a NEW student is checked. Seeded and older rows keep their shorter
// LRNs, and a parent still logs in with whatever LRN the child has.

export const LRN_LENGTH = 12;

export function lrnRuleHint() {
  return `Exactly ${LRN_LENGTH} digits, from the learner's DepEd record.`;
}

export function lrnIsValid(value) {
  return typeof value === 'string' && new RegExp(`^\\d{${LRN_LENGTH}}$`).test(value.trim());
}

// null when valid or empty (required-ness is the form's call), else the message.
export function lrnError(value) {
  if (!value || !String(value).trim()) return null;
  return lrnIsValid(String(value)) ? null : `LRN must be exactly ${LRN_LENGTH} digits.`;
}
