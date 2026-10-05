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
  // The parent page's links take their base from the role since 2026-10-05
  // (the admin's inbox is the same page), so its picker navigates to
  // `${base}/<id>`; the teacher's still names its own path.
  const pickerBase = role === 'teacher' ? '/teacher/messages' : '\\$\\{base\\}';
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
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`);
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
const parentList = src('src/pages/parent/MessagesPage.jsx');
assert(/const isAdmin = user\?\.role === 'admin';/.test(parentList) && /const base = isAdmin \? '\/admin\/messages' : '\/parent\/messages';/.test(parentList), 'the list page takes its base path from the signed-in role');
assert(!/['`]\/parent\/messages\//.test(parentList) && (parentList.match(/`\$\{base\}\//g) || []).length === 3, '…every thread link uses it — the Open button, the card and the picker — and none names /parent/messages/');
assert(/\[\{ role: 'teacher', label: 'Teachers', rows: filteredContacts\.filter\(\(c\) => c\.role === 'teacher'\) \}\]/.test(parentList) && !/role: 'admin'/.test(parentList), 'the picker is ONE group, Teachers — no Admin group for either role');
const parentThread = src('src/pages/parent/MessageThreadPage.jsx');
assert(/to=\{user\?\.role === 'admin' \? '\/admin\/messages' : '\/parent\/messages'\}/.test(parentThread), "the thread's back link follows the role too");
// CODE, not comments: a `//` line may say what the page does not do.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, '');
assert(!/fa-bullhorn|Announce to|\/teacher\/announcements/.test(code(parentThread)), 'the parent/admin thread has no "Announce to a class"');

console.log('Admin Messages — the teacher hand-off only on a parent thread (source)');
const teacherThread = src('src/pages/teacher/MessageThreadPage.jsx');
assert(/const otherIsParent = \(other\?\.role \|\| contactRow\?\.role\) === 'parent';/.test(teacherThread), "the rule: the other person's role from a named message, else from the contacts row, must be parent");
const HANDOFF = /\{otherIsParent \? \(\s*<Button\s+icon="fa-bullhorn"/;
const HINT = /\{otherIsParent \? <p className="text-xs text-fg-muted sm:text-right">\{announceHint\}<\/p> : null\}/;
assert(HANDOFF.test(teacherThread) && HINT.test(teacherThread), 'the button AND its hint render only under that rule');
assert((teacherThread.match(/>\{announceHint\}</g) || []).length === 1 && (teacherThread.match(/icon="fa-bullhorn"/g) || []).length === 1, '…and neither appears anywhere else on the page');
const ungated = teacherThread.replace('{otherIsParent ? (\n            <Button', '{true ? (\n            <Button');
assert(!HANDOFF.test(ungated), 'NEGATIVE CONTROL: with the button ungated, the hand-off assertion fails');

console.log('Admin Messages — the five copy changes (source)');
const routesMessages = src('../server/routes/messages.js');
assert(routesMessages.includes("message: 'Parents may only message their child\\'s teachers.'"), 'copy 1: "Parents may only message their child\'s teachers."');
assert(routesMessages.includes("message: 'The admin may only message teachers.'"), 'copy 2: "The admin may only message teachers."');
assert(/placeholder="Teacher name"/.test(parentList) && !/Teacher or admin name/.test(parentList), 'copy 3: the picker placeholder is "Teacher name"');
assert(parentList.includes(`"You can message your child's teachers once your account is linked to a student."`) && !/and the school admin/.test(parentList), "copy 4: the parent's empty picker names teachers only");
assert(parentList.includes("'Active teacher accounts appear here.'") && /title="No one to message yet"/.test(parentList), "copy 5: the admin's empty picker, under the existing title");

console.log('Finding #11 — the list scrolls itself; the page moves only to bring the box back (source, both thread pages)');
const scrollsOnlyTheList = (s) =>
  !/scrollIntoView\(\{ block: 'end' \}\)/.test(code(s)) &&
  /const list = listRef\.current;\s*if \(list\) list\.scrollTop = list\.scrollHeight;/.test(s) &&
  /<div ref=\{listRef\} className="max-h-\[28rem\] space-y-3 overflow-y-auto/.test(s) &&
  !/bottomRef/.test(s);
for (const role of ['teacher', 'parent']) {
  const page = src(`src/pages/${role}/MessageThreadPage.jsx`);
  assert(scrollsOnlyTheList(page), `${role}: no end-of-list scrollIntoView; the 28rem list sets its own scrollTop`);
  const sendBranch = code(page).slice(code(page).indexOf('if (lastId !== null && lastId === sentIdRef.current) {'));
  assert(
    (code(page).match(/scrollIntoView\(/g) || []).length === 1 &&
      /^if \(lastId !== null && lastId === sentIdRef\.current\) \{[\s\S]*?if \(box\.top < 0 \|\| box\.bottom > window\.innerHeight\) \{\s*composer\.scrollIntoView\(\{ block: 'nearest' \}\);/.test(sendBranch),
    `${role}: the page's only scrollIntoView is composer.scrollIntoView({ block: 'nearest' }), inside the my-send branch, under the out-of-view check`
  );
  const focusCalls = page.match(/\.focus\(/g) || [];
  const quietFocus = page.match(/composerRef\.current\?\.focus\(\{ preventScroll: true \}\)/g) || [];
  assert(focusCalls.length === 2 && quietFocus.length === 2 && /<textarea\s+ref=\{composerRef\}/.test(page), `${role}: the composer gets the focus back after a send (and after a failed one) with preventScroll — no other focus call on the page`);
  assert(/sentIdRef\.current = sent\.id;/.test(page) && /if \(lastId !== null && lastId === sentIdRef\.current\) \{/.test(page), `${role}: the refocus waits for MY send to be on screen, not for any message`);
  const reverted = page.replace('if (list) list.scrollTop = list.scrollHeight;', "bottomRef.current?.scrollIntoView({ block: 'end' });");
  assert(!scrollsOnlyTheList(reverted), `NEGATIVE CONTROL (${role}): with the old scrollIntoView back, the assertion fails`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
