const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Outbound email. One place, two transports, and the choice is made ONCE at
// module load from the environment (R1, 2026-09-19).
//
// WHY nodemailer IS THE ONE NEW DEPENDENCY THIS FEATURE ADDS. Speaking SMTP by
// hand means STARTTLS negotiation, AUTH LOGIN base64, CRLF and dot-stuffing
// rules and MIME headers — a few hundred lines that must be exactly right, on
// the password-reset path, where "nearly right" means either silence or leaked
// credentials. Rejected alternatives: raw `tls` sockets (fragile, and this is
// the wrong feature to be brave in) and an HTTP mail API (needs an account,
// and this deployment is local-only by decision).
//
// ---------------------------------------------------------------------------
// THE TEST TRANSPORT, AND WHY IT CANNOT BE TURNED ON BY A REQUEST
// ---------------------------------------------------------------------------
// A suite has to read a code that no endpoint may ever return. So when
// MAIL_TRANSPORT is exactly 'file', a message is written to server/tmp/mail/
// instead of sent, and the suite reads it from disk.
//
// The switch is read from process.env HERE, at module load, into a const. It
// is never read again, never read per call, and never read from a request.
// There is no code path anywhere in server/ that writes process.env. So:
//
//   - a body, query string or header saying MAIL_TRANSPORT=file does nothing,
//     because nothing looks at a request to decide this;
//   - flipping it requires shell access to start the process differently,
//     which is a different threat model entirely;
//   - with the variable absent — which is every normal run, including
//     production — `FILE_TRANSPORT` is false and the only path is SMTP.
//
// test-recovery-flows.js asserts all of that, including that a request
// carrying the flag changes nothing.
const FILE_TRANSPORT = process.env.MAIL_TRANSPORT === 'file';
const MAIL_DIR = path.join(__dirname, '..', 'tmp', 'mail');

const SMTP = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};

function isConfigured() {
  return Boolean(SMTP.host && SMTP.user && SMTP.pass && SMTP.from);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.port === 465,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transporter;
}

let warned = false;

// Throws on failure. Callers decide what a failure means — for the public
// forgot-password path it must NOT change the response (see routes/auth.js).
//
// NOTHING HERE IS EVER LOGGED. Not the code, not the body, not SMTP_PASS, not
// SMTP_USER. The only thing printed on a failure is the error message, and the
// only thing printed on success in file mode is the filename.
//
// `kind` (feat/password-alert, 2026-10-21) is written into the FILE-MODE JSON
// only — 'password_alert' marks a message that carries no code, so a suite
// reading codes off disk can skip it. SMTP never sees it.
async function sendMail({ to, subject, text, kind }) {
  if (FILE_TRANSPORT) {
    fs.mkdirSync(MAIL_DIR, { recursive: true });
    const file = path.join(MAIL_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(file, JSON.stringify({ to, subject, text, kind, written_at: new Date().toISOString() }, null, 2));
    return { transport: 'file', file };
  }

  if (!isConfigured()) {
    if (!warned) {
      warned = true;
      // Once, and it names which variables are missing by NAME, never value.
      const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].filter((k) => !process.env[k]);
      console.error(`Mail is not configured — set ${missing.join(', ')} in server/.env. No mail will be sent.`);
    }
    throw new Error('Mail transport is not configured.');
  }

  await getTransporter().sendMail({ from: SMTP.from, to, subject, text });
  return { transport: 'smtp' };
}

// ---------------------------------------------------------------------------
// The two messages. NEITHER CARRIES AN LRN, A LOGIN ID OR A STUDENT NAME —
// a parent's login_id IS their child's LRN (§5c), and an inbox is not a place
// to put one. The recipient already knows which account they asked about.
// ---------------------------------------------------------------------------
function resetCodeMessage({ name, code, minutes }) {
  return {
    subject: "Parent's Portal — your password reset code",
    text: [
      `Hello ${name},`,
      '',
      `Your password reset code is: ${code}`,
      '',
      `It expires in ${minutes} minutes and can be used once.`,
      '',
      'If you did not ask to reset your password, you can ignore this message —',
      'nothing has changed.',
      '',
      'Nobody from the school will ever ask you for this code.',
      '',
      "Parent's Portal · Captain H. Francisco Elementary School",
    ].join('\n'),
  };
}

function verifyEmailMessage({ name, code, minutes }) {
  return {
    subject: "Parent's Portal — confirm your email address",
    text: [
      `Hello ${name},`,
      '',
      `Your email confirmation code is: ${code}`,
      '',
      `It expires in ${minutes} minutes and can be used once.`,
      '',
      'Confirming your email is what lets you reset your own password later.',
      '',
      'Nobody from the school will ever ask you for this code.',
      '',
      "Parent's Portal · Captain H. Francisco Elementary School",
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// THE PASSWORD ALERT (feat/password-alert, 2026-10-21; the owner's decision of
// 2026-10-14/16, the texts approved as written). Sent AFTER a password has
// changed, to every confirmed channel — the "was this you?" note. No code, no
// link (a link is what a phishing message would copy), no login id, no LRN,
// no learner name, and no run of six digits (a suite reads codes by that
// shape). utils/passwordAlert.js is the one caller.
// ---------------------------------------------------------------------------
function passwordChangedMessage({ name }) {
  return {
    subject: "Parent's Portal — your password was changed",
    text: [
      `Hello ${name},`,
      '',
      "The password for your Parent's Portal account was changed just now.",
      '',
      'If this was you, there is nothing to do.',
      '',
      "If it was not you, open the Parent's Portal sign-in page, choose",
      'Forgot password and set a new password with the code we send — or',
      'tell the school office.',
      '',
      'Nobody from the school will ever ask you for your password.',
      '',
      "Parent's Portal · Captain H. Francisco Elementary School",
    ].join('\n'),
  };
}

function temporaryPasswordMessage({ name }) {
  return {
    subject: "Parent's Portal — the school office reset your password",
    text: [
      `Hello ${name},`,
      '',
      "The school office set a temporary password for your Parent's Portal",
      'account just now. Every device that was signed in has been signed out.',
      '',
      'If you asked the office for this, use the temporary password they gave',
      'you the next time you sign in. You will then confirm your Gmail or',
      'mobile number and choose a password of your own.',
      '',
      'If you did not ask for this, tell the school office.',
      '',
      'Nobody from the school will ever ask you for your password.',
      '',
      "Parent's Portal · Captain H. Francisco Elementary School",
    ].join('\n'),
  };
}

module.exports = {
  sendMail,
  isConfigured,
  resetCodeMessage,
  verifyEmailMessage,
  passwordChangedMessage,
  temporaryPasswordMessage,
  FILE_TRANSPORT,
  MAIL_DIR,
};
