// PROOF — grade acknowledgements on the web (feat/grade-acknowledgement,
// 2026-10-21; the owner's Q1–Q12). Run from client/:
//   npx vite build --ssr scripts/ssr-grade-acknowledgement.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-grade-acknowledgement.js
//
// What it proves, each check with a NEGATIVE CONTROL that must fail:
//   - the shared words (format/acknowledgement.js) EXACTLY as the plan
//     approved them: the card's title, body and button, the §5e dialog, the
//     "You confirmed …" line, the reader's lines, the column's three cells,
//     the admin's line and the unlock sentence;
//   - `TermConfirmations` RENDERED: a parent's locked-and-unconfirmed term
//     (the ask and the button), a confirmed one (the line, no button), a
//     reader's (no button, the parent's state), and NOTHING for an unlocked
//     term; the whole `ReportCard` with the block between the info row and
//     the table, and no `initial_grade` leaking through it;
//   - `ClassSummaryTable` RENDERED with the Confirmed column on a term sheet
//     — the header count, a date, "Not yet", the dash with its name — and
//     NO such column on the Final sheet;
//   - the unwrap lists name the new keys (the parent page, the adviser's
//     learner page, admin Grades, LOCKS_UNWRAP) and the server sends them;
//   - the parent page's wiring as SOURCE: the dialog from `confirmDialog`,
//     the write only in `confirmNow`, the failure slot inside the dialog, the
//     card re-read after a success; admin Grades' lines and sentence;
//   - the server as SOURCE: the route parent-only, the two notification
//     types composed and bell-only, the adviser's visibility clause, the
//     parent's self-heal, the ENUM in schema.sql.
// Cannot prove a real confirm, the dialog's focus, the bell — the owner's
// device check (docs/GRADE_ACKNOWLEDGEMENT_DEVICE_CHECK.md).

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIRM_BUTTON,
  CONFIRMED_HEADER,
  NOT_LOCKED_LABEL,
  TERM_FINAL_BODY,
  adminConfirmedLine,
  confirmDialog,
  confirmedCell,
  confirmedCount,
  confirmedCountLine,
  confirmedLine,
  confirmedReaderLine,
  lockedTerms,
  termFinalTitle,
  unlockClearsSentence,
} from '../src/format/acknowledgement';
import { LOCKS_UNWRAP } from '../src/format/gradeLocks';
import ReportCard, { TermConfirmations } from '../src/pages/parent/ReportCard';
import { ClassSummaryTable } from '../src/pages/teacher/ClassSummaryPage';

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
  assert(ok && bad.length === 0, label, ok ? `${bad.length} control(s) passed` : 'fails on the real input');
}

const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8').replace(/\r\n/g, '\n');
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

// An instant that is the 20th in UTC and the 21st in Manila (UTC+8).
const AT = '2026-10-20T17:30:00.000Z';
const WHEN = '21 October 2026';

console.log('\n--- the words, exactly ---');
assert(termFinalTitle(1) === 'Term 1 grades are final.', 'the title');
assert(TERM_FINAL_BODY === 'The school has locked them. Please confirm that you have seen them.', 'the body');
assert(CONFIRM_BUTTON === 'I have seen these grades', 'the button');
assert(
  JSON.stringify(confirmDialog(2)) ===
    JSON.stringify({
      title: 'Confirm Term 2 grades?',
      body: "This tells the adviser and the school that you have seen your child's Term 2 grades. It cannot be undone.",
      cancel: 'Go back',
      confirm: 'Yes, I have seen them',
    }),
  'the §5e dialog names the term back'
);
assert(confirmedLine(1, WHEN) === 'You confirmed Term 1 on 21 October 2026.', 'the line after');
assert(
  confirmedReaderLine(WHEN) === 'Confirmed by the parent on 21 October 2026.' && confirmedReaderLine(null) === 'The parent has not confirmed yet.',
  "the reader's two lines"
);
assert(CONFIRMED_HEADER === 'Confirmed' && confirmedCountLine(3, 25) === '3 of 25 learners' && confirmedCountLine(1, 1) === '1 of 1 learner', 'the column header and its count');
assert(
  JSON.stringify(confirmedCell({ term_locked: true, acknowledged: { acknowledged_at: AT } }, '21 Oct 2026')) === JSON.stringify({ kind: 'date', text: '21 Oct 2026' }) &&
    JSON.stringify(confirmedCell({ term_locked: true, acknowledged: null }, null)) === JSON.stringify({ kind: 'pending', text: 'Not yet' }) &&
    JSON.stringify(confirmedCell({ term_locked: false, acknowledged: null }, null)) === JSON.stringify({ kind: 'none', text: '—' }),
  'the three cells: the date, "Not yet", the dash'
);
assert(adminConfirmedLine(3, WHEN) === 'Term 3 · Confirmed 21 October 2026', "the admin's line");
assert(
  unlockClearsSentence(WHEN) ===
    'The parent confirmed these grades on 21 October 2026. Unlocking clears that confirmation, and the parent is asked again after a relock.',
  'the unlock sentence'
);
assert(
  JSON.stringify(lockedTerms({ 1: { locked: true }, 2: { locked: false }, 3: { locked: true } })) === '[1,3]' && lockedTerms(undefined).length === 0,
  'lockedTerms: the locked ones in order, none for a missing payload'
);
assert(confirmedCount([{ acknowledged: { acknowledged_at: AT } }, { acknowledged: null }, {}]) === 1, 'confirmedCount');

console.log('\n--- the block, rendered ---');
const acks = (over) => ({
  1: { locked: false, acknowledged_at: null, by_name: null },
  2: { locked: false, acknowledged_at: null, by_name: null },
  3: { locked: false, acknowledged_at: null, by_name: null },
  ...over,
});
const asking = acks({ 1: { locked: true, acknowledged_at: null, by_name: null } });
const confirmed = acks({ 1: { locked: true, acknowledged_at: AT, by_name: 'A Parent' } });
const parentAsk = render(<TermConfirmations acknowledgements={asking} onConfirmTerm={() => {}} confirmingTerm={null} />);
proved(
  "a parent's locked, unconfirmed term: the title, the ask and the button",
  (m) => m.includes('Term 1 grades are final.') && m.includes(TERM_FINAL_BODY) && m.includes(`>${CONFIRM_BUTTON}</button>`) && !m.includes('Term 2 grades'),
  parentAsk,
  render(<TermConfirmations acknowledgements={acks()} onConfirmTerm={() => {}} confirmingTerm={null} />),
  parentAsk.replace(CONFIRM_BUTTON, 'Confirm')
);
const parentDone = render(<TermConfirmations acknowledgements={confirmed} onConfirmTerm={() => {}} confirmingTerm={null} />);
proved(
  'a confirmed term: "You confirmed Term 1 on 21 October 2026." — the MANILA day — and no button',
  (m) => m.includes('You confirmed Term 1 on 21 October 2026.') && !m.includes('<button') && !m.includes('20 October'),
  parentDone,
  parentAsk,
  parentDone.replace('21 October', '20 October')
);
const reader = render(<TermConfirmations acknowledgements={asking} />);
const readerDone = render(<TermConfirmations acknowledgements={confirmed} />);
proved(
  "a reader (no handler): the parent's state, never a button",
  ([a, b]) => a.includes('The parent has not confirmed yet.') && b.includes('Confirmed by the parent on 21 October 2026.') && !a.includes('<button') && !b.includes('<button') && !a.includes('You confirmed'),
  [reader, readerDone],
  [parentAsk, readerDone],
  [reader, parentDone]
);
assert(render(<TermConfirmations acknowledgements={acks()} onConfirmTerm={() => {}} />) === '', 'nothing locked, nothing rendered');
proved(
  'the busy term shows its spinner and the other buttons wait',
  (m) => (m.match(/aria-busy="true"/g) || []).length === 1 && (m.match(/disabled=""/g) || []).length === 2,
  render(<TermConfirmations acknowledgements={acks({ 1: { locked: true }, 2: { locked: true } })} onConfirmTerm={() => {}} confirmingTerm={1} />),
  render(<TermConfirmations acknowledgements={acks({ 1: { locked: true }, 2: { locked: true } })} onConfirmTerm={() => {}} confirmingTerm={null} />)
);

console.log('\n--- the report card, rendered ---');
const subject = (id, name, t1) => ({
  subject_id: id,
  subject_name: name,
  terms: {
    1: t1 ? { grade_id: id * 10, term_grade: t1, descriptive_grade: null, descriptor: { descriptor: 'Benchmarking', remarks: 'Passed' }, is_locked: true, initial_grade: 83.27 } : null,
    2: null,
    3: null,
  },
  final_grade: null,
  final_grade_descriptor: null,
});
const report = {
  student: { id: 7, first_name: 'Tala', last_name: 'Halimbawa', grade_level: 6, section: 'Malikhain' },
  school_year: '2026-2027',
  grading_mode: 'numerical',
  subjects: [subject(1, 'Mathematics', 85), subject(2, 'English', 88)],
  term_averages: { 1: 86.5, 2: null, 3: null },
  term_average_descriptors: { 1: { descriptor: 'Benchmarking' }, 2: null, 3: null },
  general_average: null,
  general_average_descriptor: null,
  acknowledgements: asking,
};
const card = render(<ReportCard report={report} schoolName="A school" adviser="An Adviser" loading={false} error={null} onRetry={() => {}} onConfirmTerm={() => {}} />);
proved(
  'the block sits between the info row and the grades table, with the button',
  (m) => {
    const info = m.indexOf('Adviser');
    const block = m.indexOf('Term 1 grades are final.');
    const table = m.indexOf('Learning area');
    return info > -1 && block > info && table > block && m.includes(CONFIRM_BUTTON);
  },
  card,
  render(<ReportCard report={{ ...report, acknowledgements: acks() }} schoolName="A school" adviser="An Adviser" loading={false} error={null} onRetry={() => {}} onConfirmTerm={() => {}} />)
);
proved(
  "the initial grade behind a locked term never reaches the markup (§5a-v) — the control prints it",
  (m) => !/83\.27|83,27/.test(m),
  card,
  `${card}<p>${report.subjects[0].terms[1].initial_grade}</p>`
);
const readerCard = render(<ReportCard report={{ ...report, acknowledgements: confirmed }} schoolName="A school" adviser="An Adviser" loading={false} error={null} onRetry={() => {}} />);
proved(
  "the adviser's drill-through (no handler) says the parent confirmed, and has no button",
  (m) => m.includes('Confirmed by the parent on 21 October 2026.') && !m.includes(CONFIRM_BUTTON),
  readerCard,
  card
);

console.log('\n--- the class summary, rendered ---');
const sheet = (term, learners) => ({
  section: { grade_level: 6, name: 'Malikhain', adviser_id: 2, adviser_name: 'An Adviser' },
  school_year: '2026-2027',
  term,
  grading_mode: 'numerical',
  show_final: term === 'final',
  show_general_average: true,
  subjects: [{ id: 1, name: 'Mathematics', display_order: 1 }],
  learners,
  completeness: [{ subject_id: 1, recorded: 2, total: 3 }],
});
const learner = (id, last, over) => ({
  student_id: id,
  first_name: 'A',
  last_name: last,
  cells: [{ subject_id: 1, grade_id: id * 10, value: 85, is_locked: true }],
  general_average: 85,
  term_locked: true,
  acknowledged: null,
  ...over,
});
const termSheet = render(
  <ClassSummaryTable
    data={sheet(1, [
      learner(1, 'Seen', { acknowledged: { acknowledged_at: AT, by_name: 'A Parent' } }),
      learner(2, 'Waiting'),
      learner(3, 'Open', { term_locked: false }),
    ])}
  />
);
proved(
  'a term sheet: the Confirmed column — "1 of 3 learners", the date, "Not yet", the named dash',
  (m) =>
    m.includes('Confirmed') &&
    m.includes('1 of 3 learners') &&
    m.includes('21 Oct 2026') &&
    m.includes('Not yet') &&
    m.includes(`aria-label="${NOT_LOCKED_LABEL}">—<`),
  termSheet,
  termSheet.replace('1 of 3 learners', '0 of 3 learners'),
  termSheet.replace(`aria-label="${NOT_LOCKED_LABEL}"`, '')
);
const finalSheet = render(<ClassSummaryTable data={sheet('final', [learner(1, 'Seen', { term_locked: null, acknowledged: null })])} />);
proved('the Final sheet has no Confirmed column', (m) => !m.includes('Confirmed') && !m.includes('Not yet') && m.includes('General Average'), finalSheet, termSheet);
proved("no 'A Parent' name on the sheet — the date is the cell", (m) => !m.includes('A Parent'), termSheet, `${termSheet}A Parent`);

console.log('\n--- the unwrap lists and the server agree ---');
const server = read('../server/routes/grades.js');
const reportHandler = server.slice(server.indexOf("router.get('/student/:studentId'"), server.indexOf("// POST /api/grades — creates a shell row"));
const summaryHandler = server.slice(server.indexOf("router.get('/class-summary'"), server.indexOf('// POST /api/grades/acknowledgements'));
const locksHandler = server.slice(server.indexOf("router.post('/locks'"), server.indexOf('// GET /api/grades/:id'));
const sends = (text) => (key) => new RegExp(`\\b${key}[,:]`).test(text.slice(text.lastIndexOf('return res.json({')));
for (const [file, label] of [
  ['src/pages/parent/GradesPage.jsx', "the parent page's unwrap"],
  ['src/pages/teacher/ClassSummaryLearnerPage.jsx', "the adviser's learner page's unwrap"],
  ['src/pages/admin/GradesPage.jsx', "admin Grades' REPORT_UNWRAP"],
]) {
  const src = read(file);
  proved(`${label} names 'acknowledgements', which the report card sends`, (s) => /'acknowledgements',/.test(s) && sends(reportHandler)('acknowledgements'), src, src.replace("'acknowledgements',", ''));
}
proved(
  'the summary row sends term_locked and acknowledged',
  (h) => /term_locked:/.test(h) && /acknowledged:/.test(h),
  summaryHandler,
  summaryHandler.replace('term_locked:', 'locked:')
);
proved(
  "LOCKS_UNWRAP names 'acknowledgements_cleared' and the locks handler sends every key",
  (h) => LOCKS_UNWRAP.includes('acknowledgements_cleared') && LOCKS_UNWRAP.every(sends(h)),
  locksHandler,
  locksHandler.replace('acknowledgements_cleared:', 'confirmations_cleared:')
);

console.log('\n--- the parent page, as source ---');
const page = read('src/pages/parent/GradesPage.jsx');
proved(
  'the dialog reads confirmDialog (title, body, Go back, Yes, I have seen them) and shows its failure inside (§7c)',
  (s) =>
    s.includes("import { confirmDialog } from '../../format/acknowledgement';") &&
    s.includes('confirmDialog(confirmTerm).title') &&
    s.includes('confirmDialog(confirmTerm).body') &&
    s.includes('confirmDialog(confirmTerm).cancel') &&
    s.includes('confirmDialog(confirmTerm).confirm') &&
    /<Modal[\s\S]*?<FormStatus status=\{confirmStatus\}/.test(s),
  page,
  page.replace('confirmDialog(confirmTerm).confirm', "'Confirm'"),
  page.replace('<FormStatus status={confirmStatus} className="mb-4" />', '')
);
const confirmBody = (s) => {
  const at = s.indexOf('const confirmNow = useCallback(');
  return at < 0 ? '' : s.slice(at, s.indexOf('}, [confirmTerm, confirming, load]);', at));
};
proved(
  "the ONE write is POST /grades/acknowledgements inside confirmNow, unwrap 'acknowledgement', the dialog closed and the card re-read after it",
  (s) =>
    (s.match(/api\.post\('\/grades\/acknowledgements'/g) || []).length === 1 &&
    confirmBody(s).includes("api.post('/grades/acknowledgements', { term: confirmTerm }, { unwrap: 'acknowledgement' })") &&
    /setConfirmTerm\(null\);\s*await load\(\);/.test(confirmBody(s)) &&
    /setConfirmStatus\(fail\(extractError\(err\)\)\)/.test(confirmBody(s)),
  page,
  page.replace("api.post('/grades/acknowledgements', { term: confirmTerm }, { unwrap: 'acknowledgement' })", "api.post('/grades/acknowledgements', { term: confirmTerm }, { raw: true })"),
  page.replace(/setConfirmTerm\(null\);\s*await load\(\);/, 'setConfirmTerm(null);')
);
proved(
  "the card gets the page's handler and the busy term",
  (s) => /<ReportCard[\s\S]*?onConfirmTerm=\{askConfirm\}[\s\S]*?confirmingTerm=\{confirming \? confirmTerm : null\}/.test(s),
  page,
  page.replace('onConfirmTerm={askConfirm}', '')
);
const learnerPage = read('src/pages/teacher/ClassSummaryLearnerPage.jsx');
proved("the adviser's learner page passes NO handler — read-only", (s) => !/onConfirmTerm/.test(s), learnerPage, `${learnerPage}onConfirmTerm`);

console.log('\n--- admin Grades, as source ---');
const admin = read('src/pages/admin/GradesPage.jsx');
proved(
  'the confirmed terms under the header card and the unlock sentence in the lock dialog, both from the shared words',
  (s) =>
    s.includes("import { adminConfirmedLine, lockedTerms, unlockClearsSentence } from '../../format/acknowledgement';") &&
    /confirmedLines\.map\(\(line\) =>/.test(s) &&
    /selectedConfirmedAt \? \([\s\S]*?unlockClearsSentence\(timestampDay\(selectedConfirmedAt, \{ style: 'long' \}\)\)/.test(s),
  admin,
  admin.replace('unlockClearsSentence(timestampDay(selectedConfirmedAt, { style: \'long\' }))', "'Unlocking clears the confirmation.'"),
  admin.replace('confirmedLines.map((line) =>', 'confirmedLines.slice(0, 0).map((line) =>')
);

console.log('\n--- the server, as source ---');
proved(
  'POST /acknowledgements is parent-only and before /locks',
  (s) => {
    const route = s.indexOf("router.post('/acknowledgements', authenticate, authorize('parent')");
    return route > -1 && route < s.indexOf("router.post('/locks'");
  },
  server,
  server.replace("authorize('parent')", "authorize('parent', 'teacher')")
);
const notifications = read('../server/routes/notifications.js');
proved(
  'the two types are composed with the approved words, bell-only under grades',
  (s) =>
    s.includes("case 'grades_locked':") &&
    s.includes('title: `Term ${row.grade_term} grades are final`') &&
    s.includes("body: `Please confirm you have seen your child's Term ${row.grade_term} grades.`") &&
    s.includes("case 'grades_acknowledged':") &&
    s.includes("title: 'Grades confirmed'") &&
    s.includes("'s parent has seen the Term ${row.grade_term} grades.`") &&
    s.includes("link: '/teacher/class-summary'") &&
    s.includes("grades_locked: 'grades',") &&
    s.includes("grades_acknowledged: 'grades',"),
  notifications,
  notifications.replace("grades_locked: 'grades',", "grades_locked: 'announcements',"),
  notifications.replace("title: 'Grades confirmed'", "title: 'Grades acknowledged'")
);
proved(
  "the adviser's visibility clause lists a grade row only for the section's adviser; the parent's self-heals a confirmed ask",
  (s) =>
    /sec5\.adviser_id = n\.user_id/.test(s) &&
    /n\.type <> 'grades_locked' OR NOT EXISTS \(\s*SELECT 1 FROM grade_acknowledgements ga/.test(s),
  notifications,
  notifications.replace("n.type <> 'grades_locked' OR NOT EXISTS (", "n.type <> 'grades_locked' AND NOT EXISTS ("),
  notifications.replace('sec5.adviser_id = n.user_id', 'sec5.adviser_id IS NOT NULL')
);
const schema = read('../database/schema.sql');
proved(
  "schema.sql's notifications.type ends with the two new values and the table exists with its unique key",
  (s) =>
    s.includes("'grade_available','grades_locked','grades_acknowledged') NOT NULL") &&
    s.includes('CREATE TABLE grade_acknowledgements (') &&
    s.includes('UNIQUE KEY uq_grade_ack_term (student_id, school_year, term)'),
  schema,
  schema.replace("'grades_locked','grades_acknowledged'", "'grades_acknowledged','grades_locked'")
);
const migration = read('../server/scripts/migrate-grade-acknowledgements.js');
proved(
  'the migration restates the same list, in order, and never drops',
  (s) =>
    s.includes("'grade_available',\n  'grades_locked',\n  'grades_acknowledged',") &&
    s.includes('CREATE TABLE IF NOT EXISTS grade_acknowledgements') &&
    !/DROP /i.test(s.replace(/^\s*\/\/.*$/gm, '')),
  migration,
  migration.replace('CREATE TABLE IF NOT EXISTS grade_acknowledgements', 'DROP TABLE grade_acknowledgements')
);

console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
