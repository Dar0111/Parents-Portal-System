// SSR proof: Admin → Activity log (feat/activity-log, B2; FRONTEND §36).
// Every check passes only if its negative control FAILS.
//
// Run from client/:
//   npx vite build --ssr scripts/ssr-activity-log.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-activity-log.js
//
// DRIVEN (pure): pages/admin/activityLog.js — the 7-day default across a month
// end, the request's parameters (a code as `action`, a whole group as
// `group`, empty values not sent), the server catalogue's labels, the
// empty-state sentence word for word (the owner's C2), the download's file
// name from Content-Disposition, the role words.
// RENDERED: the page on its first render — the owner's sentence (C3) word for
// word, Download CSV disabled before the list answers, the four filters with
// their options, no sortable header, no detail anywhere.
// SOURCE: the page — the unwrap list equal to the handler's reply keys, the
// table's key equal to its load's dependencies, no `sortable`, the download
// raw + blob with the applied filters and the server's file name, the cap
// refusal BEFORE any request, no description / login id / user id; the server
// — no statement names the description, the seven fields and nothing else,
// newest first, CORS exposing Content-Disposition; the nav — the item after
// Backup & Restore, in System, WEB_ONLY on the phone, both mirrors equal.
// CANNOT PROVE: a real load, a filter applied, a download saved, the CSV in
// Excel — test:activity-log and the owner's check.

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminActivityLogPage from '../src/pages/admin/ActivityLogPage.jsx';
import {
  GROUP_PREFIX,
  RANGE_DAYS,
  ROLE_OPTIONS,
  defaultFilters,
  downloadFileName,
  emptyCopy,
  filtersToParams,
  roleWord,
  scopeLabel,
} from '../src/pages/admin/activityLog.js';

const CLIENT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(CLIENT, rel), 'utf8').replace(/\r\n/g, '\n');
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

let passed = 0;
let failed = 0;
function check(label, ok, control) {
  // `control` is the same test on a broken input; it must come back false.
  const good = Boolean(ok);
  const refused = control === undefined ? true : !control;
  if (good && refused) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${good ? ' (its control passed too)' : ''}`);
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ---- driven ---------------------------------------------------------------
console.log('-- driven: pages/admin/activityLog.js --');
const week = defaultFilters('2026-10-23');
check('the default is the last 7 days, today included', RANGE_DAYS === 7 && week.from === '2026-10-17' && week.to === '2026-10-23', week.from === '2026-10-16');
check('… across a month end', defaultFilters('2026-11-03').from === '2026-10-28', defaultFilters('2026-11-03').from === '2026-10-27');
check('… with no role and every action', week.role === '' && week.action === '');

const p1 = filtersToParams({ from: '2026-10-17', to: '2026-10-23', role: 'teacher', action: 'login' });
check('a code goes as action', p1.action === 'login' && !('group' in p1) && p1.role === 'teacher', 'group' in p1);
const p2 = filtersToParams({ from: '', to: '', role: '', action: `${GROUP_PREFIX}attendance` });
check('a whole group goes as group, empty values are not sent', p2.group === 'attendance' && Object.keys(p2).length === 1, 'action' in p2);
const p3 = filtersToParams({ from: '2026-10-17', to: '', role: '', action: '' });
check('one bound alone', JSON.stringify(p3) === JSON.stringify({ from: '2026-10-17' }), 'to' in p3);

const CATALOGUE = [
  { key: 'account', label: 'Sign-in and account', actions: [{ code: 'login', label: 'Signed in' }] },
  { key: 'attendance', label: 'Attendance', actions: [{ code: 'excuse_attendance', label: 'Attendance set by an excuse decision' }] },
];
check("a code's label is the server's", scopeLabel(CATALOGUE, 'login') === 'Signed in', scopeLabel(CATALOGUE, 'login') === 'login');
check("a group's label is the server's", scopeLabel(CATALOGUE, `${GROUP_PREFIX}attendance`) === 'Attendance');
check('an unknown code is its own label', scopeLabel(CATALOGUE, 'zz_new') === 'zz_new' && scopeLabel([], 'login') === 'login');

const range = { from: '2026-10-17', to: '2026-10-23' };
const C2 = [
  [{ ...range, role: 'teacher', action: 'login' }, 'No "Signed in" entries for teacher accounts from 17 Oct 2026 to 23 Oct 2026.'],
  [{ ...range, role: 'teacher', action: `${GROUP_PREFIX}attendance` }, 'No Attendance entries for teacher accounts from 17 Oct 2026 to 23 Oct 2026.'],
  [{ ...range, role: 'teacher', action: '' }, 'Nothing recorded for teacher accounts from 17 Oct 2026 to 23 Oct 2026.'],
  [{ ...range, role: '', action: '' }, 'Nothing recorded from 17 Oct 2026 to 23 Oct 2026.'],
  [{ from: '2026-10-17', to: '', role: 'deleted', action: '' }, 'Nothing recorded for deleted accounts since 17 Oct 2026.'],
  [{ from: '', to: '2026-10-23', role: '', action: 'login' }, 'No "Signed in" entries up to 23 Oct 2026.'],
  [{ from: '', to: '', role: 'admin', action: '' }, 'Nothing recorded for admin accounts.'],
];
// The control: a sentence that forgets the role.
const roleBlind = (a) => emptyCopy({ ...a, role: '' }, CATALOGUE);
for (const [applied, sentence] of C2) {
  check(`empty copy: ${sentence}`, emptyCopy(applied, CATALOGUE) === sentence, applied.role ? roleBlind(applied) === sentence : undefined);
}

check('the file name comes from Content-Disposition', downloadFileName('attachment; filename="activity-log_2026-10-17_to_2026-10-23.csv"') === 'activity-log_2026-10-17_to_2026-10-23.csv');
check('… with a fallback when it is missing', downloadFileName(undefined) === 'activity-log.csv' && downloadFileName('attachment') === 'activity-log.csv');
check('… and never a path', downloadFileName('attachment; filename="../x.csv"') === 'activity-log.csv' && downloadFileName('attachment; filename="a\\b.csv"') === 'activity-log.csv');
check('the role words, display only', roleWord('teacher') === 'Teacher' && roleWord('admin') === 'Admin' && roleWord(null) === null && roleWord('deleted') === null);
check('the role options, in order', JSON.stringify(ROLE_OPTIONS.map((r) => r.value)) === JSON.stringify(['', 'admin', 'teacher', 'parent', 'deleted']) && ROLE_OPTIONS[4].label === 'Deleted account');

// ---- rendered -------------------------------------------------------------
console.log('-- rendered: the page on its first render --');
const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/admin/activity-log']}>
    <AdminActivityLogPage />
  </MemoryRouter>
);
const SENTENCE =
  "Entries the portal records, such as sign-ins, changes and downloads. Newest first; times are in Philippine time. For a failed sign-in, a reset request or a password alert, Account is the account it concerned, which may not be who acted. An entry's details are not shown.";
check("the owner's sentence (C3), word for word", html.includes(esc(SENTENCE)), html.includes(esc(SENTENCE.replace('which may not', 'who may not'))));
check('the title is an <h2>, never a second <h1>', /<h2[^>]*>Activity log<\/h2>/.test(html) && !/<h1/.test(html));
const downloadBtn = /<button[^>]*>(?:(?!<\/button>).)*Download CSV<\/button>/s.exec(html)?.[0] || '';
check('Download CSV, disabled until the list answers', /disabled=""/.test(downloadBtn) && /fa-download/.test(downloadBtn), /disabled=""/.test(downloadBtn.replace('disabled=""', '')));
check('From and To are date inputs holding a default', (html.match(/type="date"[^>]*value="\d{4}-\d{2}-\d{2}"/g) || []).length === 2);
const roleSelect = /<select[^>]*>(?:(?!<\/select>).)*Deleted account(?:(?!<\/select>).)*<\/select>/s.exec(html)?.[0] || '';
check('Account role offers All roles, Admin, Teacher, Parent, Deleted account', ['All roles', 'Admin', 'Teacher', 'Parent', 'Deleted account'].every((l) => roleSelect.includes(`>${l}</option>`)));
check('Action starts at All actions', />All actions<\/option>/.test(html));
check('the filter form applies, and Reset is not offered at the default', /type="submit"/.test(html) && !/>Reset</.test(html));
check('no sortable header', !/aria-sort|data-sort/.test(html));
const cleanMarkup = (h) => !/description|login_id|user_id/i.test(h.replace(esc(SENTENCE), ''));
check('no description, login id or user id in the markup', cleanMarkup(html), cleanMarkup(`${html}<td>user_id 7</td>`));

// ---- source ---------------------------------------------------------------
console.log('-- source: the page, the server, the nav --');
const page = read('src/pages/admin/ActivityLogPage.jsx');
const pageCode = noComments(page);
const helper = noComments(read('src/pages/admin/activityLog.js'));
const route = read('../server/routes/activityLogs.js');
const routeCode = noComments(route);

const unwrap = /\.get\('\/activity-logs', \{ unwrap: \[([^\]]*)\]/.exec(pageCode)?.[1] || '';
const unwrapKeys = [...unwrap.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const listReply = /router\.get\('\/', [\s\S]*?return res\.json\(\{([\s\S]*?)\}\);/.exec(routeCode)?.[1] || '';
const replyKeys = [...listReply.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).filter((k) => k !== 'success');
const sameKeys = (u, r) => u.length === 3 && u.every((k) => r.includes(k)) && r.every((k) => u.includes(k));
check("the page's unwrap list is the handler's reply", sameKeys(unwrapKeys, replyKeys), sameKeys(unwrapKeys, ['entries', 'page']));
const deps = /\}, \[([^\]]*)\]\);\n\n  useEffect\(\(\) => \{\n    load\(\);/.exec(pageCode)?.[1];
const key = /queryKey=\{\[([^\]]*)\]\}/.exec(pageCode)?.[1];
const keyed = (d, k) => d === 'applied, offset' && k === d;
check("the table's key is its load's dependencies", keyed(deps, key), keyed(deps, 'applied'));
const unsorted = (src) => !/sortable/.test(src) && !/onSortChange/.test(src);
check('no column sorts (C1: the server sorts)', unsorted(pageCode), unsorted(`${pageCode}\n{ key: 'x', sortable: true }`));
check('the download is raw + blob with the applied filters', /api\.get\('\/activity-logs\/export', \{\s*raw: true,\s*responseType: 'blob',\s*params: filtersToParams\(applied\),/.test(pageCode));
check("the file name is the server's", /downloadFileName\(res\.headers\?\.\['content-disposition'\]\)/.test(pageCode));
const refusal = pageCode.indexOf('if (exportLimit?.message)');
const exportCall = pageCode.indexOf("api.get('/activity-logs/export'");
check('over the cap, the refusal comes BEFORE any request', refusal !== -1 && exportCall !== -1 && refusal < exportCall && /if \(exportLimit\?\.message\) \{\s*setStatus\(\{ download: fail\(exportLimit\.message\) \}\);\s*return;/.test(pageCode));
// A field or key named description — not SectionHeader's `description=` prop,
// which is the page's own sentence.
const noDetail = (src) => !/\.description\b|['"]description['"]|\bdescription:|login_id|user_id/.test(src);
check('no description, login id or user id in the page or its helper', noDetail(pageCode + helper), noDetail(`${pageCode}\n<td>{row.description}</td>`));
check('the account is its name and role only', /row\.actor_name/.test(pageCode) && /roleWord\(row\.actor_role\)/.test(pageCode) && /dateTime\(row\.created_at\)/.test(pageCode));

const unnamed = (src) => !/description/.test(src);
check('no server statement names the description', unnamed(routeCode), unnamed(routeCode.replace("const COLUMNS = 'a.id,", "const COLUMNS = 'a.description, a.id,")));
const columns = /const COLUMNS = '([^']*)'/.exec(routeCode)?.[1] || '';
const FIVE = 'a.id, a.created_at, a.action, u.name AS actor_name, u.role AS actor_role';
check('the SELECT is the five columns the seven fields are built from', columns === FIVE, `${columns}, a.user_id` === FIVE);
const entry = /function entryOf\(row\) \{[\s\S]*?return \{([\s\S]*?)\};/.exec(routeCode)?.[1] || '';
const entryKeys = [...entry.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort();
const SEVEN = JSON.stringify(['action', 'action_group', 'action_label', 'actor_name', 'actor_role', 'created_at', 'id']);
check('an entry is exactly the seven fields', JSON.stringify(entryKeys) === SEVEN, JSON.stringify([...entryKeys, 'user_id'].sort()) === SEVEN);
const newestFirst = (src) => /const ORDER = 'ORDER BY a\.created_at DESC, a\.id DESC';/.test(src);
check('newest first: created_at, then id', newestFirst(routeCode), newestFirst(routeCode.replace("'ORDER BY a.created_at DESC, a.id DESC'", "'ORDER BY a.id DESC'")));
check('every handler is admin only', (routeCode.match(/router\.get\('[^']*', authenticate, authorize\('admin'\)/g) || []).length === 3 && !/authorize\('(teacher|parent)'/.test(routeCode));
const server = noComments(read('../server/server.js'));
check('CORS exposes Content-Disposition', /exposedHeaders: \['Content-Disposition'\]/.test(server) && /app\.use\('\/api\/activity-logs', activityLogsRoutes\);/.test(server));

const nav = read('src/layout/nav.js');
const backups = nav.indexOf("to: '/admin/backups'");
const item = nav.indexOf("{ to: '/admin/activity-log', label: 'Activity log', icon: 'fa-clock-rotate-left', built: true }");
const about = nav.indexOf("to: '/admin/about'");
check('the nav item sits after Backup & Restore and before About', backups !== -1 && item > backups && about > item);
check("in the admin's System group", /\{ label: 'System', paths: \['\/backups', '\/activity-log'\] \}/.test(read('src/layout/navGroups.js')));
check('the route is registered', /<Route path="activity-log" element=\{<AdminActivityLog \/>\} \/>/.test(read('src/App.jsx')));
check('the phone hides it (WEB_ONLY)', /WEB_ONLY = Object\.freeze\(\[[^\]]*'\/admin\/activity-log'[^\]]*\]\)/.test(read('../mobile/src/navigation/routes.js')));
check('both nav mirrors equal their phone copies', read('src/layout/nav.js') === read('../mobile/src/navigation/nav.js') && read('src/layout/navGroups.js') === read('../mobile/src/navigation/navGroups.js'));

console.log(`\n${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
process.exitCode = failed ? 1 : 0;
