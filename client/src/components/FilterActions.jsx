import { buttonNeutralClass } from './FormField';

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
      <button
        type="submit"
        className={
          dirty
            ? 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover'
            : buttonNeutralClass
        }
      >
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
          layout cost; the visible classes return with the text. */}
      <p role="status" className={dirty ? 'text-sm text-brand' : 'sr-only'}>
        {dirty ? (
          <>
            <span aria-hidden="true">●</span> Changes not applied
          </>
        ) : null}
      </p>
    </>
  );
}
