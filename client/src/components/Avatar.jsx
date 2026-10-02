import { useState } from 'react';
import { API_BASE_URL } from '../api/apiBase';
import { photoUrl } from '../format/photoUrl';

// The initials circle on a person row (DV1, 2026-09-20).
//
// ONLY WHERE A ROW IS A PERSON. Eleven of the twenty-two DataTable consumers
// list people; the rest list posts, subjects, days and files, and giving
// those an avatar would make a backup file look like a member of staff. The
// page decides by passing `avatar` from `renderCard`, or by using this in a
// column's `render` — DataTable never guesses.
//
// A PHOTO WHEN THE PERSON HAS ONE, INITIALS OTHERWISE (feat/profile-photos,
// 2026-09-30). `photo` is the stored `users.profile_pic` FILE NAME, turned
// into an address by format/photoUrl.js. Only USER rows have one — a
// learner's avatar is always initials, because `students` has no photo.
// A photo that fails to load — the file gone after a restore of an older
// backup, say (KNOWN_ISSUES) — falls back to the initials, never a broken
// image. `alt=""` + aria-hidden, the same as the initials: the name is always
// beside it as text.
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

// Two sizes, never a className fight over `h-`: `md` everywhere a row or a
// card shows a person, `lg` on Settings → Account information.
const SIZES = {
  md: 'h-[2.375rem] w-[2.375rem] text-xs',
  lg: 'h-20 w-20 text-xl',
};

// A HAIRLINE RING (feat/ui-refresh, 2026-10-02), the same `edge` every card
// is framed with: a pale photo keeps its outline on a pale surface. A ring is
// a box-shadow, so it takes no room — the pinned sizes above are untouched —
// and it is drawn OUTSIDE the box, because an inset shadow is painted under
// an <img>'s picture and would not show.
const RING = 'ring-1 ring-edge';

// The one API-base decision (api/apiBase.js), so a photo comes from the same
// host as every request — a phone's Chrome on the LAN included.
const API_BASE = API_BASE_URL;

export default function Avatar({ name, photo = null, size = 'md', className = '' }) {
  const initials = initialsOf(name);
  const src = photoUrl(photo, API_BASE);
  // The address that failed, not a boolean: a NEW photo gets its own try.
  const [failed, setFailed] = useState(null);
  const box = SIZES[size] || SIZES.md;

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        decoding="async"
        onError={() => setFailed(src)}
        className={`${box} shrink-0 rounded-full bg-brand-soft object-cover ${RING} ${className}`}
      />
    );
  }

  // No name, no circle. An empty disc is a rendering artefact, and a "?"
  // reads as a warning about the person rather than about the data.
  if (!initials) return null;

  return (
    <span
      // aria-hidden: the name is always rendered as text beside this, so a
      // screen reader announcing "MS" first would just be noise.
      aria-hidden="true"
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ${RING} ${className}`}
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
// the markup changes. `photo` only where the row is a USER (Admin → Users).
export function PersonCell({ name, secondary, photo = null, className = '', nameClass = 'text-fg' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Avatar name={name} photo={photo} />
      <div className="min-w-0">
        <div className={`truncate font-semibold ${nameClass}`}>{name}</div>
        {secondary ? <div className="truncate text-xs text-fg-muted">{secondary}</div> : null}
      </div>
    </div>
  );
}
