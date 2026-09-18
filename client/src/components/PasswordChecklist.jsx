import { PASSWORD_RULES, passwordIsValid } from '../format/passwordRule';

// The live password checklist — one rule per line, grey until it passes,
// green after — read from format/passwordRule.js so a rule change edits that
// module and nothing here. Rendered UNDER the New password / Password field
// (PasswordField's `below`) in every password-setting form: Settings →
// Change password, Admin → Users → Create teacher, Student detail → Create
// parent account, the enroll wizard's parent step.
//
// aria-live="polite": a screen reader hears a rule flip without being
// interrupted mid-word. The list is present from the first keystroke, so the
// number of lines never changes — nothing jumps.
//
// "Passwords do not match." is NOT here. It belongs under the Confirm field
// (PasswordField `error`, which also gives that field the red border), so the
// page passes `confirmError(value, confirm)` there. Shown only once the
// confirm field has something in it — an empty confirm is unfinished, not
// wrong.
//
// THE TWO HELPER EXPORTS BELOW COST TWO oxlint WARNINGS (react/only-export-
// components, 39 -> 41) and are kept deliberately, for the reason FormStatus
// records for its `ok`/`fail`: the rule is about Fast Refresh, and a misnamed
// helper is a build error while a re-derived comparison at four call sites is
// a silent one. Moving them to format/passwordRule.js would edit Branch A's
// merged file from this branch; not done.
export const PASSWORD_MISMATCH = 'Passwords do not match.';

export function confirmError(value, confirm) {
  return confirm && confirm !== value ? PASSWORD_MISMATCH : null;
}

// Submit / Continue stays disabled until this is true: every rule passes and
// the confirmation matches. The server still decides (its 400 names the
// field); this only stops a request that would certainly be refused.
export function passwordFormReady(value, confirm) {
  return passwordIsValid(value) && confirm === value;
}

export default function PasswordChecklist({ value, id }) {
  return (
    <ul id={id} aria-live="polite" className="mt-2 space-y-1 text-sm">
      {PASSWORD_RULES.map((rule) => {
        const passes = rule.test(value);
        return (
          <li
            key={rule.key}
            className={`flex items-center gap-2 ${passes ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            <i
              className={`fa-solid ${passes ? 'fa-circle-check text-emerald-600' : 'fa-circle text-slate-300'} text-xs`}
              aria-hidden="true"
            />
            <span>
              {rule.label}
              <span className="sr-only">{passes ? ' — met' : ' — not yet'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
