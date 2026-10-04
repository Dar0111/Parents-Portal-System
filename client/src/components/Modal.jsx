import { useEffect, useRef } from 'react';
import { useFocusTrap } from './focusTrap';

// Three sizes, lg (max-w-2xl) is the ceiling. Teacher → Contributions'
// roster was the first Stage 4 content to hit it — the page cut columns
// rather than adding xl — and that page was removed with Feature 7 on
// 2026-09-13, so no current page reaches the ceiling. A page hitting it
// is the trigger to reconsider the scale, not a one-page extension.
//
// TWO LIFETIMES, one effect used to mix them (2026-09-08). "Focus the panel
// when the dialog opens" is a one-time event. "Call the current onClose" is
// a value that changes freely — every Stage 4 compose page passes a function
// declared in the page body, so it is a new reference on every keystroke.
// Bundling them in `useEffect(..., [open, onClose])` meant every change to
// the second re-triggered the first: the panel stole focus from the field
// the teacher was typing in. Focus depends on `open` only. onClose is kept
// current via a ref for the Escape listener (captured when the effect ran).
// Backdrop and the X button read onClose from the render they belong to, so
// they do not need the ref. This shape is not Modal-specific: any effect that
// mixes a one-time action with a frequently-changing dependency misfires the
// same way. Do not "fix" it by wrapping onClose in useCallback at one call
// site — that hides it for one page and leaves it for the next four.
//
// A TALL DIALOG SCROLLS INSIDE ITSELF (feat/ui-refresh, 2026-10-02). The panel
// is a flex column no taller than the viewport less the backdrop's padding
// (`100dvh`, so a phone's collapsing address bar is counted), the title bar
// and the footer keep their height, and the BODY is the scroller. Before
// this the panel simply grew: on a 390px phone a long form pushed its own
// footer — Cancel and the confirm — below the screen, and the page behind is
// scroll-locked, so they could not be reached.
//
// NO ANIMATION, ON PURPOSE (motion/motion.js): the "Leave without saving?"
// dialogs are this component, and nothing about them may wait on a tween. It
// also still renders INLINE, not through a portal — which is why no ancestor
// may be left carrying a transform.
//
// FOCUS STAYS INSIDE (feat/look-fixes, 2026-10-05): `useFocusTrap` puts focus
// on the panel once per opening (its effect depends on `open` only — the rule
// above), wraps Tab inside the panel, and gives focus back to the control that
// opened the dialog when it closes. The panel is a CONTAINER: 12px corners
// (§27f).

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Latest onClose, without making it a reason to re-run the open effect.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus on the panel once per opening, Tab kept inside, focus back to the
  // opener on close (components/focusTrap.js). Depends on `open` only.
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.();
    }

    document.addEventListener('keydown', onKeyDown);

    // Stop the page behind the modal from scrolling while it is open. Runs
    // when `open` becomes true, not when onClose's identity changes.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4"
      onMouseDown={(event) => {
        // mousedown, not click: a click that STARTS inside the panel and ends
        // on the backdrop (dragging to select text) must not close the modal.
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col ${SIZES[size] || SIZES.md} rounded-xl border border-edge bg-surface shadow-xl outline-none`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-edge py-2 pl-5 pr-2">
          <h2 className="min-w-0 py-1.5 font-serif text-base font-bold text-fg">{title}</h2>
          {/* 44px, a finger's target, with the shared keyboard outline. The
              flex is on the button; the glyph is decoration and the name is
              the aria-label. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
          >
            <i aria-hidden="true" className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* The scroller (see the header note). `min-h-0` lets a flex child
            shrink below its content, which is what makes it scroll at all.
            No `flex-1`: the body is as tall as its content and only SHRINKS —
            a short dialog stays short. */}
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-edge px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
