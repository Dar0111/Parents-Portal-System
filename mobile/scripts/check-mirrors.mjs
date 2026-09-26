// THE MIRROR CHECK — copies are proved equal, not trusted (Stage 5 scaffold,
// 2026-09-27; CLAUDE.md → STAGE 5 MOBILE CONVENTIONS).
//
// Sharing a module between client/ and mobile/ would need Metro `watchFolders`
// plus Vite `server.fs.allow`, or a `file:` dependency, or a symlink — all
// three are the monorepo tooling LOCKED DECISIONS refuse. So the pure modules
// are COPIED, byte for byte, and this script is what stops the copies drifting:
// each pair below is compared after CRLF normalisation and the first
// differing line is named. A deliberate divergence is a RENAME (a new mobile
// file), never an edit to a mirrored one.
//
// The school calendar has THREE copies once the parent branch lands
// (server → client → mobile); its pair goes here then, and ssr-school-calendar
// already proves the first two agree. Run from `mobile/`:
//
//   node scripts/check-mirrors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..');
const CLIENT = path.resolve(MOBILE, '..', 'client', 'src');

// [mobile copy, client source]
export const PAIRS = [
  ['src/api/extractError.js', 'api/extractError.js'],
  ['src/auth/authFailure.js', 'auth/authFailure.js'],
  ['src/auth/roles.js', 'auth/roles.js'],
  ['src/navigation/nav.js', 'layout/nav.js'],
  ['src/format/passwordRule.js', 'format/passwordRule.js'],
  ['src/format/contactRule.js', 'format/contactRule.js'],
  // Branch 2 — the parent screens.
  ['src/screens/settings/tabs.js', 'pages/settings/tabs.js'],
];

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const problems = [];
for (const [copy, source] of PAIRS) {
  const copyPath = path.join(MOBILE, copy);
  const sourcePath = path.join(CLIENT, source);
  if (!fs.existsSync(copyPath)) {
    problems.push(`${copy}: missing — copy it from client/src/${source}`);
    continue;
  }
  if (!fs.existsSync(sourcePath)) {
    problems.push(`${copy}: its source client/src/${source} is gone — the web renamed or deleted it`);
    continue;
  }
  const a = read(copyPath).split('\n');
  const b = read(sourcePath).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      problems.push(`${copy} differs from client/src/${source} at line ${i + 1}`);
      break;
    }
  }
}

if (problems.length) {
  console.error(`check-mirrors: ${problems.length} of ${PAIRS.length} mirrored files drifted:`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check-mirrors: ${PAIRS.length} mirrored files identical to their client/src sources`);
