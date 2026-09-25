// Is the filter form showing something the list has not been asked for yet?
//
// ITS OWN MODULE, no JSX (§17b). A proof has to DRIVE this — the states that
// matter are "typed a trailing space", "changed a select and changed it back",
// and the four Grade→Section transitions, none of which an SSR render can
// reach because none of them is markup. And a function exported beside a
// component trips `react(only-export-components)`, which has moved the oxlint
// baseline before.
//
// WHAT IT IS FOR. Eight pages stage their filter values: the controls write a
// DRAFT, and only Apply copies that draft into the APPLIED state the fetch
// reads. That is deliberate — it stops a request per keystroke on the three
// free-text searches — but it means a select can read "Approved" while the
// list below it is still the Pending one, with nothing on screen admitting
// the gap. This is the value that admits it.

// KEY BY KEY OVER THE UNION OF KEYS, NOT `JSON.stringify`.
//
// Stringify compares key ORDER as well as content, so `{ status, from, to }`
// and `{ from, to, status }` are "different" while meaning the same thing —
// and the eight pages assemble their drafts in whatever order each was written
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
// EVERY VALUE IS TRIMMED, not only one named `search` (item 5b). Item 5
// special-cased the literal key `search`, which duplicated a trim the three
// text-search pages already performed on their drafts and silently skipped
// any future page that names its text field `query` or `q`. A select never
// carries whitespace, so trimming everything costs nothing and cannot be
// keyed on a name somebody has to remember.
function normalise(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function isDirty(draft, applied) {
  const a = draft || {};
  const b = applied || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (normalise(a[key]) !== normalise(b[key])) return true;
  }
  return false;
}

// `canResetFilters` used to live here and was REMOVED in item 5b: no page
// ever called it, and an export whose comment describes a unification that
// did not happen is worse than none. The seven-expression `canReset` question
// stays a `docs/KNOWN_ISSUES.md` row until a page actually needs the helper.
