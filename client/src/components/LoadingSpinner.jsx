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
      className={`flex flex-col items-center justify-center gap-2 text-slate-400 ${className}`}
    >
      <i className={`fa-solid fa-circle-notch fa-spin ${SIZES[size] || SIZES.md}`} />
      {label ? <span className="text-sm text-slate-500">{label}</span> : null}
    </div>
  );
}
