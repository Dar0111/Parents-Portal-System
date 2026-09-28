// THE PURE HALF OF THE WEB'S settings/SchoolSettingsSection.jsx (Stage 5
// branch 4), lifted so scripts/proof-school-settings.mjs can drive it.
//
// ONLY CHANGED KEYS ARE SENT (the web's rule): PATCH /settings validates
// before any write, one transaction, and the activity log names the keys.
// `academic_year` IS NEVER IN THE FORM — it is locked on this page by
// decision (CLAUDE.md KNOWN ISSUES): sections, grading setup and grades are
// keyed on it, and changing the setting moves none of them. The term is not
// a setting at all; the screen derives it from the school calendar.
export const DETAIL_KEYS = ['school_name', 'school_address', 'school_id', 'school_phone', 'school_email', 'facebook_page', 'logo_url'];

export function detailsFrom(stored) {
  return Object.fromEntries(DETAIL_KEYS.map((key) => [key, stored?.[key] ?? '']));
}

// Every draft value is TRIMMED on the way out and compared with what is
// stored; a key whose trimmed value equals the stored one is not sent.
export function changedDetails(stored, draft) {
  const before = detailsFrom(stored);
  const out = {};
  for (const key of DETAIL_KEYS) {
    const next = String(draft?.[key] ?? before[key]).trim();
    if (next !== before[key]) out[key] = next;
  }
  return out;
}

// The web's one client-side refusal; every other rule is the server's.
export function detailsProblem(details) {
  if (!String(details.school_name || '').trim() || !String(details.school_address || '').trim()) {
    return 'School name and school address must not be empty.';
  }
  return null;
}
