/**
 * Restore API tests on PostgreSQL (Phase 3, commit 6 — migration/docs/04):
 * every gate a restore passes BEFORE it writes, plus the token_valid_after
 * mechanism in isolation. Does NOT run a restore: one would replace every
 * table's rows on the database every other suite and the running server
 * depend on, and end every session, this run's included. The real restores —
 * a success, a checksum refused, a member failing mid-COPY, an older archive
 * — are the commit's rehearsals, run by hand on the isolated target.
 *
 * WHICH REQUESTS CARRY THE REAL PASSWORD AND THE REAL FILE NAME TOGETHER. Only
 * the three made on archives this run BREAKS on purpose — one with no
 * completed_at, one whose member no longer matches its checksum, one whose
 * schema fingerprint names a column type this database does not have — because
 * those checks run after the step-up and the typed name. Each is refused
 * before any write, and the run proves that: no safety archive, no new file,
 * the cutoff unchanged. Every other request gets the password or the name
 * wrong, or fails an earlier gate first.
 *
 * NO CREDENTIAL IN THIS FILE. The seeded admin, teacher and parent are read at
 * run time from scripts/setup-db.js and never printed, as test:activity-log
 * does. The refusal rows are counted with `description LIKE` in the WHERE
 * clause only — the description is never selected.
 *
 * The token_valid_after boundary is tested with a crafted JWT (same secret,
 * a deliberately chosen `iat`) rather than a real second login — sleeping
 * for real seconds to get two logins on either side of a cutoff would be
 * the same "timeout dressed up as proof" shape rejected for Socket.io
 * delivery. This is deterministic instead. The crafted token also carries
 * the account's CURRENT token_version as `v`, copied from the real login's
 * token: the middleware checks the cutoff and then the version, so the
 * "after the cutoff" assertion proves both, and a crafted token without `v`
 * is refused by the second check on any account whose counter is above 0.
 *
 * Prerequisite: npm run db:setup and the API running (npm start).
 * Usage: npm run test:restore
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { withDb } = require('./test-helpers/db');
const archive = require('../utils/backupArchive');

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;
const JWT_SECRET = process.env.JWT_SECRET;
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

// Every sign-in accepts the privacy notice and terms first (parents since
// feat/privacy, staff since feat/staff-acceptance); this run's rows
// go in the finally (scripts/policyFixture.js, feat/privacy).
const policy = require('./policyFixture').createPolicyFixture();

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

async function request(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${urlPath}`, {
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

// The seeded accounts, from setup-db.js — never a literal here, never printed.
function seededAccounts() {
  const src = fs.readFileSync(path.join(__dirname, 'setup-db.js'), 'utf8');
  const passwords = {};
  for (const m of src.matchAll(/const (admin|teacher|parent)Hash = bcrypt\.hashSync\('([^']*)', 10\)/g)) passwords[m[1]] = m[2];
  const rows = [...src.matchAll(/\('([^']*)', '\$\{(admin|teacher|parent)Hash\}', '(admin|teacher|parent)', '([a-z]+)'/g)].map((m) => ({
    login: m[1],
    password: passwords[m[2]],
    role: m[3],
    status: m[4],
  }));
  const pick = (role) => rows.find((r) => r.role === role && r.status === 'active' && r.password);
  return { admin: pick('admin'), teacher: pick('teacher'), parent: pick('parent') };
}

async function signIn(account) {
  if (!account) return { status: 0, data: null };
  return request('POST', '/api/auth/login', { body: { login_id: account.login, password: account.password } });
}

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

// Signs a real, correctly-verifiable token with a chosen iat/exp instead of
// letting jsonwebtoken stamp the current time — the only way to deterministically
// test "issued before vs after the cutoff" without waiting real seconds for a
// second login to land on the other side of it. jsonwebtoken keeps a payload's
// own `iat`; its `noTimestamp` option DELETES it (measured, Phase 3 commit 6:
// with it, every crafted token here carried no iat and the cutoff check let it
// through whatever the cutoff), so the option is not passed.
function craftToken(basePayload, iatSeconds) {
  return jwt.sign({ ...basePayload, iat: iatSeconds, exp: iatSeconds + 24 * 60 * 60 }, JWT_SECRET);
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function readZip(filePath) {
  const zip = await yauzl.openPromise(filePath, { autoClose: false });
  const members = new Map();
  try {
    for await (const entry of zip.eachEntry()) {
      const chunks = [];
      for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk);
      members.set(entry.fileName, Buffer.concat(chunks));
    }
  } finally {
    zip.close();
  }
  return members;
}

async function writeZip(filePath, members) {
  const zip = new yazl.ZipFile();
  for (const [name, data] of members) zip.addBuffer(data, name);
  zip.end();
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath, { flags: 'wx' });
    out.on('close', resolve);
    out.on('error', reject);
    zip.outputStream.pipe(out);
  });
}

async function run() {
  console.log(`\nRestore API tests (pre-flight gates only) against ${BASE}\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API is reachable');
  if (health.status !== 200 || !JWT_SECRET) {
    console.error('Start the API first (npm start), with JWT_SECRET set for this run too, and run this again.');
    process.exit(1);
  }

  const accounts = seededAccounts();
  const adminLogin = await signIn(accounts.admin);
  const adminToken = adminLogin.data?.token;
  await policy.accept(adminToken);
  const adminUser = adminLogin.data?.user;
  assert(adminLogin.status === 200 && adminToken, 'Admin logs in');
  const iatOld = decodePayload(adminToken).iat;

  const teacherLogin = await signIn(accounts.teacher);
  const teacherToken = teacherLogin.data?.token;
  await policy.accept(teacherToken);
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher logs in');

  const parentLogin = await signIn(accounts.parent);
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  assert(parentLogin.status === 200 && parentToken, 'Parent logs in');

  const realPassword = accounts.admin.password;
  const [[{ m: activityStart }]] = await withDb((conn) => conn.query('SELECT COALESCE(MAX(id), 0) AS m FROM activity_logs'));

  // auth_security_state may hold a REAL cutoff: a real restore may have run
  // against this database. Deleting that row would make every token issued
  // before that restore valid again for the rest of its 24h — the opposite of
  // what the restore was for. So this suite records the row exactly as it
  // found it (present or absent, NULL or a time) and puts exactly that back.
  // It never deletes a cutoff it did not create.
  async function readCutoffState() {
    const [rows] = await withDb((conn) =>
      conn.query('SELECT EXTRACT(EPOCH FROM token_valid_after)::bigint AS ts FROM auth_security_state WHERE id = 1')
    );
    return rows.length ? { exists: true, ts: rows[0].ts } : { exists: false, ts: null };
  }
  const originalCutoff = await readCutoffState();
  async function restoreCutoff() {
    if (!originalCutoff.exists) {
      await withDb((conn) => conn.query('DELETE FROM auth_security_state WHERE id = 1'));
      return;
    }
    await withDb((conn) =>
      conn.query(
        `INSERT INTO auth_security_state (id, token_valid_after) VALUES (1, to_timestamp(?::double precision))
         ON CONFLICT (id) DO UPDATE SET token_valid_after = EXCLUDED.token_valid_after`,
        [originalCutoff.ts]
      )
    );
  }

  const createdBackupIds = [];
  const fixtureFiles = [];

  async function cleanup() {
    if (createdBackupIds.length) {
      const [rows] = await withDb((conn) =>
        conn.query('SELECT id, file_path FROM backups WHERE id = ANY(?::int[])', [createdBackupIds])
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
      await withDb((conn) => conn.query('DELETE FROM backups WHERE id = ANY(?::int[])', [createdBackupIds]));
    }
    for (const file of fixtureFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    // Put the cutoff back exactly as it was found — never a blanket DELETE,
    // which would re-validate every pre-restore token (see readCutoffState).
    await restoreCutoff();
  }

  // A file in the backups directory with a catalog row, as the API would
  // have made it — the fixtures for the gates that need a real row.
  async function registerFile(filename, data) {
    const filePath = path.join(BACKUPS_DIR, filename);
    fs.writeFileSync(filePath, data, { flag: 'wx' });
    fixtureFiles.push(filePath);
    const [row] = await withDb((conn) =>
      conn.query('INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?) RETURNING id', [
        filename,
        filePath,
        data.length,
        adminUser.id,
      ])
    );
    createdBackupIds.push(row.insertId);
    return row.insertId;
  }

  try {
    // --- Fixtures: a real archive to restore "from" in the gate tests, a
    // second one whose file is deleted, a MySQL-era row, and three archives
    // broken on purpose ---
    const targetBackup = await request('POST', '/api/backups', { token: adminToken });
    assert(targetBackup.status === 201, 'Fixture: a real backup archive created');
    const targetId = targetBackup.data?.backup?.id;
    const targetFilename = targetBackup.data?.backup?.filename;
    const targetPath = targetBackup.data?.backup?.file_path;
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
      'Fixture: a second backup whose file is removed outside the API'
    );

    const tail = `${Date.now()}`;
    const mysqlName = `parents_portal_2026-01-01_000000-${tail}.sql`;
    const mysqlId = await registerFile(mysqlName, Buffer.from('-- a MySQL-era fixture written by test:restore\n'));

    const original = await readZip(targetPath);
    const manifest = JSON.parse(original.get(archive.MANIFEST_MEMBER).toString('utf8'));
    const withManifest = (m) => new Map([...original].map(([name, data]) => [name, name === archive.MANIFEST_MEMBER ? Buffer.from(JSON.stringify(m, null, 2)) : data]));

    const incomplete = JSON.parse(JSON.stringify(manifest));
    delete incomplete.completed_at;
    const incompleteName = `parents_portal_2026-01-01_000001-${tail}.zip`;
    const incompletePath = path.join(BACKUPS_DIR, incompleteName);
    await writeZip(incompletePath, withManifest(incomplete));
    fixtureFiles.push(incompletePath);

    const altered = new Map(original);
    const subjects = Buffer.from(altered.get('data/subjects.csv'));
    const at = subjects.length - 2;
    subjects[at] = subjects[at] === 0x39 ? 0x38 : 0x39;
    altered.set('data/subjects.csv', subjects);
    const checksumName = `parents_portal_2026-01-01_000002-${tail}.zip`;
    const checksumPath = path.join(BACKUPS_DIR, checksumName);
    await writeZip(checksumPath, altered);
    fixtureFiles.push(checksumPath);

    const otherSchema = JSON.parse(JSON.stringify(manifest));
    const nameColumn = otherSchema.schema_fingerprint.tables.users.name;
    nameColumn.type = `${nameColumn.type} (another)`;
    const { sha256: staleHash, ...fpBody } = otherSchema.schema_fingerprint;
    otherSchema.schema_fingerprint.sha256 = sha256(archive.canonical(fpBody));
    assert(staleHash !== otherSchema.schema_fingerprint.sha256, 'Fixture: an archive whose fingerprint names another type for users.name, rehashed');
    const schemaName = `parents_portal_2026-01-01_000003-${tail}.zip`;
    const schemaPath = path.join(BACKUPS_DIR, schemaName);
    await writeZip(schemaPath, withManifest(otherSchema));
    fixtureFiles.push(schemaPath);

    // registerFile writes the file itself; these three already exist, so
    // their rows are inserted directly instead.
    async function rowFor(filename, filePath) {
      const [row] = await withDb((conn) =>
        conn.query('INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?) RETURNING id', [
          filename,
          filePath,
          fs.statSync(filePath).size,
          adminUser.id,
        ])
      );
      createdBackupIds.push(row.insertId);
      return row.insertId;
    }
    const incompleteId = await rowFor(incompleteName, incompletePath);
    const checksumId = await rowFor(checksumName, checksumPath);
    const schemaId = await rowFor(schemaName, schemaPath);

    const countPreRestoreBackups = async () => {
      const [rows] = await withDb((conn) => conn.query("SELECT COUNT(*) AS c FROM backups WHERE filename LIKE 'pre_restore_%'"));
      return rows[0].c;
    };
    // Not asserted as zero: a real restore may have run against this
    // database, and its pre_restore_ row is legitimately still in the table.
    // What this suite needs to prove is that none of its own refused requests
    // created a NEW one.
    const preRestoreCountBefore = await countPreRestoreBackups();
    const filesBefore = new Set(fs.readdirSync(BACKUPS_DIR));

    // --- Admin-only ---
    console.log('\nAdmin-only:');

    const teacherAttempt = await request('POST', `/api/backups/${targetId}/restore`, {
      token: teacherToken,
      body: { password: 'not-the-password', confirm_filename: targetFilename },
    });
    assert(teacherAttempt.status === 403, 'Teacher cannot restore (403)');

    const parentAttempt = await request('POST', `/api/backups/${targetId}/restore`, {
      token: parentToken,
      body: { password: 'not-the-password', confirm_filename: targetFilename },
    });
    assert(parentAttempt.status === 403, 'Parent cannot restore (403)');

    // --- parseId and existence gates ---
    console.log('\nId and existence gates:');

    const badId = await request('POST', '/api/backups/abc/restore', {
      token: adminToken,
      body: { password: 'not-the-password', confirm_filename: 'x.zip' },
    });
    assert(badId.status === 400, 'A non-numeric id is 400, not 500');

    const nonexistent = await request('POST', '/api/backups/999999/restore', {
      token: adminToken,
      body: { password: 'not-the-password', confirm_filename: 'x.zip' },
    });
    assert(nonexistent.status === 404, 'A nonexistent backup is 404');

    const missingFile = await request('POST', `/api/backups/${missingId}/restore`, {
      token: adminToken,
      body: { password: 'not-the-password', confirm_filename: 'x.zip' },
    });
    assert(
      missingFile.status === 404 && /missing from disk/i.test(missingFile.data?.message || ''),
      'A backup whose file is gone is 404, saying it is missing from disk'
    );

    // --- A MySQL-era file: the recovery procedure, before the step-up ---
    console.log('\nA MySQL-era file:');

    const mysqlAttempt = await request('POST', `/api/backups/${mysqlId}/restore`, { token: adminToken, body: {} });
    assert(
      mysqlAttempt.status === 409 && mysqlAttempt.data?.code === 'MYSQL_ERA_BACKUP',
      'A .sql row is refused 409 MYSQL_ERA_BACKUP, before any password is asked for'
    );
    assert(
      /recovery procedure/i.test(mysqlAttempt.data?.message || '') && /Nothing was changed/.test(mysqlAttempt.data?.message || ''),
      'The refusal names the recovery procedure and says nothing was changed'
    );

    // --- Step-up auth ---
    console.log('\nStep-up auth:');

    const noPassword = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { confirm_filename: targetFilename },
    });
    // Never 401 here: the admin's token is valid, and a 401 would make the
    // client treat the session as dead. Missing field = 400; failed
    // re-authentication = 403 (see routes/backups.js).
    assert(
      noPassword.status === 400 && /password is required/i.test(noPassword.data?.message || ''),
      'No password is 400 "password is required." (never 401)'
    );
    assert(noPassword.data?.field === 'password', 'That 400 names the password field');

    const wrongPassword = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: 'not-the-password-xyz', confirm_filename: targetFilename },
    });
    assert(
      wrongPassword.status === 403 && /Incorrect password/.test(wrongPassword.data?.message || ''),
      'A wrong password is 403 "Incorrect password." (never 401 — the session is valid)'
    );
    assert(wrongPassword.data?.field === 'password', 'That 403 names the password field, so the client shows it under the input');

    // --- Type-the-name confirmation ---
    console.log('\nType-the-name confirmation:');

    const wrongFilename = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: realPassword, confirm_filename: 'not-the-right-file.zip' },
    });
    assert(
      wrongFilename.status === 400 &&
        wrongFilename.data?.message?.includes('not-the-right-file.zip') &&
        wrongFilename.data?.message?.includes(targetFilename),
      'A wrong typed name is 400, naming both what was typed and the real name'
    );
    assert(wrongFilename.data?.field === 'confirm_filename', 'That 400 names the confirm_filename field');

    const emptyFilename = await request('POST', `/api/backups/${targetId}/restore`, {
      token: adminToken,
      body: { password: realPassword },
    });
    assert(emptyFilename.status === 400, 'No typed name is 400');

    // --- The archive, read whole, before anything is written ---
    console.log('\nThe archive and the schema (real password, real name, broken files):');

    const incompleteAttempt = await request('POST', `/api/backups/${incompleteId}/restore`, {
      token: adminToken,
      body: { password: realPassword, confirm_filename: incompleteName },
    });
    assert(
      incompleteAttempt.status === 409 && incompleteAttempt.data?.code === 'ARCHIVE_INCOMPLETE' && /incomplete/.test(incompleteAttempt.data?.message || ''),
      'An archive whose manifest has no completed_at is refused 409 ARCHIVE_INCOMPLETE'
    );

    const checksumAttempt = await request('POST', `/api/backups/${checksumId}/restore`, {
      token: adminToken,
      body: { password: realPassword, confirm_filename: checksumName },
    });
    assert(
      checksumAttempt.status === 409 &&
        checksumAttempt.data?.code === 'ARCHIVE_INVALID' &&
        /data\/subjects\.csv does not match its checksum/.test(checksumAttempt.data?.message || ''),
      'An archive with one changed byte is refused 409 ARCHIVE_INVALID, naming the member'
    );

    const schemaAttempt = await request('POST', `/api/backups/${schemaId}/restore`, {
      token: adminToken,
      body: { password: realPassword, confirm_filename: schemaName },
    });
    assert(
      schemaAttempt.status === 409 &&
        schemaAttempt.data?.code === 'SCHEMA_MISMATCH' &&
        /column users\.name/.test(schemaAttempt.data?.message || ''),
      'An archive made from another schema is refused 409 SCHEMA_MISMATCH, naming the column'
    );
    assert(
      Array.isArray(schemaAttempt.data?.differences) && schemaAttempt.data.differences.length === 1,
      'and the refusal lists exactly that one difference'
    );

    // --- Refused attempts leave a trace ---
    console.log('\nRefused attempts are logged:');

    const countRefusals = async (like) => {
      const [[{ n }]] = await withDb((conn) =>
        conn.query(
          "SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'restore_refused' AND user_id = ? AND id > ? AND description LIKE ?",
          [adminUser.id, activityStart, like]
        )
      );
      return n;
    };
    const refusals = await countRefusals('%');
    assert(refusals === 8, `Eight refusals logged — the MySQL-era file, no password, a wrong password, a wrong and an empty name, and the three broken archives (got ${refusals})`);
    const reasons = await Promise.all(
      ['%MySQL-era%', '%no password given%', '%incorrect password%', '%typed file name did not match%', '%incomplete%', '%checksum%', '%different database schema%'].map(countRefusals)
    );
    assert(reasons.every((n) => n >= 1), 'Each refusal names its reason');
    assert((await countRefusals('%not-the-password-xyz%')) === 0, 'No refusal row holds the typed password');
    assert((await countRefusals('%not-the-right-file.zip%')) === 0, 'No refusal row holds the typed file name');

    // --- Confirm nothing happened ---
    console.log('\nNothing was written:');

    const preRestoreCountAfter = await countPreRestoreBackups();
    assert(preRestoreCountAfter === preRestoreCountBefore, 'No safety archive (pre_restore_) was created by any refused request');
    const newFiles = fs.readdirSync(BACKUPS_DIR).filter((n) => !filesBefore.has(n));
    assert(newFiles.length === 0, 'No file appeared in the backups directory', newFiles.join(', '));

    // Not "no cutoff": a real restore may have run against this database, so
    // a cutoff may legitimately exist. What this suite must prove is that none
    // of its own refused requests moved it.
    const cutoffAfterGates = await readCutoffState();
    assert(
      cutoffAfterGates.exists === originalCutoff.exists && String(cutoffAfterGates.ts) === String(originalCutoff.ts),
      'The session cutoff is exactly as it was'
    );

    // --- token_valid_after mechanism, in isolation from an actual restore ---
    console.log('\nThe session cutoff, in isolation:');

    const meBeforeCutoff = await request('GET', '/api/auth/me', { token: adminToken });
    assert(meBeforeCutoff.status === 200, "The admin's token works before a cutoff is placed after it");

    // Cutoff placed 5 seconds after the real login's iat — comfortably after
    // it regardless of how fast this script runs, no wall-clock wait needed.
    const cutoffSeconds = iatOld + 5;
    await withDb((conn) =>
      conn.query(
        `INSERT INTO auth_security_state (id, token_valid_after) VALUES (1, to_timestamp(?::double precision))
         ON CONFLICT (id) DO UPDATE SET token_valid_after = EXCLUDED.token_valid_after`,
        [cutoffSeconds]
      )
    );

    const meWithOldToken = await request('GET', '/api/auth/me', { token: adminToken });
    assert(
      meWithOldToken.status === 401 && /restore/i.test(meWithOldToken.data?.message || ''),
      'A token issued before the cutoff is 401, saying a restore invalidated it'
    );

    const teacherMeWithOldToken = await request('GET', '/api/auth/me', { token: teacherToken });
    assert(teacherMeWithOldToken.status === 401, "Another role's token from before the cutoff is 401 too");

    // THE CRAFTED TOKEN MUST CARRY THE ACCOUNT'S CURRENT `v` (pre-Stage-5
    // #3a): the middleware checks the restore cutoff FIRST, then the per-user
    // token_version, and a crafted payload with no `v` reads as version 0.
    // The real login's token carries the live version, so it is copied from
    // there rather than read from the DB — what a real login would do.
    const freshTokenPayload = {
      id: adminUser.id,
      role: adminUser.role,
      login_id: adminUser.login_id,
      student_id: adminUser.student_id || null,
      v: decodePayload(adminToken).v,
    };
    const craftedIat = (token) => decodePayload(token).iat;
    const newToken = craftToken(freshTokenPayload, cutoffSeconds + 5);
    const meWithNewToken = await request('GET', '/api/auth/me', { token: newToken });
    assert(
      craftedIat(newToken) === cutoffSeconds + 5 && meWithNewToken.status === 200,
      'A token issued after the cutoff (its iat checked in the token), carrying the account’s current version, is accepted',
      `got ${meWithNewToken.status}`
    );

    // The same-second edge (migration/docs/02 C.3): the cutoff is whole
    // seconds, so a token minted in the cutoff's own second is accepted and
    // one minted a second earlier is not.
    const sameSecond = await request('GET', '/api/auth/me', { token: craftToken(freshTokenPayload, cutoffSeconds) });
    const secondEarlier = await request('GET', '/api/auth/me', { token: craftToken(freshTokenPayload, cutoffSeconds - 1) });
    assert(sameSecond.status === 200, 'A token whose iat is the cutoff’s own second is accepted', `got ${sameSecond.status}`);
    assert(
      secondEarlier.status === 401 && /restore/i.test(secondEarlier.data?.message || ''),
      'A token whose iat is one second before the cutoff is refused, saying a restore invalidated it',
      `got ${secondEarlier.status}`
    );

    // Put back the cutoff found at the start (a real restore's, or none) —
    // not a DELETE, which would re-validate every pre-restore token.
    await restoreCutoff();

    const meAfterReset = await request('GET', '/api/auth/me', { token: teacherToken });
    assert(meAfterReset.status === 200, "With the cutoff put back, the teacher's original token works again");
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log('No restore was run. The real restores are the commit\'s rehearsals, by hand, on the isolated target.\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err && (err.code || err.message));
  process.exit(1);
});
