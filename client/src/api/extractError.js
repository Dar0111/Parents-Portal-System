// Every error response the API produces is { success: false, message: string }
// — verified across all 342 of them in server/routes/, with zero deviations.
// (The *success* wrappers are inconsistent, ~30 distinct keys; see
// docs/API_REFERENCE.md. Errors are not, which is why this is reliable.)
//
// Deliberately not folded into the axios response interceptor: that one
// already owns the 401/403 redirect, and callers should still be able to
// reach the raw error when they need the status code.
const GENERIC = 'Something went wrong. Please try again.';
const OFFLINE =
  'Cannot reach the server. Check that it is running, then try again.';

export default function extractError(err, fallback = GENERIC) {
  if (err?.response) {
    const message = err.response.data?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    return fallback;
  }

  // Request was made but no response came back — server down, wrong port,
  // CORS. Distinct from a server that answered with an error.
  if (err?.request) return OFFLINE;

  return err?.message || fallback;
}
