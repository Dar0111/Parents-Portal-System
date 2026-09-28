const express = require('express');
const pool = require('../config/db');
const { comparePassword, hashPassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRule');
const { validateContact } = require('../utils/contactRule');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { sanitizeUser } = require('../utils/sanitizeUser');
const { isDbUnavailable, sendDbUnavailable } = require('../utils/dbUnavailable');
const codes = require('../utils/authCodes');
const mailer = require('../utils/mailer');
const sms = require('../utils/smsTransport');

const router = express.Router();

// `sanitizeUser` strips any key containing "password" — by design, so an
// aliased JOIN column cannot leak a hash. Two of the R1 columns collide
// with that name and are NOT secrets: `must_change_password` is a boolean
// the client must see to route to the forced-change screen (it is what
// keeps convention 2 intact — the client routes on this, never on the 403),
// and `password_changed_at` is a timestamp. Only the flag is handed back;
// the timestamp stays server-side, because nothing on the client needs it.
//
// Re-attaching one known-safe field is the right fix. Loosening
// sanitizeUser to allow a "password"-shaped name through is not.
// Every token carries the account's CURRENT token_version as `v`.
// middleware/auth.js compares it for equality, so bumping the column revokes
// every token minted before the bump. See the long note there for why this is
// a counter and not a timestamp.
function mintToken(payload, tokenVersion) {
  return signToken({ ...payload, v: Number(tokenVersion || 0) });
}

function withAccountFlags(sanitized, row) {
  return { ...sanitized, must_change_password: row.must_change_password ? 1 : 0 };
}

async function fetchUserByLoginId(loginId) {
  const [rows] = await pool.query(
    `SELECT u.*, s.first_name AS student_first_name, s.last_name AS student_last_name,
            s.grade_level, s.section
     FROM users u
     LEFT JOIN students s ON s.id = u.student_id
     WHERE u.login_id = ?
     LIMIT 1`,
    [loginId]
  );
  return rows[0] || null;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { login_id, password } = req.body;

  if (!login_id || !password) {
    return res.status(400).json({ success: false, message: 'login_id and password are required.' });
  }

  try {
    const user = await fetchUserByLoginId(String(login_id).trim());

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Account pending admin approval.',
        status: 'pending',
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: user.rejection_reason || 'Account was rejected by the administrator.',
        status: 'rejected',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active.',
        status: user.status,
      });
    }

    const token = mintToken(
      {
        id: user.id,
        role: user.role,
        login_id: user.login_id,
        student_id: user.student_id || null,
      },
      user.token_version
    );

    await logActivity(user.id, 'login', `${user.role} logged in`);

    return res.json({
      success: true,
      token,
      user: withAccountFlags(sanitizeUser(user), user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: withAccountFlags(sanitizeUser(user), user) });
  } catch (error) {
    // Reachable only if the database dies between the middleware's read and
    // this one; when it does, say so the way the middleware and /api/health
    // do (503, one body) rather than as a generic 500. The client keeps the
    // token on either — this is about the message, not the logout.
    if (isDbUnavailable(error)) return sendDbUnavailable(res, 'Me', error);
    console.error('Me error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      message: 'current_password and new_password are required.',
    });
  }

  // The one password rule (utils/passwordRule.js) — applied where a password
  // is SET, never where it is checked. `field` names the input the client
  // should put the message under; the shape stays { success, message }.
  const ruleError = validateNewPassword(new_password);
  if (ruleError) {
    return res.status(400).json({ success: false, message: ruleError, field: 'new_password' });
  }

  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const valid = await comparePassword(current_password, rows[0].password);
    if (!valid) {
      // 403, never 401: the session is valid, and a 401 makes the client's
      // interceptor log a teacher or parent out on a typo in "Current
      // password" before the message can show (same fix as restore's
      // step-up password, 2026-09-15).
      return res
        .status(403)
        .json({ success: false, message: 'Current password is incorrect.', field: 'current_password' });
    }

    const hashed = await hashPassword(new_password);
    // AMENDMENT A1 (Darryl, 2026-09-19): changing a password invalidates
    // every JWT issued before it. The mechanism is the `token_version`
    // counter bumped on this line — NOT `password_changed_at`, which is
    // written here for audit only. An earlier attempt did compare that
    // timestamp against the token's `iat` and could not work: `iat` has
    // one-second resolution and every step of a scripted flow lands inside
    // the same second. See the long note in middleware/auth.js.
    // `must_change_password` is cleared because this IS the change that was
    // demanded.
    await pool.query(
      'UPDATE users SET password = ?, password_changed_at = NOW(3), token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
      [hashed, req.user.id]
    );
    await logActivity(req.user.id, 'change_password', 'Password updated');

    // A REPLACEMENT TOKEN at the new version, or this endpoint would log the
    // caller out along with every other session. The bump above killed every
    // token this account was carrying — which is the point for the other
    // sessions and wrong for this one, so it gets a new one.
    //
    // The counter is READ BACK rather than assumed to be the old value plus
    // one: another write could land between the UPDATE and here, and minting
    // a token at a version the row no longer has produces a 401 on the very
    // next request.
    //
    // CONSUMED BY THE CLIENT SINCE R2 (2026-09-19) — AuthContext.applyToken()
    // stores it and re-reads /auth/me. Settings → Change password and the
    // forced-change screen are the two callers. Anything new that calls this
    // endpoint must do the same or it signs its own caller out.
    const [[v]] = await pool.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const token = mintToken({ id: req.user.id, role: req.user.role }, v.token_version);

    return res.json({ success: true, message: 'Password changed successfully.', token });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// PUT /api/auth/contact — any authenticated user updates their own
// contact_number. Identity (name, LRN/login_id, role, student_id, email)
// is school-owned: sending those fields is 400, same loud-reject as
// PUT /api/users/:id, not a silent ignore. Id comes from req.user
// (authenticate re-reads the DB row), never the body.
const CONTACT_FORBIDDEN_FIELDS = [
  'name',
  'email',
  'login_id',
  'lrn',
  'role',
  'student_id',
  'password',
  'status',
];

router.put('/contact', authenticate, async (req, res) => {
  const body = req.body || {};
  const sentForbidden = CONTACT_FORBIDDEN_FIELDS.filter((field) => body[field] !== undefined);
  if (sentForbidden.length) {
    return res.status(400).json({
      success: false,
      message: `Cannot change ${sentForbidden.join(', ')} through this endpoint.`,
    });
  }

  if (body.contact_number === undefined) {
    return res.status(400).json({ success: false, message: 'contact_number is required.' });
  }

  // Required and non-empty here (this endpoint exists to set one), then the
  // shared rule: 09…, +639… or 639… after spaces/dashes are stripped, stored
  // as 09XXXXXXXXX (utils/contactRule.js). `field` names the input.
  if (!String(body.contact_number).trim()) {
    return res.status(400).json({ success: false, message: 'contact_number must not be empty.', field: 'contact_number' });
  }
  const contact = validateContact(body.contact_number);
  if (contact.error) {
    return res.status(400).json({ success: false, message: contact.error, field: 'contact_number' });
  }
  const nextContact = contact.value;

  try {
    // A NUMBER CHANGE UNCONFIRMS IT (feat/sms-transport, 2026-09-29): the
    // confirmation proved texts reach the OLD number, and any code already
    // sent there must not be able to confirm the new one. Compared in the one
    // stored form (utils/contactRule.js), so the same number re-typed as
    // +63… or 63… is NOT a change and keeps its confirmation.
    const [[current]] = await pool.query('SELECT contact_number FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const changed = (current?.contact_number ?? null) !== nextContact;
    if (changed) {
      await pool.query('UPDATE users SET contact_number = ?, contact_verified_at = NULL WHERE id = ?', [nextContact, req.user.id]);
      await codes.burnPending(req.user.id, 'contact_verification');
    } else {
      await pool.query('UPDATE users SET contact_number = ? WHERE id = ?', [nextContact, req.user.id]);
    }
    await logActivity(req.user.id, 'update_contact', 'Contact number updated');

    // Re-fetch via login_id so the JOIN student fields stay on the row —
    // a bare SELECT * after this UPDATE would drop student names / grade /
    // section that GET /me already returns. login_id is the one copy of
    // the LRN; this helper does not SELECT s.lrn.
    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      message: 'Contact number updated.',
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Update contact error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update contact number.' });
  }
});

// ---------------------------------------------------------------------------
// ACCOUNT RECOVERY (R1, 2026-09-19)
// ---------------------------------------------------------------------------
//
// THE ONE RULE THAT SHAPES ALL OF THIS: the public endpoints must never
// reveal whether an account exists, whether it has an email, or whether that
// email is verified. Manuscript p.49 promises "Forgot Password"; a parent
// logs in with their child’s LRN, so an endpoint that answered "no such
// account" would be an LRN oracle (§5c).

// The same body on every path, success or not — and for every channel
// (feat/sms-transport, 2026-09-29, decision Q1): no masked number, no "by
// text" vs "by email", because either would say which LRN has which contact.
const FORGOT_REPLY = {
  success: true,
  message: 'If this account has a confirmed email or mobile number, we sent a code to it.',
};

// POST /api/auth/forgot-password  { login_id }  -> 202, always
router.post('/forgot-password', async (req, res) => {
  const { login_id } = req.body;

  // The ONLY 400 here, and it is safe: it describes the REQUEST, not the
  // account. Everything that depends on which account was named is 202.
  if (typeof login_id !== 'string' || !login_id.trim()) {
    return res.status(400).json({ success: false, message: 'login_id is required.', field: 'login_id' });
  }

  const loginId = login_id.trim();
  const ip = req.ip;

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, email_verified_at, contact_number, contact_verified_at, status FROM users WHERE login_id = ? LIMIT 1',
      [loginId]
    );
    const user = rows[0];

    // EVERY CONFIRMED CHANNEL gets the SAME code (decision Q2). A confirmed
    // number counts only while SMS is switched on for this server.
    const channels = [];
    if (user && user.status === 'active') {
      if (user.email && user.email_verified_at) channels.push('email');
      if (sms.isEnabled() && user.contact_number && user.contact_verified_at) channels.push('sms');
    }

    if (!channels.length) {
      // TIMING, half one (Darryl, Q2). A miss skips the bcrypt a hit pays
      // for, so without this the response time answers the question the
      // message refuses to. ~100ms at cost 10, thrown away.
      await codes.burnTiming();
      return res.status(202).json(FORGOT_REPLY);
    }

    if (await codes.isRateLimited(user.id, 'password_reset', ip)) {
      await codes.burnTiming();
      return res.status(202).json(FORGOT_REPLY);
    }

    // One code, one row, whatever the number of channels — so one request
    // counts once toward the hourly limit.
    const { code, minutes } = await codes.createCode({
      userId: user.id,
      purpose: 'password_reset',
      email: channels.includes('email') ? user.email : null,
      contact: channels.includes('sms') ? user.contact_number : null,
      ip,
    });

    // TIMING, half two: respond BEFORE the SMTP or gateway round trip. A
    // send inside the response is a half-second tell that the account
    // exists, and no uniform message survives that.
    res.status(202).json(FORGOT_REPLY);

    const sends = channels.map((channel) => {
      if (channel === 'email') {
        const msg = mailer.resetCodeMessage({ name: user.name, code, minutes });
        return mailer.sendMail({ to: user.email, subject: msg.subject, text: msg.text }).then(
          () => ({ channel, ok: true }),
          async (err) => {
            await logActivity(user.id, 'password_reset_email_failed', 'Reset code could not be sent');
            console.error('Reset email failed:', err.message);
            return { channel, ok: false };
          }
        );
      }
      return sms.send({ to: user.contact_number, text: sms.resetCodeText({ code, minutes }), ttlSeconds: minutes * 60 }).then(
        () => ({ channel, ok: true }),
        async (err) => {
          // A1: the FIXED reason only — never err.message from fetch, which
          // can carry the gateway's host and port.
          const reason = err.reason || 'unreachable';
          await logActivity(user.id, 'password_reset_sms_failed', `Reset code could not be sent by text (${reason})`);
          console.error('Reset SMS failed:', reason);
          return { channel, ok: false };
        }
      );
    });
    Promise.all(sends).then(async (results) => {
      const sent = results.filter((r) => r.ok).map((r) => r.channel);
      if (sent.length) {
        await logActivity(user.id, 'password_reset_requested', `Reset code sent (${sent.join(', ')})`);
      } else {
        // The response has already gone and must not change. Nothing went
        // out, so burn the code — an unsendable one must not be usable by
        // whoever reads the table. If ANY channel delivered, it stays valid.
        await codes.burnPending(user.id, 'password_reset');
      }
    }).catch((err) => {
      // Bookkeeping after the reply; must never become an unhandled rejection.
      console.error('Reset send bookkeeping failed:', err.code || 'error');
    });
    return undefined;
  } catch (error) {
    console.error('Forgot password error:', error);
    // Even a server fault answers the same way. A 500 here would say "this
    // account exists and something went wrong for it".
    return res.status(202).json(FORGOT_REPLY);
  }
});

// POST /api/auth/reset-password  { login_id, code, new_password }
//
// ONE failure message for every cause: wrong code, expired, already used,
// too many attempts, unknown login id, ineligible account. Never a count of
// tries remaining — that is the same oracle in slower form.
router.post('/reset-password', async (req, res) => {
  const { login_id, code, new_password } = req.body;

  if (typeof login_id !== 'string' || !login_id.trim() || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'login_id and code are required.' });
  }

  // The password rule is checked BEFORE the code, so a user who typed a
  // weak password is told that rather than burning an attempt on a code
  // that was fine.
  const ruleError = validateNewPassword(new_password);
  if (ruleError) {
    return res.status(400).json({ success: false, message: ruleError, field: 'new_password' });
  }

  const INVALID = { success: false, message: 'That code is not valid. Request a new one.' };

  try {
    const [rows] = await pool.query('SELECT id, status FROM users WHERE login_id = ? LIMIT 1', [login_id.trim()]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      await codes.burnTiming();
      return res.status(400).json(INVALID);
    }

    const result = await codes.consumeCode({ userId: user.id, purpose: 'password_reset', code });
    if (!result.ok) return res.status(400).json(INVALID);

    const hashed = await hashPassword(new_password);
    // A1 again: the reset kills every session the old password left open,
    // which is the point of a reset. No replacement token — this caller is
    // not signed in; they go and log in.
    await pool.query(
      'UPDATE users SET password = ?, password_changed_at = NOW(3), token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
      [hashed, user.id]
    );
    await logActivity(user.id, 'password_reset', 'Password reset with a sent code');

    return res.json({ success: true, message: 'Password updated. You can sign in now.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset the password.' });
  }
});

// POST /api/auth/verify-email/request — authenticated, so honesty leaks
// nothing: this caller already knows their own email.
router.post('/verify-email/request', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT email, email_verified_at FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const row = rows[0];
    if (!row || !row.email) {
      return res.status(400).json({
        success: false,
        message: 'There is no email on this account. Ask the school office to add one.',
      });
    }
    if (row.email_verified_at) {
      return res.json({ success: true, message: 'This email is already confirmed.' });
    }
    if (await codes.isRateLimited(req.user.id, 'email_verification', req.ip)) {
      return res.status(429).json({
        success: false,
        message: 'Too many codes requested. Try again in an hour.',
      });
    }

    const { code, minutes } = await codes.createCode({
      userId: req.user.id,
      purpose: 'email_verification',
      email: row.email,
      ip: req.ip,
    });
    const msg = mailer.verifyEmailMessage({ name: req.user.name, code, minutes });

    try {
      await mailer.sendMail({ to: row.email, subject: msg.subject, text: msg.text });
    } catch (err) {
      await pool.query('UPDATE auth_codes SET consumed_at = NOW() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [
        req.user.id,
        'email_verification',
      ]);
      console.error('Verification email failed:', err.message);
      return res.status(503).json({
        success: false,
        message: 'Could not send the code right now. Try again, or ask the school office.',
      });
    }

    await logActivity(req.user.id, 'email_verification_requested', 'Verification code sent');
    return res.status(202).json({ success: true, message: 'We sent a code to your email address.' });
  } catch (error) {
    console.error('Verify email request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send the code.' });
  }
});

// POST /api/auth/verify-email/confirm — authenticated, { code }
router.post('/verify-email/confirm', authenticate, async (req, res) => {
  const { code } = req.body;
  try {
    const result = await codes.consumeCode({ userId: req.user.id, purpose: 'email_verification', code });
    if (!result.ok) {
      return res.status(400).json({ success: false, message: 'That code is not valid. Request a new one.' });
    }
    await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [req.user.id]);
    await logActivity(req.user.id, 'email_verified', 'Email address confirmed');
    return res.json({ success: true, message: 'Email confirmed. You can now reset your own password.' });
  } catch (error) {
    console.error('Verify email confirm error:', error);
    return res.status(500).json({ success: false, message: 'Failed to confirm the email.' });
  }
});

// ---------------------------------------------------------------------------
// MOBILE NUMBER CONFIRMATION (feat/sms-transport, 2026-09-29) — the twin of
// verify-email. Authenticated, so honest replies leak nothing: this caller
// already knows their own number. A confirmed number is what lets
// /forgot-password send a reset code by text.
// ---------------------------------------------------------------------------
const SMS_UNAVAILABLE = {
  success: false,
  message: 'Could not send the code right now. Try again, or ask the school office.',
};

// POST /api/auth/verify-contact/request
//
// A REQUEST THAT FAILS TO SEND STILL COUNTS toward the 3-per-hour limit: the
// code row is written before the gateway is called, then burned. That is the
// email flow's rule too, and it is what stops a dead gateway being hammered.
// A server with SMS switched off answers 503 BEFORE writing a code, so that
// case counts for nothing.
router.post('/verify-contact/request', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT contact_number, contact_verified_at FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const row = rows[0];
    if (!row || !row.contact_number) {
      return res.status(400).json({ success: false, message: 'There is no mobile number on this account. Add one first.' });
    }
    if (row.contact_verified_at) {
      return res.json({ success: true, message: 'This number is already confirmed.' });
    }
    if (!sms.isEnabled()) {
      console.error('Verification SMS failed:', 'bad_config');
      return res.status(503).json(SMS_UNAVAILABLE);
    }
    if (await codes.isRateLimited(req.user.id, 'contact_verification', req.ip)) {
      return res.status(429).json({ success: false, message: 'Too many codes requested. Try again in an hour.' });
    }

    const { code, minutes } = await codes.createCode({
      userId: req.user.id,
      purpose: 'contact_verification',
      contact: row.contact_number,
      ip: req.ip,
    });

    try {
      await sms.send({ to: row.contact_number, text: sms.verifyCodeText({ code, minutes }), ttlSeconds: minutes * 60 });
    } catch (err) {
      // A1: the fixed reason only, in the console and in activity_logs.
      const reason = err.reason || 'unreachable';
      await codes.burnPending(req.user.id, 'contact_verification');
      await logActivity(req.user.id, 'contact_verification_sms_failed', `Confirmation code could not be sent by text (${reason})`);
      console.error('Verification SMS failed:', reason);
      return res.status(503).json(SMS_UNAVAILABLE);
    }

    await logActivity(req.user.id, 'contact_verification_requested', 'Confirmation code sent by text');
    return res.status(202).json({ success: true, message: 'We sent a code to your mobile number.' });
  } catch (error) {
    console.error('Verify contact request error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to send the code.' });
  }
});

// POST /api/auth/verify-contact/confirm — authenticated, { code }
router.post('/verify-contact/confirm', authenticate, async (req, res) => {
  const { code } = req.body;
  const INVALID = { success: false, message: 'That code is not valid. Request a new one.' };
  try {
    const result = await codes.consumeCode({ userId: req.user.id, purpose: 'contact_verification', code });
    if (!result.ok) return res.status(400).json(INVALID);

    // THE SNAPSHOT'S JOB: the code must have gone to the number the account
    // holds NOW. A number change already burns pending codes; this also
    // refuses one that raced it. The UPDATE repeats the check, so a change
    // landing between the two statements confirms nothing.
    const [upd] = await pool.query(
      'UPDATE users SET contact_verified_at = NOW() WHERE id = ? AND contact_number = ?',
      [req.user.id, result.contactSnapshot]
    );
    if (!result.contactSnapshot || upd.affectedRows === 0) return res.status(400).json(INVALID);

    await logActivity(req.user.id, 'contact_verified', 'Mobile number confirmed');
    return res.json({ success: true, message: 'Mobile number confirmed. You can now get reset codes by text message.' });
  } catch (error) {
    console.error('Verify contact confirm error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to confirm the number.' });
  }
});

module.exports = router;
