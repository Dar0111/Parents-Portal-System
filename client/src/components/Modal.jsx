import { useEffect, useRef } from 'react';

// Three sizes, lg (max-w-2xl) is the ceiling. Teacher → Contributions'
// roster was the first Stage 4 content to hit it — the page cut columns
// rather than adding xl. A second page hitting this ceiling is the
// trigger to reconsider the scale, not a one-page extension.

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

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', onKeyDown);

    // Stop the page behind the modal from scrolling while it is open, and put
    // focus on the panel so keyboard users are not left back on the trigger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
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
        className={`w-full ${SIZES[size] || SIZES.md} rounded-xl bg-white shadow-xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
