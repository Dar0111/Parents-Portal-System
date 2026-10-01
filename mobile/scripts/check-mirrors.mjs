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
  ['src/format/date.js', 'format/date.js'],
  ['src/format/schoolCalendar.js', 'format/schoolCalendar.js'],
  ['src/format/scorePair.js', 'format/scorePair.js'],
  ['src/screens/dashboards/useCard.js', 'pages/dashboards/useCard.js'],
  ['src/screens/parent/excuseLetters/card.jsx', 'pages/parent/excuseLetters/card.jsx'],
  // Branch 3 — the teacher screens.
  ['src/screens/teacher/students/sectionOptions.js', 'pages/teacher/students/sectionOptions.js'],
  ['src/components/filterState.js', 'components/filterState.js'],
  ['src/format/audience.js', 'format/audience.js'],
  ['src/format/lrnRule.js', 'format/lrnRule.js'],
  ['src/screens/teacher/excuseLetters/card.jsx', 'pages/teacher/excuseLetters/card.jsx'],
  ['src/screens/teacher/announcements/card.jsx', 'pages/teacher/announcements/card.jsx'],
  ['src/screens/teacher/events/card.jsx', 'pages/teacher/events/card.jsx'],
  ['src/screens/teacher/attendance/roster.js', 'pages/teacher/attendance/roster.js'],
  ['src/screens/teacher/classRecord/buildPayload.js', 'pages/teacher/classRecord/buildPayload.js'],
  ['src/screens/teacher/classRecord/backGuard.js', 'pages/teacher/classRecord/backGuard.js'],
  // feat/nav-drawer-groups — the drawer groups exactly as the sidebar does.
  ['src/navigation/navGroups.js', 'layout/navGroups.js'],
  // feat/profile-photos — one way to build a photo's address.
  ['src/format/photoUrl.js', 'format/photoUrl.js'],
  // fix/leave-guard — one rule for the exits that are buttons, not links.
  ['src/navigation/leaveGuard.js', 'layout/leaveGuard.js'],
];

// THE SCHOOL CALENDAR IS A THREE-WAY COPY: server → client → mobile. The
// client proof (ssr-school-calendar) holds the first two equal on every
// boundary; this holds the mobile copy equal to the client's above AND,
// because the server module is CommonJS and the client's is ESM, checks the
// one thing that can differ between them without a byte diff — the TERMS
// table — by value against the server's module.
export const SERVER_CALENDAR = path.resolve(MOBILE, '..', 'server', 'utils', 'schoolCalendar.js');

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

// The calendar's value check against the server (see SERVER_CALENDAR).
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const server = require(SERVER_CALENDAR);
  const { pathToFileURL } = await import('node:url');
  const mobile = await import(pathToFileURL(path.join(MOBILE, 'src', 'format', 'schoolCalendar.js')).href);
  const same =
    server.SCHOOL_YEAR === mobile.SCHOOL_YEAR &&
    server.CLASSES_START === mobile.CLASSES_START &&
    server.CLASSES_END === mobile.CLASSES_END &&
    JSON.stringify(server.TERMS) === JSON.stringify(mobile.TERMS);
  if (!same) problems.push('src/format/schoolCalendar.js: SCHOOL_YEAR / class dates / TERMS differ from server/utils/schoolCalendar.js');
} catch (err) {
  problems.push(`src/format/schoolCalendar.js: could not compare against the server module (${err.message})`);
}

if (problems.length) {
  console.error(`check-mirrors: ${problems.length} problem(s) across ${PAIRS.length} mirrored files:`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check-mirrors: ${PAIRS.length} mirrored files identical to their client/src sources; the calendar also equals the server's by value`);
