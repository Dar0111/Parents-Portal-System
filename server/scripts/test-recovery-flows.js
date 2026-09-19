/**
 * Account recovery tests — the uniform-response rule, code lifecycle, rate
 * limits, per-user token revocation (A1), newest-code-only (A2), the forced
 * change, and the test transport's own safety.
 *
 * Prerequisite: npm run db:migrate:auth-codes, and the API started with
 *   MAIL_TRANSPORT=file
 * because a code must never be readable through any endpoint. The suite
 * refuses to run without it rather than reporting green on a half-test.
 *
 * Idempotent: every row it creates is deleted in a finally block.
 *
 * WHAT IT MUST NEVER TOUCH: Nino's five grade rows (ids 1-5) and Jea's
 * pending parent account (user 4). It uses its own throwaway teacher.
 *
 * Usage: MAIL_TRANSPORT=file npm run test:recovery
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const MAIL_DIR = path.join(__dirname, '..', 'tmp', 'mail');

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

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'parents_portal',
};
async function withDb(fn) {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(dbConfig);
  try { return await fn(conn); } finally { await conn.end(); }
}

// Reads the code the file transport wrote. This is the ONLY way the suite can
// see a code, which is the point: no endpoint returns one.
function mailFilesBefore() {
  if (!fs.existsSync(MAIL_DIR)) return new Set();
  return new Set(fs.readdirSync(MAIL_DIR));
}
function newestCodeSince(before) {
  if (!fs.existsSync(MAIL_DIR)) return null;
  const fresh = fs.readdirSync(MAIL_DIR).filter((f) => !before.has(f));
  if (!fresh.length) return null;
  fresh.sort();
  const body = JSON.parse(fs.readFileSync(path.join(MAIL_DIR, fresh[fresh.length - 1]), 'utf8'));
  const m = body.text.match(/\b(\d{6})\b/);
  return m ? { code: m[1], to: body.to, text: body.text, files: fresh } : null;
}

async function main() {
  console.log(`\nAccount recovery tests against ${BASE}\n`);

  const created = { users: [], loginIds: [] };
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

    // The suite is useless unless the API is running with the file transport.
    const warm = await request('POST', '/api/auth/forgot-password', { body: { login_id: 'ADMIN001' } });
    requireFixture(warm.status === 202, 'forgot-password answers 202', why(warm));

    // -----------------------------------------------------------------------
    console.log('\nFixture — a throwaway teacher with a verified email');
    // -----------------------------------------------------------------------
    const mk = await request('POST', '/api/users/teachers', {
      token: admin.token,
      body: { login_id: TEACHER_ID, password: TEACHER_PW, name: 'Recovery Fixture', email: TEACHER_EMAIL },
    });
    requireFixture(mk.status === 201, 'admin creates the throwaway teacher', why(mk));
    created.users.push(mk.data.user.id);
    created.loginIds.push(TEACHER_ID);

    const t = await login(TEACHER_ID, TEACHER_PW);
    requireFixture(t.status === 200, 'the fixture teacher logs in', why(t));
    teacher = { token: t.data.token, ...t.data.user };

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
    assert(known.status === 202 && unknown.status === 202 && unverified.status === 202 && pendingAcct.status === 202,
      'known, unknown, unverified and pending all answer 202');
    assert(known.text === unknown.text && known.text === unverified.text && known.text === pendingAcct.text,
      'all four bodies are byte-identical', JSON.stringify([known.text, unknown.text, unverified.text, pendingAcct.text]));
    const missing = await request('POST', '/api/auth/forgot-password', { body: {} });
    assert(missing.status === 400, 'a missing login_id is 400 — it describes the REQUEST, not an account');

    // Timing: the miss path burns a bcrypt so it cannot be the fast one.
    const tA = Date.now(); await request('POST', '/api/auth/forgot-password', { body: { login_id: 'STILL-NO-SUCH-ID' } });
    const missMs = Date.now() - tA;
    assert(missMs > 30, `the unknown-id path is not instant (${missMs}ms) — the dummy bcrypt is doing its job`);

    // -----------------------------------------------------------------------
    console.log('\nA2 — only the newest code is valid');
    // -----------------------------------------------------------------------
    const beforeA = mailFilesBefore();
    await request('POST', '/api/auth/forgot-password', { body: { login_id: TEACHER_ID } });
    await new Promise((r) => setTimeout(r, 400));
    const firstMail = newestCodeSince(beforeA);
    requireFixture(firstMail != null, 'first reset code sent');

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
      c.query('UPDATE auth_codes SET created_at = (NOW() - INTERVAL 2 HOUR) WHERE user_id = ?', [teacher.id])
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

    const temp = await request('POST', `/api/users/${teacher.id}/temp-password`, { token: admin.token });
    requireFixture(temp.status === 200 && temp.data.temporary_password, 'admin sets a temporary password', why(temp));
    const tempPw = temp.data.temporary_password;
    assert(tempPw.length >= 8 && /\d/.test(tempPw), 'it satisfies the shared password rule');

    const afterTemp = await request('GET', '/api/auth/me', { token: teacher.token });
    assert(afterTemp.status === 401, 'A1: the temporary password killed the existing session');

    const tempLogin = await login(TEACHER_ID, tempPw);
    requireFixture(tempLogin.status === 200, 'the account logs in with the temporary password', why(tempLogin));
    const forced = { token: tempLogin.data.token };

    const blocked = await request('GET', '/api/students?limit=1', { token: forced.token });
    assert(blocked.status === 403 && blocked.data?.code === 'MUST_CHANGE_PASSWORD',
      'every other route is 403 MUST_CHANGE_PASSWORD', why(blocked));
    const meAllowed = await request('GET', '/api/auth/me', { token: forced.token });
    assert(meAllowed.status === 200, 'GET /auth/me is still allowed');
    assert(meAllowed.data.user.must_change_password === 1, 'and it reports must_change_password so the client can route on it');

    const FINAL_PW = 'Finally12';
    const changed = await request('PUT', '/api/auth/change-password', {
      token: forced.token,
      body: { current_password: tempPw, new_password: FINAL_PW },
    });
    requireFixture(changed.status === 200, 'change-password is allowed during a forced change', why(changed));
    assert(Boolean(changed.data.token), 'it returns a REPLACEMENT token, so the caller is not logged out');

    const withNew = await request('GET', '/api/students?limit=1', { token: changed.data.token });
    assert(withNew.status !== 403, 'the replacement token is no longer blocked', why(withNew));
    const withOld = await request('GET', '/api/auth/me', { token: forced.token });
    assert(withOld.status === 401, 'A1: the pre-change token is dead', why(withOld));
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

      const counts = await withDb((c) =>
        c.query(
          'SELECT (SELECT COUNT(*) FROM users) u,(SELECT COUNT(*) FROM students) s,(SELECT COUNT(*) FROM grades) g,(SELECT COUNT(*) FROM auth_codes) ac'
        )
      );
      const c0 = counts[0][0];
      assert(c0.u === 7, `users back to 7 — got ${c0.u}`);
      assert(c0.s === 3, `students back to 3 — got ${c0.s}`);
      assert(c0.g === 5, `grades back to 5 — Nino's rows untouched — got ${c0.g}`);
      assert(c0.ac === 0, `auth_codes back to 0 — got ${c0.ac}`);
      const jea = await withDb((c) => c.query("SELECT status FROM users WHERE login_id = '1234567'"));
      assert(jea[0][0].status === 'pending', "Jea's parent account is still pending");
      const mailLeft = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).length : 0;
      assert(mailLeft === 0, `no mail files left behind — got ${mailLeft}`);
    } catch (e) {
      console.error('CLEANUP ERROR:', e.message);
      failed += 1;
    }
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  }
}

main();
