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
      `SELECT id, login_id, role, status, name, email, contact_number, profile_pic, student_id
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
