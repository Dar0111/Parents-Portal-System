const crypto = require('crypto');
const pool = require('../config/db');

// SIGN-IN LIMITS (feat/privacy, 2026-10-10; the owner's answers 5 and 2).
//
//   PER ACCOUNT  5 failed sign-ins IN A ROW within 15 minutes, then 429 until
//                the oldest of them is 15 minutes old. A successful sign-in
//                CLEARS that account's count.
//   PER IP       100 failed sign-ins within 15 minutes, then 429. Looser,
//                because in the cloud a whole school network can share one
//                address, and NEVER cleared by a success — or an attacker
//                would reset it by signing in to an account of their own.
//
// THE SAME FOR AN UNKNOWN LOGIN ID. The account count is keyed on the TYPED
// login id, not on a users row, so an id that does not exist locks exactly
// like one that does: a 429 must not become the LRN oracle that the one
// "Invalid login credentials." reply refuses to be (a parent's login id IS
// the child's LRN, §5c).
//
// NO LOGIN ID IS STORED. login_key is an HMAC of the trimmed, lower-cased id
// under the server's JWT_SECRET — a plain hash of a 12-digit LRN could be
// reversed by trying every LRN; without the secret it cannot.
//
// IN THE DATABASE, NOT IN MEMORY, for the reason utils/authCodes.js gives: a
// limit that forgets on every `node --watch` restart is not a limit.

const WINDOW_MINUTES = 15;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 100;
const KEEP_HOURS = 24;

const TOO_MANY = 'Too many sign-in attempts. Please wait 15 minutes, then try again.';

function loginKey(loginId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return crypto
    .createHmac('sha256', secret)
    .update(String(loginId).trim().toLowerCase())
    .digest('hex');
}

// THE CLOCK IS THE DATABASE'S (Phase 3): portal.now_s() is MySQL's NOW() —
// the statement's start, truncated to the second — and make_interval() takes
// the bound minute or hour count, as `INTERVAL ? MINUTE` did (migration/docs/02 C.6).
async function isLimited(key, ip) {
  const {
    rows: [account],
  } = await pool.query(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE login_key = ? AND cleared = 0 AND attempted_at > (portal.now_s() - make_interval(mins => ?))`,
    [key, WINDOW_MINUTES]
  );
  if (Number(account.n) >= MAX_PER_ACCOUNT) return true;
  if (!ip) return false;
  const {
    rows: [byIp],
  } = await pool.query(
    'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > (portal.now_s() - make_interval(mins => ?))',
    [ip, WINDOW_MINUTES]
  );
  return Number(byIp.n) >= MAX_PER_IP;
}

async function recordFailure(key, ip) {
  await pool.query('INSERT INTO login_attempts (login_key, ip) VALUES (?, ?)', [key, ip || null]);
  // Nothing older than a day is ever counted; keep the table that small.
  await pool.query('DELETE FROM login_attempts WHERE attempted_at < (portal.now_s() - make_interval(hours => ?))', [KEEP_HOURS]);
}

// A successful sign-in: this account starts again from zero. The rows stay
// (cleared), so the per-IP count still sees them.
async function clearAccount(key) {
  await pool.query('UPDATE login_attempts SET cleared = 1 WHERE login_key = ? AND cleared = 0', [key]);
}

module.exports = {
  WINDOW_MINUTES,
  MAX_PER_ACCOUNT,
  MAX_PER_IP,
  TOO_MANY,
  loginKey,
  isLimited,
  recordFailure,
  clearAccount,
};
