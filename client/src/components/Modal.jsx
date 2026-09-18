import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.();
    }

    document.addEventListener('keydown', onKeyDown);

    // Stop the page behind the modal from scrolling while it is open, and put
    // focus on the panel so keyboard users are not left back on the trigger.
    // Runs when `open` becomes true, not when onClose's identity changes.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

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
        className={`w-full ${SIZES[size] || SIZES.md} rounded-xl bg-surface shadow-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-fg-faint transition hover:bg-surface-muted hover:text-fg-body"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
