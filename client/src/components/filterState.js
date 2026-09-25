// Is the filter form showing something the list has not been asked for yet?
//
// ITS OWN MODULE, no JSX (§17b). A proof has to DRIVE this — the states that
// matter are "typed a trailing space", "changed a select and changed it back",
// and the four Grade→Section transitions, none of which an SSR render can
// reach because none of them is markup. And a function exported beside a
// component trips `react(only-export-components)`, which has moved the oxlint
// baseline before.
//
// WHAT IT IS FOR. Nine pages stage their filter values: the controls write a
// DRAFT, and only Apply copies that draft into the APPLIED state the fetch
// reads. That is deliberate — it stops a request per keystroke on the three
// free-text searches — but it means a select can read "Approved" while the
// list below it is still the Pending one, with nothing on screen admitting
// the gap. This is the value that admits it.

// KEY BY KEY OVER THE UNION OF KEYS, NOT `JSON.stringify`.
//
// Stringify compares key ORDER as well as content, so `{ status, from, to }`
// and `{ from, to, status }` are "different" while meaning the same thing —
// and the nine pages assemble their drafts in whatever order each was written
// in. It would also silently pass a draft that is MISSING a key, because a
// shorter string is simply a different string; the union below makes an
// absent key compare against its applied value instead.
//
// `search` is compared TRIMMED because that is what commit sends
// (`teacher/StudentsPage`'s `applyFilters` and `admin/StudentsPage`'s both
// `.trim()` on the way into `applied`). Without this, typing one trailing
// space would claim there were changes to apply and then apply nothing.
//
// EVERY OTHER VALUE IS COMPARED WITH `String()`, not `===`: a grade level
// arrives as `6` from one source and `'6'` from a `<select>`, and a filter
// that reported itself dirty because of a number's type would be lying in the
// most confusing way available.
function normalise(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function isDirty(draft, applied) {
  const a = draft || {};
  const b = applied || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = key === 'search' ? normalise(a[key]).trim() : normalise(a[key]);
    const right = key === 'search' ? normalise(b[key]).trim() : normalise(b[key]);
    if (left !== right) return true;
  }
  return false;
}

// COMPARE AGAINST THE PAGE'S DEFAULTS, NEVER AGAINST FALSINESS.
//
// `admin/StudentsPage` defaults `status` to the string `'all'`, not `''`, and
// sends it on every request — so `Boolean(applied.status)` is true at rest and
// a truthiness test would offer Reset on a page nobody has filtered. That page
// already works around it by hand; this is the same check in one place.
//
// It reads APPLIED, not the draft, and that is the existing behaviour on all
// nine: Reset undoes what the list is showing, not what is typed. A draft
// that differs is what `isDirty` is for, and the two answer different
// questions.
export function canResetFilters(applied, defaults) {
  return isDirty(applied, defaults);
}
