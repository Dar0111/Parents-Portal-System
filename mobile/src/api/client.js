import axios from 'axios';

// THE MOBILE TWIN OF client/src/api/axios.js. Same contract, three deliberate
// differences, each named here so nobody "aligns" them back:
//
//   1. The token comes from expo-secure-store, which is async, so the request
//      interceptor awaits a PROVIDER this module does not own. auth/tokenStore.js
//      registers it (`setTokenProvider`) — this file imports nothing native, so
//      a Node proof can load it and drive the pure parts (scripts/proof-api-unwrap.mjs).
//   2. A 401 cannot `window.location.assign('/login')`. It clears the token
//      through the same provider and calls the SESSION-ENDED listener that
//      AuthContext registers; the root navigator then renders the auth stack.
//      The reason travels in memory (tokenStore.takeLogoutReason), never in a
//      route param — §5c says nothing about the session goes in a URL, and a
//      navigation param is the phone's URL.
//   3. `timeout: 15000` (Darryl, Stage 5 decision 8). The web sets none; on a
//      hotspot a dead API would otherwise hang a screen forever. axios reports
//      it as ECONNABORTED with no response, which classifyAuthFailure already
//      files under "keep the token".
//
// EVERYTHING ELSE IS THE WEB'S RULE, verbatim in spirit: `unwrap` or `raw` is
// MANDATORY and never inferred; a named key that is absent THROWS naming what
// was missing and what came back; `raw` returns the full axios response;
// nothing here computes a count or a value from a pushed event.

export const TOKEN_KEY = 'pp_token';

const base = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

export const API_BASE_URL = base;
// The socket attaches to the HTTP server root, not the /api mount point —
// the same derivation SocketProvider makes on the web.
export const SOCKET_ORIGIN = base.replace(/\/api\/?$/, '');

const api = axios.create({ baseURL: base, timeout: 15000 });

// ---------------------------------------------------------------------------
// Injection points — wired once by auth/tokenStore.js and auth/AuthContext.jsx.
// ---------------------------------------------------------------------------
let tokenProvider = async () => null;
let tokenClearer = async () => {};
let onSessionEnded = () => {};

export function setTokenProvider({ get, clear }) {
  tokenProvider = get;
  tokenClearer = clear;
}

export function setSessionEndedListener(fn) {
  onSessionEnded = typeof fn === 'function' ? fn : () => {};
}

api.interceptors.request.use(async (config) => {
  const token = await tokenProvider();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Success path — pure, exported so the proof can drive it without a request.
// ---------------------------------------------------------------------------
export function readBody(config, body) {
  const { unwrap, raw, url } = config;

  if (raw) return { raw: true };

  if (!unwrap) {
    throw new Error(
      `API call to ${url} must pass { unwrap: '<key>' } or { raw: true }. ` +
        'See docs/API_REFERENCE.md section 7 for this endpoint’s wrapper key.'
    );
  }

  const keys = Array.isArray(unwrap) ? unwrap : [unwrap];
  const returned = body && typeof body === 'object' ? Object.keys(body) : [];
  const missing = keys.filter((key) => !body || !Object.prototype.hasOwnProperty.call(body, key));

  if (missing.length) {
    throw new Error(
      `API call to ${url} expected key(s) [${missing.join(', ')}] in the ` +
        `response body but got [${returned.join(', ') || 'nothing'}]. ` +
        'The endpoint’s wrapper key may have changed.'
    );
  }

  if (Array.isArray(unwrap)) {
    return { value: Object.fromEntries(keys.map((key) => [key, body[key]])) };
  }

  return { value: body[unwrap] };
}

// ---------------------------------------------------------------------------
// Error path — 401 only, and only off the login request. Pure helpers first.
// ---------------------------------------------------------------------------
const SESSION_ENDED = 'Your session has ended. Please log in again.';
const HUMAN_READABLE_401S = new Set([
  'Account is not active.',
  'Session invalidated by a database restore. Please log in again.',
]);

// The two 401 messages that read as sentences to a person pass through; the
// three that describe the token are replaced by one sentence (the web's list,
// verbatim in client/src/api/axios.js).
export function logoutReasonFor(serverMessage) {
  return HUMAN_READABLE_401S.has(serverMessage) ? serverMessage : SESSION_ENDED;
}

export function endsSession(status, url) {
  return status === 401 && !String(url || '').includes('/auth/login');
}

api.interceptors.response.use(
  (response) => {
    const read = readBody(response.config, response.data);
    return read.raw ? response : read.value;
  },
  async (error) => {
    const status = error.response?.status;
    if (endsSession(status, error.config?.url)) {
      await tokenClearer();
      onSessionEnded(logoutReasonFor(error.response?.data?.message));
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Pagination helpers — the web's, unchanged (Server hardening C, 2026-09-19).
// ---------------------------------------------------------------------------
export const PAGE_SIZE = 50;

export function listParams({ offset = 0, sort = null } = {}) {
  const params = { limit: PAGE_SIZE, offset };
  if (sort?.key) {
    params.sort = sort.key;
    params.order = sort.dir === 'desc' ? 'desc' : 'asc';
  }
  return params;
}

const FETCH_ALL_PAGE = 200;
const FETCH_ALL_MAX_PAGES = 25;
const FETCH_ALL_MAX_ROWS = 5000;

export async function fetchAll(path, { unwrap, params = {}, idField = 'id' } = {}) {
  if (typeof unwrap !== 'string') {
    throw new Error(`fetchAll(${path}) needs { unwrap: '<key>' } — the array key to page through.`);
  }
  const seen = new Set();
  const rows = [];
  for (let pageIndex = 0; pageIndex < FETCH_ALL_MAX_PAGES; pageIndex++) {
    const result = await api.get(path, {
      unwrap: [unwrap, 'page'],
      params: { ...params, limit: FETCH_ALL_PAGE, offset: pageIndex * FETCH_ALL_PAGE },
    });
    for (const row of result[unwrap]) {
      const id = row?.[idField];
      if (id !== undefined && id !== null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      rows.push(row);
    }
    if (!result.page?.has_more) return rows;
    if (rows.length >= FETCH_ALL_MAX_ROWS) break;
  }
  throw new Error(
    `This list is too large to load in one go (more than ${FETCH_ALL_MAX_ROWS} rows or ` +
      `${FETCH_ALL_MAX_PAGES} pages from ${path}). Narrow it with a filter and try again.`
  );
}

export default api;
