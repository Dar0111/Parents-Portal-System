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
  // and the five :id-keyed grades writes naming the subject). Of the 20 places
  // a 403 originates, 18 are route-level scope refusals and one is an
  // authorize() role violation — for all 19, bouncing the user to /login
  // throws away the reason and, for the role violation, re-logs them in to the
  // same refusal. Only middleware/auth.js's "Account is not active." is a dead
  // session, and that resolves on the next refresh via AuthContext's /auth/me
  // check. Not string-matched here: matching on a message is fragile, and the
  // right fix is server-side (that response should be a 401 — a token that no
  // longer identifies a usable session IS an authentication failure).
  //
  // Login failures (401 wrong password, 403 pending/rejected account) must
  // surface on the login form, not bounce away from it.
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url?.includes('/auth/login');

    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export { TOKEN_KEY };
export default api;
