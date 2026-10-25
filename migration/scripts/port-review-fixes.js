#!/usr/bin/env node
// PHASE E's REGRESSION EVIDENCE (P3-C-R2) — two review findings, each asserted
// against the ORIGINAL API (5426b70 on the MySQL scratch, golden-master.js
// serve-mysql) AND the PORTED API (the local copy), so the expected answer is
// the original system's, not a guess:
//
//   auth-1  a typed login id holding a NUL (U+0000): sign-in is 401 with the
//           failure COUNTED (a login_attempts row for its key), forgot-password
//           the one 202 sentence, reset-password the one 400 — on PostgreSQL
//           all three were a 500 before the fix (22021 from the bind)
//   auth-2  an admin's email edit that changes ONLY the letter case keeps the
//           confirmation (MySQL compared under utf8mb4_unicode_ci); a real
//           change still clears it (the control)
//
// Fixtures: one throwaway teacher per side (created through the API, its
// confirmation stamped directly, deleted by id at the end and confirmed gone),
// the NUL key's login_attempts rows deleted by key; nothing else is written.
//   node scripts/port-review-fixes.js --a http://127.0.0.1:5030 --b http://127.0.0.1:5010 --source-db <name|latest>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scratch } = require('../lib/mysql');
const { client } = require('../lib/pg');
const { localConfig } = require('../lib/env');
const P = require('../lib/paths');
const { safeMessage } = require('../lib/safeMessage');
const { seededAccounts, resolveSourceDb, call, LOOPBACK } = require('./golden-master');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function main() {
  const A = arg('--a');
  const B = arg('--b');
  if (!LOOPBACK.test(A || '') || !LOOPBACK.test(B || '')) throw new Error('--a and --b must be loopback base URLs.');
  const sourceDb = await resolveSourceDb(arg('--source-db'));
  const { loginKey } = require('../../server/utils/loginThrottle');
  const my = await scratch(sourceDb);
  const pg = await client(localConfig());
  const results = [];
  let failures = 0;
  const check = (label, okA, okB, detail) => {
    const ok = okA && okB;
    if (!ok) failures += 1;
    results.push({ label, original: okA, ported: okB, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} — original ${okA ? 'yes' : 'NO'}, ported ${okB ? 'yes' : 'NO'}${detail ? ` (${detail})` : ''}`);
  };
  const created = { a: null, b: null };
  const acceptedIds = { a: [], b: [] };
  const nulId = `zz\u0000${crypto.randomBytes(4).toString('hex')}`;
  const key = loginKey(nulId);
  try {
    const admin = seededAccounts().admin;
    const tokens = {};
    for (const [side, base] of [['a', A], ['b', B]]) {
      const login = await call(base, 'POST', '/api/auth/login', { body: { login_id: admin.login, password: admin.password } });
      if (login.status !== 200 || !login.json || !login.json.token) throw new Error(`the admin's sign-in on ${side.toUpperCase()} answered ${login.status}`);
      tokens[side] = login.json.token;
      let me = await call(base, 'GET', '/api/auth/me', { token: tokens[side] });
      let u = (me.json && me.json.user) || {};
      if (u.policy_pending) {
        // The current documents (the ported side is on draft-2 since the sync
        // with main): accepted for the run, the rows deleted by id at the end.
        const maxBefore = side === 'a'
          ? Number((await my.query('SELECT COALESCE(MAX(id), 0) AS m FROM policy_acceptances'))[0][0].m)
          : (await pg.query('SELECT COALESCE(max(id), 0)::int AS m FROM portal.policy_acceptances')).rows[0].m;
        const docs = await call(base, 'GET', '/api/policy', { token: tokens[side] });
        const versions = Object.fromEntries(((docs.json && docs.json.documents) || []).map((d) => [d.document, d.version]));
        const acc = await call(base, 'POST', '/api/policy/accept', { token: tokens[side], body: { versions } });
        if (acc.status !== 200) throw new Error(`the admin's acceptance on ${side.toUpperCase()} answered ${acc.status} — BLOCKED`);
        acceptedIds[side] = side === 'a'
          ? (await my.query('SELECT id FROM policy_acceptances WHERE id > ? AND user_id = ?', [maxBefore, u.id]))[0].map((r) => r.id)
          : (await pg.query('SELECT id FROM portal.policy_acceptances WHERE id > $1 AND user_id = $2', [maxBefore, u.id])).rows.map((r) => r.id);
        me = await call(base, 'GET', '/api/auth/me', { token: tokens[side] });
        u = (me.json && me.json.user) || {};
      }
      if (u.policy_pending || u.contact_pending || Number(u.must_change_password) === 1) throw new Error(`the admin on ${side.toUpperCase()} is held at a first-sign-in step — BLOCKED`);
    }

    // ---- auth-1 ------------------------------------------------------------
    const countKey = async () => {
      const [[m]] = await my.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = ?', [key]);
      const p = (await pg.query('SELECT count(*)::int AS n FROM portal.login_attempts WHERE login_key = $1', [key])).rows[0].n;
      return { a: Number(m.n), b: p };
    };
    const before = await countKey();
    const la = await call(A, 'POST', '/api/auth/login', { body: { login_id: nulId, password: 'not-the-password-1' } });
    const lb = await call(B, 'POST', '/api/auth/login', { body: { login_id: nulId, password: 'not-the-password-1' } });
    const after = await countKey();
    const loginOk = (r) => r.status === 401 && r.json && r.json.message === 'Invalid login credentials.';
    check('auth-1: sign-in with a NUL in the login id is 401 "Invalid login credentials."', loginOk(la), loginOk(lb), `${la.status} / ${lb.status}`);
    check('auth-1: … and the failure is COUNTED (one login_attempts row for its key)', after.a === before.a + 1, after.b === before.b + 1);
    const unknown = `zz-nosuch-${crypto.randomBytes(4).toString('hex')}`;
    const fa = await call(A, 'POST', '/api/auth/forgot-password', { body: { login_id: nulId } });
    const fb = await call(B, 'POST', '/api/auth/forgot-password', { body: { login_id: nulId } });
    const fu = await call(B, 'POST', '/api/auth/forgot-password', { body: { login_id: unknown } });
    const forgotOk = (r) => r.status === 202 && JSON.stringify(r.json) === JSON.stringify(fu.json);
    check('auth-1: forgot-password is the one 202 sentence, byte for byte the unknown id\'s', forgotOk(fa), forgotOk(fb), `${fa.status} / ${fb.status}`);
    const body = { login_id: nulId, code: '000000', new_password: `Zz9${crypto.randomBytes(6).toString('hex')}` };
    const ra = await call(A, 'POST', '/api/auth/reset-password', { body });
    const rb = await call(B, 'POST', '/api/auth/reset-password', { body });
    const resetOk = (r) => r.status === 400 && r.json && r.json.message === 'That code is not valid. Request a new one.';
    check('auth-1: reset-password is the one 400 "That code is not valid. Request a new one."', resetOk(ra), resetOk(rb), `${ra.status} / ${rb.status}`);

    // ---- auth-2 ------------------------------------------------------------
    const local = crypto.randomBytes(3).toString('hex');
    const login = `ZZ-PRF-${local.toUpperCase()}`;
    const pw = `Zz9${crypto.randomBytes(8).toString('hex')}`;
    const mk = async (base, token) => call(base, 'POST', '/api/users/teachers', { token, body: { login_id: login, password: pw, name: 'Port Review Fixture' } });
    const ca = await mk(A, tokens.a);
    const cb = await mk(B, tokens.b);
    created.a = ca.json && ca.json.user && ca.json.user.id;
    created.b = cb.json && cb.json.user && cb.json.user.id;
    if (!created.a || !created.b) throw new Error(`the throwaway teacher was not created (${ca.status} / ${cb.status})`);
    const put = (base, token, id, email) => call(base, 'PUT', `/api/users/${id}`, { token, body: { email } });
    const first = `Port.Review.${local}@Example.invalid`;
    await put(A, tokens.a, created.a, first);
    await put(B, tokens.b, created.b, first);
    await my.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [created.a]);
    await pg.query('UPDATE portal.users SET email_verified_at = portal.now_s() WHERE id = $1', [created.b]);
    const caseOnly = first.toLowerCase().replace('example', 'EXAMPLE');
    const ka = await put(A, tokens.a, created.a, caseOnly);
    const kb = await put(B, tokens.b, created.b, caseOnly);
    const kept = (r) => r.status === 200 && r.json && r.json.user && r.json.user.email_verified_at !== null && r.json.user.email_verified_at !== undefined;
    check('auth-2: a case-only email edit KEEPS the confirmation', kept(ka), kept(kb), `${ka.status} / ${kb.status}`);
    const other = `other.review.${local}@example.invalid`;
    const xa = await put(A, tokens.a, created.a, other);
    const xb = await put(B, tokens.b, created.b, other);
    const cleared = (r) => r.status === 200 && r.json && r.json.user && r.json.user.email_verified_at === null;
    check('auth-2 control: a different address CLEARS the confirmation', cleared(xa), cleared(xb), `${xa.status} / ${xb.status}`);
  } finally {
    for (const id of acceptedIds.a) await my.query('DELETE FROM policy_acceptances WHERE id = ?', [id]);
    if (acceptedIds.b.length) await pg.query('DELETE FROM portal.policy_acceptances WHERE id = ANY($1::int[])', [acceptedIds.b]);
    await my.query('DELETE FROM login_attempts WHERE login_key = ?', [key]);
    await pg.query('DELETE FROM portal.login_attempts WHERE login_key = $1', [key]);
    if (created.a) await my.query('DELETE FROM users WHERE id = ?', [created.a]);
    if (created.b) await pg.query('DELETE FROM portal.users WHERE id = $1', [created.b]);
    const [[ua]] = await my.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [created.a || 0]);
    const ub = (await pg.query('SELECT count(*)::int AS n FROM portal.users WHERE id = $1', [created.b || 0])).rows[0].n;
    const [[la]] = await my.query('SELECT COUNT(*) AS n FROM login_attempts WHERE login_key = ?', [key]);
    const lb = (await pg.query('SELECT count(*)::int AS n FROM portal.login_attempts WHERE login_key = $1', [key])).rows[0].n;
    console.log(`cleanup: throwaway teacher left ${Number(ua.n)} / ${ub}, the NUL key's attempts left ${Number(la.n)} / ${lb}`);
    if (Number(ua.n) || ub || Number(la.n) || lb) failures += 1;
    await my.end();
    await pg.end();
  }
  fs.mkdirSync(P.REHEARSAL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = path.join(P.REHEARSAL_DIR, `port_review_fixes_${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ results, failures }, null, 2));
  console.log(`${failures ? `PORT REVIEW FIXES: ${failures} failure(s)` : 'PORT REVIEW FIXES OK'} — report: ${out}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error('port-review-fixes failed:', safeMessage(e));
  process.exit(1);
});
