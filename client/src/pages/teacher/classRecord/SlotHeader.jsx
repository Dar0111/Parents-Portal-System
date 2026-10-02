import { useState } from 'react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';

// One assessment column's header.
//
// THREE THINGS HAVE TO FIT IN ABOUT 55px, so only two of them live here: the
// label (a button) and the highest possible score (an input). Everything else
// — renaming, clearing the column — is behind the button, in a small Modal.
// Trying to fit a name field into the column is what makes a class record
// unreadable; the Modal costs one click on an action a teacher performs once
// per assessment, not once per learner.
//
// AN UNUSED SLOT (no highest possible score) SHOWS "Set HPS" INSTEAD OF AN
// INPUT, and its whole column is disabled. That is a state, not a verdict
// (§4): the assessment simply has not happened, and the computation leaves
// the column out entirely rather than counting it as zero.
//
// THE COLUMN HEADER KEEPS ITS MEASURED BOX (feat/ui-refresh): the 4.5rem
// width, the two-line label, the maximum's width, padding and text size are
// all as they were — the header row's height is a measured figure the sticky
// column and the scroll cue were checked against. The refresh gave the two
// small controls the shared corner and the shared keyboard outline, and
// restyled the DIALOG behind the label, which has room: field stack, the
// explanations at body size, Done in the dialog's footer.
export default function SlotHeader({ slot, draft, onDraft, scoredCount, canEncode }) {
  const [open, setOpen] = useState(false);

  const maxValue = draft?.max_score !== undefined ? draft.max_score : slot.max_score === null ? '' : String(slot.max_score);
  const nameValue = draft?.name !== undefined ? draft.name : slot.name || '';
  const inUse = maxValue !== '' && maxValue !== null;
  // The column's CODE — WW1…WW5, PT1…PT3 — the same shape as the exam
  // columns' ST1 / ST2 / TE beside it. Built here from type + slot_no, not
  // from the API's `short_label`, which stays the bare number or the name
  // (test:class-record asserts that contract, and buildPayload mirrors it).
  const code = `${slot.type}${slot.slot_no}`;
  const shownName = nameValue.trim();

  return (
    <>
      <div className="flex w-[4.5rem] flex-col items-center gap-1">
        {/* THE CODE ALWAYS, THE NAME UNDER IT (fix/smoke-gate). This showed
            the bare number — or a named slot's name alone — on the grounds
            that the group header above already said the category. But that
            header is one cell over a whole group, and scrolling puts it under
            the pinned Learner column for most of the group's width (measured:
            hidden from 200px to 624px of scroll with up to 429px of the
            group's own columns still on screen), so "3" stopped saying which
            3. Every column now carries its code, readable at any scroll
            position. A named slot keeps its name on a second, truncated line
            — same two-line height as the old clamp (72px header row, 81px
            column, measured) — and the full text is in the title and the
            Modal, as before. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canEncode}
          className="line-clamp-2 w-full rounded-md px-0.5 text-center text-xs font-semibold leading-tight text-fg-body underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:no-underline"
          title={`${slot.display_label} — rename or change its highest possible score`}
        >
          <span className="block">{code}</span>
          {shownName ? <span className="block truncate font-normal">{shownName}</span> : null}
        </button>

        {/* autoComplete on every input below: see Cell.jsx. A browser
            offered saved logins on these fields, including a parent's login
            id, which is a learner's LRN. */}
        {inUse ? (
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            name={`hps-${slot.type}-${slot.slot_no}`}
            aria-label={`${slot.display_label} highest possible score`}
            title={`${slot.display_label} highest possible score`}
            className="w-14 rounded-lg border border-edge-strong bg-surface px-1 py-0.5 text-center text-xs tabular-nums text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-accent disabled:cursor-not-allowed disabled:bg-surface-subtle"
            value={maxValue}
            disabled={!canEncode}
            onChange={(e) => onDraft({ ...draft, max_score: e.target.value })}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!canEncode}
            className="w-full rounded-lg border border-dashed border-edge-strong px-0.5 py-0.5 text-[0.65rem] text-fg-muted enabled:hover:bg-surface enabled:hover:text-fg-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-accent disabled:cursor-not-allowed"
          >
            Set HPS
          </button>
        )}
      </div>

      {/* Done is the neutral button, on purpose: it CLOSES the dialog and
          writes nothing — what was typed is already a draft in the grid, and
          the page's one filled button is "Save all". */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={slot.display_label}
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {/* `text-left font-normal`: Modal renders inline, so this dialog sits
            INSIDE the column's <th> and would inherit a header cell's bold,
            centred text. */}
        <div className="space-y-4 text-left font-normal">
          <div className="space-y-1.5">
            <FormField
              label="Name (optional)"
              value={nameValue}
              autoComplete="off"
              name={`slot-name-${slot.type}-${slot.slot_no}`}
              placeholder={`${slot.type === 'WW' ? 'Written Work' : 'Performance Task'} ${slot.slot_no}`}
              onChange={(e) => onDraft({ ...draft, name: e.target.value })}
            />
            <p className="text-sm text-fg-muted">
              Left blank, this column is called &ldquo;{slot.type === 'WW' ? 'Written Work' : 'Performance Task'}{' '}
              {slot.slot_no}&rdquo; here and on the parent&rsquo;s grade breakdown.
            </p>
          </div>

          <FormField
            label="Highest possible score"
            inputMode="numeric"
            autoComplete="off"
            name={`slot-hps-${slot.type}-${slot.slot_no}`}
            value={maxValue}
            onChange={(e) => onDraft({ ...draft, max_score: e.target.value })}
          />

          {/* EXPLAINED BEFORE THE REQUEST, because the client already knows
              the count. The server's 409 is the backstop, not the message a
              teacher should have to trigger to read. */}
          <div className="flex items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3 text-sm text-fg-body">
            <i aria-hidden="true" className="fa-solid fa-circle-info mt-0.5 text-fg-faint" />
            {scoredCount > 0 ? (
              <p className="min-w-0 flex-1">
                {scoredCount} {scoredCount === 1 ? 'learner has a score' : 'learners have scores'} in this column.
                Changing the highest possible score recomputes {scoredCount === 1 ? 'their' : 'their'} grades. It cannot be
                cleared while {scoredCount === 1 ? 'that score is' : 'those scores are'} recorded — remove{' '}
                {scoredCount === 1 ? 'it' : 'them'} first.
              </p>
            ) : (
              <p className="min-w-0 flex-1">
                No scores are recorded in this column yet. Clearing the highest possible score marks it unused, and it is
                left out of every grade.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
