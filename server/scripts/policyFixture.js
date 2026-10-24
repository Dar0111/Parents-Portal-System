/**
 * The privacy build's suite fixture (feat/privacy, 2026-10-10).
 *
 * THE CONSENT GATE IS SERVER-ENFORCED (the owner's answer 1), so a parent's
 * token is refused everywhere but /api/auth/me and /api/policy/* until that
 * parent (any role since feat/staff-acceptance) accepts the current Data
 * Privacy Notice and Terms of Use — and, since feat/first-signin, until it has
 * a confirmed Gmail or mobile number (THE CONTACT STEP, below). Every suite that signs in as a parent therefore accepts first,
 * through the real endpoint, and removes what it added in its `finally`:
 *
 *   const policy = createPolicyFixture();
 *   await policy.accept(parentToken);     // right after the parent signs in
 *   ...
 *   } finally { await policy.cleanup(); }
 *
 * accept() does nothing when the parent has ALREADY accepted (someone used the
 * app), and cleanup() deletes only the rows this run's accept() created — by
 * id, never by user — so a real acceptance is never touched.
 *
 * clearForcedChange(userId) — new teachers and parents must change the
 * password someone else typed before anything else (the owner's answer 4).
 * A suite that creates an account through the API and then uses it calls this
 * ONCE after the create. It clears the flag ONLY on an account the run itself
 * just created (made in the last 15 minutes, password never changed) and
 * throws on anything else. test:auth and test:privacy prove the forced change
 * end to end; every other suite uses this.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// PostgreSQL since Phase 3 (commit F): the PG_* keys, the API's own role,
// loopback only — test-helpers/db.js. Its NOW() below is portal.now_s(), the
// whole-second statement time MySQL's NOW() was, so a stamp and the rows a
// request writes in the same second compare as they did (`>=`).
const { withDb } = require('./test-helpers/db');

const BASE = process.env.API_BASE || 'http://localhost:5000';

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function acceptanceIds(userId) {
  const [rows] = await withDb((conn) => conn.query('SELECT id FROM policy_acceptances WHERE user_id = ?', [userId]));
  return rows.map((r) => r.id);
}

// THE CONTACT STEP (feat/first-signin, 2026-10-18). Since that branch an
// account with no confirmed Gmail or mobile number is refused everywhere but
// /auth/me, /api/policy and the contact endpoints (CONTACT_VERIFICATION_REQUIRED),
// so accept() also clears it — by a DIRECT stamp, never a code: a code would
// send real mail. Only an account the server says is contact_pending is
// touched, and only the one column needed:
//
//   has an email             email_verified_at = NOW()
//   no email, has a number   contact_verified_at = NOW()
//   neither                  ONLY an account made in the last 15 minutes (one
//                            this run created): a placeholder address on the
//                            reserved .invalid domain, which nothing delivers
//                            to, stamped confirmed; anything older throws
//
// NOW() is at or after this sign-in, so a forced-change account (whose step is
// "since this sign-in") is cleared too. cleanup() puts every touched column
// back to the value it had before — LAST, with the acceptances, since either
// gates the account again.
const CONTACT_COLUMNS = 'email, email_verified_at, contact_number, contact_verified_at, created_at';

//
// WHILE AN ACCOUNT IS STAMPED its forgot-password requests DO make codes (a
// seeded admin, unconfirmed on the seed, is confirmed for the run), so
// cleanup() also deletes every auth_codes row made for a stamped account since
// its stamp — no reset code outlives the run, and none counts toward the
// account's hourly limit afterwards.
//
// A suite that tests the contact step ITSELF passes { contact: false }: the
// account stays contact_pending, and the gate still lets it reach the email
// and number endpoints.
async function stampContact(userId) {
  return withDb(async (conn) => {
    const [[row]] = await conn.query(
      `SELECT ${CONTACT_COLUMNS}, (created_at > portal.now_s() - interval '15 minutes') AS fresh, portal.now_s() AS stamped_at FROM users WHERE id = ?`,
      [userId]
    );
    if (!row) throw new Error(`policyFixture: user ${userId} not found for the contact step`);
    const since = row.stamped_at;
    if (row.email) {
      await conn.query('UPDATE users SET email_verified_at = portal.now_s() WHERE id = ?', [userId]);
      return { userId, since, restore: { email_verified_at: row.email_verified_at } };
    }
    if (row.contact_number) {
      await conn.query('UPDATE users SET contact_verified_at = portal.now_s() WHERE id = ?', [userId]);
      return { userId, since, restore: { contact_verified_at: row.contact_verified_at } };
    }
    if (!Number(row.fresh)) {
      throw new Error(`policyFixture: user ${userId} has no email or number to confirm and was not created by this run`);
    }
    await conn.query('UPDATE users SET email = ?, email_verified_at = portal.now_s() WHERE id = ?', [`suite-${userId}@example.invalid`, userId]);
    return { userId, since, restore: { email: null, email_verified_at: null } };
  });
}

function createPolicyFixture() {
  const createdIds = [];
  const stamped = [];

  // A second stamp on the same account (a suite that changed its email after
  // the first) keeps the FIRST value read for each column, so cleanup() always
  // returns the account to how it was before this run.
  async function confirmContact(me, wanted = true) {
    if (!wanted || !me?.contact_pending) return false;
    const result = await stampContact(me.id);
    const known = stamped.find((s) => s.userId === me.id);
    if (!known) stamped.push(result);
    else for (const [column, value] of Object.entries(result.restore)) if (!(column in known.restore)) known.restore[column] = value;
    return true;
  }

  async function accept(token, { contact: wantContact = true } = {}) {
    if (!token) return { skipped: 'no token' };
    const me = await call('GET', '/api/auth/me', token);
    if (me.status !== 200) throw new Error(`policy fixture: GET /api/auth/me answered ${me.status}`);
    if (!me.data?.user?.policy_pending) {
      // Consent was given already (someone used the app); the contact step
      // may still be due.
      const contact = await confirmContact(me.data?.user, wantContact);
      return { skipped: 'already accepted', contact };
    }

    const userId = me.data.user.id;
    const docs = await call('GET', '/api/policy', token);
    if (docs.status !== 200) throw new Error(`policy fixture: GET /api/policy answered ${docs.status}`);
    const versions = Object.fromEntries((docs.data.documents || []).map((d) => [d.document, d.version]));

    const before = new Set(await acceptanceIds(userId));
    const res = await call('POST', '/api/policy/accept', token, { versions, on_behalf_of_child: true });
    if (res.status !== 200) throw new Error(`policy fixture: POST /api/policy/accept answered ${res.status}`);
    for (const id of await acceptanceIds(userId)) {
      if (!before.has(id)) createdIds.push(id);
    }
    const contact = await confirmContact(me.data.user, wantContact);
    return { accepted: true, contact };
  }

  // The contact columns first (one UPDATE per touched account, back to the
  // values read before the stamp), then the acceptances. A row the suite has
  // deleted already updates nothing.
  async function restoreContacts() {
    const entries = stamped.splice(0);
    for (const { userId, since, restore } of entries) {
      const columns = Object.keys(restore);
      await withDb(async (conn) => {
        await conn.query(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
          ...columns.map((c) => restore[c]),
          userId,
        ]);
        await conn.query('DELETE FROM auth_codes WHERE user_id = ? AND created_at >= ?', [userId, since]);
      });
    }
    return entries.length;
  }

  async function cleanup() {
    await restoreContacts();
    if (!createdIds.length) return 0;
    const ids = createdIds.splice(0);
    const [result] = await withDb((conn) => conn.query('DELETE FROM policy_acceptances WHERE id = ANY(?::int[])', [ids]));
    return result.affectedRows;
  }

  return { accept, cleanup };
}

async function clearForcedChange(userId) {
  const [result] = await withDb((conn) =>
    conn.query(
      `UPDATE users SET must_change_password = 0
        WHERE id = ? AND must_change_password = 1 AND password_changed_at IS NULL
          AND created_at > (portal.now_s() - interval '15 minutes')`,
      [userId]
    )
  );
  if (result.affectedRows !== 1) {
    throw new Error(`clearForcedChange: user #${userId} is not an account this run just created`);
  }
}

module.exports = { createPolicyFixture, clearForcedChange };
