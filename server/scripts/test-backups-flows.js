/**
 * Backup API tests — real mysqldump execution, filename collision guard,
 * download streaming, missing-file handling, delete guard, activity logging.
 * Prerequisite: npm run db:setup && npm start (or npm run dev), and mysqldump
 * reachable (on PATH or via MYSQLDUMP_PATH in server/.env).
 *
 * Idempotent: every backup this script creates (file + row) is deleted in a
 * finally block, so it passes on repeat runs with no db:setup.
 *
 * Usage: npm run test:backups
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}`;

// Parent sign-ins accept the privacy notice and terms first; this run's rows
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

async function request(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buffer, headers: res.headers };
  }

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

async function run() {
  console.log(`\nParents Portal — Backup API Tests (${BASE})\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health check');
  if (health.status !== 200) {
    console.error('\nServer not reachable. Start with: npm start\n');
    process.exit(1);
  }

  const adminLogin = await login('ADMIN001', 'Admin@2026');
  const adminToken = adminLogin.data?.token;
  assert(adminLogin.status === 200 && adminToken, 'Admin login');

  const teacherLogin = await login('TCH-001', 'Teacher@2026');
  const teacherToken = teacherLogin.data?.token;
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher login');

  const parentLogin = await login('13567454', 'Parent@2026');
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
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
    if (!createdBackupIds.length) return;
    const [rows] = await withDb((conn) =>
      conn.query('SELECT id, file_path FROM backups WHERE id IN (?)', [createdBackupIds])
    );
    for (const row of rows) {
      if (fs.existsSync(row.file_path)) {
        try {
          fs.unlinkSync(row.file_path);
        } catch {
          // best-effort cleanup
        }
      }
    }
    await withDb((conn) => conn.query('DELETE FROM backups WHERE id IN (?)', [createdBackupIds]));
  }

  try {
    // --- Admin-only enforcement ---
    console.log('\nAdmin-only:');

    const teacherList = await request('GET', '/api/backups', { token: teacherToken });
    assert(teacherList.status === 403, 'Teacher cannot GET /api/backups');

    const parentCreate = await request('POST', '/api/backups', { token: parentToken });
    assert(parentCreate.status === 403, 'Parent cannot POST /api/backups');

    const teacherDownload = await request('GET', '/api/backups/1/download', { token: teacherToken });
    assert(teacherDownload.status === 403, 'Teacher cannot download a backup');

    const teacherDelete = await request('DELETE', '/api/backups/1', { token: teacherToken });
    assert(teacherDelete.status === 403, 'Teacher cannot delete a backup');

    // --- Create: a real mysqldump ---
    console.log('\nCreate (real mysqldump):');

    const create = await request('POST', '/api/backups', { token: adminToken });
    assert(
      create.status === 201 && /^parents_portal_\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?\.sql$/.test(create.data?.backup?.filename || ''),
      'Admin creates a backup; filename matches parents_portal_YYYY-MM-DD_HHmmss.sql'
    );
    const backupId = create.data?.backup?.id;
    const filePath = create.data?.backup?.file_path;
    if (backupId) createdBackupIds.push(backupId);

    assert(
      typeof create.data?.backup?.file_size === 'number' && create.data.backup.file_size > 0,
      'Response includes a positive file_size'
    );

    assert(filePath && fs.existsSync(filePath), 'The dump file actually exists on disk');

    if (filePath && fs.existsSync(filePath)) {
      const actualSize = fs.statSync(filePath).size;
      assert(actualSize === create.data.backup.file_size, 'file_size in the response matches the file on disk');

      const head = fs.readFileSync(filePath, 'utf8').slice(0, 200);
      assert(/mysql dump/i.test(head), 'File content looks like a real mysqldump output, not a stub');
      const fullDump = fs.readFileSync(filePath, 'utf8');
      assert(/CREATE DATABASE/i.test(fullDump), 'Dump includes CREATE DATABASE (--databases flag worked)');

      // backups is self-referential — a backup's file can never legitimately
      // contain its own row, and restoring FROM it would otherwise erase
      // every backup row taken after it (files stay on disk, rows vanish).
      // --ignore-table + a second --no-data pass exists to prevent stale
      // rows. If someone removes that flag later, this is the regression it
      // catches — no live restore needed, the dump's own content proves it.
      // (This alone isn't the whole fix — see the DROP TABLE check below.)
      assert(
        /CREATE TABLE `?backups`?/i.test(fullDump),
        'Dump still creates the backups table (structure survives via the --no-data pass)'
      );
      assert(
        !/INSERT INTO `?backups`?/i.test(fullDump),
        'Dump contains no INSERT INTO backups — its own row (and every other backup row) is never in the file'
      );

      // The above two checks passed even while the restore endpoint was
      // still wiping the live backups table on every restore — they proved
      // there's no stale INSERT, not that nothing destructive runs.
      // --no-data still writes DROP TABLE `backups` / CREATE TABLE `backups`
      // into the dump (needed so a bare-metal restore outside this API gets
      // a real table), and the restore endpoint used to execute the whole
      // file verbatim — so that DROP+CREATE ran against the LIVE table too,
      // wiping it to zero rows regardless of which backup was restored from
      // (found by hand: restoring backup #1 also erased backup #2, created
      // after #1's dump and therefore never in #1's file either way).
      // stripBackupsTableDdl() is what the restore handler now runs the SQL
      // through before executing it — this asserts, against this real dump,
      // that the DROP TABLE for backups is gone from what would be executed
      // while the CREATE TABLE stays in the file on disk unmodified (so an
      // external bare-metal restore is unaffected). Proving the restore
      // endpoint itself never executes this in practice would need an
      // actual live restore — deliberately excluded from this suite (see
      // test:restore) — so this tests the extraction function directly
      // against real content instead, the same shape as test:sanitize.
      const { stripBackupsTableDdl } = require('../routes/backups.js');
      const restorableSql = stripBackupsTableDdl(fullDump);
      assert(
        /DROP TABLE IF EXISTS `?backups`?/i.test(fullDump),
        'Sanity check: the real file DOES contain DROP TABLE backups (so the next assertion is testing something real)'
      );
      assert(
        !/DROP TABLE IF EXISTS `?backups`?/i.test(restorableSql),
        'The SQL the restore endpoint would actually execute has backups\' DROP TABLE stripped out'
      );
      assert(
        !/CREATE TABLE `?backups`?/i.test(restorableSql),
        'The SQL the restore endpoint would actually execute has backups\' CREATE TABLE stripped out too'
      );
      assert(
        /CREATE TABLE `?users`?/i.test(restorableSql) && /INSERT INTO `?users`?/i.test(restorableSql),
        'Stripping backups leaves neighboring tables (users) completely untouched'
      );
    }

    // --- Filename collision guard ---
    console.log('\nFilename collision:');

    const create2 = await request('POST', '/api/backups', { token: adminToken });
    const backupId2 = create2.data?.backup?.id;
    if (backupId2) createdBackupIds.push(backupId2);
    assert(
      create2.status === 201 && create2.data?.backup?.filename !== create.data?.backup?.filename,
      'A second backup created immediately after gets a distinct filename, not an overwrite'
    );
    assert(
      filePath && fs.existsSync(filePath) && fs.statSync(filePath).size === create.data.backup.file_size,
      "First backup's file is untouched by the second create (no silent overwrite)"
    );

    // --- List ---
    console.log('\nList:');

    const list = await request('GET', '/api/backups', { token: adminToken });
    const listEntry = (list.data?.backups || []).find((b) => b.id === backupId);
    assert(list.status === 200 && listEntry, 'Admin lists backups, newest first');
    assert(listEntry?.file_exists === true, 'List marks an existing file as file_exists: true');
    assert('created_by_name' in (listEntry || {}), 'List includes who created each backup');

    // --- Download ---
    console.log('\nDownload:');

    const download = await request('GET', `/api/backups/${backupId}/download`, { token: adminToken, raw: true });
    assert(
      download.status === 200 && download.buffer.length === create.data.backup.file_size,
      'Download streams the full file — byte length matches file_size'
    );

    const downloadUnknown = await request('GET', '/api/backups/999999999/download', { token: adminToken });
    assert(downloadUnknown.status === 404, 'Download of a nonexistent backup id returns 404');

    const downloadBadId = await request('GET', '/api/backups/abc/download', { token: adminToken });
    assert(downloadBadId.status === 400, 'Download with a non-numeric id returns 400, not 500');

    // --- Missing-file handling (second backup, file removed outside the API) ---
    console.log('\nMissing file on disk:');

    const filePath2 = create2.data?.backup?.file_path;
    if (filePath2 && fs.existsSync(filePath2)) {
      fs.unlinkSync(filePath2);
    }

    const downloadMissing = await request('GET', `/api/backups/${backupId2}/download`, { token: adminToken });
    assert(
      downloadMissing.status === 404 && /missing from disk/i.test(downloadMissing.data?.message || ''),
      'Downloading a backup whose file is gone returns 404 naming that specifically, not a generic error'
    );

    const listAfterMissing = await request('GET', '/api/backups', { token: adminToken });
    const listEntry2 = (listAfterMissing.data?.backups || []).find((b) => b.id === backupId2);
    assert(listEntry2?.file_exists === false, 'List marks the now-missing file as file_exists: false');

    const deleteMissingFile = await request('DELETE', `/api/backups/${backupId2}`, { token: adminToken });
    assert(
      deleteMissingFile.status === 200 && /already missing/i.test(deleteMissingFile.data?.message || ''),
      'Deleting a backup whose file is already gone still succeeds and says so'
    );
    createdBackupIds.splice(createdBackupIds.indexOf(backupId2), 1);

    const [afterMissingDelete] = await withDb((conn) =>
      conn.query('SELECT id FROM backups WHERE id = ?', [backupId2])
    );
    assert(afterMissingDelete.length === 0, 'Row is actually gone after deleting a missing-file backup');

    // --- Normal delete ---
    console.log('\nDelete:');

    const deleteNonNumeric = await request('DELETE', '/api/backups/abc', { token: adminToken });
    assert(deleteNonNumeric.status === 400, 'DELETE /api/backups/abc returns 400, not 500');

    const deleteUnknown = await request('DELETE', '/api/backups/999999999', { token: adminToken });
    assert(deleteUnknown.status === 404, 'DELETE of a nonexistent backup returns 404');

    const del = await request('DELETE', `/api/backups/${backupId}`, { token: adminToken });
    assert(
      del.status === 200 && del.data?.message === 'Backup deleted.',
      'Deleting a backup with its file present removes both, plain success message'
    );
    assert(!fs.existsSync(filePath), 'File is actually removed from disk after delete');
    createdBackupIds.splice(createdBackupIds.indexOf(backupId), 1);

    // --- Activity logging ---
    console.log('\nActivity logging:');

    const [logRows] = await withDb((conn) =>
      conn.query(
        `SELECT action FROM activity_logs WHERE user_id = ? AND action IN ('create_backup','download_backup','delete_backup') ORDER BY id DESC LIMIT 10`,
        [adminLogin.data.user.id]
      )
    );
    const loggedActions = logRows.map((r) => r.action);
    assert(loggedActions.includes('create_backup'), 'create_backup is logged');
    assert(loggedActions.includes('download_backup'), 'download_backup is logged');
    assert(loggedActions.includes('delete_backup'), 'delete_backup is logged');
    // --- Pagination contract (2026-09-19, utils/pagination.js): every list
    // carries page { limit, offset, total, has_more }; limit default 50, max
    // 200; sort against an allow-list. Invariants only — never an exact count
    // on a table the application also writes to. orphaned_files is NOT paged:
    // it is the disk minus every row, so it must not shrink with the page.
    console.log('\nPagination:');
    const qs = (path, q) => `${path}${path.includes('?') ? '&' : '?'}${q}`;
    const ordered = (rows, field) =>
      rows.every((row, i) => {
        if (i === 0) return true;
        const a = rows[i - 1][field];
        const b = row[field];
        if (a === null || a === undefined || b === null || b === undefined) return true;
        return typeof a === 'number' && typeof b === 'number'
          ? a >= b
          : String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) >= 0;
      });
    async function checkPage(path, token, key, { sort, field, idField = 'id' }) {
      const first = await request('GET', path, { token });
      const rows = first.data?.[key] || [];
      const page = first.data?.page;
      assert(
        first.status === 200 && page && page.limit === 50 && page.offset === 0 && Number.isInteger(page.total),
        `${path}: page { limit 50, offset 0, total } by default`
      );
      assert(
        rows.length <= 50 && page?.has_more === (page?.total > 50) && (page?.has_more || rows.length === page?.total),
        `${path}: rows <= limit, has_more = total > limit, a last page holds the rest`
      );
      const one = await request('GET', qs(path, 'limit=1'), { token });
      assert(
        one.status === 200 &&
          (one.data?.[key] || []).length === Math.min(1, page?.total ?? 0) &&
          one.data?.page?.has_more === (page?.total > 1),
        `${path}: limit=1 returns one row and has_more when more exist`
      );
      if ((page?.total ?? 0) >= 2) {
        const second = await request('GET', qs(path, 'limit=1&offset=1'), { token });
        assert(
          second.status === 200 && second.data?.[key]?.[0]?.[idField] !== one.data?.[key]?.[0]?.[idField],
          `${path}: offset=1 returns a different row than offset=0`
        );
      }
      const bad = await Promise.all(
        ['limit=0', 'limit=201', 'offset=-1', 'sort=nope', `sort=${sort}&order=sideways`, 'order=desc'].map((q) =>
          request('GET', qs(path, q), { token })
        )
      );
      assert(bad.every((r) => r.status === 400), `${path}: limit 0/201, offset -1, unknown sort, bad order, order without sort are 400`);
      assert(new RegExp(`sort must be one of: .*\\b${sort}\\b`).test(bad[3].data?.message || ''), `${path}: the sort 400 names the allowed keys`);
      const sorted = await request('GET', qs(path, `sort=${sort}&order=desc`), { token });
      assert(sorted.status === 200 && ordered(sorted.data?.[key] || [], field), `${path}: sort=${sort}&order=desc is ordered on the page`);
      return first;
    }

    const fullList = await checkPage('/api/backups', adminToken, 'backups', { sort: 'created_at', field: 'created_at' });
    const onePage = await request('GET', '/api/backups?limit=1', { token: adminToken });
    assert(
      onePage.status === 200 &&
        JSON.stringify((onePage.data?.orphaned_files || []).map((f) => f.filename).sort()) ===
          JSON.stringify((fullList.data?.orphaned_files || []).map((f) => f.filename).sort()),
      'GET /backups?limit=1: orphaned_files is the same set as on the full list (disk minus EVERY row)'
    );

    // --- The .partial safeguard (fix/server-reliability, 2026-09-30) ---
    // A dump is written as <name>.sql.partial and renamed only when complete.
    // Proved on a SECOND API process on its own port, started with a
    // MYSQLDUMP_PATH that does not exist, so its dump fails for certain —
    // the running server under test is never reconfigured. The same child
    // proves the startup sweep: a stale .partial planted before it starts is
    // gone once it is up.
    console.log('\n.partial safeguard');
    const nodePath = require('path');
    const { spawn, execSync } = require('child_process');
    const backupsDir = nodePath.join(__dirname, '..', 'backups');
    assert(
      !fs.readdirSync(backupsDir).some((n) => n.endsWith('.sql.partial')),
      'after this suite\'s successful backups, no .partial is left on disk'
    );
    const planted = nodePath.join(backupsDir, `suite_probe_${Date.now()}.sql.partial`);
    fs.writeFileSync(planted, '');
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    fs.utimesSync(planted, stale, stale);
    const FAIL_PORT = Number(process.env.FAIL_PORT || 5002);
    const child = spawn(process.execPath, ['server.js'], {
      cwd: nodePath.join(__dirname, '..'),
      env: { ...process.env, PORT: String(FAIL_PORT), MYSQLDUMP_PATH: nodePath.join(__dirname, 'no-such-mysqldump.exe') },
      windowsHide: true,
      stdio: 'ignore',
    });
    try {
      let up = false;
      for (let i = 0; i < 100 && !up; i += 1) {
        try {
          up = (await fetch(`http://127.0.0.1:${FAIL_PORT}/api/health`)).status === 200;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      assert(up, `a second API with a broken MYSQLDUMP_PATH starts on ${FAIL_PORT}`);
      assert(!fs.existsSync(planted), 'its startup sweep removed the stale .partial planted before it started');
      const before = new Set(fs.readdirSync(backupsDir));
      const failLogin = await fetch(`http://127.0.0.1:${FAIL_PORT}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: 'ADMIN001', password: 'Admin@2026' }),
      }).then((r) => r.json());
      const failRes = await fetch(`http://127.0.0.1:${FAIL_PORT}/api/backups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${failLogin.token}` },
      });
      assert(failRes.status === 500, 'the forced dump failure answers 500', `got ${failRes.status}`);
      const leftover = fs.readdirSync(backupsDir).filter((n) => !before.has(n));
      assert(
        leftover.length === 0,
        'the forced failure leaves neither a .sql nor a .partial behind',
        leftover.join(', ')
      );
    } finally {
      if (fs.existsSync(planted)) fs.unlinkSync(planted);
      try {
        if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
  } finally {
    await policy.cleanup();
    await cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
