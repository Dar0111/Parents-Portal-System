// PROOF — the build 2 fix round (feat/dashboards-look, 2026-10-08): the web
// side of F1–F8 from the owner's device check.
//
// What it RENDERS or DRIVES:
//   F1 — HazardSlot in its three states (nothing, the space HELD invisible
//        while the dashboard loads, the compact notice) — and the held space
//        is the notice's own markup, so the height cannot differ;
//   F3 — Admin → Users rendered at `?role=teacher`, `?role=parent&status=active`
//        and a forged address: the filters open on the preset, applied (no
//        "Changes not applied"), and nothing but a known role / status is
//        read; the dashboard's count links carry the presets;
//   F4 — DataTable's skeleton with and without `skeletonAvatar`: a circle in
//        the first column and on each card placeholder, only when asked;
//   F5 — `shouldScrollToTop`, imported (never read as text — the owner's
//        rule for this proof): PUSH / REPLACE to another pathname scroll, POP
//        and a query-only change do not;
//   F6 — the built stylesheet: the sweep keyframes, three passes, inside
//        `prefers-reduced-motion: no-preference`, the light band per theme;
//        the skeleton region and bars carry no pulse any more;
//   F7 — NavItem rendered expanded and as a rail icon: the focus ring is drawn
//        INSIDE the row;
//   F8 — the skeleton shapes' keys are positional (source), with a negative
//        control that is the phone's old `key={w}` over a repeated width.
// What it reads as SOURCE TEXT, said plainly: the Users card's title (F2) and
// Card.jsx's keys (F8).
//
// WHAT IT CANNOT: the jump (or its absence) on a real load, the sweep moving,
// the ring on a real Tab, a real scroll — the owner's re-check.
//
// Run (from client/, AFTER `npm run build` — F6 reads dist/assets):
//   npx vite build --ssr scripts/ssr-build2-fixes.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-build2-fixes.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HazardSlot from '../src/pages/dashboards/HazardSlot.jsx';
import { CountLinks } from '../src/pages/dashboards/AdminDashboard.jsx';
import UsersPage from '../src/pages/admin/UsersPage.jsx';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import DataTable from '../src/components/DataTable.jsx';
import Skeleton, { SkeletonBar } from '../src/components/Skeleton.jsx';
import { shouldScrollToTop } from '../src/layout/scrollOnNavigate.js';
import { NavItem } from '../src/layout/Shell.jsx';

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
const src = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');
const render = (node, entry = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
const count = (html, re) => (html.match(re) || []).length;
const TITLE = 'This is the only admin account, and its email is not confirmed';

console.log('F1 — the lockout notice: compact, and its space held while the dashboard loads');
{
  const notice = render(<HazardSlot hazard loading={false} emailConfirmed={false} />);
  const reserved = render(<HazardSlot hazard={false} loading emailConfirmed={false} />);
  const confirmedLoading = render(<HazardSlot hazard={false} loading emailConfirmed />);
  const loadedNoHazard = render(<HazardSlot hazard={false} loading={false} emailConfirmed={false} />);
  assert(notice.includes(TITLE) && /data-hazard="notice"/.test(notice) && !/invisible/.test(notice), 'the server says hazard: the notice, visible');
  assert(/href="\/admin\/settings\/account"[^>]*>Confirm your email</.test(notice), '"Confirm your email" is one click away, a link to Account information');
  assert(/<button type="button" aria-expanded="false" aria-controls="([^"]+)"[^>]*>Why this matters/.test(notice), 'the explanation is behind "Why this matters", a button that says it is collapsed');
  const controls = (notice.match(/aria-controls="([^"]+)"/) || [])[1];
  assert(Boolean(controls) && new RegExp(`<p id="${controls}" hidden=""`).test(notice) && notice.includes('a second admin account cannot be created from inside the app'), '…which names a panel that exists, hidden, holding the explanation word for word (§5i)');
  assert(/grow basis-64/.test(notice) && /flex-wrap/.test(notice), 'one row, the action on the right — and it wraps under the text at 390px instead of squeezing it');
  assert(/data-hazard="reserved" aria-hidden="true" inert=""/.test(reserved) && /invisible/.test(reserved), 'loading, email unconfirmed: the SAME notice is laid out invisible, hidden and inert — its space is held, so the cards do not move when it appears');
  assert(reserved.replace(/data-hazard="reserved" aria-hidden="true" inert="" class="([^"]*) invisible"/, 'data-hazard="notice" class="$1 "') === notice.replace(/data-hazard="notice" class="([^"]*) "/, 'data-hazard="notice" class="$1 "'), '…and is the notice\'s own markup, byte for byte apart from those attributes — the held height cannot differ');
  assert(confirmedLoading === '', 'email confirmed: nothing is held — the warning cannot be true');
  assert(loadedNoHazard === '', 'the dashboard answered with no hazard: nothing');
  const old = src('src/pages/dashboards/AdminDashboard.jsx');
  assert(/<HazardSlot\s+hazard=\{Boolean\(d\?\.hazard\?\.single_unverified_admin\)\}\s+loading=\{summary\.loading\}\s+emailConfirmed=\{Boolean\(user\?\.email_verified_at\)\}/.test(old), 'the dashboard passes the server flag, its own loading and the session\'s email state (source)');
}

console.log('\nF2 — the counts card is "Users" (source)');
{
  const admin = src('src/pages/dashboards/AdminDashboard.jsx');
  assert(/title="Users"\s+icon="fa-users"/.test(admin) && !/title="People"/.test(admin), 'titled "Users"; "People" is gone');
  const links = render(<CountLinks totals={{ students: 4, teachers: 3, active_parents: 2 }} />);
  assert(['Students', 'Teachers', 'Parents'].every((l) => links.includes(`>${l}</span>`)), 'the three links keep their names');
}

console.log('\nF3 — Teachers and Parents open Users already filtered to what they count');
{
  const links = render(<CountLinks totals={{ students: 4, teachers: 3, active_parents: 2 }} />);
  assert(/href="\/admin\/students"/.test(links), 'Students → Admin → Students, unchanged');
  assert(/href="\/admin\/users\?role=teacher"/.test(links), 'Teachers → Users, Role = Teacher (the count is every teacher account, any status)');
  assert(/href="\/admin\/users\?role=parent&amp;status=active"/.test(links), 'Parents → Users, Role = Parent + Status = Active (the count is active parents)');
  const page = (entry) => render(<AuthProvider><UsersPage /></AuthProvider>, entry);
  const selected = (html, label) => {
    const at = html.indexOf(`>${label}</label>`);
    const select = html.slice(at, html.indexOf('</select>', at));
    return (select.match(/<option value="([^"]*)" selected="">/) || [])[1] ?? null;
  };
  const teachers = page('/admin/users?role=teacher');
  assert(selected(teachers, 'Role') === 'teacher' && selected(teachers, 'Status') === '', 'at ?role=teacher the Role control shows Teacher and Status shows All statuses');
  assert(!teachers.includes('Changes not applied'), '…APPLIED, not pending: no "Changes not applied"');
  const parents = page('/admin/users?role=parent&status=active');
  assert(selected(parents, 'Role') === 'parent' && selected(parents, 'Status') === 'active' && !parents.includes('Changes not applied'), 'at ?role=parent&status=active: Parent and Active, applied');
  const plain = page('/admin/users');
  assert(selected(plain, 'Role') === '' && selected(plain, 'Status') === '', 'no preset: All roles, All statuses, as before');
  const forged = page('/admin/users?role=superuser&status=x&search=FORGED-MARKER');
  assert(selected(forged, 'Role') === '' && selected(forged, 'Status') === '' && !forged.includes('FORGED-MARKER'), 'an unknown role or status is ignored, and nothing else is read from the address — no search, never a login id or LRN (§5c)');
  assert(/name="status"|>Status<\/label>/.test(plain) && /Reset/.test(teachers), 'the controls are the page\'s own, so the preset can be changed or reset');
}

console.log('\nF4 — an avatar circle in the skeleton where the rows have one');
{
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
  ];
  const card = (r) => ({ title: r.name, avatar: r.name });
  const withAvatar = render(<DataTable columns={columns} rows={[]} loading renderCard={card} skeletonAvatar />);
  const without = render(<DataTable columns={columns} rows={[]} loading renderCard={card} />);
  const CIRCLE = /skeleton-bone block shrink-0 rounded-full bg-edge h-\[2\.375rem\] w-\[2\.375rem\]/g;
  assert(count(withAvatar, CIRCLE) === 3 + 5, 'with `skeletonAvatar`: a circle on each of the three card placeholders and in the first cell of each of the five rows — Avatar\'s md size', String(count(withAvatar, CIRCLE)));
  assert(count(without, CIRCLE) === 0, 'NEGATIVE CONTROL: without it, no circle — a list with no avatar keeps its plain bars');
  const pages = ['src/pages/admin/UsersPage.jsx', 'src/pages/admin/StudentsPage.jsx', 'src/pages/teacher/StudentsPage.jsx'].map((p) => [p, count(src(p), /\n\s+skeletonAvatar\n/g)]);
  assert(pages[0][1] === 2 && pages[1][1] === 1 && pages[2][1] === 1, 'Users (both tables) and both Students pages say so (source; the other avatar lists wait for option 1)', JSON.stringify(pages));
}

console.log('\nF5 — a new page starts at the top (layout/scrollOnNavigate.js, imported)');
assert(shouldScrollToTop({ previousPath: '/admin', nextPath: '/admin/students', navigationType: 'PUSH' }), 'a link or the sidebar to another page (PUSH): to the top');
assert(shouldScrollToTop({ previousPath: '/', nextPath: '/admin', navigationType: 'REPLACE' }), 'a redirect to another page (REPLACE): to the top');
assert(!shouldScrollToTop({ previousPath: '/admin/students', nextPath: '/admin', navigationType: 'POP' }), 'Back / Forward (POP): never — the browser restores the old scroll');
assert(!shouldScrollToTop({ previousPath: '/admin/users', nextPath: '/admin/users', navigationType: 'PUSH' }), 'the same pathname (a filter, ?term=, the Users preset leaving the address): never');
assert(!shouldScrollToTop({ previousPath: '/admin/users', nextPath: '/admin/users', navigationType: 'REPLACE' }), '…a query-only REPLACE included');
assert(!shouldScrollToTop({ previousPath: '/teacher/messages', nextPath: '/teacher/messages/3', navigationType: 'POP' }), 'Back into a thread: not ours — the thread positions itself');

console.log('\nF6 — the sweep (the built stylesheet)');
{
  const distDir = path.resolve('dist/assets');
  const cssFile = fs.existsSync(distDir) ? fs.readdirSync(distDir).find((f) => f.endsWith('.css')) : null;
  assert(Boolean(cssFile), 'dist/assets holds a built stylesheet — run `npm run build` first', distDir);
  const css = cssFile ? fs.readFileSync(path.join(distDir, cssFile), 'utf8') : '';
  // The minifier writes `from` as `0%`, reorders the `animation` shorthand
  // and adds a `color-mix`-free fallback under `@supports` — so the checks
  // read the built CSS by structure, not by one exact spelling.
  assert(/@keyframes skeleton-sweep\{(?:0%|from)\{background-position:-24rem 0\}to\{background-position:100vw 0\}\}/.test(css), 'the keyframes move only the background, from off the left edge to off the right');
  // The whole `prefers-reduced-motion: no-preference` block that holds the
  // sweep, matched brace for brace.
  const blockAt = (text, start) => {
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    return '';
  };
  let media = '';
  for (let at = css.indexOf('@media (prefers-reduced-motion:no-preference)'); at >= 0; at = css.indexOf('@media (prefers-reduced-motion:no-preference)', at + 1)) {
    const candidate = blockAt(css, at);
    if (candidate.includes('.skeleton-bone')) media = candidate;
  }
  const outside = css.replace(media, '');
  assert(media.length > 0 && !outside.includes('.skeleton-bone'), 'every sweep rule sits inside `prefers-reduced-motion: no-preference` — with `reduce` the bars are plain `edge`');
  assert(/animation:(?:1\.5s ease-in-out 3 skeleton-sweep|skeleton-sweep 1\.5s ease-in-out 3)/.test(media), 'three passes of 1.5 s, then still — never on without end');
  assert(/background-attachment:fixed/.test(media) && /color-mix\(in oklab, ?var\(--surface\) 80%, ?transparent\)/.test(media), 'one band across the region (fixed to the window), the light `surface` band in light');
  assert(/\[data-theme=dark\] \[data-skeleton=painted\] \.skeleton-bone\{background-image:linear-gradient\(90deg, ?transparent, ?(?:color-mix\(in oklab, ?)?var\(--edge-strong\)/.test(media), '…and the lighter `edge-strong` band in dark — no new token');
  const painted = renderToStaticMarkup(
    <Skeleton phase="skeleton">
      <SkeletonBar className="h-3 w-1/2" />
    </Skeleton>
  );
  assert(/<div aria-hidden="true" data-skeleton="painted">/.test(painted) && !/animate-|animation-iteration-count/.test(painted), 'the painted region switches the sweep on by its attribute; the old pulse class and its inline count are gone');
  assert(/<span class="skeleton-bone block rounded-md bg-edge h-3 w-1\/2"><\/span>/.test(painted), 'every bar is a `skeleton-bone`');
}

console.log('\nF7 — the nav row\'s focus ring is drawn inside the row');
{
  const item = { to: '/admin/messages', label: 'Messages', icon: 'fa-comments', built: true };
  const row = render(<NavItem item={item} />, '/admin');
  const rail = render(<NavItem item={item} collapsed />, '/admin');
  assert(/focus-visible:-outline-offset-2/.test(row) && !/focus-visible:outline-offset-2/.test(row), 'expanded: the ring sits inside the row, so the nav box (a scroller, no bottom padding) cannot cut it');
  assert(/focus-visible:-outline-offset-2/.test(rail) && !/focus-visible:outline-offset-2/.test(rail), 'the rail icon too');
  assert(/focus-visible:outline-focus-accent/.test(row) && /focus-visible:outline-2/.test(row), 'same colour, same width');
}

console.log('\nF8 — skeleton lists are keyed by position (source)');
{
  // Every `[…].map((w, i) => (<Tag key={…}` and `list.map((w) => (<Tag key={…}`.
  const MAP = /(\[[^\]]*\]|\b\w+)\.map\(\(\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)\s*=>\s*\(?\s*<[\w.]+[^>]*?\bkey=\{([^}]+)\}/g;
  const byValue = (text) => [...text.matchAll(MAP)].filter((m) => m[4].trim() === m[2]).map((m) => m[0].slice(0, 60));
  const card = src('src/pages/dashboards/Card.jsx');
  const shapes = card.slice(card.indexOf('const SKELETON_SHAPES'), card.indexOf('export default function Card('));
  assert([...shapes.matchAll(MAP)].length >= 3 && byValue(shapes).length === 0, 'the web Card\'s skeleton lists key by position, not by width', byValue(shapes).join(' | '));
  // NEGATIVE CONTROL — the phone's code before the fix: `Lines` keyed by width,
  // and the System shape passes `w-1/2` twice.
  const OLD = "function Lines({ widths }) {\n  return (\n    <View>\n      {widths.map((w) => (\n        <View key={w} className=\"h-5 justify-center\">";
  const OLD_CALL = "<Lines widths={['w-1/2', 'w-2/5', 'w-3/4', 'w-1/2']} />";
  const widths = [...OLD_CALL.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert(byValue(OLD).length === 1 && new Set(widths).size < widths.length, 'NEGATIVE CONTROL: the old phone code keys by width, and its System widths repeat `w-1/2` — two siblings, one key (the LogBox error)');
}

console.log(`\nssr-build2-fixes: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
