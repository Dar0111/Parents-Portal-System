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
      className={`flex items-start gap-3 rounded-xl border border-danger-edge bg-danger-soft px-4 py-3 ${className}`}
    >
      <i aria-hidden="true" className="fa-solid fa-circle-exclamation mt-0.5 text-danger-icon" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-danger-strong">{message}</p>
        {/* A text button, in the alert's own tone. The negative margin and
            matching padding make it a 44px-tall target without adding 44px
            of height to the alert, and give the keyboard outline (the alert's
            own strong tone, a checked pair on this background) a box. */}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="-mx-2 -mb-2 mt-0.5 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-danger-fg underline underline-offset-2 transition hover:text-danger-strong focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-danger-strong"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
