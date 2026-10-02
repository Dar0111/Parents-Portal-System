const SIZES = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-3xl',
};

// The one waiting state. The ring is the muted text tone (a checked pair on
// every surface it sits on) and the label is caption-sized under it — quiet,
// because a wait is not news. Font Awesome's `fa-spin` stands still under
// reduced motion; the label still says what is happening.
export default function LoadingSpinner({ size = 'md', label = 'Loading…', className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-fg-muted ${className}`}
    >
      <i aria-hidden="true" className={`fa-solid fa-circle-notch fa-spin ${SIZES[size] || SIZES.md}`} />
      {label ? <span className="text-sm text-fg-muted">{label}</span> : null}
    </div>
  );
}
