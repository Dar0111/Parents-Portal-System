// A DATABASE OUTAGE IS NOT A SESSION VERDICT (fix/auth-503, 2026-09-26).
//
// With MySQL stopped, GET /api/health answered 503 correctly while every
// authenticated request answered 401 "Invalid or expired token." — the
// middleware caught the pool's error in the same try as the JWT verify — so
// the web client, which logs out on 401 alone (pre-Stage-5 #4), discarded a
// valid session and sent the user to /login with "Your session has ended".
//
// This file is the one place the "database unreachable" answer lives:
// middleware/auth.js sends it for any failure inside its DB block, and
// routes/auth.js's /me sends it when `isDbUnavailable` says the error came
// from the connection rather than the code. The body is the health
// endpoint's, verbatim, so a client sees one shape for one condition.

const DB_UNAVAILABLE_BODY = Object.freeze({ success: false, message: 'Database unreachable.' });

// The mysql2 / Node error codes a dead or unreachable server produces. A
// query that FAILS (bad SQL, a missing column after a bad restore) carries an
// ER_* code and is a 500 — that is a defect to fix, not an outage to wait
// out. ER_ACCESS_DENIED_ERROR is the one ER_* here: wrong credentials are an
// environment fault, and 503 is closer to the truth than 500.
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_ACCESS_DENIED_ERROR',
  'ER_CON_COUNT_ERROR',
]);

function isDbUnavailable(error) {
  return Boolean(error && typeof error.code === 'string' && UNAVAILABLE_CODES.has(error.code));
}

function sendDbUnavailable(res, context, error) {
  console.error(`${context}: database unreachable:`, error && error.message ? error.message : error);
  return res.status(503).json(DB_UNAVAILABLE_BODY);
}

module.exports = { DB_UNAVAILABLE_BODY, isDbUnavailable, sendDbUnavailable };
