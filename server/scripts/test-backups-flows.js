/**
 * Backup API tests on PostgreSQL (Phase 3, commit 6 — migration/docs/04): a
 * real COPY archive made through POST /api/backups and read back member by
 * member against its manifest, the filename collision guard, the list's engine
 * and format (a MySQL-era `.sql` row and an orphan file included), download
 * streaming, missing-file handling, the delete guard, activity logging, the
 * pagination contract, and the `.partial` safeguard: a stale `.partial` swept
 * at startup, a create whose catalog row cannot be written, and an archive
 * whose COPY fails half way, each leaving neither a `.zip` nor a `.partial`.
 *
 * NO CREDENTIAL IN THIS FILE. The seeded admin, teacher and parent are read at
 * run time from scripts/setup-db.js (the one place they live) and never
 * printed, as test:activity-log does.
 *
 * Idempotent: every backup this script creates (file + row), its MySQL-era
 * fixture row and file and its orphan file are deleted in a finally block.
 *
 * Prerequisite: npm run db:setup and the API running (npm start).
 * Usage: npm run test:backups
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const yauzl = require('yauzl');
const { withDb, config: dbConfig } = require('./test-helpers/db');
const archive = require('../utils/backupArchive');

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}`;
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

async function request(method, urlPath, { token, body, raw, base = BASE } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base}${urlPath}`, {
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

// Records in COPY's CSV: a newline outside double quotes ends one.
function csvRecords(buffer) {
  let quoted = false;
  let records = 0;
  let open = false;
  for (const b of buffer) {
    if (b === 0x22) {
      quoted = !quoted;
      open = true;
    } else if (b === 0x0a && !quoted) {
      records += 1;
      open = false;
    } else open = true;
  }
  return records + (open ? 1 : 0);
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function liveFingerprint() {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await archive.useArchiveSession(client);
    const fp = await archive.schemaFingerprint(client);
    await client.query('COMMIT');
    return fp;
  } finally {
    await client.end();
  }
}

async function run() {
  console.log(`\nBackup API tests against ${BASE}\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API is reachable');
  if (health.status !== 200) {
    console.error('Start the API first (npm start) and run this again.');
    process.exit(1);
  }

  const accounts = seededAccounts();
  const adminLogin = await signIn(accounts.admin);
  const adminToken = adminLogin.data?.token;
  await policy.accept(adminToken);
  assert(adminLogin.status === 200 && adminToken, 'Admin logs in');

  const teacherLogin = await signIn(accounts.teacher);
  const teacherToken = teacherLogin.data?.token;
  await policy.accept(teacherToken);
  assert(teacherLogin.status === 200 && teacherToken, 'Teacher logs in');

  const parentLogin = await signIn(accounts.parent);
  const parentToken = parentLogin.data?.token;
  await policy.accept(parentToken);
  assert(parentLogin.status === 200 && parentToken, 'Parent logs in');

  const adminId = adminLogin.data?.user?.id;
  const [[{ m: activityStart }]] = await withDb((conn) => conn.query('SELECT COALESCE(MAX(id), 0) AS m FROM activity_logs'));

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
            // best-effort cleanup
          }
        }
      }
      await withDb((conn) => conn.query('DELETE FROM backups WHERE id = ANY(?::int[])', [createdBackupIds]));
    }
    for (const file of fixtureFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  try {
    // --- Admin-only enforcement ---
    console.log('\nAdmin-only:');

    const teacherList = await request('GET', '/api/backups', { token: teacherToken });
    assert(teacherList.status === 403, 'Teacher cannot list backups (403)');

    const parentCreate = await request('POST', '/api/backups', { token: parentToken });
    assert(parentCreate.status === 403, 'Parent cannot create a backup (403)');

    const teacherDownload = await request('GET', '/api/backups/1/download', { token: teacherToken });
    assert(teacherDownload.status === 403, 'Teacher cannot download a backup (403)');

    const teacherDelete = await request('DELETE', '/api/backups/1', { token: teacherToken });
    assert(teacherDelete.status === 403, 'Teacher cannot delete a backup (403)');

    // --- Create: a real COPY archive ---
    console.log('\nCreate (a real COPY archive):');

    const create = await request('POST', '/api/backups', { token: adminToken });
    const created = create.data?.backup;
    assert(
      create.status === 201 && /^parents_portal_\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?\.zip$/.test(created?.filename || ''),
      'POST /api/backups returns 201 with a parents_portal_<date>_<time>.zip file name'
    );
    const backupId = created?.id;
    const filePath = created?.file_path;
    if (backupId) createdBackupIds.push(backupId);

    assert(typeof created?.file_size === 'number' && created.file_size > 0, 'file_size is a positive number');
    assert(filePath && fs.existsSync(filePath), 'The archive exists on disk at file_path');
    assert(created?.engine === 'postgresql' && created?.format === 'copy-archive', 'The row says engine postgresql, format copy-archive');

    if (filePath && fs.existsSync(filePath)) {
      const bytes = fs.readFileSync(filePath);
      assert(bytes.length === created.file_size, 'file_size equals the archive size on disk');
      assert(bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'The file is a zip archive');

      const members = await readZip(filePath);
      let manifest = null;
      try {
        manifest = JSON.parse(members.get(archive.MANIFEST_MEMBER).toString('utf8'));
      } catch {
        manifest = null;
      }
      const keys = manifest ? Object.keys(manifest) : [];
      assert(
        manifest &&
          manifest.format === archive.ARCHIVE_FORMAT &&
          manifest.format_version === archive.ARCHIVE_FORMAT_VERSION &&
          manifest.engine === 'postgresql' &&
          typeof manifest.server_version === 'string' &&
          manifest.server_version.length > 0,
        'The manifest names the format, its version, the engine and the PostgreSQL version'
      );
      assert(
        keys[keys.length - 1] === 'completed_at' && !Number.isNaN(Date.parse(manifest?.completed_at)),
        'completed_at is a date and the manifest’s last key'
      );

      const [liveTables] = await withDb((conn) =>
        conn.query(
          `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'portal' AND c.relkind = 'r' ORDER BY c.relname`
        )
      );
      const archived = liveTables.map((t) => t.name).filter((t) => t !== 'backups' && t !== 'auth_codes');
      const expectedMembers = [archive.MANIFEST_MEMBER, ...archived.map((t) => `data/${t}.csv`)].sort();
      assert(
        liveTables.length === 26 && JSON.stringify([...members.keys()].sort()) === JSON.stringify(expectedMembers),
        'One member per table except backups and auth_codes (24 of 26), the manifest, and nothing else'
      );
      assert(
        !members.has('data/backups.csv') &&
          !members.has('data/auth_codes.csv') &&
          JSON.stringify((manifest?.excluded_tables || []).map((t) => t.name).sort()) === JSON.stringify(['auth_codes', 'backups']),
        'No member for backups or auth_codes, and the manifest names exactly those two as excluded'
      );

      const listed = manifest?.tables || [];
      assert(
        listed.length === archived.length &&
          listed.every((t) => {
            const data = members.get(t.member);
            return data && data.length === t.bytes && sha256(data) === t.sha256;
          }),
        'Every member’s bytes and SHA-256 equal the manifest’s'
      );
      assert(
        listed.every((t) => {
          const data = members.get(t.member);
          return data && csvRecords(data) - 1 === t.rows;
        }),
        'Every member holds exactly the row count its manifest entry gives'
      );

      const [columnRows] = await withDb((conn) =>
        conn.query(
          `SELECT c.relname AS name, string_agg(a.attname::text, ',' ORDER BY a.attnum) AS cols
             FROM pg_catalog.pg_attribute a
             JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'portal' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
            GROUP BY c.relname`
        )
      );
      const liveColumns = new Map(columnRows.map((r) => [r.name, r.cols]));
      assert(
        listed.every((t) => {
          const data = members.get(t.member);
          const header = data ? data.toString('utf8').split('\n', 1)[0] : '';
          return header === liveColumns.get(t.table) && t.columns.join(',') === liveColumns.get(t.table);
        }),
        'Every member’s header row is its table’s columns, in the table’s order'
      );

      const [[reference]] = await withDb((conn) =>
        conn.query(
          'SELECT (SELECT COUNT(*) FROM subjects) AS subjects, (SELECT COUNT(*) FROM sections) AS sections, (SELECT COUNT(*) FROM transmutation_table) AS transmutation'
        )
      );
      const rowsOf = (table) => (listed.find((t) => t.table === table) || {}).rows;
      assert(
        rowsOf('subjects') === reference.subjects &&
          rowsOf('sections') === reference.sections &&
          rowsOf('transmutation_table') === reference.transmutation,
        'The reference tables (subjects, sections, transmutation) hold exactly the live row counts'
      );

      const fp = manifest?.schema_fingerprint || {};
      const { sha256: claimed, ...fpBody } = fp;
      const live = await liveFingerprint();
      assert(
        claimed === sha256(archive.canonical(fpBody)) && claimed === live.sha256 && archive.fingerprintDifferences(fp, live).length === 0,
        'The schema fingerprint matches its own hash and this database’s, computed again now'
      );

      const nextOf = new Map((manifest?.sequences || []).map((s) => [s.table, s.next_value]));
      assert(
        listed.filter((t) => t.max_id !== null).every((t) => nextOf.get(t.table) >= t.max_id + 1) &&
          nextOf.has('backups') &&
          nextOf.has('auth_codes'),
        'Every identity sequence is recorded (backups and auth_codes included), each ahead of its table’s highest id'
      );

      const [[{ m: liveActivityMax }]] = await withDb((conn) => conn.query('SELECT MAX(id) AS m FROM activity_logs'));
      const activity = listed.find((t) => t.table === 'activity_logs');
      assert(activity && activity.max_id !== null && activity.max_id <= liveActivityMax, 'activity_logs’ highest id in the archive is at most the live one');
    }

    // --- Filename collision guard ---
    console.log('\nFilename collision guard:');

    const create2 = await request('POST', '/api/backups', { token: adminToken });
    const backupId2 = create2.data?.backup?.id;
    if (backupId2) createdBackupIds.push(backupId2);
    assert(
      create2.status === 201 && create2.data?.backup?.filename !== created?.filename,
      'A second backup in quick succession gets a different file name'
    );
    assert(
      filePath && fs.existsSync(filePath) && fs.statSync(filePath).size === created.file_size,
      'The first backup’s file is untouched by the second'
    );

    // --- List ---
    console.log('\nList:');

    const tail = `${Date.now()}`;
    const mysqlFixtureName = `parents_portal_2026-01-01_000000-${tail}.sql`;
    const mysqlFixturePath = path.join(BACKUPS_DIR, mysqlFixtureName);
    fs.writeFileSync(mysqlFixturePath, '-- a MySQL-era fixture written by test:backups\n');
    fixtureFiles.push(mysqlFixturePath);
    const [mysqlRow] = await withDb((conn) =>
      conn.query('INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?) RETURNING id', [
        mysqlFixtureName,
        mysqlFixturePath,
        fs.statSync(mysqlFixturePath).size,
        adminId,
      ])
    );
    createdBackupIds.push(mysqlRow.insertId);
    const orphanName = `parents_portal_2026-01-01_000001-${tail}.zip`;
    const orphanPath = path.join(BACKUPS_DIR, orphanName);
    if (filePath && fs.existsSync(filePath)) fs.copyFileSync(filePath, orphanPath);
    fixtureFiles.push(orphanPath);

    const list = await request('GET', '/api/backups?limit=200', { token: adminToken });
    const listEntry = (list.data?.backups || []).find((b) => b.id === backupId);
    assert(list.status === 200 && listEntry, 'GET /api/backups includes the new backup');
    assert(listEntry?.file_exists === true, 'file_exists is true for a backup on disk');
    assert('created_by_name' in (listEntry || {}), 'Each row carries created_by_name');
    assert(listEntry?.engine === 'postgresql' && listEntry?.format === 'copy-archive', 'An archive row is listed as postgresql / copy-archive');
    const mysqlEntry = (list.data?.backups || []).find((b) => b.id === mysqlRow.insertId);
    assert(mysqlEntry?.engine === 'mysql' && mysqlEntry?.format === 'mysqldump', 'A .sql row is listed as a MySQL-era mysqldump');
    const orphan = (list.data?.orphaned_files || []).find((f) => f.filename === orphanName);
    assert(orphan && orphan.engine === 'postgresql' && orphan.format === 'copy-archive', 'A .zip on disk with no row is listed under orphaned_files, with its format');

    // --- Pagination contract (2026-09-19, utils/pagination.js): every list
    // carries page { limit, offset, total, has_more }; limit default 50, max
    // 200; sort against an allow-list. Invariants only — never an exact count
    // on a table the application also writes to. orphaned_files is NOT paged:
    // it is the disk minus every row, so it must not shrink with the page.
    // Run while this run's three rows exist, so offset=1 always has a row.
    console.log('\nPagination:');
    const qs = (urlPath, q) => `${urlPath}${urlPath.includes('?') ? '&' : '?'}${q}`;
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
    async function checkPage(urlPath, token, key, { sort, field, idField = 'id' }) {
      const first = await request('GET', urlPath, { token });
      const rows = first.data?.[key] || [];
      const page = first.data?.page;
      assert(
        first.status === 200 && page && page.limit === 50 && page.offset === 0 && Number.isInteger(page.total),
        `${urlPath}: page defaults to limit 50, offset 0, with a total`
      );
      assert(
        rows.length <= 50 && page?.has_more === (page?.total > 50) && (page?.has_more || rows.length === page?.total),
        `${urlPath}: has_more matches the total, and a last page holds every row`
      );
      const one = await request('GET', qs(urlPath, 'limit=1'), { token });
      assert(
        one.status === 200 &&
          (one.data?.[key] || []).length === Math.min(1, page?.total ?? 0) &&
          one.data?.page?.has_more === (page?.total > 1),
        `${urlPath}: limit=1 returns one row and says whether there is more`
      );
      const second = await request('GET', qs(urlPath, 'limit=1&offset=1'), { token });
      assert(
        (page?.total ?? 0) >= 2 && second.status === 200 && second.data?.[key]?.[0]?.[idField] !== one.data?.[key]?.[0]?.[idField],
        `${urlPath}: offset=1 returns a different row`
      );
      const bad = await Promise.all(
        ['limit=0', 'limit=201', 'offset=-1', 'limit=abc', `sort=${sort}_not_a_column`, 'order=up'].map((q) =>
          request('GET', qs(urlPath, q), { token })
        )
      );
      assert(bad.every((r) => r.status === 400), `${urlPath}: a bad limit, offset, sort or order is a 400, never a 500`);
      assert(new RegExp(`${sort}`).test(bad[4].data?.message || ''), `${urlPath}: an unknown sort names the allowed columns`);
      const sorted = await request('GET', qs(urlPath, `sort=${sort}&order=desc`), { token });
      assert(sorted.status === 200 && ordered(sorted.data?.[key] || [], field), `${urlPath}: sort=${sort}&order=desc comes back in that order`);
      return first;
    }

    const fullList = await checkPage('/api/backups', adminToken, 'backups', { sort: 'created_at', field: 'created_at' });
    const onePage = await request('GET', '/api/backups?limit=1', { token: adminToken });
    assert(
      onePage.status === 200 &&
        JSON.stringify((onePage.data?.orphaned_files || []).map((f) => f.filename).sort()) ===
          JSON.stringify((fullList.data?.orphaned_files || []).map((f) => f.filename).sort()),
      'orphaned_files is the same list on every page (the disk minus every row, never paged)'
    );

    // --- Download ---
    console.log('\nDownload:');

    const download = await request('GET', `/api/backups/${backupId}/download`, { token: adminToken, raw: true });
    assert(
      download.status === 200 && download.buffer.length === created?.file_size,
      'Download returns 200 with exactly file_size bytes'
    );
    assert(
      filePath && fs.existsSync(filePath) && sha256(download.buffer) === sha256(fs.readFileSync(filePath)),
      'The downloaded bytes are the archive on disk'
    );

    const downloadUnknown = await request('GET', '/api/backups/999999/download', { token: adminToken });
    assert(downloadUnknown.status === 404, 'Download of a nonexistent backup returns 404');

    const downloadBadId = await request('GET', '/api/backups/abc/download', { token: adminToken });
    assert(downloadBadId.status === 400, 'Download with a non-numeric id returns 400');

    // --- Missing-file handling (second backup, file removed outside the API) ---
    console.log('\nMissing-file handling:');

    const filePath2 = create2.data?.backup?.file_path;
    if (filePath2 && fs.existsSync(filePath2)) {
      fs.unlinkSync(filePath2);
    }

    const downloadMissing = await request('GET', `/api/backups/${backupId2}/download`, { token: adminToken });
    assert(
      downloadMissing.status === 404 && /missing from disk/i.test(downloadMissing.data?.message || ''),
      'Download of a backup whose file is gone returns 404 saying it is missing from disk'
    );

    const listAfterMissing = await request('GET', '/api/backups?limit=200', { token: adminToken });
    const listEntry2 = (listAfterMissing.data?.backups || []).find((b) => b.id === backupId2);
    assert(listEntry2?.file_exists === false, 'file_exists is false once the file is gone');

    const deleteMissingFile = await request('DELETE', `/api/backups/${backupId2}`, { token: adminToken });
    assert(
      deleteMissingFile.status === 200 && /already missing/i.test(deleteMissingFile.data?.message || ''),
      'Deleting a backup whose file is gone still deletes the row, and says so'
    );
    createdBackupIds.splice(createdBackupIds.indexOf(backupId2), 1);

    const [afterMissingDelete] = await withDb((conn) => conn.query('SELECT id FROM backups WHERE id = ?', [backupId2]));
    assert(afterMissingDelete.length === 0, 'The row is gone after that delete');

    // --- Normal delete ---
    console.log('\nDelete:');

    const deleteNonNumeric = await request('DELETE', '/api/backups/abc', { token: adminToken });
    assert(deleteNonNumeric.status === 400, 'DELETE /api/backups/abc returns 400, not 500');

    const deleteUnknown = await request('DELETE', '/api/backups/999999', { token: adminToken });
    assert(deleteUnknown.status === 404, 'DELETE of a nonexistent backup returns 404');

    const del = await request('DELETE', `/api/backups/${backupId}`, { token: adminToken });
    assert(del.status === 200 && del.data?.message === 'Backup deleted.', 'DELETE removes the backup and answers "Backup deleted."');
    assert(!fs.existsSync(filePath), 'The archive is gone from disk after the delete');
    createdBackupIds.splice(createdBackupIds.indexOf(backupId), 1);

    // --- Activity logging ---
    console.log('\nActivity logging:');

    const [logRows] = await withDb((conn) =>
      conn.query('SELECT action FROM activity_logs WHERE user_id = ? AND id > ? AND action = ANY(?::text[]) ORDER BY id', [
        adminId,
        activityStart,
        ['create_backup', 'download_backup', 'delete_backup'],
      ])
    );
    const loggedActions = logRows.map((r) => r.action);
    assert(loggedActions.includes('create_backup'), 'create_backup is logged');
    assert(loggedActions.includes('download_backup'), 'download_backup is logged');
    assert(loggedActions.includes('delete_backup'), 'delete_backup is logged');

    // --- The .partial safeguard (fix/server-reliability, 2026-09-30) ---
    // An archive is written as <name>.zip.partial and renamed only when it is
    // complete and read back. Proved on a SECOND API process on its own port,
    // started with every transaction READ ONLY, so its catalog INSERT fails
    // for certain after the archive was written — the running server under
    // test is never reconfigured. It takes this run's admin token (the same
    // secret), so it never has to sign anyone in. The same child proves the
    // startup sweep: a stale .partial planted before it starts is gone once it
    // is up. Then a direct call: an archive whose third COPY fails on the
    // server half way leaves nothing behind either.
    console.log('\nThe .partial safeguard:');
    const { spawn, execSync } = require('child_process');
    assert(
      !fs.readdirSync(BACKUPS_DIR).some((n) => n.endsWith('.partial')),
      'No .partial is left behind by this run’s own backups'
    );
    const planted = path.join(BACKUPS_DIR, `pp_stale_${Date.now()}.zip.partial`);
    fs.writeFileSync(planted, '');
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    fs.utimesSync(planted, stale, stale);
    const FAIL_PORT = Number(process.env.FAIL_PORT || 5002);
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(FAIL_PORT), PGOPTIONS: '-c default_transaction_read_only=on' },
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
      assert(up, `A second API with read-only transactions starts on ${FAIL_PORT}`);
      assert(!fs.existsSync(planted), 'Its startup sweep removed a stale .partial planted before it started');
      const before = new Set(fs.readdirSync(BACKUPS_DIR));
      const failRes = await request('POST', '/api/backups', { token: adminToken, base: `http://127.0.0.1:${FAIL_PORT}` });
      assert(failRes.status === 500, 'Its create answers 500 when the catalog row cannot be written', `got ${failRes.status}`);
      const leftover = fs.readdirSync(BACKUPS_DIR).filter((n) => !before.has(n));
      assert(leftover.length === 0, 'That failed create left neither a .zip nor a .partial', leftover.join(', '));
    } finally {
      if (fs.existsSync(planted)) fs.unlinkSync(planted);
      try {
        if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
        else child.kill('SIGTERM');
      } catch {
        // already gone
      }
    }

    const real = new Client(dbConfig());
    await real.connect();
    let copies = 0;
    const failing = {
      query(q, params) {
        if (q && typeof q.submit === 'function' && /^COPY \(/.test(q.text || '')) {
          copies += 1;
          if (copies === 3) {
            // Not constant-folded (g varies), so it fails at the fourth row.
            q.text = 'COPY (SELECT 100 / (4 - g) AS v FROM pg_catalog.generate_series(1, 100000) AS g) TO STDOUT WITH (FORMAT csv, HEADER true)';
          }
        }
        return real.query(q, params);
      },
    };
    const brokenPath = path.join(BACKUPS_DIR, `pp_broken_${Date.now()}.zip.partial`);
    let threw = null;
    try {
      await archive.writeArchive(failing, brokenPath);
    } catch (error) {
      threw = error;
    } finally {
      await real.end();
    }
    assert(threw && threw.code === '22012' && copies === 3, 'An archive whose third COPY fails on the server half way rejects with that error');
    assert(!fs.existsSync(brokenPath), 'and leaves no file behind');
  } finally {
    await cleanup();
    await policy.cleanup();
  }

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err && (err.code || err.message));
  process.exit(1);
});
