const express = require('express');
const pool = require('../config/db');
const { comparePassword, hashPassword } = require('../utils/password');
const { validateNewPassword } = require('../utils/passwordRule');
const { validateContact } = require('../utils/contactRule');
const { validateEmail } = require('../utils/emailRule');
const { signToken, verifyToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { sanitizeUser } = require('../utils/sanitizeUser');
const { isDbUnavailable, sendDbUnavailable } = require('../utils/dbUnavailable');
const codes = require('../utils/authCodes');
const mailer = require('../utils/mailer');
const sms = require('../utils/smsTransport');
const photos = require('../utils/profilePhoto');
const throttle = require('../utils/loginThrottle');
const policy = require('../utils/policy');
const gates = require('../utils/accountGates');
const { sendPasswordAlert } = require('../utils/passwordAlert');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

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

// `policy_pending` (feat/privacy, 2026-10-10): true for an account — a parent,
// and since feat/staff-acceptance a teacher or the admin — that has not
// accepted the CURRENT Data Privacy Notice and Terms of Use. The client routes
// on it to the consent screen, as it routes on must_change_password — never
// on the 403 (§2).
//
// `contact_pending` and `contact_step` (feat/first-signin, 2026-10-18): the
// second of the three gates (utils/accountGates.js). `contact_step` is 'add'
// for an account with no confirmed Gmail or mobile number, 'reconfirm' for a
// forced-change account that has one but has not used it since THIS sign-in
// (`iat`, the token's), and null when nothing is pending.
function withAccountFlags(sanitized, row, acceptedCount, iat) {
  const contact = gates.contactState(row, iat);
  return {
    ...sanitized,
    must_change_password: row.must_change_password ? 1 : 0,
    policy_pending: policy.isPending(row.role, acceptedCount),
    contact_pending: contact.pending,
    contact_step: contact.step,
  };
}

async function acceptedCountFor(row) {
  if (!policy.mustAccept(row.role)) return 0;
  return Object.keys(await policy.currentAcceptances(row.id)).length;
}

// A TYPED LOGIN ID WITH A NUL IN IT NAMES NO ACCOUNT (P3-C-R2, review finding
// auth-1). PostgreSQL text cannot hold U+0000 — binding one is 22021, which
// the routes' catch turned into a 500, where MySQL simply found no row: a
// 401 with the failure counted, the reset's one 400, the forgot reply's 202.
// No stored login id can contain one, so the answer is "no such account"
// without asking the database.
function cannotBeALoginId(value) {
  return String(value).includes('\u0000');
}

// `u.login_id = ?` is case-insensitive through the column's portal.ci
// collation (migration/docs/02 D) — the sign-in path depends on it, as it
// depended on utf8mb4_unicode_ci.
async function fetchUserByLoginId(loginId) {
  if (cannotBeALoginId(loginId)) return null;
  const { rows } = await pool.query(
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
    const typed = String(login_id).trim();

    // SIGN-IN LIMITS (utils/loginThrottle.js): checked BEFORE the password,
    // so a locked account refuses even the right one until the window
    // passes. Keyed on the TYPED id, so an unknown id locks exactly like a
    // real one, and the 429 names neither which limit nor whether the
    // account exists.
    const key = throttle.loginKey(typed);
    const ip = req.ip || null;
    if (await throttle.isLimited(key, ip)) {
      return res.status(429).json({ success: false, message: throttle.TOO_MANY });
    }

    const user = await fetchUserByLoginId(typed);
    const valid = user ? await comparePassword(password, user.password) : false;
    if (!valid) {
      await throttle.recordFailure(key, ip);
      // The user id only, never the login id or an LRN (§5c). An id that
      // matches no account has no user to name, so it is counted above and
      // not logged.
      if (user) await logActivity(user.id, 'login_failed', 'Sign-in failed');
      return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
    }

    // The right password: this account's failure count starts again.
    await throttle.clearAccount(key);

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
      user: withAccountFlags(sanitizeUser(user), user, await acceptedCountFor(user), verifyToken(token).iat),
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
    return res.json({
      success: true,
      user: withAccountFlags(sanitizeUser(user), user, req.user.policy_accepted, req.tokenIat),
    });
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
    const { rows } = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
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
    // `must_change_password = 0` is a no-op since feat/first-signin: no gate
    // lets an account in the forced state reach this endpoint, whose own
    // replacement is PUT /first-password below. Kept so the row can never be
    // left flagged by a password the owner chose.
    await pool.query(
      'UPDATE users SET password = ?, password_changed_at = portal.now_ms(), token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
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
    const {
      rows: [v],
    } = await pool.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const token = mintToken({ id: req.user.id, role: req.user.role }, v.token_version);

    res.json({ success: true, message: 'Password changed successfully.', token });
    // THE PASSWORD ALERT (feat/password-alert, 2026-10-21): the "was this
    // you?" note to every confirmed channel, AFTER the reply and never awaited
    // — a failed send changes nothing here (utils/passwordAlert.js).
    sendPasswordAlert({ userId: req.user.id, kind: 'password_changed' });
    return undefined;
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// PUT /api/auth/first-password  { new_password }  -> { message, token }
//
// THE FORCED CHANGE'S OWN ENDPOINT (feat/first-signin, 2026-10-18). A new
// account, or one an admin gave a temporary password, sets its own password
// here — with NO current password: the temporary one was typed at sign-in,
// and the code just confirmed is the second proof. The password gate
// (utils/accountGates.js) lets only this path through, and only after the
// contact gate is clear. The guard, in order:
//
//   1. the account is in the forced state             else 409
//   2. it confirmed a contact SINCE THIS SIGN-IN      else 403 CONTACT_VERIFICATION_REQUIRED
//   3. the password rule (8+ characters, a digit)     else 400, field new_password
//   4. not the password it already has                else 400, field new_password
//   5. the UPDATE repeats step 1 (`AND must_change_password = 1`), so two
//      tabs racing cannot both set it; 0 rows changed is step 1's 409
//
// Then the same token rules as change-password: token_version is bumped (every
// other session ends), the version is READ BACK, and a replacement token goes
// to this caller, who must store it (AuthContext.applyToken).
const PASSWORD_ALREADY_SET = {
  success: false,
  message: 'Your password is already set. Change it in Settings.',
};

router.put('/first-password', authenticate, async (req, res) => {
  const { new_password } = req.body || {};

  if (!req.user.must_change_password) return res.status(409).json(PASSWORD_ALREADY_SET);
  if (!gates.confirmedSince(req.user, req.tokenIat)) {
    return res.status(403).json({
      success: false,
      message: 'Confirm your Gmail or mobile number first.',
      code: gates.GATES.contact.code,
    });
  }

  const ruleError = validateNewPassword(new_password);
  if (ruleError) {
    return res.status(400).json({ success: false, message: ruleError, field: 'new_password' });
  }

  try {
    const { rows } = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (await comparePassword(new_password, rows[0].password)) {
      return res.status(400).json({
        success: false,
        message: 'Choose a new password, not the temporary one.',
        field: 'new_password',
      });
    }

    const hashed = await hashPassword(new_password);
    const upd = await pool.query(
      `UPDATE users SET password = ?, password_changed_at = portal.now_ms(), token_version = token_version + 1,
              must_change_password = 0
        WHERE id = ? AND must_change_password = 1`,
      [hashed, req.user.id]
    );
    if (upd.rowCount === 0) return res.status(409).json(PASSWORD_ALREADY_SET);

    await logActivity(req.user.id, 'change_password', 'Password set at first sign-in');

    const {
      rows: [v],
    } = await pool.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const token = mintToken({ id: req.user.id, role: req.user.role }, v.token_version);

    res.json({ success: true, message: 'Password saved.', token });
    // The password alert, after the reply (one rule, no branch — the owner's
    // answer Q1: a brand-new account is told too).
    sendPasswordAlert({ userId: req.user.id, kind: 'password_changed' });
    return undefined;
  } catch (error) {
    if (isDbUnavailable(error)) return sendDbUnavailable(res, 'First password', error);
    console.error('First password error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to save the password.' });
  }
});

// PUT /api/auth/contact — any authenticated user updates their own
// contact_number. Identity (name, LRN/login_id, role, student_id) is
// school-owned: sending those fields is 400, same loud-reject as
// PUT /api/users/:id, not a silent ignore. Id comes from req.user
// (authenticate re-reads the DB row), never the body. `email` is refused HERE
// too, but since feat/first-signin (2026-10-18) it is no longer the school's:
// the account holder sets it through PUT /auth/email below, one field per
// endpoint so each change unconfirms only what it changed.
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
    const {
      rows: [current],
    } = await pool.query('SELECT contact_number FROM users WHERE id = ? LIMIT 1', [req.user.id]);
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

// PUT /api/auth/email  { email }  -> { message, user }
//
// YOUR OWN EMAIL (feat/first-signin, 2026-10-18; the owner's scope item 2).
// It was a school record that only an admin could change (PUT /users/:id);
// now the account holder sets it — at the first-sign-in step and in Settings —
// and confirms it with a code. The twin of PUT /contact above:
//
//   - one field: the identity fields and `contact_number` are a loud 400;
//   - required and non-empty here, then the one email rule
//     (utils/emailRule.js), stored trimmed, never re-cased;
//   - A CHANGE UNCONFIRMS IT and burns every pending email code, so a code
//     already in the old inbox cannot confirm the new address. Compared
//     exactly, as PUT /users/:id compares it (`<=>`), so a re-cased address
//     is a change;
//   - the same address may sit on more than one account (a guardian with two
//     children has two accounts — LOCKED DECISIONS), so nothing checks for it.
//
// activity_logs gets the action only, never the address.
const EMAIL_FORBIDDEN_FIELDS = [
  ...CONTACT_FORBIDDEN_FIELDS.filter((field) => field !== 'email'),
  'contact_number',
];

router.put('/email', authenticate, async (req, res) => {
  const body = req.body || {};
  const sentForbidden = EMAIL_FORBIDDEN_FIELDS.filter((field) => body[field] !== undefined);
  if (sentForbidden.length) {
    return res.status(400).json({
      success: false,
      message: `Cannot change ${sentForbidden.join(', ')} through this endpoint.`,
    });
  }

  if (body.email === undefined) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }
  if (!String(body.email).trim()) {
    return res.status(400).json({ success: false, message: 'email must not be empty.', field: 'email' });
  }
  const email = validateEmail(body.email);
  if (email.error) {
    return res.status(400).json({ success: false, message: email.error, field: 'email' });
  }

  try {
    const {
      rows: [current],
    } = await pool.query('SELECT email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const changed = (current?.email ?? null) !== email.value;
    if (changed) {
      await pool.query('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', [email.value, req.user.id]);
      await codes.burnPending(req.user.id, 'email_verification');
    }
    await logActivity(req.user.id, 'update_email', 'Email address updated');

    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, message: 'Email address updated.', user: sanitizeUser(user) });
  } catch (error) {
    if (isDbUnavailable(error)) return sendDbUnavailable(res, 'Update email', error);
    console.error('Update email error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to update the email address.' });
  }
});

// ---------------------------------------------------------------------------
// PROFILE PHOTO — YOUR OWN (feat/profile-photos, 2026-09-30)
// ---------------------------------------------------------------------------
//
// PUT    /api/auth/photo   multipart, one file in `photo`  -> { user }
// DELETE /api/auth/photo                                   -> { user }
//
// OWN ACCOUNT ONLY BY CONSTRUCTION: there is no :id, the row is req.user.id.
// The rules for the file — re-encoded 512 × 512 JPEG, a random 32-hex name,
// EXIF stripped — live in utils/profilePhoto.js. Replacing writes the new
// file, points the row at it, THEN deletes the old one, so a failure in
// between leaves the old photo showing rather than none. activity_logs gets
// the action only: never the file name (it is the photo's access key) and
// never a login id.
//
// Both reply with the same `user` as GET /me, so a client can re-read /me or
// use this directly. Removing when there is no photo is a 200 no-op.
router.put('/photo', authenticate, async (req, res) => {
  const received = await photos.receivePhoto(req, res);
  if (!received.file) {
    return res.status(received.status).json({ success: false, message: received.message });
  }
  const encoded = await photos.reencode(received.file.buffer);
  if (encoded.error) {
    return res.status(400).json({ success: false, message: encoded.error });
  }

  let written = null;
  try {
    const {
      rows: [current],
    } = await pool.query('SELECT profile_pic FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    written = await photos.writePhoto(encoded.buffer);
    await pool.query('UPDATE users SET profile_pic = ? WHERE id = ?', [written, req.user.id]);
    const saved = written;
    written = null;
    if (current?.profile_pic && current.profile_pic !== saved) await photos.removePhotoFile(current.profile_pic);
    await logActivity(req.user.id, 'upload_profile_photo', 'Profile photo uploaded');

    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({
      success: true,
      message: 'Profile photo updated.',
      user: withAccountFlags(sanitizeUser(user), user, req.user.policy_accepted, req.tokenIat),
    });
  } catch (error) {
    // A file written but never recorded is removed, not left as an orphan.
    if (written) await photos.removePhotoFile(written);
    if (isDbUnavailable(error)) return sendDbUnavailable(res, 'Upload photo', error);
    console.error('Upload photo error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save the photo.' });
  }
});

router.delete('/photo', authenticate, async (req, res) => {
  try {
    const {
      rows: [current],
    } = await pool.query('SELECT profile_pic FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (current?.profile_pic) {
      await pool.query('UPDATE users SET profile_pic = NULL WHERE id = ?', [req.user.id]);
      await photos.removePhotoFile(current.profile_pic);
      await logActivity(req.user.id, 'remove_profile_photo', 'Profile photo removed');
    }

    const user = await fetchUserByLoginId(req.user.login_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({
      success: true,
      message: current?.profile_pic ? 'Profile photo removed.' : 'There was no profile photo to remove.',
      user: withAccountFlags(sanitizeUser(user), user, req.user.policy_accepted, req.tokenIat),
    });
  } catch (error) {
    if (isDbUnavailable(error)) return sendDbUnavailable(res, 'Remove photo', error);
    console.error('Remove photo error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove the photo.' });
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
    const { rows } = cannotBeALoginId(loginId)
      ? { rows: [] }
      : await pool.query(
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

    // THE RESEND COOLDOWN (feat/first-signin, 2026-10-18), SILENT HERE: inside
    // 60 seconds of the last code nothing is sent, and the reply and its cost
    // are the same as a send — a 429 or a "wait N seconds" would say this
    // login id has a confirmed contact. The clients count the minute down
    // after every 202 alike.
    if ((await codes.cooldownRemaining(user.id, 'password_reset')) > 0) {
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
    const { rows } = cannotBeALoginId(login_id)
      ? { rows: [] }
      : await pool.query('SELECT id, status FROM users WHERE login_id = ? LIMIT 1', [login_id.trim()]);
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
      'UPDATE users SET password = ?, password_changed_at = portal.now_ms(), token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
      [hashed, user.id]
    );
    await logActivity(user.id, 'password_reset', 'Password reset with a sent code');

    res.json({ success: true, message: 'Password updated. You can sign in now.' });
    // The password alert, after the reply: a reset by one inbox or phone is
    // told to every OTHER confirmed channel too. Sent only after a successful
    // reset, with the reply unchanged, so nothing here is an oracle.
    sendPasswordAlert({ userId: user.id, kind: 'password_changed' });
    return undefined;
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset the password.' });
  }
});

// THE TWO VERIFY REQUESTS SHARE THESE (feat/first-signin, 2026-10-18).
//
// RECONFIRM: an account in the forced-change state that has not confirmed a
// contact since THIS sign-in is sent a code even for an address or number that
// is already confirmed — the password gate needs a confirmation made in this
// session (utils/accountGates.js, PUT /first-password).
function needsReconfirm(req) {
  return Boolean(req.user.must_change_password) && !gates.confirmedSince(req.user, req.tokenIat);
}

// The 60-second resend cooldown, honest here (the caller knows their own
// contact): a 429 with the seconds left in `retry_after`, which the clients
// count down. Checked AFTER the hourly limit, so "wait 40 seconds" is never
// said to an account that would then be refused for the hour.
function cooldownReply(seconds) {
  return {
    success: false,
    message: `Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}, then ask for a new code.`,
    retry_after: seconds,
  };
}

// The hourly limit (3 per account, 10 per IP) is unchanged — decision D3 — and
// names the other channel, which has a limit of its own. The mobile number is
// named only when this server can send texts.
function hourlyReply(otherChannel) {
  return {
    success: false,
    message: otherChannel
      ? `Too many codes requested. Try again in an hour, or use your ${otherChannel} instead.`
      : 'Too many codes requested. Try again in an hour.',
  };
}

// POST /api/auth/verify-email/request — authenticated, so honesty leaks
// nothing: this caller already knows their own email.
router.post('/verify-email/request', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email, email_verified_at FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const row = rows[0];
    if (!row || !row.email) {
      return res.status(400).json({
        success: false,
        message: 'There is no email on this account. Add your email first.',
      });
    }
    if (row.email_verified_at && !needsReconfirm(req)) {
      return res.json({ success: true, message: 'This email is already confirmed.' });
    }
    if (await codes.isRateLimited(req.user.id, 'email_verification', req.ip)) {
      return res.status(429).json(hourlyReply(sms.isEnabled() ? 'mobile number' : null));
    }
    const wait = await codes.cooldownRemaining(req.user.id, 'email_verification');
    if (wait > 0) return res.status(429).json(cooldownReply(wait));

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
      await pool.query('UPDATE auth_codes SET consumed_at = portal.now_s() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [
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
    const INVALID = { success: false, message: 'That code is not valid. Request a new one.' };
    const result = await codes.consumeCode({ userId: req.user.id, purpose: 'email_verification', code });
    if (!result.ok) return res.status(400).json(INVALID);

    // THE SNAPSHOT CHECK, as verify-contact has had since feat/sms-transport
    // (feat/first-signin, 2026-10-18 — the address became the user's to
    // change): the code must have gone to the address the account holds NOW.
    // PUT /auth/email and PUT /users/:id already burn pending codes on a
    // change; the UPDATE's own condition refuses one that raced them. The
    // stamp is ALWAYS rewritten, so a re-confirm counts as "since this
    // sign-in" (utils/accountGates.js).
    const upd = await pool.query('UPDATE users SET email_verified_at = portal.now_s() WHERE id = ? AND email = ?', [
      req.user.id,
      result.emailSnapshot,
    ]);
    if (!result.emailSnapshot || upd.rowCount === 0) return res.status(400).json(INVALID);

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
    const { rows } = await pool.query('SELECT contact_number, contact_verified_at FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const row = rows[0];
    if (!row || !row.contact_number) {
      return res.status(400).json({ success: false, message: 'There is no mobile number on this account. Add one first.' });
    }
    if (row.contact_verified_at && !needsReconfirm(req)) {
      return res.json({ success: true, message: 'This number is already confirmed.' });
    }
    if (!sms.isEnabled()) {
      console.error('Verification SMS failed:', 'bad_config');
      return res.status(503).json(SMS_UNAVAILABLE);
    }
    if (await codes.isRateLimited(req.user.id, 'contact_verification', req.ip)) {
      return res.status(429).json(hourlyReply('Gmail'));
    }
    const wait = await codes.cooldownRemaining(req.user.id, 'contact_verification');
    if (wait > 0) return res.status(429).json(cooldownReply(wait));

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
    const upd = await pool.query(
      'UPDATE users SET contact_verified_at = portal.now_s() WHERE id = ? AND contact_number = ?',
      [req.user.id, result.contactSnapshot]
    );
    if (!result.contactSnapshot || upd.rowCount === 0) return res.status(400).json(INVALID);

    await logActivity(req.user.id, 'contact_verified', 'Mobile number confirmed');
    return res.json({ success: true, message: 'Mobile number confirmed. You can now get reset codes by text message.' });
  } catch (error) {
    console.error('Verify contact confirm error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to confirm the number.' });
  }
});

module.exports = router;
