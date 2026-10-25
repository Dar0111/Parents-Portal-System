const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { comparePassword } = require('../utils/password');
const { readListParams, pageMeta } = require('../utils/pagination');
const archive = require('../utils/backupArchive');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

// BACKUP & RESTORE ON POSTGRESQL (Phase 3, commit 6 — migration/docs/04, the
// owner's P4 with Q3 (a) and Q4 (a), 2026-10-25). A backup is a `.zip` COPY
// archive written by the API itself (utils/backupArchive.js has the format and
// the one-transaction restore); the catalog, the guards and the replies are
// the ones the MySQL version had, except where PostgreSQL changes what is
// true: a failed restore now changes NOTHING (it is one transaction), live
// sockets are dropped, and a MySQL-era `.sql` row is listed with its engine
// and format and restored by the recovery procedure, not from this page.

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function ensureBackupsDir() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// AN ARCHIVE IS WRITTEN AS `<name>.zip.partial` AND RENAMED TO `.zip` ONLY
// WHEN IT IS COMPLETE AND HAS BEEN READ BACK (fix/server-reliability,
// 2026-09-30, kept for the archive). A process that dies mid-write never
// reaches the cleanup below, and a `.partial` is by construction never a
// backup: the list and the restore endpoint only ever see `.zip` and `.sql`,
// so removing a `.partial` does not touch the rule that no backup file is
// deleted. The MySQL-era `.sql.partial` is swept the same way.
const PARTIAL_SUFFIX = '.partial';
const PARTIAL_PATTERN = /\.(zip|sql)\.partial$/;
const BACKUP_FILE_PATTERN = /\.(zip|sql)$/;

// This process has no archive in flight while its module loads, but ANOTHER
// server process on the same directory might (the dev API beside a test or
// loop server). An archive takes seconds, so only a `.partial` untouched for
// over a minute is treated as left by a process that died. Each one is
// logged by name before it goes.
const PARTIAL_STALE_MS = 60 * 1000;
function sweepPartials() {
  try {
    ensureBackupsDir();
    for (const name of fs.readdirSync(BACKUPS_DIR).filter((n) => PARTIAL_PATTERN.test(n))) {
      const full = path.join(BACKUPS_DIR, name);
      if (Date.now() - fs.statSync(full).mtimeMs < PARTIAL_STALE_MS) continue;
      fs.unlinkSync(full);
      console.log(`Removed an incomplete backup left by a stopped process: ${name}`);
    }
  } catch (error) {
    console.error('Backup .partial sweep failed:', error.code || error.message);
  }
}
sweepPartials();

// <prefix>_YYYY-MM-DD_HHmmss.zip — no colons/T/Z from toISOString(), no spaces.
// prefix distinguishes a regular backup ("parents_portal") from an automatic
// pre-restore safety archive ("pre_restore") — same machinery, different name.
function formatBackupFilename(prefix) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${date}_${time}.zip`;
}

// The format above is second-granularity, and filename has no UNIQUE
// constraint — two backups requested within the same wall-clock second would
// otherwise collide on disk, with the second archive silently overwriting the
// first backup's file while both rows stayed in the table. Disambiguate with a
// numeric suffix rather than let that happen.
function reserveBackupPath(prefix) {
  const base = formatBackupFilename(prefix);
  let filename = base;
  let attempt = 1;
  while (
    fs.existsSync(path.join(BACKUPS_DIR, filename)) ||
    fs.existsSync(path.join(BACKUPS_DIR, `${filename}${PARTIAL_SUFFIX}`))
  ) {
    attempt += 1;
    filename = base.replace(/\.zip$/, `-${attempt}.zip`);
  }
  return { filename, filePath: path.join(BACKUPS_DIR, filename) };
}

// One connection outside the pool, as one role: the API's own (portal_app) to
// write an archive, which needs SELECT only; the owner (portal_migrate, the
// PG_MIGRATE_* keys) to restore one, which needs TRUNCATE and ALTER SEQUENCE — exactly
// what portal_app is not given.
async function openClient(which) {
  // its own 'error' listener (config/db.js guardClient): a socket that dies
  // mid-archive or mid-restore must fail the request, not end the process
  const client = pool.guardClient(new Client(pool.settings(which)), `${which === 'migrate' ? 'restoring' : 'archiving'}`);
  await client.connect();
  return client;
}

function withFormat(row) {
  return { ...row, ...archive.describeFormat(row.filename) };
}

// Shared by POST / (a regular manual backup) and the restore endpoint's
// mandatory safety archive — same machinery, only the filename prefix and
// who's attributed as creator differ. The row is inserted only after the file
// is complete, renamed, and read back whole (every member against its
// checksum), so a backup's file can never contain its own row. Returns the
// inserted row, or throws with the file cleaned up.
async function createBackupRecord({ prefix, createdBy }) {
  ensureBackupsDir();
  const { filename, filePath } = reserveBackupPath(prefix);
  const partialPath = `${filePath}${PARTIAL_SUFFIX}`;

  try {
    const client = await openClient('runtime');
    try {
      await archive.writeArchive(client, partialPath);
    } finally {
      await client.end().catch(() => {});
    }
    await archive.inspectArchive(partialPath);
    fs.renameSync(partialPath, filePath);
    const stats = fs.statSync(filePath);

    const { rows: inserted } = await pool.query(
      'INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?) RETURNING id',
      [filename, filePath, stats.size, createdBy]
    );
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [inserted[0].id]);
    await logActivity(createdBy, 'create_backup', `Created backup ${filename}`);

    return withFormat(rows[0]);
  } catch (error) {
    // Both names: the `.partial` if the archive itself failed, the `.zip` if
    // the rename happened and a later step (the INSERT) failed.
    for (const p of [partialPath, filePath]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore cleanup failure — the archive error itself is what we report
        }
      }
    }
    throw error;
  }
}

// GET /api/backups — list, newest first. Each row carries its engine and
// format (`.zip` = a PostgreSQL archive, `.sql` = a MySQL-era mysqldump).
// Also reconciles the table against server/backups/ and surfaces any backup
// file with no matching row as orphaned_files — read-only, never
// auto-inserted: adopting one would fabricate a created_by no one can vouch
// for. See CLAUDE.md's RESTORE section for how the orphans were handled.
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const list = readListParams(req.query, {
    sortable: { filename: 'b.filename', created_at: 'b.created_at', file_size: 'b.file_size' },
    defaultOrderBy: 'b.created_at DESC',
    tiebreaker: 'b.id DESC',
  });
  if (!list.ok) {
    return res.status(400).json({ success: false, message: list.message });
  }

  try {
    const { rows: counted } = await pool.query('SELECT COUNT(*) AS total FROM backups');
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS created_by_name
       FROM backups b
       LEFT JOIN users u ON u.id = b.created_by
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [list.limit, list.offset]
    );

    const backups = rows.map((row) => ({ ...withFormat(row), file_exists: fs.existsSync(row.file_path) }));

    // orphaned_files is NOT paginated: it is the disk minus EVERY row, not
    // minus this page, so the known set is read separately from the table.
    ensureBackupsDir();
    const { rows: allNames } = await pool.query('SELECT filename FROM backups');
    const knownFilenames = new Set(allNames.map((row) => row.filename));
    const orphaned_files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((name) => BACKUP_FILE_PATTERN.test(name) && !knownFilenames.has(name))
      .map((filename) => {
        const filePath = path.join(BACKUPS_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          file_path: filePath,
          file_size: stats.size,
          mtime: stats.mtime,
          ...archive.describeFormat(filename),
        };
      });

    return res.json({
      success: true,
      backups,
      orphaned_files,
      page: pageMeta({ limit: list.limit, offset: list.offset, total: counted[0].total }),
    });
  } catch (error) {
    console.error('List backups error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch backups.' });
  }
});

// POST /api/backups — create. The row is inserted only after the archive is
// complete and has been read back; a failed archive leaves no row and no file.
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  // A restore in this process is replacing every table (P3-C-R2 Phase H,
  // backup-1). The archive's own locks would make it wait for that restore
  // and then hold the restored state — but while the restore is still making
  // its safety archive, a manual one holding its locks could make the
  // restore's lock wait (15 s) fail. So it is refused here, saying why.
  if (restoreRunning) {
    return res.status(409).json({
      success: false,
      code: 'RESTORE_RUNNING',
      message: 'A restore is running. No backup was made; try again when it has finished.',
    });
  }
  try {
    const backup = await createBackupRecord({ prefix: 'parents_portal', createdBy: req.user.id });
    return res.status(201).json({ success: true, message: 'Backup created.', backup });
  } catch (error) {
    console.error('Create backup error:', error.code || error.message);
    return res.status(500).json({ success: false, message: `Failed to create backup (${archive.safeMessage(error)}).` });
  }
});

// GET /api/backups/:id/download — stream the file. This is the most sensitive
// action the API permits: every student's name, LRN, grades, attendance, and
// messages leaving in one portable file. Logged as its own distinct action.
router.get('/:id/download', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid backup id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
    const backup = rows[0];
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found.' });
    }

    if (!fs.existsSync(backup.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file is missing from disk. It may have been moved or deleted outside the API.',
      });
    }

    await logActivity(req.user.id, 'download_backup', `Downloaded backup ${backup.filename}`);

    return res.download(backup.file_path, backup.filename, (err) => {
      if (err) {
        console.error('Download backup stream error:', err.code || err.message);
      }
    });
  } catch (error) {
    console.error('Download backup error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to download backup.' });
  }
});

// DELETE /api/backups/:id — removes both the row and the file. If the file is
// already gone, the row is still deleted and the response says so.
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid backup id.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
    const backup = rows[0];
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found.' });
    }

    let fileWasMissing = false;
    try {
      fs.unlinkSync(backup.file_path);
    } catch (error) {
      if (error.code === 'ENOENT') {
        fileWasMissing = true;
      } else {
        throw error;
      }
    }

    await pool.query('DELETE FROM backups WHERE id = ?', [id]);
    await logActivity(req.user.id, 'delete_backup', `Deleted backup ${backup.filename}`);

    return res.json({
      success: true,
      message: fileWasMissing ? 'Backup record deleted. The file was already missing from disk.' : 'Backup deleted.',
    });
  } catch (error) {
    console.error('Delete backup error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete backup.' });
  }
});

// A refused restore attempt is logged, because the most destructive endpoint
// in the API should leave a trace when someone tries it and fails. Best
// effort: a failed log write must not turn a 400/403/409 into the pre-flight
// 500. The typed password and the typed file name are never written here —
// the response already shows the admin what they typed. A refusal made
// shortly before a SUCCESSFUL restore is newer than the archive restored
// from, so that restore rewinds it with the rest of activity_logs; it then
// survives only in the lost-entries count.
async function logRestoreRefusal(userId, filename, reason) {
  try {
    await logActivity(userId, 'restore_refused', `Restore of backup "${filename}" refused: ${reason}.`);
  } catch (error) {
    console.error('Could not log a refused restore attempt (refusal still returned):', error.code || error.message);
  }
}

const MYSQL_ERA_MESSAGE =
  'This is a MySQL-era backup (a mysqldump .sql file), made before the move to PostgreSQL. This page restores ' +
  'PostgreSQL archives (.zip) only; a MySQL-era file is restorable by the recovery procedure, run by hand ' +
  '(migration/docs/04_BACKUP_RESTORE_DESIGN.md §2b). Nothing was changed.';

// One restore at a time: a second would queue behind the first one's locks
// and then restore over it.
let restoreRunning = false;

// POST /api/backups/:id/restore — admin only. Replaces every table's rows with
// a tracked archive's, in ONE transaction. See CLAUDE.md's RESTORE section and
// migration/docs/04 for the reasoning behind every guard below. Source
// validation is structural, not a separate check: the only input is
// backups.id — there is no file upload path and no arbitrary filename
// parameter anywhere in this handler.
//
// EVERY CHECK BEFORE ANY WRITE: the row, the file, its format (a MySQL-era
// file is refused with the recovery procedure), the password re-entry, the
// typed file name, a complete and checksum-valid archive, and a schema
// fingerprint equal to the live one (a mismatch is refused, naming the
// difference). Only then the safety archive, and only then the transaction.
router.post('/:id/restore', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid backup id.' });
  }

  const { password, confirm_filename } = req.body || {};
  let backup;
  let inspection;

  try {
    // Load the row first: confirm_filename can't be verified without knowing
    // the real filename. No security cost: any admin can already see every
    // backup's filename via GET /api/backups, so a 404 here before step-up
    // auth reveals nothing that wasn't already visible.
    const { rows: backupRows } = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
    backup = backupRows[0];
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found.' });
    }
    if (!fs.existsSync(backup.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file is missing from disk. It may have been moved or deleted outside the API.',
      });
    }

    // The format is on the list already, so saying it before the step-up
    // reveals nothing and spares the admin a password for a file this page
    // cannot restore.
    const { engine } = archive.describeFormat(backup.filename);
    if (engine !== 'postgresql') {
      await logRestoreRefusal(req.user.id, backup.filename, engine === 'mysql' ? 'a MySQL-era backup (the recovery procedure only)' : 'not a backup archive');
      return res.status(409).json({ success: false, code: 'MYSQL_ERA_BACKUP', message: MYSQL_ERA_MESSAGE });
    }

    // Step-up auth: an open admin session is not authorization for a total
    // data replacement on its own.
    //
    // Never 401 here. The bearer token is valid — 401 would tell the client
    // the SESSION is dead, and the shared interceptor would log the admin
    // out on a typo. A missing password is a malformed request (400, like
    // every other missing required field in this API); a wrong one is a
    // well-formed request whose re-authentication failed, so the server
    // refuses the action with a reason (403, STAGE 4 FRONTEND CONVENTIONS §2).
    if (typeof password !== 'string' || !password) {
      await logRestoreRefusal(req.user.id, backup.filename, 'no password given');
      return res.status(400).json({ success: false, message: 'password is required.', field: 'password' });
    }
    const { rows: passwordRows } = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const validPassword = passwordRows.length > 0 && (await comparePassword(password, passwordRows[0].password));
    if (!validPassword) {
      await logRestoreRefusal(req.user.id, backup.filename, 'incorrect password');
      // `field` (2026-09-18): the client puts the message under the password
      // input instead of at the top of the modal body (§7c).
      return res.status(403).json({ success: false, message: 'Incorrect password.', field: 'password' });
    }

    // Type-the-name confirmation. A dialog someone clicks through is not a
    // safeguard — naming both values so a typo is obvious, not just "bad request".
    if (confirm_filename !== backup.filename) {
      await logRestoreRefusal(req.user.id, backup.filename, 'typed file name did not match');
      return res.status(400).json({
        success: false,
        message: `confirm_filename does not match. You entered "${
          confirm_filename || ''
        }", the backup's filename is "${backup.filename}".`,
        field: 'confirm_filename',
      });
    }

    // The archive, read whole: a complete manifest, every member against its
    // checksum, its records and its header.
    try {
      inspection = await archive.inspectArchive(backup.file_path);
    } catch (error) {
      if (!(error instanceof archive.ArchiveError)) throw error;
      await logRestoreRefusal(req.user.id, backup.filename, error.message);
      return res.status(409).json({ success: false, code: error.code, message: `Restore refused: ${error.message}. Nothing was changed.` });
    }

    // The schema it was made from must be this database's.
    const live = await withReadOnly((client) => archive.schemaFingerprint(client));
    const differences = archive.fingerprintDifferences(inspection.manifest.schema_fingerprint, live);
    if (differences.length) {
      await logRestoreRefusal(req.user.id, backup.filename, 'the archive was made from a different database schema');
      return res.status(409).json({
        success: false,
        code: 'SCHEMA_MISMATCH',
        message: `Restore refused: ${archive.describeDifferences(differences)}. Nothing was changed.`,
        differences,
      });
    }
  } catch (error) {
    console.error('Restore pre-flight error:', error.code || error.message);
    return res.status(500).json({ success: false, message: 'Failed to prepare restore.' });
  }

  if (restoreRunning) {
    // Logged like every other refusal of this endpoint (backup-3).
    await logRestoreRefusal(req.user.id, backup.filename, 'another restore was running');
    return res.status(409).json({ success: false, code: 'RESTORE_RUNNING', message: 'Another restore is running. Nothing was changed; try again when it has finished.' });
  }
  restoreRunning = true;
  try {
    // Past this point, every failure gets its own distinct message — the
    // pre-flight checks above are cheap to retry; what follows is not.

    // Safety archive of the CURRENT state, before touching anything. If this
    // fails for any reason, abort outright and change nothing. This is the
    // single most important line in the feature: a restore with no way back
    // is not acceptable.
    let safetyBackup;
    try {
      safetyBackup = await createBackupRecord({ prefix: 'pre_restore', createdBy: req.user.id });
    } catch (error) {
      console.error('Restore aborted — safety archive failed:', error.code || error.message);
      return res.status(500).json({
        success: false,
        message: `Restore aborted: the pre-restore safety backup failed (${archive.safeMessage(error)}). Nothing was changed.`,
      });
    }
    const safetyNote = `A safety backup of the pre-restore state was created first: ${safetyBackup.filename}.`;

    // The restore itself: one connection as the owner, one transaction.
    let result;
    let client;
    let outcomeNote = '';
    try {
      client = await openClient('migrate');
      result = await archive.restoreArchive(client, backup.file_path, inspection);
    } catch (error) {
      // The connection failed AT COMMIT (backup-2): this side cannot know
      // whether the restore committed, so the server is asked, on a fresh
      // connection, about the restore's own transaction id — never assumed.
      let outcome = null;
      if (error.outcomeUnknown) {
        try {
          const fresh = await openClient('migrate');
          try {
            outcome = await archive.transactionOutcome(fresh, error.outcomeUnknown.xid);
          } finally {
            await fresh.end().catch(() => {});
          }
        } catch (askError) {
          console.error('Could not ask the server what became of the restore:', askError.code || askError.message);
          outcome = 'unknown';
        }
      }
      if (outcome === 'committed') {
        // It committed: carry on as a restore that succeeded, saying so.
        result = error.outcomeUnknown.result;
        outcomeNote = ' The connection failed as the restore was committing; the database confirms it committed.';
      } else if (outcome === 'unknown') {
        console.error('Restore outcome unknown after the connection failed at COMMIT:', error.code || error.message);
        return res.status(500).json({
          success: false,
          code: 'RESTORE_OUTCOME_UNKNOWN',
          message:
            'The connection to the database failed as the restore was committing, and whether it committed could not be confirmed. ' +
            `Check the data before doing anything else, and do not run another restore until it is checked. ${safetyNote}`,
          safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
        });
      } else if (error instanceof archive.ArchiveError) {
        await logRestoreRefusal(req.user.id, backup.filename, error.message);
        return res.status(409).json({
          success: false,
          code: error.code,
          message: `Restore refused: ${error.message}. Nothing was changed — the restore was rolled back. ${safetyNote}`,
          safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
        });
      } else {
        // Rolled back — before COMMIT, or 'aborted' by the server's own word.
        console.error('Restore failed and was rolled back:', error.code || error.message);
        return res.status(500).json({
          success: false,
          message: `Restore failed (${archive.safeMessage(error)}). Nothing was changed — the restore was rolled back in full. ${safetyNote}`,
          safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
        });
      }
    } finally {
      if (client) await client.end().catch(() => {});
    }

    // COMMITTED. The cutoff was written inside the transaction, so no request
    // can be answered with a restored row on an old session. A socket that is
    // already open is not re-checked per event, so every one is closed now:
    // each client reconnects, and the handshake refuses its old token.
    try {
      const io = req.app.get('io');
      if (io) io.disconnectSockets(true);
    } catch (error) {
      console.error('Could not close the live sockets after a restore:', error.code || error.message);
    }

    // Written after the commit, so they survive rather than being wiped by
    // the thing they document. The lost-entries count is every activity row
    // above the archive's own highest id — this restore's own safety-archive
    // entry included — counted under the restore's locks, so it is exact.
    // Not tamper-proof: an admin with direct DB access could delete these
    // rows too. Not silent is still better than silent.
    let bookkeepingNote = '';
    try {
      await logActivity(req.user.id, 'restore_backup', `Restored database from backup "${backup.filename}"`);
      if (result.lost_activity_logs > 0) {
        const lost = result.lost_activity_logs;
        await logActivity(
          req.user.id,
          'restore_wiped_activity_logs',
          `This restore reverted activity_logs to the state captured in backup "${backup.filename}" ` +
            `(taken ${inspection.manifest.snapshot_at}). ${lost} activity_logs ${lost === 1 ? 'entry' : 'entries'} ` +
            `recorded after it — including this restore's own pre-restore safety-archive entry — ` +
            `${lost === 1 ? 'was' : 'were'} lost, not moved or archived.`
        );
      }
    } catch (error) {
      console.error('Post-restore activity log failed (the restore itself succeeded):', error.code || error.message);
      bookkeepingNote = ' The activity-log entries for this restore could not be written — see the server logs.';
    }

    return res.json({
      success: true,
      message: `Database restored. All sessions are now invalid — everyone, including you, must log in again.${outcomeNote}${bookkeepingNote}`,
      restored_from: { id: backup.id, filename: backup.filename },
      safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
      activity_logs_wiped: result.lost_activity_logs,
    });
  } finally {
    restoreRunning = false;
  }
});

// A short read-only transaction on a one-off connection as portal_app, for the
// catalog reads the fingerprint makes (an archive session needs a transaction).
async function withReadOnly(fn) {
  const client = await openClient('runtime');
  try {
    await client.query('BEGIN READ ONLY');
    await archive.useArchiveSession(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = router;
