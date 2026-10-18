const crypto = require('crypto');
const pool = require('../config/db');
const { hashPassword, comparePassword } = require('./password');

// Six-digit codes for password reset, email verification and — since
// feat/sms-transport (2026-09-29) — mobile-number verification. One table, one
// lifecycle, one set of limits (R1, 2026-09-19).
//
// WHY ONE TABLE WITH A `purpose` COLUMN rather than two tables: the two flows
// are the same object — six digits, hashed at rest, ten-minute expiry, five
// attempts, single use, the same per-account and per-IP limits, the same
// cleanup. `purpose` is a discriminator, not a difference in shape. Two tables
// would mean two migrations and two places to fix the same bug.
//
// STORED HASHED, with the same bcrypt helper passwords use. A code is a
// credential for the length of its life, and this table ends up inside every
// mysqldump unless excluded — which is exactly why routes/backups.js now
// excludes its ROWS (see the comment there).
//
// NEVER LOGGED, NEVER RETURNED. No function here returns the plaintext except
// createCode(), whose only caller hands it straight to the mailer. No endpoint
// echoes it. logActivity lines name the user and the purpose, never the code.

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_PER_ACCOUNT_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;
// THE RESEND COOLDOWN (feat/first-signin, 2026-10-18): a new code for the
// same account and purpose only once the newest one is this old. The clients
// count it down ("Resend code in 0:59"); this is the server's own copy of the
// rule, so a script cannot skip it. Counted from the newest row's created_at,
// so a code whose send failed (and was burned) still starts the wait.
const RESEND_COOLDOWN_SECONDS = 60;

// crypto.randomInt, not Math.random: this is a credential.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function countRecentForUser(userId, purpose) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS c FROM auth_codes WHERE user_id = ? AND purpose = ? AND created_at > (NOW() - INTERVAL 1 HOUR)',
    [userId, purpose]
  );
  return Number(rows[0].c);
}

async function countRecentForIp(ip) {
  if (!ip) return 0;
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS c FROM auth_codes WHERE request_ip = ? AND created_at > (NOW() - INTERVAL 1 HOUR)',
    [ip]
  );
  return Number(rows[0].c);
}

// RATE LIMITS LIVE IN THE DATABASE, NOT IN MEMORY. An in-process Map would be
// reset by every `node --watch` restart — and this server runs under --watch
// in development — so a limit that forgets is not a limit. Both of these are
// a COUNT on an index; no new dependency.
async function isRateLimited(userId, purpose, ip) {
  const [perUser, perIp] = await Promise.all([countRecentForUser(userId, purpose), countRecentForIp(ip)]);
  return perUser >= MAX_PER_ACCOUNT_PER_HOUR || perIp >= MAX_PER_IP_PER_HOUR;
}

// Seconds until another code of this purpose may be sent to this account; 0
// when it may be sent now (no code yet, or the newest is old enough). Both
// times are the database's, so the server's clock is not involved.
async function cooldownRemaining(userId, purpose) {
  const [rows] = await pool.query(
    'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM auth_codes WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    [userId, purpose]
  );
  if (!rows.length) return 0;
  const age = Number(rows[0].age);
  if (!Number.isFinite(age)) return 0;
  return Math.max(0, Math.min(RESEND_COOLDOWN_SECONDS, RESEND_COOLDOWN_SECONDS - age));
}

// AMENDMENT A2 (Darryl, 2026-09-19): only the newest code is valid. Issuing a
// new one consumes every older unconsumed code for the same user + purpose, so
// a user who asks twice cannot be confused about which of two codes works, and
// an older code sitting in an inbox stops being a credential the moment a
// newer one is sent.
//
// `email` and `contact` are SNAPSHOTS of where the code is going — either may
// be null (a text-only code has no email; feat/sms-transport, 2026-09-29).
async function createCode({ userId, purpose, email = null, contact = null, ip }) {
  await burnPending(userId, purpose);

  const code = generateCode();
  const codeHash = await hashPassword(code);
  await pool.query(
    `INSERT INTO auth_codes (user_id, purpose, code_hash, email_snapshot, contact_snapshot, expires_at, request_ip)
     VALUES (?, ?, ?, ?, ?, (NOW() + INTERVAL ? MINUTE), ?)`,
    [userId, purpose, codeHash, email, contact, CODE_TTL_MINUTES, ip || null]
  );

  return { code, minutes: CODE_TTL_MINUTES };
}

// Consumes every live code of one purpose for one account. Used when a new
// code replaces them (A2), when a send failed, and when the address or number
// a code was sent to CHANGES — so a code already sitting in an old inbox or on
// an old phone stops being able to confirm the new one.
async function burnPending(userId, purpose) {
  await pool.query(
    'UPDATE auth_codes SET consumed_at = NOW() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL',
    [userId, purpose]
  );
}

// Returns { ok: true, emailSnapshot, contactSnapshot } or { ok: false }. The
// snapshots let a caller refuse a code whose destination is no longer the
// account's. DELIBERATELY NO REASON on a failure: the caller
// must not be able to tell wrong-code from expired from already-used from
// too-many-attempts, because the user-facing message is identical for all of
// them and a reason here would eventually leak into one.
async function consumeCode({ userId, purpose, code }) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return { ok: false };

  const [rows] = await pool.query(
    `SELECT id, code_hash, attempts, email_snapshot, contact_snapshot FROM auth_codes
      WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [userId, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false };

  if (row.attempts >= MAX_ATTEMPTS) {
    await pool.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = ?', [row.id]);
    return { ok: false };
  }

  const match = await comparePassword(code, row.code_hash);
  if (!match) {
    await pool.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    // The fifth wrong try burns the code rather than leaving it for a sixth.
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await pool.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = ?', [row.id]);
    }
    return { ok: false };
  }

  await pool.query('UPDATE auth_codes SET consumed_at = NOW() WHERE id = ?', [row.id]);
  return { ok: true, emailSnapshot: row.email_snapshot, contactSnapshot: row.contact_snapshot };
}

// Burned on the miss path of forgot-password so an unknown login id costs the
// same ~100ms a real one does. Without it the endpoint is a login-id oracle
// and the uniform response message is decoration (Darryl, Q2, 2026-09-19).
async function burnTiming() {
  await hashPassword(generateCode());
}

module.exports = {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_PER_ACCOUNT_PER_HOUR,
  MAX_PER_IP_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  isRateLimited,
  cooldownRemaining,
  createCode,
  burnPending,
  consumeCode,
  burnTiming,
};
