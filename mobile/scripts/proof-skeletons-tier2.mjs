// PROOF — feat/skeleton-tier2-phone (2026-10-11): skeleton tier 2 on the phone.
// Seventeen spinners on thirteen screens: sixteen are skeletons now and the
// slot screen's pull keeps its column (the owner's Q3); with them, the web's
// fix round applied to the phone (T1, T2, P1, P2) and the same gaps on teacher
// Grades, Class summary and admin Grades (Q2).
//
// SOURCE TEXT, said plainly — React Native does not render under node: the
// shapes file (every region's words, the quiet ones quiet, the register in its
// own card shape, a sheet that fits), Skeleton.jsx's appended QuietSkeleton
// with the existing region's line intact, each screen's wiring (the shape
// under the guard its spinner had, the phase on that guard, the content after
// it, no tier-2 spinner left), the slot pull and Attendance's Save keeping
// their content, the thread's positioning guard (M27).
// DRIVEN: the roster's waiting rule through the mirrored nextRowsQuery /
// rowsAreCurrent; the three "whose data is on screen" expressions, lifted from
// the screens and run on fixtures; two loads answering out of order through
// the mirrored api/tickets.js. Every check passes only if each of its
// negative controls FAILS.
//
// CANNOT: the 300 ms, the sweep, a real load, TalkBack — the owner's check on
// the Tecno (TESTING), where the LAN is too fast to see a skeleton at all.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTickets } from '../src/api/tickets.js';
import { nextRowsQuery, rowsAreCurrent } from '../src/hooks/useSkeleton.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const src = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}
// One check: it holds on the real input and FAILS on every control.
function proved(label, holds, real, ...controls) {
  assert(Boolean(holds(real)) && controls.every((c) => !holds(c)), label);
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------
// The shapes and the quiet region
const shapes = src('components/SkeletonShapes.jsx');
const bodyOf = (text, name) => {
  const at = text.indexOf(`export function ${name}(`);
  if (at < 0) return '';
  const next = text.indexOf('\nexport function ', at + 1);
  return text.slice(at, next < 0 ? undefined : next);
};
const REGIONS = {
  ThreadSkeleton: 'Loading conversation…',
  SlotSkeleton: 'Loading the class record…',
  ClassSummarySkeleton: 'Loading your classes…',
  SummarySheetSkeleton: 'Loading the class summary…',
  RosterCardsSkeleton: 'Loading the roster…',
  AttendanceRegisterSkeleton: 'Loading your sections…',
  RecordsSkeleton: 'Loading your sections…',
  MonthSummarySkeleton: "Loading this month's summary…",
  StudentDetailSkeleton: 'Loading student…',
  ScoresSkeleton: 'Loading scores…',
  SettingsSkeleton: 'Loading school settings…',
  AboutSkeleton: 'Loading school details…',
};
const QUIET = ['RosterSummarySkeleton', 'RosterNoteSkeleton', 'RosterSaveBarSkeleton'];
const regionsRight = (text) =>
  Object.entries(REGIONS).every(([name, label]) => bodyOf(text, name).includes(`<Skeleton phase={phase} label="${label}"`)) &&
  ['MonthGridSkeleton', 'ReportCardSkeleton'].every((name) => bodyOf(text, name).includes('<Skeleton phase={phase}>')) &&
  bodyOf(text, 'ClassRecordSkeleton').includes('<Skeleton phase={phase} label={label}>');
proved(
  'every shape is one region with the spinner\'s own words (the two unlabelled spinners keep "Loading…")',
  regionsRight,
  shapes,
  shapes.replace('label="Loading conversation…"', 'label="Loading…"'),
  shapes.replace('export function ScoresSkeleton(', 'export function ScoresShape(')
);
const quietRight = (text) =>
  QUIET.every((name) => bodyOf(text, name).includes('<QuietSkeleton phase={phase}') && !bodyOf(text, name).includes('<Skeleton '));
proved(
  'T2\'s summary, note and Save bar are QUIET — the roster\'s own region announces the load once',
  quietRight,
  shapes,
  shapes.replace('<QuietSkeleton phase={phase} className={SUMMARY_CARD}>', '<Skeleton phase={phase} className={SUMMARY_CARD}>')
);
const skeleton = src('components/Skeleton.jsx');
const quietRegion = (text) => {
  const quiet = text.slice(text.indexOf('export function QuietSkeleton('));
  return (
    text.includes('<View accessibilityRole="progressbar" accessibilityLabel={label} className={className}>') &&
    text.indexOf('export default function Skeleton(') < text.indexOf('export function QuietSkeleton(') &&
    quiet.includes('importantForAccessibility="no-hide-descendants"') &&
    quiet.includes('accessibilityElementsHidden') &&
    !quiet.includes('accessibilityRole') &&
    quiet.includes("style={{ opacity: painted ? 1 : 0 }}")
  );
};
proved(
  'QuietSkeleton is appended — the existing region\'s progressbar line intact — hidden, no role, the same wait',
  quietRegion,
  skeleton,
  skeleton.replace('importantForAccessibility="no-hide-descendants"\n      accessibilityElementsHidden\n      className={className}', 'accessibilityRole="progressbar"\n      className={className}'),
  skeleton.replace('<View accessibilityRole="progressbar" accessibilityLabel={label} className={className}>', '<View className={className}>')
);
const fits = (text) => {
  const register = bodyOf(text, 'AttendanceRegisterSkeleton');
  const sheet = text.slice(text.indexOf('function SheetShape('), text.indexOf('export function SummarySheetSkeleton('));
  return (register.split('<RosterCardShape />').length - 1 === 3 && !/width: \d/.test(register) && !/width: 96/.test(sheet) && sheet.includes('flex-1 items-center justify-center'));
};
proved(
  'T1 — the register skeleton is the screen\'s card shape (three roster cards, no fixed widths); the sheet\'s cells share the width',
  fits,
  shapes,
  shapes.replace('<HeaderShape title="w-24" />', '<View style={{ width: 640 }} />'),
  shapes.replace('<View key={c} className="flex-1 items-center justify-center">', '<View key={c} style={{ width: 96 }}>')
);

// ---------------------------------------------------------------------------
// Every spot wired: [file, shape, phase, its guard, the guard's text just
// before the shape, the loaded content after the branch].
const WIRING = [
  ['screens/parent/MessageThreadScreen.jsx', 'ThreadSkeleton', 'phase', 'loading', 'if (loading) return', 'messages.map('],
  ['screens/teacher/GradesScreen.jsx', 'ClassRecordSkeleton', 'classesPhase', 'classesLoading', 'else if (classesLoading)', '<SlotGroup key={group}'],
  ['screens/teacher/GradesScreen.jsx', 'ClassRecordSkeleton', 'recordPhase', '!recordIsPick', 'else if (!recordIsPick)', '<SlotGroup key={group}'],
  ['screens/teacher/SlotScreen.jsx', 'SlotSkeleton', 'phase', 'firstRead', 'if (firstRead) return', 'server.learners.map('],
  ['screens/teacher/ClassSummaryScreen.jsx', 'ClassSummarySkeleton', 'classesPhase', 'sections === null', 'if (sections === null) return', '{sheet}'],
  ['screens/teacher/ClassSummaryScreen.jsx', 'SummarySheetSkeleton', 'sheetPhase', 'sheetWaiting', ') : sheetWaiting ? (', '{sheet}'],
  ['screens/teacher/AttendanceScreen.jsx', 'AttendanceRegisterSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) return', '<FlatList'],
  ['screens/teacher/AttendanceScreen.jsx', 'RosterCardsSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', '<FlatList'],
  ['screens/teacher/AttendanceRecordsScreen.jsx', 'RecordsSkeleton', 'sectionsPhase', 'sections === null', 'if (sections === null) {', '<DataList'],
  ['screens/parent/AttendanceScreen.jsx', 'MonthGridSkeleton', 'monthPhase', 'loading', '{loading ? (', '<AttendanceCalendar'],
  ['screens/teacher/StudentDetailScreen.jsx', 'StudentDetailSkeleton', 'phase', 'firstRead', 'if (firstRead) return', 'Student details</CardTitle>'],
  ['screens/admin/StudentDetailScreen.jsx', 'StudentDetailSkeleton', 'phase', 'loading && !student', 'if (loading && !student) return', 'Student details</CardTitle>'],
  ['screens/parent/GradeBreakdownScreen.jsx', 'ScoresSkeleton', 'phase', 'firstRead', '{firstRead ? (', '<BreakdownBody'],
  ['screens/admin/GradesScreen.jsx', 'ReportCardSkeleton', 'reportPhase', 'reportWaiting', 'else if (reportWaiting)', 'subjects.map('],
  ['screens/settings/SchoolSettingsScreen.jsx', 'SettingsSkeleton', 'phase', 'loading && !stored', 'if (loading && !stored) return', '<FormField label="School name"'],
  ['screens/AboutScreen.jsx', 'AboutSkeleton', 'phase', 'firstRead', 'const body = firstRead ? (', '<AboutBody settings='],
  // the web's fix round, applied: P1, and T2's pieces in place
  ['screens/parent/AttendanceScreen.jsx', 'MonthSummarySkeleton', 'monthPhase', 'loading', '{loading ? (', 'Nothing recorded this month.'],
  ['screens/teacher/AttendanceScreen.jsx', 'RosterSummarySkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', '{counts.marked} of {counts.total} marked'],
  ['screens/teacher/AttendanceScreen.jsx', 'RosterNoteSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', 'ListFooterComponent={footer}'],
  ['screens/teacher/AttendanceScreen.jsx', 'RosterSaveBarSkeleton', 'rosterPhase', 'rosterWaiting', '{rosterWaiting ? (', 'No unsaved changes'],
];
const files = Object.fromEntries([...new Set(WIRING.map((w) => w[0]))].map((f) => [f, src(f)]));
for (const [file, shape, phase, guard, guardText, content] of WIRING) {
  const tag = `<${shape} phase={${phase}}`;
  const wired = (t) => {
    const at = t.indexOf(tag);
    const guardAt = at > 0 ? t.lastIndexOf(guardText, at) : -1;
    return (
      /from '(\.\.\/)+components\/SkeletonShapes'/.test(t) &&
      /import [^;]*useSkeleton[^;]*from '(\.\.\/)+hooks\/useSkeleton'/.test(t) &&
      !t.includes('LoadingSpinner') &&
      t.includes(`const ${phase} = useSkeleton(${guard});`) &&
      guardAt >= 0 &&
      at - guardAt < 400 &&
      t.indexOf(content, at) > at
    );
  };
  proved(
    `${file.replace('screens/', '')} → ${shape} on \`${guard}\`, then the content`,
    wired,
    files[file],
    files[file].replace(tag, '<LoadingSpinner'),
    files[file].replace(`useSkeleton(${guard});`, 'useSkeleton(false);')
  );
}
assert(WIRING.length === 20, 'sixteen spinners replaced on thirteen screens, plus the fix round\'s four shapes');

// No tier-2 spinner is left: only the five the plan keeps.
const KEPT = ['navigation/RootNavigator.jsx', 'screens/parent/NewMessageScreen.jsx', 'screens/teacher/AnnouncementComposeScreen.jsx', 'screens/teacher/EventComposeScreen.jsx', 'screens/teacher/NewMessageScreen.jsx'];
const spinnerFiles = (extra) =>
  [...['navigation', 'screens'].flatMap((dir) =>
    fs.readdirSync(path.join(SRC, dir), { recursive: true })
      .map((f) => `${dir}/${String(f).split(path.sep).join('/')}`)
      .filter((f) => /\.jsx?$/.test(f) && src(f).includes('<LoadingSpinner'))
  ), ...extra].sort();
proved('the spinners left are the five out of scope (the root, the two compose targets, the two pickers)', (list) => same(list, [...KEPT].sort()), spinnerFiles([]), spinnerFiles(['screens/AboutScreen.jsx']));

// ---------------------------------------------------------------------------
// Re-reads keep what is on screen (§5): the slot pull (Q3), Attendance's Save (Q4)
const slot = src('screens/teacher/SlotScreen.jsx');
proved(
  'Slot screen: a pull keeps the column, touches blocked while it reads — no spinner, no skeleton (Q3)',
  (t) => t.includes("<View pointerEvents={refreshing ? 'none' : 'auto'} className=\"gap-4\">") && !t.includes('{refreshing ? ('),
  slot,
  slot.replace("<View pointerEvents={refreshing ? 'none' : 'auto'} className=\"gap-4\">", '{refreshing ? (')
);
const attendance = files['screens/teacher/AttendanceScreen.jsx'];
proved(
  'teacher Attendance: the cards take no touches while a pull OR a save and its re-read are in flight (Q4)',
  (t) => t.includes("pointerEvents={refreshing || saving ? 'none' : 'auto'}"),
  attendance,
  attendance.replace("pointerEvents={refreshing || saving ? 'none' : 'auto'}", "pointerEvents={refreshing ? 'none' : 'auto'}")
);

// T2: the roster's waiting rule, as source and DRIVEN through the mirrored hook.
const RULE = 'const rosterWaiting = !rosterCurrent || (rosterLoading && roster.length === 0);';
proved(
  'T2 — the roster waits on its own key: useQueryRows on [sectionId, date] and the web\'s rule',
  (t) => t.includes('useQueryRows(roster, rosterLoading, [sectionId, date])') && t.includes(RULE),
  attendance,
  attendance.replace(RULE, 'const rosterWaiting = rosterLoading && !roster.length;')
);
function drive(rule) {
  const first = [{ id: 1 }, { id: 2 }];
  const next = [{ id: 3 }];
  const steps = [[[], true, 'day 1'], [first, false, 'day 1'], [first, false, 'day 2'], [first, true, 'day 2'], [next, false, 'day 2'], [next, true, 'day 2'], [next, false, 'day 2']];
  let seen = null;
  return steps.map(([rows, loading, key]) => {
    const queryKey = JSON.stringify([key]);
    seen = nextRowsQuery(seen, { rows, loading, queryKey });
    return rule(rowsAreCurrent(seen, queryKey), loading, rows.length);
  });
}
proved(
  'T2 — driven: the first load, a date change BEFORE its read starts and while it reads wait; the register and Save\'s re-read never do',
  (rule) => same(drive(rule), [true, false, true, true, false, false, false]),
  (current, loading, length) => !current || (loading && length === 0),
  (current, loading, length) => loading && length === 0,
  (current, loading) => loading
);

// Whose data is on screen — the screens' own expressions, run on fixtures.
const exprOf = (text, name) => {
  const start = text.indexOf(`const ${name} = Boolean(`) + `const ${name} = Boolean(`.length;
  return text.slice(start, text.indexOf(';\n', start)).replace(/\)\s*$/, '');
};
const grades = files['screens/teacher/GradesScreen.jsx'];
const KEY = { subject_id: 7, grade_level: 6, section: 'Fixture', term: 2, school_year: '2026-2027' };
const RECORD = { subject: { id: 7 }, grade_level: 6, section: 'Fixture', term: 2, school_year: '2026-2027' };
proved(
  'teacher Grades — the record is this pick\'s only for the same subject, class, term and year (Q2)',
  (t) => {
    const isPick = new Function('server', 'classKey', `return Boolean(${exprOf(t, 'recordIsPick')});`);
    return isPick(RECORD, KEY) && !isPick(RECORD, { ...KEY, term: 3 }) && !isPick(RECORD, { ...KEY, subject_id: 8 }) && !isPick(RECORD, { ...KEY, section: 'Other' }) && !isPick(null, KEY);
  },
  grades,
  grades.replace('      Number(server.term) === Number(classKey.term) &&\n', '')
);
const summary = files['screens/teacher/ClassSummaryScreen.jsx'];
const SHEET = { section: { grade_level: 6, name: 'Fixture' }, term: 2 };
const PICK = { grade_level: 6, name: 'Fixture' };
proved(
  'Class summary — the sheet is this pick\'s only for the same class and term, Final included (Q2)',
  (t) => {
    const isPick = new Function('data', 'selected', 'term', `return Boolean(${exprOf(t, 'sheetIsPick')});`);
    return isPick(SHEET, PICK, 2) && !isPick(SHEET, PICK, 3) && isPick({ ...SHEET, term: 'final' }, PICK, 'final') && !isPick(SHEET, { ...PICK, name: 'Other' }, 2) && !isPick(null, PICK, 2);
  },
  summary,
  summary.replace("      String(data.term) === String(term)\n", '      true\n')
);
const admin = files['screens/admin/GradesScreen.jsx'];
proved(
  'admin Grades — the card is this pick\'s only for the same learner (Q2)',
  (t) => {
    const isPick = new Function('report', 'studentId', `return Boolean(${exprOf(t, 'reportIsPick')});`);
    return isPick({ student: { id: 5 } }, 5) && !isPick({ student: { id: 5 } }, 6) && !isPick(null, 5);
  },
  admin,
  admin.replace('Number(report.student?.id) === Number(studentId)', 'true')
);

// ---------------------------------------------------------------------------
// LATEST REPLY WINS (P2 and Q2): five loads take a ticket before they ask and
// apply their reply and failure only while newest.
const TICKETED = [
  ['screens/parent/AttendanceScreen.jsx', 'const load = useCallback(', '[studentId, view, tickets]', 'tickets', 'setSummary(nextSummary);'],
  ['screens/teacher/AttendanceScreen.jsx', 'const loadRoster = useCallback(', '[section, date, rosterTickets]', 'rosterTickets', 'setRoster(students);'],
  ['screens/teacher/ClassSummaryScreen.jsx', 'const load = useCallback(', '[selected, term, tickets]', 'tickets', 'setData(next);'],
  ['screens/teacher/classRecord/useSlotRecord.js', 'const load = useCallback(', '[key, keyReady, loadTickets]', 'loadTickets', 'setServer(data);'],
  ['screens/admin/GradesScreen.jsx', 'const loadReport = useCallback(', '[studentId, reportTickets]', 'reportTickets', 'setReport(next);'],
];
for (const [file, start, end, v, setter] of TICKETED) {
  const text = src(file);
  const ok = (t) => {
    const s = t.indexOf(start);
    const body = s >= 0 ? t.slice(s, t.indexOf(end, s)) : '';
    const take = body.indexOf(`const ticket = ${v}.take();`);
    const asks = body.indexOf('await ');
    const guard = body.indexOf(`if (!${v}.isLatest(ticket)) return;`);
    return (
      /import \{ createTickets \} from '(\.\.\/)+api\/tickets'/.test(t) &&
      take > 0 && take < asks && guard > asks && guard < body.indexOf(setter) &&
      body.split(`if (!${v}.isLatest(ticket)) return;`).length - 1 === 2
    );
  };
  proved(
    `${file.replace('screens/', '')} — the load takes a ticket before it asks; its reply and failure apply only while newest`,
    ok,
    text,
    text.replace(`if (!${v}.isLatest(ticket)) return;`, ''),
    text.replace(`const ticket = ${v}.take();`, 'const ticket = 0;')
  );
}

// The thread keeps M27: the positioning guard, and the skeleton in the spinner's return.
const thread = files['screens/parent/MessageThreadScreen.jsx'];
const GUARD = 'if (loading || loadedForRef.current !== otherId || !scrollRef.current) return;';
proved(
  'the thread\'s positioning still waits for the list (M27), and the skeleton takes the spinner\'s early return',
  (t) => t.includes(GUARD) && t.indexOf('const phase = useSkeleton(loading);') < t.indexOf('if (loading) return <ThreadSkeleton phase={phase} />;'),
  thread,
  thread.replace(GUARD, 'if (!scrollRef.current) return;')
);

// P2, driven: October asked first and answering last, September second and first.
async function race(guarded) {
  const tickets = createTickets();
  const state = { month: null };
  const load = async (month, delay) => {
    const ticket = tickets.take();
    const reply = await new Promise((resolve) => setTimeout(() => resolve(month), delay));
    if (guarded && !tickets.isLatest(ticket)) return;
    state.month = reply;
  };
  await Promise.all([load('October', 40), load('September', 10)]);
  return state.month;
}
const [withTicket, without] = await Promise.all([race(true), race(false)]);
assert(withTicket === 'September' && without === 'October', 'two loads answering out of order: the newer stays (control: without the ticket the older lands last)');

console.log(`proof-skeletons-tier2: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
