// UI-C2 render proof.
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-ui-c2.jsx --outDir
// .ssr-tmp && node .ssr-tmp/ssr-ui-c2.js`. No NODE_ENV needed — nothing here
// is behind `import.meta.env.DEV` (§17f is `ssr-cards.jsx`'s problem).
//
// No readFileSync, no regex over source. The audience label goes through the
// REAL card modules and the real `DataTable`, and the report card is rendered
// twice with different data rather than inspected.
//
// H (the Remarks hint) is NOT here and that is deliberate: it lives inside a
// Modal driven by `decision`, which is set by clicking one of two buttons,
// and `renderToStaticMarkup` cannot click. Extracting a whole review form to
// assert one ternary would be more moving parts than the change. Darryl's
// browser check covers it — stated so a green run is not read as covering it.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import { staffAudienceLabel } from '../src/format/audience.js';
import teacherAnnouncementCard from '../src/pages/teacher/announcements/card.jsx';
import teacherEventCard from '../src/pages/teacher/events/card.jsx';
import ReportCard from '../src/pages/parent/ReportCard.jsx';

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
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const cards = (cardFn, rows) => {
  const html = render(
    <DataTable columns={[{ key: 'id', header: 'Id' }]} rows={rows} keyField="id" renderCard={cardFn} />
  );
  const i = html.indexOf('sm:hidden');
  const j = html.indexOf('hidden sm:block');
  return i === -1 ? '' : html.slice(i, j === -1 ? undefined : j);
};

console.log('UI-C2 — one audience wording, one page heading, honest copy:\n');

// ------------------------------------------------- B. the audience label
console.log('B. the staff audience label:');

const SCHOOL = { id: 1, target_grade: null, target_section: null };
const WHOLE = { id: 2, target_grade: 6, target_section: null };
const CLASS = { id: 3, target_grade: 6, target_section: 'Malikhain' };

assert(staffAudienceLabel(SCHOOL) === 'School-wide', 'school-wide');
assert(staffAudienceLabel(WHOLE) === 'Grade 6 (whole grade)', 'a whole grade');
assert(staffAudienceLabel(CLASS) === 'Grade 6 - Malikhain', 'one class');
assert(
  staffAudienceLabel({ target_grade: undefined }) === 'School-wide',
  'undefined is treated as school-wide, not "Grade undefined"'
);

// THE SECTION MUST SURVIVE ON BOTH CARDS. The events card used to drop it,
// so a whole-grade event and a single-class one read identically.
const annHtml = cards(
  (row) => teacherAnnouncementCard(row, { actions: null }),
  [
    { ...SCHOOL, title: 'A', content: 'x', created_at: '2026-09-24T01:00:00Z' },
    { ...WHOLE, title: 'B', content: 'x', created_at: '2026-09-24T01:00:00Z' },
    { ...CLASS, title: 'C', content: 'x', created_at: '2026-09-24T01:00:00Z' },
  ]
);
const evtHtml = cards(
  (row) => teacherEventCard(row, { actions: null }),
  [
    { ...SCHOOL, title: 'A', event_date: '2026-09-28' },
    { ...WHOLE, title: 'B', event_date: '2026-09-28' },
    { ...CLASS, title: 'C', event_date: '2026-09-28' },
  ]
);

for (const [name, html] of [['announcement', annHtml], ['event', evtHtml]]) {
  assert(html.includes('School-wide'), `${name} card: school-wide`);
  assert(html.includes('Grade 6 (whole grade)'), `${name} card: whole grade`);
  assert(html.includes('Grade 6 - Malikhain'), `${name} card: THE SECTION IS THERE`);
  assert(!html.includes('Everyone at the school'), `${name} card: no admin-only wording`);
  assert(!html.includes('All of Grade 6'), `${name} card: nor the other admin wording`);
}

// NEGATIVE CONTROL: the old events card printed `Grade 6` for BOTH the whole
// grade and the one class. Prove the two are now distinguishable.
const whole = teacherEventCard(WHOLE, { actions: null }).meta;
const oneClass = teacherEventCard(CLASS, { actions: null }).meta;
assert(whole !== oneClass, 'NEGATIVE CONTROL: whole-grade and one-class events no longer read alike', whole);

// The announcement card keeps its date UNCHANGED — UI-C1 owns formatting,
// and half a conversion is worse than none.
assert(
  annHtml.includes('2026-09-24') && !annHtml.includes('T01:00:00'),
  'the announcement card still slices the date, exactly as before'
);

// ------------------------------------------------- G. the report card copy
console.log('\nG. the transmutation sentence:');

const SENTENCE = 'transmutation table';
const numericalReport = (termGrade) => ({
  student: { first_name: 'Marwin', last_name: 'Conde', grade_level: 6, section: 'Malikhain' },
  school_year: '2026-2027',
  grading_mode: 'numerical',
  subjects: [
    {
      subject_id: 1,
      subject_name: 'English',
      terms: { 1: termGrade === null ? null : { grade_id: 9, term_grade: termGrade }, 2: null, 3: null },
      final_grade: null,
    },
  ],
  term_averages: { 1: null, 2: null, 3: null },
  general_average: null,
  general_average_descriptor: null,
});

const empty = render(<ReportCard report={numericalReport(null)} schoolName="X" adviser="Y" />);
const withGrade = render(<ReportCard report={numericalReport(88)} schoolName="X" adviser="Y" />);

assert(!empty.includes(SENTENCE), 'NOT shown when no term grade exists — nothing to be unlike');
assert(withGrade.includes(SENTENCE), 'shown once a term grade exists');
assert(
  empty.includes('A term shows &quot;Pending&quot;') || empty.includes('A term shows "Pending"'),
  'the other lines still render on an empty card — only ONE line is gated'
);
assert(
  empty.includes('The final grade for a learning area appears once all three terms are recorded.'),
  'and so does the final-grade line'
);

// A grade ROW with no grade must NOT count — that is the seeded legacy case
// and the class-record shell row.
const shellOnly = render(
  <ReportCard
    report={{
      ...numericalReport(null),
      subjects: [
        {
          subject_id: 1,
          subject_name: 'English',
          terms: { 1: { grade_id: 9, term_grade: null }, 2: null, 3: null },
          final_grade: null,
        },
      ],
    }}
    schoolName="X"
    adviser="Y"
  />
);
assert(
  !shellOnly.includes(SENTENCE),
  'a grade ROW with a null term_grade does not count — shells and legacy rows render Pending'
);

// Descriptive cards never had the sentence and still do not.
const descriptive = render(
  <ReportCard
    report={{ ...numericalReport(null), grading_mode: 'descriptive' }}
    schoolName="X"
    adviser="Y"
  />
);
assert(!descriptive.includes(SENTENCE), 'Key Stage 1 never sees it — it does not transmute');
assert(
  descriptive.includes('There is no general average for this grade level.'),
  'and its own lines are untouched'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
