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
// THE FIX ROUND (2026-10-05) adds: FilterActions RENDERED (Apply, Reset and
// the cue as one group) and the eight rows' `items-start` (source); C1's text;
// the picked-name fallback in both thread headings; the send guard in both
// thread pages (source, each with a negative control) and its mechanism as a
// model with a negative control; a held Enter (pure); the admin Grades
// sections and learner Retries (source).
//
// ADMIN MESSAGES (feat/admin-messages, 2026-10-05) adds: the admin's nav item
// and its group (driven through nav.js and navGroups.js), the admin routes,
// the parent pages' role-based base path and single Teachers group, the
// teacher thread's hand-off only on a parent's thread, the five copy changes
// (the two refusals read from server/routes/messages.js), and finding #11 —
// the list scrolls itself, never the page — each thread page with a negative
// control (source).
//
// BUILD 2 (feat/dashboards-look, 2026-10-07) turns the drawer's <aside>
// assertion into the modal dialog's, and adds the two drawer defects — closed
// on crossing `md`, and Log out from the drawer closing it before it asks —
// each with a negative control, and the menu button's two attributes (source).
//
// WHAT IT CANNOT: a real Tab or Escape press, focus returning to the opener,
// the spinner not blinking while a message arrives, the badge after a real
// race, the look itself, where the cue actually wraps at a given width, a
// real double click or held key — the owner's browser check.
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
import FilterActions from '../src/components/FilterActions.jsx';
import { shouldSendOnEnter } from '../src/components/enterToSend.js';
import { navForRole } from '../src/layout/nav.js';
import { groupNav } from '../src/layout/navGroups.js';
import { gridHeight, snapToSlot } from '../src/layout/navScroll.js';

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
const drawer = shell.slice(shell.indexOf('function Drawer('), shell.indexOf('\nexport default function Shell('));
assert(/useFocusTrap\(panelRef, true, \{ onEscape: onClose \}\);/.test(drawer), 'the web drawer calls it, and Escape closes the drawer as its close button does');
// Build 2 (feat/dashboards-look, 2026-10-07, decision 2): the panel is a
// modal dialog, not an <aside> — and it still never prints.
const DIALOG = /<div\s+ref=\{panelRef\}\s+role="dialog"\s+aria-modal="true"\s+aria-label="Menu"\s+tabIndex=\{-1\}\s+className="[^"]*\bprint:hidden\b[^"]*"/;
assert(DIALOG.test(drawer) && !/<aside/.test(drawer), 'the drawer panel is <div role="dialog" aria-modal="true" aria-label="Menu">, takes focus (tabIndex -1), and is print:hidden — no <aside> left in the Drawer');
assert(/<div className="fixed inset-0 z-40 md:hidden print:hidden">/.test(drawer), '…and its wrapper is print:hidden too, so the backdrop never prints');
assert(!DIALOG.test(drawer.replace('aria-modal="true"', '')), 'NEGATIVE CONTROL: without aria-modal the dialog assertion fails');
assert(/event\.key === 'Escape' && escapeRef\.current/.test(trap) && /escapeRef\.current = onEscape;/.test(trap), 'onEscape is read through a ref, so a new close function never re-runs the trap');

console.log('The drawer defects (build 2, decision 4) — source');
// Defect 2: the drawer kept trapping Tab after the window crossed `md`.
assert(/const DRAWER_GONE = '\(min-width: 48rem\)';/.test(shell), "the drawer's \"gone\" query is 48rem — Tailwind's `md`, in the browser's rem");
assert(
  /const wide = window\.matchMedia\(DRAWER_GONE\);[\s\S]*?if \(wide\.matches\) closeRef\.current\(\);[\s\S]*?wide\.addEventListener\('change', onChange\);[\s\S]*?return \(\) => wide\.removeEventListener\('change', onChange\);/.test(drawer),
  'crossing `md` closes the drawer (its trap goes with it), and the listener is removed when it closes'
);
assert(/closeRef\.current = onClose;/.test(drawer), '…through a ref, so a new close function every render never re-adds the listener');
// Defect 1: Log out from the open drawer left two focus traps active.
const DRAWER_LOGOUT = /function handleDrawerLogout\(\) \{\n\s+closeDrawer\(\);\n\s+handleLogout\(\);\n\s+\}/;
assert(DRAWER_LOGOUT.test(shell), 'Log out from the drawer closes the drawer FIRST, then asks (requestLeave) — one trap, the dialog’s');
assert(!DRAWER_LOGOUT.test(shell.replace(/(function handleDrawerLogout\(\) \{\n\s+)closeDrawer\(\);\n\s+/, '$1')), 'NEGATIVE CONTROL: without the closeDrawer() line the assertion fails');
assert(
  /<UserCard user=\{user\} onLogout=\{handleDrawerLogout\} onNavigate=\{closeDrawer\} \/>/.test(shell) &&
    /<UserCard user=\{user\} collapsed=\{collapsed\} onLogout=\{handleLogout\} \/>/.test(shell),
  "the drawer's user card uses it; the sidebar's keeps the plain handleLogout (no drawer to close)"
);
const header = src('src/layout/Header.jsx');
assert(/aria-label="Open menu"\s+aria-haspopup="dialog"\s+aria-expanded=\{drawerOpen\}/.test(header), 'the menu button says aria-haspopup="dialog" and aria-expanded while the drawer is open');

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
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`) + src('src/pages/messages/MessageThread.jsx'); // the role's wrapper and the shared thread (feat/shared-messages)
  const load = page.slice(page.indexOf('const load = useCallback'), page.indexOf('const load = useCallback') + 2400);
  assert(/setLoading\(loadedForRef\.current !== otherId \|\| messagesRef\.current\.length === 0\);/.test(load) && !/setLoading\(true\)/.test(load), `${role}: the spinner only on a thread's first load or while it is empty`);
  assert(/if \(loadedForRef\.current !== otherId\) setMessages\(\[\]\);/.test(load), `${role}: a failed re-read keeps the list`);
  assert(/\(m\.sender_id === otherId && m\.sender_name\) \|\| \(m\.receiver_id === otherId && m\.receiver_name\)/.test(page), `${role}: the other person comes only from a message that carries their name`);
  assert(/usePageTitle\(other\?\.name \|\| pickedName \|\| 'Conversation'\);/.test(page) && /location\.state\?\.name/.test(page), `${role}: a new thread is titled with the picked person's name`);
  const list = src(`src/pages/${role}/MessagesPage.jsx`) + src('src/pages/messages/ConversationsPage.jsx'); // the role's wrapper and the shared page
  if (role === 'teacher') assert(/base="\/teacher\/messages"/.test(list), 'teacher → Messages: the shared page is handed /teacher/messages as its base');
  // The parent page's links take their base from the role since 2026-10-05
  // (the admin's inbox is the same page), so its picker navigates to
  // `${base}/<id>`; the teacher's named its own path until feat/shared-messages.
  // Since feat/shared-messages both roles' pickers are the one shared page,
  // navigating through `${base}` (the teacher's wrapper passes its path).
  const pickerBase ='\\$\\{base\\}';
  assert(new RegExp(`navigate\\(\`${pickerBase}/\\$\\{c\\.id\\}\`, \\{ state: \\{ name: c\\.name \\} \\}\\)`).test(list), `${role}: the New-message picker hands the contact's name over in router state (never the URL)`);
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

// ------------------------------------------------ the build 1 fix round
// (2026-10-05) — the owner's device-check findings 1, 2, 3, 5 and 6.

console.log('Fix round 1 — the filter cue stays with Apply (rendered + source)');
const cueDirty = renderToStaticMarkup(<FilterActions dirty canReset onReset={() => {}} />);
const CUE_GROUP =
  /^<div class="flex grow basis-0 flex-col"><span aria-hidden="true" class="mb-1\.5 block text-sm font-semibold max-sm:hidden">(?: |&nbsp;)<\/span><div class="flex flex-wrap items-center gap-x-3 gap-y-1"><button type="submit"[^>]*>Apply<\/button><button type="button"[^>]*>Reset<\/button><p role="status" class="whitespace-nowrap text-sm font-semibold text-brand">/;
assert(CUE_GROUP.test(cueDirty), 'Apply, Reset and the cue are ONE group — a label-height spacer, then one wrapping row that starts with Apply — so the cue can only wrap under Apply, never onto a line under the first filter', cueDirty.slice(0, 200));
assert(!/translate-y/.test(cueDirty), 'no transform lifts the cue any more: the row centres it');
const FILTER_PAGES = ['admin/UsersPage', 'admin/AnnouncementsPage', 'admin/StudentsPage', 'admin/AttendancePage', 'teacher/ExcuseLettersPage', 'teacher/EventsPage', 'teacher/AttendanceRecordsPage', 'teacher/StudentsPage'];
const startRows = FILTER_PAGES.filter((p) => {
  const s = src(`src/pages/${p}.jsx`);
  return /<FilterActions/.test(s) && /flex flex-wrap items-start gap-3 p-4/.test(s) && !/flex flex-wrap items-end gap-3 p-4/.test(s);
});
assert(startRows.length === FILTER_PAGES.length, 'all eight filter rows are items-start, so Apply sits level with the inputs under the spacer whatever wraps below it', `missing: ${FILTER_PAGES.filter((p) => !startRows.includes(p)).join(', ')}`);

console.log('Fix round 2 — C1, the descriptive Final sentence (source)');
const C1 = 'The final letter for a learning area is worked out from the scores of all three terms, so it appears once every term has its scores recorded.';
const reportCardSrc = src('src/pages/parent/ReportCard.jsx');
assert(reportCardSrc.includes(`'${C1}'`) && !reportCardSrc.includes('The final letter for a learning area appears once all three terms are recorded.'), "C1: the Final needs every term's SCORES — not merely three letters on the card (Nino's legacy letters have none)");

console.log('Fix rounds 3 and 5 — the thread heading and the send guard (source + a model)');
for (const role of ['teacher', 'parent']) {
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`) + src('src/pages/messages/MessageThread.jsx'); // the role's wrapper and the shared thread (feat/shared-messages)
  assert(/<Avatar name=\{other\?\.name \|\| pickedName\} \/>/.test(page) && /\{other\?\.name \|\| pickedName \|\| 'Conversation'\}<\/h2>/.test(page), `${role}: the thread card's avatar and heading fall back to the picked name, as the title does`);
  const at = page.indexOf('async function send(event)');
  const sendFn = page.slice(at, at + 1600);
  const GUARD = /if \(sendingRef\.current\) return;[\s\S]*?sendingRef\.current = true;[\s\S]*?await api\.post\([\s\S]*?finally \{\s*sendingRef\.current = false;/;
  assert(at > 0 && GUARD.test(sendFn), `${role}: send() is guarded by a REF — checked first, set before the POST, cleared in finally`);
  assert(!GUARD.test(sendFn.replace('if (sendingRef.current) return;', '')), `NEGATIVE CONTROL (${role}): with the ref check taken out, the guard assertion fails`);
}
// The mechanism, modelled: `sending` is the render's state, still false for a
// second submit in the same tick; the ref is not.
function sendModel(withRef) {
  let posts = 0;
  const sending = false;
  const ref = { current: false };
  async function send() {
    if (sending) return;
    if (withRef && ref.current) return;
    if (withRef) ref.current = true;
    posts += 1;
    await sleep(5); // the POST in flight
    if (withRef) ref.current = false;
  }
  return async () => {
    await Promise.all([send(), send()]);
    return posts;
  };
}
assert((await sendModel(true)()) === 1, 'two submits in one tick: ONE post with the ref guard');
assert((await sendModel(false)()) === 2, 'NEGATIVE CONTROL: the state check alone lets both through — two posts');
const enter = (extra = {}) => ({ key: 'Enter', ...extra });
assert(shouldSendOnEnter(enter({ repeat: true }), { sending: false, draft: 'Hello' }) === false, "a held Enter's auto-repeats never send");
assert(shouldSendOnEnter(enter(), { sending: false, draft: 'Hello' }) === true, 'CONTROL: the first press still sends');

console.log('Fix round 6 — admin Grades reads its sections again (source)');
const gradesFix = src('src/pages/admin/GradesPage.jsx');
assert(/\.catch\(\(err\) => \{\s*if \(!cancelled\) setSectionsError\(extractError\(err\)\);\s*\}\);\s*return \(\) => \{\s*cancelled = true;\s*\};\s*\}, \[sectionsAttempt\]\);/.test(gradesFix), 'a failed sections read keeps the last list and sets the error — the effect keyed by sectionsAttempt');
assert(/\{grade && sectionsError \? \(\s*<ErrorAlert message=\{sectionsError\} onRetry=\{\(\) => setSectionsAttempt\(\(n\) => n \+ 1\)\} \/>/.test(gradesFix), 'with a grade picked, the sections error shows with Retry');
assert(/<ErrorAlert message=\{studentsError\} onRetry=\{\(\) => setStudentsAttempt\(\(n\) => n \+ 1\)\} \/>/.test(gradesFix) && /\}, \[grade, sectionName, studentsAttempt\]\);/.test(gradesFix), 'the learner list has its Retry, keyed into its effect');

// ------------------------------------------------ admin Messages
// (feat/admin-messages, 2026-10-05) — the owner's decisions of that day.

console.log("Admin Messages — the nav item and its group (driven)");
const adminNav = navForRole('admin');
const adminMsgAt = adminNav.findIndex((i) => i.to === '/admin/messages');
const adminMsg = adminNav[adminMsgAt];
assert(adminNav.length === 10 && adminMsg?.built === true && adminMsg.label === 'Messages' && adminMsg.icon === 'fa-comments', "the admin's nav has 10 items, Messages among them, built, with the other roles' Messages icon");
assert(adminMsgAt > 0 && adminNav[adminMsgAt - 1].to === '/admin/announcements', '…directly after Announcements');
assert(['teacher', 'parent'].every((r) => navForRole(r).find((i) => i.to === `/${r}/messages`)?.icon === adminMsg?.icon), "CONTROL: the teacher's and parent's Messages carry that same icon");
const adminGroups = groupNav('admin', adminNav).groups;
const communicate = adminGroups.find((g) => g.label === 'Communicate');
assert(communicate && communicate.items.map((i) => i.to).join(',') === '/admin/announcements,/admin/messages', "the admin's Communicate group is Announcements then Messages");
assert(adminGroups.every((g) => g.label !== null), 'no admin item falls into the unlabelled leftover group');

console.log('Admin Messages — the routes, the base path, one group (source)');
const app = src('src/App.jsx');
const adminBlock = app.slice(app.indexOf('path="/admin"'), app.indexOf('path="/teacher"'));
assert(/<Route path="messages" element=\{<ParentMessages \/>\} \/>/.test(adminBlock) && /<Route path="messages\/:userId" element=\{<ParentMessageThread \/>\} \/>/.test(adminBlock), 'the /admin layout route renders the parent Messages list and thread');
const parentList = src('src/pages/parent/MessagesPage.jsx') + src('src/pages/messages/ConversationsPage.jsx'); // wrapper + shared page (feat/shared-messages)
assert(/const isAdmin = user\?\.role === 'admin';/.test(parentList) && /const base = isAdmin \? '\/admin\/messages' : '\/parent\/messages';/.test(parentList), 'the list page takes its base path from the signed-in role');
assert(!/['`]\/parent\/messages\//.test(parentList) && (parentList.match(/`\$\{base\}\//g) || []).length === 4, '…every thread link uses it — the Open button, the card, the row (fix round W2) and the picker — and none names /parent/messages/');
// Since feat/shared-messages the wrapper names its groups and the shared page
// fills each with the contacts of that role.
assert(/const GROUPS = Object\.freeze\(\[\{ role: 'teacher', label: 'Teachers' \}\]\);/.test(parentList) && /rows: filteredContacts\.filter\(\(c\) => c\.role === group\.role\)/.test(parentList) && !/role: 'admin'/.test(parentList), 'the picker is ONE group, Teachers — no Admin group for either role');
const parentThread = src('src/pages/parent/MessageThreadPage.jsx') + src('src/pages/messages/MessageThread.jsx'); // wrapper + shared thread
assert(/listPath=\{user\?\.role === 'admin' \? '\/admin\/messages' : '\/parent\/messages'\}/.test(parentThread) && /to=\{listPath\}/.test(parentThread), "the thread's back link follows the role too");
// CODE, not comments: a `//` line may say what the page does not do.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, '');
assert(!/fa-bullhorn|Announce to|\/teacher\/announcements/.test(code(parentThread)), 'the parent/admin thread has no "Announce to a class"');

console.log('Admin Messages — the teacher hand-off only on a parent thread (source)');
const teacherThread = src('src/pages/teacher/MessageThreadPage.jsx') + src('src/pages/messages/MessageThread.jsx'); // wrapper + shared thread
assert(/const otherIsParent = \(other\?\.role \|\| contactRow\?\.role\) === 'parent';/.test(teacherThread), "the rule: the other person's role from a named message, else from the contacts row, must be parent");
const HANDOFF = /\{otherIsParent \? \(\s*<Button\s+icon="fa-bullhorn"/;
const HINT = /\{otherIsParent \? <p className="text-xs text-fg-muted sm:text-right">\{announceHint\}<\/p> : null\}/;
assert(HANDOFF.test(teacherThread) && HINT.test(teacherThread), 'the button AND its hint render only under that rule');
assert((teacherThread.match(/>\{announceHint\}</g) || []).length === 1 && (teacherThread.match(/icon="fa-bullhorn"/g) || []).length === 1, '…and neither appears anywhere else on the page');
const ungated = teacherThread.replace(/\{otherIsParent \? \(\s*<Button/, '{true ? (<Button');
assert(!HANDOFF.test(ungated), 'NEGATIVE CONTROL: with the button ungated, the hand-off assertion fails');

console.log('Admin Messages — the five copy changes (source)');
const routesMessages = src('../server/routes/messages.js');
assert(routesMessages.includes("message: 'Parents may only message their child\\'s teachers.'"), 'copy 1: "Parents may only message their child\'s teachers."');
assert(routesMessages.includes("message: 'The admin may only message teachers.'"), 'copy 2: "The admin may only message teachers."');
assert(/searchPlaceholder="Teacher name"/.test(parentList) && /placeholder=\{searchPlaceholder\}/.test(parentList) && !/Teacher or admin name/.test(parentList), 'copy 3: the picker placeholder is "Teacher name"');
assert(parentList.includes(`"You can message your child's teachers once your account is linked to a student."`) && !/and the school admin/.test(parentList), "copy 4: the parent's empty picker names teachers only");
assert(parentList.includes("'Active teacher accounts appear here.'") && /title="No one to message yet"/.test(parentList), "copy 5: the admin's empty picker, under the existing title");

console.log('Finding #11 — the list scrolls itself; the page moves only to bring the box back (source, both thread pages)');
const scrollsOnlyTheList = (s) =>
  !/scrollIntoView\(\{ block: 'end' \}\)/.test(code(s)) &&
  /const list = listRef\.current;[\s\S]*?\n\s*list\.scrollTop = list\.scrollHeight;/.test(s) &&
  /<div ref=\{listRef\} className="max-h-\[28rem\] space-y-3 overflow-y-auto/.test(s) &&
  !/bottomRef/.test(s);
// F1 (follow-up, 2026-10-06): the newest-message effect consumes nothing
// until the list is mounted with THIS thread's messages — the guard comes
// BEFORE lastIdRef is written, and `loading` is a dependency so the effect
// runs again when the first-load spinner clears.
const waitsForTheList = (s) =>
  /const list = listRef\.current;\s*if \(!list \|\| loading \|\| loadedForRef\.current !== otherId\) return;[\s\S]*?lastIdRef\.current = lastId;/.test(s) &&
  /\}, \[messages, loading, otherId\]\);/.test(s);
for (const role of ['teacher', 'parent']) {
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`) + src('src/pages/messages/MessageThread.jsx'); // the role's wrapper and the shared thread (feat/shared-messages)
  assert(scrollsOnlyTheList(page), `${role}: no end-of-list scrollIntoView; the 28rem list sets its own scrollTop`);
  const helper = code(page).slice(code(page).indexOf('function keepBoxInView(box) {'), code(page).indexOf('function keepBoxInView(box) {') + 260);
  assert(
    (code(page).match(/scrollIntoView\(/g) || []).length === 1 &&
      /if \(rect\.top < 0 \|\| rect\.bottom > window\.innerHeight\) box\.scrollIntoView\(\{ block: 'nearest' \}\);/.test(helper) &&
      (code(page).match(/keepBoxInView\(composerRef\.current\);/g) || []).length === 2 &&
      /if \(opening\) \{\s*keepBoxInView\(composerRef\.current\);\s*return;\s*\}/.test(page) &&
      /if \(lastId !== null && lastId === sentIdRef\.current\) \{[\s\S]*?keepBoxInView\(composerRef\.current\);/.test(page),
    `${role}: the page's only scrollIntoView is keepBoxInView's ({ block: 'nearest' }, under the out-of-view check), called only when a thread opens and after MY send`
  );
  assert(waitsForTheList(page), `${role}: F1 — the newest-message effect waits for the list (mounted, not loading, this thread's messages) before it records anything, and runs again when loading clears`);
  assert(
    /const opening = positionedForRef\.current !== otherId;/.test(page) && /positionedForRef\.current = otherId;/.test(page),
    `${role}: F2 — a thread is "opening" until its list has been positioned once (on open and on a switch to another thread)`
  );
  const oldEffect = page.replace(/if \(!list \|\| loading \|\| loadedForRef\.current !== otherId\) return;/, '').replace('}, [messages, loading, otherId]);', '}, [messages]);');
  assert(!waitsForTheList(oldEffect), `NEGATIVE CONTROL (${role}): without the guard and the loading dependency (the F1 shape), the F1 assertion fails`);
  const focusCalls = page.match(/\.focus\(/g) || [];
  const quietFocus = page.match(/composerRef\.current\?\.focus\(\{ preventScroll: true \}\)/g) || [];
  assert(focusCalls.length === 2 && quietFocus.length === 2 && /<textarea\s+ref=\{composerRef\}/.test(page), `${role}: the composer gets the focus back after a send (and after a failed one) with preventScroll — no other focus call on the page`);
  assert(/sentIdRef\.current = sent\.id;/.test(page) && /if \(lastId !== null && lastId === sentIdRef\.current\) \{/.test(page), `${role}: the refocus waits for MY send to be on screen, not for any message`);
  const reverted = page.replace('list.scrollTop = list.scrollHeight;', "bottomRef.current?.scrollIntoView({ block: 'end' });");
  assert(!scrollsOnlyTheList(reverted), `NEGATIVE CONTROL (${role}): with the old scrollIntoView back, the assertion fails`);
}

// ------------------------------------------------ F3 (follow-up, 2026-10-06)
console.log('F3 — no nav row cut in half (driven + source)');
// The owner's 1366×600 window: the wide box's slot 295px, the rail's 269px;
// the lists 528 / 624 / 480px (admin / teacher / parent) — 11 / 13 / 10 slots.
assert(
  gridHeight(295, 528, 48) === 288 && gridHeight(269, 624, 48) === 240 && gridHeight(600, 528, 48) === null && gridHeight(295, 528, 54) === 270,
  'gridHeight: the largest whole number of 3rem slots that fits (54px at Large); none when the list fits'
);
// Teacher rail, Memos active: row 484–528 (slot 10), box 240, pinned row
// reserved (view 192), end of the list at 624 − 240 = 384 (on the grid).
const memos = { pitch: 48, itemTop: 484, itemBottom: 528, viewHeight: 192, max: 384 };
const down = snapToSlot({ ...memos, scrollTop: 0, next: 528 - 192 });
const settled = snapToSlot({ ...memos, scrollTop: 359, next: 359 });
const up = snapToSlot({ pitch: 48, itemTop: 4, itemBottom: 48, viewHeight: 192, max: 384, scrollTop: 336, next: 4 });
const whole = (s, it) => it.itemTop >= s && it.itemBottom <= s + it.viewHeight;
assert(down % 48 === 0 && whole(down, memos), `a downward placement rests at a slot start with the active row whole (${down})`);
assert(settled % 48 === 0 && whole(settled, memos), `a resting place between slots (359, the pre-grid height's) is snapped to one, the row still whole (${settled})`);
assert(up === 0, 'an upward placement rests at a slot start (Dashboard: 0, not its row top 4)');
// With the box a whole number of slots and the scroll at a slot start, the
// pinned row's top (scroll + box − 44) is a row's top: nothing shows above it
// cut. At a row top instead (the old item-top rounding), 4px of the row show.
const pinnedTopCut = (s, box) => ((s + box - 44 - 4) % 48 + 48) % 48;
assert(pinnedTopCut(down, 240) === 0, 'at a slot start the pinned row meets a row boundary');
assert(pinnedTopCut(436, 240) !== 0, 'NEGATIVE CONTROL: at a row top (the old rounding, 436), the row above the pinned row shows cut');
const shellF3 = src('src/layout/Shell.jsx');
assert(
  /<div className=\{`flex h-11 \$\{rail \? 'items-center px-2' : 'items-end px-3 pb-1\.5'\}`\}>/.test(shellF3) &&
    /className=\{`space-y-1 \$\{inDrawer \? 'pb-4 pt-3' : 'pt-1'\} /.test(shellF3),
  "every group label / rail divider takes a whole 44px slot, and the sidebar's <nav> is padded 4px on top only (the drawer keeps 12px / 16px)"
);
assert(
  /setNavHeight\(gridHeight\(slot\.clientHeight, nav\.offsetHeight, rowPitch\(\)\)\)/.test(shellF3) &&
    /revealActive\(sidebarNavRef\.current, navHeight \? rowPitch\(\) : 0\);/.test(shellF3) &&
    /\}, \[location\.pathname, collapsed, mobileNavOpen, navHeight\]\);/.test(shellF3),
  'the sidebar box is sized by gridHeight, and revealActive snaps to its slots — again once the grid height lands'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
