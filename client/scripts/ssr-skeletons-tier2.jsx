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
import LoadingSpinner from '../src/components/LoadingSpinner';
import {
  AboutSkeleton,
  CalendarSkeleton,
  FilterAndTableSkeleton,
  GridSkeleton,
  RosterCardsSkeleton,
  ScoresSkeleton,
  SettingsSkeleton,
  StudentDetailSkeleton,
  ThreadSkeleton,
} from '../src/components/SkeletonShapes';
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

// A skeleton region: the status region with the words, the hidden shapes with
// the sweep's class on their bars, and no spinner glyph and no pulse.
const region = (label) => (m) =>
  m.includes('role="status"') &&
  m.includes('aria-busy="true"') &&
  m.includes(`<span class="sr-only">${label}</span>`) &&
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
  ['src/pages/teacher/ClassSummaryPage.jsx', 'GridSkeleton', 'sheetPhase', 'loading', ') : loading ? (', '<ClassSummaryTable'],
  ['src/pages/teacher/AttendancePage.jsx', 'FilterAndTableSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) {', '<DataTable'],
  ['src/pages/teacher/AttendancePage.jsx', 'RosterCardsSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', '<RosterCards roster='],
  ['src/pages/teacher/AttendanceRecordsPage.jsx', 'FilterAndTableSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) {', '<DataTable'],
  ['src/pages/parent/AttendancePage.jsx', 'CalendarSkeleton', 'calendarPhase', 'loading', '{loading ? (', '<AttendanceCalendar'],
  ['src/pages/admin/StudentDetailPage.jsx', 'StudentDetailSkeleton', 'phase', 'loading', 'if (loading) {', 'Student details</CardTitle>'],
  ['src/pages/teacher/StudentDetailPage.jsx', 'StudentDetailSkeleton', 'phase', 'loading', 'if (loading) {', 'Student details</CardTitle>'],
  ['src/pages/parent/GradesPage.jsx', 'ScoresSkeleton', 'detailPhase', 'detailLoading', '{detailLoading ? ', '<BreakdownBody'],
  ['src/pages/settings/SchoolSettingsSection.jsx', 'SettingsSkeleton', 'phase', 'loading && !stored', 'if (loading && !stored) return', 'title="School settings"'],
  ['src/pages/AboutPage.jsx', 'AboutSkeleton', 'phase', 'loading && !settings', 'loading && !settings ? (', '<AboutBody settings='],
];
for (const [file, shape, phase, guard, guardText, content] of WIRING) {
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
proved(
  'the phone roster: a save\'s re-read keeps the cards (busy, inert); the skeleton is for another class or day, or no cards yet',
  (t) =>
    t.includes('useQueryRows(roster, rosterLoading, [section, date])') &&
    t.includes('rosterLoading && (!rosterCurrent || roster.length === 0)') &&
    t.includes('inert={rosterLoading || undefined}'),
  att,
  att.replace('inert={rosterLoading || undefined}', ''),
  att.replace('(!rosterCurrent || roster.length === 0)', 'true')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
