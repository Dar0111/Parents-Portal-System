// `message` is expected to be the string from extractError() — the API's own
// wording, not a rewritten one. Several endpoints answer with a deliberately
// specific reason (which subject a teacher may not encode, why an excuse letter
// cannot be reviewed); replacing those with a generic "Request failed" would
// throw away the most useful part of the response.
export default function ErrorAlert({ message, onRetry, className = '' }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 ${className}`}
    >
      <i className="fa-solid fa-circle-exclamation mt-0.5 text-rose-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-rose-800">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-sm font-medium text-rose-700 underline underline-offset-2 transition hover:text-rose-900"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
