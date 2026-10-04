import { useState } from 'react';
import { DRAFT_COPY } from '../drafts/draftCore';
import Button from './Button';

// "DRAFT RESTORED" — shown when a form opens with a draft it kept
// (feat/form-drafts, 2026-10-04). It says where the draft is kept and until
// when (§5i), and it carries the one way to drop it: Discard draft.
//
// DISCARD ASKS FIRST, INLINE (§5e — deleting typed text has no undo). The
// question replaces the notice in the same box rather than opening a second
// dialog: the notice usually sits inside a compose Modal, and two open Modals
// would both answer one Escape.
//
// `kind` is 'form' or 'message' (submit vs send); `changed` is an edit draft
// whose item was changed after the draft began. Tokens and the shared Button
// only (§8).
export default function DraftNotice({ kind = 'form', changed = false, onDiscard, className = '' }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <div role="group" aria-label={DRAFT_COPY.discardTitle} className={`space-y-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong ${className}`}>
        <p className="font-semibold">{DRAFT_COPY.discardTitle}</p>
        <p>{DRAFT_COPY.discardBody}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={() => setAsking(false)}>
            {DRAFT_COPY.discardKeep}
          </Button>
          <Button
            size="sm"
            variant="danger-outline"
            onClick={() => {
              setAsking(false);
              onDiscard();
            }}
          >
            {DRAFT_COPY.discardConfirm}
          </Button>
        </div>
      </div>
    );
  }

  const text = changed ? DRAFT_COPY.itemChanged : kind === 'message' ? DRAFT_COPY.restoredWebMessage : DRAFT_COPY.restoredWebForm;

  return (
    <div role="status" className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong ${className}`}>
      <p className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
          <i className="fa-solid fa-floppy-disk" />
        </span>
        <span className="min-w-0">{text}</span>
      </p>
      <Button size="sm" onClick={() => setAsking(true)}>
        {DRAFT_COPY.discardAction}
      </Button>
    </div>
  );
}
