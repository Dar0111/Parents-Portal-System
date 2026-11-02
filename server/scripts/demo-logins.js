// MODULE 12 (2026-10-31) — THE DEMO LOGIN LIST, for Notepad. No database and no
// password: the list comes from the same pure plan the load ran, so this works
// on a laptop that cannot reach Supabase.
//
//   npm run demo:logins
//   npm run demo:logins -- --out="<a path outside the repo>"
//   npm run demo:logins -- --kept=1:Mabait=1,5:Masigasig=1,6:Malikhain=2
//
// --kept is only needed when demo-load.js printed it: seats are topped up from
// the live count, so a section with another kept learner has one seat fewer.
//
// A parent's login id IS an LRN (§5c), so this file is half a credential: it
// lives outside the repo, it is opened in Notepad only, and it is never pasted
// or screenshotted. This script prints the path and a row count, nothing else.
const fs = require('fs');
const path = require('path');
const demo = require('./demoData');

const { Refusal } = demo;

const DEFAULT_OUT = 'C:\\Users\\Win10 User\\Parents_Portal-demo-logins\\demo-logins.txt';
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function argument(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

// Inside the repo it is one `git add -A` from the remote. The secrets folder
// is not a place for it either: that holds what the migration reads.
function assertOutsideRepo(file) {
  const fromRepo = path.relative(REPO_ROOT, file);
  const inside = fromRepo === '' || (!fromRepo.startsWith('..') && !path.isAbsolute(fromRepo));
  if (inside) throw new Refusal('The login list must live outside the repo.');
  if (file.split(/[\\/]/).includes('Parents_Portal-migration-data')) {
    throw new Refusal('The login list must not live in Parents_Portal-migration-data.');
  }
}

function parseKept(value) {
  if (value === null) return demo.SEEDED_KEPT;
  const kept = {};
  for (const part of value.split(',')) {
    const match = /^(\d):([A-Za-z]+)=(\d+)$/.exec(part);
    if (!match) throw new Refusal('--kept looks like 1:Mabait=1,5:Masigasig=1,6:Malikhain=2');
    kept[demo.sectionKey(Number(match[1]), match[2])] = Number(match[3]);
  }
  return kept;
}

function render(rows) {
  const header = ['Pre-confirmed', 'Role', 'Grade', 'Section', 'Name', 'Login id', 'Password'];
  const cells = rows.map((row) => [row.confirmed ? 'yes' : 'no', row.role, row.grade, row.section, row.name, row.login_id, row.password]);
  const widths = header.map((title, column) => Math.max(title.length, ...cells.map((line) => line[column].length)));
  const line = (values) => values.map((value, column) => value.padEnd(widths[column])).join('  ').trimEnd();
  return [
    "Parent's Portal: demo login ids. Open in Notepad only. Never paste or screenshot.",
    `The Password column names a value, never the value: ${demo.LOGIN_VALUES.teacher} on every teacher row, ${demo.LOGIN_VALUES.parent} on every parent row.`,
    'The two values are saved nowhere else: not in a file, a database or a log. Only Darryl\'s own note holds them.',
    'If the note is lost, npm run demo:passwords sets them again (docs/DEMO_DATA.md).',
    'A row whose holder changed the password keeps the holder\'s password, whatever this column says.',
    'ADMIN001, TCH-001, TCH-002, TCH-003 and the seeded parents keep their own passwords.',
    '',
    line(header),
    ...cells.map(line),
    '',
  ].join('\r\n');
}

function main() {
  const file = path.resolve(argument('out') || DEFAULT_OUT);
  assertOutsideRepo(file);
  const rows = demo.loginRows(parseKept(argument('kept')));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(rows), 'utf8');
  console.log(`Wrote ${rows.length} rows to ${file}`);
}

try {
  main();
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  console.error(`REFUSED: ${error.message}`);
  process.exitCode = 2;
}
