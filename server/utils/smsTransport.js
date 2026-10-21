const fs = require('fs');
const path = require('path');
const { toE164 } = require('./contactRule');

// Outbound text messages (feat/sms-transport, 2026-09-29). The twin of
// utils/mailer.js: one place, the transport chosen ONCE at module load from
// the environment, never from a request.
//
//   SMS_TRANSPORT=gateway  POST to "SMS Gateway for Android" in LOCAL mode on
//                          the demo phone (its own SIM, no paid service):
//                          SMS_GATEWAY_URL (http://<phone-ip>:8080),
//                          SMS_GATEWAY_USER, SMS_GATEWAY_PASS (Basic auth —
//                          the only auth local mode supports).
//   SMS_TRANSPORT=file     write server/tmp/sms/*.json instead (git-ignored).
//                          The suites read codes from there; no proof or
//                          suite ever sends a real text.
//   unset / anything else  SMS is OFF. A confirmed number then does not count
//                          as a reset channel, and a confirm request is 503.
//
// Node's built-in fetch — no new dependency.
//
// ---------------------------------------------------------------------------
// FAILURES ARE A FIXED REASON, NEVER A RAW ERROR (amendment A1)
// ---------------------------------------------------------------------------
// A fetch failure's message and cause carry the gateway's host and port
// ("connect ECONNREFUSED 10.x.x.x:8080"), and the URL is a secret of this
// deployment. So every failure is thrown as an Error whose message IS one of:
//   unreachable | timeout | http_<status> | bad_config
// with NO `cause` attached, so nothing downstream can print the original.
// Callers log that reason and nothing else. Never logged anywhere in this
// file: the URL, the credentials, the number, the code or the message body.
// test-sms-transport.js refuses a real connection and asserts no IP or port
// survives into anything a caller could print.

const SMS_DIR = path.join(__dirname, '..', 'tmp', 'sms');
const TIMEOUT_MS = 10000;
const REASONS = ['unreachable', 'timeout', 'bad_config'];

function failure(reason) {
  const err = new Error(reason);
  err.reason = reason;
  return err;
}

function reasonFor(err) {
  const name = err && err.name;
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
}

// Accepts only an http(s) origin, and keeps it without a trailing slash.
function baseUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function createTransport({ mode, url, user, pass, fetchImpl = fetch, dir = SMS_DIR, timeoutMs = TIMEOUT_MS } = {}) {
  const base = baseUrl(url);
  const configured = mode === 'gateway' && Boolean(base && user && pass);
  const authHeader = configured ? `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` : null;

  function isEnabled() {
    return mode === 'file' || mode === 'gateway';
  }

  // Resolves { transport } when the gateway ACCEPTED the message (any 2xx).
  // Acceptance is all this knows — delivery is the phone's business, and
  // Android may leave a delivered text at "Sent" (decision Q8: log acceptance
  // only). `ttl` matches the code's life, so a stalled queue cannot deliver a
  // dead code later.
  //
  // `kind` (feat/password-alert, 2026-10-21) goes into the FILE-MODE JSON only
  // — 'password_alert' marks a text that carries no code, so a suite reading
  // codes off disk can skip it. The gateway never sees it.
  async function send({ to, text, ttlSeconds = 600, kind }) {
    const number = toE164(to);
    if (!number || typeof text !== 'string' || !text) throw failure('bad_config');

    if (mode === 'file') {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
      fs.writeFileSync(file, JSON.stringify({ to: number, text, ttl: ttlSeconds, kind, written_at: new Date().toISOString() }, null, 2));
      return { transport: 'file', file };
    }
    if (!configured) throw failure('bad_config');

    let res;
    try {
      res = await fetchImpl(`${base}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ textMessage: { text }, phoneNumbers: [number], ttl: ttlSeconds }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw failure(reasonFor(err));
    }
    if (!res.ok) throw failure(`http_${res.status}`);
    return { transport: 'gateway', status: res.status };
  }

  // For scripts/probe-sms-gateway.js only. GET /health sends nothing. Returns
  // plain facts about the phone, or { reachable: false, reason } — never the
  // URL. Sends the credentials too: harmless if /health does not need them,
  // and the docs do not say whether it does.
  async function health() {
    if (mode !== 'gateway') return { reachable: false, reason: 'bad_config', mode: mode || 'off' };
    if (!configured) return { reachable: false, reason: 'bad_config', mode };
    let res;
    try {
      res = await fetchImpl(`${base}/health`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { reachable: false, reason: reasonFor(err), mode };
    }
    const body = await res.json().catch(() => ({}));
    const checks = {};
    for (const [key, value] of Object.entries(body.checks || {})) {
      checks[key] = { status: value && value.status, observed: value && value.observedValue };
    }
    return { reachable: true, mode, httpStatus: res.status, status: body.status, version: body.version, checks };
  }

  return { mode, isEnabled, send, health };
}

const MODE = process.env.SMS_TRANSPORT === 'gateway' ? 'gateway' : process.env.SMS_TRANSPORT === 'file' ? 'file' : 'off';
const FILE_TRANSPORT = MODE === 'file';

// Once, naming the missing variables by NAME, never by value.
if (MODE === 'gateway') {
  const missing = ['SMS_GATEWAY_URL', 'SMS_GATEWAY_USER', 'SMS_GATEWAY_PASS'].filter((k) => !process.env[k]);
  if (missing.length) console.error(`SMS is set to gateway but ${missing.join(', ')} is missing in server/.env. No text will be sent.`);
  else if (!baseUrl(process.env.SMS_GATEWAY_URL)) console.error('SMS_GATEWAY_URL in server/.env is not an http(s) URL. No text will be sent.');
}

const transport = createTransport({
  mode: MODE,
  url: process.env.SMS_GATEWAY_URL,
  user: process.env.SMS_GATEWAY_USER,
  pass: process.env.SMS_GATEWAY_PASS,
});

// ---------------------------------------------------------------------------
// The two texts. ASCII only (GSM-7, so one part up to 160 characters — no
// curly quotes, no dashes that would flip the encoding and halve the limit),
// and like the emails they carry NO LRN, login id or student name (§5c).
// ---------------------------------------------------------------------------
function resetCodeText({ code, minutes }) {
  return `Parent's Portal: your password reset code is ${code}. It expires in ${minutes} minutes. Nobody from the school will ever ask for this code.`;
}

function verifyCodeText({ code, minutes }) {
  return `Parent's Portal: your mobile number confirmation code is ${code}. It expires in ${minutes} minutes.`;
}

// THE PASSWORD ALERT'S TWO TEXTS (feat/password-alert, 2026-10-21; the owner's
// wording). The same rules — ASCII, one GSM-7 part — and like the emails: no
// code, no link, no login id, no LRN, no learner name, no run of six digits.
// utils/passwordAlert.js is the one caller.
function passwordChangedText() {
  return "Parent's Portal: your password was changed just now. If this was not you, use Forgot password on the sign-in page or tell the school office.";
}

function temporaryPasswordText() {
  return "Parent's Portal: the school office set a temporary password for your account just now. If you did not ask for this, tell the school office.";
}

module.exports = {
  createTransport,
  send: transport.send,
  isEnabled: transport.isEnabled,
  health: transport.health,
  resetCodeText,
  verifyCodeText,
  passwordChangedText,
  temporaryPasswordText,
  SMS_MODE: MODE,
  FILE_TRANSPORT,
  SMS_DIR,
  REASONS,
};
