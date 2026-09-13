/**
 * Restore API tests — pre-flight gates only, plus the token_valid_after
 * mechanism in isolation. Does NOT run an actual end-to-end restore: that
 * would DROP DATABASE on the same shared dev database every other suite,
 * the running --watch server, and manual testing all depend on, reset the
 * live connection pool inside the actually-running process mid-test, and
 * invalidate every session including whichever one is open right now. A
 * real restore is deliberately run once, manually, with db:setup ready —
 * not from this suite.
 *
 * IMPORTANT: no request in this file ever combines the admin's *real*
 * password with a backup's *real* filename in the same call — that
 * combination is the only thing that actually triggers a restore. Every
 * restore-permission test here deliberately gets at least one of the two
 * wrong, or fails an earlier gate first.
 *
 * The token_valid_after boundary is tested with a crafted JWT (same secret,
 * a deliberately chosen `iat`) rather than a real second login — sleeping
 * for real seconds to get two logins on either side of a cutoff would be
 * the same "timeout dressed up as proof" shape rejected for Socket.io
 * delivery. This is deterministic instead.
 *
 * Prerequisite: npm run db:setup && npm start (or npm run dev)
 * Usage: npm run test:restore
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const jwt = require('jsonwebtoken');

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { status: res.status, data };
}

async function login(loginId, password) {
  return request('POST', '/api/auth/login', { body: { login_id: loginId, password } });
}

function decodeIat(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  return payload.iat;
}

// Signs a real, correctly-verifiable token with a chosen iat/exp instead of
// letting jsonwebtoken stamp the current time — the only way to deterministically
// test "issued before/after a cutoff" without waiting real seconds for a second
// login to land on the other side of it.
function craftToken(basePayload, iatSeconds) {
  return jwt.sign({ ...basePayload, iat: iatSeconds, exp: iatSeconds + 24 * 60 * 60 }, JWT_SECRET, {
    noTimestamp: true,
  });
}

async function run() {
  console.log(`\nParents Portal — Restore API Tests (pre-flight gates only) (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  const adminUser = adminLogin.data?.user;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');
  const iatOld = decodeIat(adminToken);

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  assert(parentLogin.status === 200 && parentToken, 'Parent login');

  const mysql = require('mysql2/promise');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  };
  async function withDb(fn) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  const createdBackupIds = [];

  async function cleanup() {
    if (createdBackupIds.length) {
      const [rows] = await withDb((conn) =>
        conn.query('SELECT id, file_path FROM backups WHERE id IN (?)', [createdBackupIds])
      );
      for (const row of rows) {
        if (fs.existsSync(row.file_path)) {
          try {
            fs.unlinkSync(row.file_path);
          } catch {
            // best-effort
          }
        }
      }
      await withDb((conn) => conn.query('DELETE FROM backups WHERE id IN (?)', [createdBackupIds]));
    }
    // No restore ever ran in this file, so this is almost certainly already
    // empty — cleaning up unconditionally anyway, in case a prior manual
    // end-to-end restore left a row and this suite ran after it.
    await withDb((conn) => conn.query('DELETE FROM auth_security_state WHERE id = 1'));
  }

  try {
    // --- Fixtures: a real backup to restore "from" in the gate tests, and
    // a second one whose file we delete to test the missing-file gate ---
    const targetBackup = await request('POST', '/api/backups', { token: adminToken });
    assert(targetBackup.status === 201, 'Fixture: created a real backup to use as the restore target');
    const targetId = targetBackup.data?.backup?.id;
    const targetFilename = targetBackup.data?.backup?.filename;
    if (targetId) createdBackupIds.push(targetId);

    const missingFileBackup = await request('POST', '/api/backups', { token: adminToken });
    const missingId = missingFileBackup.data?.backup?.id;
    const missingFilePath = missingFileBackup.data?.backup?.file_path;
    if (missingId) createdBackupIds.push(missingId);
    if (missingFilePath && fs.existsSync(missingFilePath)) {
      fs.unlinkSync(missingFilePath);
    }
    assert(
      missingFileBackup.status === 201 && missingFilePath && !fs.existsSync(missingFilePath),
      'Fixture: a second backup whose file is now missing on disk'
    );

    const countPreRestoreBackups = async () => {
      const [rows] = await withDb((conn) =>
        conn.query("SELECT COUNT(*) AS c FROM backups WHERE filename LIKE 'pre_restore_%'")
      );
      return rows[0].c;
    };
    // Not asserted as zero: a real restore has genuinely run against this
    // dev DB (see CLAUDE.md's RESTORE section), and its adopted pre_restore_
    // row is legitimately still in the table. Track the count as a baseline
    // instead — what this suite actually needs to prove is that none of its
    // own pre-flight-failure requests created a NEW one, not that the table
    // is pristine.
    const preRestoreCountBefore = await countPreRestoreBackups();

    // --- Admin-only ---
    console.log('\nAdmin-only:');

    const teacherAttempt = await request('POST', `/api/backups/${targetId}/restore`, {
      token: teacherToken,
      body: { password: 'irrelevant', confirm_filename: 'irrelevant' },
    });
    assert(teacherAttempt.status === 403, 'Teacher cannot restore');

    const parentAttempt = await request('POST', `/api/backups/${targetId}/restore`, {
      token: parentToken,
      body: { password: 'irrelevant', confirm_filename: 'irrelevant' },
    });
    assert(parentAttempt.status === 403, 'Parent cannot restore');

    // --- parseId and existence gates ---
    console.log('\nId validation:');

    const badId = await request('POST', '/api/backups/abc/restore', {
      token: adminToken,
      body: { password: 'irrelevant', confirm_filename: 'irrelevant' },
    });
    assert(badId.status === 400, 'Non-numeric id returns 400, not 500');

    const nonexistent = await request('POST', '/api/backups/999999999/restore', {
      token: adminToken,
      body: { password: 'irrelevant', confirm_filename: 'irrelevant' },
    });
    assert(nonexistent.status === 404, 'Nonexistent backup id returns 404');

    const missingFile = await request('POST', `/api/backups/${missingId}/restore`, {
      token: adminToken,
      body: { password: 'irrelevant', confirm_filename: 'irrelevant' },
    });
    assert(
      missingFile.status === 404 && /missing from disk/i.test(missingFile.data?.message || ''),
      'Backup row exists but file is gone — 404 naming that specifically, checked before password/filename'
    );

    // --- Step-up auth ---
    console.log('\nStep-up auth (password):');

    const noPassword = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { confirm_filename: targetFilename },
    });
    assert(
      noPassword.status === 401 && /password is required/i.test(noPassword.data?.message || ''),
      'Missing password rejected — 401'
    );

    const wrongPassword = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: 'DefinitelyWrong@2026', confirm_filename: targetFilename },
    });
    assert(wrongPassword.status === 401, "Wrong password rejected — 401, even with the correct filename supplied");

    // --- Type-the-name confirmation ---
    console.log('\nconfirm_filename:');

    const wrongFilename = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: 'Admin@2026', confirm_filename: 'not-the-real-file.sql' },
    });
    assert(
      wrongFilename.status === 400 &&
        wrongFilename.data?.message?.includes('not-the-real-file.sql') &&
        wrongFilename.data?.message?.includes(targetFilename),
      'Wrong confirm_filename rejected — 400 naming both the entered and the real value'
    );

    const emptyFilename = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: 'Admin@2026' },
    });
    assert(emptyFilename.status === 400, 'Missing confirm_filename rejected — 400');

    // --- Confirm nothing happened ---
    console.log('\nNothing happened:');

    const preRestoreCountAfter = await countPreRestoreBackups();
    assert(
      preRestoreCountAfter === preRestoreCountBefore,
      'No NEW safety dump was created — every gate above failed before reaching it'
    );

    const [stateRows] = await withDb((conn) =>
      conn.query('SELECT token_valid_after FROM auth_security_state WHERE id = 1')
    );
    assert(
      !stateRows.length || stateRows[0].token_valid_after === null,
      'token_valid_after is still unset — no restore ever actually ran'
    );

    // --- token_valid_after mechanism, in isolation from an actual restore ---
    console.log('\ntoken_valid_after (isolated from a real restore):');

    const meBeforeCutoff = await request('GET', '/api/auth/me', { token: adminToken });
    assert(meBeforeCutoff.status === 200, "Admin's token works normally before any cutoff is set");

    // Cutoff placed 5 seconds after the real login's iat — comfortably after
    // it regardless of how fast this script runs, no wall-clock wait needed.
    const cutoffSeconds = iatOld + 5;
    await withDb((conn) =>
      conn.query(
        `INSERT INTO auth_security_state (id, token_valid_after) VALUES (1, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE token_valid_after = VALUES(token_valid_after)`,
        [cutoffSeconds]
      )
    );

    const meWithOldToken = await request('GET', '/api/auth/me', { token: adminToken });
    assert(
      meWithOldToken.status === 401 && /restore/i.test(meWithOldToken.data?.message || ''),
      'A token issued before the cutoff is rejected once token_valid_after is set'
    );

    const teacherMeWithOldToken = await request('GET', '/api/auth/me', { token: teacherToken });
    assert(
      teacherMeWithOldToken.status === 401,
      "The cutoff applies to every user's pre-cutoff token, not just the admin's"
    );

    const freshTokenPayload = { id: adminUser.id, role: adminUser.role, login_id: adminUser.login_id, student_id: adminUser.student_id || null };
    const newToken = craftToken(freshTokenPayload, cutoffSeconds + 5);
    const meWithNewToken = await request('GET', '/api/auth/me', { token: newToken });
    assert(meWithNewToken.status === 200, 'A token issued after the cutoff still works');

    await withDb((conn) => conn.query('DELETE FROM auth_security_state WHERE id = 1'));

    const meAfterReset = await request('GET', '/api/auth/me', { token: teacherToken });
    assert(meAfterReset.status === 200, "Clearing token_valid_after restores everyone's existing tokens");
  } finally {
    await cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log('Note: this suite intentionally never runs an actual restore. Run one manually, deliberately,');
  console.log('with db:setup ready, when you want end-to-end verification.\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
