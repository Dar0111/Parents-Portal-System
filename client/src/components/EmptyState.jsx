export default function EmptyState({
  icon = 'fa-inbox',
  title = 'Nothing here yet',
  message,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <i className={`fa-solid ${icon} mb-3 text-3xl text-slate-300`} />
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
