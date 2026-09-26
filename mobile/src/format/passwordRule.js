// The client's copy of the one password rule — the same two checks
// server/utils/passwordRule.js enforces wherever a password is SET (change
// password, create teacher, create parent). This module is the single source
// for the rule's labels: pages render `PASSWORD_RULES[i].label` and
// `passwordRuleHint()`, never a hardcoded "8" or "number" string, so a rule
// change edits this file and the server's, nothing else.
//
// The client checks are a courtesy (a live checklist, a disabled submit); the
// server decides. A response with `field: "password"` / `"new_password"` is
// the server refusing what this module let through, and the page shows that
// message under the field.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  {
    key: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: 'number',
    label: 'At least one number',
    test: (value) => typeof value === 'string' && /\d/.test(value),
  },
];

// One sentence for a plain `hint`, built from the labels above.
export function passwordRuleHint() {
  return PASSWORD_RULES.map((r, i) => (i === 0 ? r.label : r.label.charAt(0).toLowerCase() + r.label.slice(1))).join(' and ') + '.';
}

// The rules `value` fails, in display order. Empty array = passes.
export function passwordFailures(value) {
  return PASSWORD_RULES.filter((r) => !r.test(value));
}

export function passwordIsValid(value) {
  return passwordFailures(value).length === 0;
}
