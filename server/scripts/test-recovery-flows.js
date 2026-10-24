/**
 * Account recovery tests — the uniform-response rule, code lifecycle, rate
 * limits, per-user token revocation (A1), newest-code-only (A2), the forced
 * change, and the test transport's own safety.
 *
 * Prerequisite: npm run db:migrate:auth-codes and
 * npm run db:migrate:contact-verification, and the API started with
 *   MAIL_TRANSPORT=file SMS_TRANSPORT=file
 * because a code must never be readable through any endpoint. The suite
 * refuses to run without them rather than reporting green on a half-test.
 * The SMS half (feat/sms-transport, 2026-09-29) uses a second throwaway
 * teacher, TCH-REC2, with a fictional number; no real text is ever sent.
 *
 * Idempotent: every row it creates is deleted in a finally block.
 *
 * WHAT IT MUST NEVER TOUCH: Nino's five grade rows (ids 1-5) and Jea's
 * pending parent account (user 4). It uses its own throwaway teacher.
 *
 * Usage: start the API with MAIL_TRANSPORT=file SMS_TRANSPORT=file (see the
 * prerequisite above), then: npm run test:recovery
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const MAIL_DIR = path.join(__dirname, '..', 'tmp', 'mail');
// feat/sms-transport (2026-09-29): the SMS half needs the server started with
// SMS_TRANSPORT=file too, for the same reason — no endpoint returns a code.
const SMS_DIR = path.join(__dirname, '..', 'tmp', 'sms');

// A teacher this run creates skips the first-sign-in password change
// (scripts/policyFixture.js, feat/privacy); test:auth proves that change.
const { clearForcedChange } = require('./policyFixture');

// Staff sign-ins accept the privacy notice and terms first (feat/staff-
// acceptance); this run's rows go in the finally (scripts/policyFixture.js).
const policy = require('./policyFixture').createPolicyFixture();

let passed = 0;
let failed = 0;
class FixtureFailure extends Error {}

function assert(c, label, detail = '') {
  if (c) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function requireFixture(c, label, detail = '') {
  assert(c, label, detail);
  if (!c) throw new FixtureFailure(`${label}${detail ? ` — ${detail}` : ''}`);
}
const why = (r) => `got ${r.status}${r.data?.message ? `: ${r.data.message}` : ''}`;

async function request(method, p, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data, text };
}
const login = (id, pw) => request('POST', '/api/auth/login', { body: { login_id: id, password: pw } });

// PostgreSQL since Phase 3 (commit F): the PG_* keys, the API's own role,
// loopback only (test-helpers/db.js). Its clock below is portal.now_s(), the
// whole-second statement time MySQL's NOW() was, so the run's start mark and
// the rows a request writes in that same second compare as they did (`>=`).
const { withDb } = require('./test-helpers/db');

// Reads the code the file transport wrote. This is the ONLY way the suite can
// see a code, which is the point: no endpoint returns one.
function mailFilesBefore() {
  if (!fs.existsSync(MAIL_DIR)) return new Set();
  return new Set(fs.readdirSync(MAIL_DIR));
}
// feat/password-alert (2026-10-21): the drop also holds the PASSWORD ALERTS —
// the "was this you?" notes written after every password change, marked
// `kind: 'password_alert'` by the file transports. They carry no code, so the
// two code readers skip them (an alert landing after a code would otherwise
// read as "no code"), and alertsSince() reads them on their own.
const readJson = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const isAlert = (dir) => (f) => readJson(dir, f).kind === 'password_alert';
function freshIn(dir, before) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !before.has(f)).sort();
}
function newestCodeSince(before) {
  const fresh = freshIn(MAIL_DIR, before).filter((f) => !isAlert(MAIL_DIR)(f));
  if (!fresh.length) return null;
  const body = readJson(MAIL_DIR, fresh[fresh.length - 1]);
  const m = body.text.match(/\b(\d{6})\b/);
  return m ? { code: m[1], to: body.to, text: body.text, files: fresh } : null;
}
function smsFilesBefore() {
  if (!fs.existsSync(SMS_DIR)) return new Set();
  return new Set(fs.readdirSync(SMS_DIR));
}
function newestSmsSince(before) {
  const fresh = freshIn(SMS_DIR, before).filter((f) => !isAlert(SMS_DIR)(f));
  if (!fresh.length) return null;
  const body = readJson(SMS_DIR, fresh[fresh.length - 1]);
  const m = body.text.match(/\b(\d{6})\b/);
  return m ? { code: m[1], to: body.to, text: body.text, count: fresh.length } : null;
}
// Every password alert written to `dir` since `before`, oldest first:
// { to, subject (mail only), text }.
function alertsSince(dir, before) {
  return freshIn(dir, before)
    .map((f) => readJson(dir, f))
    .filter((body) => body.kind === 'password_alert')
    .map((body) => ({ to: body.to, subject: body.subject, text: body.text }));
}
// The alert is sent AFTER the reply (routes/auth.js, routes/users.js), so a
// reader polls for it instead of trusting the response's timing.
async function waitFor(check, ms = 3000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= until) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
}
// What a password alert must look like, whichever channel: no six-digit run
// (a code's shape — the reader above would take one for a code), no twelve
// digits (an LRN), no "http" (a link is what a phishing message would copy).
function alertShapeOk(text) {
  return typeof text === 'string' && !/\d{6}/.test(text) && !/\d{12}/.test(text) && !/https?:/i.test(text);
}
const settle = () => new Promise((r) => setTimeout(r, 400));

// THE RESEND COOLDOWN (feat/first-signin, 2026-10-18): a new code of the same
// purpose for the same account only 60 seconds after the last. The suite
// asserts it where it is the subject, and otherwise moves this account's own
// rows back 61 seconds instead of waiting — still inside the hour, so the
// hourly limit below still counts them.
// One purpose at a time: each purpose has its own cooldown.
async function skipCooldown(userId, purpose) {
  await withDb((c) =>
    c.query("UPDATE auth_codes SET created_at = created_at - interval '61 seconds' WHERE user_id = ? AND purpose = ?", [userId, purpose])
  );
}

async function main() {
  console.log(`\nAccount recovery tests against ${BASE}\n`);

  const created = { users: [], loginIds: [] };
  // WATERMARK, captured at the start, not a constant (pre-Stage-5 #3b): the
  // cleanup used to assert users === 7 and students === 3 as literals, so a
  // seed change broke the suite without a defect. Printed, so a dirty start
  // is visible rather than silently accepted.
  const [[startCounts]] = await withDb((c) =>
    c.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM students) s')
  );
  console.log(`  i watermark at start: users ${startCounts.u}, students ${startCounts.s}`);
  // feat/password-alert (2026-10-21): the auth_codes boundary and the clock.
  // The cleanup asserts that no row ABOVE this id remains — never that the
  // table is empty, because rows other work left (the first-sign-in check's
  // kept codes) are not this run's to count.
  const [[startMarks]] = await withDb((c) =>
    c.query('SELECT COALESCE(MAX(id), 0) AS ac_max, portal.now_s() AS started_at FROM auth_codes')
  );
  console.log(`  i auth_codes at start: ${startMarks.ac_max ? `max id ${startMarks.ac_max}` : 'none'}`);
  // How many password-alert rows an account has LOGGED since the start — by
  // action and user id, never the description.
  const alertRows = async (userId, action) => {
    const [[row]] = await withDb((c) =>
      c.query('SELECT COUNT(*) AS n FROM activity_logs WHERE user_id = ? AND action = ? AND created_at >= ?', [
        userId,
        action,
        startMarks.started_at,
      ])
    );
    return Number(row.n);
  };
  let admin;
  let teacher;
  const TEACHER_ID = 'TCH-REC1';
  const TEACHER_PW = 'Recovery1';
  const TEACHER_EMAIL = 'recovery.fixture@example.test';

  try {
    // -----------------------------------------------------------------------
    console.log('Preconditions');
    // -----------------------------------------------------------------------
    const probe = mailFilesBefore();
    const a = await login('ADMIN001', 'Admin@2026');
    requireFixture(a.status === 200, 'admin logs in', why(a));
    admin = { token: a.data.token, ...a.data.user };
    await policy.accept(admin.token);

    // The suite is useless unless the API is running with the file transport.
    const warm = await request('POST', '/api/auth/forgot-password', { body: { login_id: 'ADMIN001' } });
    requireFixture(warm.status === 202, 'forgot-password answers 202', why(warm));

    // -----------------------------------------------------------------------
    console.log('\nFixture — a throwaway teacher with a verified email');
    // -----------------------------------------------------------------------
    // feat/account-create (2026-10-21): POST /users/teachers takes no email and
    // no contact number (400 "no longer collected"), so a fixture that needs
    // one is created bare, then given it through the admin's PUT /users/:id —
    // the office's own path. The returned shape is the POST's, with
    // `data.user` re-read after the PUT; a refused create comes back untouched.
    const createWithContact = async (path, { token, body }) => {
      const { email, contact_number, ...rest } = body;
      const res = await request('POST', path, { token, body: rest });
      if (res.status !== 201 || (email === undefined && contact_number === undefined)) return res;
      const put = await request('PUT', `/api/users/${res.data.user.id}`, {
        token: admin.token,
        body: { email, contact_number },
      });
      if (put.status === 200 && put.data?.user) res.data.user = put.data.user;
      return res;
    };

    const mk = await createWithContact('/api/users/teachers', {
      token: admin.token,
      body: { login_id: TEACHER_ID, password: TEACHER_PW, name: 'Recovery Fixture', email: TEACHER_EMAIL },
    });
    requireFixture(mk.status === 201, 'admin creates the throwaway teacher', why(mk));
    created.users.push(mk.data.user.id);
    await clearForcedChange(mk.data.user.id);
    created.loginIds.push(TEACHER_ID);

    // A second throwaway with NO email and NO number, never signed in — the
    // uniform response's "unconfirmed" case (feat/first-signin): the admin was
    // that case until the policy fixture began confirming the admin's address
    // for the run.
    const NO_CONTACT_ID = `TCH-RNC${String(Date.now()).slice(-5)}`;
    const mkNc = await request('POST', '/api/users/teachers', {
      token: admin.token,
      body: { login_id: NO_CONTACT_ID, password: TEACHER_PW, name: 'Recovery No Contact' },
    });
    requireFixture(mkNc.status === 201, 'admin creates a teacher with no email and no number', why(mkNc));
    created.users.push(mkNc.data.user.id);
    created.loginIds.push(NO_CONTACT_ID);

    const t = await login(TEACHER_ID, TEACHER_PW);
    requireFixture(t.status === 200, 'the fixture teacher logs in', why(t));
    teacher = { token: t.data.token, ...t.data.user };
    // { contact: false }: this suite confirms the email itself, below; the
    // contact gate lets the verify endpoints through until it does.
    await policy.accept(teacher.token, { contact: false });

    // -----------------------------------------------------------------------
    console.log('\nEmail verification');
    // -----------------------------------------------------------------------
    const before1 = mailFilesBefore();
    const vreq = await request('POST', '/api/auth/verify-email/request', { token: teacher.token });
    requireFixture(vreq.status === 202, 'verification code requested', why(vreq));
    const mail1 = newestCodeSince(before1);
    requireFixture(mail1 != null, 'the file transport wrote the message', 'no new file in server/tmp/mail');
    assert(mail1.to === TEACHER_EMAIL, 'sent to the account email');
    assert(!/\d{12}/.test(mail1.text), 'the email contains no 12-digit LRN');
    assert(!mail1.text.includes(TEACHER_ID), 'the email contains no login id');

    const badConfirm = await request('POST', '/api/auth/verify-email/confirm', { token: teacher.token, body: { code: '000000' } });
    assert(badConfirm.status === 400, 'a wrong verification code is 400', why(badConfirm));

    const okConfirm = await request('POST', '/api/auth/verify-email/confirm', { token: teacher.token, body: { code: mail1.code } });
    requireFixture(okConfirm.status === 200, 'the right code confirms the email', why(okConfirm));
    const reuse = await request('POST', '/api/auth/verify-email/confirm', { token: teacher.token, body: { code: mail1.code } });
    assert(reuse.status === 400, 'the same code cannot be used twice');

    // -----------------------------------------------------------------------
    console.log('\nThe uniform response — the rule the public endpoint exists to keep');
    // -----------------------------------------------------------------------
    const known = await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    const unknown = await request('POST', '/api/auth/forgot-password', { body: { login_id: 'NO-SUCH-ID' } });
    const unverified = await request('POST', '/api/auth/forgot-password', { body: { login_id: 'ADMIN001' } });
    const pendingAcct = await request('POST', '/api/auth/forgot-password', { body: { login_id: '1234567' } });
    const noContact = await request('POST', '/api/auth/forgot-password', { body: { login_id: NO_CONTACT_ID } });
    assert(known.status === 202 && unknown.status === 202 && unverified.status === 202 && pendingAcct.status === 202 && noContact.status === 202,
      'known, unknown, the admin, pending and a no-contact account all answer 202');
    assert(known.text === unknown.text && known.text === unverified.text && known.text === pendingAcct.text && known.text === noContact.text,
      'all five bodies are byte-identical', JSON.stringify([known.text, unknown.text, unverified.text, pendingAcct.text, noContact.text]));
    assert(known.data?.message === 'If this account has a confirmed email or mobile number, we sent a code to it.',
      'the one sentence names both channels and no destination', JSON.stringify(known.data?.message));
    const missing = await request('POST', '/api/auth/forgot-password', { body: {} });
    assert(missing.status === 400, 'a missing login_id is 400 — it describes the REQUEST, not an account');

    // Timing: the miss path burns a bcrypt so it cannot be the fast one.
    const tA = Date.now(); await request('POST', '/api/auth/forgot-password', { body: { login_id: 'STILL-NO-SUCH-ID' } });
    const missMs = Date.now() - tA;
    assert(missMs > 30, `the unknown-id path is not instant (${missMs}ms) — the dummy bcrypt is doing its job`);

    // -----------------------------------------------------------------------
    console.log('\nA2 — only the newest code is valid');
    // -----------------------------------------------------------------------
    await skipCooldown(teacher.id, 'password_reset');
    const beforeA = mailFilesBefore();
    await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    const firstMail = newestCodeSince(beforeA);
    requireFixture(firstMail != null, 'first reset code sent');

    // THE RESEND COOLDOWN IS SILENT HERE (feat/first-signin): inside 60
    // seconds nothing is sent, no row is written, and the reply is the one
    // uniform 202 — a 429 would say this login id has a confirmed contact.
    const beforeCool = mailFilesBefore();
    const cooled = await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    assert(cooled.status === 202 && cooled.text === known.text,
      'a second request inside 60 seconds answers the same 202 and body');
    assert(newestCodeSince(beforeCool) === null, 'and sends nothing — the resend cooldown');
    await skipCooldown(teacher.id, 'password_reset');

    const beforeB = mailFilesBefore();
    await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    const secondMail = newestCodeSince(beforeB);
    requireFixture(secondMail != null, 'second reset code sent');
    assert(firstMail.code !== secondMail.code, 'the two codes differ');

    const stale = await request('POST', '/api/auth/reset-password', {
      body: { login_id: TEACHER_ID, code: firstMail.code, new_password: 'Stale123' },
    });
    assert(stale.status === 400, 'A2: the OLDER code is dead once a newer one is issued', why(stale));

    // -----------------------------------------------------------------------
    console.log('\nReset, and A1 — every older token dies');
    // -----------------------------------------------------------------------
    const meBefore = await request('GET', '/api/auth/me', { token: teacher.token });
    requireFixture(meBefore.status === 200, 'the old teacher token still works before the reset');

    const weak = await request('POST', '/api/auth/reset-password', {
      body: { login_id: TEACHER_ID, code: secondMail.code, new_password: 'short' },
    });
    assert(weak.status === 400 && /8 characters/.test(weak.data.message || ''),
      'the password rule is checked before the code is burned', why(weak));

    const NEW_PW = 'Recovered9';
    const done = await request('POST', '/api/auth/reset-password', {
      body: { login_id: TEACHER_ID, code: secondMail.code, new_password: NEW_PW },
    });
    requireFixture(done.status === 200, 'the reset succeeds', why(done));

    const meAfter = await request('GET', '/api/auth/me', { token: teacher.token });
    assert(meAfter.status === 401, 'A1: the pre-reset token is now 401', why(meAfter));
    assert(/changed/i.test(meAfter.data?.message || ''), 'and it says the password changed', JSON.stringify(meAfter.data));

    const oldPw = await login(TEACHER_ID, TEACHER_PW);
    assert(oldPw.status === 401, 'the old password no longer works');
    const newPw = await login(TEACHER_ID, NEW_PW);
    requireFixture(newPw.status === 200, 'the new password works', why(newPw));
    teacher = { token: newPw.data.token, ...newPw.data.user };

    // feat/password-alert (2026-10-21): the reset told the holder. It is the
    // first password change of this run, so the first alert in the drop since
    // the start; the code mails before it are not alerts.
    const resetAlerts = await waitFor(() => {
      const a = alertsSince(MAIL_DIR, probe);
      return a.length ? a : null;
    });
    assert(Array.isArray(resetAlerts) && resetAlerts.length === 1 && resetAlerts[0].to === TEACHER_EMAIL,
      'the reset sent ONE password alert, to the confirmed email', `got ${resetAlerts ? resetAlerts.length : 0}`);
    assert(resetAlerts?.[0]?.subject === "Parent's Portal — your password was changed" && /was changed just now/.test(resetAlerts[0].text),
      'the alert says the password was changed, in the approved words');
    assert(resetAlerts?.[0] && alertShapeOk(resetAlerts[0].text) && !resetAlerts[0].text.includes(TEACHER_ID) && !resetAlerts[0].text.includes(NEW_PW),
      'no code, no link, no LRN, no login id and no password in the alert');
    const resetLogged = await waitFor(async () => ((await alertRows(teacher.id, 'password_alert_sent')) >= 1 ? 1 : null));
    assert(resetLogged === 1, 'logged password_alert_sent on the holder (email)');

    const consumed = await request('POST', '/api/auth/reset-password', {
      body: { login_id: TEACHER_ID, code: secondMail.code, new_password: 'Another11' },
    });
    assert(consumed.status === 400, 'the used code cannot be replayed');

    // -----------------------------------------------------------------------
    console.log('\nRate limit — and it is asserted here because the test tripped it');
    // -----------------------------------------------------------------------
    // Three reset requests have now been made for this account inside the
    // hour (two for A2, one before the attempt test). The fourth must be
    // SILENTLY limited: same 202, same body, no mail. The first version of
    // this suite hit that by accident and reported a fixture failure; the
    // limiter was right and the test was wrong, so the behaviour is asserted
    // rather than worked around.
    await skipCooldown(teacher.id, 'password_reset'); // so the hourly limit, not the cooldown, is what refuses
    const beforeLimit = mailFilesBefore();
    const fourth = await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    assert(fourth.status === 202 && fourth.text === known.text,
      'the 4th request in an hour answers identically to a sent one');
    assert(newestCodeSince(beforeLimit) === null,
      'but sends nothing — the per-account limit is 3 per hour');

    // -----------------------------------------------------------------------
    console.log('\nAttempt limit');
    // -----------------------------------------------------------------------
    // Reopen the window by backdating this account's rows. Direct SQL, scoped
    // to the throwaway teacher — the same approach test-sections uses to reset
    // its own fixtures.
    await withDb((c) =>
      c.query("UPDATE auth_codes SET created_at = (portal.now_s() - interval '2 hours') WHERE user_id = ?", [teacher.id])
    );
    const beforeC = mailFilesBefore();
    await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    const limMail = newestCodeSince(beforeC);
    requireFixture(limMail != null, 'a fresh code for the attempt test');
    for (let i = 0; i < 5; i++) {
      await request('POST', '/api/auth/reset-password', { body: { login_id: TEACHER_ID, code: '111111', new_password: 'Wrong123' } });
    }
    const afterFive = await request('POST', '/api/auth/reset-password', {
      body: { login_id: TEACHER_ID, code: limMail.code, new_password: 'Wrong123' },
    });
    assert(afterFive.status === 400, 'the RIGHT code is dead after five wrong tries', why(afterFive));
    assert(!/attempt|tries|remaining/i.test(afterFive.data?.message || ''),
      'and the message never counts attempts', JSON.stringify(afterFive.data?.message));

    const rateRows = await withDb((c) =>
      c.query('SELECT COUNT(*) AS n FROM auth_codes WHERE user_id = ? AND purpose = ?', [teacher.id, 'password_reset'])
    );
    assert(Number(rateRows[0][0].n) >= 3, 'the per-account hourly limit has data to work from');
    const limited = await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    assert(limited.status === 202 && limited.text === known.text,
      'a rate-limited request is INDISTINGUISHABLE from a sent one');

    // -----------------------------------------------------------------------
    console.log('\nCodes are never exposed');
    // -----------------------------------------------------------------------
    const stored = await withDb((c) => c.query('SELECT code_hash FROM auth_codes ORDER BY id DESC LIMIT 1'));
    assert(/^\$2[aby]\$/.test(stored[0][0].code_hash), 'codes are stored bcrypt-hashed, not in plain text');
    assert(!JSON.stringify(known.data).match(/\d{6}/), 'no endpoint response carries a six-digit code');

    // -----------------------------------------------------------------------
    console.log('\nThe test transport cannot be switched on by a request');
    // -----------------------------------------------------------------------
    const mailerSrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'mailer.js'), 'utf8');
    assert(!/\breq\b/.test(mailerSrc), 'utils/mailer.js never reads a request object');
    assert(/const FILE_TRANSPORT = process\.env\.MAIL_TRANSPORT === 'file';/.test(mailerSrc),
      'the transport is chosen once, at module load, from a const');
    const routeFiles = fs.readdirSync(path.join(__dirname, '..', 'routes'));
    const writesEnv = routeFiles.filter((f) =>
      /process\.env\.[A-Z_]+\s*=/.test(fs.readFileSync(path.join(__dirname, '..', 'routes', f), 'utf8'))
    );
    assert(writesEnv.length === 0, 'no route file assigns to process.env', writesEnv.join(','));

    const sneakBefore = mailFilesBefore();
    const sneak = await request('POST', '/api/auth/forgot-password', {
      body: { login_id: 'NO-SUCH-ID', MAIL_TRANSPORT: 'file' },
      headers: { 'X-Mail-Transport': 'file', MAIL_TRANSPORT: 'file' },
    });
    await new Promise((r) => setTimeout(r, 300));
    assert(sneak.status === 202, 'the smuggled flag changes no status');
    assert(newestCodeSince(sneakBefore) === null, 'and writes no mail file for an account that does not exist');

    // -----------------------------------------------------------------------
    console.log('\nAdmin temporary password, and the forced change');
    // -----------------------------------------------------------------------
    const self = await request('POST', `/api/users/${admin.id}/temp-password`, { token: admin.token });
    assert(self.status === 400, 'an admin cannot set a temporary password on themselves', why(self));
    const badId = await request('POST', '/api/users/abc/temp-password', { token: admin.token });
    assert(badId.status === 400, 'a non-numeric id is 400');
    const asTeacher = await request('POST', `/api/users/${teacher.id}/temp-password`, { token: teacher.token });
    assert(asTeacher.status === 403, 'a teacher cannot set a temporary password');
    const tempAlertMark = mailFilesBefore();

    const temp = await request('POST', `/api/users/${teacher.id}/temp-password`, { token: admin.token });
    requireFixture(temp.status === 200 && temp.data.temporary_password, 'admin sets a temporary password', why(temp));
    const tempPw = temp.data.temporary_password;
    assert(tempPw.length >= 8 && /\d/.test(tempPw), 'it satisfies the shared password rule');

    // feat/password-alert (the owner's answer Q2): the HOLDER is told that the
    // office set a temporary password — on the confirmed email, never carrying
    // the password. The admin's own admin_temp_password row stays on the admin.
    const tempAlerts = await waitFor(() => {
      const a = alertsSince(MAIL_DIR, tempAlertMark);
      return a.length ? a : null;
    });
    assert(Array.isArray(tempAlerts) && tempAlerts.length === 1 && tempAlerts[0].to === TEACHER_EMAIL &&
        tempAlerts[0].subject === "Parent's Portal — the school office reset your password" && /temporary password/.test(tempAlerts[0].text),
      'the temporary password sent the "school office" alert to the holder', `got ${tempAlerts ? tempAlerts.length : 0}`);
    assert(tempAlerts?.[0] && alertShapeOk(tempAlerts[0].text) && !tempAlerts[0].text.includes(tempPw),
      'the alert never carries the temporary password, a code or a link');
    assert((await waitFor(async () => ((await alertRows(teacher.id, 'password_alert_sent')) >= 2 ? 2 : null))) === 2,
      'logged password_alert_sent on the holder again (the second of this run)');
    assert((await alertRows(admin.id, 'password_alert_sent')) === 0, 'and nothing of the kind on the admin who set it');

    // Nothing confirmed: no message, one password_alert_not_sent row (the
    // owner's answer Q8) — the no-contact teacher, through the same endpoint.
    const ncMail = mailFilesBefore();
    const ncSms = smsFilesBefore();
    const ncTemp = await request('POST', `/api/users/${mkNc.data.user.id}/temp-password`, { token: admin.token });
    const ncLogged = await waitFor(async () => ((await alertRows(mkNc.data.user.id, 'password_alert_not_sent')) >= 1 ? 1 : null));
    assert(ncTemp.status === 200 && ncLogged === 1,
      'an account with nothing confirmed gets no alert and one password_alert_not_sent row', why(ncTemp));
    assert(alertsSince(MAIL_DIR, ncMail).length === 0 && alertsSince(SMS_DIR, ncSms).length === 0,
      'and no mail and no text was written for it');
    const firstPwMark = mailFilesBefore();

    const afterTemp = await request('GET', '/api/auth/me', { token: teacher.token });
    assert(afterTemp.status === 401, 'A1: the temporary password killed the existing session');

    const tempLogin = await login(TEACHER_ID, tempPw);
    requireFixture(tempLogin.status === 200, 'the account logs in with the temporary password', why(tempLogin));
    const forced = { token: tempLogin.data.token };

    // D2 (feat/first-signin, 2026-10-18): this account's email was confirmed
    // BEFORE this sign-in, so the forced change confirms it AGAIN first — the
    // temporary password, then a code — and only then sets the password.
    const blocked = await request('GET', '/api/students?limit=1', { token: forced.token });
    assert(blocked.status === 403 && blocked.data?.code === 'CONTACT_VERIFICATION_REQUIRED',
      'a contact confirmed before this sign-in: every other route is 403 CONTACT_VERIFICATION_REQUIRED', why(blocked));
    const meAllowed = await request('GET', '/api/auth/me', { token: forced.token });
    assert(meAllowed.status === 200, 'GET /auth/me is still allowed');
    assert(meAllowed.data.user.must_change_password === 1, 'and it reports must_change_password so the client can route on it');
    assert(meAllowed.data.user.contact_pending === true && meAllowed.data.user.contact_step === 'reconfirm',
      'and contact_step "reconfirm" — the account has a confirmed email it has not used this session');
    const pwTooSoon = await request('PUT', '/api/auth/first-password', { token: forced.token, body: { new_password: `${tempPw}x` } });
    assert(pwTooSoon.status === 403 && pwTooSoon.data?.code === 'CONTACT_VERIFICATION_REQUIRED',
      'PUT /auth/first-password waits for the reconfirm', why(pwTooSoon));

    const mbRe = mailFilesBefore();
    const reReq = await request('POST', '/api/auth/verify-email/request', { token: forced.token });
    const reMail = newestCodeSince(mbRe);
    requireFixture(reReq.status === 202 && reMail != null && reMail.to === TEACHER_EMAIL,
      'the reconfirm request sends a code although the address is already confirmed', why(reReq));
    const reAgain = await request('POST', '/api/auth/verify-email/request', { token: forced.token });
    assert(reAgain.status === 429 && Number(reAgain.data?.retry_after) > 0 && Number(reAgain.data?.retry_after) <= 60 &&
        /^Wait \d+ seconds?, then ask for a new code\.$/.test(reAgain.data?.message || ''),
      'the resend cooldown, honest here: 429 "Wait N seconds, then ask for a new code." with retry_after', why(reAgain));
    assert(newestCodeSince(mbRe)?.files?.length === 1, 'and the cooled-down request sent nothing');
    const reOk = await request('POST', '/api/auth/verify-email/confirm', { token: forced.token, body: { code: reMail.code } });
    requireFixture(reOk.status === 200, 'the code confirms the address again', why(reOk));
    const pwGate = await request('GET', '/api/students?limit=1', { token: forced.token });
    assert(pwGate.status === 403 && pwGate.data?.code === 'MUST_CHANGE_PASSWORD',
      'confirmed in this session: every other route is now 403 MUST_CHANGE_PASSWORD', why(pwGate));

    const FINAL_PW = 'Finally12';
    const viaChange = await request('PUT', '/api/auth/change-password', {
      token: forced.token,
      body: { current_password: tempPw, new_password: FINAL_PW },
    });
    assert(viaChange.status === 403 && viaChange.data?.code === 'MUST_CHANGE_PASSWORD',
      'PUT /auth/change-password is refused during a forced change (first-password replaces it)', why(viaChange));
    const changed = await request('PUT', '/api/auth/first-password', {
      token: forced.token,
      body: { new_password: FINAL_PW },
    });
    requireFixture(changed.status === 200, 'PUT /auth/first-password sets it, with no temporary password typed', why(changed));
    assert(Boolean(changed.data.token), 'it returns a REPLACEMENT token, so the caller is not logged out');

    // feat/password-alert (the owner's answer Q1): the first-password path
    // alerts too — one rule, no branch. The reconfirm code mail between the
    // mark and here is not an alert and is skipped.
    const firstAlerts = await waitFor(() => {
      const a = alertsSince(MAIL_DIR, firstPwMark);
      return a.length ? a : null;
    });
    assert(Array.isArray(firstAlerts) && firstAlerts.length === 1 && firstAlerts[0].to === TEACHER_EMAIL &&
        firstAlerts[0].subject === "Parent's Portal — your password was changed",
      'PUT /auth/first-password sent the "was changed" alert to the confirmed email', `got ${firstAlerts ? firstAlerts.length : 0}`);
    assert(firstAlerts?.[0] && alertShapeOk(firstAlerts[0].text) && !firstAlerts[0].text.includes(FINAL_PW) && !firstAlerts[0].text.includes(tempPw),
      'and it carries neither password, no code and no link');

    const withNew = await request('GET', '/api/students?limit=1', { token: changed.data.token });
    assert(withNew.status !== 403, 'the replacement token is no longer blocked', why(withNew));
    const withOld = await request('GET', '/api/auth/me', { token: forced.token });
    assert(withOld.status === 401, 'A1: the pre-change token is dead', why(withOld));

    // -----------------------------------------------------------------------
    console.log('\nSMS — a confirmed mobile number (feat/sms-transport)');
    // -----------------------------------------------------------------------
    // Reopen the per-IP window: every row this run has written so far is
    // backdated, so the SMS half is not silently rate-limited by the email
    // half above (10 per IP per hour).
    await withDb((c) => c.query("UPDATE auth_codes SET created_at = (portal.now_s() - interval '2 hours') WHERE user_id = ANY(?::int[])", [created.users]));

    const SMS_ID = 'TCH-REC2';
    const SMS_PW = 'Recovery2';
    const mk2 = await createWithContact('/api/users/teachers', {
      token: admin.token,
      body: { login_id: SMS_ID, password: SMS_PW, name: 'Recovery SMS Fixture', contact_number: '+63 917 000 0123' },
    });
    requireFixture(mk2.status === 201, 'admin creates the SMS fixture teacher (no email)', why(mk2));
    created.users.push(mk2.data.user.id);
    await clearForcedChange(mk2.data.user.id);
    created.loginIds.push(SMS_ID);
    assert(mk2.data.user.contact_number === '09170000123', 'a number typed as +63 is stored as 09…', mk2.data.user.contact_number);
    assert(mk2.data.user.contact_verified_at == null, 'a new number is not confirmed');
    const s1 = await login(SMS_ID, SMS_PW);
    requireFixture(s1.status === 200, 'the SMS fixture logs in', why(s1));
    let smsUser = { token: s1.data.token, id: s1.data.user.id };
    await policy.accept(smsUser.token, { contact: false });

    const beforeUnconf = smsFilesBefore();
    const unconf = await request('POST', '/api/auth/forgot-password', { body: { login_id: SMS_ID } });
    await settle();
    assert(unconf.status === 202 && unconf.text === known.text, 'forgot with an UNCONFIRMED number: the same 202 and body');
    assert(newestSmsSince(beforeUnconf) === null, 'and no text goes to an unconfirmed number');

    const beforeReq = smsFilesBefore();
    const creq = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    requireFixture(creq.status === 202, 'confirmation code requested', why(creq));
    assert(creq.data.message === 'We sent a code to your mobile number.', 'the request says where, to its own caller', creq.data.message);
    const text1 = newestSmsSince(beforeReq);
    requireFixture(text1 != null, 'the file transport wrote the text — the server runs with SMS_TRANSPORT=file', 'no new file in server/tmp/sms');
    assert(text1.to === '+639170000123', 'sent to the E.164 form of the stored number', text1.to);
    assert(text1.text.length <= 160 && /^[\x20-\x7E]+$/.test(text1.text), 'one GSM-7 part');
    assert(!/\d{12}/.test(text1.text) && !text1.text.includes(SMS_ID), 'no LRN and no login id in the text');

    const cBad = await request('POST', '/api/auth/verify-contact/confirm', { token: smsUser.token, body: { code: '000000' } });
    assert(cBad.status === 400 && cBad.data.message === 'That code is not valid. Request a new one.', 'a wrong code is 400 with the one message', why(cBad));

    // The same number re-typed in another form is NOT a change: the pending
    // code survives it and still confirms.
    const retype = await request('PUT', '/api/auth/contact', { token: smsUser.token, body: { contact_number: '639170000123' } });
    assert(retype.status === 200 && retype.data.user.contact_number === '09170000123', 'the 639… form is stored as the same 09… value', why(retype));
    const cOk = await request('POST', '/api/auth/verify-contact/confirm', { token: smsUser.token, body: { code: text1.code } });
    requireFixture(cOk.status === 200, 'the pending code still confirms after a same-number re-type', why(cOk));
    assert(cOk.data.message === 'Mobile number confirmed. You can now get reset codes by text message.', 'the confirmed message', cOk.data.message);
    const me1 = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(Boolean(me1.data?.user?.contact_verified_at), '/auth/me reports contact_verified_at');
    const again = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    assert(again.status === 200 && again.data.message === 'This number is already confirmed.', 'a confirmed number is not re-texted', why(again));
    const retype2 = await request('PUT', '/api/auth/contact', { token: smsUser.token, body: { contact_number: '0917-000-0123' } });
    const me2 = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(retype2.status === 200 && Boolean(me2.data?.user?.contact_verified_at), 're-saving the same number keeps the confirmation');

    // Forgot, text only (this account has no email).
    const beforeF1 = smsFilesBefore();
    const mailBeforeF1 = mailFilesBefore();
    const f1 = await request('POST', '/api/auth/forgot-password', { body: { login_id: SMS_ID } });
    await settle();
    assert(f1.status === 202 && f1.text === known.text, 'forgot with a confirmed number: the same 202 and body');
    const resetText = newestSmsSince(beforeF1);
    requireFixture(resetText != null, 'the reset code went out by text');
    assert(resetText.to === '+639170000123' && /password reset code/.test(resetText.text), 'the reset text, to the confirmed number');
    assert(newestCodeSince(mailBeforeF1) === null, 'and no mail — the account has no email');

    // Both channels: give the account a confirmed email too.
    const addEmail = await request('PUT', `/api/users/${smsUser.id}`, { token: admin.token, body: { email: 'recovery.sms@example.test' } });
    requireFixture(addEmail.status === 200, 'admin adds an email to the SMS fixture', why(addEmail));
    const meKeep = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(Boolean(meKeep.data?.user?.contact_verified_at), 'an admin EMAIL change leaves the number confirmed');
    const mb = mailFilesBefore();
    const ve = await request('POST', '/api/auth/verify-email/request', { token: smsUser.token });
    const vmail = newestCodeSince(mb);
    requireFixture(ve.status === 202 && vmail != null, 'email code for the SMS fixture', why(ve));
    const vc = await request('POST', '/api/auth/verify-email/confirm', { token: smsUser.token, body: { code: vmail.code } });
    requireFixture(vc.status === 200, 'its email is confirmed', why(vc));

    await skipCooldown(smsUser.id, 'password_reset');
    const bothSms = smsFilesBefore();
    const bothMail = mailFilesBefore();
    const f2 = await request('POST', '/api/auth/forgot-password', { body: { login_id: SMS_ID } });
    await settle();
    const bText = newestSmsSince(bothSms);
    const bMail = newestCodeSince(bothMail);
    assert(f2.status === 202 && f2.text === known.text, 'forgot with both confirmed: the same 202 and body');
    requireFixture(bText != null && bMail != null, 'both a text and a mail went out');
    assert(bText.code === bMail.code, 'Q2: the SAME code by both channels');
    const [[pr]] = await withDb((c) => c.query("SELECT COUNT(*) n FROM auth_codes WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL", [smsUser.id]));
    assert(Number(pr.n) === 1, 'one live code row, whatever the number of channels', `got ${pr.n}`);
    const NEW_SMS_PW = 'ByText123';
    const rs = await request('POST', '/api/auth/reset-password', { body: { login_id: SMS_ID, code: bText.code, new_password: NEW_SMS_PW } });
    requireFixture(rs.status === 200, 'the texted code resets the password', why(rs));
    const s2 = await login(SMS_ID, NEW_SMS_PW);
    requireFixture(s2.status === 200, 'and the new password signs in', why(s2));
    smsUser = { token: s2.data.token, id: s2.data.user.id };

    // feat/password-alert (2026-10-21): the reset by the texted code told BOTH
    // confirmed channels — the text in the owner's words, and the mail.
    const rsText = await waitFor(() => {
      const a = alertsSince(SMS_DIR, bothSms);
      return a.length ? a : null;
    });
    const rsMail = await waitFor(() => {
      const a = alertsSince(MAIL_DIR, bothMail);
      return a.length ? a : null;
    });
    assert(Array.isArray(rsText) && rsText.length === 1 && rsText[0].to === bText.to &&
        rsText[0].text === "Parent's Portal: your password was changed just now. If this was not you, use Forgot password on the sign-in page or tell the school office.",
      'the reset sent the password alert by text, to the confirmed number, word for word', `got ${rsText ? rsText.length : 0}`);
    assert(rsText?.[0] && rsText[0].text.length <= 160 && /^[\x20-\x7E]+$/.test(rsText[0].text) && alertShapeOk(rsText[0].text),
      'one GSM-7 part, no code, no link, no LRN');
    assert(Array.isArray(rsMail) && rsMail.length === 1 && rsMail[0].to === bMail.to &&
        rsMail[0].subject === "Parent's Portal — your password was changed",
      'and by mail, to the confirmed email', `got ${rsMail ? rsMail.length : 0}`);
    assert((await waitFor(async () => ((await alertRows(smsUser.id, 'password_alert_sent')) >= 1 ? 1 : null))) === 1,
      'logged password_alert_sent on the SMS fixture');

    // Settings → Change password, the fourth path: its own alert by both
    // channels, and the replacement token keeps this caller signed in.
    const cpMail = mailFilesBefore();
    const cpSms = smsFilesBefore();
    const CHANGED_SMS_PW = `${NEW_SMS_PW}x1`;
    const cp = await request('PUT', '/api/auth/change-password', {
      token: smsUser.token,
      body: { current_password: NEW_SMS_PW, new_password: CHANGED_SMS_PW },
    });
    requireFixture(cp.status === 200 && Boolean(cp.data?.token), "PUT /auth/change-password changes the SMS fixture's password", why(cp));
    smsUser = { token: cp.data.token, id: smsUser.id };
    const cpText = await waitFor(() => {
      const a = alertsSince(SMS_DIR, cpSms);
      return a.length ? a : null;
    });
    const cpMailAlerts = await waitFor(() => {
      const a = alertsSince(MAIL_DIR, cpMail);
      return a.length ? a : null;
    });
    assert(Array.isArray(cpText) && cpText.length === 1 && Array.isArray(cpMailAlerts) && cpMailAlerts.length === 1 &&
        cpText[0].to === bText.to && cpMailAlerts[0].to === bMail.to,
      'Settings → Change password sent the alert by text and by mail, one each',
      `text ${cpText ? cpText.length : 0}, mail ${cpMailAlerts ? cpMailAlerts.length : 0}`);
    assert(cpText?.[0] && cpMailAlerts?.[0] && !cpText[0].text.includes(CHANGED_SMS_PW) && !cpMailAlerts[0].text.includes(CHANGED_SMS_PW) &&
        alertShapeOk(cpMailAlerts[0].text),
      'neither alert carries the new password, a code or a link');

    // A number change unconfirms it and burns the code sent to the old one.
    const ch1 = await request('PUT', '/api/auth/contact', { token: smsUser.token, body: { contact_number: '09170000124' } });
    const me3 = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(ch1.status === 200 && !me3.data?.user?.contact_verified_at, 'a NEW number clears the confirmation');
    const coolText = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    assert(coolText.status === 429 && Number(coolText.data?.retry_after) > 0,
      'a text code within 60 seconds of the last is 429 with retry_after (the resend cooldown)', why(coolText));
    await skipCooldown(smsUser.id, 'contact_verification');
    const beforeOld = smsFilesBefore();
    const oreq = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    const oldText = newestSmsSince(beforeOld);
    requireFixture(oreq.status === 202 && oldText != null && oldText.to === '+639170000124', 'a code goes to the new number', why(oreq));
    const ch2 = await request('PUT', '/api/auth/contact', { token: smsUser.token, body: { contact_number: '09170000125' } });
    assert(ch2.status === 200, 'the number changes again before confirming');
    const stale2 = await request('POST', '/api/auth/verify-contact/confirm', { token: smsUser.token, body: { code: oldText.code } });
    assert(stale2.status === 400, 'the code sent to the PREVIOUS number cannot confirm the new one', why(stale2));
    const me4 = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(!me4.data?.user?.contact_verified_at, 'and nothing was confirmed');

    // Admin number change clears a confirmation too.
    await skipCooldown(smsUser.id, 'contact_verification');
    const beforeC3 = smsFilesBefore();
    const r3 = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    const t3 = newestSmsSince(beforeC3);
    requireFixture(r3.status === 202 && t3 != null, 'a code for the current number', why(r3));
    const c3 = await request('POST', '/api/auth/verify-contact/confirm', { token: smsUser.token, body: { code: t3.code } });
    requireFixture(c3.status === 200, 'confirmed', why(c3));
    const adminCh = await request('PUT', `/api/users/${smsUser.id}`, { token: admin.token, body: { contact_number: '0917 000 0126' } });
    const me5 = await request('GET', '/api/auth/me', { token: smsUser.token });
    assert(adminCh.status === 200 && !me5.data?.user?.contact_verified_at, 'an ADMIN number change clears the confirmation');

    // The hourly limit, shared with email's rules: three contact codes have
    // been issued for this account in the hour.
    const beforeLim = smsFilesBefore();
    const lim = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    // Decision D3 (feat/first-signin): the limit stays, and its sentence names
    // the other channel.
    assert(lim.status === 429 && lim.data.message === 'Too many codes requested. Try again in an hour, or use your Gmail instead.',
      'the 4th confirmation request in an hour is 429, naming the other channel', why(lim));
    assert(newestSmsSince(beforeLim) === null, 'and sends nothing');

    // No number at all.
    const clr = await request('PUT', `/api/users/${smsUser.id}`, { token: admin.token, body: { contact_number: '' } });
    const none = await request('POST', '/api/auth/verify-contact/request', { token: smsUser.token });
    assert(clr.status === 200 && none.status === 400 && none.data.message === 'There is no mobile number on this account. Add one first.',
      'no number: 400 with the add-one-first message', why(none));

    // The switch cannot be turned on by a request.
    const smsSrc = fs.readFileSync(path.join(__dirname, '..', 'utils', 'smsTransport.js'), 'utf8');
    assert(!/\breq\b/.test(smsSrc) && /const MODE = process\.env\.SMS_TRANSPORT === 'gateway'/.test(smsSrc),
      'utils/smsTransport.js reads no request and picks its mode once, from a const');
    const sneakSms = smsFilesBefore();
    await request('POST', '/api/auth/forgot-password', {
      body: { login_id: 'NO-SUCH-ID', SMS_TRANSPORT: 'file' },
      headers: { 'X-Sms-Transport': 'file' },
    });
    await settle();
    assert(newestSmsSince(sneakSms) === null, 'a smuggled SMS flag writes no text for an account that does not exist');
  } catch (error) {
    if (error instanceof FixtureFailure) console.error(`\nFIXTURE FAILED — run stopped: ${error.message}`);
    else { console.error('\nUNEXPECTED ERROR:', error); failed += 1; }
  } finally {
    console.log('\nCleanup');
    try {
      await withDb(async (conn) => {
        for (const id of created.users) {
          await conn.query('DELETE FROM auth_codes WHERE user_id = ?', [id]);
          await conn.query('DELETE FROM users WHERE id = ?', [id]);
        }
        // Anything this run left on a seeded account.
        await conn.query("DELETE FROM auth_codes WHERE user_id IN (SELECT id FROM users WHERE login_id IN ('ADMIN001','1234567'))");
      });
      if (fs.existsSync(MAIL_DIR)) {
        for (const f of fs.readdirSync(MAIL_DIR)) fs.unlinkSync(path.join(MAIL_DIR, f));
      }
      if (fs.existsSync(SMS_DIR)) {
        for (const f of fs.readdirSync(SMS_DIR)) fs.unlinkSync(path.join(SMS_DIR, f));
      }

      const counts = await withDb((c) =>
        c.query(
          'SELECT (SELECT COUNT(*) FROM users) u,(SELECT COUNT(*) FROM students) s,(SELECT COUNT(*) FROM grades) g,(SELECT COUNT(*) FROM auth_codes) ac'
        )
      );
      const c0 = counts[0][0];
      assert(c0.u === startCounts.u, `users back to its start count (${startCounts.u}) — got ${c0.u}`);
      assert(c0.s === startCounts.s, `students back to its start count (${startCounts.s}) — got ${c0.s}`);
      assert(c0.g === 5, `grades back to 5 — Nino's rows untouched — got ${c0.g}`);
      // feat/password-alert (2026-10-21): RELATIVE TO THE RUN'S OWN START. Rows
      // that were there before it (the first-sign-in check's kept codes) are
      // not this run's to count; what must be gone is every row above the
      // start id — the house rule on shared tables.
      const [[acAbove]] = await withDb((c) =>
        c.query('SELECT COUNT(*) AS n FROM auth_codes WHERE id > ?', [startMarks.ac_max])
      );
      assert(
        Number(acAbove.n) === 0,
        `auth_codes: no row above the start id remains (${c0.ac} from before the run stay) — got ${acAbove.n}`
      );
      const jea = await withDb((c) => c.query("SELECT status FROM users WHERE login_id = '1234567'"));
      assert(jea[0][0].status === 'pending', "Jea's parent account is still pending");
      const mailLeft = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).length : 0;
      assert(mailLeft === 0, `no mail files left behind — got ${mailLeft}`);
      const smsLeft = fs.existsSync(SMS_DIR) ? fs.readdirSync(SMS_DIR).length : 0;
      assert(smsLeft === 0, `no text files left behind — got ${smsLeft}`);
    } catch (e) {
      console.error('CLEANUP ERROR:', e.message);
      failed += 1;
    }
    await policy.cleanup();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  }
}

main();
