// "Nothing to show", said the same way everywhere: an icon in a soft chip, a
// title, and one sentence. The copy is the caller's (§5f: derived from the
// applied filters, one branch per cause) — this only draws it.
//
// THE FLEX IS ON THE CHIP, NEVER ON THE <i>: Font Awesome's unlayered
// `display: inline-block` beats Tailwind's layered `.flex` (found in D3,
// 2026-09-19). The icon is decoration — the title carries the meaning.
export default function EmptyState({
  icon = 'fa-inbox',
  title = 'Nothing here yet',
  message,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <span
        aria-hidden="true"
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-fg-muted"
      >
        <i className={`fa-solid ${icon} text-xl`} />
      </span>
      <p className="text-base font-semibold text-fg">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
