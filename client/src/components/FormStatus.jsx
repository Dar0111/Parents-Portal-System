import ErrorAlert from './ErrorAlert';

// The outcome of ONE write, rendered next to the control that caused it.
//
// WHY ONE VALUE INSTEAD OF TWO. Every page used to hold a `saveError` and a
// `saveMessage` and render them as an XOR — a shape that had to be re-derived,
// and re-argued, on each page (it was a real defect on Teacher → Grades on
// 2026-09-07: a stale success strip sat under a fresh validation error, two
// alerts for two different operations). A status is either a failure or a
// success and never both, so it is one value. The XOR is now structural: there
// is no second slot to disagree with.
//
// WHERE IT GOES (the half that actually fixes the reported bug). Directly
// under the control that caused it — under that form's submit button, or
// inside the Modal whose action produced it. It must NOT sit at the top of the
// page: nothing in Shell is sticky, so on a long page (Teacher → Settings is
// three sections tall) a confirmation rendered at the top is off-screen by the
// time the button at the bottom is pressed, which is exactly how "I saved my
// password and nothing happened" looked.
//
// A message that OUTLIVES its modal — "Parent approved." after the dialog
// closes — belongs to the list it describes and renders above that list.
//
// §2 is untouched: an error still goes through ErrorAlert, which renders the
// API's own wording from extractError and never rewrites it.
//
// role="status" is deliberate and was missing before. ErrorAlert has
// role="alert", so failures were announced to a screen reader and successes
// were silent. "status" is the polite counterpart: announced, but not
// interrupting.
export default function FormStatus({ status, className = '' }) {
  if (!status?.text) return null;

  if (status.tone === 'error') {
    return <ErrorAlert message={status.text} className={className} />;
  }

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border border-success-edge bg-success-soft px-4 py-3 ${className}`}
    >
      <i className="fa-solid fa-circle-check mt-0.5 text-success-icon" />
      <p className="text-sm text-success-strong">{status.text}</p>
    </div>
  );
}

// Builders, so the shape is written once rather than spelled out at 50 call
// sites across 13 pages. `fail` takes the string extractError() returned, not
// the error object — the page still decides what to extract.
//
// THESE TWO EXPORTS COST TWO oxlint WARNINGS (react/only-export-components,
// 37 -> 39) and are kept deliberately. The rule is about Fast Refresh: a file
// exporting a non-component reloads instead of hot-updating. The codebase
// already accepts exactly this warning three times for the same structural
// reason — AuthContext, SocketProvider and UnreadProvider each export their
// hook beside their component.
//
// The alternative is inlining `{ tone: 'ok', text }` at all 50 sites, which
// was measured (48 are single-line) and rejected on correctness, not effort:
// a misspelled helper — `fial(...)` — is a build error, while a misspelled
// tone — `{ tone: 'eror' }` — falls through to the success branch below and
// renders a FAILURE as a green strip. This component exists because a message
// showing the wrong thing is the bug; a magic string repeated 50 times in the
// success/failure path is the wrong trade for a dev-time refresh nicety.
//
// To reverse: delete these two lines, then replace `ok(x)` with
// `{ tone: 'ok', text: x }` and `fail(x)` with `{ tone: 'error', text: x }`.
export const ok = (text) => ({ tone: 'ok', text });
export const fail = (text) => ({ tone: 'error', text });
