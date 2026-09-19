// The initials circle on a person row (DV1, 2026-09-20).
//
// ONLY WHERE A ROW IS A PERSON. Eleven of the twenty-two DataTable consumers
// list people; the rest list posts, subjects, days and files, and giving
// those an avatar would make a backup file look like a member of staff. The
// page decides by passing `avatar` from `renderCard`, or by using this in a
// column's `render` — DataTable never guesses.
//
// NO PHOTOS, AND NOT BECAUSE THEY WOULD BE HARD. `users.profile_pic` exists
// in the schema and is NULL for every row; there is no upload endpoint and
// none is planned before the pilot. Initials are the honest end state here,
// not a placeholder waiting for images — a grey silhouette on every row
// would suggest a photo is missing rather than never offered.
//
// brand-on-brand-soft is an ALREADY-CHECKED contrast pair (it is the active
// nav item), so this adds no row to check-contrast's list and cannot be the
// thing that breaks `lint:contrast`.
//
// SIZES ARE REM, NEVER PX: Settings -> Personalization scales the root font
// size, and `fix/copy-nits` (2026-09-19) already had to convert this
// component's neighbours back from fixed px for exactly that reason.
//
// `h-[2.375rem]` and not `h-9.5`, and the arbitrary value is deliberate:
// THIS TAILWIND VERSION DOES NOT GENERATE FRACTIONAL SPACING STEPS. `h-9.5`
// was written first and simply produced no CSS — checked against the built
// stylesheet, not assumed. 2.375rem IS 38px at the default root and scales
// with it, so this is a rem value in arbitrary-value syntax, not a px escape
// hatch. `h-10` (40px) was the alternative and is 2px off the mockup.

// First letter of the first word plus first letter of the LAST word, so
// "Maria Santos" is MS and "Ana Maria Reyes Cruz" is AC rather than AM.
// A single word gives one letter, not a doubled one. Hyphens and extra
// spaces are separators, so "Jea-Mae  Bargaso" is JB.
// Not exported: a non-component export here costs a
// react(only-export-components) warning, and the initials are observable by
// rendering <Avatar> — which is what the SSR proof does, and is the more
// honest test anyway since it checks what reaches the screen.
function initialsOf(name) {
  if (typeof name !== 'string') return '';
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

export default function Avatar({ name, className = '' }) {
  const initials = initialsOf(name);

  // No name, no circle. An empty disc is a rendering artefact, and a "?"
  // reads as a warning about the person rather than about the data.
  if (!initials) return null;

  return (
    <span
      // aria-hidden: the name is always rendered as text beside this, so a
      // screen reader announcing "MS" first would just be noise.
      aria-hidden="true"
      className={`inline-flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand ${className}`}
    >
      {initials}
    </span>
  );
}

// Name + one secondary line, with the circle — the person cell as the
// mockup draws it. Kept here rather than in DataTable because three pages
// need the same arrangement inside a table cell, where there is no card.
// `nameClass` exists for the two Students tables, where the name is also the
// link to the detail page and has to be `text-brand`. A prop rather than a
// wrapper selector: the caller says what it wants instead of reaching into
// this component's markup with an arbitrary variant that breaks the moment
// the markup changes.
export function PersonCell({ name, secondary, className = '', nameClass = 'text-fg' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Avatar name={name} />
      <div className="min-w-0">
        <div className={`truncate font-semibold ${nameClass}`}>{name}</div>
        {secondary ? <div className="truncate text-xs text-fg-muted">{secondary}</div> : null}
      </div>
    </div>
  );
}
