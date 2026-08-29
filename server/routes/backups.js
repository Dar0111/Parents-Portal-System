const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parseId } = require('../utils/validateId');

const router = express.Router();

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function ensureBackupsDir() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// parents_portal_YYYY-MM-DD_HHmmss.sql — no colons/T/Z from toISOString(), no spaces.
function formatBackupFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `parents_portal_${date}_${time}.sql`;
}

// The format above is second-granularity, and filename has no UNIQUE
// constraint — two backups requested within the same wall-clock second would
// otherwise collide on disk, with the second dump silently overwriting the
// first backup's file while both rows stayed in the table (the first row's
// file_size would then be wrong, and its content would actually be the
// second dump's). Disambiguate with a numeric suffix rather than let that
// happen.
function reserveBackupPath() {
  const base = formatBackupFilename();
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
  ensureBackupsDir();

  const { filename, filePath } = reserveBackupPath();

  try {
    await runMysqldump(filePath);

    const stats = fs.statSync(filePath);
    if (!stats.size) {
      fs.unlinkSync(filePath);
      return res.status(500).json({ success: false, message: 'mysqldump produced an empty file.' });
    }

    const [result] = await pool.query(
      'INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?)',
      [filename, filePath, stats.size, req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(req.user.id, 'create_backup', `Created backup ${filename}`);

    return res.status(201).json({ success: true, message: 'Backup created.', backup: rows[0] });
  } catch (error) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup failure — the dump error itself is what we report
      }
    }
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

module.exports = router;
