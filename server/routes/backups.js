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
const { readListParams, pageMeta } = require('../utils/pagination');

const router = express.Router();

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function ensureBackupsDir() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// A DUMP IS WRITTEN AS `<name>.sql.partial` AND RENAMED TO `.sql` ONLY WHEN
// IT IS COMPLETE (fix/server-reliability, 2026-09-30) — a SAFEGUARD, not the
// fix for the first-call reset. That reset was the dev server's own
// `node --watch` restarting mid-dump when NTFS wrote an access time to a
// node_modules file in its import graph (the dev script now watches our code
// only). A process that dies mid-dump never reaches the catch below that
// removes its file, and until now left a truncated `.sql` that Admin →
// Backup & Restore listed under "Files with no record" as though it could be
// restored. A `.partial` is by construction never a backup: the list and the
// restore endpoint only ever see `.sql`, so removing a `.partial` does not
// touch the rule that no backup file is deleted.
const PARTIAL_SUFFIX = '.partial';

// This process has no dump in flight while its module loads, but ANOTHER
// server process on the same directory might (the dev API beside a test or
// loop server). A dump takes well under a second, so only a `.partial`
// untouched for over a minute is treated as left by a process that died.
// Each one is logged by name before it goes.
const PARTIAL_STALE_MS = 60 * 1000;
function sweepPartials() {
  try {
    ensureBackupsDir();
    for (const name of fs.readdirSync(BACKUPS_DIR).filter((n) => n.endsWith(`.sql${PARTIAL_SUFFIX}`))) {
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

// The same test a cleanup script applies: mysqldump's own last line.
function hasDumpFooter(filePath, size) {
  const length = Math.min(200, size);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return /-- Dump completed on/.test(buf.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
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
  while (
    fs.existsSync(path.join(BACKUPS_DIR, filename)) ||
    fs.existsSync(path.join(BACKUPS_DIR, `${filename}${PARTIAL_SUFFIX}`))
  ) {
    attempt += 1;
    filename = base.replace(/\.sql$/, `-${attempt}.sql`);
  }
  return { filename, filePath: path.join(BACKUPS_DIR, filename) };
}

// Runs one mysqldump invocation and streams its stdout to outputPath.
// append: true opens the file in append mode instead of truncating it —
// used to bolt a second, structure-only invocation onto the end of the
// first one's output (see dumpDatabase below). Password goes through
// MYSQL_PWD on the child's own env only — never on argv, where it would be
// visible to any user via Task Manager's command-line column,
// `wmic process get commandline`, `ps`, etc.
function runMysqldump(outputPath, args, { append = false } = {}) {
  return new Promise((resolve, reject) => {
    const bin = process.env.MYSQLDUMP_PATH || 'mysqldump';

    const child = spawn(bin, args, {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' },
    });

    const out = fs.createWriteStream(outputPath, append ? { flags: 'a' } : undefined);
    let stderr = '';
    let settled = false;

    child.stdout.pipe(out);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // A FAILURE REJECTS ONLY AFTER THE OUTPUT FILE IS CLOSED (fix/server-
    // reliability, 2026-09-30). createWriteStream opens its file
    // asynchronously, so rejecting at once let the caller's cleanup look for
    // the file before it existed — and the stream created it a moment later,
    // leaving a 0-byte file (measured: test:backups' forced failure). On
    // Windows an open handle also makes the caller's unlink fail. Destroying
    // the stream and waiting for its `close` means the file exists and is
    // released when the caller removes it.
    const fail = (err) => {
      if (settled) return;
      settled = true;
      child.stdout.unpipe(out);
      out.once('close', () => reject(err));
      out.destroy();
    };

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        fail(
          new Error(
            'mysqldump was not found. Install the MySQL command-line client and ensure its bin ' +
              'directory is on PATH, or set MYSQLDUMP_PATH in server/.env to its full path ' +
              '(e.g. C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe).'
          )
        );
      } else {
        fail(err);
      }
    });

    out.on('error', (err) => fail(err));

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

// backups is infrastructure metadata about the backup system itself, not
// school data — and it is uniquely self-referential: it is the table you
// consult to find the file you are restoring FROM. A row is only ever
// inserted after its own file finishes dumping (see createBackupRecord
// below), so a backup's file can never contain its own row. Restoring any
// backup therefore rewinds `backups` to a state that is missing that
// backup's row, the safety dump's row taken moments before the restore,
// and the row of every OTHER backup taken after the one being restored
// from — their files stay on disk, untouched, but the table no longer
// knows they exist. Excluding backups' DATA from every dump removes the
// precondition entirely, for every backup, not just the ones touched by
// one restore. `--no-data` on a second, separate invocation (rather than
// plain `--ignore-table`, which would drop the table concept altogether)
// keeps the CREATE TABLE statement in the dump, so a bare-metal restore
// done by hand outside this API still ends up with an empty-but-real
// `backups` table, not a missing one requiring schema.sql to be reapplied.
// activity_logs does NOT get the same treatment — restoring it to the
// backup's point in time is the CORRECT behavior for a snapshot restore,
// the same as any other domain table losing rows written after that
// point. See CLAUDE.md's RESTORE section for the one narrow exception
// this doesn't cover (the two log entries the restore operation itself
// writes).
async function dumpDatabase(outputPath) {
  const dbName = process.env.DB_NAME || 'parents_portal';
  const host = process.env.DB_HOST || 'localhost';
  const port = String(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';

  // Everything except backups' data — full structure + data for every
  // other table, backups excluded entirely (not even its CREATE TABLE;
  // the second call below supplies that).
  await runMysqldump(outputPath, [
    '--single-transaction',
    '--databases',
    dbName,
    `--ignore-table=${dbName}.backups`,
    // auth_codes ROWS are excluded for the same reason backups’ are, but a
    // sharper one (R1, 2026-09-19): the table holds bcrypt hashes of SIX-DIGIT
    // codes. That is a 10^6 search space — brute-forcible in well under a
    // second — so a dump file containing live rows is a password-reset
    // credential sitting on disk. Ten un-adoptable orphan .sql files are
    // already in server/backups/, and no backup file is ever deleted, so
    // "on disk" means "indefinitely".
    //
    // Excluding the rows also stops a restore resurrecting consumed or
    // expired codes. The STRUCTURE is still dumped, by the --no-data pass
    // below, so a bare-metal restore rebuilds the table empty.
    `--ignore-table=${dbName}.auth_codes`,
    '-h',
    host,
    '-P',
    port,
    '-u',
    user,
  ]);

  // backups' and auth_codes' structure only, no rows, appended to the same
  // file. No FK references INTO backups from any other table, so its
  // position at the end of the file is safe — nothing needs it to exist
  // earlier. auth_codes DOES have an FK, but it points OUT (to users), and
  // users is created earlier in the file, so appending it here is safe too.
  await runMysqldump(
    outputPath,
    ['--no-data', '-h', host, '-P', port, '-u', user, dbName, 'backups', 'auth_codes'],
    { append: true }
  );
}

// Keeping backups' CREATE TABLE in the dump file (above) fixed the stale-
// row problem, but introduced a sharper one: the file still contains
// `DROP TABLE IF EXISTS \`backups\`` followed by an empty `CREATE TABLE
// \`backups\``, and the restore endpoint executes the ENTIRE file against
// the live database. That DROP+CREATE runs too — wiping the live table to
// zero rows on every single restore, unconditionally, regardless of which
// backup was restored from (found by hand: restored from a backup, and
// even the OTHER backup row created after it — never present in that
// backup's own file either way — was gone, along with everything else).
// mysqldump's own `--ignore-table` can't help here: applying it to the
// SAME invocation that also needs backups' CREATE TABLE for a bare-metal
// restore is a contradiction — you can't both include and exclude one
// table from one mysqldump run. So the split happens at read time instead:
// this strips the `backups` table's DDL out of the SQL string the RESTORE
// CONNECTION executes, while the file on disk — what a bare-metal restore
// outside this API would read — is never modified and still has the real
// CREATE TABLE. Matched by mysqldump's own stable comment convention
// (`-- Table structure for table \`backups\``), not a marker only new
// dumps would carry — this also protects every backup file already on
// disk from before this fix existed, including ones from the earlier,
// even worse bug where backups' block additionally carried stale INSERT
// rows. Stops at the next table's comment, or the invocation's own
// trailing `-- Dump completed on` footer, or end of string, so it never
// over-consumes into a neighboring table's block.
function stripBackupsTableDdl(sql) {
  const backupsBlockPattern =
    /--\r?\n-- Table structure for table `backups`\r?\n--[\s\S]*?(?=(?:--\r?\n-- Table structure for table `)|(?:-- Dump completed on)|$)/;
  return sql.replace(
    backupsBlockPattern,
    '-- backups table DDL/data intentionally skipped during restore — self-referential, see CLAUDE.md RESTORE section\n'
  );
}

// Shared by POST / (a regular manual backup) and the restore endpoint's
// mandatory safety dump — same machinery, only the filename prefix and
// who's attributed as creator differ. Returns the inserted backups row, or
// throws (with any partial file cleaned up) on any failure.
async function createBackupRecord({ prefix, createdBy }) {
  ensureBackupsDir();
  const { filename, filePath } = reserveBackupPath(prefix);
  const partialPath = `${filePath}${PARTIAL_SUFFIX}`;

  try {
    await dumpDatabase(partialPath);

    const partialStats = fs.statSync(partialPath);
    if (!partialStats.size) {
      throw new Error('mysqldump produced an empty file.');
    }
    if (!hasDumpFooter(partialPath, partialStats.size)) {
      throw new Error('mysqldump did not finish the dump (no "-- Dump completed on" line).');
    }
    fs.renameSync(partialPath, filePath);
    const stats = fs.statSync(filePath);

    const [result] = await pool.query(
      'INSERT INTO backups (filename, file_path, file_size, created_by) VALUES (?, ?, ?, ?)',
      [filename, filePath, stats.size, createdBy]
    );

    const [rows] = await pool.query('SELECT * FROM backups WHERE id = ? LIMIT 1', [result.insertId]);
    await logActivity(createdBy, 'create_backup', `Created backup ${filename}`);

    return rows[0];
  } catch (error) {
    // Both names: the `.partial` if the dump itself failed, the `.sql` if the
    // rename happened and a later step (the INSERT) failed.
    for (const p of [partialPath, filePath]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore cleanup failure — the dump error itself is what we report
        }
      }
    }
    throw error;
  }
}

// GET /api/backups — list, newest first. Also reconciles the table against
// server/backups/ and surfaces any .sql file with no matching row as
// orphaned_files — read-only, never auto-inserted. An unexpected file in
// that directory (from the pre-`--ignore-table` restore bug, or a file
// someone dropped in by hand) is reported, not silently adopted into the
// table as though the system created it — that would fabricate a
// created_by no one can actually vouch for. See CLAUDE.md's RESTORE
// section for how the two orphans this bug already produced were handled.
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
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM backups');
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS created_by_name
       FROM backups b
       LEFT JOIN users u ON u.id = b.created_by
       ${list.orderBy}
       LIMIT ? OFFSET ?`,
      [list.limit, list.offset]
    );

    const backups = rows.map((row) => ({ ...row, file_exists: fs.existsSync(row.file_path) }));

    // orphaned_files is NOT paginated: it is the disk minus EVERY row, not
    // minus this page, so the known set is read separately from the table.
    ensureBackupsDir();
    const [allNames] = await pool.query('SELECT filename FROM backups');
    const knownFilenames = new Set(allNames.map((row) => row.filename));
    const orphaned_files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((name) => name.endsWith('.sql') && !knownFilenames.has(name))
      .map((filename) => {
        const filePath = path.join(BACKUPS_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          file_path: filePath,
          file_size: stats.size,
          mtime: stats.mtime,
        };
      });

    return res.json({
      success: true,
      backups,
      orphaned_files,
      page: pageMeta({ limit: list.limit, offset: list.offset, total }),
    });
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

// A refused restore attempt is logged, because the most destructive endpoint
// in the API should leave a trace when someone tries it and fails. Best
// effort: a failed log write must not turn a 400/403 into the pre-flight 500.
// The typed password and the typed file name are never written here — the
// response already shows the admin what they typed. Caveat, recorded in
// CLAUDE.md KNOWN ISSUES: a refusal made shortly before a SUCCESSFUL restore
// is newer than the backup it restores from, so that restore rewinds it with
// the rest of activity_logs; it then survives only in the lost-entries count.
async function logRestoreRefusal(userId, filename, reason) {
  try {
    await logActivity(userId, 'restore_refused', `Restore of backup "${filename}" refused: ${reason}.`);
  } catch (error) {
    console.error('Could not log a refused restore attempt (refusal still returned):', error);
  }
}

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
    const [passwordRows] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
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

  // Count activity_logs entries the restore is about to erase, while the
  // live table still has them. activity_logs is correctly reverted to its
  // snapshot in the backup being restored from — that's the right behavior
  // for a point-in-time restore (see RESTORE section), not a bug — but
  // silently means every entry newer than that snapshot, including this
  // handler's own safety-dump `create_backup` log written moments ago,
  // disappears with nothing to say so afterward. Computed as late as
  // possible before the wipe, so it's exact, not estimated.
  let wipedActivityLogCount = 0;
  try {
    const [wipedRows] = await pool.query('SELECT COUNT(*) AS c FROM activity_logs WHERE created_at > ?', [
      backup.created_at,
    ]);
    wipedActivityLogCount = wipedRows[0].c;
  } catch (error) {
    console.error('Could not count activity_logs entries about to be wiped (restore proceeds regardless):', error);
  }

  // The actual restore. A dedicated one-off connection, never the shared
  // pool — its pooled connections would error once the database they're
  // attached to is dropped and recreated underneath them. multipleStatements
  // is safe specifically because this SQL always comes from our own
  // mysqldump output via a tracked backups row, never from user-supplied
  // text — if this endpoint ever took an uploaded file instead, this would
  // stop being safe.
  try {
    // The file on disk is read but not executed verbatim — see
    // stripBackupsTableDdl's comment for why the backups table's own
    // DROP/CREATE must never run against the live database.
    const dumpSql = fs.readFileSync(backup.file_path, 'utf8');
    const restorableSql = stripBackupsTableDdl(dumpSql);
    const restoreConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });
    try {
      await restoreConnection.query(restorableSql);
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

    // Written after the restore completes, same as restore_backup above, so
    // it survives rather than being wiped by the thing it documents. Only
    // written when something was actually lost — a restore from the most
    // recent backup with no activity since typically wipes nothing. Not
    // tamper-proof: an admin with direct DB access could delete this row
    // too, same as any other. Not silent is still better than silent.
    if (wipedActivityLogCount > 0) {
      await logActivity(
        req.user.id,
        'restore_wiped_activity_logs',
        `This restore reverted activity_logs to the state captured in backup "${backup.filename}" ` +
          `(created ${new Date(backup.created_at).toISOString()}). ${wipedActivityLogCount} ` +
          `activity_logs ${wipedActivityLogCount === 1 ? 'entry' : 'entries'} created after that timestamp — ` +
          `including this restore's own pre-restore safety-dump log — were lost, not moved or archived.`
      );
    }
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
    activity_logs_wiped: wipedActivityLogCount,
  });
});

module.exports = router;
// Attached for direct-call unit testing (scripts/test-backups-flows.js) —
// same pattern as sanitizeUser: proving "the restore path never executes
// backups' DROP TABLE" for real needs an actual live restore, deliberately
// excluded from the automated suite. Testing the extraction function
// directly, against real dump content, is what's actually provable here.
module.exports.stripBackupsTableDdl = stripBackupsTableDdl;
