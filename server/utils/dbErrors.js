// THE ONE PLACE A POSTGRESQL ERROR IS CLASSIFIED (Phase 3, commit F).
//
// Three questions, three answers, each by the error's CODE — never by parsing
// a message, except for the handful of node-postgres failures that carry no
// code at all (listed below, matched on their fixed wording):
//
//   isUniqueViolation  23505 — the duplicate a 409 answers (mysql2 called it
//                      ER_DUP_ENTRY)
//   isWriteConflict    a lost race the caller should retry: the duplicate
//                      key, a deadlock (40P01), a serialization failure
//                      (40001) or a lock that could not be taken (55P03 —
//                      lock_timeout, mysql2's ER_LOCK_WAIT_TIMEOUT)
//   isConnectionError  the DATABASE is unreachable, not the query wrong: the
//                      Node socket codes, SQLSTATE class 08 (connection
//                      exception), an administrator shutdown or a crash
//                      (57P01-57P03), too many connections (53300), refused
//                      credentials (28P01, 28000) and a missing database
//                      (3D000) — an environment fault, so 503 is closer to the
//                      truth than 500 (utils/dbUnavailable.js)
//
// A query that FAILS (a bad column after a bad restore, a CHECK, an FK) has a
// code outside these sets and stays a 500: a defect to fix, not an outage.

const UNIQUE_VIOLATION = '23505';

const WRITE_CONFLICT_CODES = new Set([UNIQUE_VIOLATION, '40P01', '40001', '55P03']);

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '28P01',
  '28000',
  '3D000',
]);

// node-postgres raises these with no `code`.
const DRIVER_MESSAGES = [
  /^Connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /Client has encountered a connection error and is not queryable/i,
  /Client was closed and is not queryable/i,
  /Cannot use a pool after calling end on the pool/i,
];

function codeOf(error) {
  return error && typeof error.code === 'string' ? error.code : null;
}

function isConnectionError(error) {
  if (!error) return false;
  // Node's dual-stack connect can report an AggregateError of socket errors.
  if (Array.isArray(error.errors) && error.errors.some(isConnectionError)) return true;
  const code = codeOf(error);
  if (code) return CONNECTION_CODES.has(code) || /^08[0-9A-Z]{3}$/.test(code);
  const message = typeof error.message === 'string' ? error.message : '';
  return DRIVER_MESSAGES.some((pattern) => pattern.test(message));
}

function isUniqueViolation(error) {
  return codeOf(error) === UNIQUE_VIOLATION;
}

function isWriteConflict(error) {
  return WRITE_CONFLICT_CODES.has(codeOf(error));
}

module.exports = { UNIQUE_VIOLATION, WRITE_CONFLICT_CODES, isConnectionError, isUniqueViolation, isWriteConflict };
