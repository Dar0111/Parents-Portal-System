const SIZES = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-3xl',
};

export default function LoadingSpinner({ size = 'md', label = 'Loading…', className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-2 text-fg-faint ${className}`}
    >
      <i className={`fa-solid fa-circle-notch fa-spin ${SIZES[size] || SIZES.md}`} />
      {label ? <span className="text-sm text-fg-muted">{label}</span> : null}
    </div>
  );
}
