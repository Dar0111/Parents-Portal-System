// PROOF — the admin dashboard's pure half (Stage 5 branch 4, M16). Drives
// `admin/dashboard/logic.js`: the backup card's tone and words by CALENDAR
// day in Manila with the clock pinned, never red; every card opening an
// admin route and none opening the web-only Backup & Restore; the lockout
// hazard; the waiting card's tone; and since build 2 (Part C) the People
// card's three counts (`countRows`). What it cannot: the cards render — the
// phone (M7). Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-admin-dashboard.mjs
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { backupAge, CARD_LINKS, countRows, pendingLead, pendingTone, showLockoutHazard } = await import('../src/screens/admin/dashboard/logic.js');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

// 01:00 on 29 September 2026 in Manila (UTC+8) = 17:00Z on the 28th.
const NOW = Date.parse('2026-09-28T17:00:00.000Z');

console.log('backupAge — calendar days in Manila, never red');
assert(backupAge(null, NOW).tone === 'warning' && backupAge(null, NOW).label === 'No backup yet', 'no backup → amber "No backup yet"');
const lateLastNight = backupAge('2026-09-28T15:00:00.000Z', NOW); // 23:00 PH on the 28th
assert(lateLastNight.label === 'Last backup yesterday' && lateLastNight.tone === 'success', '23:00 read at 01:00 is "yesterday", not "today" (a date, not a duration)');
assert(backupAge('2026-09-28T16:30:00.000Z', NOW).label === 'Last backup today', '00:30 PH the same morning is "today"');
assert(backupAge('2026-09-21T17:00:00.000Z', NOW).tone === 'success', 'exactly seven days → green');
const stale = backupAge('2026-09-20T17:00:00.000Z', NOW);
assert(stale.tone === 'warning' && stale.label === 'Last backup 8 days ago', 'eight days → amber "8 days ago"');
assert(['success', 'warning'].includes(backupAge('garbage', NOW).tone) && backupAge('garbage', NOW).tone !== 'danger', 'an unreadable timestamp is amber, never red');

console.log('cards open admin routes, never the web-only one');
const links = Object.values(CARD_LINKS);
assert(links.every((l) => l.startsWith('/admin')) && !links.includes('/admin/backups'), `every link — the waiting card, the three counts, System — an admin route, none to Backup & Restore (${links.join(', ')})`);
assert(CARD_LINKS.system === '/admin/settings' && CARD_LINKS.pending === '/admin/users', 'System opens Settings; the waiting count opens Users');

console.log('the People card — three counts, each its own link (build 2, Part C)');
const rows = countRows({ students: 4, teachers: 3, active_parents: 2 });
assert(rows.map((r) => r.key).join(',') === 'students,teachers,parents' && rows.map((r) => r.label).join(',') === 'Students,Teachers,Parents', 'Students, Teachers, Parents — in the web’s order and words');
assert(rows[0].link === '/admin/students' && rows[1].link === '/admin/users' && rows[2].link === '/admin/users', 'each opens the list whose WHERE it repeats: Students → Students, Teachers and Parents → Users');
assert(rows.map((r) => r.value).join(',') === '4,3,2' && rows.map((r) => r.caption).join(' | ') === 'on the roll | teacher accounts | active parent accounts', 'the server’s totals as text, with the web’s captions');
assert(countRows(undefined).every((r) => r.value === '0') && countRows({ students: 'x' })[0].value === '0', 'a missing or unreadable total reads 0, never "undefined" or "NaN"');

console.log('the hazard and the waiting card');
assert(showLockoutHazard({ hazard: { single_unverified_admin: true } }) && !showLockoutHazard({ hazard: { single_unverified_admin: false } }) && !showLockoutHazard(null), 'the hazard shows only on the server\'s true, never on a missing payload');
assert(pendingTone(2) === 'warning' && pendingTone(0) === 'default' && pendingTone(undefined) === 'default', 'waiting is amber above zero, plain at zero');
assert(
  pendingLead(1).value === '1' && pendingLead(1).caption === 'parent account waiting' && pendingLead(0).value === '0' && pendingLead(2).caption === 'parent accounts waiting',
  'the lead (f2): "1 parent account waiting", shown at 0 — the emphasised card never goes blank'
);

console.log(`\nproof-admin-dashboard: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
