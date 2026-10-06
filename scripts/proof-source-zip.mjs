// PROOF — scripts/create-backup-zip.js, the source-code zip (fix/source-zip,
// 2026-10-06). It builds a THROWAWAY git repository in a temp folder (paths
// with spaces, like the owner's home), runs the real script against it
// through SOURCE_ZIP_ROOT / SOURCE_ZIP_OUT_DIR, and reads the zip's own
// central directory — no unzip tool, nothing written outside the temp
// folder, which is removed at the end. It never runs the script against the
// real repository: the owner does the first real run. The real repository is
// only READ, with `git ls-files`, to show what its zip will hold.
//
// Run from the repository root:   node scripts/proof-source-zip.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.resolve(here, '..');
const SCRIPT = path.join(here, 'create-backup-zip.js');
const ALLOWED = ['README.md', '.gitignore', 'client', 'database', 'docs', 'mobile', 'scripts', 'server'];
const PREFIX = 'Parents_Portal/';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

// --- the zip's file names, from its central directory (no library) ---------
function zipEntries(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

// --- the checks, as functions, so a negative control can run them too ------
const isEnvFile = (name) => {
  const base = name.replace(/\/$/, '').split('/').pop();
  return (base === '.env' || base.startsWith('.env.')) && !base.endsWith('.example');
};
function onlyAllowedTopLevel(names) {
  if (!names.every((n) => n.startsWith(PREFIX))) return false;
  const tops = new Set(names.map((n) => n.slice(PREFIX.length).split('/')[0]).filter(Boolean));
  return [...tops].every((t) => ALLOWED.includes(t));
}
const hasNodeModules = (names) => names.some((n) => n.split('/').includes('node_modules'));
const hasEnvFile = (names) => names.some(isEnvFile);

// --- a throwaway repository -------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-source-zip-'));
const repo = path.join(tmp, 'repo with spaces');
const out = path.join(tmp, 'out dir with spaces');
const NAME_RE = /^Parents_Portal_source_(\d{4}-\d{2}-\d{2})_([0-9a-f]{7,})\.zip$/;

function git(args, cwd = repo) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function commitAll(message) {
  git(['add', '-A']);
  git(['-c', 'user.name=proof', '-c', 'user.email=proof@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message]);
}
function write(rel, text) {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function run() {
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, SOURCE_ZIP_ROOT: repo, SOURCE_ZIP_OUT_DIR: out },
    encoding: 'utf8',
  });
  return { status: r.status, text: `${r.stdout}\n${r.stderr}` };
}
const zipsIn = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.zip'));
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

try {
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  git(['init', '-q']);
  write('README.md', '# proof\n');
  write('.gitignore', 'node_modules/\n.env\n');
  write('CLAUDE.md', 'not allowed at the top level\n');
  write('notes/plan.md', 'not allowed at the top level\n');
  write('client/src/a.js', 'export const a = 1;\n');
  write('client/.env.example', 'API_URL=\n');
  write('database/schema.sql', '-- schema\n');
  write('docs/a.md', '# docs\n');
  write('mobile/m.js', 'export const m = 1;\n');
  write('scripts/s.js', 'console.log(1);\n');
  write('server/server.js', 'console.log(1);\n');
  commitAll('initial');
  // Ignored, never tracked: the node_modules and the .env the old copy-based
  // script had to remember to skip.
  write('client/node_modules/pkg/index.js', 'module.exports = 1;\n');
  write('server/.env', 'SECRET=not-a-real-secret\n');
  // Untracked, NOT ignored: must only be warned about.
  write('server/untracked-notes.txt', 'scratch\n');

  console.log('A run on a clean HEAD with one untracked file');
  const first = run();
  assert(first.status === 0, 'exit 0', first.text.slice(0, 300));
  assert(/WARNING: 1 untracked file\(s\) are NOT in the zip/.test(first.text), 'the untracked file is only WARNED about');
  const zips = zipsIn(out);
  const sha = git(['rev-parse', '--short', 'HEAD']).trim();
  const m = NAME_RE.exec(zips[0] || '');
  assert(zips.length === 1 && m, `the name is Parents_Portal_source_<date>_<sha>.zip (${zips[0]})`);
  assert(m && m[1] === localDate() && m[2] === sha, `…with today's local date and HEAD's short sha (${localDate()}, ${sha})`);
  const zipPath = path.join(out, zips[0] || 'missing.zip');
  const names = zips.length ? zipEntries(zipPath) : [];
  const tops = [...new Set(names.map((n) => n.slice(PREFIX.length).split('/')[0]).filter(Boolean))].sort();
  assert(onlyAllowedTopLevel(names), `only the allowed top-level entries, under ${PREFIX} (${tops.join(', ')})`);
  assert(ALLOWED.every((a) => tops.includes(a)), 'every allowed entry is there');
  assert(!names.some((n) => n.endsWith('CLAUDE.md') || n.includes('/notes/')), 'a tracked file outside the allow-list (CLAUDE.md, notes/) is left out');
  assert(!hasEnvFile(names), 'no .env file anywhere');
  assert(names.includes(`${PREFIX}client/.env.example`), 'a tracked .env.example template is kept');
  assert(!hasNodeModules(names), 'no node_modules');
  assert(!names.some((n) => n.endsWith('untracked-notes.txt')), 'nothing untracked');

  console.log('\nRefusal when the file already exists');
  const statBefore = fs.statSync(zipPath);
  const again = run();
  const statAfter = fs.statSync(zipPath);
  assert(again.status === 1 && /already exists/.test(again.text), 'a second run on the same HEAD and day is REFUSED (exit 1)');
  assert(statAfter.size === statBefore.size && statAfter.mtimeMs === statBefore.mtimeMs, 'the existing zip is untouched');
  fs.rmSync(zipPath);

  console.log('\nRefusal on tracked changes');
  write('server/server.js', 'console.log(2);\n');
  const unstaged = run();
  assert(unstaged.status === 1 && /uncommitted changes/.test(unstaged.text), 'an UNSTAGED change to a tracked file is REFUSED');
  assert(zipsIn(out).length === 0, '…and no zip is written');
  git(['add', 'server/server.js']);
  const staged = run();
  assert(staged.status === 1 && /uncommitted changes/.test(staged.text), 'a STAGED change is REFUSED too');
  git(['reset', '-q', '--hard']);
  const clean = run();
  assert(clean.status === 0 && zipsIn(out).length === 1, 'committed again (reset), the run succeeds — the untracked file still only warned about');
  fs.rmSync(path.join(out, zipsIn(out)[0]));

  console.log('\nRefusal on a TRACKED .env');
  git(['add', '-f', 'server/.env']);
  commitAll('a .env tracked by mistake');
  const tracked = run();
  assert(tracked.status === 1 && /environment file/.test(tracked.text), 'HEAD tracking server/.env is REFUSED');
  assert(zipsIn(out).length === 0, '…and no zip is written');

  console.log('\nNegative controls — the checks fail where they must');
  // A zip of the WHOLE repository, no allow-list, made by git directly: the
  // top-level check must fail on it (CLAUDE.md, notes/), and the .env check
  // must catch the force-tracked server/.env.
  const neg = path.join(tmp, 'negative control.zip');
  execFileSync('git', ['archive', '--format=zip', `--prefix=${PREFIX}`, '-o', neg, 'HEAD'], { cwd: repo });
  const negNames = zipEntries(neg);
  assert(!onlyAllowedTopLevel(negNames), 'NEGATIVE CONTROL: a whole-repository zip FAILS the allowed-top-level check');
  assert(hasEnvFile(negNames), 'NEGATIVE CONTROL: the .env check CATCHES the tracked server/.env in it');
  assert(hasNodeModules([`${PREFIX}client/node_modules/pkg/index.js`]), 'NEGATIVE CONTROL: the node_modules check catches a node_modules path');

  console.log('\nThe real repository, read only (no zip is made)');
  const realFiles = execFileSync('git', ['ls-files', '--', ...ALLOWED], { cwd: REAL_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const realEnvTemplates = realFiles.filter((f) => /(^|\/)\.env[^/]*\.example$/.test(f));
  assert(realFiles.length > 0 && !hasNodeModules(realFiles), `its ${realFiles.length} tracked files under the allowed paths hold no node_modules`);
  assert(!realFiles.some(isEnvFile), `…and no .env file (${realEnvTemplates.length} .env.example templates)`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nproof-source-zip: ${passed}/${passed + failed}${fs.existsSync(tmp) ? ' — TEMP FOLDER LEFT BEHIND' : ' (temp folder removed)'}`);
process.exit(failed ? 1 : 0);
