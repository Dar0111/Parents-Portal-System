/**
 * The privacy build's suite fixture (feat/privacy, 2026-10-10).
 *
 * THE CONSENT GATE IS SERVER-ENFORCED (the owner's answer 1), so a parent's
 * token is refused everywhere but /api/auth/me, /api/auth/change-password and
 * /api/policy/* until that parent accepts the current Data Privacy Notice and
 * Terms of Use. Every suite that signs in as a parent therefore accepts first,
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
const mysql = require('mysql2/promise');

const BASE = process.env.API_BASE || 'http://localhost:5000';

async function withDb(fn) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

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

function createPolicyFixture() {
  const createdIds = [];

  async function accept(token) {
    if (!token) return { skipped: 'no token' };
    const me = await call('GET', '/api/auth/me', token);
    if (me.status !== 200) throw new Error(`policy fixture: GET /api/auth/me answered ${me.status}`);
    if (!me.data?.user?.policy_pending) return { skipped: 'already accepted' };

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
    return { accepted: true };
  }

  async function cleanup() {
    if (!createdIds.length) return 0;
    const ids = createdIds.splice(0);
    const [result] = await withDb((conn) => conn.query('DELETE FROM policy_acceptances WHERE id IN (?)', [ids]));
    return result.affectedRows;
  }

  return { accept, cleanup };
}

async function clearForcedChange(userId) {
  const [result] = await withDb((conn) =>
    conn.query(
      `UPDATE users SET must_change_password = 0
        WHERE id = ? AND must_change_password = 1 AND password_changed_at IS NULL
          AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
      [userId]
    )
  );
  if (result.affectedRows !== 1) {
    throw new Error(`clearForcedChange: user #${userId} is not an account this run just created`);
  }
}

module.exports = { createPolicyFixture, clearForcedChange };
