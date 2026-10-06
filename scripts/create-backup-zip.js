/**
 * This is a SOURCE-CODE archiver for project submission — it zips the
 * codebase to the Desktop. It is NOT a database backup: it never touches
 * MySQL and has no relationship to the `backups` table. For an actual
 * restorable database dump, see server/routes/backups.js (POST /api/backups —
 * runs a real mysqldump).
 *
 * REBUILT ON `git archive` (fix/source-zip, 2026-10-06). It used to COPY
 * folders off the disk, skipping only `node_modules`, `.git` and files named
 * `.env` — so everything else lying in those folders went in, tracked or
 * not: the database dumps in server/backups/, uploaded photos, texted reset
 * codes. It also left out client/ and mobile/, overwrote the last zip without
 * asking, and ran PowerShell through a shell string. Now:
 *
 *   - the zip is `git archive` of HEAD: TRACKED, COMMITTED files only, so an
 *     ignored file (node_modules, .env, server/backups, uploads) can never be
 *     in it;
 *   - only README.md, .gitignore, client, database, docs, mobile, scripts and
 *     server, under one Parents_Portal/ folder;
 *   - it REFUSES when a tracked file has an uncommitted change, staged or not
 *     (the zip would not be what is on disk), and when HEAD tracks a `.env`
 *     file under those paths (`.env.example` templates are allowed); an
 *     untracked file only gets a WARNING — it is not in the zip either way;
 *   - the name says what it holds: Parents_Portal_source_<YYYY-MM-DD>_<short
 *     sha>.zip (the local date), and it REFUSES if that file already exists;
 *   - git runs without a shell (execFileSync, an argument array), so a path
 *     with spaces — the owner's home is "C:\Users\Win10 User" — is one
 *     argument, never split or re-quoted.
 *
 * The output folder is the same as before: the Desktop (%USERPROFILE%\Desktop).
 * SOURCE_ZIP_ROOT and SOURCE_ZIP_OUT_DIR override the repository and the
 * output folder; they exist for scripts/proof-source-zip.mjs, which runs this
 * against a throwaway repository in a temp folder.
 *
 * Usage: node scripts/create-backup-zip.js   (from the repository root)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.SOURCE_ZIP_ROOT
  ? path.resolve(process.env.SOURCE_ZIP_ROOT)
  : path.join(__dirname, '..');
const OUT_DIR = process.env.SOURCE_ZIP_OUT_DIR
  ? path.resolve(process.env.SOURCE_ZIP_OUT_DIR)
  : path.join(process.env.USERPROFILE || os.homedir(), 'Desktop');
const INCLUDE = ['README.md', '.gitignore', 'client', 'database', 'docs', 'mobile', 'scripts', 'server'];
const PREFIX = 'Parents_Portal/';

// A real environment file: `.env` or `.env.<anything>`, but not a template
// that ends in `.example`.
function isEnvFile(filePath) {
  const base = filePath.split('/').pop();
  return (base === '.env' || base.startsWith('.env.')) && !base.endsWith('.example');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function refuse(message) {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
}

// The local calendar date, YYYY-MM-DD — never toISOString(), which is UTC
// and a day behind in Manila before 08:00.
function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function main() {
  try {
    if (git(['rev-parse', '--is-inside-work-tree']).trim() !== 'true') refuse(`${ROOT} is not a git work tree.`);
  } catch {
    refuse(`${ROOT} is not a git work tree.`);
  }

  // Uncommitted changes to TRACKED files, staged or not: the zip is HEAD, so
  // it would not be what is on disk.
  const changed = git(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean);
  if (changed.length) {
    refuse(`${changed.length} tracked file(s) have uncommitted changes (staged or not). Commit or stash them first — the zip is built from HEAD. See: git status`);
  }

  // Untracked files are never in the zip; say so, and go on.
  const untracked = git(['status', '--porcelain', '--untracked-files=all']).split('\n').filter((l) => l.startsWith('??'));
  if (untracked.length) {
    console.warn(`WARNING: ${untracked.length} untracked file(s) are NOT in the zip (it holds tracked, committed files only). See: git status`);
  }

  const present = INCLUDE.filter((p) => git(['ls-tree', '--name-only', 'HEAD', p]).trim() !== '');
  const missing = INCLUDE.filter((p) => !present.includes(p));
  if (!present.length) refuse('HEAD holds none of the paths to include.');

  const envFiles = git(['ls-tree', '-r', '--name-only', 'HEAD', ...present]).split('\n').filter(Boolean).filter(isEnvFile);
  if (envFiles.length) {
    refuse(`HEAD tracks ${envFiles.length} environment file(s) (.env) under the included paths. Untrack them (git rm --cached) before zipping.`);
  }

  if (!fs.existsSync(OUT_DIR)) refuse(`The output folder does not exist: ${OUT_DIR}`);
  const sha = git(['rev-parse', '--short', 'HEAD']).trim();
  const zipName = `Parents_Portal_source_${localDate()}_${sha}.zip`;
  const zipPath = path.join(OUT_DIR, zipName);
  if (fs.existsSync(zipPath)) refuse(`${zipPath} already exists. Move or rename it first; it is never overwritten.`);

  execFileSync('git', ['archive', '--format=zip', `--prefix=${PREFIX}`, '-o', zipPath, 'HEAD', ...present], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  console.log(`\nCreated: ${zipPath}`);
  console.log(`From HEAD ${sha}, tracked files only.`);
  if (missing.length) console.log(`Not at HEAD, so not in the zip: ${missing.join(', ')}`);
  console.log('\nTamang structure pag na-extract:');
  console.log('  Parents_Portal/');
  for (const p of present) console.log(`  ├── ${p}${p.includes('.') ? '' : '/'}`);
}

main();
