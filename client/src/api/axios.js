import axios from 'axios';

const TOKEN_KEY = 'pp_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Success path — every call MUST declare how to read the response.
// ---------------------------------------------------------------------------
//
//   api.get('/students', { unwrap: 'students' })            -> the array
//   api.get('/grades/7', { unwrap: ['grade', 'descriptor'] })-> { grade, descriptor }
//   api.post('/backups/3/restore', body, { raw: true })      -> the axios response
//
// `unwrap` is mandatory and never inferred — not "take the only key", not
// "singular of the path". This API has ~30 distinct wrapper keys with no
// derivable rule (see docs/API_REFERENCE.md section 7), and a path-to-key map
// cannot work even in principle: GET /api/attendance returns `attendance` as
// an ARRAY while POST /api/attendance returns `attendance` as an OBJECT — same
// key, cardinality varying by method. Only the call site knows what it asked
// for, so only the call site can say what it expects back.
//
// A named key that is absent throws, naming what was missing and what did come
// back. It never returns undefined: a backend rename must fail loudly at the
// call site rather than quietly rendering an empty table.
//
// `raw` returns the FULL axios response (status, headers, data) — not just the
// body, unlike `unwrap`, which returns a value from inside the body. That
// difference matters for the two endpoints that are genuinely not key-shaped:
// GET /api/backups/:id/download needs the headers to read the filename, and
// POST /api/backups/:id/restore is the one endpoint in this API where
// `success: true` does not mean full success — its caller must read `message`.
//
// The error thrown here is a developer-facing bug signal, not user copy. It
// reaches ErrorAlert through extractError() on purpose: if a key is missing the
// page is already broken, and a loud message beats a silently empty screen.
api.interceptors.response.use(
  (response) => {
    const { unwrap, raw, url } = response.config;

    if (raw) return response;

    if (!unwrap) {
      throw new Error(
        `API call to ${url} must pass { unwrap: '<key>' } or { raw: true }. ` +
          'See docs/API_REFERENCE.md section 7 for this endpoint’s wrapper key.'
      );
    }

    const body = response.data;
    const keys = Array.isArray(unwrap) ? unwrap : [unwrap];
    const returned = body && typeof body === 'object' ? Object.keys(body) : [];
    const missing = keys.filter(
      (key) => !body || !Object.prototype.hasOwnProperty.call(body, key)
    );

    if (missing.length) {
      throw new Error(
        `API call to ${url} expected key(s) [${missing.join(', ')}] in the ` +
          `response body but got [${returned.join(', ') || 'nothing'}]. ` +
          'The endpoint’s wrapper key may have changed.'
      );
    }

    if (Array.isArray(unwrap)) {
      return Object.fromEntries(keys.map((key) => [key, body[key]]));
    }

    return body[unwrap];
  },

  // -------------------------------------------------------------------------
  // Error path — 401 only.
  // -------------------------------------------------------------------------
  //
  // 403 deliberately does NOT redirect. In this API a 403 is the considered
  // answer to an out-of-scope WRITE, carrying a specific reason in the body
  // ("Only the adviser of this student's section can review excuse letters.",
  // and the five :id-keyed grades writes naming the subject). Every 403 origin
  // is a route-level refusal with a reason (scope, a locked grade, a failed
  // re-authentication) or an authorize() role violation — for all of them,
  // bouncing the user to /login throws away the reason and, for the role
  // violation, re-logs them in to the same refusal. (No count here: some 403s
  // come from helpers rather than literal status(403) calls, so a number
  // cannot be checked mechanically — the "20" that stood here went stale.)
  // Since 2026-09-18 NO 403 means a dead session: middleware/auth.js answers
  // a deactivated account's next request with 401 "Account is not active.",
  // so the branch below logs that user out immediately, not on their next
  // refresh. (It was the one 403 that meant "session dead" rather than
  // "refused, here is why", and the reason this interceptor once redirected
  // on every 403.) Nothing here is string-matched — matching on a message is
  // fragile, and the status code is now the honest signal.
  //
  // Login failures (401 wrong password, 403 pending/rejected account) must
  // surface on the login form, not bounce away from it.
  //
  // No per-call opt-out. A 401 here must always mean the session is dead. A
  // wrong password typed INSIDE a live session (restore's step-up, "Current
  // password" on change-password) is 400/403 from the server since
  // 2026-09-15 — if an endpoint ever answers a live session with 401, fix its
  // status code; do not add an exception to this interceptor.
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url?.includes('/auth/login');

    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        // B3 (2026-09-19): carry the reason across the full-page redirect so
        // the Login page can say WHY the user is back there. sessionStorage,
        // never the URL (§5c: nothing about the session goes in a query
        // string); consumed once by Login on its first render.
        storeLogoutReason(error.response?.data?.message);
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

// -----------------------------------------------------------------------------
// Logout reason — written by the 401 branch above, read once by Login.
// -----------------------------------------------------------------------------
//
// Every 401 middleware/auth.js can send on a live session, verbatim:
//   'Account is not active.'                                        (deactivated / pending / rejected)
//   'Session invalidated by a database restore. Please log in again.'
//   'Invalid or expired token.'                                     (jwt.verify threw)
//   'User not found.'                                               (the users row is gone)
//   'Authentication required.'                                      (no token — unreachable with one)
// The first two read as sentences to a person and are shown as-is. The
// other three describe the token, not the person, and are replaced by one
// sentence. A manual Logout (Shell → AuthContext.logout) never comes
// through here, so it writes nothing and Login shows nothing.
const LOGOUT_REASON_KEY = 'pp_logout_reason';
const SESSION_ENDED = 'Your session has ended. Please log in again.';
const HUMAN_READABLE_401S = new Set([
  'Account is not active.',
  'Session invalidated by a database restore. Please log in again.',
]);

function storeLogoutReason(serverMessage) {
  const text = HUMAN_READABLE_401S.has(serverMessage) ? serverMessage : SESSION_ENDED;
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, text);
  } catch {
    // Storage blocked (private mode, cleared site data): the redirect still
    // happens; Login simply shows no reason.
  }
}

// Returns the stored reason (or '') and clears it, so a refresh of the Login
// page does not repeat it.
export function takeLogoutReason() {
  try {
    const text = sessionStorage.getItem(LOGOUT_REASON_KEY) || '';
    if (text) sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return text;
  } catch {
    return '';
  }
}

export { TOKEN_KEY };
export default api;
