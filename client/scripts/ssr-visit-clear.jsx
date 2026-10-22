// PROOF — a visit clears a badged page's badge (fix/f3-badges, 2026-10-22;
// the smoke gate's F3 and the owner's decision). Run from client/:
//   npx vite build --ssr scripts/ssr-visit-clear.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-visit-clear.js
//
// What it proves, each check with a NEGATIVE CONTROL that must fail — all of
// it as SOURCE, because the clear is an effect and SSR runs none (§5h):
//   - realtime/useVisitClear.js sends PATCH /notifications/read-all with the
//     page's `{ section }`, only once the list has LOADED and only once per
//     mount, re-reads the counts after it (§10: nothing subtracted) and keeps
//     a failed clear silent;
//   - the eight badged pages whose badge counts information call it with
//     their section and a "loaded" that a failed load cannot make true;
//   - Teacher → Excuse Letters and Admin → Users do NOT call it — their
//     badges count only calls to act, which clear on the decision;
//   - the server decides what a section covers (VISIT_CLEAR, per role): the
//     information types only, no grade type, no call to act; no body is the
//     old Mark all as read; an empty section runs no query; no ids, no
//     UPDATE; a clear above 0 signals the caller through the existing helper.
// Cannot prove a real visit, the badge falling, or a second device — the
// owner's device check (docs/F3_BADGES_DEVICE_CHECK.md).

import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
// A check that holds on the real input and FAILS on every control.
function proved(label, check, good, ...controls) {
  const ok = check(good);
  const bad = controls.filter((c) => check(c));
  assert(ok && bad.length === 0, label, ok ? `${bad.length} control(s) passed` : 'fails on the real source');
}

const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

console.log('\n--- the web helper, realtime/useVisitClear.js ---');
const hook = read('src/realtime/useVisitClear.js');
proved(
  'it sends the section to PATCH /notifications/read-all and re-reads the counts after',
  (s) =>
    s.includes(".patch('/notifications/read-all', { section }, { unwrap: 'updated' })") &&
    s.includes('.then(() => refresh())'),
  hook,
  hook.replace("{ section }, { unwrap: 'updated' }", "{}, { unwrap: 'updated' }"),
  hook.replace('.then(() => refresh())', '.then(() => {})')
);
proved(
  'only once the list has loaded, and only once per mount',
  (s) => s.includes('if (!loaded || sent.current) return;') && s.includes('sent.current = true;'),
  hook,
  hook.replace('if (!loaded || sent.current) return;', 'if (sent.current) return;'),
  hook.replace('sent.current = true;', '')
);
proved(
  'a failed clear is caught and changes nothing on the page',
  (s) => /\.catch\(\(\) => \{/.test(s) && !/setError|throw /.test(s),
  hook,
  hook.replace('.catch(() => {', '.catch((err) => { throw err;')
);

console.log('\n--- the eight badged pages that clear on a visit ---');
const LOADED = '!loading && !error && page !== null';
const PAGES = [
  ['src/pages/teacher/AnnouncementsPage.jsx', `useVisitClear('announcements', ${LOADED});`],
  ['src/pages/teacher/MemosPage.jsx', `useVisitClear('memos', ${LOADED});`],
  ['src/pages/teacher/EventsPage.jsx', `useVisitClear('events', ${LOADED});`],
  ['src/pages/parent/AnnouncementsPage.jsx', `useVisitClear('announcements', ${LOADED});`],
  ['src/pages/parent/MemosPage.jsx', `useVisitClear('memos', ${LOADED});`],
  ['src/pages/parent/EventsPage.jsx', `useVisitClear('events', ${LOADED});`],
  ['src/pages/parent/ExcuseLettersPage.jsx', "useVisitClear('excuse_letters', !loading && !error);"],
  [
    'src/pages/admin/AnnouncementsPage.jsx',
    "useVisitClear( 'announcements', !annLoading && !annError && annPage !== null && !memoLoading && !memoError && memoPage !== null );",
  ],
];
for (const [file, call] of PAGES) {
  const src = read(file);
  const check = (s) =>
    s.includes("import useVisitClear from '../../realtime/useVisitClear';") &&
    flat(s).includes(call) &&
    flat(s).split('useVisitClear(').length - 1 === 1;
  proved(
    `${path.basename(path.dirname(file))}/${path.basename(file)} calls it once, with its section, after a load that did not fail`,
    check,
    src,
    // the "loaded" without its error test: a failed load would clear
    flat(src).replace(call, call.replace(/ && !(ann|memo)?[eE]rror|!(ann|memo)?[eE]rror && /g, '')),
    // another section
    flat(src).replace(call, call.replace(/useVisitClear\( ?'[a-z_]+'/, "useVisitClear('users'"))
  );
}

console.log('\n--- the two badges that count only calls to act ---');
for (const file of ['src/pages/teacher/ExcuseLettersPage.jsx', 'src/pages/admin/UsersPage.jsx']) {
  const src = read(file);
  proved(
    `${path.basename(path.dirname(file))}/${path.basename(file)} does not clear on a visit (it clears on the decision)`,
    (s) => !s.includes('useVisitClear'),
    src,
    `import useVisitClear from '../../realtime/useVisitClear';\n${src}`
  );
}

console.log('\n--- the server, routes/notifications.js, as source ---');
const server = read('../server/routes/notifications.js');
const MAP =
  "const VISIT_CLEAR = { parent: { announcements: ['announcement'], memos: ['memo'], events: ['event'], excuse_letters: ['excuse_reviewed'], }, teacher: { announcements: ['announcement'], memos: ['memo'], events: ['event'], excuse_letters: [], }, admin: { announcements: ['announcement', 'memo'], users: [], }, };";
const mapSlice = (s) => {
  const start = s.indexOf('const VISIT_CLEAR = {');
  return start === -1 ? '' : s.slice(start, s.indexOf('};', start) + 2);
};
proved(
  'VISIT_CLEAR is each role badge’s information types, exactly',
  (s) => flat(s).includes(MAP),
  server,
  server.replace("excuse_letters: [],\n  },\n  admin", "excuse_letters: ['excuse_submitted'],\n  },\n  admin"),
  server.replace('users: [],', "users: ['parent_pending'],")
);
proved(
  'no grade type and no call to act is in any section',
  (s) => {
    const slice = mapSlice(s);
    return slice.length > 0 && !/grade_available|grades_locked|grades_acknowledged|excuse_submitted|parent_pending/.test(slice);
  },
  server,
  server.replace("events: ['event'],\n    excuse_letters: ['excuse_reviewed'],", "events: ['event', 'grade_available'],\n    excuse_letters: ['excuse_reviewed'],")
);
proved(
  'no body is the old Mark all as read, unchanged',
  (s) =>
    s.includes('if (body.section === undefined) {') &&
    s.includes("'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',") &&
    s.includes("message: 'All notifications marked as read.', updated: result.affectedRows"),
  server,
  server.replace('if (body.section === undefined) {', 'if (!body.section) {')
);
proved(
  'a section not in the role’s map is a 400 naming that role’s sections',
  (s) =>
    s.includes("!Object.prototype.hasOwnProperty.call(sections, section)") &&
    s.includes("message: `section must be one of: ${Object.keys(sections).join(', ')}.`,"),
  server,
  server.replace('!Object.prototype.hasOwnProperty.call(sections, section)', '!(section in sections)')
);
proved(
  'a section with no clearable type answers 0 and runs no query',
  (s) => {
    const i = s.indexOf('if (!types.length) {');
    const j = s.indexOf('pool.query(', i);
    return i > -1 && s.slice(i, j).includes("return res.json({ success: true, message: 'Marked as read.', section, updated: 0 });");
  },
  server,
  server.replace("return res.json({ success: true, message: 'Marked as read.', section, updated: 0 });", '// fall through')
);
proved(
  'no ids found, no UPDATE (an empty IN () is not SQL)',
  (s) => /if \(rows\.length\) \{\s*const \[result\] = await pool\.query\(\s*'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = \? AND read_at IS NULL AND id IN \(\?\)'/.test(s),
  server,
  server.replace('if (rows.length) {', 'if (true) {')
);
proved(
  'a clear above 0 signals the caller through the existing helper, and nothing else is emitted',
  (s) =>
    s.includes("const { emitNotifications } = require('../utils/notify');") &&
    s.includes('if (updated > 0) emitNotifications(req, [req.user.id]);') &&
    s.split('emitNotifications(').length - 1 === 1,
  server,
  server.replace('if (updated > 0) emitNotifications(req, [req.user.id]);', 'emitNotifications(req, [req.user.id]);')
);

console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
