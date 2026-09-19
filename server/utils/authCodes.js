const crypto = require('crypto');
const pool = require('../config/db');
const { hashPassword, comparePassword } = require('./password');

// Six-digit codes for password reset and email verification. One table, one
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

// AMENDMENT A2 (Darryl, 2026-09-19): only the newest code is valid. Issuing a
// new one consumes every older unconsumed code for the same user + purpose, so
// a user who asks twice cannot be confused about which of two codes works, and
// an older code sitting in an inbox stops being a credential the moment a
// newer one is sent.
async function createCode({ userId, purpose, email, ip }) {
  await pool.query(
    'UPDATE auth_codes SET consumed_at = NOW() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL',
    [userId, purpose]
  );

  const code = generateCode();
  const codeHash = await hashPassword(code);
  await pool.query(
    `INSERT INTO auth_codes (user_id, purpose, code_hash, email_snapshot, expires_at, request_ip)
     VALUES (?, ?, ?, ?, (NOW() + INTERVAL ? MINUTE), ?)`,
    [userId, purpose, codeHash, email, CODE_TTL_MINUTES, ip || null]
  );

  return { code, minutes: CODE_TTL_MINUTES };
}

// Returns { ok: true } or { ok: false }. DELIBERATELY NO REASON: the caller
// must not be able to tell wrong-code from expired from already-used from
// too-many-attempts, because the user-facing message is identical for all of
// them and a reason here would eventually leak into one.
async function consumeCode({ userId, purpose, code }) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return { ok: false };

  const [rows] = await pool.query(
    `SELECT id, code_hash, attempts FROM auth_codes
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
  return { ok: true };
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
  generateCode,
  isRateLimited,
  createCode,
  consumeCode,
  burnTiming,
};
