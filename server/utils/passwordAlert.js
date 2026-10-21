const pool = require('../config/db');
const mailer = require('./mailer');
const sms = require('./smsTransport');
const { logActivity } = require('./activity');

// THE PASSWORD ALERT (feat/password-alert, 2026-10-21; the owner's decision of
// 2026-10-14/16): after a password has CHANGED, the account holder is told —
// the "was this you?" note — on every confirmed channel they have. One rule,
// no branch: Settings → Change password, the forgot-password reset, the first
// sign-in's own password, and the admin's temporary password (its own words:
// "the school office set a temporary password"). A restore sends nothing.
//
// FOUR CALLERS, ONE FUNCTION, AND IT RUNS AFTER THE REPLY. Every caller has
// already written the row and sent its response; this is called without
// `await`, like forgot-password's sends (routes/auth.js). So:
//   - a send that fails changes nothing and undoes nothing — the password is
//     the holder's new one whatever happens here;
//   - no response waits for SMTP or the gateway;
//   - this function never rejects: every failure is logged and swallowed.
//
// CHANNELS — the same predicate as forgot-password: the email when
// `email_verified_at` is set, the number when `contact_verified_at` is set
// AND this server can send texts (sms.isEnabled()). Both when both. Nothing
// confirmed: no message, one `password_alert_not_sent` row, so the office can
// see why nobody heard (the owner's answer Q8).
//
// NOT A CODE: no auth_codes row, so an alert never counts toward the hourly
// code limits or the resend cooldown, and burns nothing. No cap of its own
// (Q3): every send needs a real password change behind it.
//
// LOGGED ON THE HOLDER'S ID, NEVER A VALUE: `password_alert_sent` with the
// channel names, `password_alert_email_failed`, `password_alert_sms_failed`
// with the transport's FIXED reason (amendment A1 — never a fetch message,
// which can carry the gateway's host and port). The admin's own
// `admin_temp_password` row stays on the admin.
//
// `kind`: 'password_changed' (three paths) or 'temporary_password' (the
// admin's). The texts live in mailer.js and smsTransport.js, approved as
// written; the file-mode JSON carries `kind: 'password_alert'` so a suite
// reading codes off disk can skip these.

const KINDS = {
  password_changed: {
    mail: mailer.passwordChangedMessage,
    text: sms.passwordChangedText,
  },
  temporary_password: {
    mail: mailer.temporaryPasswordMessage,
    text: sms.temporaryPasswordText,
  },
};

async function sendPasswordAlert({ userId, kind }) {
  const messages = KINDS[kind];
  if (!messages) {
    console.error('Password alert: unknown kind', String(kind));
    return { sent: [], reason: 'bad_kind' };
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, email_verified_at, contact_number, contact_verified_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = rows[0];
    if (!user) return { sent: [], reason: 'no_user' };

    const channels = [];
    if (user.email && user.email_verified_at) channels.push('email');
    if (sms.isEnabled() && user.contact_number && user.contact_verified_at) channels.push('sms');

    if (!channels.length) {
      await logActivity(user.id, 'password_alert_not_sent', 'No confirmed Gmail or mobile number');
      return { sent: [], reason: 'no_channel' };
    }

    const sends = channels.map((channel) => {
      if (channel === 'email') {
        const msg = messages.mail({ name: user.name });
        return mailer.sendMail({ to: user.email, subject: msg.subject, text: msg.text, kind: 'password_alert' }).then(
          () => ({ channel, ok: true }),
          async (err) => {
            await logActivity(user.id, 'password_alert_email_failed', 'Password alert could not be sent by email');
            console.error('Password alert email failed:', err.message);
            return { channel, ok: false };
          }
        );
      }
      return sms.send({ to: user.contact_number, text: messages.text(), kind: 'password_alert' }).then(
        () => ({ channel, ok: true }),
        async (err) => {
          const reason = err.reason || 'unreachable';
          await logActivity(user.id, 'password_alert_sms_failed', `Password alert could not be sent by text (${reason})`);
          console.error('Password alert SMS failed:', reason);
          return { channel, ok: false };
        }
      );
    });

    const results = await Promise.all(sends);
    const sent = results.filter((r) => r.ok).map((r) => r.channel);
    if (sent.length) {
      await logActivity(user.id, 'password_alert_sent', `Password alert sent (${sent.join(', ')})`);
    }
    return { sent, reason: sent.length ? null : 'send_failed' };
  } catch (error) {
    // Bookkeeping after the reply; must never become an unhandled rejection.
    console.error('Password alert failed:', error.code || 'error');
    return { sent: [], reason: 'error' };
  }
}

module.exports = { sendPasswordAlert, KINDS };
