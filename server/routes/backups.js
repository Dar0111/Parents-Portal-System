const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');
const { comparePassword } = require('../utils/password');

const router = express.Router();

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function ensureBackupsDir() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// <prefix>_YYYY-MM-DD_HHmmss.sql — no colons/T/Z from toISOString(), no spaces.
// prefix distinguishes a regular backup ("parents_portal") from an automatic
// pre-restore safety dump ("pre_restore") — same machinery, different name.
function formatBackupFilename(prefix) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${date}_${time}.sql`;
}

// The format above is second-granularity, and filename has no UNIQUE
// constraint — two backups requested within the same wall-clock second would
// otherwise collide on disk, with the second dump silently overwriting the
// first backup's file while both rows stayed in the table (the first row's
// file_size would then be wrong, and its content would actually be the
// second dump's). Disambiguate with a numeric suffix rather than let that
// happen.
function reserveBackupPath(prefix) {
  const base = formatBackupFilename(prefix);
  let filename = base;
  let attempt = 1;
  while (fs.existsSync(path.join(BACKUPS_DIR, filename))) {
    attempt += 1;
    filename = base.replace(/\.sql$/, `-${attempt}.sql`);
  }
  return { filename, filePath: path.join(BACKUPS_DIR, filename) };
}

// Streams mysqldump's stdout straight to disk rather than buffering the whole
// dump in memory. Password goes through MYSQL_PWD on the child's own env only
// — never on argv, where it would be visible to any user via Task Manager's
// command-line column, `wmic process get commandline`, `ps`, etc.
function runMysqldump(outputPath) {
  return new Promise((resolve, reject) => {
    const bin = process.env.MYSQLDUMP_PATH || 'mysqldump';
    const args = [
      '--single-transaction',
      '--databases',
      process.env.DB_NAME || 'parents_portal',
      '-h',
      process.env.DB_HOST || 'localhost',
      '-P',
      String(process.env.DB_PORT || 3306),
      '-u',
      process.env.DB_USER || 'root',
    ];

    const child = spawn(bin, args, {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' },
    });

    const out = fs.createWriteStream(outputPath);
    let stderr = '';
    let settled = false;

    child.stdout.pipe(out);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'mysqldump was not found. Install the MySQL command-line client and ensure its bin ' +
              'directory is on PATH, or set MYSQLDUMP_PATH in server/.env to its full path ' +
              '(e.g. C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe).'
          )
        );
      } else {
        reject(err);
      }
    });

    out.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      out.close(() => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `mysqldump exited with code ${code}.`));
        }
      });
    });
  });
}

// Shared by POST / (a regular manual backup) and the restore endpoint's
// mandatory safety dump — same machinery, only the filename prefix and
// who's attributed as creator differ. Returns the inserted backups row, or
// throws (with any partial file cleaned up) on any failure.
async function createBackupRecord({ prefix, createdBy }) {
  ensureBackupsDir();
  const { filename, filePath } = reserveBackupPath(prefix);

  try {
    await runMysqldump(filePath);

    const stats = fs.statSync(filePath);
    if (!stats.size) {
      fs.unlinkSync(filePath);
      throw new Error('mysqldump produced an empty file.');
    }

    const [result] = await pool.query(
      'INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?)',
      [filename, filePath, stats.size, createdBy]
    );

    const [rows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(createdBy, 'create_backup', `Created backup ${filename}`);

    return rows[0];
  } catch (error) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup failure — the dump error itself is what we report
      }
    }
    throw error;
  }
}

// GET /api/backups — list, newest first
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS created_by_name
       FROM backups b
       LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC`
    );

    const backups = rows.map((row) => ({ ...row, file_exists: fs.existsSync(row.file_path) }));

    return res.json({ success: true, backups });
  } catch (error) {
    console.error('List backups error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch backups.' });
  }
});

// POST /api/backups — create. Row is inserted only after the dump succeeds and
// the file is confirmed non-empty; a failed dump leaves no row and no stray file.
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const backup = await createBackupRecord({ prefix: 'parents_portal', createdBy: req.user.id });
    return res.status(201).json({ success: true, message: 'Backup created.', backup });
  } catch (error) {
    console.error('Create backup error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create backup.' });
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
    const [rows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
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
        console.error('Download backup stream error:', err);
      }
    });
  } catch (error) {
    console.error('Download backup error:', error);
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
    const [rows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
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
    console.error('Delete backup error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete backup.' });
  }
});

// POST /api/backups/:id/restore — admin only. Drops and recreates the whole
// database from a tracked backup. See CLAUDE.md's "RESTORE — required before
// building" for the full reasoning behind every guard below. Source
// validation is structural, not a separate check: the only input is
// backups.id — there is no file upload path and no arbitrary filename
// parameter anywhere in this handler.
router.post('/:id/restore', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: 'Invalid backup id.' });
  }

  const { password, confirm_filename } = req.body;
  let backup;

  try {
    // Load the row first. The spec this was built from listed this after
    // the password/filename checks, but confirm_filename can't be verified
    // without knowing the real filename — reordered with that flagged.
    // No security cost: any admin can already see every backup's filename
    // for free via GET /api/backups, so a 404 here before step-up auth
    // reveals nothing that wasn't already visible.
    const [backupRows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [id]);
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

    // Step-up auth: an open admin session is not authorization for a total,
    // irreversible data wipe on its own.
    if (typeof password !== 'string' || !password) {
      return res.status(401).json({ success: false, message: 'password is required.' });
    }
    const [passwordRows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const validPassword = passwordRows.length > 0 && (await comparePassword(password, passwordRows[0].password));
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    // Type-the-name confirmation. A dialog someone clicks through is not a
    // safeguard — naming both values so a typo is obvious, not just "bad request".
    if (confirm_filename !== backup.filename) {
      return res.status(400).json({
        success: false,
        message: `confirm_filename does not match. You entered "${
          confirm_filename || ''
        }", the backup's filename is "${backup.filename}".`,
      });
    }
  } catch (error) {
    console.error('Restore pre-flight error:', error);
    return res.status(500).json({ success: false, message: 'Failed to prepare restore.' });
  }

  // Past this point, every failure gets its own distinct message — the
  // pre-flight checks above are cheap to retry; what follows is not.

  // Safety dump of the CURRENT state, before touching anything. If this
  // fails for any reason, abort outright and change nothing. This is the
  // single most important line in the feature: a restore with no way back
  // is not acceptable.
  let safetyBackup;
  try {
    safetyBackup = await createBackupRecord({ prefix: 'pre_restore', createdBy: req.user.id });
  } catch (error) {
    console.error('Restore aborted — safety dump failed:', error);
    return res.status(500).json({
      success: false,
      message: `Restore aborted: the pre-restore safety backup failed (${error.message}). Nothing was changed.`,
    });
  }

  // The actual restore. A dedicated one-off connection, never the shared
  // pool — its pooled connections would error once the database they're
  // attached to is dropped and recreated underneath them. multipleStatements
  // is safe specifically because this SQL always comes from our own
  // mysqldump output via a tracked backups row, never from user-supplied
  // text — if this endpoint ever took an uploaded file instead, this would
  // stop being safe.
  try {
    const dumpSql = fs.readFileSync(backup.file_path, 'utf8');
    const restoreConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });
    try {
      await restoreConnection.query(dumpSql);
    } finally {
      await restoreConnection.end().catch(() => {});
    }
  } catch (error) {
    // MySQL does not support transactional DDL — DROP DATABASE / CREATE
    // DATABASE auto-commit, so there is no rollback if a later statement in
    // the dump fails. This is the one failure mode that is not "nothing
    // changed" — say so plainly, and point at the safety dump by name,
    // since this is the message someone reads while panicking.
    console.error('Restore error — database may be partially restored:', error);
    return res.status(500).json({
      success: false,
      message:
        `Restore failed partway through (${error.message}). MySQL does not support transactional DDL, ` +
        `so the database may now be in a partially restored state — manual recovery may be needed. ` +
        `A safety backup of the pre-restore state was created first: ${safetyBackup.filename}.`,
    });
  }

  // The restore succeeded. Reset the shared pool so the rest of the app gets
  // fresh connections against the now-restored database — best-effort, the
  // actual data restore already succeeded regardless of this step.
  try {
    await pool.resetPool();
  } catch (error) {
    console.error('Pool reset after restore failed:', error);
  }

  // Every currently-active JWT may now point at a user_id that no longer
  // means the same person. Everyone logs in again — that is the expected
  // outcome of this operation, not a bug.
  try {
    await pool.query(
      `INSERT INTO auth_security_state (id, token_valid_after) VALUES (1, NOW())
       ON DUPLICATE KEY UPDATE token_valid_after = VALUES(token_valid_after)`
    );
    await logActivity(req.user.id, 'restore_backup', `Restored database from backup "${backup.filename}"`);
  } catch (error) {
    console.error('Post-restore bookkeeping failed (the restore itself succeeded):', error);
    return res.json({
      success: true,
      message:
        'Database restored, but marking sessions invalid failed — see server logs. Treat all existing ' +
        'sessions as suspect until auth_security_state.token_valid_after is confirmed set.',
      restored_from: { id: backup.id, filename: backup.filename },
      safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
    });
  }

  return res.json({
    success: true,
    message: 'Database restored. All sessions are now invalid — everyone, including you, must log in again.',
    restored_from: { id: backup.id, filename: backup.filename },
    safety_backup: { id: safetyBackup.id, filename: safetyBackup.filename },
  });
});

module.exports = router;
