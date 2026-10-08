// PROOF — build 2, feat/dashboards-look (2026-10-07), commit 2: the
// dashboards' look, the owner's Part C (decisions 3 and 8; FRONTEND §15e).
//
// What it RENDERS: the dashboard Card (the container corner, no shadow, the
// edge darkening under the pointer, the icon inline before the title in
// `fg-muted` with no chip, the amber frame, the stretched link's corner, the
// four skeleton shapes plus the counts one), the staff ProfileHero (one muted
// line of facts joined by " · ", no pills, no shadow, a parent's login id
// never shown), the parent ChildHero (the container corner, no shadow, the
// labels without uppercase tracking), and the admin's three count links (each
// a real link to its own list, with its label, number and caption).
// What it reads as SOURCE TEXT, said plainly: the three grids — which card
// spans what, the parent order, the Users card with no link of its own.
//
// THE FIX ROUND (2026-10-08) changed two checks in place, same count: the
// counts card is "Users" (F2, "People" before), and Teachers and Parents
// link to Admin → Users with the preset each counts (F3). The new findings
// are proved in ssr-build2-fixes.
//
// WHAT IT CANNOT: the look at each width, the hover, the fill judged by eye —
// the owner's browser check.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-dashboards.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-dashboards.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Card, { Stat } from '../src/pages/dashboards/Card.jsx';
import ProfileHero from '../src/pages/dashboards/ProfileHero.jsx';
import { ChildHero } from '../src/pages/dashboards/ParentDashboard.jsx';
import { CountLinks } from '../src/pages/dashboards/AdminDashboard.jsx';

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
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const count = (html, re) => (html.match(re) || []).length;

console.log('The card (rendered)');
const linked = render(
  <Card title="Upcoming events" icon="fa-calendar-days" to="/parent/events">
    <Stat value="Sports day" caption="Next event" />
  </Card>
);
const section = (linked.match(/<section class="([^"]*)"/) || [])[1] || '';
assert(/\brounded-xl\b/.test(section) && !/rounded-2xl/.test(section), 'the container corner, rounded-xl (§27f)', section);
assert(!/shadow/.test(section), 'no shadow at rest, and none under the pointer');
assert(/\bhover:border-edge-strong\b/.test(section) && /\btransition-colors\b/.test(section), 'a linked card darkens its edge under the pointer — a colour, not a lift');
assert(
  /<div class="mb-3 flex min-w-0 items-baseline gap-2"><i aria-hidden="true" class="fa-solid fa-fw fa-calendar-days shrink-0 text-sm text-fg-muted"><\/i><h2 class="min-w-0 flex-1 font-serif text-base font-bold text-fg">/.test(linked),
  'the icon is INLINE before the title, `fg-muted`, decoration — one header row, the title in the title face'
);
assert(!/h-9 w-9/.test(linked) && !/bg-brand-soft/.test(linked), 'no tinted chip');
assert(/class="card-link [^"]*after:rounded-xl/.test(linked), 'the stretched link’s corner is the card’s');
const amber = render(<Card title="Waiting for approval" icon="fa-user-clock" to="/admin/users" tone="warning" />);
assert(/border-warning-edge bg-warning-soft/.test(amber) && /rounded-xl/.test(amber), 'the amber frame stays, on the same corner (§12)');
const plain = render(<Card title="Messages" icon="fa-comments" />);
assert(!/hover:border-edge-strong/.test(plain), 'a card with no link has no hover edge');
// NEGATIVE CONTROL: build 1's card, as it shipped, fails the look checks.
const OLD = 'group relative flex flex-col rounded-2xl border shadow-xs border-edge bg-surface p-5 transition-shadow hover:shadow-md';
assert(/rounded-2xl/.test(OLD) && /shadow/.test(OLD) && !/hover:border-edge-strong/.test(OLD), 'NEGATIVE CONTROL: the old card’s classes (16px, shadow, lift) fail every look check above');
const counts = render(<Card title="Users" icon="fa-users" loading skeleton="counts" />);
assert(/sm:grid-cols-3/.test(counts) && count(counts, /min-h-11 px-3 py-2/g) === 3, 'the Users card’s skeleton is its three counts');

console.log('\nThe staff hero (rendered)');
const facts = [
  { key: 'today', label: 'Wednesday, 7 October 2026' },
  { key: 'year', label: 'School year 2026-2027' },
  null,
  { key: 'term', label: 'Term 1' },
];
const staff = render(<ProfileHero user={{ role: 'teacher', name: 'Rosa Diaz', login_id: 'T-X' }} facts={facts} />);
assert(/<section class="brand-panel-art rounded-xl border border-edge bg-brand-panel p-5 text-brand-panel-fg sm:p-6">/.test(staff), 'the container corner, no shadow');
assert(staff.includes('<p class="mt-4 text-sm text-brand-panel-muted">Wednesday, 7 October 2026 · School year 2026-2027 · Term 1</p>'), 'the facts are ONE muted line, joined by " · " — a missing fact simply left out');
assert(!/rounded-full bg-surface/.test(staff) && !/<li/.test(staff), 'no pills');
const parentHero = render(<ProfileHero user={{ role: 'parent', name: '', login_id: 'P-SECRET' }} facts={facts} />);
assert(!parentHero.includes('P-SECRET'), 'a parent’s login id is never shown (§5c)');

console.log('\nThe parent hero (rendered)');
const child = renderToStaticMarkup(
  <ChildHero
    linked
    user={{ name: 'A Parent', student_first_name: 'Nino', student_last_name: 'Alcantara', grade_level: 1, section: 'Mabait' }}
    section={{ loading: false, data: { adviser_name: 'Lito Bautista' } }}
    grades={{ descriptive: false, average: 88.05, subjects_recorded: 8, subjects_total: 8 }}
    term={1}
    letterTerm={null}
    monthDays={{ present: 9, total: 10 }}
    letter={{ data: null }}
  />
);
assert(/<section class="brand-panel-art rounded-xl border border-edge bg-brand-panel p-5 text-brand-panel-fg sm:p-6">/.test(child), 'the container corner, no shadow');
assert(child.includes('<h2 class="text-sm font-semibold text-brand-panel-muted">Your child</h2>'), '"Your child" is plain words, no uppercase tracking');
assert(['General average', 'Present this month', 'Latest excuse letter'].every((w) => child.includes(`<p class="text-sm font-semibold text-brand-panel-muted">${w}</p>`)), 'the three figures’ labels too');
assert(!/uppercase/.test(child), 'nothing in the hero is uppercase');

console.log('\nThe admin’s three counts — the one card that is not its own link (rendered)');
const links = render(<CountLinks totals={{ students: 4, teachers: 3, active_parents: 2 }} />);
assert(count(links, /<a [^>]*href="\/admin\/students"/g) === 1 && count(links, /<a [^>]*href="\/admin\/users\?role=(?:teacher|parent&amp;status=active)"/g) === 2, 'Students opens Admin → Students; Teachers and Parents open Admin → Users, each with the preset it counts (F3)');
assert(['Students', 'Teachers', 'Parents'].every((l) => links.includes(`>${l}</span>`)) && ['on the roll', 'teacher accounts', 'active parent accounts'].every((c) => links.includes(c)), 'each link carries its label, its number and its caption — its name');
assert(count(links, /class="flex min-h-11 [^"]*focus-visible:outline-focus-accent"/g) === 3 && count(links, /rounded-lg/g) === 3, 'each is a 44px target with the control radius and the shared focus outline');
assert(/>4</.test(links) && />3</.test(links) && />2</.test(links), 'the numbers are the server’s totals');

console.log('\nThe three grids (source)');
const admin = src('src/pages/dashboards/AdminDashboard.jsx');
const usersAt = admin.indexOf('title="Users"');
const usersCard = usersAt >= 0 ? admin.slice(usersAt - 40, admin.indexOf('<CountLinks totals')) : '';
assert(usersCard.length > 0 && !/\bto=/.test(usersCard) && /className="sm:col-span-2"/.test(usersCard), 'admin: the Users card has NO link of its own and spans two columns');
assert(/title="Waiting for approval"[\s\S]{0,120}className="sm:col-span-2"/.test(admin) && /className="sm:col-span-2 lg:col-span-4"/.test(admin) && /lg:grid-cols-4/.test(admin), 'admin: Waiting for approval leads across two columns; System runs across the page');
assert(!/\bcompact\b\n/.test(admin) && !/\n\s+compact\n/.test(admin), 'admin: no compact tiles left');
const teacher = src('src/pages/dashboards/TeacherDashboard.jsx');
assert(/title="Excuse letters to review"[\s\S]{0,140}className="sm:col-span-2"/.test(teacher), 'teacher: the letters card leads across two columns');
const parent = src('src/pages/dashboards/ParentDashboard.jsx');
const order = ['title="Grades"', 'title="Attendance"', 'title="Messages"', 'title="Excuse letters"', 'title="Upcoming events"', 'title="Announcements &amp; memos"'].map((t) => parent.indexOf(t));
assert(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'parent: Grades, Attendance, Messages, Excuse letters, Upcoming events, then Announcements & memos — the phone’s order too');
assert(/title="Grades"[\s\S]{0,80}className="sm:col-span-2"/.test(parent) && /title="Announcements &amp; memos"[\s\S]{0,120}className="sm:col-span-2 lg:col-span-3"/.test(parent), 'parent: Grades leads across two columns beside Attendance; Announcements runs across the page');
assert(/<ul className="mt-3 divide-y divide-edge-soft border-t border-edge-soft">/.test(parent), 'parent: Announcements & memos is a list, a hairline between rows');

console.log(`\nssr-dashboards: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
