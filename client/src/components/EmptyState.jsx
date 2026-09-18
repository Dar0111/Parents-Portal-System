export default function EmptyState({
  icon = 'fa-inbox',
  title = 'Nothing here yet',
  message,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <i className={`fa-solid ${icon} mb-3 text-3xl text-fg-ghost`} />
      <p className="text-sm font-medium text-fg">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
