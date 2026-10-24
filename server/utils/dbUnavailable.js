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

// WHICH errors mean "the database is unreachable" is decided in ONE place,
// utils/dbErrors.js (Phase 3, commit F — PostgreSQL): the Node socket codes,
// SQLSTATE class 08, a shutdown or crash (57P01-57P03), too many connections
// (53300), refused credentials (28P01, 28000), a missing database (3D000), and
// node-postgres's few code-less connection failures. A query that FAILS (bad
// SQL, a missing column after a bad restore) carries another SQLSTATE and is a
// 500 — a defect to fix, not an outage to wait out. Until commit F this list
// held mysql2's codes (PROTOCOL_CONNECTION_LOST, ER_ACCESS_DENIED_ERROR, …).
const { isConnectionError } = require('./dbErrors');

function isDbUnavailable(error) {
  return isConnectionError(error);
}

function sendDbUnavailable(res, context, error) {
  console.error(`${context}: database unreachable:`, error && error.message ? error.message : error);
  return res.status(503).json(DB_UNAVAILABLE_BODY);
}

module.exports = { DB_UNAVAILABLE_BODY, isDbUnavailable, sendDbUnavailable };
