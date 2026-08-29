/**
 * This is a SOURCE-CODE archiver for project submission — it zips the
 * codebase (database/, docs/, server/) to the Desktop. It is NOT a database
 * backup: it never touches MySQL and has no relationship to the `backups`
 * table. For an actual restorable database dump, see server/routes/backups.js
 * (POST /api/backups — runs a real mysqldump).
 *
 * Creates Parents_Portal_Backup.zip with correct folder structure.
 * Excludes: node_modules, .env, .git
 *
 * Usage: node scripts/create-backup-zip.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DESKTOP = path.join(process.env.USERPROFILE || '', 'Desktop');
const ZIP_NAME = 'Parents_Portal_Backup.zip';
const BUILD = path.join(os.tmpdir(), 'Parents_Portal_zip_build', 'Parents_Portal');

const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_FILES = new Set(['.env']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyDir(path.join(src, entry.name), path.join(dest, entry.name));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
    }
  }
}

function main() {
  const tempRoot = path.dirname(BUILD);
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(BUILD, { recursive: true });

  for (const file of ['README.md', '.gitignore']) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BUILD, file));
  }

  copyDir(path.join(ROOT, 'database'), path.join(BUILD, 'database'));
  copyDir(path.join(ROOT, 'docs'), path.join(BUILD, 'docs'));
  copyDir(path.join(ROOT, 'server'), path.join(BUILD, 'server'));

  const zipPath = path.join(DESKTOP, ZIP_NAME);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`,
    { stdio: 'inherit' }
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log(`\nCreated: ${zipPath}`);
  console.log('\nTamang structure pag na-extract:');
  console.log('  Parents_Portal/');
  console.log('  ├── README.md');
  console.log('  ├── .gitignore');
  console.log('  ├── database/');
  console.log('  │   ├── schema.sql');
  console.log('  │   └── seed.sql');
  console.log('  ├── docs/');
  console.log('  └── server/');
  console.log('      ├── config/');
  console.log('      ├── routes/');
  console.log('      ├── scripts/');
  console.log('      ├── server.js');
  console.log('      └── package.json');
}

main();
