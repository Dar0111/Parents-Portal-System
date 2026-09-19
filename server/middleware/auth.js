const pool = require('../config/db');
const { verifyToken } = require('../utils/jwt');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const decoded = verifyToken(token);

    // A restore can replace every users row with different data — a JWT
    // pointing at a user_id that no longer means the same person must stop
    // working. token_valid_after is NULL until the first restore ever runs,
    // so this is a no-op for the entire life of the system until then.
    const [stateRows] = await pool.query('SELECT token_valid_after FROM auth_security_state WHERE id = 1 LIMIT 1');
    const tokenValidAfter = stateRows[0]?.token_valid_after;
    if (tokenValidAfter && decoded.iat * 1000 < new Date(tokenValidAfter).getTime()) {
      return res.status(401).json({
        success: false,
        message: 'Session invalidated by a database restore. Please log in again.',
      });
    }

    const [rows] = await pool.query(
      `SELECT id, login_id, role, status, name, email, contact_number, profile_pic, student_id,
              email_verified_at, password_changed_at, token_version, must_change_password
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];
    if (user.status !== 'active') {
      // 401, not 403 (2026-09-18): a token that no longer identifies a usable
      // session IS an authentication failure. The web interceptor logs out
      // and redirects on 401 only, so a deactivation now takes effect on the
      // user's very next request instead of after their next refresh. This
      // was the one 403 in the API that meant "session dead" rather than
      // "refused, here is why" (§2). Login keeps its 403 + `status` for a
      // pending / rejected / inactive account — there the credentials are
      // valid and the account is unusable, which is a refusal with a reason.
      return res.status(401).json({ success: false, message: 'Account is not active.' });
    }

    // AMENDMENT A1 (Darryl, 2026-09-19) — PER-USER token revocation, by a
    // VERSION COUNTER. Bumped by a password change, a reset and an admin
    // temporary password; a token carries the value it was minted with, so
    // every earlier token stops matching the instant it is bumped.
    //
    // A COUNTER, AND TWO FAILED ATTEMPTS SAY WHY. The first compared the
    // token's `iat` against a password_changed_at timestamp: `iat` has
    // one-second resolution, and a temp password, the login after it and the
    // forced change all land inside the same second, so the dead token and
    // the live one carry an identical `iat` and nothing can separate them.
    // The second minted the replacement a second forward — which then
    // outlived the NEXT change. test-recovery-flows.js caught both, and the
    // mechanism was replaced rather than patched a third time.
    //
    // A missing `v` reads as 0, matching a never-changed account, so tokens
    // predating this column keep working until that account changes its
    // password. The GLOBAL auth_security_state cutoff above still uses a
    // timestamp and is untouched: it revokes everything at once, where whole
    // seconds are precise enough.
    if ((decoded.v || 0) !== Number(user.token_version || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Your password was changed. Please log in again.',
      });
    }

    // FORCED CHANGE. An admin temporary password sets this; the account can
    // do exactly two things until it is cleared: read itself, and change its
    // password. Logout needs no exemption — it is client-side only, the
    // token is simply dropped.
    //
    // THIS 403 IS A BACKSTOP, NOT A REDIRECT SIGNAL. Convention 2 says a 403
    // never redirects, and it still does not: the client routes on
    // `user.must_change_password` from GET /auth/me, which it already
    // fetches. This exists for anything calling the API directly.
    if (user.must_change_password) {
      const path = req.path || '';
      const allowed = path === '/change-password' || path === '/me';
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'You must change your password before continuing.',
          code: 'MUST_CHANGE_PASSWORD',
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
