// PROOF — feat/skeleton-tier2-web (2026-10-11): skeleton tier 2 on the web.
// The thirteen spinners left on eleven pages are skeletons now — the Messages
// thread, the class record, the class summary (two), Teacher → Attendance (two)
// and Attendance records, the parent's calendar, both student detail pages,
// the parent's breakdown dialog, School settings and About (§5, FRONTEND
// §5a-vii, components/SkeletonShapes.jsx).
//
// What it RENDERS:
//   - every shape in both phases: the region (role, live, busy, the spinner's
//     own words), the hidden shapes with the sweep's class, unpainted during
//     the wait and painted after it — and never the spinner's glyph;
//   - the thread's bubbles on both sides, and the thread while it loads under
//     the real Header with the ← the thread hands it;
//   - FOUR WHOLE PAGES on their first render, which is a load: admin → Student
//     detail (its "All students" link above the skeleton), the class record,
//     School settings and About (signed in, and signed out with its "Back to
//     sign in"); and About's body with a fixture — the content that replaces it.
// What it reads as SOURCE TEXT, said plainly: each page's wiring — the shape
// imported and rendered under the guard the spinner had, its phase from
// useSkeleton on that same guard, no LoadingSpinner left, the loaded content
// after the skeleton branch; the thread's usePageBack before its loading
// return; both detail pages' link inside the loading body, above the shapes;
// the phone roster's re-read keeping its cards.
//
// THE FIX ROUND (the owner's device check, 3G): T1 — the teacher register's
// sections skeleton is cards below `sm` and the table above, no grid cell at
// phone width (rendered, control: the old filter-and-table shape); T2 — the
// roster's waiting rule DRIVEN through `nextRowsQuery` / `rowsAreCurrent` (a
// date change before its load starts is a wait; Save's re-read is not; control:
// the old rule), the summary, note and Save-bar shapes rendered quiet, and their
// wiring; P1 — the parent's month summary card as skeleton while the month
// loads; P2 — the month's load takes a ticket and applies only the newest
// reply (source), and two fake loads answering out of order through
// api/tickets.js (control: without the ticket the older month lands last).
//
// WHAT IT CANNOT: the 300 ms, the sweep, a load ending — renderToStaticMarkup
// renders once and runs no effect, so no page reaches its loaded state here;
// and the pages that read useAuth cannot render without the real provider.
// That is the owner's device check (TESTING, the 3G preset).
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-skeletons-tier2.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-skeletons-tier2.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createTickets } from '../src/api/tickets';
import LoadingSpinner from '../src/components/LoadingSpinner';
import {
  AboutSkeleton,
  AttendanceRegisterSkeleton,
  CalendarSkeleton,
  FilterAndTableSkeleton,
  GridSkeleton,
  MonthSummarySkeleton,
  RosterCardsSkeleton,
  RosterNoteSkeleton,
  RosterSaveBarSkeleton,
  RosterSummarySkeleton,
  ScoresSkeleton,
  SettingsSkeleton,
  StudentDetailSkeleton,
  ThreadSkeleton,
} from '../src/components/SkeletonShapes';
import { nextRowsQuery, rowsAreCurrent } from '../src/hooks/useSkeleton';
import Header from '../src/layout/Header';
import AboutPage, { AboutBody } from '../src/pages/AboutPage';
import AdminStudentDetailPage from '../src/pages/admin/StudentDetailPage';
import SchoolSettingsSection from '../src/pages/settings/SchoolSettingsSection';
import ClassRecordPage from '../src/pages/teacher/ClassRecordPage';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
// One check: the predicate holds on the real input and FAILS on every control.
function proved(label, holds, real, ...controls) {
  const onReal = Boolean(holds(real));
  const caught = controls.map((c) => !holds(c));
  assert(onReal && caught.every(Boolean), label, `real ${onReal}, controls caught ${caught.join('/')}`);
}
const src = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');
const html = (el, at = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>);
const count = (m, s) => m.split(s).length - 1;
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// A skeleton region: the status region with the words, the hidden shapes with
// the sweep's class on their bars, and no spinner glyph and no pulse.
const region = (label) => (m) =>
  m.includes('role="status"') &&
  m.includes('aria-busy="true"') &&
  m.includes(`<span class="sr-only">${label.replace(/'/g, '&#x27;')}</span>`) &&
  m.includes('aria-hidden="true"') &&
  count(m, 'skeleton-bone') >= 3 &&
  !m.includes('fa-spin') &&
  !/\banimate-/.test(m);
const painted = (m) => m.includes('data-skeleton="painted"') && !m.includes('class="invisible"');
const waiting = (m) => m.includes('data-skeleton="wait"') && m.includes('class="invisible"');

// ---------------------------------------------------------------------------
console.log('Every shape, in both phases');
const SHAPES = [
  ['ThreadSkeleton', (p) => <ThreadSkeleton phase={p} />, 'Loading conversation…'],
  ['GridSkeleton, the record', (p) => <GridSkeleton phase={p} label="Loading the class record…" columns={8} />, 'Loading the class record…'],
  ['GridSkeleton, the summary', (p) => <GridSkeleton phase={p} label="Loading the class summary…" columns={9} />, 'Loading the class summary…'],
  ['FilterAndTableSkeleton', (p) => <FilterAndTableSkeleton phase={p} label="Loading your sections…" fields={3} />, 'Loading your sections…'],
  ['RosterCardsSkeleton', (p) => <RosterCardsSkeleton phase={p} />, 'Loading the roster…'],
  ['CalendarSkeleton', (p) => <CalendarSkeleton phase={p} />, 'Loading…'],
  ['StudentDetailSkeleton', (p) => <StudentDetailSkeleton phase={p} fields={2} />, 'Loading student…'],
  ['ScoresSkeleton', (p) => <ScoresSkeleton phase={p} />, 'Loading scores…'],
  ['SettingsSkeleton', (p) => <SettingsSkeleton phase={p} />, 'Loading school settings…'],
  ['AboutSkeleton', (p) => <AboutSkeleton phase={p} />, 'Loading school details…'],
  ['AttendanceRegisterSkeleton', (p) => <AttendanceRegisterSkeleton phase={p} />, 'Loading your sections…'],
  ['MonthSummarySkeleton', (p) => <MonthSummarySkeleton phase={p} />, 'Loading this month\'s summary…'],
];
for (const [name, el, label] of SHAPES) {
  const shown = html(el('skeleton'));
  proved(
    `${name}: the region and its words, hidden shapes with the sweep — never a spinner`,
    region(label),
    shown,
    html(<LoadingSpinner label={label} />),
    shown.replaceAll('skeleton-bone', '')
  );
  proved(
    `${name}: laid out unpainted for the wait, painted after it`,
    ([p, w]) => painted(p) && waiting(w),
    [shown, html(el('wait'))],
    [html(el('wait')), html(el('wait'))],
    [shown, shown]
  );
}

const thread = html(<ThreadSkeleton phase="skeleton" />);
proved(
  'ThreadSkeleton: bubbles on both sides — theirs on the left, mine on the right',
  (m) =>
    count(m, 'data-side="mine" class="flex justify-end"') >= 2 &&
    count(m, 'data-side="theirs" class="flex justify-start"') >= 2,
  thread,
  thread.replaceAll('data-side="mine"', 'data-side="theirs"'),
  thread.replaceAll('justify-end', 'justify-start')
);

// ---------------------------------------------------------------------------
console.log('The way back while it loads');
const BACK = { to: '/parent/messages', label: 'All conversations' };
const threadLoading = (back) =>
  html(
    <>
      <Header title="Messages" back={back} onOpenMenu={() => {}} />
      <main>
        <ThreadSkeleton phase="skeleton" />
      </main>
    </>
  );
const backBeforeRegion = (href, name) => (m) => {
  const link = m.indexOf(`href="${href}"`);
  return link > 0 && m.includes(name) && link < m.indexOf('role="status"');
};
proved(
  'the thread loading under the real Header: the top bar ← is rendered, a live link outside the skeleton',
  (m) => backBeforeRegion(BACK.to, 'aria-label="All conversations"')(m) && region('Loading conversation…')(m),
  threadLoading(BACK),
  threadLoading(null)
);
const files = Object.fromEntries(
  [
    'src/pages/messages/MessageThread.jsx',
    'src/pages/teacher/ClassRecordPage.jsx',
    'src/pages/teacher/ClassSummaryPage.jsx',
    'src/pages/teacher/AttendancePage.jsx',
    'src/pages/teacher/AttendanceRecordsPage.jsx',
    'src/pages/parent/AttendancePage.jsx',
    'src/pages/admin/StudentDetailPage.jsx',
    'src/pages/teacher/StudentDetailPage.jsx',
    'src/pages/parent/GradesPage.jsx',
    'src/pages/settings/SchoolSettingsSection.jsx',
    'src/pages/AboutPage.jsx',
  ].map((f) => [f, src(f)])
);
const CALL = "usePageBack(listPath, 'All conversations');";
const thr = files['src/pages/messages/MessageThread.jsx'];
proved(
  'the thread hands the top bar its ← BEFORE its loading return, so the ← is there while the skeleton shows',
  (t) => {
    const call = t.indexOf(CALL);
    return call > 0 && call < t.indexOf('if (loading) return <ThreadSkeleton');
  },
  thr,
  thr.replace(CALL, '') + CALL
);
const backInLoading = (t) => {
  const start = t.indexOf('if (loading) {');
  const block = t.slice(start, t.indexOf('} else if', start));
  const link = block.indexOf('{backLink}');
  return start > 0 && t.indexOf('const backLink = (') < start && link > 0 && link < block.indexOf('<StudentDetailSkeleton');
};
for (const f of ['src/pages/admin/StudentDetailPage.jsx', 'src/pages/teacher/StudentDetailPage.jsx']) {
  proved(
    `${f.split('/')[2]} StudentDetailPage: its "All students" link leads the loading body, above the shapes`,
    backInLoading,
    files[f],
    files[f].replace('{backLink}\n        <StudentDetailSkeleton', '<StudentDetailSkeleton')
  );
}

// ---------------------------------------------------------------------------
console.log('Whole pages on their first render (a load)');
const adminDetail = html(
  <Routes>
    <Route path="/admin/students/:id" element={<AdminStudentDetailPage />} />
  </Routes>,
  '/admin/students/7'
);
proved(
  'Admin → Student detail: the "All students" link, then the record\'s skeleton — no spinner',
  (m) => region('Loading student…')(m) && waiting(m) && backBeforeRegion('/admin/students', 'All students')(m),
  adminDetail,
  html(<StudentDetailSkeleton phase="wait" />)
);
const record = html(<ClassRecordPage />, '/teacher/grades');
proved('Teacher → Class record: the record\'s skeleton — no spinner', (m) => region('Loading the class record…')(m) && waiting(m), record, record.replaceAll('skeleton-bone', ''));
const settingsPage = html(<SchoolSettingsSection />);
proved('School settings: the form\'s skeleton — no spinner', (m) => region('Loading school settings…')(m) && waiting(m), settingsPage, html(<LoadingSpinner label="Loading school settings…" />));
const about = html(<AboutPage />);
proved('About, signed in: the page\'s skeleton — no spinner', (m) => region('Loading school details…')(m) && waiting(m), about, html(<LoadingSpinner label="Loading school details…" />));
const aboutPublic = html(<AboutPage publicView />, '/about');
proved(
  'About, signed out: "Back to sign in" above the skeleton',
  (m) => region('Loading school details…')(m) && backBeforeRegion('/login', 'Back to sign in')(m),
  aboutPublic,
  about
);
const SETTINGS = { school_name: 'Fixture Elementary School', school_address: 'Fixture Street, Fixture Town', academic_year: '2026-2027' };
const aboutBody = html(<AboutBody settings={SETTINGS} />);
proved(
  'About, loaded: the school\'s own details where the skeleton was — no region, no bars',
  (m) => m.includes('Fixture Elementary School') && m.includes('School details') && !m.includes('skeleton-bone') && !m.includes('aria-busy="true"'),
  aboutBody,
  html(<AboutSkeleton phase="skeleton" />)
);

// ---------------------------------------------------------------------------
// Each spinner's replacement: [file, shape, phase, its guard, the guard's own
// text just before the shape, the loaded content that follows the branch].
console.log('Every page wired: the shape under the spinner\'s guard, then the content');
const WIRING = [
  ['src/pages/messages/MessageThread.jsx', 'ThreadSkeleton', 'phase', 'loading', 'if (loading) return', 'messages.map('],
  ['src/pages/teacher/ClassRecordPage.jsx', 'GridSkeleton', 'recordPhase', 'recordLoading', '{recordLoading ? (', '<table className="print-sheet-table'],
  ['src/pages/teacher/ClassSummaryPage.jsx', 'FilterAndTableSkeleton', 'classesPhase', 'advised === null', 'if (advised === null) {', '<ClassSummaryTable'],
  ['src/pages/teacher/ClassSummaryPage.jsx', 'GridSkeleton', 'sheetPhase', 'sheetWaiting', ') : sheetWaiting ? (', '<ClassSummaryTable'],
  ['src/pages/teacher/AttendancePage.jsx', 'AttendanceRegisterSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) {', '<DataTable'],
  ['src/pages/teacher/AttendancePage.jsx', 'RosterCardsSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', '<RosterCards roster='],
  ['src/pages/teacher/AttendanceRecordsPage.jsx', 'FilterAndTableSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) {', '<DataTable'],
  ['src/pages/parent/AttendancePage.jsx', 'CalendarSkeleton', 'calendarPhase', 'loading', '{loading ? (', '<AttendanceCalendar'],
  ['src/pages/admin/StudentDetailPage.jsx', 'StudentDetailSkeleton', 'phase', 'loading', 'if (loading) {', 'Student details</CardTitle>'],
  ['src/pages/teacher/StudentDetailPage.jsx', 'StudentDetailSkeleton', 'phase', 'loading', 'if (loading) {', 'Student details</CardTitle>'],
  ['src/pages/parent/GradesPage.jsx', 'ScoresSkeleton', 'detailPhase', 'detailLoading', '{detailLoading ? ', '<BreakdownBody'],
  ['src/pages/settings/SchoolSettingsSection.jsx', 'SettingsSkeleton', 'phase', 'loading && !stored', 'if (loading && !stored) return', 'title="School settings"'],
  ['src/pages/AboutPage.jsx', 'AboutSkeleton', 'phase', 'loading && !settings', 'loading && !settings ? (', '<AboutBody settings='],
];
// The fix round's shapes, wired the same way: the parent's month summary
// (P1) and the three in place of the roster's computed values (T2).
const FIX_WIRING = [
  ['src/pages/parent/AttendancePage.jsx', 'MonthSummarySkeleton', 'calendarPhase', 'loading', '{loading ? (', 'Nothing recorded this month.'],
  ['src/pages/teacher/AttendancePage.jsx', 'RosterSummarySkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', '{counts.marked} of {counts.total} marked'],
  ['src/pages/teacher/AttendancePage.jsx', 'RosterNoteSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', 'will not be submitted'],
  ['src/pages/teacher/AttendancePage.jsx', 'RosterSaveBarSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', 'No unsaved changes'],
];
for (const [file, shape, phase, guard, guardText, content] of [...WIRING, ...FIX_WIRING]) {
  const tag = `<${shape} phase={${phase}}`;
  const wired = (t) => {
    const at = t.indexOf(tag);
    const guardAt = at > 0 ? t.lastIndexOf(guardText, at) : -1;
    return (
      /from '(\.\.\/)+components\/SkeletonShapes'/.test(t) &&
      /import useSkeleton\b[^;]*from '(\.\.\/)+hooks\/useSkeleton'/.test(t) &&
      !t.includes('LoadingSpinner') &&
      t.includes(`const ${phase} = useSkeleton(${guard});`) &&
      guardAt >= 0 &&
      at - guardAt < 400 &&
      t.indexOf(content, at) > at
    );
  };
  proved(
    `${file.replace('src/pages/', '')} → ${shape} on \`${guard}\`, then the content`,
    wired,
    files[file],
    files[file].replace(tag, '<LoadingSpinner'),
    files[file].replace(`useSkeleton(${guard});`, 'useSkeleton(false);')
  );
}
assert(WIRING.length === 13, 'thirteen spinners replaced, on eleven pages', `${WIRING.length} rows`);

const att = files['src/pages/teacher/AttendancePage.jsx'];
const RULE = 'const rosterWaiting = !rosterCurrent || (rosterLoading && roster.length === 0);';
proved(
  'the phone roster: a save\'s re-read keeps the cards (busy, inert); the skeleton is for another class or day, or no cards yet',
  (t) =>
    t.includes('useQueryRows(roster, rosterLoading, [section, date])') &&
    t.includes(RULE) &&
    t.includes('inert={rosterLoading || undefined}'),
  att,
  att.replace('inert={rosterLoading || undefined}', ''),
  att.replace(RULE, 'const rosterWaiting = rosterLoading && (!rosterCurrent || roster.length === 0);')
);

// ---------------------------------------------------------------------------
console.log('The fix round — T1, T2, P1, P2');

// T1: the table card shows from `sm` only, the four roster cards below it, and
// no grid cell sits anywhere a phone shows.
const GRID_CELL = 'h-8 w-12 shrink-0';
const phoneSafe = (m) => {
  const table = m.indexOf(' hidden sm:block"');
  const cards = m.indexOf(' sm:hidden"');
  if (table < 0 || cards < table) return false;
  const tablePart = m.slice(table, cards);
  const cardsPart = m.slice(cards);
  return (
    tablePart.includes(GRID_CELL) &&
    !cardsPart.includes(GRID_CELL) &&
    !m.slice(0, table).includes(GRID_CELL) &&
    count(cardsPart, 'grid grid-cols-4') === 4
  );
};
const registerShown = html(<AttendanceRegisterSkeleton phase="skeleton" />);
proved(
  'T1 — the sections skeleton: the table only from `sm`, four roster cards below it, no grid cell at phone width',
  phoneSafe,
  registerShown,
  html(<FilterAndTableSkeleton phase="skeleton" label="Loading your sections…" fields={2} columns={5} />),
  registerShown.replace(' hidden sm:block"', '"')
);

// T2: the page's waiting rule driven through the real pure functions. Each
// step is one render: [rows, loading, the register's key].
const waitingNow = (current, loading, length) => !current || (loading && length === 0);
const waitingBefore = (current, loading, length) => loading && (!current || length === 0);
const everyLoad = (current, loading) => loading;
function drive(rule) {
  const first = [{ id: 1 }, { id: 2 }];
  const next = [{ id: 3 }];
  const steps = [
    [[], true, 'day 1'], // the first load
    [first, false, 'day 1'], // the register on screen
    [first, false, 'day 2'], // the date changed; its load has not started yet
    [first, true, 'day 2'], // the new day loading
    [next, false, 'day 2'], // its answer
    [next, true, 'day 2'], // Save's re-read of the same register
    [next, false, 'day 2'], // done
  ];
  let seen = null;
  return steps.map(([rows, loading, key]) => {
    const queryKey = JSON.stringify([key]);
    seen = nextRowsQuery(seen, { rows, loading, queryKey });
    return rule(rowsAreCurrent(seen, queryKey), loading, rows.length);
  });
}
proved(
  'T2 — waiting: the first load, a date change BEFORE its load starts and while it loads — never the register itself or Save\'s re-read',
  (rule) => same(drive(rule), [true, false, true, true, false, false, false]),
  waitingNow,
  waitingBefore,
  everyLoad
);
const quiet = (m) =>
  m.startsWith('<div aria-hidden="true" data-skeleton="painted"') &&
  !m.includes('role="status"') &&
  !m.includes('invisible') &&
  count(m, 'skeleton-bone') >= 1;
const quietWait = (m) => m.startsWith('<div aria-hidden="true" data-skeleton="wait" class="invisible ');
const summaryShown = html(<RosterSummarySkeleton phase="skeleton" />);
proved(
  'T2 — the summary card in place: the count, four chips, Mark all Present, Save from `sm` — quiet, the roster announces',
  (m) =>
    quiet(m) &&
    count(m, 'h-6 w-20') === 4 &&
    m.includes('h-11 w-40') &&
    /<div class="hidden sm:block"><span class="[^"]*h-11 w-44/.test(m),
  summaryShown,
  html(<RosterCardsSkeleton phase="skeleton" />),
  summaryShown.replace('h-11 w-40', 'h-11')
);
const noteShown = html(<RosterNoteSkeleton phase="skeleton" />);
const barShown = html(<RosterSaveBarSkeleton phase="skeleton" />);
proved(
  'T2 — the note and the phone\'s pinned Save bar in place, quiet; the bar the sticky frame itself',
  ([note, bar]) =>
    quiet(note) &&
    note.includes('bg-surface-subtle') &&
    quiet(bar) &&
    /^<div aria-hidden="true" data-skeleton="painted" class="sticky bottom-0 [^"]*sm:hidden"/.test(bar),
  [noteShown, barShown],
  [noteShown, html(<RosterCardsSkeleton phase="skeleton" />)],
  [noteShown, barShown.replace('sticky bottom-0 ', '')]
);
proved(
  'T2 — the three quiet shapes laid out unpainted for the wait',
  (list) => list.every(quietWait),
  [
    html(<RosterSummarySkeleton phase="wait" />),
    html(<RosterNoteSkeleton phase="wait" />),
    html(<RosterSaveBarSkeleton phase="wait" />),
  ],
  [summaryShown, noteShown, barShown]
);

// P2: the month's load, read as source — a ticket before it asks; its reply,
// its error and its end of loading applied only while it is the newest.
const parentSrc = files['src/pages/parent/AttendancePage.jsx'];
const latestWins = (t) => {
  const start = t.indexOf('const load = useCallback(async () => {');
  const end = t.indexOf('}, [studentId, view, tickets]);', start);
  const body = start > 0 && end > start ? t.slice(start, end) : '';
  const take = body.indexOf('const ticket = tickets.take();');
  const firstAwait = body.indexOf('await ');
  const guard = body.indexOf('if (!tickets.isLatest(ticket)) return;');
  return (
    /import \{ createTickets \} from '\.\.\/\.\.\/api\/tickets'/.test(t) &&
    t.includes('const [tickets] = useState(createTickets);') &&
    take > 0 &&
    take < firstAwait &&
    guard > firstAwait &&
    guard < body.indexOf('setSummary(nextSummary);') &&
    count(body, 'if (!tickets.isLatest(ticket)) return;') === 2 &&
    body.includes('if (tickets.isLatest(ticket)) setLoading(false);')
  );
};
proved(
  'P2 — the month\'s load takes a ticket before it asks and applies its reply, error and end only while newest',
  latestWins,
  parentSrc,
  parentSrc.replace('      if (!tickets.isLatest(ticket)) return;\n      setSummary(nextSummary);', '      setSummary(nextSummary);'),
  parentSrc.replace('if (tickets.isLatest(ticket)) setLoading(false);', 'setLoading(false);')
);

// ---------------------------------------------------------------------------
// fix/web-load-races: the roster and the three parity screens. Each load takes
// a ticket before it asks and applies its reply, failure and end only while it
// is the newest; each screen tells the previous pick's data from this pick's
// by the data's own identity, and nothing reads or acts on it until it is.
console.log('fix/web-load-races — the roster, the class record, the class summary, admin Grades');
const adminSrc = src('src/pages/admin/GradesPage.jsx');
const classRecordHook = src('src/pages/teacher/classRecord/useClassRecord.js');
const bodyBetween = (t, start, end) => {
  const s = t.indexOf(start);
  return s >= 0 ? t.slice(s, t.indexOf(end, s)) : '';
};
// [label, source, start, end, the ask, the guards that must follow it in order, the first setter]
const TICKETED = [
  ['the roster (Teacher → Attendance)', att, 'const loadRoster = useCallback(async () => {', '}, [section, date]);', 'await Promise.all(', ['if (!tickets.isLatest(ticket)) return;', 'if (!tickets.isLatest(ticket)) return;', 'if (tickets.isLatest(ticket)) setRosterLoading(false);'], 'setRoster(students);'],
  ["admin Grades' report", adminSrc, 'const loadReport = useCallback(async () => {', '}, [studentId]);', 'await api.get(', ['if (!tickets.isLatest(ticket)) return;', 'if (!tickets.isLatest(ticket)) return;', 'if (tickets.isLatest(ticket)) setReportLoading(false);'], 'setReport(next);'],
  ['the class summary (Try again included)', files['src/pages/teacher/ClassSummaryPage.jsx'], 'const load = useCallback(() => {', '}, [selected, term]);', '.get(`/grades/class-summary', ['if (tickets.isLatest(ticket)) setData(value);', 'if (tickets.isLatest(ticket)) {', 'if (tickets.isLatest(ticket)) setLoading(false);'], 'setData(value);'],
  ['the class record (useClassRecord, since feat/look-fixes)', classRecordHook, 'const load = useCallback(async () => {', '}, [key, keyReady, loadTickets]);', 'await api.get(', ['if (!loadTickets.isLatest(ticket)) return;', 'if (!loadTickets.isLatest(ticket)) return;', 'if (loadTickets.isLatest(ticket)) setLoading(false);'], 'setServer(data);'],
];
for (const [label, text, start, end, ask, guards, setter] of TICKETED) {
  const ok = (t) => {
    const body = bodyBetween(t, start, end);
    const take = body.search(/const ticket = (loadTickets|tickets)\.take\(\);/);
    const asks = body.indexOf(ask);
    let at = asks;
    for (const g of guards) {
      at = body.indexOf(g, at + 1);
      if (at < 0) return false;
    }
    return take > 0 && asks > take && body.indexOf(guards[0], asks) <= body.indexOf(setter, asks) && !body.includes('cancelled');
  };
  proved(
    `${label} — a ticket before it asks; its reply, failure and end only while newest`,
    ok,
    text,
    text.replace(guards[0], ''),
    text.replace(/const ticket = (loadTickets|tickets)\.take\(\);/, 'const ticket = 0;')
  );
}
proved(
  "the roster and admin Grades keep their tickets in a lazily created REF, so each load's dependencies stay its table's queryKey",
  ([a, g]) =>
    a.includes('if (rosterTickets.current === null) rosterTickets.current = createTickets();') &&
    a.includes('const tickets = rosterTickets.current;') &&
    a.includes('}, [section, date]);') &&
    a.includes('queryKey={[section, date]}') &&
    g.includes('if (reportTickets.current === null) reportTickets.current = createTickets();') &&
    g.includes('}, [studentId]);') &&
    g.includes('queryKey={[studentId]}'),
  [att, adminSrc],
  [att.replace('}, [section, date]);', '}, [section, date, rosterTickets]);'), adminSrc]
);

// Whose data is on screen: the screens' own expressions, lifted and run.
const exprOf = (text, name) => {
  const start = text.indexOf(`const ${name} = Boolean(`) + `const ${name} = Boolean(`.length;
  return text.slice(start, text.indexOf(';\n', start)).replace(/\)\s*$/, '');
};
const recordSrc = files['src/pages/teacher/ClassRecordPage.jsx'];
const summarySrc = files['src/pages/teacher/ClassSummaryPage.jsx'];
const KEY = { subject_id: 7, grade_level: 6, section: 'Fixture', term: 2, school_year: '2026-2027' };
const RECORD = { subject: { id: 7 }, grade_level: 6, section: 'Fixture', term: 2, school_year: '2026-2027' };
proved(
  "the class record is this pick's only for the same subject, class, term and year",
  (t) => {
    const isPick = new Function('server', 'classKey', `return Boolean(${exprOf(t, 'recordIsPick')});`);
    return isPick(RECORD, KEY) && !isPick(RECORD, { ...KEY, term: 3 }) && !isPick(RECORD, { ...KEY, subject_id: 8 }) && !isPick(RECORD, { ...KEY, section: 'Other' }) && !isPick(null, KEY);
  },
  recordSrc,
  recordSrc.replace('      Number(server.term) === Number(classKey.term) &&\n', '')
);
proved(
  'until it is, the grid is skeleton and not rendered — nothing to type into, no Save bar — and a save refuses',
  (t) =>
    t.includes('const recordLoading = assignmentsLoading || (Boolean(classKey) && !record.error && !recordIsPick);') &&
    t.includes(') : !recordIsPick ? null : (') &&
    t.indexOf('if (!recordIsPick) return;') > 0 &&
    t.indexOf('if (!recordIsPick) return;') < t.indexOf('const result = await record.save();'),
  recordSrc,
  recordSrc.replace('(Boolean(classKey) && !record.error && !recordIsPick)', '(record.loading && !server)'),
  recordSrc.replace(') : !recordIsPick ? null : (', ') : !server ? null : (')
);
const SHEET = { section: { grade_level: 6, name: 'Fixture' }, term: 2 };
const PICK = { grade_level: 6, name: 'Fixture' };
proved(
  "the class summary's sheet is this pick's only for the same class and term, Final included",
  (t) => {
    const isPick = new Function('data', 'selected', 'term', `return Boolean(${exprOf(t, 'sheetIsPick')});`);
    return isPick(SHEET, PICK, 2) && !isPick(SHEET, PICK, 3) && isPick({ ...SHEET, term: 'final' }, PICK, 'final') && !isPick(SHEET, { ...PICK, name: 'Other' }, 2) && !isPick(null, PICK, 2);
  },
  summarySrc,
  summarySrc.replace('      String(data.term) === String(term)\n', '      true\n')
);
proved(
  'until it is, the sheet is skeleton and nothing reads it — the table, the adviser line, the printed masthead',
  (t) =>
    t.includes('const sheetWaiting = loading || (!error && !sheetIsPick);') &&
    t.includes('const sheet = sheetWaiting ? null : data;') &&
    t.includes('<ClassSummaryTable data={sheet} />') &&
    !/\{data\?\.(section|school_year|show_final)/.test(t),
  summarySrc,
  summarySrc.replace('const sheetWaiting = loading || (!error && !sheetIsPick);', 'const sheetWaiting = loading;'),
  summarySrc.replace('{sheet?.section?.adviser_name ?', '{data?.section?.adviser_name ?')
);
proved(
  "admin Grades' card is this pick's only for the same learner",
  (t) => {
    const isPick = new Function('report', 'studentId', `return Boolean(${exprOf(t, 'reportIsPick')});`);
    return isPick({ student: { id: 5 } }, '5') && !isPick({ student: { id: 5 } }, '6') && !isPick(null, '5');
  },
  adminSrc,
  adminSrc.replace('Number(report.student?.id) === Number(studentId)', 'true')
);
proved(
  'until it is, no learner card, no general average, and no lock or unlock acts',
  (t) =>
    t.includes('if (!reportIsPick || !selectedEntry?.grade_id) return;') &&
    t.includes('{reportIsPick && student ? (') &&
    t.includes("{reportIsPick && report && subjects.length && mode !== 'descriptive' ? (") &&
    t.includes('{reportIsPick && selectedEntry?.grade_id ? ('),
  adminSrc,
  adminSrc.replace('if (!reportIsPick || !selectedEntry?.grade_id) return;', 'if (!selectedEntry?.grade_id) return;'),
  adminSrc.replace('{reportIsPick && student ? (', '{student ? (')
);

// Driven: two reads answering out of order, through the real api/tickets.js —
// the older asked first and answering last. With the ticket the newer stays;
// the control is the same race without it, where the older lands last.
async function raceOf(older, newer, guarded) {
  const tickets = createTickets();
  let shown = null;
  const read = async (value, delay) => {
    const ticket = tickets.take();
    const reply = await new Promise((resolve) => setTimeout(() => resolve(value), delay));
    if (guarded && !tickets.isLatest(ticket)) return;
    shown = reply;
  };
  await Promise.all([read(older, 40), read(newer, 10)]);
  return shown;
}
const RACES = [
  ['the roster', '9 October', '10 October'],
  ['the class record', 'Term 1', 'Term 2'],
  ['the class summary (a Try again, then another class)', 'class A, retried', 'class B'],
  ["admin Grades' report", 'learner 5', 'learner 6'],
];

// P2, driven: October asked first and answering last, September asked second
// and answering first — the order the owner's slow line produced.
async function race(guarded) {
  const tickets = createTickets();
  const state = { month: null, loading: true };
  const load = async (month, delay) => {
    const ticket = tickets.take();
    state.loading = true;
    const reply = await new Promise((resolve) => setTimeout(() => resolve(month), delay));
    if (guarded && !tickets.isLatest(ticket)) return;
    state.month = reply;
    if (!guarded || tickets.isLatest(ticket)) state.loading = false;
  };
  await Promise.all([load('October', 40), load('September', 10)]);
  return state;
}
Promise.all([race(true), race(false)]).then(([fixed, before]) => {
  assert(
    fixed.month === 'September' && fixed.loading === false && before.month === 'October',
    'P2 — two month loads answering out of order: the newer month stays (control: without the ticket the older lands last and wins)',
    `with the ticket ${fixed.month}, without ${before.month}`
  );
  return Promise.all(RACES.map(([, older, newer]) => Promise.all([raceOf(older, newer, true), raceOf(older, newer, false)])));
}).then((results) => {
  RACES.forEach(([label, older, newer], i) => {
    const [fixed, before] = results[i];
    assert(
      fixed === newer && before === older,
      `${label} — two reads out of order: the newer stays (control: without the ticket the older lands last)`,
      `with the ticket ${fixed}, without ${before}`
    );
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
