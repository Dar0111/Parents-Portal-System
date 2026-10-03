import { buttonNeutralClass } from './FormField';
import { buttonClass } from './buttonClass';

// Apply while something is waiting: the filled accent button. Built from the
// same `buttonClass()` as every other button (feat/ui-refresh, 2026-10-02)
// and, like `buttonNeutralClass`, WITHOUT the `disabled:` utilities — Apply is
// never disabled, and the proof reads this markup for that word.
const applyDirtyClass = buttonClass({ variant: 'primary', disabledStyles: false });

// Apply, Reset, and the sentence that says the two are out of step.
//
// THE DEFECT IT CLOSES. On eight pages (nine, until item 5 un-staged
// `teacher/AnnouncementsPage`) the filter controls write a DRAFT and
// only Apply copies it into the state the fetch reads. So a Status select can
// read "Approved" while the list below it is still the Pending one, and
// nothing on screen admits it — the page looks like it has answered a
// question it was never asked. Diagnosed as a §5f violation and CORRECTED on
// 2026-09-23: the empty-state copy is fine, one branch per applied value.
// This is §5b one level out — a control showing form state beside a list
// showing database state.
//
// STAGING IS KEPT, NOT REMOVED. Three of the eight filter on free text with no
// debounce anywhere in the client, so applying on change would be one request
// per keystroke. The pages whose filter is a SINGLE bounded control do not
// stage at all — both parent pages and `teacher/AnnouncementsPage` apply on
// change, because "one control that refetches on change has no state worth
// staging" (`parent/EventsPage`'s own note). This component is for the rest.
//
// ONE COMPONENT RATHER THAN EIGHT COPIES, and the reason is not only
// deduplication:
//
//   - the quiet↔filled swap is ONE conditional in ONE file, so the two states
//     cannot drift apart per page;
//   - `role="status"` is written once, so no page can forget it;
//   - it RENDERS, so a proof can drive both states (§17b). Eight copies of a
//     ternary inside eight page bodies is exactly what a source-text
//     assertion cannot check (§17d).
//
// It also settles an inconsistency it inherited: `admin/AnnouncementsPage`
// styled its Apply with the neutral bordered class, identical to its Reset.
// Under this component neutral MEANS "nothing to apply", so that page's Apply
// was already saying the wrong thing — it just had no vocabulary to be wrong
// in.
//
// `canReset` STAYS A PROP. Each page computes it from its own applied values
// and defaults, and unifying those seven expressions (Announcements has none,
// Events derives it from `hasFilter`) is a state refactor this
// component deliberately does not attempt — see `filterState.js`.
// `resetLabel` exists for ONE caller and is not a style choice left open:
// `teacher/StudentsPage` labels its reset "Clear", and that word belongs to
// the page. Renaming it to match a shared component would be the component
// deciding a page's copy, which is backwards — the component owns the
// BEHAVIOUR (when it appears, what it looks like), the page owns the words.
export default function FilterActions({
  dirty,
  canReset,
  onReset,
  applyLabel = 'Apply',
  resetLabel = 'Reset',
}) {
  return (
    <>
      {/* QUIET WHEN CLEAN, AND STILL ENABLED. Disabling it would be the
          obvious move and the wrong one: a disabled control gives no reason,
          and re-applying an unchanged filter is harmless — it refetches, which
          is a legitimate thing to want. Quiet says "nothing is waiting";
          disabled would say "you may not", which is false.

          Clean reuses the RESET class exactly, so the two buttons are a
          matched pair by construction rather than by two strings that have to
          be kept in step. */}
      <button type="submit" className={dirty ? applyDirtyClass : buttonNeutralClass}>
        {applyLabel}
      </button>

      {canReset ? (
        <button type="button" onClick={onReset} className={buttonNeutralClass}>
          {resetLabel}
        </button>
      ) : null}

      {/* THE SENTENCE IS THE SIGNAL; THE DOT IS DECORATION. `aria-hidden` on
          the dot because "●" read aloud is noise, and because a mark that is
          the only carrier of meaning fails the same way a colour-only one
          does (§12's weekly strip, one component out).

          `role="status"` and not `role="alert"`: nothing has gone wrong and
          nothing is urgent — the reader is told at the next natural pause.

          THE LIVE REGION IS ALWAYS MOUNTED; ONLY ITS TEXT TOGGLES (item 5b).
          Item 5 rendered the <p> only while dirty and called the alternative
          "an empty live region claiming a state that is not true". That had
          it backwards, and the code review caught it: a screen reader
          announces CHANGES INSIDE an existing live region, not a node that
          appears with its text already in it — so the sighted cue worked and
          the assistive one never spoke. `ScrollCue` had already stated the
          right rule (§19d) and this component contradicted it in the same
          codebase. `sr-only` while empty keeps the region alive at zero
          layout cost; the visible classes return with the text.

          CENTRED ON APPLY BY A TRANSFORM, NOT BY LAYOUT (fix/smoke-gate).
          Every filter row is `items-end` so the button lines up with the
          inputs under their labels, which left this line sitting on Apply's
          bottom edge — its centre low, measured on all eight pages at 1280
          and 390 when the line was 1.25rem and Apply 2.25rem (8px low, so
          the lift was `-translate-y-2`). A transform moves NOTHING ELSE: 0
          other controls differed from the untransformed layout on any page.
          A wrapper around Apply + cue would have centred it too, but it
          wraps as a unit and moved Apply on the three rows where only the
          cue wraps today (Admin → Users 1280, both Students pages 390),
          where the cue is on its own line just under Apply.

          THE LIFT IS RE-DERIVED FOR THE 44px BUTTON (feat/ui-refresh,
          2026-10-02; the type scale back to Tailwind's on 2026-10-04), by
          arithmetic and NOT yet re-measured in a browser: Apply is now
          `min-h-11` (2.75rem) and a `text-sm` line is 1.25rem, so the centres
          differ by (2.75 − 1.25) / 2 = 0.75rem (`-translate-y-3`). In rem, so
          it still scales with the Large text size. */}
      <p role="status" className={dirty ? 'text-sm font-semibold text-brand -translate-y-3' : 'sr-only'}>
        {dirty ? (
          <>
            <span aria-hidden="true">●</span> Changes not applied
          </>
        ) : null}
      </p>
    </>
  );
}
