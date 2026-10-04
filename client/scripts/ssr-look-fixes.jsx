// PROOF — feat/look-fixes (build 1, 2026-10-05): the flagged screens' web
// fixes, the shape scale, and the four small KNOWN_ISSUES fixes.
//
// What it drives directly (pure or rendered):
//   - components/focusTrap.js `nextFocusIndex` — Tab and Shift+Tab wrap;
//   - api/tickets.js — two fake loads resolving OUT OF ORDER: the newest wins,
//     with a negative control that applies every reply and shows the old one;
//   - buttonClass / cardClass / FormField's control / StatusBadge — the radius
//     scale, the constant borders, no shadow, the accent focus border;
//   - TermValue vs GradeValue on a Grade 1 Final letter (why the admin Grades
//     page needed two renderers).
// What it reads as SOURCE TEXT, said plainly: the trap's callers and its
// effect's dependencies, the drawer's Escape and name, the thread spinner and
// title rules in both thread pages, the pickers handing the name over, the
// Unread and class-record tickets, the admin Grades descriptive rules, and
// DataTable's corners following the frame.
//
// WHAT IT CANNOT: a real Tab or Escape press, focus returning to the opener,
// the spinner not blinking while a message arrives, the badge after a real
// race, the look itself — the owner's browser check.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-look-fixes.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-look-fixes.js

import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { nextFocusIndex } from '../src/components/focusTrap.js';
import { createTickets } from '../src/api/tickets.js';
import { buttonClass, cardClass } from '../src/components/buttonClass.js';
import { controlClass } from '../src/components/FormField.jsx';
import StatusBadge from '../src/components/StatusBadge.jsx';
import TermValue from '../src/format/TermValue.jsx';
import GradeValue from '../src/format/grade.jsx';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('The focus trap — where Tab goes (pure)');
assert(nextFocusIndex(3, 2, false) === 0, 'Tab on the last control wraps to the first');
assert(nextFocusIndex(3, 0, true) === 2, 'Shift+Tab on the first control wraps to the last');
assert(nextFocusIndex(3, 1, false) === null && nextFocusIndex(3, 1, true) === null, 'in the middle: the browser moves as it would');
assert(nextFocusIndex(3, -1, false) === 0 && nextFocusIndex(3, -1, true) === 2, 'from the container itself (first focus): Tab to the first, Shift+Tab to the last');
assert(nextFocusIndex(0, -1, false) === -1 && nextFocusIndex(0, -1, true) === -1, 'nothing focusable: focus stays on the container');

console.log('The focus trap — its callers and its effect (source)');
const trap = src('src/components/focusTrap.js');
const modal = src('src/components/Modal.jsx');
const shell = src('src/layout/Shell.jsx');
assert(/\}, \[ref, active\]\);/.test(trap), 'the trap effect depends on the ref and the open state only — never on anything that changes while typing');
assert(/const opener = document\.activeElement;[\s\S]*container\.focus\(\);/.test(trap) && /document\.contains\(opener\)\) opener\.focus\(\)/.test(trap), 'it takes the opener before focusing the panel, and gives focus back to it on close');
assert(/useFocusTrap\(panelRef, open\);/.test(modal), 'Modal calls it with `open`');
assert(!/panelRef\.current\?\.focus\(\)/.test(modal), "Modal's own effect no longer focuses the panel (the trap does, once, after taking the opener)");
assert(/\}, \[open\]\);/.test(modal), "Modal's Escape/scroll-lock effect still depends on `open` only");
const drawer = shell.slice(shell.indexOf('function Drawer('), shell.indexOf('function Drawer(') + 2500);
assert(/useFocusTrap\(panelRef, true, \{ onEscape: onClose \}\);/.test(drawer), 'the web drawer calls it, and Escape closes the drawer as its close button does');
assert(/tabIndex=\{-1\}/.test(drawer) && /aria-label="Menu"/.test(drawer) && /<aside/.test(drawer), 'the drawer panel takes focus (tabIndex -1) and is named "Menu" on its <aside>');
assert(/event\.key === 'Escape' && escapeRef\.current/.test(trap) && /escapeRef\.current = onEscape;/.test(trap), 'onEscape is read through a ref, so a new close function never re-runs the trap');

console.log('Latest reply wins — two fake loads out of order (pure)');
{
  const tickets = createTickets();
  let shown = null;
  const load = async (value, delay) => {
    const t = tickets.take();
    await sleep(delay);
    if (!tickets.isLatest(t)) return;
    shown = value;
  };
  await Promise.all([load('older', 40), load('newer', 5)]);
  assert(shown === 'newer', 'the older reply lands last and is dropped: the newer one stays');
  let naive = null;
  const naiveLoad = async (value, delay) => {
    await sleep(delay);
    naive = value;
  };
  await Promise.all([naiveLoad('older', 40), naiveLoad('newer', 5)]);
  assert(naive === 'older', 'NEGATIVE CONTROL: applying every reply shows the older one — the defect');
  const t = createTickets();
  const a = t.take();
  const b = t.take();
  assert(!t.isLatest(a) && t.isLatest(b), 'a ticket is latest only until the next one is taken');
}

console.log('The two readers that take a ticket now (source)');
const unread = src('src/realtime/UnreadProvider.jsx');
assert(/const ticket = tickets\.take\(\);/.test(unread) && /if \(!tickets\.isLatest\(ticket\)\) return; \/\/ a newer read has started\n\s+setUnread\(rows\.reduce/.test(unread), 'UnreadProvider: a reply that is no longer the newest sets no count and reaches no listener');
assert(/if \(tickets\.isLatest\(ticket\)\) setUnread\(0\);/.test(unread), '…and a stale failure does not zero the badge');
const record = src('src/pages/teacher/classRecord/useClassRecord.js');
assert(/const ticket = loadTickets\.take\(\);/.test(record) && /if \(!loadTickets\.isLatest\(ticket\)\) return; \/\/ a newer load has started\n\s+setServer\(data\);/.test(record), "the class record's load applies only its latest reply");
assert(/if \(loadTickets\.isLatest\(ticket\)\) setLoading\(false\);/.test(record) && /previewTicket/.test(record), '…its loading flag too; the preview keeps its own ticket');

console.log('The web message thread — spinner and title (source, both pages)');
for (const role of ['teacher', 'parent']) {
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`);
  const load = page.slice(page.indexOf('const load = useCallback'), page.indexOf('const load = useCallback') + 2400);
  assert(/setLoading\(loadedForRef\.current !== otherId \|\| messagesRef\.current\.length === 0\);/.test(load) && !/setLoading\(true\)/.test(load), `${role}: the spinner only on a thread's first load or while it is empty`);
  assert(/if \(loadedForRef\.current !== otherId\) setMessages\(\[\]\);/.test(load), `${role}: a failed re-read keeps the list`);
  assert(/\(m\.sender_id === otherId && m\.sender_name\) \|\| \(m\.receiver_id === otherId && m\.receiver_name\)/.test(page), `${role}: the other person comes only from a message that carries their name`);
  assert(/usePageTitle\(other\?\.name \|\| pickedName \|\| 'Conversation'\);/.test(page) && /location\.state\?\.name/.test(page), `${role}: a new thread is titled with the picked person's name`);
  const list = src(`src/pages/${role}/MessagesPage.jsx`);
  assert(new RegExp(`navigate\\(\`/${role}/messages/\\$\\{c\\.id\\}\`, \\{ state: \\{ name: c\\.name \\} \\}\\)`).test(list), `${role}: the New-message picker hands the contact's name over in router state (never the URL)`);
}

console.log('Admin → Grades on a descriptive card');
const letterFinal = renderToStaticMarkup(<TermValue entry={{ descriptive_grade: 'A', descriptor: { descriptor: 'Outstanding' } }} mode="descriptive" />);
assert(letterFinal.includes('>A<') && !letterFinal.includes('N/A'), 'TermValue prints a Final letter as the letter');
const viaGradeValue = renderToStaticMarkup(<GradeValue value="A" mode="descriptive" whole />);
assert(viaGradeValue.includes('N/A'), 'NEGATIVE CONTROL: GradeValue prints the same letter as "— N/A" — the defect');
const grades = src('src/pages/admin/GradesPage.jsx');
assert((grades.match(/mode === 'descriptive' \? \(\s*<TermValue entry=\{\{ descriptive_grade: row\.final_grade, descriptor: row\.final_grade_descriptor \}\} mode=\{mode\} \/>/g) || []).length === 2, 'the Final goes through TermValue in descriptive mode — the table column and the small-screen card');
assert(/report && subjects\.length && mode !== 'descriptive' \? \(/.test(grades), 'the General Average card is hidden only in descriptive mode (Grade 1); Grades 2–3 keep it');

console.log('The shape scale and the constant borders');
const variants = ['primary', 'secondary', 'ghost', 'danger', 'danger-outline', 'success'];
const classes = Object.fromEntries(variants.map((v) => [v, buttonClass({ variant: v })]));
assert(variants.every((v) => / rounded-lg /.test(` ${classes[v]} `) && / border /.test(` ${classes[v]} `)), 'every button variant is rounded-lg with a 1px border');
assert(variants.every((v) => /\bborder-(primary|edge-strong|transparent|danger-solid|danger-edge|success-solid)\b/.test(classes[v])), 'every variant names its border colour');
assert(/border-primary/.test(classes.primary) && /hover:border-primary-hover/.test(classes.primary) && /border-danger-solid/.test(classes.danger) && /hover:border-danger-solid-hover/.test(classes.danger) && /border-success-solid/.test(classes.success) && /hover:border-success-solid-hover/.test(classes.success), 'the filled variants border in their own fill colour, hover included');
assert(/border-transparent/.test(classes.ghost), 'ghost has a transparent border');
assert(variants.every((v) => !/shadow/.test(classes[v])), 'no button carries a shadow');
assert(cardClass === 'rounded-xl border border-edge bg-surface', 'the card is the 12px container with its hairline and no shadow at rest');
assert(/rounded-lg/.test(controlClass) && /focus:border-focus-accent/.test(controlClass) && !/focus-edge/.test(controlClass), 'an input is the 8px control, and its focus border is the accent (5.17:1 / 6.97:1)');
const badge = renderToStaticMarkup(<StatusBadge status="active" />);
assert(/rounded-md/.test(badge) && !/rounded-full/.test(badge), 'a status badge is a 6px tag, not a pill');
const table = src('src/components/DataTable.jsx');
assert(!/rounded-(t|b|tl|tr|bl|br)-2xl/.test(table) && /first:rounded-t-xl/.test(table), "DataTable's inner corners follow the frame's 12px");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
